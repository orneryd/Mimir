import fs from 'fs';

export interface RBACConfig {
  version: string;
  claimPath: string; // JWT path to roles (e.g., "roles", "groups", "custom.permissions")
  roleMappings: {
    [roleName: string]: {
      description?: string;
      permissions: string[];
    };
  };
  defaultRole?: string;
}

let cachedConfig: RBACConfig | null = null;
let configLoadPromise: Promise<RBACConfig> | null = null;

/**
 * Fetch RBAC config from a remote URI
 */
async function fetchRemoteConfig(uri: string): Promise<RBACConfig> {
  const authHeader = process.env.MIMIR_RBAC_AUTH_HEADER;
  
  const headers: Record<string, string> = {
    'Accept': 'application/json'
  };
  
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }
  
  console.log(`📡 Fetching RBAC config from: ${uri}`);
  
  const response = await fetch(uri, { headers });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  const config = await response.json();
  return config;
}

/**
 * Check if a string is a valid URI
 */
function isUri(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Check if a string looks like inline JSON
 */
function isInlineJson(str: string): boolean {
  return str.trim().startsWith('{') && str.trim().endsWith('}');
}

export function getDefaultConfig(): RBACConfig {
  return {
    version: '1.0',
    claimPath: 'roles',
    roleMappings: {
      admin: {
        description: 'Full system access',
        permissions: ['*']
      },
      developer: {
        description: 'Read/write access for development',
        permissions: [
          'nodes:read',
          'nodes:write',
          'nodes:delete',
          'search:execute',
          'orchestration:read',
          'orchestration:write',
          'orchestration:execute',
          'files:index',
          'files:read',
          'chat:use',
          'mcp:*'
        ]
      },
      viewer: {
        description: 'Read-only access',
        permissions: [
          'nodes:read',
          'search:execute',
          'orchestration:read',
          'files:read'
        ]
      }
    },
    defaultRole: 'viewer'
  };
}

function validateConfig(config: any): void {
  if (!config.version) {
    throw new Error('RBAC config missing "version" field');
  }
  if (!config.claimPath) {
    throw new Error('RBAC config missing "claimPath" field');
  }
  if (!config.roleMappings || typeof config.roleMappings !== 'object') {
    throw new Error('RBAC config missing or invalid "roleMappings" field');
  }
  
  // Validate each role mapping
  for (const [roleName, roleConfig] of Object.entries(config.roleMappings)) {
    if (!roleConfig || typeof roleConfig !== 'object') {
      throw new Error(`Invalid role config for "${roleName}"`);
    }
    const rc = roleConfig as any;
    if (!Array.isArray(rc.permissions)) {
      throw new Error(`Role "${roleName}" missing "permissions" array`);
    }
  }
}

/**
 * Initialize RBAC config (call this at server startup)
 * This allows async loading of remote configs
 */
export async function initRBACConfig(): Promise<RBACConfig> {
  // If already loading, wait for it
  if (configLoadPromise) {
    return configLoadPromise;
  }
  
  // If already loaded, return cached
  if (cachedConfig) {
    return cachedConfig;
  }
  
  // Start loading
  configLoadPromise = (async () => {
    const configSource = process.env.MIMIR_RBAC_CONFIG || './config/rbac.json';
    
    try {
      let config: RBACConfig;
      
      // Case 1: Inline JSON in environment variable
      if (isInlineJson(configSource)) {
        console.log('📝 Loading RBAC config from inline JSON');
        config = JSON.parse(configSource);
        validateConfig(config);
        cachedConfig = config;
        console.log('✅ Loaded RBAC config from inline JSON');
        return config;
      }
      
      // Case 2: Remote URI (HTTP/HTTPS)
      if (isUri(configSource)) {
        config = await fetchRemoteConfig(configSource);
        validateConfig(config);
        cachedConfig = config;
        console.log(`✅ Loaded RBAC config from remote URI: ${configSource}`);
        return config;
      }
      
      // Case 3: Local file path
      if (fs.existsSync(configSource)) {
        const configContent = fs.readFileSync(configSource, 'utf-8');
        config = JSON.parse(configContent);
        validateConfig(config);
        cachedConfig = config;
        console.log(`✅ Loaded RBAC config from file: ${configSource}`);
        return config;
      } else {
        console.warn(`⚠️  RBAC config not found at ${configSource}, using default config`);
      }
    } catch (error: any) {
      console.error(`❌ Error loading RBAC config:`, error.message);
      console.warn('⚠️  Falling back to default RBAC config');
      
      // Reset promise to allow retry
      configLoadPromise = null;
    }
    
    // Return default config
    cachedConfig = getDefaultConfig();
    return cachedConfig;
  })();
  
  return configLoadPromise;
}

/**
 * Get RBAC config synchronously (for use in middleware)
 * Must call initRBACConfig() at server startup first for remote configs
 */
export function getRBACConfig(): RBACConfig {
  // Return cached config if available
  if (cachedConfig) {
    return cachedConfig;
  }

  // If config is still loading, warn and return default
  if (configLoadPromise) {
    console.warn('⚠️  RBAC config still loading, using default config temporarily');
    console.warn('⚠️  Call await initRBACConfig() at server startup before using middleware');
    return getDefaultConfig();
  }

  const configSource = process.env.MIMIR_RBAC_CONFIG || './config/rbac.json';
  
  try {
    let config: RBACConfig;
    
    // Case 1: Inline JSON in environment variable
    if (isInlineJson(configSource)) {
      console.log('📝 Loading RBAC config from inline JSON');
      config = JSON.parse(configSource);
      validateConfig(config);
      cachedConfig = config;
      console.log('✅ Loaded RBAC config from inline JSON');
      return config;
    }
    
    // Case 2: Remote URI (cannot fetch synchronously)
    if (isUri(configSource)) {
      console.warn(`⚠️  Cannot load remote RBAC config synchronously from: ${configSource}`);
      console.warn('⚠️  Call await initRBACConfig() at server startup to load remote configs');
      console.warn('⚠️  Falling back to default RBAC config');
      cachedConfig = getDefaultConfig();
      return cachedConfig;
    }
    
    // Case 3: Local file path
    if (fs.existsSync(configSource)) {
      const configContent = fs.readFileSync(configSource, 'utf-8');
      config = JSON.parse(configContent);
      validateConfig(config);
      cachedConfig = config;
      console.log(`✅ Loaded RBAC config from file: ${configSource}`);
      return config;
    } else {
      console.warn(`⚠️  RBAC config not found at ${configSource}, using default config`);
    }
  } catch (error: any) {
    console.error(`❌ Error loading RBAC config:`, error.message);
    console.warn('⚠️  Falling back to default RBAC config');
  }
  
  // Return default config
  cachedConfig = getDefaultConfig();
  return cachedConfig;
}

// Clear cached config (useful for testing)
export function clearConfigCache(): void {
  cachedConfig = null;
  configLoadPromise = null;
}
