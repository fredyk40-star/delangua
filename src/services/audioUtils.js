/**
 * Audio processing utilities for Fred Delangua
 * Handles audio recording, format conversion, and optimization
 */

export class AudioUtils {
  constructor() {
    this.mediaRecorder = null;
    this.stream = null;
    this.chunks = [];
    this.isRecording = false;
    this.sampleRate = 16000; // Whisper expects 16kHz
    this.audioContext = null;
  }

  /**
   * Initialize audio context
   */
  async initializeAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: this.sampleRate
      });
    }
    
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    
    return this.audioContext;
  }

  /**
   * Start recording audio from microphone
   */
  async startRecording() {
    try {
      // Request microphone permission
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: this.sampleRate,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Initialize audio context
      await this.initializeAudioContext();

      // Create MediaRecorder with specific MIME type
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/mp4;codecs=opus'
      ];

      let mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) {
        mimeType = '';
        console.warn('No supported audio MIME type found, using default');
      }

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: mimeType,
        audioBitsPerSecond: 128000
      });

      this.chunks = [];

      // Collect data chunks
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };

      // Start recording
      this.mediaRecorder.start(100); // Collect chunks every 100ms
      this.isRecording = true;
      
      console.log('🎙️ Recording started');
      return true;

    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      if (error.name === 'NotAllowedError') {
        throw new Error('Microphone access denied. Please allow microphone access.');
      } else if (error.name === 'NotFoundError') {
        throw new Error('No microphone found. Please connect a microphone.');
      }
      throw error;
    }
  }

  /**
   * Stop recording and return audio blob
   */
  async stopRecording() {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || !this.isRecording) {
        reject(new Error('No active recording found'));
        return;
      }

      this.mediaRecorder.onstop = async () => {
        try {
          // Create blob from chunks
          const mimeType = this.mediaRecorder.mimeType || 'audio/webm';
          const audioBlob = new Blob(this.chunks, { type: mimeType });
          
          // Clean up
          this.isRecording = false;
          this.chunks = [];
          
          // Stop all tracks
          if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
          }

          console.log(`🎙️ Recording stopped, blob size: ${audioBlob.size} bytes`);
          
          // Convert to WAV format for Whisper (if needed)
          if (mimeType.includes('webm') || mimeType.includes('ogg')) {
            const wavBlob = await this.convertToWav(audioBlob);
            resolve(wavBlob);
          } else {
            resolve(audioBlob);
          }

        } catch (error) {
          reject(error);
        }
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * Convert audio blob to WAV format (16kHz, mono, 16-bit PCM)
   * Whisper works best with this format
   */
  async convertToWav(audioBlob) {
    try {
      const audioContext = await this.initializeAudioContext();
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // Resample to 16kHz mono
      const targetSampleRate = this.sampleRate;
      const sourceSampleRate = audioBuffer.sampleRate;
      const channelData = audioBuffer.getChannelData(0);
      
      // Resample if needed
      let samples;
      if (sourceSampleRate !== targetSampleRate) {
        const ratio = targetSampleRate / sourceSampleRate;
        const newLength = Math.floor(channelData.length * ratio);
        samples = new Float32Array(newLength);
        
        for (let i = 0; i < newLength; i++) {
          const index = i / ratio;
          const indexFloor = Math.floor(index);
          const indexCeil = Math.min(indexFloor + 1, channelData.length - 1);
          const fraction = index - indexFloor;
          samples[i] = (1 - fraction) * channelData[indexFloor] + 
                       fraction * channelData[indexCeil];
        }
      } else {
        samples = channelData;
      }

      // Convert to 16-bit PCM
      const pcmData = new Int16Array(samples.length);
      for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      // Create WAV header
      const header = this.createWavHeader(pcmData.length, targetSampleRate);
      
      // Combine header and data
      const wavBlob = new Blob([header, pcmData], { 
        type: 'audio/wav' 
      });

      console.log(`✅ Converted to WAV: ${wavBlob.size} bytes`);
      return wavBlob;

    } catch (error) {
      console.error('❌ Failed to convert to WAV:', error);
      // Return original blob if conversion fails
      return audioBlob;
    }
  }

  /**
   * Create WAV file header
   */
  createWavHeader(dataLength, sampleRate) {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    // RIFF chunk descriptor
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength * 2, true);
    this.writeString(view, 8, 'WAVE');

    // fmt sub-chunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // Byte rate
    view.setUint16(32, 2, true); // Block align
    view.setUint16(34, 16, true); // Bits per sample

    // data sub-chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataLength * 2, true);

    return header;
  }

  /**
   * Write string to DataView
   */
  writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  /**
   * Cancel current recording
   */
  cancelRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
      this.chunks = [];
      
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }
      
      console.log('⏹️ Recording cancelled');
    }
  }

  /**
   * Get recording status
   */
  getStatus() {
    return {
      isRecording: this.isRecording,
      sampleRate: this.sampleRate,
      audioContextState: this.audioContext ? this.audioContext.state : 'inactive'
    };
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.cancelRecording();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

export const audioUtils = new AudioUtils();
export default audioUtils;