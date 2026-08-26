'use client';

import { useEffect } from 'react';
import { isMobile, getMobilePlugin, safeAddListener, type MobilePluginListenerHandle } from '@/lib/utils/mobile';

interface UseAppLifecycleOptions {
  onForeground?: () => void;
  onBackground?: () => void;
}

/**
 * Hook que detecta cuando la app móvil va a background o foreground.
 * En web/desktop es un no-op (los callbacks nunca se llaman).
 */
export function useAppLifecycle(options: UseAppLifecycleOptions = {}): void {
  const { onForeground, onBackground } = options;

  useEffect(() => {
    if (!isMobile()) return;

    const app = getMobilePlugin('App');
    if (!app?.addListener) return;

    let listenerHandle: MobilePluginListenerHandle | null = null;

    safeAddListener(
      app,
      'appStateChange',
      (state: unknown) => {
        const { isActive } = state as { isActive: boolean };
        if (isActive) {
          onForeground?.();
        } else {
          onBackground?.();
        }
      },
    ).then((handle) => {
      listenerHandle = handle;
    });

    return () => {
      listenerHandle?.remove().catch(() => {});
    };
  }, [onForeground, onBackground]);
}
