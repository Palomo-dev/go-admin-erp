/**
 * Reglas puras de «Celular según la sede» (Figma 20.30) y del botón de «Tu
 * turno» en Inicio (20.30.7, 20.31.4). Sin React: las prueban
 * `__tests__/marcarMetodoLogica.test.ts`.
 *
 * Lo que vale de verdad (método permitido, etiqueta, QR de un solo uso, hora)
 * lo decide la base (`fn_hr_marcar`); aquí solo se decide qué mostrar y qué
 * mandar.
 */
import { leerEtiqueta } from '@/lib/hrm/marcacion/metodos';

// ─── «Tu turno» en Inicio ────────────────────────────────────────────────────

export interface MetodosPersona {
  ubicacion: boolean;
  qr: boolean;
  nfc: boolean;
  remoto: boolean;
}

/** Lo que devuelve `fn_hr_mi_metodo_marcacion` ya validado. */
export interface MetodoTurno {
  preferido: 'ubicacion' | 'qr' | 'nfc' | 'remoto' | null;
  metodos: MetodosPersona;
}

/** Método que el botón de «Tu turno» abre directo (solo los que no son «ubicación»). */
export type MetodoEspecial = 'qr' | 'nfc';

/** Campo `metodo` de `TurnoInicio`. */
export interface MetodoTurnoInicio {
  especial: MetodoEspecial | null;
  metodos: MetodosPersona;
}

const PREFERIDOS = ['ubicacion', 'qr', 'nfc', 'remoto'] as const;

/** Valida la respuesta cruda de la RPC; cualquier forma inesperada → `null` (Inicio sigue como hoy). */
export function leerMetodoTurno(crudo: unknown): MetodoTurno | null {
  if (!crudo || typeof crudo !== 'object') return null;
  const c = crudo as { preferido?: unknown; metodos?: unknown };
  if (!c.metodos || typeof c.metodos !== 'object') return null;
  const m = c.metodos as Record<string, unknown>;
  const preferido = typeof c.preferido === 'string' && (PREFERIDOS as readonly string[]).includes(c.preferido) ? (c.preferido as MetodoTurno['preferido']) : null;
  return {
    preferido,
    metodos: { ubicacion: m.ubicacion === true, qr: m.qr === true, nfc: m.nfc === true, remoto: m.remoto === true },
  };
}

/**
 * Regla del botón de «Tu turno» (Figma 20.30.7). Solo cambia lo de hoy cuando
 * hace falta:
 *  - si la sede ofrece un único método presencial, ese;
 *  - si no, el preferido;
 *  - y solo si ese método es el QR o la etiqueta NFC. Con «ubicación» o
 *    «remoto» el botón sigue llevando a `/marcar` sin parámetro (como hoy).
 */
export function metodoEspecial(m: MetodoTurno | null): MetodoEspecial | null {
  if (!m || m.preferido === 'remoto') return null;
  const presenciales = (['ubicacion', 'qr', 'nfc'] as const).filter((k) => m.metodos[k]);
  const elegido = presenciales.length === 1 ? presenciales[0] : m.preferido;
  return (elegido === 'qr' || elegido === 'nfc') && m.metodos[elegido] ? elegido : null;
}

/** `/marcar?metodo=qr` cuando hay método especial; si no, la ruta tal cual. */
export function hrefMarcarCon(base: string, especial: MetodoEspecial | null | undefined): string {
  return especial ? `${base}${base.includes('?') ? '&' : '?'}metodo=${especial}` : base;
}

/** Estado de «Tu turno» (mismo tipo que `EstadoTurno` de `lib/dashboard/turno`). */
type EstadoTurnoInicio = 'antes' | 'sinMarcar' | 'enTurno' | 'enDescanso' | 'cerrado' | 'sinTurno';

/**
 * Clave (bajo `home.turno.acciones`) del botón según el método de la sede:
 * «Escanear el QR de la sede» (20.30.7), «Marcar salida con el QR» (20.31.4),
 * «Acercar a la etiqueta NFC». `null` = el texto de hoy.
 */
export function claveAccionMetodo(estado: EstadoTurnoInicio, especial: MetodoEspecial | null | undefined): string | null {
  if (!especial) return null;
  if (estado === 'enTurno') return `${especial}.salida`;
  if (estado === 'antes' || estado === 'sinMarcar' || estado === 'sinTurno') return `${especial}.entrada`;
  return null;
}

// ─── «Marcar turno» (/marcar) ────────────────────────────────────────────────

/**
 * `?nfc=` de la URL (el celular abrió la etiqueta): se marca una sola vez al
 * cargar. `null` = no hay nada que hacer (sin parámetro o ya usado);
 * `invalida` = el parámetro no es una etiqueta de GO Admin (se limpia y se
 * avisa, no se manda).
 */
export function etiquetaDeUrl(parametro: string | null | undefined, yaUsada: boolean): { contenido: string } | { invalida: true } | null {
  if (yaUsada || !parametro) return null;
  return leerEtiqueta(parametro) ? { contenido: parametro } : { invalida: true };
}

/** Registro NDEF tal como lo entrega Web NFC (solo lo que se lee). */
export interface RegistroNdef {
  recordType: string;
  encoding?: string | null;
  data?: DataView | null;
}

/**
 * Contenido de la etiqueta: el primer registro de URL o de texto que sea una
 * etiqueta de GO Admin (`/marcar?nfc=<reloj>.<código>` o `<reloj>.<código>`).
 * `decodificar` convierte los bytes (TextDecoder en el navegador).
 */
export function contenidoNdef(registros: readonly RegistroNdef[], decodificar: (datos: DataView, codificacion: string) => string): string | null {
  for (const r of registros) {
    if (!r.data || !['url', 'absolute-url', 'text'].includes(r.recordType)) continue;
    let texto: string;
    try {
      texto = decodificar(r.data, r.recordType === 'text' ? (r.encoding ?? 'utf-8') : 'utf-8');
    } catch {
      continue;
    }
    if (leerEtiqueta(texto)) return texto.trim();
  }
  return null;
}

/** Sede de una etiqueta de otra sede (`etiqueta_otra_sede` trae `sede` en el cuerpo del error). */
export function sedeDelError(datos: Record<string, unknown> | null | undefined): string | null {
  const s = datos?.sede;
  return typeof s === 'string' && s.trim() ? s.trim().slice(0, 120) : null;
}

/** Clave de `hrmMarcacion.metodo.*` de una marca de `GET /api/hrm/marcacion` (`metodo` = `source`). */
export function claveMetodoMarca(m: { metodo?: string | null; modo?: string | null } | null | undefined): 'ubicacion' | 'qr' | 'nfc' | 'remoto' | null {
  if (!m) return null;
  if (m.metodo === 'qr') return 'qr';
  if (m.metodo === 'nfc') return 'nfc';
  if (m.modo === 'remoto') return 'remoto';
  return 'ubicacion';
}
