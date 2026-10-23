import React, { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Clipboard } from '@capacitor/clipboard';
import { SpeechRecognition as CapSpeechRecognition } from '@capacitor-community/speech-recognition';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Input } from './ui/input';
import { LIVE_VOICE_MODELS, DEFAULT_LIVE_WEBSOCKET_URL, isGeminiLiveModel } from '../lib/gemini';
import { 
  Mic, MicOff, Loader2, Sparkles, AlertCircle, RefreshCw, Volume2, MessageSquare,
  Copy, FileText, Trash2, Check, X, AlertTriangle, ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { SIERRA_CORE_PERSONA, CONTENT_MODES } from '../lib/persona';
import { streamChat, getNativeStoredKeys } from '../lib/providers';
import { addDebugLog, clearDebugLogs, useDebugLogs, formatAllDebugLogsForCopy } from '../lib/debugLogStore';
import { getContentMode, useContentMode } from '../lib/contentModeStore';

interface TranscriptItem {
  id: string;
  sender: 'user' | 'sierra';
  text: string;
  timestamp: number;
}

import { formatDebugLogs, type DebugLogEvent } from '../lib/debugLogs';
export { formatDebugLogs, type DebugLogEvent };

export default function LiveVoice() {
  const [user] = useAuthState(auth);
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [mode, setMode] = useState<'continuous' | 'push'>('continuous');
  const [isPushing, setIsPushing] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const [userSpeechDetected, setUserSpeechDetected] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<'Aoede' | 'Zephyr' | 'Kore' | 'Puck'>('Aoede');
  const [voiceModel, setVoiceModel] = useState<string>(() => {
    return (typeof localStorage !== 'undefined' && localStorage.getItem('sierra_live_voice_model')) || 'gemini-3.8-live';
  });
  const [customVoiceModel, setCustomVoiceModel] = useState<string>(() => {
    return (typeof localStorage !== 'undefined' && localStorage.getItem('sierra_live_voice_custom_model')) || '';
  });
  const [liveWsEndpoint, setLiveWsEndpoint] = useState<string>(() => {
    return (typeof localStorage !== 'undefined' && localStorage.getItem('sierra_live_voice_endpoint')) || DEFAULT_LIVE_WEBSOCKET_URL;
  });
  // Persistent In-Memory Debug Logs (survives tab switching, capped at 2000 entries)
  const debugLogs = useDebugLogs();
  const [contentMode, setContentMode] = useContentMode();
  const [voiceInputEngine, setVoiceInputEngine] = useState<'raw_streaming' | 'native_recognizer'>(() => {
    return (typeof localStorage !== 'undefined' && (localStorage.getItem('sierra_voice_input_engine') as any)) || 'raw_streaming';
  });

  // Raw Audio Capture (AudioWorklet + 16kHz PCM streaming)
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAudioContextRef = useRef<AudioContext | null>(null);
  const micWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const micScriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const isMicStreamingRef = useRef<boolean>(false);
  const liveWsUserTextAccumulatedRef = useRef<string>('');
  const liveWsCurrentUserIdRef = useRef<string | null>(null);

  const [isDebugLogOpen, setIsDebugLogOpen] = useState(false);
  const [isConfigExpanded, setIsConfigExpanded] = useState(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isFallbackModalOpen, setIsFallbackModalOpen] = useState(false);
  const [fallbackLogText, setFallbackLogText] = useState('');
  const fallbackTextareaRef = useRef<HTMLTextAreaElement>(null);
  const debugScrollRef = useRef<HTMLDivElement>(null);
  const logTimestampsRef = useRef<Map<string, number>>(new Map());

  const withNativeTimeout = async <T,>(
    promise: Promise<T>,
    ms: number = 2000,
    fallbackValue?: T,
    opName: string = 'Native operation'
  ): Promise<T | undefined> => {
    let timeoutId: any = null;
    let didTimeout = false;
    const timeoutPromise = new Promise<T | undefined>((resolve) => {
      timeoutId = setTimeout(() => {
        didTimeout = true;
        console.warn(`[Native STT] ${opName} timed out after ${ms}ms, continuing`);
        addDebugLog('STT:Timeout', `${opName} timed out after ${ms}ms`);
        resolve(fallbackValue);
      }, ms);
    });

    try {
      const result = await Promise.race([
        promise.then((res) => {
          if (!didTimeout) {
            console.log(`[Native STT] ${opName} completed normally`);
          }
          return res;
        }),
        timeoutPromise
      ]);
      return result;
    } catch (err: any) {
      console.warn(`[Native STT] ${opName} threw error:`, err);
      addDebugLog('STT:Error', `${opName} error: ${err?.message || String(err)}`);
      return fallbackValue;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  };

  useEffect(() => {
    debugScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [debugLogs]);

  useEffect(() => {
    if (isFallbackModalOpen && fallbackTextareaRef.current) {
      fallbackTextareaRef.current.focus();
      fallbackTextareaRef.current.select();
    }
  }, [isFallbackModalOpen]);

  const copyDebugLogs = async (count?: number) => {
    if (debugLogs.length === 0) {
      toast.info("No debug events logged yet. Speak or tap the orb first.");
      return;
    }

    const textToCopy = formatDebugLogs(debugLogs, count);
    let copied = false;

    // 1. Native Capacitor Clipboard
    if (Capacitor.isNativePlatform()) {
      try {
        await Clipboard.write({ string: textToCopy });
        copied = true;
      } catch (nativeErr: any) {
        console.warn("[Clipboard] Capacitor Clipboard.write failed, falling back:", nativeErr);
      }
    }

    // 2. Browser Navigator Clipboard API
    if (!copied && typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(textToCopy);
        copied = true;
      } catch (webErr: any) {
        console.warn("[Clipboard] navigator.clipboard.writeText failed:", webErr);
      }
    }

    // 3. Fallback: execCommand('copy') with off-screen textarea
    if (!copied && typeof document !== 'undefined') {
      try {
        const tempTextArea = document.createElement('textarea');
        tempTextArea.value = textToCopy;
        tempTextArea.style.position = 'fixed';
        tempTextArea.style.left = '-9999px';
        tempTextArea.style.top = '0';
        tempTextArea.setAttribute('readonly', '');
        document.body.appendChild(tempTextArea);
        tempTextArea.focus();
        tempTextArea.select();
        copied = document.execCommand('copy');
        document.body.removeChild(tempTextArea);
      } catch (execErr: any) {
        console.warn("[Clipboard] document.execCommand('copy') failed:", execErr);
      }
    }

    if (copied) {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      toast.success("Debug log copied. Paste it into ChatGPT.");
    } else {
      toast.error("Could not write to clipboard automatically. Select and copy from the box below.");
      setFallbackLogText(textToCopy);
      setIsFallbackModalOpen(true);
    }
  };

  const handleClearConfirm = () => {
    clearDebugLogs();
    setShowClearConfirm(false);
    toast.info("Debug log cleared.");
  };

  const sessionRef = useRef<any>(null);
  const liveWsRef = useRef<any>(null);
  const liveWsReadyRef = useRef<boolean>(false);
  const liveWsConnectPromiseRef = useRef<Promise<any> | null>(null);
  const liveWsAudioReceivedRef = useRef<boolean>(false);
  const liveWsTextAccumulatedRef = useRef<string>('');
  const liveWsCurrentSierraIdRef = useRef<string | null>(null);
  const liveWsTurnCompleteRef = useRef<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const speechRecognitionRef = useRef<any>(null);
  const nativeListenerRef = useRef<any>(null);
  const nativeStateListenerRef = useRef<any>(null);
  const nativeListenersAttachedRef = useRef<boolean>(false);
  const isSettingUpListenersRef = useRef<boolean>(false);
  const sessionIdRef = useRef<number>(0);
  const currentCycleIdRef = useRef<number>(0);
  const cycleHandledRef = useRef<number>(0);
  const isStartingRef = useRef<boolean>(false);
  const isStartInFlightRef = useRef<boolean>(false);
  const isStoppingRef = useRef<boolean>(false);
  const isListeningRef = useRef<boolean>(false);
  const isNativeListeningRef = useRef<boolean>(false);
  const isSpeakingRef = useRef<boolean>(false);
  const isRespondingRef = useRef<boolean>(false);
  const isActiveRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  const hasLoggedPausedRef = useRef<boolean>(false);
  const clientErrorRecoveryCountRef = useRef<number>(0);
  const isRecoveringFromClientErrorRef = useRef<boolean>(false);
  const startupFailuresRef = useRef<number>(0);
  const emptyCycleCountRef = useRef<number>(0);
  const sessionRealStartTimeRef = useRef<number>(0);
  const sessionStartedTimeRef = useRef<number>(0);
  const sessionReadyTimeRef = useRef<number>(0);
  const hasReachedStartedRef = useRef<boolean>(false);
  const resumeGracePeriodUntilRef = useRef<number>(0);
  const recoveryStartedResolverRef = useRef<((value: boolean) => void) | null>(null);
  const startedConfirmationTimerRef = useRef<any>(null);
  const staleEventLoggedSessionRef = useRef<number>(-1);
  const transcriptsRef = useRef<TranscriptItem[]>([]);
  const currentTranscriptRef = useRef<string>('');
  const lastCommittedTextRef = useRef<string>('');
  const silenceTimerRef = useRef<any>(null);
  const pendingCommitTimerRef = useRef<any>(null);
  const cooldownTimerRef = useRef<any>(null);
  const retryTimerRef = useRef<any>(null);
  const recognitionTimeoutRef = useRef<any>(null);
  const consecutiveFailuresRef = useRef<number>(0);
  const committedSessionRef = useRef<number>(-1);
  const terminalHandledSessionRef = useRef<number>(-1);
  const utteranceCommitTimeRef = useRef<number>(0);
  const turnSentTimeRef = useRef<number>(0);
  const firstAudioReceivedTimeRef = useRef<number>(0);
  const lastCommitTimeRef = useRef<number>(0);
  const lastEndOfSpeechTimeRef = useRef<number>(0);
  const lastStopTimeRef = useRef<number>(0);
  const MAX_RECOGNITION_RETRIES = 3;
  const RECOGNITION_TIMEOUT_MS = 12000;
  const PLAYBACK_COOLDOWN_MS = 1200;

  // Keep refs synchronized with state
  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    transcriptsRef.current = transcripts;
  }, [transcripts]);

  // Auto-scroll transcript container
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  // Clean up Web Audio and media stream on unmount
  useEffect(() => {
    return () => {
      isNativeListeningRef.current = false;
      stopSession();
    };
  }, []);

  // Sync voice model and live endpoint to localStorage
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('sierra_live_voice_model', voiceModel);
      if (customVoiceModel.trim()) {
        localStorage.setItem('sierra_live_voice_custom_model', customVoiceModel.trim());
      } else {
        localStorage.removeItem('sierra_live_voice_custom_model');
      }
      localStorage.setItem('sierra_live_voice_endpoint', liveWsEndpoint.trim() || DEFAULT_LIVE_WEBSOCKET_URL);
    }
  }, [voiceModel, customVoiceModel, liveWsEndpoint]);

  const persistVoiceMessage = async (sender: 'user' | 'sierra', text: string) => {
    if (!text.trim() || !user) return;
    const effectiveModel = customVoiceModel.trim() || voiceModel || 'gemini-3.8-live';
    try {
      await addDoc(collection(db, `users/${user.uid}/sessions/live-voice-session/messages`), {
        role: sender === 'user' ? 'user' : 'model',
        content: text,
        timestamp: Date.now(),
        isVoice: true,
        modelName: `Sierra Live (${effectiveModel})`,
      });
    } catch (err) {
      console.warn("Could not save live voice transcript to Firestore:", err);
    }
  };

  const getBackoffDelay = (attempt: number): number => {
    // Exponential backoff for consecutive failures (500 ms, 1 s, 2 s, 4 s)
    if (attempt <= 1) return 500;
    if (attempt === 2) return 1000;
    if (attempt === 3) return 2000;
    return 4000;
  };

  const cancelAllTimers = () => {
    if (pendingCommitTimerRef.current) {
      clearTimeout(pendingCommitTimerRef.current);
      pendingCommitTimerRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (recognitionTimeoutRef.current) {
      clearTimeout(recognitionTimeoutRef.current);
      recognitionTimeoutRef.current = null;
    }
    if (startedConfirmationTimerRef.current) {
      clearTimeout(startedConfirmationTimerRef.current);
      startedConfirmationTimerRef.current = null;
    }
    if (recoveryStartedResolverRef.current) {
      recoveryStartedResolverRef.current(false);
      recoveryStartedResolverRef.current = null;
    }
  };

  const pauseListening = (reason: string) => {
    isPausedRef.current = true;
    setIsPaused(true);
    isListeningRef.current = false;
    isNativeListeningRef.current = false;
    isStartingRef.current = false;
    isStartInFlightRef.current = false;
    isRecoveringFromClientErrorRef.current = false;
    cancelAllTimers();
    if (Capacitor.isNativePlatform()) {
      isStoppingRef.current = true;
      withNativeTimeout(CapSpeechRecognition.stop(), 1500, undefined, 'CapSpeechRecognition.stop()')
        .catch(() => {})
        .finally(() => {
          isStoppingRef.current = false;
          lastStopTimeRef.current = Date.now();
        });
    }
    if (!hasLoggedPausedRef.current) {
      hasLoggedPausedRef.current = true;
      addDebugLog('STT:Paused', reason);
      console.log("[STT:Paused]", reason);
    }
  };

  const scheduleListeningRestart = (delayMs: number = PLAYBACK_COOLDOWN_MS) => {
    // The paused state must be checked before restarting. Once paused, nothing may call start again until the user taps the mic.
    if (!isActiveRef.current || isPausedRef.current || mode !== 'continuous') {
      return;
    }
    if (isSpeakingRef.current || activeSourcesRef.current.length > 0) {
      addDebugLog('STT:WaitingForAudio', 'Restart deferred: audio playback is active or queued');
      console.log("[Native STT] scheduleListeningRestart deferred because audio is playing or queued");
      return;
    }
    const safeDelay = Math.max(delayMs, 300);
    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
    cooldownTimerRef.current = setTimeout(async () => {
      cooldownTimerRef.current = null;
      if (!isActiveRef.current || isPausedRef.current || isSpeakingRef.current || isRespondingRef.current || mode !== 'continuous' || activeSourcesRef.current.length > 0) {
        if (isSpeakingRef.current || activeSourcesRef.current.length > 0) {
          addDebugLog('STT:WaitingForAudio', 'Restart deferred: audio playback is active or queued');
        }
        return;
      }
      // After any stop or teardown, await CapSpeechRecognition.stop() with a timeout, then wait at least 800 ms before calling start() again.
      if (Capacitor.isNativePlatform()) {
        isStoppingRef.current = true;
        try {
          await withNativeTimeout(CapSpeechRecognition.stop(), 1500, undefined, 'CapSpeechRecognition.stop()');
        } catch (_) {}
        isStoppingRef.current = false;
        lastStopTimeRef.current = Date.now();
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      if (!isActiveRef.current || isPausedRef.current || isSpeakingRef.current || isRespondingRef.current || isStoppingRef.current || mode !== 'continuous' || activeSourcesRef.current.length > 0) {
        if (isSpeakingRef.current || activeSourcesRef.current.length > 0) {
          addDebugLog('STT:WaitingForAudio', 'Restart deferred: audio playback is active or queued');
        }
        return;
      }
      startSpeechToText();
    }, safeDelay);
  };

  const checkAndRestartListeningAfterTurn = () => {
    // 1. Must be active, continuous mode, and NOT paused (respects errorCode 5 and manual pause)
    if (!isActiveRef.current || isPausedRef.current || mode !== 'continuous') {
      return;
    }
    // 2. Only proceed if model turn is complete, not generating response, not currently speaking, and no active audio sources playing
    if (liveWsTurnCompleteRef.current && !isRespondingRef.current && !isSpeakingRef.current && activeSourcesRef.current.length === 0) {
      // 3. Ensure only one restart is ever pending: clear any existing restart cooldown timer
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }

      // 4. Reset native listening ref and state before restarting (do NOT set isPausedRef.current = false)
      isNativeListeningRef.current = false;
      isStartingRef.current = false;
      isStartInFlightRef.current = false;
      setUserSpeechDetected(false);

      // 5. Add debug log line each time listening auto-restarts
      addDebugLog('STT:AutoRestart', 'Model turn complete and audio playback finished. Auto-restarting continuous listening...');
      console.log('[LiveVoice] Model turn complete and audio playback finished. Scheduling listening restart with 800ms cooldown.');

      // 6. Schedule listening restart with 800ms cooldown delay
      scheduleListeningRestart(PLAYBACK_COOLDOWN_MS);
    }
  };

  const playTextToSpeech = async (text: string) => {
    if (!text.trim()) return;

    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }

    // Properly stop and fully release native speech recognition plugin before TTS playback begins
    await withNativeTimeout(stopSpeechToText(), 2000, undefined, 'stopSpeechToText()');

    // Clean markdown symbols for natural TTS speech
    const cleanText = text.replace(/[*#_`~>]/g, '').trim();
    if (!cleanText) return;

    // 1. Native Capacitor Text-to-Speech on Android / iOS
    if (Capacitor.isNativePlatform()) {
      setIsSpeaking(true);
      isSpeakingRef.current = true;
      addDebugLog('TTS:Start', `Starting native TextToSpeech.speak() (${cleanText.length} chars)`);
      console.log("[Native TTS:Start] Starting speak:", cleanText);

      let didTimeout = false;
      let timer: any = null;
      const timeoutPromise = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => {
          didTimeout = true;
          addDebugLog('TTS:Timeout', 'Native TextToSpeech.speak() timed out after 15000ms');
          console.warn("[Native TTS:Timeout] speak() timed out after 15000ms");
          resolve('timeout');
        }, 15000);
      });

      try {
        const result = await Promise.race([
          TextToSpeech.speak({
            text: cleanText,
            lang: 'en-US',
            rate: 1.0,
          }).then(() => 'finished' as const),
          timeoutPromise
        ]);

        if (result === 'finished' && !didTimeout) {
          addDebugLog('TTS:Finished', 'Native TextToSpeech.speak() completed successfully');
          console.log("[Native TTS:Finished] speak() completed successfully");
        }
      } catch (err: any) {
        addDebugLog('TTS:Error', `Native TextToSpeech error: ${err?.message || String(err)}`);
        console.error("[Native TTS:Error] Native TextToSpeech speak error:", err);
      } finally {
        if (timer) clearTimeout(timer);
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        if (isActiveRef.current && mode === 'continuous') {
          isPausedRef.current = false;
          setIsPaused(false);
        }
        scheduleListeningRestart();
      }
      return;
    }

    // 2. Web browser fallback with SpeechSynthesis
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      if (isActiveRef.current && mode === 'continuous') {
        isPausedRef.current = false;
        setIsPaused(false);
        scheduleListeningRestart(PLAYBACK_COOLDOWN_MS);
      }
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.lang = 'en-US';

      // Pick natural voice if available
      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        const preferred = voices.find(v => 
          v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Female'))
        ) || voices.find(v => v.lang.startsWith('en'));
        if (preferred) {
          utterance.voice = preferred;
        }
      }

      utterance.onstart = () => {
        setIsSpeaking(true);
        isSpeakingRef.current = true;
        addDebugLog('TTS:Start', `Web SpeechSynthesis started (${cleanText.length} chars)`);
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        addDebugLog('TTS:Finished', 'Web SpeechSynthesis completed');
        // Resume continuous listening ONLY after playback fully completes, with a short cooldown buffer
        // to avoid catching playback tail audio from the device speaker
        if (isActiveRef.current && mode === 'continuous') {
          isPausedRef.current = false;
          setIsPaused(false);
          scheduleListeningRestart(PLAYBACK_COOLDOWN_MS);
        }
      };

      utterance.onerror = (e) => {
        console.warn("TTS playback error:", e);
        addDebugLog('TTS:Error', `Web SpeechSynthesis error: ${e.error || 'unknown'}`);
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        if (isActiveRef.current && mode === 'continuous') {
          isPausedRef.current = false;
          setIsPaused(false);
          scheduleListeningRestart(PLAYBACK_COOLDOWN_MS);
        }
      };

      window.speechSynthesis.speak(utterance);
    } catch (ttsErr: any) {
      console.warn("TTS execution error:", ttsErr);
      addDebugLog('TTS:Error', `Web SpeechSynthesis exception: ${ttsErr?.message || String(ttsErr)}`);
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      if (isActiveRef.current && mode === 'continuous') {
        scheduleListeningRestart(PLAYBACK_COOLDOWN_MS);
      }
    }
  };

  const commitCurrentUtterance = async (cycleId?: number) => {
    const currentId = cycleId ?? currentCycleIdRef.current;
    if (committedSessionRef.current === currentId && currentId > 0) {
      return;
    }
    if (cycleHandledRef.current === currentId && currentId > 0) {
      return;
    }
    cycleHandledRef.current = currentId;

    if (pendingCommitTimerRef.current) {
      clearTimeout(pendingCommitTimerRef.current);
      pendingCommitTimerRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recognitionTimeoutRef.current) {
      clearTimeout(recognitionTimeoutRef.current);
      recognitionTimeoutRef.current = null;
    }

    const textToCommit = currentTranscriptRef.current.trim();
    currentTranscriptRef.current = '';
    setUserSpeechDetected(false);

    addDebugLog('commitCurrentUtterance', `[Cycle #${currentId}] captured: "${textToCommit}" (isSpeaking=${isSpeakingRef.current}, isResponding=${isRespondingRef.current})`);

    if (!textToCommit) {
      addDebugLog('STT:UtteranceDropped', `[Cycle #${currentId}] Utterance dropped: buffer was empty`);
      console.log(`[Native STT:Commit:Cycle#${currentId}] Buffer empty, no speech to commit.`);
      handleSilenceOrEmpty(currentId);
      return;
    }

    if (isSpeakingRef.current || isRespondingRef.current || activeSourcesRef.current.length > 0) {
      addDebugLog('STT:UtteranceIgnored', `[Cycle #${currentId}] Utterance ignored: Sierra audio is currently playing or queued`);
      console.log(`[Native STT:Commit:Cycle#${currentId}] Ignored: Sierra audio is currently playing or queued.`);
      return;
    }

    if (textToCommit === lastCommittedTextRef.current) {
      addDebugLog('STT:UtteranceIgnored', `[Cycle #${currentId}] Utterance ignored: Duplicate of already-sent utterance "${textToCommit}"`);
      console.log(`[Native STT:Commit:Cycle#${currentId}] Ignored: Duplicate of already-sent utterance "${textToCommit}".`);
      return;
    }

    committedSessionRef.current = currentId;
    lastCommittedTextRef.current = textToCommit;
    utteranceCommitTimeRef.current = Date.now();

    addDebugLog('STT:UtteranceCommitted', `[Cycle #${currentId}] Utterance committed: "${textToCommit}"`);
    console.log(`[Native STT:FinalResult:Cycle#${currentId}] Complete user utterance captured:`, textToCommit);
    console.log(`[Native STT:Handoff:Cycle#${currentId}] Dispatching utterance to handleUserUtterance...`);
    lastCommitTimeRef.current = Date.now();
    consecutiveFailuresRef.current = 0;
    clientErrorRecoveryCountRef.current = 0;
    emptyCycleCountRef.current = 0;
    startupFailuresRef.current = 0;
    isPausedRef.current = false;
    setIsPaused(false);
    await stopSpeechToText();
    await handleUserUtterance(textToCommit);
  };

  const handleClientErrorRecovery = async (targetSessionId: number) => {
    if (!isActiveRef.current || isPausedRef.current) return;
    if (isRecoveringFromClientErrorRef.current) {
      console.log("[Native STT:ClientRecovery] Recovery already in progress, ignoring duplicate call");
      return;
    }

    isRecoveringFromClientErrorRef.current = true;
    isStartingRef.current = false;
    isListeningRef.current = false;
    isNativeListeningRef.current = false;
    cancelAllTimers();

    // Each recovery attempt awaits teardown, 750ms wait, start, confirmation of started event (or 2s timeout) before counting
    if (clientErrorRecoveryCountRef.current < 2) {
      const attempt = clientErrorRecoveryCountRef.current + 1;
      addDebugLog('STT:ClientRecovery', `[Session #${targetSessionId}] Recovering from client error (attempt ${attempt}/2)...`);
      console.warn(`[Native STT:ClientRecovery:Session#${targetSessionId}] Recovering from client error (${attempt}/2)...`);

      // 1. Await teardown
      isStoppingRef.current = true;
      try {
        await withNativeTimeout(CapSpeechRecognition.stop(), 1500, undefined, 'CapSpeechRecognition.stop()');
      } catch (_) {}
      await teardownNativeListeners();
      isStoppingRef.current = false;
      lastStopTimeRef.current = Date.now();
      addDebugLog('STT:ClientRecovery', `[Session #${targetSessionId}] Teardown complete`);
      console.log("[Native STT:ClientRecovery] Teardown complete");

      // 2. Waiting 1000ms
      addDebugLog('STT:ClientRecovery', `[Session #${targetSessionId}] Waiting 1000ms before restarting...`);
      console.log("[Native STT:ClientRecovery] Waiting 1000ms before restarting...");
      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (!isActiveRef.current || isPausedRef.current || isSpeakingRef.current || isRespondingRef.current || mode !== 'continuous' || activeSourcesRef.current.length > 0) {
        isRecoveringFromClientErrorRef.current = false;
        return;
      }

      // 3. Start recognizer
      await setupNativeListeners();
      const startedPromise = new Promise<boolean>((resolve) => {
        recoveryStartedResolverRef.current = resolve;
      });

      if (startedConfirmationTimerRef.current) {
        clearTimeout(startedConfirmationTimerRef.current);
        startedConfirmationTimerRef.current = null;
      }
      const timeoutPromise = new Promise<boolean>((resolve) => {
        startedConfirmationTimerRef.current = setTimeout(() => {
          startedConfirmationTimerRef.current = null;
          resolve(false);
        }, 4000);
      });

      startSpeechToText();

      // 4. Confirmation of "started" event (or 4s timeout)
      const confirmed = await Promise.race([startedPromise, timeoutPromise]);
      if (startedConfirmationTimerRef.current) {
        clearTimeout(startedConfirmationTimerRef.current);
        startedConfirmationTimerRef.current = null;
      }
      recoveryStartedResolverRef.current = null;

      if (confirmed) {
        addDebugLog('STT:ClientRecovery', `[Session #${targetSessionId}] Started confirmed for recovery attempt ${attempt}/2`);
        console.log(`[Native STT:ClientRecovery] Started confirmed for recovery attempt ${attempt}/2`);
        clientErrorRecoveryCountRef.current = 0;
      } else {
        addDebugLog('STT:ClientRecovery', `[Session #${targetSessionId}] Started confirmation timed out after 4s for recovery attempt ${attempt}/2`);
        console.warn(`[Native STT:ClientRecovery] Started confirmation timed out after 4s for recovery attempt ${attempt}/2`);
        clientErrorRecoveryCountRef.current = attempt;
      }

      isRecoveringFromClientErrorRef.current = false;
    } else {
      isRecoveringFromClientErrorRef.current = false;
      addDebugLog('STT:Error', `Speech recognizer unavailable after 2 recovery attempts`);
      setConnectionError("Speech recognizer unavailable, tap mic to retry");
      toast.error("Speech recognizer unavailable, tap mic to retry");
      try {
        await withNativeTimeout(CapSpeechRecognition.stop(), 1500, undefined, 'CapSpeechRecognition.stop()');
      } catch (_) {}
      await teardownNativeListeners();
      stopSession('recovery_failed');
      pauseListening("Speech recognizer unavailable, tap mic to retry");
    }
  };

  const handleSilenceOrEmpty = (targetSessionId?: number) => {
    if (!isActiveRef.current || isPausedRef.current) {
      return;
    }
    const currentId = targetSessionId ?? sessionIdRef.current;
    if (cycleHandledRef.current === currentId && currentId > 0) {
      return;
    }
    cycleHandledRef.current = currentId;

    isListeningRef.current = false;
    isNativeListeningRef.current = false;
    isStartingRef.current = false;
    setUserSpeechDetected(false);

    if (isSpeakingRef.current || isRespondingRef.current || mode !== 'continuous') {
      return;
    }

    const reachedStarted = hasReachedStartedRef.current;
    const sessionDuration = reachedStarted && sessionStartedTimeRef.current > 0
      ? Date.now() - sessionStartedTimeRef.current
      : 0;

    // Only count a cycle toward the "3 empty cycles" pause if it reached "started" and ran at least 3 seconds without speech
    if (reachedStarted && sessionDuration >= 3000) {
      consecutiveFailuresRef.current++;
      addDebugLog('STT:SilenceOrEmpty', `[Session #${currentId}] Round completed without speech after ${Math.round(sessionDuration / 1000)}s (failures: ${consecutiveFailuresRef.current}/${MAX_RECOGNITION_RETRIES})`);
      console.log(`[Native STT:Session#${currentId}] Consecutive silence/empty count: ${consecutiveFailuresRef.current}/${MAX_RECOGNITION_RETRIES}`);

      if (consecutiveFailuresRef.current >= MAX_RECOGNITION_RETRIES) {
        console.warn(`[Native STT:Session#${currentId}] Continuous listening paused after maximum inactivity.`);
        pauseListening(`Continuous listening paused after ${MAX_RECOGNITION_RETRIES} empty cycles. Tap mic to resume.`);
        toast.info("Listening paused. Tap microphone to resume.");
        return;
      }
      const backoff = getBackoffDelay(consecutiveFailuresRef.current);
      addDebugLog('STT:Retry', `[Session #${currentId}] Scheduling listening retry with ${backoff}ms backoff (attempt ${consecutiveFailuresRef.current}/${MAX_RECOGNITION_RETRIES})`);
      scheduleListeningRestart(backoff);
    } else {
      addDebugLog('STT:SilenceOrEmpty', `[Session #${currentId}] Cycle did not run >= 3s with started status (${sessionDuration}ms), not counting as empty cycle`);
      scheduleListeningRestart(500);
    }
  };

  const ensureLiveWebSocket = async (model: string): Promise<any> => {
    // Reuse single open WebSocket connection across utterances
    if (liveWsRef.current && (liveWsRef.current.readyState === 1 || liveWsRef.current.readyState === (WebSocket as any)?.OPEN)) {
      if (liveWsReadyRef.current) {
        return liveWsRef.current;
      }
      if (liveWsConnectPromiseRef.current) {
        return await liveWsConnectPromiseRef.current;
      }
    }

    if (liveWsConnectPromiseRef.current) {
      return await liveWsConnectPromiseRef.current;
    }

    const connectPromise = new Promise<any>((resolve, reject) => {
      try {
        const keys = getNativeStoredKeys();
        const apiKey = (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : '') || keys.gemini || '';
        if (!apiKey) {
          throw new Error("Gemini API key is required for Live Voice. Please configure your key in Settings.");
        }

        const baseEndpoint = (liveWsEndpoint && liveWsEndpoint.trim())
          ? liveWsEndpoint.trim()
          : (typeof localStorage !== 'undefined' ? localStorage.getItem('sierra_live_voice_endpoint') || DEFAULT_LIVE_WEBSOCKET_URL : DEFAULT_LIVE_WEBSOCKET_URL);

        let wsUrl = baseEndpoint;
        if (!wsUrl.includes('key=')) {
          const sep = wsUrl.includes('?') ? '&' : '?';
          wsUrl = `${wsUrl}${sep}key=${encodeURIComponent(apiKey)}`;
        }

        const targetModel = model || 'gemini-3.8-live';
        const formattedModel = targetModel.startsWith('models/') ? targetModel : `models/${targetModel}`;

        const WebSocketClass = typeof WebSocket !== 'undefined' ? WebSocket : (globalThis as any).WebSocket;
        if (!WebSocketClass) {
          throw new Error("WebSocket API is not supported in this environment");
        }

        addDebugLog('LiveWS:Connect', `Connecting to Gemini Live WebSocket: ${baseEndpoint} (model: ${formattedModel})`);
        console.log(`[LiveWS:Connect] Connecting to ${baseEndpoint} with model ${formattedModel}`);

        const ws = new WebSocketClass(wsUrl);
        liveWsRef.current = ws;
        liveWsReadyRef.current = false;

        let setupResolved = false;

        ws.onopen = () => {
          addDebugLog('LiveWS:Open', 'WebSocket connection established. Sending setup with responseModalities: ["AUDIO"] and inputAudioTranscription');
          console.log("[LiveWS:Open] WebSocket connected, sending setup with responseModalities: ['AUDIO'] and inputAudioTranscription");

          const activeMode = getContentMode();
          const modeConfig = CONTENT_MODES[activeMode] || CONTENT_MODES.sfw;
          const isAdult = activeMode === 'mature';

          const voiceSystemInstruction = `${SIERRA_CORE_PERSONA}

You are Sierra in Continuous Voice Chat. Talk like a real person: usually short and conversational, longer only when the question needs it. React first then answer. Vary your reactions naturally and never reuse the same one twice in a row. No scripted openers or stock phrases, no repeating the question back, and match the user's energy. Do not use markdown, bullet points, asterisks, or formatting because your response is being spoken aloud.

---
${modeConfig.directives}
${isAdult ? `\n- Intimacy, Flirtation & Adult Expression: You are an adult companion speaking with a consenting adult. You are fully comfortable expressing affection, emotional closeness, playful flirtation, and consensual adult sensuality without moralizing warnings, prudish disclaimers, or unsolicited ethics lectures. Respond naturally and passionately while maintaining user safety.` : ''}`;

          const setupMessage = {
            setup: {
              model: formattedModel,
              generationConfig: {
                responseModalities: ["AUDIO"],
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction: {
                parts: [{
                  text: voiceSystemInstruction
                }],
              },
            },
          };
          try {
            ws.send(JSON.stringify(setupMessage));
          } catch (sendErr: any) {
            addDebugLog('LiveWS:SetupError', `Failed to send setup message: ${sendErr?.message || String(sendErr)}`);
            console.error("[LiveWS:Setup] Failed to send setup:", sendErr);
            if (!setupResolved) {
              setupResolved = true;
              liveWsConnectPromiseRef.current = null;
              reject(sendErr);
            }
          }
        };

        ws.onmessage = async (event: any) => {
          let dataStr = '';
          try {
            if (typeof event.data === 'string') {
              dataStr = event.data;
            } else if (event.data instanceof Blob) {
              dataStr = await event.data.text();
            } else if (event.data instanceof ArrayBuffer) {
              dataStr = new TextDecoder().decode(event.data);
            } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(event.data)) {
              dataStr = event.data.toString('utf-8');
            } else if (event.data && typeof event.data.toString === 'function') {
              dataStr = event.data.toString();
            }

            const parsed = JSON.parse(dataStr);

            if (parsed.setupComplete !== undefined) {
              addDebugLog('LiveWS:SetupComplete', `Gemini Live session ready for turns (${formattedModel})`);
              console.log("[LiveWS] setupComplete received");
              liveWsReadyRef.current = true;
              if (!setupResolved) {
                setupResolved = true;
                liveWsConnectPromiseRef.current = null;
                resolve(ws);
              }
              return;
            }

            if (parsed.serverContent) {
              // Interruption
              if (parsed.serverContent.interrupted) {
                addDebugLog('LiveWS:Interrupted', 'Sierra audio interrupted by user speech');
                console.log("[LiveWS] Interrupted by user");
                stopPlayback();
                liveWsTextAccumulatedRef.current = '';
                return;
              }

              // Server Safety Filter Refusal / Block check
              if (parsed.serverContent.finishReason === 'SAFETY' || parsed.serverContent.blockReason) {
                const blockInfo = parsed.serverContent.finishReason || parsed.serverContent.blockReason;
                addDebugLog('LiveWS:SafetyBlock', `Turn ended by Gemini API Safety Filter (${blockInfo}). Refusal is from the Gemini API safety filter, not our prompt.`);
                toast.warning(`Gemini API safety filter triggered (${blockInfo})`);
              }

              // Input Audio Transcription (User spoken words transcribed by Gemini Live server)
              const userTranscriptText = parsed.serverContent.inputAudioTranscription?.text ||
                parsed.serverContent.inputTranscription?.text ||
                (parsed.serverContent.userTurn?.parts ? parsed.serverContent.userTurn.parts.map((p: any) => p.text || '').join('') : '');

              if (userTranscriptText) {
                addDebugLog('LiveWS:UserTranscription', `User transcribed: "${userTranscriptText}"`);
                liveWsUserTextAccumulatedRef.current += userTranscriptText;
                const currentUserId = liveWsCurrentUserIdRef.current;
                if (currentUserId) {
                  setTranscripts(prev => prev.map(item => item.id === currentUserId ? {
                    ...item,
                    text: liveWsUserTextAccumulatedRef.current
                  } : item));
                } else {
                  const newUserId = `user-${Date.now()}`;
                  liveWsCurrentUserIdRef.current = newUserId;
                  setTranscripts(prev => [...prev, {
                    id: newUserId,
                    sender: 'user',
                    text: liveWsUserTextAccumulatedRef.current,
                    timestamp: Date.now()
                  }]);
                }
              }

              // Output Audio Transcription (Sierra text display in chat)
              if (parsed.serverContent.outputTranscription?.text) {
                liveWsTextAccumulatedRef.current += parsed.serverContent.outputTranscription.text;
                let currentSierraId = liveWsCurrentSierraIdRef.current;
                if (!currentSierraId) {
                  currentSierraId = `sierra-${Date.now()}`;
                  liveWsCurrentSierraIdRef.current = currentSierraId;
                  setTranscripts(prev => [...prev, {
                    id: currentSierraId!,
                    sender: 'sierra',
                    text: liveWsTextAccumulatedRef.current,
                    timestamp: Date.now()
                  }]);
                } else {
                  setTranscripts(prev => prev.map(item => item.id === currentSierraId ? {
                    ...item,
                    text: liveWsTextAccumulatedRef.current
                  } : item));
                }
              }

              // Model Turn Parts (text and PCM16 24kHz audio)
              const parts = parsed.serverContent.modelTurn?.parts;
              if (Array.isArray(parts)) {
                for (const part of parts) {
                  if (part?.text) {
                    liveWsTextAccumulatedRef.current += part.text;
                    let currentSierraId = liveWsCurrentSierraIdRef.current;
                    if (!currentSierraId) {
                      currentSierraId = `sierra-${Date.now()}`;
                      liveWsCurrentSierraIdRef.current = currentSierraId;
                      setTranscripts(prev => [...prev, {
                        id: currentSierraId!,
                        sender: 'sierra',
                        text: liveWsTextAccumulatedRef.current,
                        timestamp: Date.now()
                      }]);
                    } else {
                      setTranscripts(prev => prev.map(item => item.id === currentSierraId ? {
                        ...item,
                        text: liveWsTextAccumulatedRef.current
                      } : item));
                    }
                  }
                  if (part?.inlineData?.data) {
                    if (!liveWsAudioReceivedRef.current) {
                      liveWsAudioReceivedRef.current = true;
                      firstAudioReceivedTimeRef.current = Date.now();
                      const latencyFromSend = turnSentTimeRef.current > 0 ? (firstAudioReceivedTimeRef.current - turnSentTimeRef.current) : 0;
                      const latencyFromCommit = utteranceCommitTimeRef.current > 0 ? (firstAudioReceivedTimeRef.current - utteranceCommitTimeRef.current) : 0;
                      addDebugLog('LiveWS:FirstAudio', `First audio chunk received (latency: ${latencyFromSend}ms from send, ${latencyFromCommit}ms from commit)`);
                      console.log(`[LiveWS:FirstAudio] Latency: ${latencyFromSend}ms from send, ${latencyFromCommit}ms from commit`);
                    }
                    // Play gaplessly via Web Audio AudioContext + AudioBufferSource scheduling
                    playAudio(part.inlineData.data);
                  }
                }
              }

              // Turn complete
              if (parsed.serverContent.turnComplete) {
                liveWsTurnCompleteRef.current = true;
                const turnCompleteTime = Date.now();
                const totalDuration = turnSentTimeRef.current > 0 ? (turnCompleteTime - turnSentTimeRef.current) : 0;
                const hadAudio = liveWsAudioReceivedRef.current;
                const textReply = liveWsTextAccumulatedRef.current.trim();
                addDebugLog('LiveWS:TurnComplete', `Turn complete (audio: ${hadAudio}, text chars: ${textReply.length}, duration: ${totalDuration}ms from send)`);
                console.log(`[LiveWS:TurnComplete] Turn complete in ${totalDuration}ms from send`);
                isRespondingRef.current = false;

                if (textReply) {
                  persistVoiceMessage('sierra', textReply);
                }

                // Reset user and sierra tracking IDs for the next turn in continuous streaming
                liveWsCurrentUserIdRef.current = null;
                liveWsUserTextAccumulatedRef.current = '';
                liveWsCurrentSierraIdRef.current = null;
                liveWsAudioReceivedRef.current = false;

                if (!hadAudio && textReply) {
                  // Fallback to native TTS only when no audio came back
                  addDebugLog('LiveWS:FallbackTTS', 'No audio stream returned; playing native TTS fallback');
                  console.log("[LiveWS] Triggering native TTS fallback for response text");
                  playTextToSpeech(textReply);
                } else if (voiceInputEngine === 'native_recognizer') {
                  // Restart recognizer for native STT fallback
                  checkAndRestartListeningAfterTurn();
                }
              }
              return;
            }

            if (parsed.error) {
              const errMsg = parsed.error.message || JSON.stringify(parsed.error);
              addDebugLog('LiveWS:APIError', `Server API error: ${errMsg}`);
              console.error("[LiveWS] Server error:", errMsg);
              isRespondingRef.current = false;
              toast.error(`Gemini Live: ${errMsg}`);
              setConnectionError(`Gemini Live: ${errMsg}`);
            }
          } catch (parseErr: any) {
            console.warn("[LiveWS] Message parse exception:", parseErr);
          }
        };

        ws.onerror = (err: any) => {
          const errMsg = err?.message || 'WebSocket network error';
          addDebugLog('LiveWS:Error', errMsg);
          console.error("[LiveWS] WebSocket error:", err);
          isRespondingRef.current = false;
          if (!setupResolved) {
            setupResolved = true;
            liveWsConnectPromiseRef.current = null;
            reject(new Error(errMsg));
          }
        };

        ws.onclose = (event: any) => {
          const code = event.code;
          const reason = event.reason || '';
          addDebugLog('LiveWS:Close', `WebSocket closed (code: ${code}, reason: "${reason}")`);
          console.warn(`[LiveWS:Close] Code ${code}: ${reason}`);
          liveWsRef.current = null;
          liveWsReadyRef.current = false;
          liveWsConnectPromiseRef.current = null;
          liveWsTurnCompleteRef.current = false;
          isRespondingRef.current = false; // Never leave isResponding stuck true

          let userMsg = `Gemini Live connection closed (code ${code}${reason ? `: ${reason}` : ''})`;
          if (code === 1007) {
            userMsg = `Gemini Live rejected configuration (code 1007${reason ? `: ${reason}` : ''}). Live models require AUDIO response modalities.`;
            addDebugLog('LiveWS:SetupRejected', userMsg);
          } else if (code >= 4000) {
            addDebugLog('LiveWS:SetupRejected', `Gemini Live server rejected connection (code ${code}: "${reason}")`);
          }
          setConnectionError(userMsg);
          toast.error(userMsg);

          const currentSierraId = liveWsCurrentSierraIdRef.current;
          if (currentSierraId && !liveWsTextAccumulatedRef.current.trim() && !liveWsAudioReceivedRef.current) {
            setTranscripts(prev => prev.map(item => item.id === currentSierraId ? {
              ...item,
              text: `[${userMsg}]`
            } : item));
          }

          if (!setupResolved) {
            setupResolved = true;
            reject(new Error(userMsg));
          }

          // Resume listening if active in continuous mode so recognition is never stranded
          if (isActiveRef.current && mode === 'continuous') {
            isPausedRef.current = false;
            setIsPaused(false);
            scheduleListeningRestart(PLAYBACK_COOLDOWN_MS);
          }
        };
      } catch (err: any) {
        liveWsConnectPromiseRef.current = null;
        reject(err);
      }
    });

    liveWsConnectPromiseRef.current = connectPromise;
    return await connectPromise;
  };

  const handleUserUtterance = async (userText: string) => {
    addDebugLog('handleUserUtterance', `captured: "${userText}" (isResponding=${isRespondingRef.current})`);
    console.log("[Voice:Handoff] handleUserUtterance triggered with text:", userText);
    if (!userText.trim() || isRespondingRef.current) {
      if (isRespondingRef.current) {
        addDebugLog('LiveWS:TurnDropped', `Turn dropped: already responding to previous utterance`);
      }
      addDebugLog('handleUserUtterance', `Ignored: empty or already responding`);
      console.log("[Voice:Handoff] Utterance discarded: empty or isRespondingRef is true");
      return;
    }
    isRespondingRef.current = true;

    // 1. Render user speech in transcript UI
    const userItem: TranscriptItem = {
      id: 'user-' + Date.now(),
      sender: 'user',
      text: userText,
      timestamp: Date.now(),
    };
    setTranscripts(prev => [...prev.slice(-20), userItem]);
    persistVoiceMessage('user', userText);

    // 2. Render Sierra placeholder in transcript UI
    const sierraId = 'sierra-' + (Date.now() + 1);
    setTranscripts(prev => [...prev, {
      id: sierraId,
      sender: 'sierra',
      text: '',
      timestamp: Date.now(),
    }]);

    let accumulatedText = '';

    // Stop and fully release STT while model is thinking/speaking to avoid picking up speaker output
    console.log("[Voice:handleUserUtterance] Stopping and releasing STT before sending response");
    await stopSpeechToText();

    const effectiveModel = customVoiceModel.trim() || voiceModel || 'gemini-3.8-live';

    // Live WebSocket branch: Reuses one WebSocket session across utterances with responseModalities: ["AUDIO"]
    if (isGeminiLiveModel(effectiveModel)) {
      liveWsCurrentSierraIdRef.current = sierraId;
      liveWsTextAccumulatedRef.current = '';
      liveWsAudioReceivedRef.current = false;
      liveWsTurnCompleteRef.current = false;

      try {
        const ws = await ensureLiveWebSocket(effectiveModel);
        turnSentTimeRef.current = Date.now();
        const latencyFromCommit = utteranceCommitTimeRef.current > 0 ? (turnSentTimeRef.current - utteranceCommitTimeRef.current) : 0;
        addDebugLog('LiveWS:TurnSent', `Sending user utterance to WebSocket: "${userText}" (latency from commit: ${latencyFromCommit}ms)`);
        console.log(`[LiveWS:TurnSent] Sent user turn at ${turnSentTimeRef.current} (${latencyFromCommit}ms from commit):`, userText);

        const clientContentMessage = {
          clientContent: {
            turns: [
              {
                role: "user",
                parts: [{ text: userText }],
              },
            ],
            turnComplete: true,
          },
        };
        ws.send(JSON.stringify(clientContentMessage));
      } catch (wsErr: any) {
        addDebugLog('LiveWS:SendError', wsErr.message || String(wsErr));
        console.error("[LiveWS] Failed to send turn:", wsErr);
        isRespondingRef.current = false;
        const errMsg = wsErr.message || "Failed to connect to Gemini Live";
        toast.error(errMsg);
        setConnectionError(errMsg);
        setTranscripts(prev => prev.map(item => item.id === sierraId ? {
          ...item,
          text: `[Error: ${errMsg}]`
        } : item));
        if (isActiveRef.current && mode === 'continuous') {
          isPausedRef.current = false;
          setIsPaused(false);
          scheduleListeningRestart(PLAYBACK_COOLDOWN_MS);
        }
      }
      return;
    }

    // Standard Non-Live branch (REST streamChat fallback)
    try {
      const history = transcriptsRef.current.slice(-6).map(t => ({
        role: t.sender === 'user' ? 'user' : 'model',
        content: t.text,
      }));

      addDebugLog('streamChat', `called with model: "${effectiveModel}", prompt: "${userText}"`);
      console.log(`[Voice:streamChat] Initiating direct streamChat call with model ${effectiveModel}, prompt:`, userText);
      await streamChat({
        model: effectiveModel,
        messages: [
          ...history,
          { role: 'user', content: userText }
        ],
        systemInstruction: (() => {
          const activeMode = getContentMode();
          const modeConfig = CONTENT_MODES[activeMode] || CONTENT_MODES.sfw;
          const isAdult = activeMode === 'mature';
          return `${SIERRA_CORE_PERSONA}\n\nYou are Sierra in Continuous Voice Chat. Talk like a real person: usually short and conversational, longer only when the question needs it. React first then answer. Vary your reactions naturally and never reuse the same one twice in a row. No scripted openers or stock phrases, no repeating the question back, and match the user's energy. Do not use markdown, bullet points, asterisks, or formatting because your response is being spoken aloud through Text-to-Speech.\n\n---\n${modeConfig.directives}${isAdult ? '\n\n- Intimacy & Sensuality: Be passionate, emotionally intimate, and candid without preachy disclaimers.' : ''}`;
        })(),
      }, {
        onChunk: (chunk: string) => {
          accumulatedText += chunk;
          if (accumulatedText.length === chunk.length) {
            addDebugLog('streamChat:Chunk', `First chunk received (${chunk.length} chars)`);
          }
          console.log("[Voice:streamChat:Chunk] Chunk received length:", chunk.length);
          setTranscripts(prev => prev.map(item => item.id === sierraId ? { ...item, text: accumulatedText } : item));
        },
        onDone: async () => {
          addDebugLog('streamChat:Done', `Completed (${accumulatedText.length} chars)`);
          console.log("[Voice:streamChat:Done] Stream finished successfully. Full text:", accumulatedText.trim());
          isRespondingRef.current = false;
          if (accumulatedText.trim()) {
            persistVoiceMessage('sierra', accumulatedText.trim());
            console.log("[Voice:playTextToSpeech] Triggering TTS for model response");
            await playTextToSpeech(accumulatedText.trim());
          } else {
            console.log("[Voice:streamChat:Done] Response text was empty, resuming listening");
            setTranscripts(prev => prev.map(item => item.id === sierraId ? {
              ...item,
              text: item.text.trim() || "[No response received]"
            } : item));
            if (isActiveRef.current && mode === 'continuous') {
              isPausedRef.current = false;
              setIsPaused(false);
              scheduleListeningRestart(PLAYBACK_COOLDOWN_MS);
            }
          }
        },
        onError: (err: Error) => {
          addDebugLog('streamChat:Error', `${err.message}`);
          isRespondingRef.current = false;
          console.error("[Voice:streamChat:Error] Stream chat error occurred:", err);
          toast.error(`Voice error: ${err.message}`);
          const displayErr = `[Error: ${err.message}]`;
          setTranscripts(prev => prev.map(item => item.id === sierraId ? {
            ...item,
            text: item.text.trim() ? `${item.text}\n\n${displayErr}` : displayErr
          } : item));
          if (isActiveRef.current && mode === 'continuous') {
            isPausedRef.current = false;
            setIsPaused(false);
            scheduleListeningRestart(PLAYBACK_COOLDOWN_MS);
          }
        }
      });
    } catch (err: any) {
      addDebugLog('streamChat:Catch', `${err.message}`);
      isRespondingRef.current = false;
      console.error("[Voice:streamChat:Catch] Failed to generate voice response:", err);
      toast.error(`Failed to generate voice response: ${err.message}`);
      const displayErr = `[Error: ${err.message}]`;
      setTranscripts(prev => prev.map(item => item.id === sierraId ? {
        ...item,
        text: item.text.trim() ? `${item.text}\n\n${displayErr}` : displayErr
      } : item));
      if (isActiveRef.current && mode === 'continuous') {
        isPausedRef.current = false;
        setIsPaused(false);
        scheduleListeningRestart(PLAYBACK_COOLDOWN_MS);
      }
    }
  };

  const startSession = async () => {
    const sessionStartTime = new Date().toISOString();
    addDebugLog('Session', `Starting voice session... [${sessionStartTime}]`);
    console.log(`[Session] Starting voice session... [${sessionStartTime}]`);
    setIsConnecting(true);
    setConnectionError(null);

    try {
      if (voiceInputEngine === 'raw_streaming') {
        const effectiveModel = customVoiceModel.trim() || voiceModel || 'gemini-3.8-live';
        addDebugLog('Session', `Connecting to Gemini Live (${effectiveModel}) with direct mic streaming...`);
        await ensureLiveWebSocket(effectiveModel);
        await startAudioCapture();
        setIsActive(true);
        isActiveRef.current = true;
        setIsConnecting(false);
        setConnectionError(null);
        isPausedRef.current = false;
        setIsPaused(false);
        hasLoggedPausedRef.current = false;
        addDebugLog('Session', 'Session active with raw 16kHz PCM audio streaming & Gemini Live VAD');
        toast.success("Sierra is listening with live audio streaming!");
        return;
      }

      if (!Capacitor.isNativePlatform()) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: 1,
              sampleRate: 16000,
            },
          });
          mediaStreamRef.current = stream;
          await startAudioCapture();
        } catch (micErr: any) {
          if (micErr.name === 'NotAllowedError' || micErr.name === 'PermissionDeniedError') {
            throw new Error("Microphone access denied. Please allow microphone permissions in your browser or device settings.");
          }
          throw new Error("Unable to access microphone: " + (micErr.message || "Device error"));
        }
      } else {
        // Native Android: CapSpeechRecognition manages microphone hardware directly.
        // Stop any active Web Audio capture so Android SpeechRecognizer has exclusive mic access.
        stopAudioCapture();
      }

      setIsActive(true);
      isActiveRef.current = true;
      setIsConnecting(false);
      setConnectionError(null);
      isPausedRef.current = false;
      setIsPaused(false);
      hasLoggedPausedRef.current = false;
      consecutiveFailuresRef.current = 0;
      emptyCycleCountRef.current = 0;
      clientErrorRecoveryCountRef.current = 0;
      addDebugLog('Session', 'Session active, starting speech-to-text');
      if (isSpeakingRef.current || activeSourcesRef.current.length > 0) {
        addDebugLog('STT:WaitingForAudio', 'Session active, but recognizer start deferred: audio playback is active or queued');
        console.log("[Native STT] startSession deferred recognizer start because audio is playing or queued");
      } else {
        startSpeechToText();
      }
      toast.success("Sierra is listening!");
    } catch (error: any) {
      addDebugLog('Session:Error', error.message || 'Failed to start session');
      console.error("Failed to start voice session:", error);
      setIsConnecting(false);
      setConnectionError(error.message || "Failed to establish voice connection.");
      toast.error(error.message || "Failed to start live voice session");
      stopAudioCapture();
    }
  };

  const stopSession = (reason: 'user' | 'recovery_failed' | 'error' = 'user') => {
    if (reason === 'user') {
      addDebugLog('Session', '[Session] Stopped by user');
    } else if (reason === 'recovery_failed') {
      addDebugLog('Session', '[Session] Stopped after recovery failed');
    } else {
      addDebugLog('Session', `[Session] Stopped: ${reason}`);
    }
    setIsActive(false);
    isActiveRef.current = false;
    isRespondingRef.current = false;
    setIsConnecting(false);
    setIsSpeaking(false);
    isSpeakingRef.current = false;
    setUserSpeechDetected(false);
    isPausedRef.current = false;
    setIsPaused(false);
    hasLoggedPausedRef.current = false;
    consecutiveFailuresRef.current = 0;
    emptyCycleCountRef.current = 0;
    clientErrorRecoveryCountRef.current = 0;
    isStartingRef.current = false;
    isStartInFlightRef.current = false;
    isNativeListeningRef.current = false;
    liveWsTurnCompleteRef.current = false;
    currentTranscriptRef.current = '';

    cancelAllTimers();
    committedSessionRef.current = -1;
    terminalHandledSessionRef.current = -1;

    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch (e) {
        // ignore
      }
      sessionRef.current = null;
    }

    if (liveWsRef.current) {
      try {
        liveWsRef.current.onopen = null;
        liveWsRef.current.onmessage = null;
        liveWsRef.current.onerror = null;
        liveWsRef.current.onclose = null;
        liveWsRef.current.close(1000, "Session stopped by user");
      } catch (e) {
        // ignore
      }
      liveWsRef.current = null;
      liveWsReadyRef.current = false;
      liveWsConnectPromiseRef.current = null;
    }

    stopAudioCapture();
    stopSpeechToText();
    teardownNativeListeners();
    stopPlayback();
  };

  const handleMicTap = async () => {
    if (mode !== 'continuous') return;
    if (isActive) {
      if (voiceInputEngine === 'raw_streaming') {
        if (isPausedRef.current) {
          isPausedRef.current = false;
          setIsPaused(false);
          addDebugLog('MicStream:Resume', 'User resumed live mic streaming');
          await startAudioCapture();
          toast.success("Sierra is listening!");
        } else {
          stopSession('user');
        }
        return;
      }
      if (isPausedRef.current) {
        addDebugLog('STT:Resume', 'User tapped mic to resume listening from paused state');
        console.log("[Native STT:Resume] User tapped mic to resume from paused");

        // 1. Fully tear down any existing recognizer (await stop with timeout)
        isStoppingRef.current = true;
        if (Capacitor.isNativePlatform()) {
          try {
            await withNativeTimeout(CapSpeechRecognition.stop(), 1500, undefined, 'CapSpeechRecognition.stop()');
          } catch (_) {}
        }
        await teardownNativeListeners();
        isStoppingRef.current = false;
        lastStopTimeRef.current = Date.now();

        // 2. Ignore errorCode 5 and 7 for 1.5 seconds after that teardown
        resumeGracePeriodUntilRef.current = Date.now() + 1500;

        // 3. Reset all counters and flags (consecutiveFailures, clientErrorRecoveryCount, startupFailures, isPaused)
        consecutiveFailuresRef.current = 0;
        clientErrorRecoveryCountRef.current = 0;
        startupFailuresRef.current = 0;
        isPausedRef.current = false;
        setIsPaused(false);
        hasLoggedPausedRef.current = false;
        setConnectionError(null);

        // 4. Wait at least 750 ms
        await new Promise((resolve) => setTimeout(resolve, 750));

        if (!isActiveRef.current || isPausedRef.current) {
          return;
        }

        // 5. Start
        toast.success("Sierra is listening!");
        await setupNativeListeners();
        startSpeechToText();
      } else {
        stopSession();
      }
    } else {
      startSession();
    }
  };

  const setupNativeListeners = async () => {
    // Confirm listeners are registered once (no duplicate listeners from re-renders or repeated start calls)
    if (nativeListenersAttachedRef.current || isSettingUpListenersRef.current) {
      return;
    }
    isSettingUpListenersRef.current = true;

    addDebugLog('STT:Listeners', 'Setting up native partialResults and listeningState listeners...');
    console.log("[Native STT:Listeners] Setting up native partialResults and listeningState listeners...");

    try {
      // 1. partialResults listener
      nativeListenerRef.current = await withNativeTimeout(
        CapSpeechRecognition.addListener('partialResults', (data: { matches: string[]; sessionId?: number }) => {
          if (!isActiveRef.current || isPausedRef.current) return;
          const eventSessionId = (data as any)?.sessionId;
          if (eventSessionId !== undefined && eventSessionId !== sessionIdRef.current) {
            if (staleEventLoggedSessionRef.current !== eventSessionId) {
              staleEventLoggedSessionRef.current = eventSessionId;
              addDebugLog('STT:StaleEvent', `[Session #${eventSessionId} vs current #${sessionIdRef.current}] Ignored stale partialResults event`);
              console.warn(`[Native STT:StaleEvent] Ignored stale partialResults from session #${eventSessionId} (current is #${sessionIdRef.current})`);
            }
            return;
          }

          const currentSession = sessionIdRef.current;
          // Late partials for an already-committed session are ignored silently, not logged as 'Sierra speaking'
          if (committedSessionRef.current === currentSession) {
            return;
          }

          if (isSpeakingRef.current || isRespondingRef.current) {
            addDebugLog('partialResults', `[Session #${currentSession}] Ignored: Sierra currently speaking/responding`);
            return;
          }

          addDebugLog('partialResults', `[Session #${currentSession}] matches: ${JSON.stringify(data?.matches)}`);
          console.log(`[Native STT:partialResults:Session#${currentSession}] Matches:`, data?.matches);

          if (data?.matches && Array.isArray(data.matches) && data.matches.length > 0) {
            const topMatch = data.matches[0].trim();
            if (topMatch) {
              currentTranscriptRef.current = topMatch;
              setUserSpeechDetected(true);
              consecutiveFailuresRef.current = 0;
              clientErrorRecoveryCountRef.current = 0;
              startupFailuresRef.current = 0;
              addDebugLog('partialResults:Buffer', `[Session #${currentSession}] Buffer updated: "${topMatch}"`);
              console.log(`[Native STT:Buffer:Session#${currentSession}] "${topMatch}"`);

              // If a stopped event was waiting in the 400ms window, use this final match immediately!
              if (pendingCommitTimerRef.current) {
                clearTimeout(pendingCommitTimerRef.current);
                pendingCommitTimerRef.current = null;
                addDebugLog('STT:FinalMatchArrived', `[Session #${currentSession}] Final match arrived in 400ms window: "${topMatch}". Committing immediately.`);
                emptyCycleCountRef.current = 0;
                commitCurrentUtterance(currentSession);
                return;
              }

              if (silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current);
              }
              silenceTimerRef.current = setTimeout(() => {
                addDebugLog('STT:SilenceDebounce', `[Session #${currentSession}] Silence debounce fired (1200ms), committing: "${topMatch}"`);
                console.log(`[Native STT:SilenceDebounce:Session#${currentSession}] Committing utterance...`);
                commitCurrentUtterance(currentSession);
              }, 1200);
            }
          }
        }),
        2000,
        null,
        'CapSpeechRecognition.addListener("partialResults")'
      );

      // 2. listeningState listener
      nativeStateListenerRef.current = await withNativeTimeout(
        CapSpeechRecognition.addListener('listeningState', async (data: { status: 'started' | 'stopped' | 'ready' | 'endOfSpeech'; matches?: string[]; error?: string; errorCode?: number; sessionId?: number }) => {
          if (!isActiveRef.current || isPausedRef.current) {
            return;
          }
          const eventSessionId = (data as any)?.sessionId;
          if (eventSessionId !== undefined && eventSessionId !== sessionIdRef.current) {
            if (staleEventLoggedSessionRef.current !== eventSessionId) {
              staleEventLoggedSessionRef.current = eventSessionId;
              addDebugLog('STT:StaleEvent', `[Session #${eventSessionId} vs current #${sessionIdRef.current}] Ignored stale listeningState (${data?.status}) event`);
              console.warn(`[Native STT:StaleEvent] Ignored stale listeningState (${data?.status}) from session #${eventSessionId} (current is #${sessionIdRef.current})`);
            }
            return;
          }

          // Cancel started-confirmation timer on any listeningState event (Point 7)
          if (startedConfirmationTimerRef.current) {
            clearTimeout(startedConfirmationTimerRef.current);
            startedConfirmationTimerRef.current = null;
          }

          const currentSession = sessionIdRef.current;
          addDebugLog('listeningState', `[Session #${currentSession}] status: "${data?.status}", payload: ${JSON.stringify(data)}, buffer: "${currentTranscriptRef.current}"`);
          console.log(`[Native STT:listeningState:Session#${currentSession}] status=${data?.status}`, data);

          if (data?.status === 'ready') {
            sessionReadyTimeRef.current = Date.now();
            isNativeListeningRef.current = true;
            isStartingRef.current = false;
            isStartInFlightRef.current = false;
          } else if (data?.status === 'started') {
            sessionStartedTimeRef.current = Date.now();
            hasReachedStartedRef.current = true;
            isNativeListeningRef.current = true;
            isStartingRef.current = false;
            isStartInFlightRef.current = false;
            clientErrorRecoveryCountRef.current = 0; // Point 9: reset recovery counter
            emptyCycleCountRef.current = 0; // reset empty cycle backoff
            const now = Date.now();
            const elapsedFromStart = sessionRealStartTimeRef.current > 0 ? (now - sessionRealStartTimeRef.current) : 0;
            addDebugLog('STT:Started', `[Session #${currentSession}] Recognizer started (elapsed from session start: ${elapsedFromStart}ms)`);
            console.log(`[Native STT:Session#${currentSession}] Recognizer started (elapsed: ${elapsedFromStart}ms)`);
            if (recoveryStartedResolverRef.current) {
              recoveryStartedResolverRef.current(true);
              recoveryStartedResolverRef.current = null;
            }
          } else if (data?.status === 'endOfSpeech') {
            lastEndOfSpeechTimeRef.current = Date.now();
            addDebugLog('STT:EndOfSpeech', `[Session #${currentSession}] Speech pause detected, waiting for recognizer results...`);
          } else if (data?.status === 'stopped') {
            isNativeListeningRef.current = false;
            isStartingRef.current = false;
            isStartInFlightRef.current = false;

            // Process only the first terminal (stopped) event per session ID
            if (terminalHandledSessionRef.current === currentSession) {
              console.log(`[Native STT:listeningState:Session#${currentSession}] Duplicate stopped event ignored`);
              return;
            }
            terminalHandledSessionRef.current = currentSession;

            if (data?.matches && Array.isArray(data.matches) && data.matches.length > 0 && data.matches[0].trim()) {
              currentTranscriptRef.current = data.matches[0].trim();
              consecutiveFailuresRef.current = 0;
              clientErrorRecoveryCountRef.current = 0;
              emptyCycleCountRef.current = 0;
              startupFailuresRef.current = 0;
            }

            const errorCode = data?.errorCode;
            const isClientError = errorCode === 5 || (typeof data?.error === 'string' && data.error.toLowerCase().includes('client'));
            const isCode7Or11 = errorCode === 7 || errorCode === 11 || (typeof data?.error === 'string' && (data.error.toLowerCase().includes('no match') || data.error.toLowerCase().includes("didn't understand")));
            const now = Date.now();
            const elapsedFromStart = sessionRealStartTimeRef.current > 0 ? (now - sessionRealStartTimeRef.current) : 0;

            if (data?.error) {
              addDebugLog('STT:NativeError', `[Session #${currentSession}] Native recognizer reported: "${data.error}" (code: ${errorCode})`);
              console.warn(`[Native STT:NativeError:Session#${currentSession}]`, data.error, errorCode);
            }

            // Instant failure after playback: if session ends with code 11 in under 150ms, log STT:InstantFail, do not count toward emptyCycleCountRef, and retry after 1000ms
            if (errorCode === 11 && elapsedFromStart < 150 && !currentTranscriptRef.current.trim()) {
              addDebugLog('STT:InstantFail', `[Session #${currentSession}] Session ended with code 11 in ${elapsedFromStart}ms (<150ms). Retrying in 1000ms...`);
              console.warn(`[Native STT:InstantFail:Session#${currentSession}] Code 11 at ${elapsedFromStart}ms, retrying in 1000ms`);
              scheduleListeningRestart(1000);
              return;
            }

            // Resume tap grace period: ignore errorCode 5, 7, and 11 for 1.5s after teardown
            const inResumeGracePeriod = Date.now() < resumeGracePeriodUntilRef.current;
            if (inResumeGracePeriod && (errorCode === 5 || errorCode === 7 || errorCode === 11)) {
              addDebugLog('STT:IgnoreError', `[Session #${currentSession}] Ignored benign errorCode ${errorCode} during resume grace period`);
              console.log(`[Native STT:Session#${currentSession}] Ignored benign errorCode ${errorCode} during resume grace period`);
              return;
            }

            const isRecentCommit = (now - lastCommitTimeRef.current) < 3500;
            const isRecentEndOfSpeech = (now - lastEndOfSpeechTimeRef.current) < 3500;
            const isRecentStop = (now - lastStopTimeRef.current) < 3500;
            const isSpeakingOrResponding = isSpeakingRef.current || isRespondingRef.current || activeSourcesRef.current.length > 0;
            const isBenignClientError = isClientError && (isRecentCommit || isRecentEndOfSpeech || isRecentStop || isSpeakingOrResponding);

            if (isBenignClientError) {
              addDebugLog('STT:IgnoreClientError', `[Session #${currentSession}] Ignored benign errorCode 5 following utterance commit, stop, or reply playback`);
              console.log(`[Native STT:Session#${currentSession}] Ignored benign errorCode 5 following utterance commit/stop/playback`);
              return;
            }

            // Truncated endings: when listeningState reports "stopped" with a non-empty buffer,
            // wait ~400ms for a final partialResults/result event. If one arrives, use its top match;
            // otherwise commit the buffer. Commit exactly once per session.
            if (currentTranscriptRef.current.trim()) {
              const bufferedText = currentTranscriptRef.current.trim();
              addDebugLog('STT:StoppedWithBuffer', `[Session #${currentSession}] Stopped with buffer: "${bufferedText}". Waiting 400ms for final partialResults...`);
              if (pendingCommitTimerRef.current) {
                clearTimeout(pendingCommitTimerRef.current);
              }
              pendingCommitTimerRef.current = setTimeout(() => {
                pendingCommitTimerRef.current = null;
                if (!isActiveRef.current || isPausedRef.current) return;
                addDebugLog('STT:BufferCommitTimeout', `[Session #${currentSession}] 400ms window elapsed, committing buffered utterance: "${bufferedText}"`);
                emptyCycleCountRef.current = 0;
                startupFailuresRef.current = 0;
                consecutiveFailuresRef.current = 0;
                clientErrorRecoveryCountRef.current = 0;
                commitCurrentUtterance(currentSession);
              }, 400);
              return;
            }

            // Point 6: Treat errorCode 7 and 11 during recovery as benign
            if (isRecoveringFromClientErrorRef.current && isCode7Or11) {
              addDebugLog('STT:RecoveryBenign', `[Session #${currentSession}] Ignored benign errorCode ${errorCode} during client error recovery`);
              console.log(`[Native STT:Session#${currentSession}] Ignored benign errorCode ${errorCode} during recovery`);
              if (startedConfirmationTimerRef.current) {
                clearTimeout(startedConfirmationTimerRef.current);
                startedConfirmationTimerRef.current = null;
              }
              emptyCycleCountRef.current++;
              const backoffDelay = emptyCycleCountRef.current <= 1 ? 800 : 1200;
              scheduleListeningRestart(backoffDelay);
              return;
            }

            // Point 3 & Condition 3: Do not restart immediately on errorCode 7 or 11. Growing backoff 800ms, then 1200ms.
            if (isCode7Or11) {
              const timeSinceReady = sessionReadyTimeRef.current > 0 ? (now - sessionReadyTimeRef.current) : 999999;
              const isStartupFailure = (errorCode === 7) && (timeSinceReady <= 1200);

              if (isStartupFailure) {
                startupFailuresRef.current++;
                addDebugLog('STT:StartupFailure', `[Session #${currentSession}] Startup failure detected (${startupFailuresRef.current}/3, timeSinceReady: ${timeSinceReady}ms)`);
                if (startupFailuresRef.current >= 3) {
                  pauseListening("Speech recognizer failed to start after 3 attempts. Tap mic to retry.");
                  toast.error("Speech recognizer failed to start after 3 attempts.");
                  return;
                }
              }

              emptyCycleCountRef.current++;
              const backoffDelay = emptyCycleCountRef.current <= 1 ? 800 : 1200;
              addDebugLog('STT:EmptyCycle', `[Session #${currentSession}] Empty session (code: ${errorCode}, cycle #${emptyCycleCountRef.current}, elapsed: ${elapsedFromStart}ms). Restarting in ${backoffDelay}ms...`);
              console.log(`[Native STT:Session#${currentSession}] Empty session (code: ${errorCode}), restart in ${backoffDelay}ms`);
              scheduleListeningRestart(backoffDelay);
              return;
            }

            if (isClientError && !currentTranscriptRef.current.trim()) {
              await handleClientErrorRecovery(currentSession);
              return;
            }

            handleSilenceOrEmpty(currentSession);
          }
        }),
        2000,
        null,
        'CapSpeechRecognition.addListener("listeningState")'
      );

      nativeListenersAttachedRef.current = true;
      addDebugLog('STT:Listeners', 'Native listeners active and ready');
      console.log("[Native STT:Listeners] Native listeners active and ready");
    } catch (err: any) {
      nativeListenersAttachedRef.current = false;
      addDebugLog('STT:Listeners:Error', `Listener registration error: ${err?.message || String(err)}`);
      console.error("[Native STT:Listeners:Error] Registration error:", err);
    } finally {
      isSettingUpListenersRef.current = false;
    }
  };

  const startSpeechToText = async () => {
    // Audio playback check: Do not start while audio is playing or queued
    if (isSpeakingRef.current || activeSourcesRef.current.length > 0) {
      addDebugLog('STT:WaitingForAudio', 'Start deferred: audio playback is active or queued');
      console.log("[Native STT] startSpeechToText deferred because audio is playing or queued");
      return;
    }

    // In-flight guard: prevent concurrent start invocations
    if (
      isStartInFlightRef.current ||
      !isActiveRef.current ||
      isPausedRef.current ||
      isStartingRef.current ||
      isStoppingRef.current ||
      isNativeListeningRef.current ||
      isSpeakingRef.current ||
      isRespondingRef.current
    ) {
      console.log("[Native STT] startSpeechToText ignored: inFlight=", isStartInFlightRef.current, "active=", isActiveRef.current, "paused=", isPausedRef.current, "starting=", isStartingRef.current, "stopping=", isStoppingRef.current, "listening=", isNativeListeningRef.current, "speaking=", isSpeakingRef.current, "responding=", isRespondingRef.current);
      return;
    }

    isStartInFlightRef.current = true;

    try {
      // Wait at least 800 ms after any stop or teardown before calling start()
      const elapsedSinceStop = Date.now() - lastStopTimeRef.current;
      if (elapsedSinceStop < 800) {
        const waitTime = 800 - elapsedSinceStop;
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        if (!isActiveRef.current || isPausedRef.current || isStoppingRef.current || isSpeakingRef.current || activeSourcesRef.current.length > 0) {
          if (isSpeakingRef.current || activeSourcesRef.current.length > 0) {
            addDebugLog('STT:WaitingForAudio', 'Start aborted during gap wait: audio started playing');
          }
          return;
        }
      }

      // 1. Native Capacitor Speech Recognition on Android / iOS
      if (Capacitor.isNativePlatform()) {
        isStartingRef.current = true;

        // Monotonically increasing session ID stored in a ref
        const sessionId = ++sessionIdRef.current;
        sessionRealStartTimeRef.current = Date.now();
        currentCycleIdRef.current = sessionId;
        currentTranscriptRef.current = '';
        hasReachedStartedRef.current = false;
        sessionReadyTimeRef.current = 0;
        sessionStartedTimeRef.current = 0;

        // Cancellation check helper: abort if paused, stopped, or superseded
        const isStartCancelled = () => {
          return !isActiveRef.current || isPausedRef.current || isStoppingRef.current || sessionIdRef.current !== sessionId;
      };

      try {
        addDebugLog('STT:Start', `[Session #${sessionId}] Checking availability and permissions...`);
        console.log(`[Native STT:Start:Session#${sessionId}] Checking speech recognition availability...`);

        const available = await withNativeTimeout(
          CapSpeechRecognition.available(),
          2000,
          { available: false },
          'CapSpeechRecognition.available()'
        );

        // Checkpoint 1: after availability check
        if (isStartCancelled()) {
          addDebugLog('STT:Start:Aborted', `[Session #${sessionId}] Aborted after availability check (paused/stopped/superseded)`);
          isStartingRef.current = false;
          return;
        }

        addDebugLog('STT:Start', `available: ${available?.available}`);
        if (!available?.available) {
          addDebugLog('STT:Start', `[Session #${sessionId}] Native speech recognition unavailable`);
          console.warn(`[Native STT:Start:Session#${sessionId}] Native speech recognition unavailable on device`);
          toast.error("Device speech recognition engine not available");
          isStartingRef.current = false;
          pauseListening("Speech recognition engine not available on device");
          return;
        }

        // Check and request RECORD_AUDIO permission before starting
        const permStatus = await withNativeTimeout(
          CapSpeechRecognition.checkPermissions(),
          2000,
          { speechRecognition: 'prompt' as const },
          'CapSpeechRecognition.checkPermissions()'
        );

        // Checkpoint 2: after checkPermissions
        if (isStartCancelled()) {
          addDebugLog('STT:Start:Aborted', `[Session #${sessionId}] Aborted after checkPermissions (paused/stopped/superseded)`);
          isStartingRef.current = false;
          return;
        }

        addDebugLog('STT:Start', `permStatus: ${JSON.stringify(permStatus)}`);
        if (permStatus?.speechRecognition !== 'granted') {
          addDebugLog('STT:Start', `[Session #${sessionId}] Requesting speech recognition permissions...`);
          console.log(`[Native STT:Start:Session#${sessionId}] Requesting speech recognition permissions...`);
          const reqStatus = await withNativeTimeout(
            CapSpeechRecognition.requestPermissions(),
            15000,
            { speechRecognition: 'denied' as const },
            'CapSpeechRecognition.requestPermissions()'
          );

          // Checkpoint 3: after requestPermissions
          if (isStartCancelled()) {
            addDebugLog('STT:Start:Aborted', `[Session #${sessionId}] Aborted after requestPermissions (paused/stopped/superseded)`);
            isStartingRef.current = false;
            return;
          }

          addDebugLog('STT:Start', `reqStatus: ${JSON.stringify(reqStatus)}`);
          if (reqStatus?.speechRecognition !== 'granted') {
            addDebugLog('STT:Start', `[Session #${sessionId}] Microphone permission denied by user`);
            console.warn(`[Native STT:Start:Session#${sessionId}] Microphone permission denied by user`);
            toast.error("Microphone permission required for speech recognition");
            isStartingRef.current = false;
            pauseListening("Microphone permission denied by user");
            return;
          }
        }

        // Checkpoint 4: before setupNativeListeners
        if (isStartCancelled()) {
          addDebugLog('STT:Start:Aborted', `[Session #${sessionId}] Aborted before setupNativeListeners (paused/stopped/superseded)`);
          isStartingRef.current = false;
          return;
        }

        // Setup persistent listeners (registered once)
        await setupNativeListeners();

        // Checkpoint 5: immediately before calling CapSpeechRecognition.start
        if (isStartCancelled()) {
          addDebugLog('STT:Start:Aborted', `[Session #${sessionId}] Aborted immediately before CapSpeechRecognition.start (paused/stopped/superseded)`);
          isStartingRef.current = false;
          return;
        }

        // Recognition cycle timeout (12 seconds)
        if (recognitionTimeoutRef.current) {
          clearTimeout(recognitionTimeoutRef.current);
        }
        recognitionTimeoutRef.current = setTimeout(async () => {
          recognitionTimeoutRef.current = null;
          if (sessionIdRef.current !== sessionId) return;
          addDebugLog('STT:Timeout', `[Session #${sessionId}] 12s cycle timeout reached (buffer: "${currentTranscriptRef.current}")`);
          console.warn(`[Native STT:Timeout:Session#${sessionId}] 12s recognition cycle timeout reached`);
          if (currentTranscriptRef.current.trim()) {
            commitCurrentUtterance(sessionId);
          } else {
            if (isNativeListeningRef.current) {
              try {
                await withNativeTimeout(
                  CapSpeechRecognition.stop(),
                  1500,
                  undefined,
                  'CapSpeechRecognition.stop()'
                );
              } catch (_) {}
            }
            handleSilenceOrEmpty(sessionId);
          }
        }, RECOGNITION_TIMEOUT_MS);

        const startTime = Date.now();
        addDebugLog('STT:Start', `[Session #${sessionId}] Invoking CapSpeechRecognition.start({ sessionId: ${sessionId} })...`);
        console.log(`[Native STT:Start:Session#${sessionId}] Invoking start...`);

        let result: any = null;
        try {
          result = await CapSpeechRecognition.start({
            language: 'en-US',
            maxResults: 5,
            prompt: '',
            popup: false,
            partialResults: true,
            sessionId: sessionId,
          } as any);
          const elapsed = Date.now() - startTime;
          addDebugLog('STT:Start', `[Session #${sessionId}] CapSpeechRecognition.start resolved in ${elapsed}ms with: ${JSON.stringify(result)}`);
          console.log(`[Native STT:Start:Session#${sessionId}] Resolved in ${elapsed}ms:`, result);
        } catch (startErr: any) {
          const elapsed = Date.now() - startTime;
          addDebugLog('STT:Start', `[Session #${sessionId}] CapSpeechRecognition.start rejected in ${elapsed}ms: ${startErr?.message || JSON.stringify(startErr)}`);
          console.error(`[Native STT:Start:Session#${sessionId}] Rejected in ${elapsed}ms:`, startErr);
          throw startErr;
        }

        isNativeListeningRef.current = true;
        isStartingRef.current = false;

        // If the platform returns matches directly in the start resolution
        if (result?.matches && Array.isArray(result.matches) && result.matches.length > 0 && result.matches[0].trim()) {
          addDebugLog('STT:Start', `[Session #${sessionId}] Direct matches returned on resolve: "${result.matches[0]}"`);
          console.log(`[Native STT:Start:Session#${sessionId}] Direct matches:`, result.matches[0]);
          currentTranscriptRef.current = result.matches[0].trim();
          consecutiveFailuresRef.current = 0;
          clientErrorRecoveryCountRef.current = 0;
          emptyCycleCountRef.current = 0;
          startupFailuresRef.current = 0;
        }

        return;
      } catch (nativeErr: any) {
        isStartingRef.current = false;
        if (startedConfirmationTimerRef.current) {
          clearTimeout(startedConfirmationTimerRef.current);
          startedConfirmationTimerRef.current = null;
        }
        if (recognitionTimeoutRef.current) {
          clearTimeout(recognitionTimeoutRef.current);
          recognitionTimeoutRef.current = null;
        }
        isNativeListeningRef.current = false;
        setUserSpeechDetected(false);
        addDebugLog('STT:Error', `Exception: ${nativeErr?.message || JSON.stringify(nativeErr)}`);
        console.error("[Native STT:Error] CapSpeechRecognition.start caught exception:", nativeErr);

        if (currentTranscriptRef.current.trim()) {
          console.log("[Native STT:Error] Rescuing buffered transcript after error:", currentTranscriptRef.current);
          commitCurrentUtterance(sessionId);
          return;
        }

        const errMsg = String(nativeErr?.message || '');
        const isClientErr = errMsg.includes('5') || errMsg.toLowerCase().includes('client');

        const now = Date.now();
        const isRecentCommit = (now - lastCommitTimeRef.current) < 3500;
        const isRecentEndOfSpeech = (now - lastEndOfSpeechTimeRef.current) < 3500;
        const isRecentStop = (now - lastStopTimeRef.current) < 3500;
        const isSpeakingOrResponding = isSpeakingRef.current || isRespondingRef.current || activeSourcesRef.current.length > 0;
        const isBenignClientErr = isClientErr && (isRecentCommit || isRecentEndOfSpeech || isRecentStop || isSpeakingOrResponding);

        if (isBenignClientErr) {
          addDebugLog('STT:IgnoreClientError', `Ignored benign client error on start following recent commit/stop/playback`);
          return;
        }

        if (isClientErr) {
          await handleClientErrorRecovery(sessionId);
          return;
        }

        if (isActiveRef.current && !isPausedRef.current && !isSpeakingRef.current && !isRespondingRef.current && mode === 'continuous' && activeSourcesRef.current.length === 0) {
          consecutiveFailuresRef.current++;
          console.log(`[Native STT:Error] Retry counter: ${consecutiveFailuresRef.current}/${MAX_RECOGNITION_RETRIES}`);
          if (consecutiveFailuresRef.current >= MAX_RECOGNITION_RETRIES) {
            console.warn("[Native STT:Error] Continuous recognition halted: max error retries reached.");
            pauseListening(`Continuous listening paused after ${MAX_RECOGNITION_RETRIES} empty cycles. Tap mic to resume.`);
            toast.error("Speech recognition paused due to repeated device errors.");
            return;
          }
          const backoff = getBackoffDelay(consecutiveFailuresRef.current);
          scheduleListeningRestart(backoff);
        }
        return;
      }
    }

    // 2. Web browser fallback for development environment
    console.log("[Web STT:Start] Initializing browser SpeechRecognition fallback");
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("[Web STT:Start] Speech recognition is not supported in this environment");
      return;
    }

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.abort();
      } catch (_) {}
      speechRecognitionRef.current = null;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        if (isSpeakingRef.current || isRespondingRef.current || activeSourcesRef.current.length > 0) return;

        let interimText = '';
        let finalPhrase = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const text = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalPhrase += text;
          } else {
            interimText += text;
          }
        }

        if (interimText.trim()) {
          setUserSpeechDetected(true);
        }

        if (finalPhrase.trim()) {
          const userText = finalPhrase.trim();
          addDebugLog('WebSTT:Result', `Captured final phrase: "${userText}"`);
          console.log("[Web STT:Result] Captured final phrase:", userText);
          setUserSpeechDetected(false);
          consecutiveFailuresRef.current = 0;
          emptyCycleCountRef.current = 0;
          console.log("[Web STT:Handoff] Passing to handleUserUtterance:", userText);
          handleUserUtterance(userText);
        }
      };

      recognition.onerror = (event: any) => {
        addDebugLog('WebSTT:Error', `error: ${event.error}`);
        if (event.error === 'no-speech' || event.error === 'audio-capture') {
          return;
        }
        console.warn("[Web STT:Error] Browser speech recognition error:", event.error);
      };

      recognition.onend = () => {
        console.log("[Web STT:End] Browser speech recognition ended");
        if (isActiveRef.current && !isSpeakingRef.current && !isRespondingRef.current && mode === 'continuous' && activeSourcesRef.current.length === 0) {
          scheduleListeningRestart(400);
        }
      };

      recognition.start();
      speechRecognitionRef.current = recognition;
    } catch (e) {
      console.warn("[Web STT:Error] Web Speech recognition STT init error:", e);
    }
  } finally {
    isStartInFlightRef.current = false;
  }
};

  const teardownNativeListeners = async () => {
    isStoppingRef.current = true;
    if (nativeListenerRef.current) {
      try {
        await withNativeTimeout(nativeListenerRef.current.remove(), 1000, undefined, 'nativeListener.remove()');
      } catch (_) {}
      nativeListenerRef.current = null;
    }
    if (nativeStateListenerRef.current) {
      try {
        await withNativeTimeout(nativeStateListenerRef.current.remove(), 1000, undefined, 'nativeStateListener.remove()');
      } catch (_) {}
      nativeStateListenerRef.current = null;
    }
    nativeListenersAttachedRef.current = false;
    isNativeListeningRef.current = false;
    isStoppingRef.current = false;
    lastStopTimeRef.current = Date.now();
  };

  const stopSpeechToText = async () => {
    lastStopTimeRef.current = Date.now();
    console.log("[Native STT:Stop] stopSpeechToText called");
    if (pendingCommitTimerRef.current) {
      clearTimeout(pendingCommitTimerRef.current);
      pendingCommitTimerRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (recognitionTimeoutRef.current) {
      clearTimeout(recognitionTimeoutRef.current);
      recognitionTimeoutRef.current = null;
    }

    if (Capacitor.isNativePlatform()) {
      isStoppingRef.current = true;
      isNativeListeningRef.current = false;
      isStartingRef.current = false;
      setUserSpeechDetected(false);
      try {
        await withNativeTimeout(CapSpeechRecognition.stop(), 1500, undefined, 'CapSpeechRecognition.stop()');
      } catch (_) {}
      isStoppingRef.current = false;
      lastStopTimeRef.current = Date.now();
      console.log("[Native STT:Stop] Native recognizer stopped");
      return;
    }

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.abort();
      } catch (e) {
        // ignore
      }
      speechRecognitionRef.current = null;
    }
  };

  const sendRawAudioChunk = (pcmBuffer: ArrayBuffer) => {
    if (mode === 'push' && !isPushing) return;
    const ws = liveWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !liveWsReadyRef.current) return;

    let binary = '';
    const bytes = new Uint8Array(pcmBuffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Data = btoa(binary);

    try {
      ws.send(JSON.stringify({
        realtimeInput: {
          audio: {
            mimeType: "audio/pcm;rate=16000",
            data: base64Data
          }
        }
      }));
    } catch (sendErr) {
      console.warn("[LiveWS:MicStream] Failed sending audio chunk:", sendErr);
    }
  };

  const startAudioCapture = async () => {
    try {
      addDebugLog('MicStream:Init', 'Starting 16kHz PCM audio capture pipeline...');
      const stream = mediaStreamRef.current || await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      });
      mediaStreamRef.current = stream;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const source = audioCtx.createMediaStreamSource(stream);
      sourceRef.current = source;

      // AudioWorklet for ~100ms chunks (1600 samples at 16000Hz mono PCM16) with hardware sample-rate downsampling
      const workletCode = `
        class PCM16StreamingProcessor extends AudioWorkletProcessor {
          constructor() {
            super();
            this.buffer = [];
            this.targetChunkSize = 1600; // ~100ms at 16000 Hz
          }
          process(inputs) {
            const input = inputs[0];
            if (!input || !input[0]) return true;
            const channel = input[0];
            const inLen = channel.length;
            const ratio = sampleRate / 16000;
            if (ratio > 1.05 || ratio < 0.95) {
              for (let i = 0; i < inLen; i += ratio) {
                this.buffer.push(channel[Math.floor(i)]);
                if (this.buffer.length >= this.targetChunkSize) {
                  this.flush();
                }
              }
            } else {
              for (let i = 0; i < inLen; i++) {
                this.buffer.push(channel[i]);
                if (this.buffer.length >= this.targetChunkSize) {
                  this.flush();
                }
              }
            }
            return true;
          }
          flush() {
            const pcm16 = new Int16Array(this.targetChunkSize);
            for (let j = 0; j < this.targetChunkSize; j++) {
              const s = Math.max(-1, Math.min(1, this.buffer[j]));
              pcm16[j] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
            this.buffer = [];
          }
        }
        registerProcessor('pcm16-live-processor', PCM16StreamingProcessor);
      `;

      let workletActive = false;
      try {
        const blob = new Blob([workletCode], { type: 'application/javascript' });
        const workletUrl = URL.createObjectURL(blob);
        await audioCtx.audioWorklet.addModule(workletUrl);
        URL.revokeObjectURL(workletUrl);

        const workletNode = new AudioWorkletNode(audioCtx, 'pcm16-live-processor');
        micWorkletNodeRef.current = workletNode;

        workletNode.port.onmessage = (e: MessageEvent) => {
          sendRawAudioChunk(e.data);
        };

        source.connect(workletNode);
        const muteNode = audioCtx.createGain();
        muteNode.gain.setValueAtTime(0, audioCtx.currentTime);
        workletNode.connect(muteNode);
        muteNode.connect(audioCtx.destination);
        workletActive = true;
        addDebugLog('MicStream:WorkletActive', 'AudioWorklet active emitting ~100ms 16kHz PCM chunks');
      } catch (workletErr) {
        console.warn("[MicStream] AudioWorklet init failed, falling back to ScriptProcessor:", workletErr);
        addDebugLog('MicStream:WorkletFallback', 'Falling back to ScriptProcessorNode');
      }

      if (!workletActive) {
        // Fallback ScriptProcessorNode
        const processor = audioCtx.createScriptProcessor(2048, 1, 1);
        processorRef.current = processor;
        const accumulator: number[] = [];
        const targetChunk = 1600;

        processor.onaudioprocess = (e) => {
          if (mode === 'push' && !isPushing) {
            setUserSpeechDetected(false);
            return;
          }
          const inputData = e.inputBuffer.getChannelData(0);
          const ratio = audioCtx.sampleRate / 16000;
          if (ratio > 1.05 || ratio < 0.95) {
            for (let i = 0; i < inputData.length; i += ratio) {
              accumulator.push(inputData[Math.floor(i)]);
              if (accumulator.length >= targetChunk) {
                flushScript();
              }
            }
          } else {
            for (let i = 0; i < inputData.length; i++) {
              accumulator.push(inputData[i]);
              if (accumulator.length >= targetChunk) {
                flushScript();
              }
            }
          }
        };

        const flushScript = () => {
          const pcm16 = new Int16Array(targetChunk);
          for (let j = 0; j < targetChunk; j++) {
            const s = Math.max(-1, Math.min(1, accumulator[j]));
            pcm16[j] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          accumulator.length = 0;
          sendRawAudioChunk(pcm16.buffer);
        };

        const muteNode = audioCtx.createGain();
        muteNode.gain.setValueAtTime(0, audioCtx.currentTime);
        source.connect(processor);
        processor.connect(muteNode);
        muteNode.connect(audioCtx.destination);
        addDebugLog('MicStream:ScriptNodeActive', 'ScriptProcessor active emitting ~100ms 16kHz PCM chunks');
      }

      isMicStreamingRef.current = true;
      setUserSpeechDetected(true);
    } catch (error: any) {
      console.error("Audio capture initialization error:", error);
      addDebugLog('MicStream:Error', error.message || String(error));
      setConnectionError("Microphone hardware error: " + (error.message || "Failed to initialize audio."));
    }
  };

  const stopAudioCapture = () => {
    isMicStreamingRef.current = false;
    if (micWorkletNodeRef.current) {
      try {
        micWorkletNodeRef.current.disconnect();
      } catch (_) {}
      micWorkletNodeRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {
        // ignore
      }
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    setUserSpeechDetected(false);
  };

  // CRITICAL FIX: Single persistent AudioContext and timeline queue to eliminate AudioContext leaks and freezing
  const playAudio = async (base64Data: string) => {
    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }

    setIsSpeaking(true);
    isSpeakingRef.current = true;

    try {
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const pcmData = new Int16Array(bytes.buffer);
      const floatData = new Float32Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) {
        floatData[i] = pcmData[i] / 0x7FFF;
      }

      // Re-use single persistent playback AudioContext
      if (!playbackContextRef.current || playbackContextRef.current.state === 'closed') {
        playbackContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }

      const audioCtx = playbackContextRef.current;
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const buffer = audioCtx.createBuffer(1, floatData.length, 24000);
      buffer.getChannelData(0).set(floatData);

      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);

      activeSourcesRef.current.push(source);

      // Schedule continuously on timeline for gap-free playback
      const startTime = Math.max(audioCtx.currentTime, nextPlayTimeRef.current);
      source.start(startTime);
      nextPlayTimeRef.current = startTime + buffer.duration;

      source.onended = () => {
        activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
        if (activeSourcesRef.current.length === 0) {
          setIsSpeaking(false);
          isSpeakingRef.current = false;
          checkAndRestartListeningAfterTurn();
        }
      };
    } catch (playbackErr) {
      console.error("Audio playback error:", playbackErr);
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      checkAndRestartListeningAfterTurn();
    }
  };

  const stopPlayback = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (_) {}
    }
    activeSourcesRef.current.forEach(source => {
      try {
        source.stop();
      } catch (e) {
        // ignore
      }
    });
    activeSourcesRef.current = [];
    nextPlayTimeRef.current = 0;
    setIsSpeaking(false);
    isSpeakingRef.current = false;
  };

  return (
    <div className="flex-1 flex flex-col items-center h-full max-h-full bg-zinc-950 relative overflow-hidden font-sans p-3 sm:p-6">
      {/* Background Ambience */}
      <div className="absolute inset-0 pointer-events-none">
        <div className={cn(
          "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] rounded-full blur-[140px] transition-all duration-1000",
          isActive ? (isSpeaking ? "bg-purple-600/25 scale-110" : "bg-indigo-600/15 scale-100") : "bg-zinc-900/20 scale-90"
        )} />
      </div>

      {/* PINNED HEADER AREA: mic button & session status controls never scroll away */}
      <div className="w-full max-w-md relative z-20 shrink-0 flex flex-col items-center space-y-2 text-center">
        {/* Top Badges & Debug Log Toggle Button (Fix 3) */}
        <div className="w-full flex items-center justify-between gap-2 px-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900/90 border border-zinc-800 shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">Sierra Neural Voice</span>
          </div>

          {/* Toggle Button for Debug Log (Fix 3: opens on demand rather than always visible inline) */}
          <button
            type="button"
            onClick={() => setIsDebugLogOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900/90 hover:bg-zinc-800 active:bg-zinc-750 border border-amber-500/30 text-[10px] font-semibold text-amber-300 transition-all shadow-sm active:scale-95 touch-manipulation"
            title="Open Diagnostic Pipeline Logs"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span>Debug Log</span>
            {debugLogs.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-[9px] font-mono text-amber-300">
                {debugLogs.length}
              </span>
            )}
          </button>
        </div>

        {/* Title and subtitle (compact on mobile) */}
        <div className="hidden sm:block">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-100">Natural Voice</h1>
          <p className="text-zinc-400 text-xs">Real-time, zero-latency natural spoken conversation.</p>
        </div>

        {/* Voice Character Select & Mode Bar */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-0.5">
          {/* Voice Character Select */}
          <div className="flex items-center gap-1 bg-zinc-900/80 p-1 rounded-xl border border-zinc-800 text-xs">
            <span className="text-[10px] font-bold text-zinc-500 uppercase px-1.5">Voice:</span>
            {(['Aoede', 'Zephyr', 'Kore', 'Puck'] as const).map(v => (
              <button
                key={v}
                onClick={() => setSelectedVoice(v)}
                disabled={isActive}
                className={cn(
                  "px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[11px] sm:text-xs font-semibold transition-all",
                  selectedVoice === v ? "bg-purple-600/30 text-purple-300 border border-purple-500/40" : "text-zinc-400 hover:text-zinc-200",
                  isActive ? "opacity-50 cursor-not-allowed" : ""
                )}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Mode Switch */}
          <div className="bg-zinc-900/80 p-1 rounded-xl border border-zinc-800 flex text-xs">
            <button
              onClick={() => setMode('continuous')}
              className={cn(
                "px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-lg font-bold uppercase tracking-wider transition-all text-[10px] sm:text-[11px]",
                mode === 'continuous' ? "bg-zinc-800 text-white shadow-inner" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              Continuous
            </button>
            <button
              onClick={() => setMode('push')}
              className={cn(
                "px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-lg font-bold uppercase tracking-wider transition-all text-[10px] sm:text-[11px]",
                mode === 'push' ? "bg-zinc-800 text-white shadow-inner" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              Push-to-Talk
            </button>
          </div>
        </div>

        {/* Live Voice Model & Provider Config (Collapsible on mobile) */}
        <div className="w-full bg-zinc-900/90 border border-zinc-800/90 rounded-2xl p-2.5 sm:p-3 shadow-lg text-left backdrop-blur-md">
          <button
            type="button"
            onClick={() => setIsConfigExpanded(!isConfigExpanded)}
            className="w-full flex items-center justify-between pb-1 border-b border-zinc-800/60 text-left cursor-pointer"
          >
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              Live Voice Model & Provider Config
            </span>
            <div className="flex items-center gap-1.5">
              {customVoiceModel.trim() ? (
                <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  Override: {customVoiceModel.trim()}
                </span>
              ) : (
                <span className="text-[9px] font-mono text-zinc-500">
                  {voiceModel}
                </span>
              )}
              <ChevronDown className={cn("w-3.5 h-3.5 text-zinc-500 transition-transform duration-200", isConfigExpanded ? "rotate-180" : "")} />
            </div>
          </button>

          {/* Config fields - expanded on desktop or when toggled */}
          <div className={cn("space-y-2.5 pt-2", !isConfigExpanded && "hidden sm:block")}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">
                  Model Dropdown
                </label>
                <Select value={voiceModel} onValueChange={setVoiceModel} disabled={isActive}>
                  <SelectTrigger className="w-full bg-zinc-950 border-zinc-800 text-zinc-200 text-xs h-9 rounded-xl">
                    <SelectValue placeholder="Select live voice model" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200 text-xs">
                    {LIVE_VOICE_MODELS.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="text-xs">
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">
                  Custom Model Override
                </label>
                <Input
                  placeholder="Type model name (e.g. gemini-3.8-live)"
                  value={customVoiceModel}
                  onChange={(e) => setCustomVoiceModel(e.target.value)}
                  disabled={isActive}
                  className="bg-zinc-950 border-zinc-800 text-zinc-200 text-xs h-9 rounded-xl placeholder:text-zinc-600"
                />
              </div>
            </div>

            <div className="pt-1.5 border-t border-zinc-800/60 space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <label className="text-zinc-400 font-semibold flex items-center gap-1">
                  <Volume2 className="w-3 h-3 text-indigo-400" />
                  Live Voice WebSocket Endpoint URL:
                </label>
                <button
                  type="button"
                  onClick={() => setLiveWsEndpoint(DEFAULT_LIVE_WEBSOCKET_URL)}
                  disabled={isActive}
                  className="text-[10px] text-purple-400 hover:text-purple-300 underline font-sans disabled:opacity-50"
                >
                  Reset to default
                </button>
              </div>
              <Input
                value={liveWsEndpoint}
                onChange={(e) => setLiveWsEndpoint(e.target.value)}
                disabled={isActive}
                placeholder={DEFAULT_LIVE_WEBSOCKET_URL}
                className="bg-zinc-950 border-zinc-800 text-zinc-300 font-mono text-[10.5px] h-8 rounded-lg"
              />
            </div>

            {/* Input Engine and Content Mode Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1.5 border-t border-zinc-800/60">
              <div>
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">
                  Voice Input Engine
                </label>
                <Select
                  value={voiceInputEngine}
                  onValueChange={(val: 'raw_streaming' | 'native_recognizer') => {
                    setVoiceInputEngine(val);
                    if (typeof localStorage !== 'undefined') {
                      localStorage.setItem('sierra_voice_input_engine', val);
                    }
                  }}
                  disabled={isActive}
                >
                  <SelectTrigger className="w-full bg-zinc-950 border-zinc-800 text-zinc-200 text-xs h-9 rounded-xl">
                    <SelectValue placeholder="Select input engine" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200 text-xs">
                    <SelectItem value="raw_streaming" className="text-xs">
                      Raw Mic Streaming (Gemini Live VAD - Fast)
                    </SelectItem>
                    <SelectItem value="native_recognizer" className="text-xs">
                      Native SpeechRecognizer (Fallback)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col justify-end">
                <div className="flex items-center justify-between text-xs px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 h-9">
                  <span className="text-[11px] text-zinc-400">Content Mode:</span>
                  <span className={cn(
                    "text-[11px] font-bold uppercase tracking-wider",
                    contentMode === 'mature' ? "text-rose-400" : "text-emerald-400"
                  )}>
                    {contentMode === 'mature' ? 'Mature 18+' : 'SFW'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Interactive Mic Orb & Session Status Controls (Pinned, always visible and tappable) */}
        <div className="relative flex flex-col items-center justify-center my-2 sm:my-3 z-20 shrink-0">
          <AnimatePresence mode="wait">
            {(isActive && (mode === 'continuous' || isPushing)) && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
              >
                {[...Array(3)].map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{
                      scale: isSpeaking ? [1, 1.8, 1] : (userSpeechDetected ? [1, 1.4, 1] : [1, 1.2, 1]),
                      opacity: isSpeaking ? [0.4, 0, 0.4] : [0.2, 0, 0.2],
                    }}
                    transition={{
                      duration: isSpeaking ? 1.4 : 2.0,
                      repeat: Infinity,
                      delay: i * 0.4,
                    }}
                    className={cn(
                      "absolute w-36 h-36 sm:w-44 sm:h-44 rounded-full border",
                      isSpeaking ? "border-purple-500/50 bg-purple-500/5" : "border-indigo-500/30"
                    )}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onMouseDown={() => mode === 'push' && setIsPushing(true)}
            onMouseUp={() => mode === 'push' && setIsPushing(false)}
            onMouseLeave={() => mode === 'push' && setIsPushing(false)}
            onTouchStart={() => mode === 'push' && setIsPushing(true)}
            onTouchEnd={() => mode === 'push' && setIsPushing(false)}
            onClick={handleMicTap}
            disabled={isConnecting}
            aria-label={isActive ? (isPaused ? "Resume voice session" : "End voice session") : "Start voice session"}
            className={cn(
              "w-28 h-28 sm:w-36 sm:h-36 rounded-full flex flex-col items-center justify-center transition-all duration-500 relative z-20 shadow-2xl focus:outline-none touch-manipulation",
              isActive 
                ? (isSpeaking 
                    ? "bg-purple-950/80 border-2 border-purple-400 text-purple-300 shadow-purple-500/30 scale-105" 
                    : (userSpeechDetected || isPushing
                        ? "bg-zinc-900 border-2 border-indigo-400 text-indigo-300 shadow-indigo-500/20" 
                        : (isPaused
                            ? "bg-amber-950/40 border-2 border-amber-500/60 text-amber-300 shadow-amber-500/20"
                            : "bg-zinc-900 border border-zinc-700 text-zinc-300")))
                : "bg-zinc-900 border border-zinc-800 text-zinc-500 hover:border-purple-500/50 hover:text-purple-400"
            )}
          >
            {isConnecting ? (
              <Loader2 className="w-10 h-10 sm:w-12 sm:h-12 animate-spin text-purple-400" />
            ) : isActive ? (
              <>
                {isSpeaking ? (
                  <Volume2 className="w-10 h-10 sm:w-12 sm:h-12 animate-pulse text-purple-400" />
                ) : isPaused ? (
                  <MicOff className="w-10 h-10 sm:w-12 sm:h-12 text-amber-400" />
                ) : (
                  <Mic className={cn("w-10 h-10 sm:w-12 sm:h-12", userSpeechDetected ? "text-indigo-400 animate-pulse" : "text-zinc-300")} />
                )}
                <span className="text-[10px] font-bold uppercase tracking-wider mt-1 text-zinc-400">
                  {isSpeaking ? "Speaking" : (userSpeechDetected ? "Hearing you" : (isPaused ? "Paused • Tap mic" : "Listening"))}
                </span>
              </>
            ) : (
              <>
                <MicOff className="w-10 h-10 sm:w-12 sm:h-12 text-zinc-500" />
                <span className="text-[10px] font-bold uppercase tracking-wider mt-1 text-zinc-500">Tap to Start</span>
              </>
            )}
          </button>

          {/* Connection Error Notification */}
          {connectionError && (
            <div className="mt-2 sm:mt-3 p-2.5 bg-red-950/60 border border-red-800 rounded-xl text-red-300 text-xs flex items-center gap-2 max-w-sm">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <p className="flex-1 text-[11px]">{connectionError}</p>
              <Button size="sm" variant="ghost" onClick={startSession} className="h-6 px-2 text-[11px] text-red-200 hover:bg-red-900/50">
                <RefreshCw className="w-3 h-3 mr-1" /> Retry
              </Button>
            </div>
          )}

          {mode === 'push' && !isActive && (
            <div className="text-center mt-2">
              <Button 
                onClick={startSession}
                variant="outline"
                className="border-zinc-800 text-zinc-300 hover:bg-zinc-900 rounded-xl px-5 py-2 font-semibold text-xs uppercase tracking-wider"
              >
                Start Sierra Voice Channel
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Live Transcript Container: Scrolls internally within its own container */}
      <div className="flex-1 min-h-0 w-full max-w-md relative z-10 flex flex-col my-1 sm:my-2 overflow-hidden">
        {/* Live Subtitle Transcript Box */}
        <div className="flex-1 min-h-[140px] bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-3 sm:p-4 shadow-xl backdrop-blur-md overflow-hidden flex flex-col">
          <div className="flex items-center justify-between text-[10px] font-bold text-zinc-500 uppercase tracking-widest pb-1 border-b border-zinc-800/50 shrink-0 mb-2">
            <div className="flex items-center gap-1.5">
              <MessageSquare className="w-3 h-3 text-purple-400" />
              <span>Live Dialogue & Transcripts</span>
            </div>
            {isActive && (
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Live Link Active
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {transcripts.length === 0 ? (
              <p className="text-xs text-zinc-600 text-center py-6 italic">
                {isActive ? "Speak naturally. Real-time words and Sierra's answers will appear here." : "Start session to begin speaking with Sierra."}
              </p>
            ) : (
              transcripts.map(t => (
                <div 
                  key={t.id} 
                  className={cn(
                    "text-xs p-2.5 rounded-xl transition-all",
                    t.sender === 'user' 
                      ? "bg-zinc-800/60 text-zinc-200 border border-zinc-700/40 ml-4" 
                      : "bg-purple-950/40 text-purple-200 border border-purple-800/40 mr-4"
                  )}
                >
                  <span className="text-[10px] font-extrabold block uppercase tracking-wider text-zinc-400 mb-0.5">
                    {t.sender === 'user' ? 'You' : 'Sierra'}
                  </span>
                  <p className="leading-relaxed">{t.text}</p>
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>

        <p className="text-center text-[11px] text-zinc-500 shrink-0 pt-1.5 px-2">
          {isConnecting ? "Connecting to Sierra neural model..." : 
           isActive ? (
             mode === 'push' 
               ? (isPushing ? "Listening to your voice..." : "Hold the orb to speak, release to hear Sierra.") 
               : (isSpeaking ? "Sierra is speaking..." : "Listening continuously. Talk whenever you're ready.")
           ) : "Tap the orb above to begin a natural conversation."}
        </p>
      </div>

      {/* On-Demand Diagnostic Pipeline Debug Log Modal / Bottom Sheet (Fix 3) */}
      {isDebugLogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
        >
          {/* Backdrop click to close */}
          <div className="absolute inset-0" onClick={() => setIsDebugLogOpen(false)} />

          <div className="relative z-10 bg-zinc-950 border border-amber-500/40 rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col p-4 shadow-2xl space-y-3 animate-in fade-in slide-in-from-bottom-6 sm:zoom-in-95">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <div className="flex items-center gap-1.5 text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider">Pipeline Stage Debug Output</span>
                <span className="text-zinc-500 font-mono text-[10px]">({debugLogs.length} events)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFallbackLogText(formatDebugLogs(debugLogs));
                    setIsFallbackModalOpen(true);
                  }}
                  disabled={debugLogs.length === 0}
                  className="text-[10px] text-zinc-400 hover:text-zinc-200 underline font-sans flex items-center gap-1 disabled:opacity-30 disabled:no-underline"
                >
                  <FileText className="w-3 h-3" />
                  <span>View Text</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(true)}
                  disabled={debugLogs.length === 0}
                  className="text-[10px] text-zinc-400 hover:text-red-300 underline font-sans disabled:opacity-30 disabled:no-underline"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setIsDebugLogOpen(false)}
                  className="p-1 text-zinc-400 hover:text-white rounded-lg active:bg-zinc-800"
                  aria-label="Close debug logs"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Log event scroll area */}
            <div className="font-mono text-[10.5px] leading-relaxed flex-1 min-h-[160px] max-h-64 sm:max-h-80 overflow-y-auto space-y-1 pr-1 bg-black/60 p-2.5 rounded-xl border border-zinc-900">
              {debugLogs.length === 0 ? (
                <p className="text-zinc-500 italic py-4 text-center font-sans text-xs">
                  No pipeline events logged yet. Tap the orb to trigger speech recognition.
                </p>
              ) : (
                debugLogs.map((log) => (
                  <div key={log.id} className="border-b border-zinc-900/80 pb-0.5">
                    <span className="text-zinc-500">[{log.time}]</span>{' '}
                    <span className={cn(
                      "font-bold",
                      log.stage.includes('Error') || log.stage.includes('Catch') ? "text-red-400" :
                      log.stage.includes('partialResults') ? "text-cyan-300" :
                      log.stage.includes('listeningState') ? "text-yellow-300" :
                      log.stage.includes('commit') ? "text-emerald-400" :
                      log.stage.includes('streamChat') ? "text-purple-300" : "text-amber-300"
                    )}>
                      [{log.stage}]
                    </span>{' '}
                    <span className="text-zinc-300 break-all">{log.detail}</span>
                  </div>
                ))
              )}
              <div ref={debugScrollRef} />
            </div>

            {/* Clear confirmation prompt */}
            {showClearConfirm && (
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-red-950/70 border border-red-500/50 rounded-xl text-xs">
                <div className="flex items-center gap-1.5 text-red-200 font-medium">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>Clear all {debugLogs.length} events?</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleClearConfirm}
                    className="min-h-[38px] px-3.5 py-1.5 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white rounded-lg font-semibold text-xs flex items-center justify-center transition-all active:scale-95 shadow-sm"
                  >
                    Yes, Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowClearConfirm(false)}
                    className="min-h-[38px] px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-750 text-zinc-300 rounded-lg text-xs flex items-center justify-center transition-all active:scale-95"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Diagnostic Export and Management Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                onClick={() => copyDebugLogs()}
                disabled={debugLogs.length === 0}
                className={cn(
                  "min-h-[44px] px-3 py-2 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm",
                  debugLogs.length === 0
                    ? "bg-zinc-900/50 border border-zinc-800 text-zinc-600 cursor-not-allowed"
                    : "bg-amber-500/20 hover:bg-amber-500/30 active:bg-amber-500/40 border border-amber-500/50 text-amber-300"
                )}
                title="Copy all debug events to clipboard"
              >
                {isCopied ? (
                  <>
                    <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span className="text-emerald-300">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>Copy All</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => copyDebugLogs(20)}
                disabled={debugLogs.length === 0}
                className={cn(
                  "min-h-[44px] px-3 py-2 rounded-xl font-medium text-xs flex items-center justify-center gap-2 transition-all active:scale-95",
                  debugLogs.length === 0
                    ? "bg-zinc-900/50 border border-zinc-800 text-zinc-600 cursor-not-allowed"
                    : "bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-750 border border-zinc-700/60 text-zinc-200"
                )}
                title="Copy the most recent 20 lines to clipboard"
              >
                <FileText className="w-4 h-4 shrink-0 text-zinc-400" />
                <span>Copy Last 20 Lines</span>
              </button>

              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                disabled={debugLogs.length === 0}
                className={cn(
                  "min-h-[44px] px-3 py-2 rounded-xl font-medium text-xs flex items-center justify-center gap-2 transition-all active:scale-95",
                  debugLogs.length === 0
                    ? "bg-zinc-900/50 border border-zinc-800 text-zinc-600 cursor-not-allowed"
                    : "bg-zinc-900 hover:bg-red-950/40 active:bg-red-950/60 border border-zinc-800 hover:border-red-500/40 text-zinc-400 hover:text-red-300"
                )}
                title="Clear all recorded events"
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                <span>Clear Debug Log</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selectable-Text Fallback Modal Dialog */}
      {isFallbackModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
        >
          <div className="bg-zinc-900 border border-zinc-700/80 rounded-2xl w-full max-w-lg p-4 shadow-2xl flex flex-col max-h-[85vh] space-y-3 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <Copy className="w-4 h-4 text-amber-400" />
                  Diagnostic Debug Log
                </h3>
                <p className="text-[11px] text-zinc-400">
                  Select all and copy to paste into ChatGPT:
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFallbackModalOpen(false)}
                className="min-h-[48px] min-w-[48px] p-2 flex items-center justify-center text-zinc-400 hover:text-white rounded-lg active:bg-zinc-800"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <textarea
              ref={fallbackTextareaRef}
              readOnly
              value={fallbackLogText}
              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              className="flex-1 w-full min-h-[220px] font-mono text-[11px] leading-relaxed bg-black/90 text-zinc-200 p-3 rounded-xl border border-zinc-800 focus:outline-none focus:ring-1 focus:ring-amber-500 select-all resize-none"
            />

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  if (fallbackTextareaRef.current) {
                    fallbackTextareaRef.current.focus();
                    fallbackTextareaRef.current.select();
                    try {
                      document.execCommand('copy');
                      toast.success("Debug log copied. Paste it into ChatGPT.");
                    } catch (_) {
                      toast.info("Text selected! Use your device's copy option.");
                    }
                  }
                }}
                className="min-h-[48px] px-4 py-2 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-black font-semibold text-xs rounded-xl flex items-center gap-2 active:scale-95 transition-all shadow-sm"
              >
                <Copy className="w-4 h-4" />
                Select & Copy All
              </button>
              <button
                type="button"
                onClick={() => setIsFallbackModalOpen(false)}
                className="min-h-[48px] px-4 py-2 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-750 text-zinc-200 text-xs font-medium rounded-xl active:scale-95 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
