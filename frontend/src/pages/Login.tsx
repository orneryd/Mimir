import { useState, FormEvent, useEffect, useId } from 'react';
import { EyeOfMimirLogo } from '../components/EyeOfMimirLogo';

interface AuthConfig {
  devLoginEnabled: boolean;
  oauthProviders: Array<{
    name: string;
    url: string;
    displayName: string;
  }>;
}

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const usernameId = useId();
  const passwordId = useId();

  useEffect(() => {
    // Check if already authenticated by testing auth status
    fetch('/auth/status', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.authenticated) {
          // Already logged in, redirect to home
          console.log('[Login] Already authenticated, redirecting to home');
          window.location.href = '/';
          return;
        }
        
        // Not authenticated, fetch auth configuration
        return fetch('/auth/config', { credentials: 'include' })
          .then(res => res.json())
          .then(config => setAuthConfig(config));
      })
      .catch(() => {
        // Default to OAuth if config fetch fails
        setAuthConfig({
          devLoginEnabled: false,
          oauthProviders: [{ name: 'oauth', url: '/auth/oauth/login', displayName: 'OAuth 2.0' }]
        });
      });
  }, []);

  const handleDevLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      const response = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        credentials: 'include', // Receive HTTP-only cookie
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // API key is set in HTTP-only cookie by server
          // Redirect to home
          window.location.href = '/';
        } else {
          setError('Login failed');
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Invalid credentials' }));
        setError(errorData.error || 'Invalid username or password');
      }
    } catch (err) {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!authConfig) {
    // Loading state
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (authConfig.devLoginEnabled) {
    // Development Mode: Username/Password Form
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="max-w-md w-full space-y-8 p-10 bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-2xl border border-purple-500/20">
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <EyeOfMimirLogo className="h-20 w-20" />
            </div>
            <h2 className="text-3xl font-bold text-white">Mimir</h2>
            <p className="mt-2 text-sm text-purple-300">Development Mode</p>
          </div>

          <form onSubmit={handleDevLogin} className="mt-8 space-y-6">
            <div className="space-y-4">
              <div>
                <label htmlFor={usernameId} className="block text-sm font-medium text-gray-300 mb-2">
                  Username
                </label>
                <input
                  id={usernameId}
                  name="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="appearance-none relative block w-full px-3 py-2 border border-purple-500/30 placeholder-gray-500 text-white bg-slate-900/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="username"
                />
              </div>

              <div>
                <label htmlFor={passwordId} className="block text-sm font-medium text-gray-300 mb-2">
                  Password
                </label>
                <input
                  id={passwordId}
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none relative block w-full px-3 py-2 border border-purple-500/30 placeholder-gray-500 text-white bg-slate-900/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="password"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Logging in...' : 'Sign in'}
              </button>
            </div>

            <div className="text-center">
              <p className="text-xs text-gray-400">
                Development Mode - Credentials configured via environment variables
              </p>
              <p className="text-xs text-gray-500 mt-1">
                See security documentation for setup
              </p>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Production Mode: OAuth Buttons (support multiple providers)
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="max-w-md w-full space-y-8 p-10 bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-2xl border border-purple-500/20">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <EyeOfMimirLogo className="h-20 w-20" />
          </div>
          <h2 className="text-3xl font-bold text-white">Mimir</h2>
          <p className="mt-2 text-sm text-purple-300">Graph-RAG Memory System</p>
        </div>

        <div className="mt-8 space-y-4">
          {authConfig.oauthProviders.length > 0 ? (
            authConfig.oauthProviders.map((provider) => (
              <a
                key={provider.name}
                href={provider.url}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors"
              >
                <svg
                  className="w-5 h-5 mr-2"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <title>Sign in with {provider.displayName}</title>
                  <path
                    fillRule="evenodd"
                    d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                    clipRule="evenodd"
                  />
                </svg>
                Sign in with {provider.displayName}
              </a>
            ))
          ) : (
            <div className="text-center text-gray-400">
              <p className="text-sm">No authentication providers configured</p>
              <p className="text-xs mt-2">Contact your administrator</p>
            </div>
          )}

          {authConfig.oauthProviders.length > 0 && (
            <div className="mt-6 text-center">
              <p className="text-xs text-gray-400">
                Enterprise Single Sign-On
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


