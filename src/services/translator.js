/**
 * Translator - delegates NLLB translation to the AI worker
 * Public API matches original: initialize(), translateText(), getModelInfo(), unload(), getSupportedLanguages()
 */

class Translator {
  constructor() {
    this.worker = null;
    this.isLoading = false;
    this.isLoaded = false;
    this.progress = 0;
    this.modelName = 'Xenova/nllb-200-distilled-600M';
    this._messageId = 0;
    this._pending = new Map();
    this.supportedLanguages = {
      'twi': 'twi_Latn',
      'eng': 'eng_Latn',
      'fra': 'fra_Latn',
      'spa': 'spa_Latn',
      'yor': 'yor_Latn',
      'hau': 'hau_Latn',
      'igbo': 'ibo_Latn',
      'amh': 'amh_Ethi',
      'swa': 'swa_Latn',
      'zul': 'zul_Latn'
    };
    this.languageNames = {
      'twi_Latn': 'Twi',
      'eng_Latn': 'English',
      'fra_Latn': 'French',
      'spa_Latn': 'Spanish',
      'yor_Latn': 'Yoruba',
      'hau_Latn': 'Hausa',
      'ibo_Latn': 'Igbo',
      'amh_Ethi': 'Amharic',
      'swa_Latn': 'Swahili',
      'zul_Latn': 'Zulu'
    };
  }

  _getWorker() {
    if (!this.worker) {
      this.worker = new Worker(
        new URL('../workers/ai.worker.js', import.meta.url),
        { type: 'module' }
      );
      this.worker.addEventListener('message', this._handleWorkerMessage.bind(this));
      this.worker.addEventListener('error', (e) => {
        console.error('Translation worker error:', e);
      });
    }
    return this.worker;
  }

  _handleWorkerMessage(event) {
    const { type, data, id } = event.data;

    // Handle broadcast progress messages even without an id
    if (type === 'PROGRESS') {
      this.progress = data.progress / 100;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('translationModelProgress', {
          detail: { progress: data.progress }
        }));
      }
      return;
    }

    const pending = this._pending.get(id);
    if (!pending) return;

    switch (type) {
      case 'INITIALIZED':
        this.isLoaded = true;
        this.isLoading = false;
        this.progress = 1;
        pending.resolve();
        break;
      case 'TRANSLATION_RESULT':
        pending.resolve(data);
        break;
      case 'ERROR':
        pending.reject(new Error(data.message));
        break;
    }
    this._pending.delete(id);
  }

  _sendMessage(type, data = {}) {
    const id = ++this._messageId;
    this._getWorker().postMessage({ type, data, id });
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
    });
  }

  async initialize() {
    if (this.isLoaded) {
      console.log('✅ Translator already initialized');
      return;
    }

    if (this.isLoading) {
      console.log('⏳ Translator already loading, waiting...');
      return new Promise((resolve) => {
        const checkLoaded = setInterval(() => {
          if (this.isLoaded) {
            clearInterval(checkLoaded);
            resolve();
          }
        }, 100);
      });
    }

    try {
      this.isLoading = true;
      console.log('🚀 Initializing NLLB translation model in worker...');
      await this._sendMessage('INITIALIZE_TRANSLATION', { model: this.modelName });
      console.log('✅ NLLB translation model initialized in worker');
    } catch (error) {
      console.error('❌ Failed to load translation model:', error);
      this.isLoading = false;
      this.isLoaded = false;
      throw new Error(`Translation model loading failed: ${error.message}`, { cause: error });
    }
  }

  async translateText(text, sourceLang = 'twi', targetLang = 'eng', options = {}) {
    if (!this.isLoaded) {
      throw new Error('Translator not initialized. Call initialize() first.');
    }

    if (!text || text.trim().length === 0) {
      throw new Error('No text to translate');
    }

    try {
      console.log(`🌍 Translating from ${sourceLang} to ${targetLang}...`);

      const maxChunkSize = 200;
      const sentences = this._splitIntoSentences(text);
      const chunks = this._createChunks(sentences, maxChunkSize);

      let translatedChunks = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`📝 Translating chunk ${i + 1}/${chunks.length}...`);

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('translationProgress', {
            detail: { progress: Math.round(((i + 1) / chunks.length) * 100) }
          }));
        }

        const result = await this._sendMessage('TRANSLATE', {
          text: chunk,
          sourceLang,
          targetLang,
          options
        });

        translatedChunks.push(result.translatedText);
      }

      const translatedText = translatedChunks.join(' ');

      console.log('✅ Translation complete!');

      return {
        originalText: text,
        translatedText,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        chunks: translatedChunks.length,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Translation failed:', error);
      throw new Error(`Translation error: ${error.message}`, { cause: error });
    }
  }

  _splitIntoSentences(text) {
    return text.match(/[^.!?]+[.!?]+/g) || [text];
  }

  _createChunks(sentences, maxLength) {
    const chunks = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      const estimatedTokens = currentChunk.split(' ').length * 1.3 +
                            sentence.split(' ').length * 1.3;

      if (estimatedTokens > maxLength && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  getSupportedLanguages() {
    return Object.keys(this.supportedLanguages).reduce((acc, key) => {
      acc[key] = {
        code: key,
        nllbCode: this.supportedLanguages[key],
        name: this.languageNames[this.supportedLanguages[key]] || key
      };
      return acc;
    }, {});
  }

  getModelInfo() {
    return {
      modelName: this.modelName,
      isLoaded: this.isLoaded,
      isLoading: this.isLoading,
      progress: this.progress,
      supportedLanguages: this.getSupportedLanguages()
    };
  }

  async unload() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.isLoaded = false;
    this.isLoading = false;
    this.progress = 0;
    this._pending.clear();
    console.log('🗑️ Translation model unloaded');
  }
}

export const translator = new Translator();
export const initializeTranslator = () => translator.initialize();
export const translateText = (text, sourceLang, targetLang, options) =>
  translator.translateText(text, sourceLang, targetLang, options);
export const getSupportedLanguages = () => translator.getSupportedLanguages();
export default translator;
