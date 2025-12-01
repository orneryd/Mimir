#!/usr/bin/env node
// Cross-platform build helper: reads package.json version and runs docker-compose with VERSION in env.
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { URL } from 'url';

try {
  const pkgJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  const version = pkgJson.version || '';
  console.log(`Building docker image with VERSION=${version}`);
  console.log(`Image will be tagged as: timothyswt/mimir-server:${version} and timothyswt/mimir-server:latest`);

  const env = { ...process.env, VERSION: version };
  
  // Determine compose file based on architecture
  const arch = process.arch;
  const composeFile = arch === 'arm64' 
    ? 'docker-compose.arm64.nornicdb.yml' 
    : 'docker-compose.yml';
  
  console.log(`Using compose file: ${composeFile}`);

  // Try 'docker compose' first (modern Docker Desktop), then fall back to 'docker-compose'
  // Use --no-cache to ensure fresh build
  let result = spawnSync('docker', ['compose', '-f', composeFile, 'build', '--no-cache', 'mimir-server'], { stdio: 'inherit', env });

  if (result.error && result.error.code === 'ENOENT') {
    console.log('Trying docker-compose (legacy)...');
    result = spawnSync('docker-compose', ['-f', composeFile, 'build', '--no-cache', 'mimir-server'], { stdio: 'inherit', env });
  }

  if (result.error) {
    console.error('Failed to run docker compose:', result.error);
    console.error('\nMake sure Docker Desktop is installed and running.');
    process.exit(result.status || 1);
  }

  process.exit(result.status ?? 0);
} catch (err) {
  console.error('Error preparing docker build:', err);
  process.exit(1);
}
