'use client';

/**
 * El shell escucha al GO Asistente sin conocerlo: el panel publica en `window`
 * el evento `go-asistente:estado` con `{ abierto, modo }` cada vez que se abre,
 * se cierra o cambia de modo (`AIAssistantPanel.tsx`), y aquí se traduce a lo
 * que el shell necesita (Figma «GO Asistente — escritorio», `667:34452`):
 *
 * - `abierto`: el header se compacta (buscador como icono, sin chip de plan).
 * - `ampliado`: el panel ocupa 720 px de verdad (abierto + ampliado + ventana
 *   ≥ 1280 px). El sidebar pasa a rail y el header se queda en lo mínimo.
 *
 * Orden de montaje: `SidebarShell` y `AppHeader` van antes que el panel en el
 * árbol de `AppLayout`, así que sus efectos registran el oyente antes de que el
 * panel publique su primer estado.
 */
import { useEffect, useState } from 'react';
import {
  ANCHO_MIN_AMPLIADO,
  EVENTO_ESTADO_ASISTENTE,
  ampliadoEfectivo,
  estadoDesdeEvento,
  type EstadoAsistente,
} from '@/lib/ai/assistant/panelUi';

export interface EstadoAsistenteShell extends EstadoAsistente {
  /** El panel ocupa 720 px ahora mismo. */
  ampliado: boolean;
}

const CERRADO: EstadoAsistente = { abierto: false, modo: 'acoplado' };

export function useEstadoAsistente(): EstadoAsistenteShell {
  const [estado, setEstado] = useState<EstadoAsistente>(CERRADO);
  const [anchoSuficiente, setAnchoSuficiente] = useState(false);

  useEffect(() => {
    const alCambiar = (evento: Event) => {
      const nuevo = estadoDesdeEvento((evento as CustomEvent<unknown>).detail);
      if (nuevo) setEstado((actual) => (actual.abierto === nuevo.abierto && actual.modo === nuevo.modo ? actual : nuevo));
    };
    window.addEventListener(EVENTO_ESTADO_ASISTENTE, alCambiar);

    let consulta: MediaQueryList | null = null;
    const medir = () => setAnchoSuficiente(consulta ? consulta.matches : window.innerWidth >= ANCHO_MIN_AMPLIADO);
    if (typeof window.matchMedia === 'function') {
      consulta = window.matchMedia(`(min-width: ${ANCHO_MIN_AMPLIADO}px)`);
      consulta.addEventListener?.('change', medir);
    } else {
      window.addEventListener('resize', medir);
    }
    medir();

    return () => {
      window.removeEventListener(EVENTO_ESTADO_ASISTENTE, alCambiar);
      if (consulta) consulta.removeEventListener?.('change', medir);
      else window.removeEventListener('resize', medir);
    };
  }, []);

  return {
    ...estado,
    ampliado: ampliadoEfectivo(estado, anchoSuficiente ? ANCHO_MIN_AMPLIADO : 0),
  };
}
