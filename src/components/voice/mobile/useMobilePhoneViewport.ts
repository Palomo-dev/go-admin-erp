'use client';
import { useEffect, useState } from 'react';
import { isMobile } from '@/lib/utils/mobile';
/** Presentación; la política de llamada sigue resolviendo si se usa el puente. */
export function useMobilePhoneViewportState() {
  const [mobile, setMobile] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 639px)');
    const update = () => { setMobile(isMobile() || query.matches); setReady(true); }; update();
    query.addEventListener('change', update); return () => query.removeEventListener('change', update);
  }, []);
  return { mobile, ready };
}

export function useMobilePhoneViewport() { return useMobilePhoneViewportState().mobile; }
