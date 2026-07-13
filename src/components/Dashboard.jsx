import { useState, useEffect, useRef } from 'react';
import useTranslationEngine from '../hooks/useTranslationEngine';
import TranslationDisplay from './TranslationDisplay';
import './Dashboard.css';

function Dashboard() {
  const {
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
    initializeEngine,
    startRecording,
    stopRecording,
    cancelRecording,
    translateText,
    clearAll
  } = useTranslationEngine();

  const [inputText, setInputText] = useState('');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const timerIntervalRef = useRef(null);
  const [showManualTranslate, setShowManualTranslate] = useState(false);

  // Auto-initialize on mount
  useEffect(() => {
    initializeEngine();
  }, [initializeEngine]);

  // Timer for recording duration
  useEffect(() => {
    if (isRecording) {
      const interval = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      timerIntervalRef.current = interval;
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [isRecording]);


  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleToggleRecording = async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  const handleCancelRecording = () => {
    cancelRecording();
  };

  const handleManualTranslate = async () => {
    if (inputText.trim()) {
      await translateText(inputText);
      setShowManualTranslate(false);
    }
  };

  const handleClearAll = () => {
    setInputText('');
    clearAll();
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="dashboard loading">
        <div className="loader-container">
          <div className="loader-spinner"></div>
          <h3>Loading AI Models...</h3>
          <p className="loader-progress">{Math.round(loadProgress)}%</p>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${loadProgress}%` }}
            ></div>
          </div>
          <p className="loader-info">
            {loadProgress < 50 ? 'Loading ASR model...' : 'Loading Translation model...'}
          </p>
          <p className="loader-sub-info">This may take a moment on first load</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !isInitialized) {
    return (
      <div className="dashboard error">
        <div className="error-container">
          <span className="error-icon">⚠️</span>
          <h3>Failed to Initialize</h3>
          <p>{error}</p>
          <button onClick={initializeEngine} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Status Bar */}
      <div className="status-bar">
        <span className={`status-dot ${isInitialized ? 'active' : 'inactive'}`}></span>
        <span className="status-text">
          {isInitialized ? '✅ Ready' : '⏳ Initializing...'}
        </span>
        {isRecording && (
          <span className="recording-indicator">
            🔴 Recording {formatDuration(recordingDuration)}
          </span>
        )}
        {isTranscribing && (
          <span className="processing-indicator">🎤 Transcribing...</span>
        )}
        {isTranslating && (
          <span className="processing-indicator">🌍 Translating...</span>
        )}
        {(transcription || translation) && (
          <button className="clear-all-button" onClick={handleClearAll}>
            ✖ Clear All
          </button>
        )}
      </div>

      {/* Main Controls */}
      <div className="controls-section">
        <button
          className={`record-button ${isRecording ? 'recording' : ''}`}
          onClick={handleToggleRecording}
          disabled={!isInitialized || isTranscribing || isTranslating}
        >
          {isRecording ? '⏹ Stop Recording' : '🎤 Start Recording'}
        </button>
        
        {isRecording && (
          <button
            className="cancel-button"
            onClick={handleCancelRecording}
          >
            ✖ Cancel
          </button>
        )}

        <button
          className="manual-toggle-button"
          onClick={() => setShowManualTranslate(!showManualTranslate)}
          disabled={isRecording || isTranscribing}
        >
          ✏️ {showManualTranslate ? 'Hide Manual' : 'Type Translation'}
        </button>
      </div>

      {/* Manual Input */}
      {showManualTranslate && (
        <div className="manual-input-section">
          <div className="manual-input-group">
            <textarea
              className="manual-textarea"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type Twi text to translate..."
              rows={3}
              disabled={isTranslating || isRecording}
            />
            <button
              className="manual-translate-button"
              onClick={handleManualTranslate}
              disabled={!inputText.trim() || isTranslating}
            >
              {isTranslating ? 'Translating...' : 'Translate Text'}
            </button>
          </div>
        </div>
      )}

      {/* Translation Display */}
      <TranslationDisplay
        transcription={transcription}
        translation={translation}
        isTranscribing={isTranscribing}
        isTranslating={isTranslating}
        translationProgress={translationProgress}
        error={error}
      />

      {/* Debug Info */}
      <div className="debug-info">
        <small>
          Status: {isInitialized ? '✅ Ready' : '⏳ Loading'} 
          {error && ` | Error: ${error}`}
          {translation && ' | Translation complete'}
        </small>
      </div>
    </div>
  );
}

export default Dashboard;