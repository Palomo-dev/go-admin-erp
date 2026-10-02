'use client';
import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { Call } from '@twilio/voice-sdk';

export function usePhoneShortcuts(callRef: RefObject<Call | null>, actions: {
  hangup(): void; mute(muted: boolean): void; muted: boolean; hasIncoming: boolean; acceptIncoming(): void;
}) {
  const { hangup, mute, muted, hasIncoming, acceptIncoming } = actions;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      const editable = ['input', 'textarea'].includes(target?.tagName.toLowerCase() ?? '') || target?.isContentEditable;
      const key = event.key.toUpperCase();
      if (key === 'D' && callRef.current) { event.preventDefault(); hangup(); }
      else if (key === 'M' && callRef.current && !editable) { event.preventDefault(); mute(!muted); }
      else if (key === 'A' && hasIncoming) { event.preventDefault(); acceptIncoming(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [callRef, hangup, mute, muted, hasIncoming, acceptIncoming]);
}
