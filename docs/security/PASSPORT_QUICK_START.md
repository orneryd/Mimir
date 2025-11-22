# Passport.js Quick Start Guide

**Version**: 1.0.0  
**Date**: 2025-11-21  
**Purpose**: Get authentication working in 15 minutes

---

## 🎯 Goal

Implement authentication with Passport.js that:
- ✅ Works locally with username/password (development)
- ✅ Works in production with OAuth (Okta/Auth0/Google)
- ✅ Requires minimal configuration
- ✅ Easy to test

---

## ⚡ Quick Start (15 minutes)

### Step 1: Install Dependencies (2 minutes)

```bash
npm install passport passport-local passport-oauth2 express-session connect-redis
```

### Step 2: Create Passport Config (5 minutes)

Create **`src/config/passport.ts`**:

```typescript
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as OAuth2Strategy } from 'passport-oauth2';

// Development: Local username/password
if (process.env.MIMIR_ENABLE_SECURITY === 'true' && 
    process.env.NODE_ENV === 'development') {
  
  passport.use(new LocalStrategy((username, password, done) => {
    // Simple dev credentials (change these!)
    if (username === 'admin' && password === 'admin') {
      return done(null, { 
        id: '1', 
        email: 'admin@localhost', 
        role: 'admin' 
      });
    }
    return done(null, false, { message: 'Invalid credentials' });
  }));
}

// Production: OAuth
if (process.env.MIMIR_ENABLE_SECURITY === 'true' && 
    process.env.MIMIR_AUTH_PROVIDER) {
  
  passport.use('oauth', new OAuth2Strategy({
    authorizationURL: `${process.env.MIMIR_OAUTH_ISSUER}/oauth2/v1/authorize`,
    tokenURL: `${process.env.MIMIR_OAUTH_ISSUER}/oauth2/v1/token`,
    clientID: process.env.MIMIR_OAUTH_CLIENT_ID!,
    clientSecret: process.env.MIMIR_OAUTH_CLIENT_SECRET!,
    callbackURL: process.env.MIMIR_OAUTH_CALLBACK_URL!,
  }, async (accessToken, refreshToken, profile, done) => {
    return done(null, { 
      id: profile.id, 
      email: profile.email,
      role: 'user'
    });
  }));
}

// Serialize user to session
passport.serializeUser((user: any, done) => done(null, user));
passport.deserializeUser((user: any, done) => done(null, user));

export default passport;
```

### Step 3: Add Auth Endpoints (5 minutes)

Create **`src/api/auth-api.ts`**:

```typescript
import { Router } from 'express';
import passport from '../config/passport.js';

const router = Router();

// Development: Login with username/password
router.post('/auth/login', 
  passport.authenticate('local', { 
    successRedirect: '/',
    failureRedirect: '/login',
    failureFlash: false
  })
);

// Production: OAuth login
router.get('/auth/oauth/login', 
  passport.authenticate('oauth')
);

router.get('/auth/oauth/callback', 
  passport.authenticate('oauth', { 
    successRedirect: '/',
    failureRedirect: '/login'
  })
);

// Logout (both dev and prod)
router.post('/auth/logout', (req, res) => {
  req.logout(() => {
    res.json({ success: true });
  });
});

// Check auth status
router.get('/auth/status', (req, res) => {
  res.json({ 
    authenticated: req.isAuthenticated(),
    user: req.user || null
  });
});

export default router;
```

### Step 4: Initialize in HTTP Server (3 minutes)

Modify **`src/http-server.ts`**:

```typescript
import session from 'express-session';
import passport from './config/passport.js';
import authRouter from './api/auth-api.js';

// ... existing code ...

// Add session middleware (only if security enabled)
if (process.env.MIMIR_ENABLE_SECURITY === 'true') {
  app.use(session({
    secret: process.env.MIMIR_JWT_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { 
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));

  app.use(passport.initialize());
  app.use(passport.session());
  
  // Auth routes
  app.use(authRouter);
}

// ... existing routes ...

// Protect API routes (only if security enabled)
if (process.env.MIMIR_ENABLE_SECURITY === 'true') {
  app.use('/api/*', (req, res, next) => {
    // Skip auth check for health endpoint
    if (req.path === '/api/health') return next();
    
    // Check authentication
    if (req.isAuthenticated()) return next();
    
    res.status(401).json({ error: 'Unauthorized' });
  });
}

// ... rest of existing code ...
```

---

## 🧪 Local Testing

### Option 1: Development Mode (Simplest)

**1. Configure `.env`**:
```bash
# Enable security with local auth
MIMIR_ENABLE_SECURITY=true
NODE_ENV=development
MIMIR_JWT_SECRET=dev-secret-change-in-production
```

**2. Start Mimir**:
```bash
npm run build
npm start
```

**3. Test with curl**:
```bash
# Login
curl -X POST http://localhost:9042/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin" \
  -c cookies.txt \
  -L

# Check auth status
curl http://localhost:9042/auth/status \
  -b cookies.txt

# Access protected API
curl http://localhost:9042/api/nodes/query \
  -b cookies.txt

# Logout
curl -X POST http://localhost:9042/auth/logout \
  -b cookies.txt
```

**4. Test with browser**:
1. Create simple login page at `http://localhost:9042/login`
2. Enter username: `admin`, password: `admin`
3. Access `http://localhost:9042/api/nodes/query`
4. Should work!

