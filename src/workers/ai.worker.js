/**
 * AI Worker - Runs ML models in background thread
 * Prevents UI freezing during heavy computations
 */

// Import Transformers.js as ES module
import { pipeline, env } from '@xenova/transformers';

// Configure environment — required for model downloading and caching
// Disable local model loading: this app doesn't serve model files from its
// own origin, and the SPA rewrite rule in vercel.json would otherwise serve
// index.html (HTML) for /models/... paths, causing JSON parse errors.
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
env.remoteHost = 'https://huggingface.co';
env.remotePathTemplate = '{model}/resolve/{revision}/{file}';

let asrPipeline = null;
let translationPipeline = null;
let isInitialized = false;
let currentTask = null;

// Language mapping for NLLB
const LANGUAGE_MAP = {
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

/**
 * Handle messages from main thread
 */
self.addEventListener('message', async (event) => {
  const { type, data, id } = event.data;

  try {
    switch (type) {
      case 'INITIALIZE_ASR':
        await initializeASR(data);
        self.postMessage({ type: 'INITIALIZED', data: { model: 'asr' }, id });
        break;

      case 'INITIALIZE_TRANSLATION':
        await initializeTranslation(data);
        self.postMessage({ type: 'INITIALIZED', data: { model: 'translation' }, id });
        break;

      case 'TRANSCRIBE':
        const transcription = await transcribe(data);
        self.postMessage({ type: 'TRANSCRIPTION_RESULT', data: transcription, id });
        break;

      case 'TRANSLATE':
        const translation = await translate(data);
        self.postMessage({ type: 'TRANSLATION_RESULT', data: translation, id });
        break;

      case 'TRANSCRIBE_AND_TRANSLATE':
        const result = await transcribeAndTranslate(data);
        self.postMessage({ type: 'FULL_RESULT', data: result, id });
        break;

      case 'GET_STATUS':
        self.postMessage({ 
          type: 'STATUS', 
          data: { 
            isInitialized, 
            asrLoaded: asrPipeline !== null,
            translationLoaded: translationPipeline !== null,
            currentTask
          },
          id 
        });
        break;

      default:
        self.postMessage({ 
          type: 'ERROR', 
          data: { message: `Unknown message type: ${type}` },
          id 
        });
    }
  } catch (error) {
    self.postMessage({ 
      type: 'ERROR', 
      data: { message: error.message, stack: error.stack },
      id 
    });
  }
});

/**
 * Initialize ASR (Whisper) model
 */
async function initializeASR(options = {}) {
  if (asrPipeline) {
    return;
  }

  try {
    self.postMessage({ 
      type: 'PROGRESS', 
      data: { message: 'Loading Whisper model...', progress: 0 } 
    });

    asrPipeline = await pipeline(
      'automatic-speech-recognition',
      options.model || 'Xenova/whisper-tiny',
      {
        progress_callback: (progress) => {
          self.postMessage({ 
            type: 'PROGRESS', 
            data: { 
              message: 'Loading ASR model...', 
              progress: Math.round(progress * 100) 
            } 
          });
        },
        device: 'auto',
        dtype: 'fp32'
      }
    );

    isInitialized = true;
    self.postMessage({ 
      type: 'PROGRESS', 
      data: { message: 'ASR model loaded successfully', progress: 100 } 
    });

    console.log('✅ Worker: ASR model initialized');

  } catch (error) {
    console.error('❌ Worker: Failed to initialize ASR:', error);
    throw error;
  }
}

/**
 * Initialize Translation (NLLB) model
 */
async function initializeTranslation(options = {}) {
  if (translationPipeline) {
    return;
  }

  try {
    self.postMessage({ 
      type: 'PROGRESS', 
      data: { message: 'Loading NLLB translation model...', progress: 0 } 
    });

    translationPipeline = await pipeline(
      'translation',
      options.model || 'Xenova/nllb-200-distilled-600M',
      {
        progress_callback: (progress) => {
          self.postMessage({ 
            type: 'PROGRESS', 
            data: { 
              message: 'Loading translation model...', 
              progress: Math.round(progress * 100) 
            } 
          });
        },
        device: 'auto',
        dtype: 'fp32'
      }
    );

    isInitialized = true;
    self.postMessage({ 
      type: 'PROGRESS', 
      data: { message: 'Translation model loaded successfully', progress: 100 } 
    });

    console.log('✅ Worker: Translation model initialized');

  } catch (error) {
    console.error('❌ Worker: Failed to initialize translation:', error);
    throw error;
  }
}

/**
 * Transcribe audio using Whisper
 */
async function transcribe(data) {
  if (!asrPipeline) {
    throw new Error('ASR model not initialized');
  }

  try {
    const { audioData, options = {} } = data;
    
    currentTask = 'transcribing';
    self.postMessage({ 
      type: 'PROGRESS', 
      data: { message: 'Transcribing audio...', progress: 50 } 
    });

    // Audio data is already decoded in the main thread (Float32Array)
    const audioArray = audioData;

    const result = await asrPipeline(audioArray, {
      language: options.language || 'twi',
      task: 'transcribe',
      return_timestamps: options.returnTimestamps || false,
      chunk_length_s: 30,
      stride_length_s: 5,
      ...options
    });

    currentTask = null;
    self.postMessage({ 
      type: 'PROGRESS', 
      data: { message: 'Transcription complete', progress: 100 } 
    });

    return {
      text: result.text,
      confidence: result.confidence || null,
      language: options.language || 'twi',
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    currentTask = null;
    console.error('❌ Worker: Transcription failed:', error);
    throw error;
  }
}

/**
 * Translate text using NLLB
 */
async function translate(data) {
  if (!translationPipeline) {
    throw new Error('Translation model not initialized');
  }

  try {
    const { text, sourceLang = 'twi', targetLang = 'eng', options = {} } = data;
    
    currentTask = 'translating';
    self.postMessage({ 
      type: 'PROGRESS', 
      data: { message: 'Translating text...', progress: 50 } 
    });

    // Map language codes
    const sourceCode = LANGUAGE_MAP[sourceLang] || sourceLang;
    const targetCode = LANGUAGE_MAP[targetLang] || targetLang;

    const result = await translationPipeline(text, {
      tgt_lang: targetCode,
      src_lang: sourceCode,
      max_length: options.maxLength || 512,
      num_beams: options.numBeams || 5,
      ...options
    });

    currentTask = null;
    self.postMessage({ 
      type: 'PROGRESS', 
      data: { message: 'Translation complete', progress: 100 } 
    });

    return {
      originalText: text,
      translatedText: result[0].translation_text,
      sourceLanguage: sourceLang,
      targetLanguage: targetLang,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    currentTask = null;
    console.error('❌ Worker: Translation failed:', error);
    throw error;
  }
}

/**
 * Transcribe and translate in one go
 */
async function transcribeAndTranslate(data) {
  try {
    // First transcribe
    const transcription = await transcribe({
      audioData: data.audioData,
      options: data.asrOptions
    });

    // Then translate
    const translation = await translate({
      text: transcription.text,
      sourceLang: data.sourceLang || 'twi',
      targetLang: data.targetLang || 'eng',
      options: data.translationOptions
    });

    return {
      transcription,
      translation,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Worker: Full pipeline failed:', error);
    throw error;
  }
}

// Error handling
self.addEventListener('error', (error) => {
  console.error('Worker error:', error);
  self.postMessage({ 
    type: 'ERROR', 
    data: { message: error.message } 
  });
});