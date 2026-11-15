/**
 * Lógica pura de «Mis aprobaciones» (Figma 20.7). Sin React: la prueba
 * `__tests__/bandejaLogica.test.ts`.
 */

export interface EventoSolicitud {
  id: string;
  campo: string;
  desde: string;
  motivo: string;
  estado: string;
  oculto: boolean;
  anterior: unknown;
  nuevo: unknown;
  anterior_nombre: string | null;
  nuevo_nombre: string | null;
}

export interface Solicitud {
  id: string;
  tipo: string;
  estado: string;
  creado: string;
  decidido: string | null;
  solicito: string | null;
  es_propia: boolean;
  regla: string | null;
  persona: { id: string; nombre: string | null; cargo: string | null; area: string | null; sede: string | null } | null;
  efecto: string | null;
  eventos: EventoSolicitud[];
  cuenta: { banco: string; tipo: string; numero: string; motivo: string } | null;
  nota: string | null;
  soporte_documento_id: string | null;
  contexto: Record<string, unknown> | null;
  decision: { decision: string; en: string; comentario: string | null; por: string | null } | null;
  en_nombre_de?: string | null;
  puede_decidir?: boolean;
  puede_retirar?: boolean;
  espera?: string[] | null;
}

export type GrupoTipo = 'todas' | 'salario_cargo' | 'plazas' | 'seguridad' | 'sede_jornada';

export function grupoDeTipo(tipo: string): Exclude<GrupoTipo, 'todas'> {
  if (tipo === 'cambio_salario' || tipo === 'cambio_cargo' || tipo === 'cambio_cuenta_bancaria') return 'salario_cargo';
  if (tipo.startsWith('plaza')) return 'plazas';
  if (tipo === 'cambio_seguridad_social') return 'seguridad';
  return 'sede_jornada';
}

/** Clave del título: «Cambio de cargo y salario» cuando van enlazados. */
export function claveTitulo(s: Pick<Solicitud, 'tipo' | 'eventos'>): string {
  const campos = new Set(s.eventos.map((e) => e.campo));
  if (campos.has('cargo') && campos.has('salario')) return 'cargo_salario';
  if (s.eventos.length > 0) {
    const principal = ['salario', 'cargo', 'sede', 'jornada_horas_semana', 'eps', 'afp', 'arl', 'ccf', 'cesantias'].find((c) => campos.has(c));
    if (principal) return ['eps', 'afp', 'arl', 'ccf', 'cesantias'].includes(principal) ? 'seguridad_social' : principal;
  }
  return s.tipo;
}

/** Diferencia mensual de la solicitud (solo si hay un salario con valores visibles). */
export function diferencia(s: Pick<Solicitud, 'eventos'>): { diferencia: number; pct: number | null; nuevo: number } | null {
  const e = s.eventos.find((x) => x.campo === 'salario' && !x.oculto);
  if (!e || typeof e.nuevo !== 'number') return null;
  const nuevo = e.nuevo;
  const anterior = typeof e.anterior === 'number' ? e.anterior : null;
  if (anterior === null) return { diferencia: nuevo, pct: null, nuevo };
  return { diferencia: nuevo - anterior, pct: anterior > 0 ? Math.round(((nuevo - anterior) / anterior) * 1000) / 10 : null, nuevo };
}

export function tieneSalarioOculto(s: Pick<Solicitud, 'eventos'>): boolean {
  return s.eventos.some((e) => e.campo === 'salario' && e.oculto);
}

/** Días enteros desde que se pidió (para «Hace 3 días» y el tono de urgencia). */
export function diasDesde(creado: string, ahora: Date = new Date()): number {
  return Math.max(0, Math.floor((ahora.getTime() - new Date(creado).getTime()) / 86_400_000));
}

/** Filtros de la bandeja (Figma 95-hrm-07-05): buscador + «Filtros». */
export interface FiltrosBandeja {
  texto: string;
  grupo: GrupoTipo;
  /** Nombre de quien pidió; `null` = cualquier persona. */
  solicito: string | null;
  /** Solo las que tienen fecha de efecto en el mes de `hoy`. */
  esteMes: boolean;
}

export const FILTROS_BANDEJA: FiltrosBandeja = { texto: '', grupo: 'todas', solicito: null, esteMes: false };

export function conteoFiltrosBandeja(f: FiltrosBandeja): number {
  return (f.grupo !== 'todas' ? 1 : 0) + (f.solicito ? 1 : 0) + (f.esteMes ? 1 : 0);
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * `hoy` es el día calendario de la organización (YYYY-MM-DD); `etiquetaTipo`
 * da el nombre visible del tipo para que el buscador lo encuentre.
 */
export function filtrarSolicitudes(
  lista: readonly Solicitud[],
  f: FiltrosBandeja,
  hoy: string,
  etiquetaTipo: (s: Solicitud) => string
): Solicitud[] {
  const q = sinTildes(f.texto.trim());
  const mes = hoy.slice(0, 7);
  return lista.filter((s) => {
    if (f.grupo !== 'todas' && grupoDeTipo(s.tipo) !== f.grupo) return false;
    if (f.solicito && s.solicito !== f.solicito) return false;
    if (f.esteMes && (!s.efecto || s.efecto.slice(0, 7) !== mes)) return false;
    if (!q) return true;
    return [s.persona?.nombre, s.solicito, etiquetaTipo(s), s.persona?.cargo]
      .filter((x): x is string => !!x)
      .some((x) => sinTildes(x).includes(q));
  });
}
