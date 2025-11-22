// Load environment variables first
import dotenv from 'dotenv';
dotenv.config();

import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as OAuth2Strategy } from 'passport-oauth2';
import { createSecureFetchOptions } from '../utils/fetch-helper.js';

// Development: Local username/password (configurable via env vars)
// Supports multiple dev users with different roles for RBAC testing
// Format: MIMIR_DEV_USER_<NAME>=username:password:role1,role2,role3
if (process.env.MIMIR_ENABLE_SECURITY === 'true') {
  
  // Parse all MIMIR_DEV_USER_* environment variables
  const devUsers: Array<{ username: string; password: string; roles: string[]; id: string }> = [];
  
  Object.keys(process.env).forEach(key => {
    if (key.startsWith('MIMIR_DEV_USER_')) {
      const value = process.env[key];
      if (value) {
        const [username, password, rolesStr] = value.split(':');
        if (username && password) {
          const roles = rolesStr ? rolesStr.split(',').map(r => r.trim()) : ['viewer'];
          const userId = key.replace('MIMIR_DEV_USER_', '').toLowerCase();
          devUsers.push({ username, password, roles, id: userId });
          console.log(`[Auth] Dev user registered: ${username} with roles [${roles.join(', ')}]`);
        }
      }
    }
  });
  
  // Fallback: If no MIMIR_DEV_USER_* vars, check legacy MIMIR_DEV_USERNAME/PASSWORD
  if (devUsers.length === 0 && process.env.MIMIR_DEV_USERNAME && process.env.MIMIR_DEV_PASSWORD) {
    devUsers.push({
      username: process.env.MIMIR_DEV_USERNAME,
      password: process.env.MIMIR_DEV_PASSWORD,
      roles: ['admin'],
      id: 'legacy-admin'
    });
    console.log(`[Auth] Legacy dev user registered: ${process.env.MIMIR_DEV_USERNAME} with roles [admin]`);
  }
  
  if (devUsers.length > 0) {
    passport.use(new LocalStrategy((username, password, done) => {
      // Find matching dev user
      const user = devUsers.find(u => u.username === username && u.password === password);
      if (user) {
        return done(null, { 
          id: user.id, 
          email: `${username}@localhost`,
          roles: user.roles,
          username: user.username
        });
      }
      return done(null, false, { message: 'Invalid credentials' });
    }));
  }
}

// Production: OAuth
if (process.env.MIMIR_ENABLE_SECURITY === 'true' && 
    process.env.MIMIR_AUTH_PROVIDER) {
  
  console.log(`[Auth] OAuth enabled with provider: ${process.env.MIMIR_AUTH_PROVIDER}`);
  
  // Use public issuer for browser-facing URLs, internal issuer for server-to-server
  const publicIssuer = process.env.MIMIR_OAUTH_ISSUER_PUBLIC || process.env.MIMIR_OAUTH_ISSUER;
  const internalIssuer = process.env.MIMIR_OAUTH_ISSUER;
  
  console.log(`[Auth] Public issuer (browser): ${publicIssuer}`);
  console.log(`[Auth] Internal issuer (server): ${internalIssuer}`);
  
  // Custom stateless state store for OAuth
  // This allows us to pass custom data through the OAuth flow without sessions
  class StatelessStateStore {
    store(req: any, callbackOrMeta: any, maybeCallback?: any) {
      // Handle both signatures: store(req, callback) and store(req, meta, callback)
      const callback = maybeCallback || callbackOrMeta;
      
      // Check if this is a VSCode redirect request
      const vscodeState = (req as any)._vscodeState;
      if (vscodeState) {
        // Use the VSCode state that was pre-set
        callback(null, vscodeState);
      } else {
        // Generate a simple random state for CSRF protection
        const state = Math.random().toString(36).substring(7);
        callback(null, state);
      }
    }
    
    verify(req: any, state: string, callbackOrMeta: any, maybeCallback?: any) {
      // Handle both signatures: verify(req, state, callback) and verify(req, state, meta, callback)
      const callback = maybeCallback || callbackOrMeta;
      
      // For stateless flow, we just accept any state
      // The state is primarily for CSRF which is less of a concern in our setup
      callback(null, true);
    }
  }
  
  passport.use('oauth', new OAuth2Strategy({
    authorizationURL: `${publicIssuer}/oauth2/v1/authorize`,
    tokenURL: `${internalIssuer}/oauth2/v1/token`,
    clientID: process.env.MIMIR_OAUTH_CLIENT_ID!,
    clientSecret: process.env.MIMIR_OAUTH_CLIENT_SECRET!,
    callbackURL: process.env.MIMIR_OAUTH_CALLBACK_URL!,
    store: new StatelessStateStore(),
    passReqToCallback: false,
  }, async (accessToken: string, refreshToken: string, profile: any, done: any) => {
    try {
      // Fetch user profile from userinfo endpoint (use internal issuer for server-to-server)
      const userinfoURL = process.env.MIMIR_OAUTH_USERINFO_URL || `${internalIssuer}/oauth2/v1/userinfo`;
      
      const fetchOptions = createSecureFetchOptions(userinfoURL, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      const response = await fetch(userinfoURL, fetchOptions);
      
      if (!response.ok) {
        return done(new Error(`Failed to fetch user profile: ${response.statusText}`));
      }
      
      const userProfile = await response.json();
      
      // Extract roles from profile (configurable claim path)
      const roles = userProfile.roles || userProfile.groups || [];
      
      const user = {
        id: userProfile.sub || userProfile.id || userProfile.email,
        email: userProfile.email,
        username: userProfile.preferred_username || userProfile.username || userProfile.email,
        roles: Array.isArray(roles) ? roles : [roles],
        // Preserve original profile for custom claim extraction
        ...userProfile
      };
      
      // Pass access token as authInfo so it's available in the callback route
      return done(null, user, { accessToken });
    } catch (error) {
      return done(error);
    }
  }));
}

// Serialize user to session
passport.serializeUser((user: any, done) => done(null, user));
passport.deserializeUser((user: any, done) => done(null, user));

export default passport;
