import './TranslationDisplay.css';

const TranslationDisplay = ({ 
  transcription, 
  translation, 
  isTranscribing, 
  isTranslating, 
  translationProgress,
  error 
}) => {
  const getStatusMessage = () => {
    if (isTranscribing) return '🎤 Transcribing...';
    if (isTranslating) return '🌍 Translating...';
    if (error) return '⚠️ Error';
    if (transcription && translation) return '✅ Complete';
    if (transcription) return '📝 Ready to translate';
    return '💬 Waiting for input';
  };

  const getStatusClass = () => {
    if (isTranscribing || isTranslating) return 'processing';
    if (error) return 'error';
    if (transcription && translation) return 'complete';
    return 'idle';
  };

  return (
    <div className="translation-display">
      <div className="translation-header">
        <h3>Translation Results</h3>
        <div className={`status-badge ${getStatusClass()}`}>
          {getStatusMessage()}
        </div>
      </div>

      {/* Progress bar for translation */}
      {(isTranslating || translationProgress > 0) && (
        <div className="progress-container">
          <div className="progress-bar">
            <div 
              className="progress-fill translation-progress"
              style={{ width: `${translationProgress}%` }}
            ></div>
          </div>
          <span className="progress-text">{Math.round(translationProgress)}%</span>
        </div>
      )}

      <div className="translation-grid">
        <div className="translation-column source">
          <div className="column-label">
            <span className="label-icon">🇬🇭</span>
            <span>Twi (Source)</span>
          </div>
          <div className="column-content">
            {isTranscribing ? (
              <div className="loading-placeholder">
                <span className="loading-dots">Transcribing...</span>
              </div>
            ) : transcription ? (
              <p className="text-content">{transcription}</p>
            ) : (
              <p className="placeholder-text">
                Speak or type Twi text to translate
              </p>
            )}
          </div>
        </div>

        <div className="translation-column target">
          <div className="column-label">
            <span className="label-icon">🇬🇧</span>
            <span>English (Target)</span>
          </div>
          <div className="column-content">
            {isTranslating ? (
              <div className="translating-placeholder">
                <div className="spinner"></div>
                <span>Translating...</span>
              </div>
            ) : translation ? (
              <p className="text-content translation-text">{translation}</p>
            ) : error ? (
              <div className="error-placeholder">
                <span className="error-icon">⚠️</span>
                <p>{error}</p>
              </div>
            ) : (
              <p className="placeholder-text">
                Translation will appear here
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Translation metadata */}
      {translation && (
        <div className="translation-metadata">
          <div className="metadata-item">
            <span className="metadata-label">Status:</span>
            <span className="metadata-value">✅ Translation complete</span>
          </div>
          <div className="metadata-item">
            <span className="metadata-label">Model:</span>
            <span className="metadata-value">NLLB-200 (600M)</span>
          </div>
          <button 
            className="copy-button"
            onClick={() => {
              navigator.clipboard?.writeText(translation);
            }}
          >
            📋 Copy Translation
          </button>
        </div>
      )}
    </div>
  );
};

export default TranslationDisplay;