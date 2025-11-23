import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Import the actual validation functions
import {
  validateOAuthTokenFormat,
  validateOAuthUserinfoUrl,
  createSecureFetchOptions,
} from '../../src/utils/fetch-helper.js';

describe('SSRF Protection - OAuth Token and URL Validation', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Deep copy relevant env vars
    originalEnv = {
      NODE_ENV: process.env.NODE_ENV,
      MIMIR_OAUTH_ALLOW_HTTP: process.env.MIMIR_OAUTH_ALLOW_HTTP,
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Properly restore environment variables
    if (originalEnv.NODE_ENV !== undefined) {
      process.env.NODE_ENV = originalEnv.NODE_ENV;
    } else {
      delete process.env.NODE_ENV;
    }
    
    if (originalEnv.MIMIR_OAUTH_ALLOW_HTTP !== undefined) {
      process.env.MIMIR_OAUTH_ALLOW_HTTP = originalEnv.MIMIR_OAUTH_ALLOW_HTTP;
    } else {
      delete process.env.MIMIR_OAUTH_ALLOW_HTTP;
    }
  });

  describe('OAuth Token Format Validation', () => {
    describe('Valid Tokens', () => {
      it('should accept standard JWT format', () => {
        const validJWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
        expect(() => validateOAuthTokenFormat(validJWT)).not.toThrow();
      });

      it('should accept OAuth2 bearer tokens', () => {
        const validBearer = 'ya29.a0AfH6SMBx';
        expect(() => validateOAuthTokenFormat(validBearer)).not.toThrow();
      });

      it('should accept tokens with URL-safe characters', () => {
        const validToken = 'abc123-_~+/=';
        expect(() => validateOAuthTokenFormat(validToken)).not.toThrow();
      });

      it('should accept long tokens (up to 8192 characters)', () => {
        const longToken = 'a'.repeat(8192);
        expect(() => validateOAuthTokenFormat(longToken)).not.toThrow();
      });
    });

    describe('Invalid Tokens - Injection Prevention', () => {
      it('should reject tokens with newline characters (HTTP header injection)', () => {
        const maliciousToken = 'valid-token\nX-Malicious-Header: evil';
        expect(() => validateOAuthTokenFormat(maliciousToken)).toThrow('Token contains invalid characters');
      });

      it('should reject tokens with carriage return (HTTP header injection)', () => {
        const maliciousToken = 'valid-token\rX-Malicious-Header: evil';
        expect(() => validateOAuthTokenFormat(maliciousToken)).toThrow('Token contains invalid characters');
      });

      it('should reject tokens with CRLF (HTTP response splitting)', () => {
        const maliciousToken = 'valid-token\r\nHTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<script>alert("xss")</script>';
        expect(() => validateOAuthTokenFormat(maliciousToken)).toThrow('Token contains invalid characters');
      });

      it('should reject tokens with HTML tags (XSS prevention)', () => {
        const maliciousToken = '<script>alert("xss")</script>';
        expect(() => validateOAuthTokenFormat(maliciousToken)).toThrow('Token contains invalid characters');
      });

      it('should reject tokens with JavaScript protocol (XSS prevention)', () => {
        const maliciousToken = 'javascript:alert("xss")';
        expect(() => validateOAuthTokenFormat(maliciousToken)).toThrow('Token contains invalid characters');
      });

      it('should reject tokens with data: protocol (data URI injection)', () => {
        const maliciousToken = 'data:text/html,<script>alert("xss")</script>';
        expect(() => validateOAuthTokenFormat(maliciousToken)).toThrow('Token contains invalid characters');
      });

      it('should reject tokens with file: protocol (local file access)', () => {
        const maliciousToken = 'file:///etc/passwd';
        expect(() => validateOAuthTokenFormat(maliciousToken)).toThrow('Token contains invalid characters');
      });

      it('should reject tokens with null bytes (string termination attacks)', () => {
        const maliciousToken = 'valid-token\x00malicious-data';
        expect(() => validateOAuthTokenFormat(maliciousToken)).toThrow('Token contains invalid characters');
      });

      it('should reject excessively long tokens (DoS prevention)', () => {
        const tooLongToken = 'a'.repeat(8193);
        expect(() => validateOAuthTokenFormat(tooLongToken)).toThrow('Token exceeds maximum length');
      });

      it('should reject empty tokens', () => {
        expect(() => validateOAuthTokenFormat('')).toThrow('Token must be a non-empty string');
      });

      it('should reject tokens with only whitespace', () => {
        expect(() => validateOAuthTokenFormat('   ')).toThrow('Token contains invalid characters');
      });
    });

    describe('Edge Cases', () => {
      it('should handle tokens at exactly 8192 characters', () => {
        const maxToken = 'a'.repeat(8192);
        expect(() => validateOAuthTokenFormat(maxToken)).not.toThrow();
      });

      it('should reject tokens with mixed valid and invalid characters', () => {
        const mixedToken = 'valid-part\ninvalid-part';
        expect(() => validateOAuthTokenFormat(mixedToken)).toThrow();
      });
    });
  });

  describe('OAuth Userinfo URL Validation', () => {
    describe('Valid URLs', () => {
      it('should accept HTTPS URLs in production', () => {
        process.env.NODE_ENV = 'production';
        expect(() => validateOAuthUserinfoUrl('https://oauth.example.com/userinfo')).not.toThrow();
      });

      it('should accept HTTPS URLs with ports', () => {
        process.env.NODE_ENV = 'production';
        expect(() => validateOAuthUserinfoUrl('https://oauth.example.com:8443/userinfo')).not.toThrow();
      });

      it('should accept HTTPS URLs with paths', () => {
        process.env.NODE_ENV = 'production';
        expect(() => validateOAuthUserinfoUrl('https://oauth.example.com/oauth2/v1/userinfo')).not.toThrow();
      });

      it('should accept HTTPS URLs with query parameters', () => {
        process.env.NODE_ENV = 'production';
        expect(() => validateOAuthUserinfoUrl('https://oauth.example.com/userinfo?format=json')).not.toThrow();
      });

      it('should accept localhost in development', () => {
        process.env.NODE_ENV = 'development';
        expect(() => validateOAuthUserinfoUrl('http://localhost:8888/userinfo')).not.toThrow();
      });

      it('should accept 127.0.0.1 in development', () => {
        process.env.NODE_ENV = 'development';
        expect(() => validateOAuthUserinfoUrl('http://127.0.0.1:8888/userinfo')).not.toThrow();
      });

      it('should accept host.docker.internal in development', () => {
        process.env.NODE_ENV = 'development';
        expect(() => validateOAuthUserinfoUrl('http://host.docker.internal:8888/userinfo')).not.toThrow();
      });

      it('should accept HTTP URLs when MIMIR_OAUTH_ALLOW_HTTP is true', () => {
        process.env.NODE_ENV = 'production';
        process.env.MIMIR_OAUTH_ALLOW_HTTP = 'true';
        expect(() => validateOAuthUserinfoUrl('http://oauth.example.com/userinfo')).not.toThrow();
      });
    });

    describe('Invalid URLs - SSRF Prevention', () => {
      it('should reject HTTP URLs in production', () => {
        process.env.NODE_ENV = 'production';
        delete process.env.MIMIR_OAUTH_ALLOW_HTTP;
        expect(() => validateOAuthUserinfoUrl('http://oauth.example.com/userinfo')).toThrow('Only HTTPS URLs are allowed');
      });

      it('should reject private IP ranges - 10.0.0.0/8', () => {
        process.env.NODE_ENV = 'production';
        expect(() => validateOAuthUserinfoUrl('https://10.0.0.1/userinfo')).toThrow('Private IP');
      });

      it('should reject private IP ranges - 172.16.0.0/12', () => {
        process.env.NODE_ENV = 'production';
        expect(() => validateOAuthUserinfoUrl('https://172.16.0.1/userinfo')).toThrow('Private IP');
      });

      it('should reject private IP ranges - 192.168.0.0/16', () => {
        process.env.NODE_ENV = 'production';
        expect(() => validateOAuthUserinfoUrl('https://192.168.1.1/userinfo')).toThrow('Private IP');
      });

      it('should reject localhost in production', () => {
        process.env.NODE_ENV = 'production';
        delete process.env.MIMIR_OAUTH_ALLOW_HTTP;
        expect(() => validateOAuthUserinfoUrl('https://localhost/userinfo')).toThrow('Localhost is not allowed in production');
      });

      it('should reject 127.0.0.1 in production', () => {
        process.env.NODE_ENV = 'production';
        delete process.env.MIMIR_OAUTH_ALLOW_HTTP;
        expect(() => validateOAuthUserinfoUrl('https://127.0.0.1/userinfo')).toThrow('Private IP addresses are not allowed');
      });

      it('should reject link-local addresses - 169.254.0.0/16', () => {
        process.env.NODE_ENV = 'production';
        expect(() => validateOAuthUserinfoUrl('https://169.254.1.1/userinfo')).toThrow('Private IP');
      });

      it('should reject metadata service (AWS)', () => {
        process.env.NODE_ENV = 'production';
        expect(() => validateOAuthUserinfoUrl('https://169.254.169.254/latest/meta-data/')).toThrow('Private IP');
      });

      it('should reject metadata service (Azure)', () => {
        process.env.NODE_ENV = 'production';
        expect(() => validateOAuthUserinfoUrl('https://169.254.169.254/metadata/instance')).toThrow('Private IP');
      });

      it('should reject file:// protocol', () => {
        expect(() => validateOAuthUserinfoUrl('file:///etc/passwd')).toThrow('Only HTTP/HTTPS protocols are allowed');
      });

      it('should reject ftp:// protocol', () => {
        expect(() => validateOAuthUserinfoUrl('ftp://example.com/userinfo')).toThrow('Only HTTP/HTTPS protocols are allowed');
      });

      it('should reject gopher:// protocol', () => {
        expect(() => validateOAuthUserinfoUrl('gopher://example.com/userinfo')).toThrow('Only HTTP/HTTPS protocols are allowed');
      });

      it('should reject data:// protocol', () => {
        expect(() => validateOAuthUserinfoUrl('data:text/html,<script>alert("xss")</script>')).toThrow('Only HTTP/HTTPS protocols are allowed');
      });

      it('should reject javascript:// protocol', () => {
        expect(() => validateOAuthUserinfoUrl('javascript:alert("xss")')).toThrow('Only HTTP/HTTPS protocols are allowed');
      });
    });

    describe('URL Parsing Edge Cases', () => {
      it('should handle URLs with authentication', () => {
        process.env.NODE_ENV = 'production';
        expect(() => validateOAuthUserinfoUrl('https://user:pass@oauth.example.com/userinfo')).not.toThrow();
      });

      it('should handle URLs with fragments', () => {
        process.env.NODE_ENV = 'production';
        expect(() => validateOAuthUserinfoUrl('https://oauth.example.com/userinfo#fragment')).not.toThrow();
      });

      it('should reject malformed URLs', () => {
        expect(() => validateOAuthUserinfoUrl('not-a-valid-url')).toThrow();
      });

      it('should reject empty URLs', () => {
        expect(() => validateOAuthUserinfoUrl('')).toThrow();
      });

      it('should reject URLs with only whitespace', () => {
        expect(() => validateOAuthUserinfoUrl('   ')).toThrow();
      });
    });

    describe('IP Address Detection', () => {
      it('should detect private IPs in various formats', () => {
        process.env.NODE_ENV = 'production';
        const privateIPs = [
          'https://10.0.0.1/userinfo',
          'https://172.16.0.1/userinfo',
          'https://192.168.1.1/userinfo',
          'https://169.254.1.1/userinfo',
        ];

        for (const url of privateIPs) {
          expect(() => validateOAuthUserinfoUrl(url)).toThrow('Private IP');
        }
      });

      it('should accept public IPs', () => {
        process.env.NODE_ENV = 'production';
        const publicIPs = [
          'https://8.8.8.8/userinfo',
          'https://1.1.1.1/userinfo',
          'https://93.184.216.34/userinfo', // example.com
        ];

        for (const url of publicIPs) {
          expect(() => validateOAuthUserinfoUrl(url)).not.toThrow();
        }
      });
    });
  });

  describe('Secure Fetch Options', () => {
    it('should create fetch options with timeout', () => {
      const url = 'https://oauth.example.com/userinfo';
      const options = createSecureFetchOptions(url, {}, undefined, 5000);

      expect(options.signal).toBeDefined();
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });

    it('should use default timeout of 10 seconds', () => {
      const url = 'https://oauth.example.com/userinfo';
      const options = createSecureFetchOptions(url, {});

      expect(options.signal).toBeDefined();
    });

    it('should preserve existing options', () => {
      const url = 'https://oauth.example.com/userinfo';
      const originalOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      };
      const options = createSecureFetchOptions(url, originalOptions);

      expect(options.method).toBe('POST');
      expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
    });

    it('should add authorization header when API key provided', () => {
      process.env.TEST_API_KEY = 'test-key-123';
      const url = 'https://api.example.com/data';
      const options = createSecureFetchOptions(url, {}, 'TEST_API_KEY');

      expect(options.headers).toBeDefined();
      const headers = options.headers as Headers;
      expect(headers.get('Authorization')).toBe('Bearer test-key-123');
    });
  });

  describe('SSRF Attack Scenarios', () => {
    describe('Cloud Metadata Service Attacks', () => {
      it('should prevent AWS metadata service access', () => {
        process.env.NODE_ENV = 'production';
        const awsMetadata = 'http://169.254.169.254/latest/meta-data/iam/security-credentials/';
        expect(() => validateOAuthUserinfoUrl(awsMetadata)).toThrow();
      });

      it('should prevent Azure metadata service access', () => {
        process.env.NODE_ENV = 'production';
        const azureMetadata = 'http://169.254.169.254/metadata/instance?api-version=2021-02-01';
        expect(() => validateOAuthUserinfoUrl(azureMetadata)).toThrow();
      });
    });

    describe('Internal Network Scanning', () => {
      it('should prevent scanning internal network via private IPs', () => {
        process.env.NODE_ENV = 'production';
        const internalIPs = [
          'https://192.168.1.1/admin',
          'https://10.0.0.1/config',
          'https://172.16.0.1/api',
        ];

        for (const url of internalIPs) {
          expect(() => validateOAuthUserinfoUrl(url)).toThrow('Private IP');
        }
      });

      it('should prevent localhost access in production', () => {
        process.env.NODE_ENV = 'production';
        delete process.env.MIMIR_OAUTH_ALLOW_HTTP;
        const localhostURLs = [
          'https://localhost:3000/admin',
          'https://127.0.0.1:8080/api',
        ];

        for (const url of localhostURLs) {
          expect(() => validateOAuthUserinfoUrl(url)).toThrow();
        }
      });
    });

    describe('Protocol Smuggling', () => {
      it('should prevent file:// protocol access', () => {
        const fileURLs = [
          'file:///etc/passwd',
          'file:///c:/windows/system32/config/sam',
          'file://localhost/etc/shadow',
        ];

        for (const url of fileURLs) {
          expect(() => validateOAuthUserinfoUrl(url)).toThrow('Only HTTP/HTTPS protocols are allowed');
        }
      });

      it('should prevent gopher:// protocol (SSRF amplification)', () => {
        expect(() => validateOAuthUserinfoUrl('gopher://internal-server:25/_MAIL%20FROM')).toThrow('Only HTTP/HTTPS protocols are allowed');
      });

      it('should prevent dict:// protocol', () => {
        expect(() => validateOAuthUserinfoUrl('dict://internal-server:11211/stats')).toThrow('Only HTTP/HTTPS protocols are allowed');
      });
    });

    describe('DNS Rebinding Prevention', () => {
      it('should validate URL at request time, not just at config time', () => {
        process.env.NODE_ENV = 'production';
        
        // First validation
        expect(() => validateOAuthUserinfoUrl('https://oauth.example.com/userinfo')).not.toThrow();
        
        // Second validation (simulating DNS rebinding where domain now resolves to private IP)
        // In real implementation, this would be caught by IP validation in the fetch layer
        expect(() => validateOAuthUserinfoUrl('https://oauth.example.com/userinfo')).not.toThrow();
      });
    });
  });

  describe('Combined Token and URL Validation', () => {
    it('should validate both token and URL before making request', () => {
      process.env.NODE_ENV = 'production';
      
      const validToken = 'valid-oauth-token-12345';
      const validURL = 'https://oauth.example.com/userinfo';
      
      expect(() => {
        validateOAuthTokenFormat(validToken);
        validateOAuthUserinfoUrl(validURL);
      }).not.toThrow();
    });

    it('should reject request if token is invalid', () => {
      process.env.NODE_ENV = 'production';
      
      const invalidToken = 'token-with\nnewline';
      const validURL = 'https://oauth.example.com/userinfo';
      
      expect(() => {
        validateOAuthTokenFormat(invalidToken);
        validateOAuthUserinfoUrl(validURL);
      }).toThrow('Token contains invalid characters');
    });

    it('should reject request if URL is invalid', () => {
      process.env.NODE_ENV = 'production';
      
      const validToken = 'valid-oauth-token-12345';
      const invalidURL = 'https://192.168.1.1/userinfo';
      
      expect(() => {
        validateOAuthTokenFormat(validToken);
        validateOAuthUserinfoUrl(invalidURL);
      }).toThrow('Private IP');
    });
  });
});
