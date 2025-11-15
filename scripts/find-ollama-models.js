#!/usr/bin/env node
/**
 * Find Ollama models in local storage and show llama.cpp compatible paths
 */
import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const OLLAMA_MODELS_PATH = './ollama_models/models';
const MANIFESTS_PATH = join(OLLAMA_MODELS_PATH, 'manifests/registry.ollama.ai/library');
const BLOBS_PATH = join(OLLAMA_MODELS_PATH, 'blobs');

async function findModels() {
  try {
    // Check if ollama_models directory exists
    if (!existsSync(OLLAMA_MODELS_PATH)) {
      console.log('❌ Ollama models directory not found at:', OLLAMA_MODELS_PATH);
      console.log('💡 Make sure Ollama has downloaded models');
      return;
    }

    // Check for manifests directory
    if (!existsSync(MANIFESTS_PATH)) {
      console.log('❌ Manifests directory not found at:', MANIFESTS_PATH);
      console.log('💡 Ollama may not have any models downloaded yet');
      return;
    }

    const modelDirs = await readdir(MANIFESTS_PATH);
    
    if (modelDirs.length === 0) {
      console.log('📦 No Ollama models found');
      console.log('💡 Download a model with: docker exec ollama_server ollama pull nomic-embed-text');
      return;
    }

    console.log('📦 Found Ollama Models:\n');
    
    for (const modelName of modelDirs) {
      const modelPath = join(MANIFESTS_PATH, modelName);
      const versions = await readdir(modelPath);
      
      for (const version of versions) {
        try {
          const manifestPath = join(modelPath, version);
          const manifestContent = await readFile(manifestPath, 'utf8');
          const manifest = JSON.parse(manifestContent);
          
          // Find the model blob (GGUF file)
          const modelLayer = manifest.layers?.find(l => 
            l.mediaType === 'application/vnd.ollama.image.model'
          );
          
          if (modelLayer) {
            const blobHash = modelLayer.digest.replace('sha256:', '');
            const blobPath = `/models/blobs/sha256-${blobHash}`;
            const localBlobPath = join(OLLAMA_MODELS_PATH, 'blobs', `sha256-${blobHash}`);
            
            // Check if blob exists
            let blobExists = false;
            let blobSize = 0;
            try {
              const stats = await stat(localBlobPath);
              blobExists = stats.isFile();
              blobSize = stats.size;
            } catch (err) {
              // File doesn't exist
            }
            
            console.log(`  Model: ${modelName}:${version}`);
            console.log(`  Path:  ${blobPath}`);
            console.log(`  Size:  ${(blobSize / 1024 / 1024).toFixed(2)} MB`);
            console.log(`  Local: ${localBlobPath}`);
            console.log(`  Exists: ${blobExists ? '✅' : '❌'}`);
            console.log();
          }
        } catch (err) {
          console.error(`  ⚠️  Error reading manifest for ${modelName}:${version}:`, err.message);
        }
      }
    }

    // Also list all blobs
    console.log('\n📁 All GGUF model files in blobs directory:');
    if (existsSync(BLOBS_PATH)) {
      const blobs = await readdir(BLOBS_PATH);
      const modelBlobs = blobs.filter(b => b.startsWith('sha256-'));
      
      for (const blob of modelBlobs) {
        const blobPath = join(BLOBS_PATH, blob);
        const stats = await stat(blobPath);
        console.log(`  ${blob} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      }
    }

  } catch (error) {
    console.error('❌ Error reading Ollama models:', error.message);
    console.log('\n💡 Make sure Ollama has downloaded models to ./ollama_models');
  }
}

findModels();
