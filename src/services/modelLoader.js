/**
 * Utility for loading and caching AI models
 * Handles offline-first loading with progress tracking
 */

export class ModelLoader {
  constructor() {
    this.cache = new Map();
    this.loadingPromises = new Map();
    this.cacheName = 'model-cache';
    this.modelRegistry = {
      'whisper-tiny': {
        url: 'https://huggingface.co/Xenova/whisper-tiny',
        size: '~150MB',
        version: '1.0.0',
        type: 'asr'
      },
      'whisper-base': {
        url: 'https://huggingface.co/Xenova/whisper-base',
        size: '~300MB',
        version: '1.0.0',
        type: 'asr'
      },
      'nllb-200-distilled-600M': {
        url: 'https://huggingface.co/Xenova/nllb-200-distilled-600M',
        size: '~1.2GB',
        version: '1.0.0',
        type: 'translation'
      },
      'nllb-200-distilled-1.3B': {
        url: 'https://huggingface.co/Xenova/nllb-200-distilled-1.3B',
        size: '~2.6GB',
        version: '1.0.0',
        type: 'translation'
      }
    };
  }

  /**
   * Check if model is cached in browser
   */
  async isModelCached(modelName) {
    try {
      const cache = await caches.open(this.cacheName);
      const modelInfo = this.modelRegistry[modelName];
      if (!modelInfo) return false;

      // Check for multiple files
      const filesToCheck = [
        '/resolve/main/model.safetensors',
        '/resolve/main/config.json',
        '/resolve/main/tokenizer.json',
        '/resolve/main/generation_config.json'
      ];

      let cachedCount = 0;
      for (const file of filesToCheck) {
        const url = `${modelInfo.url}${file}`;
        const response = await cache.match(url);
        if (response) cachedCount++;
      }

      // Consider cached if at least 2 files are present
      return cachedCount >= 2;
    } catch (error) {
      console.warn('Cache check failed:', error);
      return false;
    }
  }

  /**
   * Get model cache size
   */
  async getCacheSize() {
    try {
      const cache = await caches.open(this.cacheName);
      const keys = await cache.keys();
      let totalSize = 0;
      
      for (const request of keys) {
        const response = await cache.match(request);
        if (response) {
          const blob = await response.blob();
          totalSize += blob.size;
        }
      }
      
      return totalSize;
    } catch (error) {
      console.warn('Failed to get cache size:', error);
      return 0;
    }
  }

  /**
   * Preload model files into cache
   */
  async preloadModel(modelName, onProgress) {
    if (this.loadingPromises.has(modelName)) {
      return this.loadingPromises.get(modelName);
    }

    const loadPromise = (async () => {
      try {
        const modelInfo = this.modelRegistry[modelName];
        if (!modelInfo) {
          throw new Error(`Model ${modelName} not found in registry`);
        }

        // Check if already cached
        const isCached = await this.isModelCached(modelName);
        if (isCached) {
          console.log(`✅ Model ${modelName} is already cached`);
          return true;
        }

        console.log(`📦 Preloading model: ${modelName} (${modelInfo.size})...`);
        const cache = await caches.open(this.cacheName);

        // List of essential files to cache
        const essentialFiles = [
          '/resolve/main/model.safetensors',
          '/resolve/main/config.json',
          '/resolve/main/tokenizer.json',
          '/resolve/main/generation_config.json'
        ];

        let loaded = 0;
        const total = essentialFiles.length;

        for (const file of essentialFiles) {
          const url = `${modelInfo.url}${file}`;
          try {
            const response = await fetch(url);
            if (response.ok) {
              await cache.put(url, response);
              loaded++;
              const progress = (loaded / total) * 100;
              console.log(`📊 Model ${modelName}: ${Math.round(progress)}% cached`);
              if (onProgress) onProgress(progress);
            } else {
              console.warn(`Failed to fetch ${file} (HTTP ${response.status})`);
            }
          } catch (error) {
            console.warn(`Failed to cache ${file}:`, error);
          }
        }

        console.log(`✅ Model ${modelName} preloaded successfully`);
        return true;

      } catch (error) {
        console.error(`❌ Failed to preload model ${modelName}:`, error);
        throw error;
      }
    })();

    this.loadingPromises.set(modelName, loadPromise);
    return loadPromise;
  }

  /**
   * Clear cached models
   */
  async clearCache() {
    try {
      await caches.delete(this.cacheName);
      console.log('🗑️ Model cache cleared');
      return true;
    } catch (error) {
      console.error('Failed to clear cache:', error);
      return false;
    }
  }

  /**
   * Get model registry info
   */
  getModelInfo(modelName) {
    return this.modelRegistry[modelName] || null;
  }

  /**
   * Get all available models
   */
  getAvailableModels() {
    return Object.keys(this.modelRegistry);
  }

  /**
   * Get models by type
   */
  getModelsByType(type) {
    return Object.entries(this.modelRegistry)
      .filter(([, info]) => info.type === type)
      .map(([name, info]) => ({ name, ...info }));
  }
}

export const modelLoader = new ModelLoader();
export default modelLoader;