/**
 * Automated OAuth Flow Test
 * 
 * Tests the complete OAuth 2.0 Authorization Code flow:
 * 1. Authorization request
 * 2. Token exchange
 * 3. Userinfo fetch
 * 
 * Prerequisites:
 * - Local OAuth provider running on port 8888
 * - Mimir server running on port 9042
 * 
 * Run: npx tsx testing/test-oauth-flow.ts
 */

import fetch from 'node-fetch';

const OAUTH_ISSUER = 'http://localhost:8888';
const CLIENT_ID = 'mimir-local-test';
const CLIENT_SECRET = 'local-test-secret-123';
const CALLBACK_URL = 'http://localhost:9042/auth/oauth/callback';

interface TestResult {
  step: string;
  success: boolean;
  error?: string;
  data?: any;
}

async function testOAuthFlow(): Promise<void> {
  const results: TestResult[] = [];

  console.log('🧪 Starting OAuth Flow Test\n');

  // Step 1: Test discovery endpoint
  console.log('1️⃣  Testing discovery endpoint...');
  try {
    const response = await fetch(`${OAUTH_ISSUER}/.well-known/oauth-authorization-server`);
    const discovery = await response.json();
    
    if (discovery.authorization_endpoint && discovery.token_endpoint) {
      results.push({
        step: 'Discovery',
        success: true,
        data: discovery
      });
      console.log('✅ Discovery endpoint working');
    } else {
      throw new Error('Missing required endpoints in discovery');
    }
  } catch (error: any) {
    results.push({
      step: 'Discovery',
      success: false,
      error: error.message
    });
    console.log('❌ Discovery failed:', error.message);
    return;
  }

  // Step 2: Simulate authorization (in real flow, user clicks button)
  console.log('\n2️⃣  Testing authorization endpoint...');
  try {
    const authUrl = new URL(`${OAUTH_ISSUER}/oauth2/v1/authorize`);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', CALLBACK_URL);
    authUrl.searchParams.set('scope', 'openid profile email');
    authUrl.searchParams.set('state', 'test-state-123');

    const response = await fetch(authUrl.toString());
    
    if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
      results.push({
        step: 'Authorization Endpoint',
        success: true,
        data: { url: authUrl.toString() }
      });
      console.log('✅ Authorization endpoint returns consent form');
    } else {
      throw new Error(`Unexpected response: ${response.status}`);
    }
  } catch (error: any) {
    results.push({
      step: 'Authorization Endpoint',
      success: false,
      error: error.message
    });
    console.log('❌ Authorization endpoint failed:', error.message);
    return;
  }

  // Step 3: Simulate user consent and get auth code
  console.log('\n3️⃣  Testing consent submission...');
  try {
    const consentResponse = await fetch(`${OAUTH_ISSUER}/oauth2/v1/authorize/consent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: CALLBACK_URL,
        state: 'test-state-123',
        user_id: 'user-001' // admin user
      }).toString(),
      redirect: 'manual' // Don't follow redirects
    });

    // Should be a 302 redirect with auth code
    if (consentResponse.status === 302 || consentResponse.status === 301) {
      const location = consentResponse.headers.get('location');
      if (!location) {
        throw new Error('No location header in redirect');
      }

      const redirectUrl = new URL(location);
      const code = redirectUrl.searchParams.get('code');
      const state = redirectUrl.searchParams.get('state');

      if (!code) {
        throw new Error('No authorization code in redirect');
      }

      results.push({
        step: 'User Consent',
        success: true,
        data: { code: code.substring(0, 20) + '...', state }
      });
      console.log('✅ Consent generated authorization code');
      console.log(`   Code: ${code.substring(0, 20)}...`);

      // Step 4: Exchange code for token
      console.log('\n4️⃣  Testing token exchange...');
      const tokenResponse = await fetch(`${OAUTH_ISSUER}/oauth2/v1/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: CALLBACK_URL,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET
        }).toString()
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.json();
        throw new Error(`Token exchange failed: ${JSON.stringify(error)}`);
      }

      const tokens = await tokenResponse.json() as any;
      
      if (!tokens.access_token) {
        throw new Error('No access token in response');
      }

      results.push({
        step: 'Token Exchange',
        success: true,
        data: { 
          token: tokens.access_token.substring(0, 20) + '...',
          token_type: tokens.token_type,
          expires_in: tokens.expires_in
        }
      });
      console.log('✅ Token exchange successful');
      console.log(`   Token: ${tokens.access_token.substring(0, 20)}...`);
      console.log(`   Expires in: ${tokens.expires_in}s`);

      // Step 5: Fetch userinfo
      console.log('\n5️⃣  Testing userinfo endpoint...');
      const userinfoResponse = await fetch(`${OAUTH_ISSUER}/oauth2/v1/userinfo`, {
        headers: { 'Authorization': `Bearer ${tokens.access_token}` }
      });

      if (!userinfoResponse.ok) {
        const error = await userinfoResponse.json();
        throw new Error(`Userinfo failed: ${JSON.stringify(error)}`);
      }

      const userinfo = await userinfoResponse.json();
      
      results.push({
        step: 'Userinfo',
        success: true,
        data: userinfo
      });
      console.log('✅ Userinfo retrieved successfully');
      console.log(`   User: ${userinfo.email}`);
      console.log(`   Roles: [${userinfo.roles.join(', ')}]`);

    } else {
      throw new Error(`Expected redirect, got ${consentResponse.status}`);
    }
  } catch (error: any) {
    results.push({
      step: 'Consent/Token Flow',
      success: false,
      error: error.message
    });
    console.log('❌ OAuth flow failed:', error.message);
    return;
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  results.forEach((result, i) => {
    console.log(`${i + 1}. ${result.step}: ${result.success ? '✅ PASS' : '❌ FAIL'}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  console.log('\n' + '='.repeat(60));
  console.log(`Total: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60) + '\n');

  if (failed === 0) {
    console.log('🎉 All tests passed! OAuth flow is working correctly.\n');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Check the errors above.\n');
    process.exit(1);
  }
}

// Run tests
testOAuthFlow().catch(error => {
  console.error('💥 Test runner error:', error);
  process.exit(1);
});
