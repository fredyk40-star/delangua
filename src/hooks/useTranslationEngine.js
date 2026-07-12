import { useState, useEffect, useCallback, useRef } from 'react';
import { speechProcessor } from '../services/speechProcessor';
import { translator } from '../services/translator';
import { audioUtils } from '../services/audioUtils';
import { modelLoader } from '../services/modelLoader';

export const useTranslationEngine = () => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [translation, setTranslation] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState(0);
  const [worker, setWorker] = useState(null);
  const workerRef = useRef(null);
  const [sourceLanguage] = useState('twi');
  const [targetLanguage] = useState('eng');

  // Initialize WebWorker
  useEffect(() => {
    if (window.Worker) {
      const workerInstance = new Worker(
        new URL('../workers/ai.worker.js', import.meta.url),
        { type: 'module' }
      );
      
      workerInstance.onmessage = (event) => {
        const { type, data } = event.data;
        
        switch (type) {
          case 'PROGRESS':
            setLoadProgress(data.progress);
            break;
          case 'INITIALIZED':
            setIsInitialized(true);
            setIsLoading(false);
            setError(null);
            break;
          case 'TRANSCRIPTION_RESULT':
            setTranscription(data.text);
            setIsTranscribing(false);
            // Auto-translate after transcription
            if (data.text && data.text.trim()) {
              handleTranslate(data.text);
            }
            break;
          case 'TRANSLATION_RESULT':
            setTranslation(data.translatedText);
            setIsTranslating(false);
            setTranslationProgress(100);
            break;
          case 'FULL_RESULT':
            setTranscription(data.transcription.text);
            setTranslation(data.translation.translatedText);
            setIsTranscribing(false);
            setIsTranslating(false);
            setTranslationProgress(100);
            break;
          case 'ERROR':
            setError(data.message);
            setIsLoading(false);
            setIsTranscribing(false);
            setIsTranslating(false);
            break;
        }
      };

      workerInstance.onerror = (error) => {
        console.error('Worker error:', error);
        setError('Worker error: ' + error.message);
        setIsLoading(false);
        setIsTranscribing(false);
        setIsTranslating(false);
      };

      workerRef.current = workerInstance;
      setWorker(workerInstance);
    }

    // Listen for progress events
    const handleModelProgress = (event) => {
      setLoadProgress(event.detail.progress);
    };
    const handleTranslationProgress = (event) => {
      setTranslationProgress(event.detail.progress);
    };
    
    window.addEventListener('modelProgress', handleModelProgress);
    window.addEventListener('translationProgress', handleTranslationProgress);

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
      window.removeEventListener('modelProgress', handleModelProgress);
      window.removeEventListener('translationProgress', handleTranslationProgress);
      audioUtils.cleanup();
    };
  }, []);

  /**
   * Initialize the translation engine
   */
  const initializeEngine = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      setLoadProgress(0);

      // Check if models are cached
      const asrCached = await modelLoader.isModelCached('whisper-tiny');
      const translationCached = await modelLoader.isModelCached('nllb-200-distilled-600M');

      if (!asrCached) {
        console.log('ASR model not cached, downloading...');
        await modelLoader.preloadModel('whisper-tiny', (progress) => {
          setLoadProgress(progress * 0.5); // 50% for ASR
        });
      }

      if (!translationCached) {
        console.log('Translation model not cached, downloading...');
        await modelLoader.preloadModel('nllb-200-distilled-600M', (progress) => {
          setLoadProgress(50 + (progress * 0.5)); // 50% for translation
        });
      }

      // Initialize both models
      if (workerRef.current) {
        // Initialize ASR
        workerRef.current.postMessage({
          type: 'INITIALIZE_ASR',
          data: { model: 'Xenova/whisper-tiny' },
          id: Date.now()
        });

        // Initialize Translation
        workerRef.current.postMessage({
          type: 'INITIALIZE_TRANSLATION',
          data: { model: 'Xenova/nllb-200-distilled-600M' },
          id: Date.now() + 1
        });
      } else {
        // Fallback to main thread
        await speechProcessor.initialize();
        await translator.initialize();
        setIsInitialized(true);
        setIsLoading(false);
        setLoadProgress(100);
      }

    } catch (error) {
      console.error('Failed to initialize engine:', error);
      setError(error.message);
      setIsLoading(false);
      setIsInitialized(false);
    }
  }, []);

  /**
   * Handle translation of text
   */
  const handleTranslate = useCallback(async (text) => {
    if (!text || !text.trim()) {
      setTranslation('');
      return;
    }

    try {
      setIsTranslating(true);
      setTranslationProgress(0);
      setError(null);

      if (workerRef.current) {
        // Use WebWorker
        workerRef.current.postMessage({
          type: 'TRANSLATE',
          data: {
            text: text,
            sourceLang: sourceLanguage,
            targetLang: targetLanguage,
            options: {
              maxLength: 512,
              numBeams: 5
            }
          },
          id: Date.now()
        });
      } else {
        // Fallback to main thread
        const result = await translator.translateText(
          text,
          sourceLanguage,
          targetLanguage
        );
        setTranslation(result.translatedText);
        setIsTranslating(false);
        setTranslationProgress(100);
      }

    } catch (error) {
      console.error('Translation failed:', error);
      setError(error.message);
      setIsTranslating(false);
    }
  }, [sourceLanguage, targetLanguage, worker]);

  /**
   * Start recording audio
   */
  const startRecording = useCallback(async () => {
    try {
      if (!isInitialized) {
        throw new Error('Engine not initialized');
      }

      setError(null);
      await audioUtils.startRecording();
      setIsRecording(true);
      // Clear previous results
      setTranscription('');
      setTranslation('');

    } catch (error) {
      console.error('Failed to start recording:', error);
      setError(error.message);
      setIsRecording(false);
    }
  }, [isInitialized]);

  /**
   * Stop recording and transcribe
   */
  const stopRecording = useCallback(async () => {
    try {
      if (!isRecording) {
        throw new Error('No active recording');
      }

      setIsRecording(false);
      setIsTranscribing(true);
      setError(null);

      // Get audio blob
      const audioBlob = await audioUtils.stopRecording();
      
      // Process with WebWorker if available
      if (workerRef.current) {
        const arrayBuffer = await audioBlob.arrayBuffer();
        workerRef.current.postMessage({
          type: 'TRANSCRIBE',
          data: {
            audioData: arrayBuffer,
            options: {
              language: 'twi',
              returnTimestamps: false
            }
          },
          id: Date.now()
        });
      } else {
        // Fallback to main thread
        const result = await speechProcessor.transcribeAudio(audioBlob);
        setTranscription(result.text);
        setIsTranscribing(false);
        
        // Auto-translate
        if (result.text && result.text.trim()) {
          await handleTranslate(result.text);
        }
      }

    } catch (error) {
      console.error('Failed to stop recording:', error);
      setError(error.message);
      setIsRecording(false);
      setIsTranscribing(false);
    }
  }, [isRecording, handleTranslate]);

  /**
   * Translate manually entered text
   */
  const translateText = useCallback(async (text) => {
    if (!text || !text.trim()) {
      setTranslation('');
      return;
    }
    await handleTranslate(text);
  }, [handleTranslate]);

  /**
   * Cancel recording
   */
  const cancelRecording = useCallback(() => {
    audioUtils.cancelRecording();
    setIsRecording(false);
    setIsTranscribing(false);
    setIsTranslating(false);
  }, []);

  /**
   * Clear all results
   */
  const clearAll = useCallback(() => {
    setTranscription('');
    setTranslation('');
    setError(null);
    setTranslationProgress(0);
  }, []);

  /**
   * Get recording status
   */
  const getRecordingStatus = useCallback(() => {
    return audioUtils.getStatus();
  }, []);

  /**
   * Get supported languages
   */
  const getLanguages = useCallback(() => {
    return translator.getSupportedLanguages();
  }, []);

  return {
    // State
    isInitialized,
    isLoading,
    loadProgress,
    error,
    isRecording,
    isTranscribing,
    isTranslating,
    translationProgress,
    transcription,
    translation,
    sourceLanguage,
    targetLanguage,
    
    // Actions
    initializeEngine,
    startRecording,
    stopRecording,
    cancelRecording,
    translateText,
    clearAll,
    getRecordingStatus,
    getLanguages,
    
    // Info
    isWorkerSupported: !!worker,
    modelInfo: {
      asr: speechProcessor.getModelInfo(),
      translation: translator.getModelInfo()
    }
  };
};

export default useTranslationEngine;