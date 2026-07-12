import { pipeline, env } from '@huggingface/transformers';

// Configure Transformers.js environment
env.useBrowserCache = true;
// Use the Hugging Face CDN directly (default behavior)
env.allowRemoteModels = true;

class SpeechProcessor {
  constructor() {
    this.pipeline = null;
    this.isLoading = false;
    this.isLoaded = false;
    this.progress = 0;
    this.modelName = 'Xenova/whisper-tiny';
  }

  async initialize() {
    if (this.isLoaded) {
      console.log('✅ Speech processor already initialized');
      return this.pipeline;
    }

    if (this.isLoading) {
      console.log('⏳ Speech processor already loading, waiting...');
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
      console.log('🚀 Loading Whisper model...');

      this.pipeline = await pipeline(
        'automatic-speech-recognition',
        this.modelName,
        {
          progress_callback: this.handleProgress.bind(this),
          dtype: 'fp32',
        }
      );

      this.isLoaded = true;
      this.isLoading = false;
      console.log('✅ Whisper model loaded successfully!');
      return this.pipeline;

    } catch (error) {
      console.error('❌ Failed to load Whisper model:', error);
      this.isLoading = false;
      this.isLoaded = false;
      throw new Error(`Model loading failed: ${error.message}`);
    }
  }

  handleProgress(progress) {
    // In v3, progress can be a number or an object with progress field
    const pct = typeof progress === 'object' ? (progress.progress || 0) : progress;
    this.progress = pct;
    console.log(`📊 Model loading: ${Math.round(pct * 100)}%`);
    
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('modelProgress', {
        detail: { progress: Math.round(pct * 100) }
      }));
    }
  }

  async transcribeAudio(audioBlob, options = {}) {
    if (!this.isLoaded) {
      throw new Error('Speech processor not initialized. Call initialize() first.');
    }

    try {
      console.log('🎤 Starting transcription...');
      
      const audioBuffer = await audioBlob.arrayBuffer();
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioData = await audioContext.decodeAudioData(audioBuffer);
      const samples = audioData.getChannelData(0);
      const float32Array = new Float32Array(samples);
      
      const pipelineOptions = {
        language: null, // Auto-detect when not specified
        task: 'transcribe',
        return_timestamps: false,
        chunk_length_s: 30,
        stride_length_s: 5,
        ...options
      };

      const result = await this.pipeline(float32Array, pipelineOptions);
      
      console.log('✅ Transcription complete!');
      return {
        text: result.text,
        confidence: result.confidence || null,
        language: result.language || null
      };

    } catch (error) {
      console.error('❌ Transcription failed:', error);
      throw new Error(`Transcription error: ${error.message}`);
    }
  }

  async transcribeAudioUrl(audioUrl, options = {}) {
    try {
      const response = await fetch(audioUrl);
      const audioBlob = await response.blob();
      return this.transcribeAudio(audioBlob, options);
    } catch (error) {
      console.error('❌ Failed to fetch audio URL:', error);
      throw error;
    }
  }

  getModelInfo() {
    return {
      modelName: this.modelName,
      isLoaded: this.isLoaded,
      isLoading: this.isLoading,
      progress: this.progress
    };
  }

  async unload() {
    if (this.pipeline) {
      this.pipeline = null;
      this.isLoaded = false;
      this.isLoading = false;
      this.progress = 0;
      console.log('🗑️ Speech processor unloaded');
    }
  }
}

export const speechProcessor = new SpeechProcessor();
export const initializeSpeechProcessor = () => speechProcessor.initialize();
export const transcribeAudio = (audioBlob, options) => 
  speechProcessor.transcribeAudio(audioBlob, options);
export const getModelInfo = () => speechProcessor.getModelInfo();
export default speechProcessor;