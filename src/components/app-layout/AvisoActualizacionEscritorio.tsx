'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { getDesktopBridge, isDesktop, onDesktopUpdate, type DesktopUpdateState } from '@/lib/utils/desktop';

/**
 * Aviso de actualización del escritorio, visible dentro de la app (la barra
 * de Electron también lo muestra; aquí no se puede perder entre los botones).
 *
 * Solo cuando hay una versión nueva, se está bajando, ya se puede instalar
 * o la descarga falló. En el navegador no pinta nada.
 */
export function AvisoActualizacionEscritorio() {
  const [estado, setEstado] = useState<DesktopUpdateState | null>(null);
  const [instalando, setInstalando] = useState(false);

  useEffect(() => {
    if (!isDesktop()) return;
    const bridge = getDesktopBridge();
    void bridge?.updateState?.().then((s) => {
      if (s) setEstado(s);
    }).catch(() => { /* el .exe anterior no tiene el canal */ });
    return onDesktopUpdate(setEstado);
  }, []);

  if (!estado) return null;
  if (estado.status !== 'available' && estado.status !== 'downloading' && estado.status !== 'downloaded' && estado.status !== 'error') {
    return null;
  }

  const texto =
    estado.status === 'downloaded'
      ? `Versión ${estado.version ?? ''} lista. Reinicia para instalarla.`
      : estado.status === 'downloading'
        ? `Descargando la actualización${typeof estado.percent === 'number' ? ` (${estado.percent} %)` : ''}.`
        : estado.status === 'available'
          ? `Hay una versión nueva${estado.version ? ` (${estado.version})` : ''}. Se está descargando.`
          : 'No se pudo descargar la actualización. El detalle quedó en el registro de la app.';

  const instalar = () => {
    const bridge = getDesktopBridge();
    if (!bridge?.installUpdate) return;
    setInstalando(true);
    void bridge.installUpdate().catch(() => setInstalando(false));
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-[9998] flex w-[min(36rem,calc(100%-2rem))] -translate-x-1/2 items-center justify-between gap-3 rounded-lg bg-[#3651D4] px-4 py-3 text-sm text-white shadow-lg"
    >
      <span className="inline-flex items-center gap-2">
        <Download className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
        <span>{texto}</span>
      </span>
      {estado.status === 'downloaded' && (
        <button
          type="button"
          onClick={instalar}
          disabled={instalando}
          className="shrink-0 rounded-md bg-white px-3 py-1 text-xs font-semibold text-[#2A3EA8] hover:bg-[#F8FAFF] disabled:opacity-60"
        >
          {instalando ? 'Reiniciando…' : 'Reiniciar e instalar'}
        </button>
      )}
    </div>
  );
}
