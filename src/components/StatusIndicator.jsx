import './StatusIndicator.css';

const StatusIndicator = ({
  isRecording,
  isProcessing,
  isTranslating,
  isInitialized
}) => {
  let status = 'idle';
  let label = 'Ready';
  let icon = '●';

  if (!isInitialized) {
    status = 'loading';
    label = 'Loading...';
    icon = '⟳';
  } else if (isRecording) {
    status = 'recording';
    label = 'Recording';
    icon = '●';
  } else if (isProcessing) {
    status = 'processing';
    label = 'Processing';
    icon = '⟳';
  } else if (isTranslating) {
    status = 'translating';
    label = 'Translating';
    icon = '⟳';
  }

  return (
    <div className={`status-indicator ${status}`}>
      <span className={`status-icon ${status}`}>{icon}</span>
      <span className="status-label">{label}</span>
    </div>
  );
};

export default StatusIndicator;