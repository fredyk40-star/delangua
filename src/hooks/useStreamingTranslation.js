import { useState, useEffect, useRef, useCallback } from 'react';
import { speechProcessor } from '../services/speechProcessor';
import { translator } from '../services/translator';

const DAILY_KEY = 'fred-delangua-daily';

function getDailyCount() {
  try {
    const d = JSON.parse(localStorage.getItem(DAILY_KEY) || '{}');
    const today = new Date().toDateString();
    return d.date === today ? d.count : 0;
  } catch { return 0; }
}
function incrementDaily() {
  try {
    const today = new Date().toDateString();
    const count = getDailyCount() + 1;
    localStorage.setItem(DAILY_KEY, JSON.stringify({ date: today, count }));
    return count;
  } catch { return 0; }
}

export const useStreamingTranslation = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [translation, setTranslation] = useState('');
  const [partialTranscription, setPartialTranscription] = useState('');
  const [partialTranslation, setPartialTranslation] = useState('');
  const [error, setError] = useState(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [confidence, setConfidence] = useState(null);
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('eng');
  const [inputText, setInputText] = useState('');
  const [dailyCount, setDailyCount] = useState(getDailyCount);
  const [detectedLang, setDetectedLang] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');

  const isRecordingRef = useRef(false);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerIntervalRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const lastAudioLevelTimeRef = useRef(0);
  const fullTextRef = useRef('');
  const fullTranslationRef = useRef('');

  const setLanguages = useCallback((source, target) => {
    setSourceLang(source);
    setTargetLang(target);
  }, []);

  const startEditing = useCallback(() => {
    setEditText(fullTextRef.current);
    setIsEditing(true);
  }, []);

  const translateText = useCallback(async (text) => {
    if (!text || !text.trim()) return;
    try {
      setIsTranslating(true);
      const srcLang = sourceLang === 'auto' ? (detectedLang || 'twi') : sourceLang;
      const result = await translator.translateText(text, srcLang, targetLang, { maxLength: 512, numBeams: 3 });
      if (result && result.translatedText) {
        fullTranslationRef.current = result.translatedText;
        setTranslation(result.translatedText);
        setPartialTranslation(result.translatedText);
        incrementDaily();
        setDailyCount(getDailyCount());
      }
      setIsTranslating(false);
    } catch (err) { console.error('Translation error:', err); setIsTranslating(false); }
  }, [sourceLang, targetLang, detectedLang]);

  const saveEdit = useCallback(async (newText) => {
    fullTextRef.current = newText;
    setTranscription(newText);
    setIsEditing(false);
    if (newText.trim()) {
      setIsTranslating(true);
      try {
        const srcLang = sourceLang === 'auto' ? (detectedLang || 'twi') : sourceLang;
        const result = await translator.translateText(newText, srcLang, targetLang, { maxLength: 512, numBeams: 5 });
        if (result && result.translatedText) {
          fullTranslationRef.current = result.translatedText;
          setTranslation(result.translatedText);
        }
      } catch (e) { console.error('Re-translation error:', e); }
      setIsTranslating(false);
      incrementDaily();
      setDailyCount(getDailyCount());
    }
  }, [sourceLang, targetLang, detectedLang]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditText('');
  }, []);

  const monitorAudioLevel = () => {
    if (!analyserRef.current) return;
    const SILENCE_THRESHOLD = 8;
    const SILENCE_DURATION = 3000;
    const updateLevel = () => {
      if (!isRecordingRef.current) return;
      const a = analyserRef.current;
      const d = dataArrayRef.current;
      if (a && d) {
        a.getByteFrequencyData(d);
        const avg = d.reduce((x, y) => x + y, 0) / d.length;
        const level = Math.min((avg / 128) * 100, 100);
        setAudioLevel(level);
        const now = Date.now();
        if (level > SILENCE_THRESHOLD) {
          lastAudioLevelTimeRef.current = now;
          if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
        } else if (!silenceTimerRef.current && now - lastAudioLevelTimeRef.current > SILENCE_DURATION) {
          silenceTimerRef.current = setTimeout(() => {
            if (isRecordingRef.current && mediaRecorderRef.current) mediaRecorderRef.current.stop();
          }, 500);
        }
      }
      requestAnimationFrame(updateLevel);
    };
    updateLevel();
  };

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setTranscription('');
      setTranslation('');
      setPartialTranscription('');
      setPartialTranslation('');
      setConfidence(null);
      setDetectedLang(null);
      setIsEditing(false);
      fullTextRef.current = '';
      fullTranslationRef.current = '';
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 16000, channelCount: 1 }
      });
      streamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
      source.connect(analyser);

      const mimeTypes = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4;codecs=opus'];
      const mimeType = mimeTypes.find(t => MediaRecorder.isTypeSupported(t)) || '';
      const mediaRecorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 });
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorder.start(500);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      isRecordingRef.current = true;

      let seconds = 0;
      setRecordingDuration(0);
      timerIntervalRef.current = setInterval(() => { seconds++; setRecordingDuration(seconds); }, 1000);
      lastAudioLevelTimeRef.current = Date.now();
      monitorAudioLevel();
    } catch (err) { setError(err.message); throw err; }
  }, []);

  const directTranslateText = useCallback(async (text) => {
    if (!text || !text.trim()) return;
    setTranscription(text);
    setPartialTranscription('');
    setIsEditing(false);
    setError(null);
    setIsTranslating(true);
    const srcLang = sourceLang === 'auto' ? (detectedLang || 'twi') : sourceLang;
    const result = await translator.translateText(text, srcLang, targetLang, { maxLength: 512, numBeams: 5 });
    if (result && result.translatedText) {
      fullTranslationRef.current = result.translatedText;
      setTranslation(result.translatedText);
      incrementDaily();
      setDailyCount(getDailyCount());
    }
    setIsTranslating(false);
    return result;
  }, [sourceLang, targetLang, detectedLang]);

  const stopRecording = useCallback(async () => {
    return new Promise((resolve) => {
      if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
      if (!mediaRecorderRef.current || !isRecording) { resolve(); return; }
      if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
      mediaRecorderRef.current.onstop = async () => {
        if (chunksRef.current.length > 0 && !isProcessing) {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          try {
            setIsProcessing(true);
            const lang = sourceLang === 'auto' ? undefined : sourceLang;
            const result = await speechProcessor.transcribeAudio(blob, { language: lang, return_timestamps: true });
            if (result && result.text) {
              if (result.confidence) setConfidence(result.confidence);
              if (result.language) setDetectedLang(result.language);
              const final = result.text.trim();
              if (final && !fullTextRef.current.includes(final)) {
                const updated = fullTextRef.current ? `${fullTextRef.current} ${final}` : final;
                fullTextRef.current = updated;
                setTranscription(updated);
                await translateText(updated);
              }
            }
          } catch (err) { console.error('Final error:', err); }
          setIsProcessing(false);
        }
        if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') { audioContextRef.current.close(); audioContextRef.current = null; }
        setIsRecording(false); isRecordingRef.current = false; setAudioLevel(0); setRecordingDuration(0);
        resolve();
      };
      mediaRecorderRef.current.stop();
    });
  }, [isRecording, isProcessing, sourceLang, translateText]);

  const cancelRecording = useCallback(() => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
    if (mediaRecorderRef.current) { mediaRecorderRef.current.onstop = null; mediaRecorderRef.current.stop(); }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') { audioContextRef.current.close(); audioContextRef.current = null; }
    setIsRecording(false); isRecordingRef.current = false; setAudioLevel(0); setRecordingDuration(0);
    setPartialTranscription(''); setPartialTranslation(''); setError(null);
  }, []);

  const clearResults = useCallback(() => {
    setTranscription(''); setTranslation(''); setPartialTranscription(''); setPartialTranslation('');
    setConfidence(null); setInputText(''); setIsEditing(false); setEditText('');
    fullTextRef.current = ''; fullTranslationRef.current = '';
    chunksRef.current = []; setError(null);
  }, []);

  useEffect(() => () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (mediaRecorderRef.current && isRecording) mediaRecorderRef.current.stop();
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') audioContextRef.current.close();
  }, [isRecording]);

  return {
    isRecording, isProcessing, isTranslating,
    transcription, translation,
    partialTranscription, partialTranslation,
    error, setError,
    audioLevel, recordingDuration, confidence,
    sourceLang, targetLang, detectedLang,
    inputText, setInputText,
    dailyCount,
    isEditing, editText, setEditText,
    setLanguages,
    startRecording, stopRecording, cancelRecording, clearResults,
    directTranslateText,
    startEditing, saveEdit, cancelEdit,
    formatDuration: (s) => {
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return `${m}:${sec.toString().padStart(2, '0')}`;
    }
  };
};

export default useStreamingTranslation;
