'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface UseSpeechSynthesisReturn {
  /** Whether the browser supports the Web Speech API */
  supported: boolean;
  /** Whether speech is currently playing */
  speaking: boolean;
  /** Start reading the given text aloud */
  speak: (text: string) => void;
  /** Stop any ongoing speech */
  stop: () => void;
}

/**
 * Wraps the browser Web Speech API (window.speechSynthesis) for TTS playback.
 * Handles Chrome's 15-second auto-pause bug with a periodic pause/resume workaround.
 */
export function useSpeechSynthesis(): UseSpeechSynthesisReturn {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
  }, []);

  const clearKeepAlive = useCallback(() => {
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    clearKeepAlive();
    setSpeaking(false);
    utteranceRef.current = null;
  }, [clearKeepAlive]);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

      // Cancel any ongoing speech first
      window.speechSynthesis.cancel();
      clearKeepAlive();

      const utterance = new SpeechSynthesisUtterance(text);
      utteranceRef.current = utterance;

      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => {
        setSpeaking(false);
        clearKeepAlive();
        utteranceRef.current = null;
      };
      utterance.onerror = () => {
        setSpeaking(false);
        clearKeepAlive();
        utteranceRef.current = null;
      };

      window.speechSynthesis.speak(utterance);

      // Chrome bug workaround: Chromium pauses speech after ~15 seconds.
      // Periodically pause/resume to keep it alive.
      keepAliveRef.current = setInterval(() => {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 10_000);
    },
    [clearKeepAlive],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      clearKeepAlive();
    };
  }, [clearKeepAlive]);

  return { supported, speaking, speak, stop };
}
