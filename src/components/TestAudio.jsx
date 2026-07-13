// src/components/TestAudio.jsx (for testing)
import useTranslationEngine from '../hooks/useTranslationEngine';

export const TestAudio = () => {
  const {
    isInitialized,
    isLoading,
    error,
    isRecording,
    transcription,
    initializeEngine,
    startRecording,
    stopRecording
  } = useTranslationEngine();

  return (
    <div style={{ padding: '20px' }}>
      <h3>Audio Test</h3>
      <button onClick={initializeEngine} disabled={isInitialized}>
        Initialize
      </button>
      <button onClick={isRecording ? stopRecording : startRecording}>
        {isRecording ? 'Stop' : 'Start'} Recording
      </button>
      {isLoading && <p>Loading...</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      {transcription && <p>Transcription: {transcription}</p>}
      <p>Status: {isInitialized ? 'Ready' : 'Not Ready'}</p>
      <p>Recording: {isRecording ? 'Yes' : 'No'}</p>
    </div>
  );
};