### Option 2: Test with Google OAuth (5 minutes setup)

**Why Google?** Free, easy setup, no waiting for approval

**1. Get Google OAuth Credentials**:
- Go to https://console.cloud.google.com
- Create new project (or select existing)
- Go to "APIs & Services" → "Credentials"
- Click "Create Credentials" → "OAuth 2.0 Client ID"
- Application type: "Web application"
- Authorized redirect URIs: `http://localhost:9042/auth/oauth/callback`
- Copy Client ID and Client Secret

**2. Configure `.env`**:
```bash
MIMIR_ENABLE_SECURITY=true
NODE_ENV=production

# Google OAuth
MIMIR_AUTH_PROVIDER=google
MIMIR_OAUTH_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
MIMIR_OAUTH_CLIENT_SECRET=your-google-client-secret
MIMIR_OAUTH_CALLBACK_URL=http://localhost:9042/auth/oauth/callback
MIMIR_OAUTH_ISSUER=https://accounts.google.com
MIMIR_OAUTH_USERINFO_URL=https://accounts.google.com/oauth2/v1/userinfo  # Optional

# Session
MIMIR_JWT_SECRET=generate-with-openssl-rand-base64-32
```

**3. Start Mimir**:
```bash
npm run build
npm start
```

**4. Test**:
1. Open browser: `http://localhost:9042/auth/oauth/login`
2. Login with your Google account
3. Redirected back to Mimir (authenticated!)
4. Access APIs: `http://localhost:9042/api/nodes/query`

---

## 🎨 Simple Login UI (Optional)

Create **`frontend/src/components/Login.tsx`**:

```tsx
import { useState } from 'react';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const isDev = import.meta.env.MODE === 'development';
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    
    const response = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData,
      credentials: 'include'
    });
    
    if (response.ok) {
      window.location.href = '/';
    } else {
      alert('Invalid credentials');
    }
  };
  
  if (isDev) {
    // Development: Username/password form
    return (
      <div className="login-container">
        <h2>Login (Development Mode)</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Username (admin)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password (admin)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit">Login</button>
        </form>
      </div>
    );
  }
  
  // Production: OAuth button
  return (
    <div className="login-container">
      <h2>Login</h2>
      <a href="/auth/oauth/login">
        <button>Login with OAuth</button>
      </a>
    </div>
  );
}
```

---

## 📋 Environment Variables Summary

### Development (3 variables)
```bash
MIMIR_ENABLE_SECURITY=true
NODE_ENV=development
MIMIR_JWT_SECRET=dev-secret
```

### Production with OAuth (7 variables)
```bash
MIMIR_ENABLE_SECURITY=true
NODE_ENV=production
MIMIR_AUTH_PROVIDER=google  # or okta, auth0, azure
MIMIR_OAUTH_CLIENT_ID=your-client-id
MIMIR_OAUTH_CLIENT_SECRET=your-client-secret
MIMIR_OAUTH_CALLBACK_URL=https://mimir.yourcompany.com/auth/callback
MIMIR_OAUTH_ISSUER=https://accounts.google.com
MIMIR_JWT_SECRET=your-secure-secret
```

---

## 🔒 Security Notes

### Development
- ⚠️ **Never use dev credentials in production!**
- ⚠️ Change default username/password in `passport.ts`
- ⚠️ Use HTTPS in production (required for OAuth)

### Production
- ✅ Generate secure session secret: `openssl rand -base64 32`
- ✅ Set `cookie.secure: true` (requires HTTPS)
- ✅ Use Redis for session storage (not memory)
- ✅ Set appropriate session timeout
- ✅ Enable CORS properly for your domain

---

## 🐛 Troubleshooting

### Issue: "Unauthorized" even after login

**Solution**: Check cookies are being sent
```bash
# Verify session cookie is set
curl -v http://localhost:9042/auth/login \
  -d "username=admin&password=admin" \
  -c cookies.txt

# Check cookie file
cat cookies.txt
```

### Issue: OAuth redirect fails

**Solution**: Verify callback URL matches exactly
```bash
# In OAuth provider settings
http://localhost:9042/auth/oauth/callback

# In .env
MIMIR_OAUTH_CALLBACK_URL=http://localhost:9042/auth/oauth/callback
```

### Issue: Session not persisting

**Solution**: Check session middleware is before routes
```typescript
// Correct order:
app.use(session({...}));
app.use(passport.initialize());
app.use(passport.session());
app.use(authRouter);  // Then routes
```

---

## ✅ Checklist

- [ ] Install Passport.js dependencies
- [ ] Create `src/config/passport.ts`
- [ ] Create `src/api/auth-api.ts`
- [ ] Modify `src/http-server.ts`
- [ ] Configure `.env` for development
- [ ] Test login with curl
- [ ] Test protected API access
- [ ] (Optional) Set up OAuth provider
- [ ] (Optional) Create login UI
- [ ] Update session secret for production

---

**Total Time**: 15 minutes  
**Lines of Code**: ~150 lines  
**Complexity**: Low  

**Next Steps**: See [AUTHENTICATION_PROVIDER_INTEGRATION.md](./AUTHENTICATION_PROVIDER_INTEGRATION.md) for production OAuth setup.

---

**Document Version**: 1.0.0  
**Last Updated**: 2025-11-21  
**Maintainer**: Security Team  
**Status**: Quick Start Guide


