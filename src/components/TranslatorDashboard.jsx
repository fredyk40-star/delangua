import { useState, useEffect, useRef, useCallback } from 'react';
import useStreamingTranslation from '../hooks/useStreamingTranslation';
import { speechProcessor } from '../services/speechProcessor';
import { translator } from '../services/translator';
import { modelLoader } from '../services/modelLoader';
import AudioVisualizer from './AudioVisualizer';
import StatusIndicator from './StatusIndicator';
import './TranslatorDashboard.css';

const HISTORY_KEY = 'fred-delangua-history';
const THEME_KEY = 'fred-delangua-theme';
const MAX_HISTORY = 20;

function loadHistory() {
  try { const raw = localStorage.getItem(HISTORY_KEY); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}
function saveHistory(entry) {
  try {
    const history = loadHistory();
    history.unshift(entry);
    if (history.length > MAX_HISTORY) history.pop();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch { /* no-op */ }
}
function clearHistoryStorage() { try { localStorage.removeItem(HISTORY_KEY); } catch { /* no-op */ } }
function updateHistoryNote(id, note) {
  try {
    const history = loadHistory();
    const entry = history.find(e => e.id === id);
    if (entry) { entry.note = note; localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); }
  } catch { /* no-op */ }
}

const SUPPORTED_LANGS = [
  { code: 'auto', name: 'Auto Detect', flag: '🔍' },
  { code: 'twi', name: 'Twi', flag: '🇬🇭' },
  { code: 'eng', name: 'English', flag: '🇬🇧' },
  { code: 'fra', name: 'French', flag: '🇫🇷' },
  { code: 'spa', name: 'Spanish', flag: '🇪🇸' },
  { code: 'yor', name: 'Yoruba', flag: '🇳🇬' },
  { code: 'hau', name: 'Hausa', flag: '🇳🇬' },
  { code: 'igbo', name: 'Igbo', flag: '🇳🇬' },
  { code: 'swa', name: 'Swahili', flag: '🇰🇪' },
  { code: 'zul', name: 'Zulu', flag: '🇿🇦' },
  { code: 'amh', name: 'Amharic', flag: '🇪🇹' },
];
const TARGET_LANGS = SUPPORTED_LANGS.filter(l => l.code !== 'auto');

function getLangInfo(code) {
  return SUPPORTED_LANGS.find(l => l.code === code) || { code, name: code, flag: '🗣️' };
}

const QUICK_PHRASES = {
  twi: [
    'Maakye', 'Maaha', 'Me ho ye', 'Medaase', 'Yebeshia bio',
    'Wo ho te sen?', 'Mepa wo kyɛw', 'Bra ha', 'Kɔ bra', 'Aane',
    'Daabi', 'Me din de...', 'Woka Twi?', 'Mente aseɛ', 'San ka bio'
  ],
  eng: [
    'Good morning', 'Good afternoon', 'I am fine', 'Thank you', 'Goodbye',
    'How are you?', 'Please', 'Come here', 'Go back', 'Yes',
    'No', 'My name is...', 'Do you speak English?', 'I don\'t understand', 'Say it again'
  ]
};

function getPhrases(lang) {
  return QUICK_PHRASES[lang] || QUICK_PHRASES['eng'];
}

const TranslatorDashboard = () => {
  const {
    isRecording, isProcessing, isTranslating,
    transcription, translation,
    partialTranscription,
    error, setError, audioLevel, recordingDuration, confidence,
    sourceLang, targetLang, detectedLang,
    inputText, setInputText,
    dailyCount,
    isEditing, editText, setEditText,
    setLanguages,
    setTranscription, setIsTranslating, setTranslation,
    startRecording, stopRecording, cancelRecording, clearResults,
    directTranslateText,
    startEditing, saveEdit, cancelEdit,
    formatDuration
  } = useStreamingTranslation();

  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState(null);
  const [initProgress, setInitProgress] = useState({ loading: true, model: 'speech', speechPercent: 0, translationPercent: 0 });
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({ autoTranslate: true, showConfidence: false });
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [history, setHistory] = useState(loadHistory);
  const [showHistory, setShowHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyNote, setHistoryNote] = useState({ id: null, text: '' });
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showOfflineBanner, setShowOfflineBanner] = useState(true);
  const [theme, setThemeState] = useState(() => localStorage.getItem(THEME_KEY) || 'auto');
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [cacheSize, setCacheSize] = useState(null);
  const [showLangPicker, setShowLangPicker] = useState(null);
  const [textInputActive, setTextInputActive] = useState(false);
  const [isTranslatingText, setIsTranslatingText] = useState(false);
  const [showQuickPhrases, setShowQuickPhrases] = useState(false);
  const [sourceCollapsed, setSourceCollapsed] = useState(false);
  const [notifiedReady, setNotifiedReady] = useState(false);

  const transcriptionRef = useRef(null);
  const translationRef = useRef(null);
  const editInputRef = useRef(null);
  const utteranceRef = useRef(null);
  const initRef = useRef(false);

  // Resolved theme
  const resolvedTheme = theme === 'auto' ? (systemPrefersDark ? 'dark' : 'light') : theme;

  // System theme listener
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const h = (e) => setSystemPrefersDark(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    localStorage.setItem(THEME_KEY, theme);
  }, [resolvedTheme, theme]);

  // Notification when models loaded
  useEffect(() => {
    if (isInitialized && !notifiedReady && Notification.permission !== 'denied') {
      setTimeout(() => setNotifiedReady(true), 0);
      if (Notification.permission === 'granted') {
        new Notification('Fred Delangua', { body: '✅ Models ready — start translating!', icon: '/icons/icon-72x72.png' });
      } else if (Notification.permission === 'default') {
        Notification.requestPermission().then(p => {
          if (p === 'granted') new Notification('Fred Delangua', { body: '✅ Models ready — start translating!', icon: '/icons/icon-72x72.png' });
        });
      }
    }
  }, [isInitialized, notifiedReady]);

  // Online/Offline
  useEffect(() => {
    const h1 = () => { setIsOnline(true); setShowOfflineBanner(false); };
    const h2 = () => { setIsOnline(false); setShowOfflineBanner(true); };
    window.addEventListener('online', h1); window.addEventListener('offline', h2);
    return () => { window.removeEventListener('online', h1); window.removeEventListener('offline', h2); };
  }, []);

  // History auto-save
  useEffect(() => {
    if (transcription && translation && !isTranslating && !isRecording && !isTranslatingText) {
      saveHistory({ id: Date.now(), source: transcription, target: translation, sourceLang, targetLang, confidence, timestamp: new Date().toISOString(), note: '' });
      setTimeout(() => setHistory(loadHistory()), 0);
    }
  }, [translation, isTranslating, isRecording, isTranslatingText, confidence, sourceLang, targetLang, transcription]);

  // Auto-scroll & focus edit
  useEffect(() => { if (transcriptionRef.current) transcriptionRef.current.scrollTop = transcriptionRef.current.scrollHeight; }, [transcription]);
  useEffect(() => { if (translationRef.current) translationRef.current.scrollTop = translationRef.current.scrollHeight; }, [translation]);
  useEffect(() => { if (isEditing && editInputRef.current) editInputRef.current.focus(); }, [isEditing]);
  useEffect(() => () => { speechSynthesis.cancel(); }, []);

  // Progress events
  useEffect(() => {
    const h1 = (e) => setInitProgress(p => ({ ...p, model: 'speech', speechPercent: e.detail.progress }));
    const h2 = (e) => setInitProgress(p => ({ ...p, model: 'translation', translationPercent: e.detail.progress }));
    window.addEventListener('modelProgress', h1); window.addEventListener('translationModelProgress', h2);
    return () => { window.removeEventListener('modelProgress', h1); window.removeEventListener('translationModelProgress', h2); };
  }, []);

  const initializeModels = useCallback(async () => {
    setInitProgress({ loading: true, model: 'speech', speechPercent: 0, translationPercent: 0 });
    setInitError(null); setIsInitialized(false); setNotifiedReady(false);
    try {
      await speechProcessor.initialize();
      setInitProgress(p => ({ ...p, model: 'translation', speechPercent: 100, translationPercent: 0 }));
      await translator.initialize();
      setInitProgress(p => ({ ...p, model: 'done', translationPercent: 100 }));
      setIsInitialized(true);
    } catch (err) { setInitError(err.message || 'Failed'); setInitProgress(p => ({ ...p, loading: false })); }
  }, []);
  useEffect(() => { if (!initRef.current) { initRef.current = true; initializeModels(); } }, [initializeModels]);

  useEffect(() => { if (isInitialized) modelLoader.getCacheSize().then(s => setCacheSize(s)); }, [isInitialized]);

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); if (isInitialized && !isProcessing) isRecording ? stopRecording() : startRecording(); }
      if (e.code === 'Escape') { if (isEditing) { e.preventDefault(); cancelEdit(); } else if (isRecording) { e.preventDefault(); cancelRecording(); } }
      if (e.code === 'KeyK' && e.ctrlKey && !isRecording && !isProcessing) { e.preventDefault(); clearResults(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isInitialized, isProcessing, isRecording, isEditing, startRecording, stopRecording, cancelRecording, clearResults, cancelEdit]);

  // TTS
  const handleSpeak = useCallback((text) => {
    if (!text || !window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const langMap = { eng: 'en-US', fra: 'fr-FR', spa: 'es-ES' };
    u.lang = langMap[targetLang] || 'en-US';
    u.rate = 0.9;
    utteranceRef.current = u;
    setIsSpeaking(true);
    u.onend = () => setIsSpeaking(false);
    u.onerror = () => setIsSpeaking(false);
    speechSynthesis.speak(u);
  }, [targetLang]);

  // Language
  const handleSourceLangChange = (code) => { setLanguages(code, targetLang); setShowLangPicker(null); clearResults(); };
  const handleTargetLangChange = (code) => { setLanguages(sourceLang, code); setShowLangPicker(null); clearResults(); };
  const targetLangOptions = showLangPicker === 'target' ? TARGET_LANGS : SUPPORTED_LANGS;

  // Text translate
  const handleTextTranslate = async () => {
    if (!inputText.trim()) return;
    setIsTranslatingText(true);
    try { await directTranslateText(inputText.trim()); }
    catch (err) { setError(err.message); }
    setIsTranslatingText(false);
  };

  // Quick phrase
  const handleQuickPhrase = async (phrase) => {
    if (textInputActive) {
      setInputText(phrase);
    } else {
      clearResults();
      setTranscription(phrase);
      setIsTranslating(true);
      try {
        const result = await translator.translateText(phrase, sourceLang === 'auto' ? (detectedLang || 'twi') : sourceLang, targetLang, { maxLength: 512, numBeams: 5 });
        if (result && result.translatedText) setTranslation(result.translatedText);
      } catch (err) { setError(err.message); }
      setIsTranslating(false);
    }
  };

  // Share / Export
  const handleShare = async () => {
    const text = `Translation (${getLangInfo(sourceLang).name} → ${getLangInfo(targetLang).name}):\n\n"${translation}"`;
    if (navigator.share) { try { await navigator.share({ title: 'Translation', text }); } catch { /* no-op */ } }
    else { await navigator.clipboard?.writeText(text); alert('Copied!'); }
  };
  const handleExport = () => {
    const content = `Fred Delangua Translation\n${new Date().toLocaleString()}\n\n${sourceInfo.name}: ${transcription}\n\n${targetInfo.name}: ${translation}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `translation-${Date.now()}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  // Cache
  const handleClearCache = async () => {
    if (confirm('Clear cached AI models? (~1.3GB)')) { await modelLoader.clearCache(); setCacheSize(0); }
  };
  const formatBytes = (b) => b ? (b > 1e9 ? `${(b/1e9).toFixed(1)} GB` : `${(b/1e6).toFixed(0)} MB`) : '?';

  // History note
  const handleNoteSave = (id) => {
    updateHistoryNote(id, historyNote.text);
    setHistoryNote({ id: null, text: '' });
    setHistory(loadHistory());
  };

  // Filtered history
  const filteredHistory = historySearch
    ? history.filter(e => e.source.toLowerCase().includes(historySearch.toLowerCase()) || e.target.toLowerCase().includes(historySearch.toLowerCase()) || (e.note && e.note.toLowerCase().includes(historySearch.toLowerCase())))
    : history;

  // Theme cycle: auto → light → dark → auto
  const cycleTheme = () => setThemeState(t => t === 'auto' ? 'light' : t === 'light' ? 'dark' : 'auto');
  const themeIcon = theme === 'auto' ? '🔄' : theme === 'dark' ? '☀️' : '🌙';
  const themeLabel = theme === 'auto' ? 'Auto' : '';

  const sourceInfo = getLangInfo(sourceLang);
  const targetInfo = getLangInfo(targetLang);
  const actualSource = sourceLang === 'auto' && detectedLang ? getLangInfo(detectedLang) : sourceInfo;
  const phrases = getPhrases(sourceLang === 'auto' ? 'eng' : sourceLang);

  return (
    <div className="translator-dashboard">
      {/* Offline Banner */}
      {!isOnline && showOfflineBanner && (
        <div className="offline-banner"><span className="offline-icon">🔌</span><span>You're offline — cached models still work</span><button className="offline-dismiss" onClick={() => setShowOfflineBanner(false)}>✖</button></div>
      )}

      {/* Header */}
      <header className="dashboard-header">
        <div className="header-left">
          <h1 className="app-title"><span className="title-icon">🌍</span> Fred Delangua</h1>
          {dailyCount > 0 && <span className="daily-badge">Today: {dailyCount}</span>}
        </div>
        <div className="header-right">
          <button className="theme-btn" onClick={cycleTheme} title={`Theme: ${theme}`}>{themeIcon}{themeLabel}</button>
          <button className={`history-btn ${showHistory ? 'active' : ''}`} onClick={() => setShowHistory(!showHistory)}>
            📜 {history.length > 0 && <span className="history-count">{history.length}</span>}
          </button>
          <button className="settings-button" onClick={() => setShowSettings(!showSettings)}>⚙️</button>
          <StatusIndicator isRecording={isRecording} isProcessing={isProcessing} isTranslating={isTranslating || isTranslatingText} isInitialized={isInitialized} />
        </div>
      </header>

      {/* Language & Mode Bar */}
      <div className="lang-bar">
        <div className="lang-selectors">
          <button className="lang-chip source" onClick={() => setShowLangPicker(s => s === 'source' ? null : 'source')}>
            {actualSource.flag} {actualSource.name}{sourceLang === 'auto' && detectedLang ? ` (${getLangInfo(detectedLang).name})` : ''}
          </button>
          <span className="lang-arrow">→</span>
          <button className="lang-chip target" onClick={() => setShowLangPicker(s => s === 'target' ? null : 'target')}>
            {targetInfo.flag} {targetInfo.name}
          </button>
        </div>
        <div className="right-actions">
          <button className={`quick-btn ${showQuickPhrases ? 'active' : ''}`} onClick={() => setShowQuickPhrases(!showQuickPhrases)} title="Quick phrases">💬</button>
          <div className="mode-tabs">
            <button className={`mode-tab ${!textInputActive ? 'active' : ''}`} onClick={() => setTextInputActive(false)}>🎤</button>
            <button className={`mode-tab ${textInputActive ? 'active' : ''}`} onClick={() => setTextInputActive(true)}>⌨️</button>
          </div>
        </div>
      </div>

      {/* Quick Phrases */}
      {showQuickPhrases && (
        <div className="quick-phrases-bar">
          {phrases.map((p, i) => (
            <button key={i} className="phrase-chip" onClick={() => handleQuickPhrase(p)}>{p}</button>
          ))}
        </div>
      )}

      {/* Language Picker */}
      {showLangPicker && (
        <div className="lang-picker-overlay" onClick={() => setShowLangPicker(null)}>
          <div className="lang-picker" onClick={e => e.stopPropagation()}>
            <h3>Select {showLangPicker === 'source' ? 'source' : 'target'} language</h3>
            <div className="lang-list">
              {targetLangOptions.map(l => (
                <button key={l.code} className="lang-option" onClick={() => showLangPicker === 'source' ? handleSourceLangChange(l.code) : handleTargetLangChange(l.code)}>
                  {l.flag} {l.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Settings */}
      {showSettings && (
        <div className="settings-panel">
          <div className="settings-group">
            <label className="setting-item"><input type="checkbox" checked={settings.autoTranslate} onChange={e => setSettings(p => ({...p, autoTranslate: e.target.checked}))} /> Auto-translate</label>
            <label className="setting-item"><input type="checkbox" checked={settings.showConfidence} onChange={e => setSettings(p => ({...p, showConfidence: e.target.checked}))} /> Confidence scores</label>
            <div className="setting-item cache-item">
              <span>Models cached: <strong>{formatBytes(cacheSize)}</strong></span>
              {cacheSize > 0 && <button className="clear-cache-btn" onClick={handleClearCache}>🗑 Clear</button>}
            </div>
          </div>
        </div>
      )}

      {/* History */}
      {showHistory && (
        <div className="history-panel">
          <div className="history-header">
            <h3>History ({history.length})</h3>
            <div className="history-header-actions">
              <input className="history-search" placeholder="🔍 Search..." value={historySearch} onChange={e => setHistorySearch(e.target.value)} />
              {history.length > 0 && <button className="clear-history-btn" onClick={() => { clearHistoryStorage(); setHistory([]); }}>🗑</button>}
            </div>
          </div>
          {filteredHistory.length === 0 ? <p className="history-empty">{historySearch ? 'No matches' : 'No translations yet'}</p> : (
            <div className="history-list">
              {filteredHistory.map(e => (
                <div key={e.id} className="history-item-wrapper">
                  <div className="history-item" onClick={() => { setLanguages(e.sourceLang, e.targetLang); setShowHistory(false); }}>
                    <div className="history-pair">
                      <span className="history-source">{getLangInfo(e.sourceLang).flag} {e.source.length > 50 ? e.source.slice(0,50)+'...' : e.source}</span>
                      <span className="history-arrow">→</span>
                      <span className="history-target">{getLangInfo(e.targetLang).flag} {e.target.length > 50 ? e.target.slice(0,50)+'...' : e.target}</span>
                    </div>
                    <span className="history-time">{new Date(e.timestamp).toLocaleTimeString()}</span>
                  </div>
                  {e.note && <span className="history-note-badge" onClick={(ev) => { ev.stopPropagation(); setHistoryNote({ id: e.id, text: e.note }); }}>📝 {e.note}</span>}
                  {!e.note && (
                    <button className="history-note-add" onClick={(ev) => { ev.stopPropagation(); setHistoryNote({ id: e.id, text: '' }); }} title="Add note">+ Note</button>
                  )}
                  {historyNote.id === e.id && (
                    <div className="history-note-editor" onClick={ev => ev.stopPropagation()}>
                      <input value={historyNote.text} onChange={ev => setHistoryNote(p => ({...p, text: ev.target.value}))} placeholder="Add a note..." onKeyDown={ev => ev.key === 'Enter' && handleNoteSave(e.id)} />
                      <button onClick={() => handleNoteSave(e.id)}>Save</button>
                      <button onClick={() => setHistoryNote({ id: null, text: '' })}>✖</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main */}
      <div className="dashboard-content">
        {/* Controls */}
        <div className="controls-section">
          <div className="controls-group">
            {!textInputActive ? (
              <>
                <button className={`record-button ${isRecording ? 'recording' : ''}`} onClick={() => isRecording ? stopRecording() : startRecording()} disabled={!isInitialized || isProcessing}>
                  {isRecording ? <><span className="button-icon">⏹</span> Stop</> : <><span className="button-icon">🎤</span> Record</>}
                </button>
                {isRecording && <button className="cancel-button" onClick={cancelRecording}>✖ Cancel</button>}
                <button className="clear-button" onClick={clearResults} disabled={isRecording || isProcessing}>🗑 Clear</button>
              </>
            ) : (
              <button className="clear-button" onClick={clearResults} disabled={isTranslatingText}>🗑 Clear</button>
            )}
            {transcription && <button className="collapse-btn" onClick={() => setSourceCollapsed(!sourceCollapsed)} title={sourceCollapsed ? 'Show source' : 'Hide source'}>{sourceCollapsed ? '📖 Show' : '📕 Hide'} Source</button>}
          </div>
          {isRecording && (
            <div className="recording-info">
              <span className="recording-dot">🔴</span>
              <span className="recording-time">{formatDuration(recordingDuration)}</span>
              <div className="audio-level-bar"><div className="audio-level-fill" style={{width:`${audioLevel}%`}}></div></div>
            </div>
          )}
          {(isProcessing || isTranslating || isTranslatingText) && (
            <div className="processing-indicators">
              {isProcessing && <span className="processing-badge"><span className="spinner-small"></span> Transcribing...</span>}
              {(isTranslating || isTranslatingText) && <span className="processing-badge"><span className="spinner-small"></span> Translating...</span>}
            </div>
          )}
        </div>

        {/* Visualizer */}
        {isRecording && <div className="visualizer-section"><AudioVisualizer audioLevel={audioLevel} isRecording={isRecording} /></div>}

        {/* Text Input */}
        {textInputActive && (
          <div className="text-input-section">
            <textarea className="text-input-area" placeholder={`Type ${sourceInfo.name} text...`} value={inputText} onChange={e => setInputText(e.target.value)} rows={4} disabled={isTranslatingText} />
            <button className="translate-text-btn" onClick={handleTextTranslate} disabled={!inputText.trim() || isTranslatingText || !isInitialized}>
              {isTranslatingText ? <><span className="spinner-small"></span> Translating...</> : <>⟳ Translate to {targetInfo.name}</>}
            </button>
          </div>
        )}

        {/* Error */}
        {error && <div className="error-display"><span className="error-icon">⚠️</span><span className="error-message">{error}</span><button className="error-dismiss" onClick={() => setError(null)}>✖</button></div>}

        {/* Translation Grid */}
        <div className="translation-grid">
          {!sourceCollapsed && (
            <div className="translation-panel source-panel">
              <div className="panel-header">
                <span className="panel-icon">{actualSource.flag}</span>
                <h2 className="panel-title">{actualSource.name} (Source){sourceLang === 'auto' && detectedLang ? ` — detected ${getLangInfo(detectedLang).name}` : ''}</h2>
                {partialTranscription && isRecording && <span className="live-indicator">● Live</span>}
              </div>
              <div className="panel-content" ref={transcriptionRef}>
                {isEditing ? (
                  <div className="edit-mode">
                    <textarea className="edit-textarea" ref={editInputRef} value={editText} onChange={e => setEditText(e.target.value)} rows={6} />
                    <div className="edit-actions">
                      <button className="edit-save-btn" onClick={() => saveEdit(editText)}>✅ Save & Retranslate</button>
                      <button className="edit-cancel-btn" onClick={cancelEdit}>✖ Cancel</button>
                    </div>
                  </div>
                ) : transcription ? (
                  <>
                    <div className="transcription-text">{transcription}</div>
                    {settings.showConfidence && confidence !== null && <div className="confidence-badge">{Math.round((confidence||0)*100)}% confidence</div>}
                    {partialTranscription && isRecording && <div className="partial-text"><span className="partial-indicator">▍</span>{partialTranscription}</div>}
                    <button className="edit-transcription-btn" onClick={startEditing} title="Edit transcription">✏️ Edit</button>
                  </>
                ) : isRecording ? <div className="placeholder-text"><span className="pulse-dot"></span>Listening...</div>
                : textInputActive ? <div className="placeholder-text"><span className="placeholder-icon">⌨️</span>Type above and translate</div>
                : <div className="placeholder-text"><span className="placeholder-icon">🎙️</span>Speak or start recording</div>}
              </div>
              {transcription && !isEditing && (
                <div className="panel-footer">
                  <span className="word-count">{transcription.split(/\s+/).filter(w=>w).length} words</span>
                  <button className="copy-button" onClick={() => navigator.clipboard?.writeText(transcription)}>📋 Copy</button>
                </div>
              )}
            </div>
          )}

          <div className="translation-panel target-panel" style={sourceCollapsed ? {gridColumn: '1 / -1'} : {}}>
            <div className="panel-header">
              <span className="panel-icon">{targetInfo.flag}</span>
              <h2 className="panel-title">{targetInfo.name} (Translation)</h2>
              {(isTranslating || isTranslatingText) && <span className="translating-indicator">⟳ Translating...</span>}
            </div>
            <div className="panel-content" ref={translationRef}>
              {translation ? (
                <div className="translation-text">{translation}</div>
              ) : isTranslating || isTranslatingText ? <div className="placeholder-text"><span className="loading-dots">Translating</span></div>
              : transcription ? <div className="placeholder-text translating"><span className="translate-icon">⟳</span>Ready</div>
              : <div className="placeholder-text"><span className="placeholder-icon">📝</span>Translation here</div>}
            </div>
            {translation && (
              <div className="panel-footer">
                <span className="word-count">{translation.split(/\s+/).filter(w=>w).length} words</span>
                <div className="footer-actions">
                  <button className="copy-button" onClick={() => navigator.clipboard?.writeText(translation)}>📋</button>
                  {isSpeaking ? <button className="speak-button active" onClick={() => { speechSynthesis.cancel(); setIsSpeaking(false); }}>⏹</button>
                  : <button className="speak-button" onClick={() => handleSpeak(translation)}>🔊</button>}
                  <button className="copy-button" onClick={handleShare} title="Share">📤</button>
                  <button className="copy-button" onClick={handleExport} title="Download">💾</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Loading */}
        {!isInitialized && initProgress.loading && (
          <div className="loading-overlay">
            <div className="loading-card">
              <div className="loading-spinner"></div>
              <h2 className="loading-title">{initProgress.model === 'speech' ? 'Loading Speech Model...' : 'Loading Translation Model...'}</h2>
              <p className="loading-subtitle">{initProgress.model === 'speech' ? 'Whisper Tiny (~150MB)' : 'NLLB 600M (~1.2GB)'}</p>
              <div className="progress-bar"><div className="progress-fill" style={{width: initProgress.model==='speech'?`${initProgress.speechPercent}%`:`${initProgress.translationPercent}%`}}></div></div>
              <span className="progress-text">{initProgress.model==='speech'?Math.round(initProgress.speechPercent):Math.round(initProgress.translationPercent)}%</span>
              <p className="loading-note">First-time setup — models cached for offline use</p>
            </div>
          </div>
        )}
        {initError && <div className="error-display init-error"><span className="error-icon">⚠️</span><div className="error-content"><span className="error-message">{initError}</span><button className="retry-button" onClick={initializeModels}>🔄 Retry</button></div></div>}

        {/* Stats */}
        <div className="stats-bar">
          <div className="stat-item"><span className="stat-label">Status</span><span className={`stat-value ${isInitialized?'ready':initError?'error':'loading'}`}>{isInitialized?'✅ Ready':initError?'❌ Failed':'⏳ Loading...'}</span></div>
          {dailyCount > 0 && <div className="stat-item"><span className="stat-label">Today</span><span className="stat-value">{dailyCount} translations</span></div>}
          {!isOnline && <div className="stat-item"><span className="stat-label">Network</span><span className="stat-value offline-stat">🔴 Offline</span></div>}
          {transcription && <div className="stat-item"><span className="stat-label">Source</span><span className="stat-value">{transcription.length} chars</span></div>}
          {translation && <div className="stat-item"><span className="stat-label">Translation</span><span className="stat-value">{translation.length} chars</span></div>}
          {isRecording && <div className="stat-item"><span className="stat-label">Duration</span><span className="stat-value recording-time">{formatDuration(recordingDuration)}</span></div>}
        </div>
        <div className="shortcuts-hint"><kbd>Space</kbd> Toggle · <kbd>Esc</kbd> Cancel · <kbd>Ctrl+K</kbd> Clear</div>
      </div>
    </div>
  );
};

export default TranslatorDashboard;