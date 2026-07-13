import useTranslationEngine from '../hooks/useTranslationEngine';
import './Controls.css';

function Controls() {
  const {
    isRecording,
    isTranscribing,
    isInitialized,
    startRecording,
    stopRecording,
    cancelRecording,
    clearTranscription
  } = useTranslationEngine();

  const handleStartStop = async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  return (
    <div className="controls">
      <button 
        className={`control-btn primary ${isRecording ? 'recording' : ''}`}
        onClick={handleStartStop}
        disabled={!isInitialized || isTranscribing}
      >
        {isRecording ? '⏹ Stop' : '🎤 Start'}
      </button>
      
      {isRecording && (
        <button 
          className="control-btn danger"
          onClick={cancelRecording}
        >
          ✖ Cancel
        </button>
      )}
      
      <button 
        className="control-btn secondary"
        onClick={clearTranscription}
        disabled={isRecording || isTranscribing}
      >
        🗑 Clear
      </button>
      
      <div className="status-indicator">
        <span className={`status-dot ${isInitialized ? 'ready' : 'loading'}`}></span>
        <span className="status-text">
          {isRecording ? '🔴 Recording...' : 
           isTranscribing ? '⏳ Processing...' : 
           isInitialized ? '✅ Ready' : '⏳ Loading...'}
        </span>
      </div>
    </div>
  );
}

export default Controls;