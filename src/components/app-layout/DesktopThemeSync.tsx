'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { getDesktopBridge, type DesktopThemePreference } from '@/lib/utils/desktop';

/**
 * Hace que Go Admin Desktop siga al tema de la web.
 *
 * El interruptor del header cambia el tema con `next-themes` (clase en
 * `<html>` + `localStorage.theme`), pero el proceso principal de Electron no
 * ve nada de eso: su barra propia, el fondo de la ventana, el splash y la
 * pantalla sin conexión seguían `nativeTheme` del sistema. Este componente,
 * montado en el layout raíz dentro del `ThemeProvider`, manda la preferencia
 * (`light` | `dark` | `system`) por el bridge (`setTheme` → IPC `theme:set`)
 * al montar y en cada cambio, y el main la aplica a `nativeTheme.themeSource`
 * y la persiste (ver `electron/src/main/theme.ts`).
 *
 * También escucha el evento `storage` de la clave `theme`: si el tema cambia
 * en otra ventana del mismo origen (p. ej. la pantalla del cliente del POS),
 * se reenvía sin esperar a que `next-themes` lo propague.
 *
 * Fuera del Desktop —o con un Desktop anterior sin `setTheme`— no hace nada.
 * No renderiza nada.
 */

const PREFERENCES: readonly DesktopThemePreference[] = ['light', 'dark', 'system'];

/** Convierte lo que devuelve `useTheme()` / `localStorage` en una preferencia válida. */
export function toDesktopThemePreference(value: unknown): DesktopThemePreference | null {
  return typeof value === 'string' && (PREFERENCES as readonly string[]).includes(value)
    ? (value as DesktopThemePreference)
    : null;
}

/**
 * Manda la preferencia al Desktop si hay bridge con `setTheme`. Devuelve true
 * si se envió. Nunca lanza: un fallo del IPC no debe romper la web.
 */
export function sendThemeToDesktop(value: unknown): boolean {
  const bridge = getDesktopBridge();
  if (!bridge?.setTheme) return false;
  const preference = toDesktopThemePreference(value);
  if (!preference) return false;
  try {
    void bridge.setTheme(preference).catch((err: unknown) => {
      console.warn('[DesktopThemeSync] El Desktop rechazó el tema:', err);
    });
  } catch (err) {
    console.warn('[DesktopThemeSync] No se pudo mandar el tema al Desktop:', err);
    return false;
  }
  return true;
}

export function DesktopThemeSync(): null {
  const { theme } = useTheme();
  const lastSent = useRef<DesktopThemePreference | null>(null);

  // Al montar y en cada cambio del interruptor.
  useEffect(() => {
    const preference = toDesktopThemePreference(theme);
    if (!preference || preference === lastSent.current) return;
    if (sendThemeToDesktop(preference)) lastSent.current = preference;
  }, [theme]);

  // Cambio hecho en otra ventana del mismo origen (pantalla del cliente).
  useEffect(() => {
    if (!getDesktopBridge()?.setTheme) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== 'theme') return;
      // newValue null = clave borrada: next-themes vuelve a «system».
      const preference = toDesktopThemePreference(event.newValue ?? 'system');
      if (!preference || preference === lastSent.current) return;
      if (sendThemeToDesktop(preference)) lastSent.current = preference;
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return null;
}

export default DesktopThemeSync;
