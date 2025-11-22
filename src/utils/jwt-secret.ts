/**
 * JWT secret for signing and validating tokens
 * IMPORTANT: Set MIMIR_JWT_SECRET when MIMIR_ENABLE_SECURITY=true
 * For development with security disabled, a default secret is used
 */
const JWT_SECRET: string = process.env.MIMIR_JWT_SECRET || (() => {
  if (process.env.MIMIR_ENABLE_SECURITY === 'true') {
    throw new Error('MIMIR_JWT_SECRET must be set when MIMIR_ENABLE_SECURITY=true');
  }
  return 'dev-only-secret-not-for-production';
})();

// Log JWT secret status on startup (first 8 chars for verification)
if (process.env.MIMIR_ENABLE_SECURITY === 'true') {
  console.log(`[JWT] JWT_SECRET configured: ${JWT_SECRET.substring(0, 8)}... (${JWT_SECRET.length} chars)`);
}

export { JWT_SECRET };
