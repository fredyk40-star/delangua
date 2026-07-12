/**
 * SpeechProcessor - delegates ASR to the AI worker
 * Public API matches original: initialize(), transcribeAudio(), getModelInfo(), unload()
 */

class SpeechProcessor {
  constructor() {
    this.worker = null;
    this.isLoading = false;
    this.isLoaded = false;
    this.progress = 0;
    this.modelName = 'Xenova/whisper-tiny';
    this._pendingResolve = null;
    this._pendingReject = null;
    this._messageId = 0;
    this._pending = new Map();
  }

  _getWorker() {
    if (!this.worker) {
      this.worker = new Worker(
        new URL('../workers/ai.worker.js', import.meta.url),
        { type: 'module' }
      );
      this.worker.addEventListener('message', this._handleWorkerMessage.bind(this));
      this.worker.addEventListener('error', (e) => {
        console.error('Speech worker error:', e);
        if (this._pendingReject) this._pendingReject(e);
      });
    }
    return this.worker;
  }

  _handleWorkerMessage(event) {
    const { type, data, id } = event.data;
    const pending = this._pending.get(id);
    if (!pending) return;

    switch (type) {
      case 'PROGRESS':
        this.progress = data.progress / 100;
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('modelProgress', {
            detail: { progress: data.progress }
          }));
        }
        break;
      case 'INITIALIZED':
        this.isLoaded = true;
        this.isLoading = false;
        this.progress = 1;
        pending.resolve();
        break;
      case 'TRANSCRIPTION_RESULT':
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
      console.log('✅ Speech processor already initialized');
      return;
    }

    if (this.isLoading) {
      console.log('⏳ Speech processor already loading, waiting...');
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
      console.log('🚀 Initializing Whisper model in worker...');
      await this._sendMessage('INITIALIZE_ASR', { model: this.modelName });
      console.log('✅ Whisper model initialized in worker');
    } catch (error) {
      console.error('❌ Failed to load Whisper model:', error);
      this.isLoading = false;
      this.isLoaded = false;
      throw new Error(`Model loading failed: ${error.message}`);
    }
  }

  async transcribeAudio(audioBlob, options = {}) {
    if (!this.isLoaded) {
      throw new Error('Speech processor not initialized. Call initialize() first.');
    }

    try {
      console.log('🎤 Starting transcription...');

      const audioBuffer = await audioBlob.arrayBuffer();
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      const audioData = await audioContext.decodeAudioData(audioBuffer);
      const float32Array = audioData.getChannelData(0);
      await audioContext.close();

      const result = await this._sendMessage('TRANSCRIBE', {
        audioData: float32Array,
        options
      });

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
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.isLoaded = false;
    this.isLoading = false;
    this.progress = 0;
    this._pending.clear();
    console.log('🗑️ Speech processor unloaded');
  }
}

export const speechProcessor = new SpeechProcessor();
export const initializeSpeechProcessor = () => speechProcessor.initialize();
export const transcribeAudio = (audioBlob, options) =>
  speechProcessor.transcribeAudio(audioBlob, options);
export const getModelInfo = () => speechProcessor.getModelInfo();
export default speechProcessor;