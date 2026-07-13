// src/components/TestFullPipeline.jsx
import { useEffect, useRef } from 'react';
import useTranslationEngine from '../hooks/useTranslationEngine';

export const TestFullPipeline = () => {
  const {
    isInitialized,
    isLoading,
    error,
    isRecording,
    isTranscribing,
    isTranslating,
    transcription,
    translation,
    initializeEngine,
    startRecording,
    stopRecording,
    translateText
  } = useTranslationEngine();

  const initRef = useRef(false);
  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      initializeEngine();
    }
  }, [initializeEngine]);

  const testTranslation = () => {
    translateText('Me din de Fred. Ete sen?');
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h2>Fred Delangua - Full Pipeline Test</h2>
      
      <div style={{ margin: '20px 0' }}>
        <button 
          onClick={startRecording} 
          disabled={isRecording || !isInitialized}
          style={{ marginRight: '10px' }}
        >
          {isRecording ? 'Recording...' : 'Start Recording'}
        </button>
        <button 
          onClick={stopRecording} 
          disabled={!isRecording}
          style={{ marginRight: '10px' }}
        >
          Stop & Translate
        </button>
        <button onClick={testTranslation}>
          Test Translation
        </button>
      </div>

      <div style={{ 
        padding: '20px', 
        background: 'rgba(255,255,255,0.05)', 
        borderRadius: '8px',
        minHeight: '200px'
      }}>
        {isLoading && <p>Loading models... Please wait.</p>}
        {error && <p style={{ color: 'red' }}>Error: {error}</p>}
        {isTranscribing && <p>🎤 Transcribing...</p>}
        {isTranslating && <p>🌍 Translating...</p>}
        
        {transcription && (
          <div>
            <h4>Twi (Source):</h4>
            <p>{transcription}</p>
          </div>
        )}
        
        {translation && (
          <div>
            <h4>English (Translation):</h4>
            <p style={{ color: '#00d4ff' }}>{translation}</p>
          </div>
        )}
        
        {!transcription && !translation && !isLoading && !error && (
          <p style={{ color: 'var(--text-secondary)' }}>
            Speak in Twi or type text to translate
          </p>
        )}
      </div>

      <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        Status: {isInitialized ? '✅ Ready' : '⏳ Loading...'}
      </div>
    </div>
  );
};