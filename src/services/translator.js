import { pipeline, env } from '@huggingface/transformers';

// Configure Transformers.js environment
env.useBrowserCache = true;
env.allowRemoteModels = true;

class Translator {
  constructor() {
    this.pipeline = null;
    this.isLoading = false;
    this.isLoaded = false;
    this.progress = 0;
    this.modelName = 'Xenova/nllb-200-distilled-600M';
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

  async initialize() {
    if (this.isLoaded) {
      console.log('✅ Translator already initialized');
      return this.pipeline;
    }

    if (this.isLoading) {
      console.log('⏳ Translator already loading, waiting...');
      return new Promise((resolve) => {
        const checkLoaded = setInterval(() => {
          if (this.isLoaded) {
            clearInterval(checkLoaded);
            resolve(this.pipeline);
          }
        }, 100);
      });
    }

    try {
      this.isLoading = true;
      console.log('🚀 Loading NLLB translation model...');

      this.pipeline = await pipeline(
        'translation',
        this.modelName,
        {
          progress_callback: this.handleProgress.bind(this),
          dtype: 'fp32'
        }
      );

      this.isLoaded = true;
      this.isLoading = false;
      console.log('✅ NLLB translation model loaded successfully!');
      return this.pipeline;

    } catch (error) {
      console.error('❌ Failed to load translation model:', error);
      this.isLoading = false;
      this.isLoaded = false;
      throw new Error(`Translation model loading failed: ${error.message}`);
    }
  }

  handleProgress(progress) {
    const pct = typeof progress === 'object' ? (progress.progress || 0) : progress;
    this.progress = pct;
    console.log(`📊 Translation model loading: ${Math.round(pct * 100)}%`);
    
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('translationModelProgress', {
        detail: { progress: Math.round(pct * 100) }
      }));
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
      
      const sourceCode = this.supportedLanguages[sourceLang] || sourceLang;
      const targetCode = this.supportedLanguages[targetLang] || targetLang;

      const translationOptions = {
        tgt_lang: targetCode,
        src_lang: sourceCode,
        max_length: options.maxLength || 512,
        num_beams: options.numBeams || 5,
        temperature: options.temperature || 1.0,
        top_k: options.topK || 50,
        top_p: options.topP || 1.0,
        repetition_penalty: options.repetitionPenalty || 1.0,
        length_penalty: options.lengthPenalty || 1.0,
        ...options
      };

      const maxChunkSize = 200;
      const sentences = this.splitIntoSentences(text);
      const chunks = this.createChunks(sentences, maxChunkSize);
      
      let translatedChunks = [];
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`📝 Translating chunk ${i + 1}/${chunks.length}...`);
        
        this.dispatchProgress(Math.round(((i + 1) / chunks.length) * 100));
        
        const result = await this.pipeline(chunk, translationOptions);
        // v3 returns array of { translation_text } objects
        translatedChunks.push(result[0].translation_text);
      }

      const translatedText = translatedChunks.join(' ');
      
      console.log('✅ Translation complete!');
      
      return {
        originalText: text,
        translatedText: translatedText,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        chunks: translatedChunks.length,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Translation failed:', error);
      throw new Error(`Translation error: ${error.message}`);
    }
  }

  splitIntoSentences(text) {
    return text.match(/[^.!?]+[.!?]+/g) || [text];
  }

  createChunks(sentences, maxLength) {
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

  dispatchProgress(progress) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('translationProgress', {
        detail: { progress }
      }));
    }
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
    if (this.pipeline) {
      this.pipeline = null;
      this.isLoaded = false;
      this.isLoading = false;
      this.progress = 0;
      console.log('🗑️ Translation model unloaded');
    }
  }
}

export const translator = new Translator();
export const initializeTranslator = () => translator.initialize();
export const translateText = (text, sourceLang, targetLang, options) => 
  translator.translateText(text, sourceLang, targetLang, options);
export const getSupportedLanguages = () => translator.getSupportedLanguages();
export default translator;