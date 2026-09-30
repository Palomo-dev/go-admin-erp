/**
 * Lógica de `StageBar` (Figma 801:25456): barra de etapas clicable del
 * drawer y del detalle. Sin React.
 *
 * Las etapas abiertas van como segmentos (pasadas con ✓, la actual resaltada,
 * las futuras en gris); ganada y perdida van aparte como botones, porque
 * abren `WinDialog` / `LoseDialog`. En móvil: «Propuesta · 60 %  2 de 3».
 */
export interface EtapaBarra {
  id: string;
  name: string;
  position: number;
  probability: number | null;
  is_won?: boolean | null;
  is_lost?: boolean | null;
}

export type EstadoBarra = 'abierta' | 'ganada' | 'perdida';
export type EstadoSegmento = 'pasada' | 'actual' | 'futura';

export interface VistaBarra {
  estado: EstadoBarra;
  segmentos: { etapa: EtapaBarra; estado: EstadoSegmento }[];
  ganada: EtapaBarra | null;
  perdida: EtapaBarra | null;
  actual: EtapaBarra | null;
  /** Posición 1-based de la actual entre las abiertas (0 si está cerrada). */
  indice: number;
  total: number;
}

export function vistaBarra(etapas: readonly EtapaBarra[], actualId: string | null | undefined): VistaBarra {
  const ordenadas = [...etapas].sort((a, b) => a.position - b.position);
  const abiertas = ordenadas.filter((e) => !e.is_won && !e.is_lost);
  const actual = ordenadas.find((e) => e.id === actualId) ?? null;
  const estado: EstadoBarra = actual?.is_won ? 'ganada' : actual?.is_lost ? 'perdida' : 'abierta';
  const i = abiertas.findIndex((e) => e.id === actualId);
  return {
    estado,
    segmentos: abiertas.map((etapa, j) => ({
      etapa,
      // Ganada: todo el camino recorrido. Perdida: se queda como estaba (sin marcar).
      estado: estado === 'ganada' ? 'pasada' : estado === 'perdida' ? 'futura' : j < i ? 'pasada' : j === i ? 'actual' : 'futura',
    })),
    ganada: ordenadas.find((e) => e.is_won) ?? null,
    perdida: ordenadas.find((e) => e.is_lost) ?? null,
    actual,
    indice: i + 1,
    total: abiertas.length,
  };
}
