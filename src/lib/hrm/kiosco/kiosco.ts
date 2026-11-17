/**
 * Reglas puras del kiosco de Marcación (plan `docs/hrm/PLAN-MARCACION-DISPOSITIVOS.md`,
 * fase M1; Figma 20.29). Sin React ni base: las usan la tablet (`/marcacion/kiosco`),
 * el lector de carnés de GO Admin Escritorio, las rutas del servidor y las pruebas.
 *
 * Lo que decide de verdad (quién es, si su PIN está bloqueado, la hora, la foto) lo
 * decide la base (`fn_hr_kiosco_identificar`, `fn_hr_marcar_kiosco`). Aquí solo se
 * valida la forma de lo que se manda y se decide qué mostrar.
 */

// ─── PIN (D11) ───────────────────────────────────────────────────────────────

export const LARGO_PIN = 6;
export const INTENTOS_PIN = 5;
export const MINUTOS_BLOQUEO_PIN = 15;

const PIN_RE = /^\d{6}$/;

export function esPin(v: unknown): v is string {
  return typeof v === 'string' && PIN_RE.test(v);
}

export type TeclaPin = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'borrar';

/** El teclado del PIN (20.29.2): agrega un dígito hasta 6 o borra el último. */
export function teclearPin(actual: string, tecla: TeclaPin): string {
  if (tecla === 'borrar') return actual.slice(0, -1);
  if (!/^\d$/.test(tecla) || actual.length >= LARGO_PIN) return actual;
  return actual + tecla;
}

// ─── Código de vinculación (20.29.7) ─────────────────────────────────────────

/** Sin letras ni números que se confundan (I, O, 0, 1): el mismo alfabeto de la base. */
export const ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODIGO_RE = /^[A-HJ-NP-Z2-9]{6}$/;

/** Lo que escribe RR. HH.: sin espacios, puntos ni guiones, en mayúsculas. */
export function normalizarCodigo(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const c = v.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  return CODIGO_RE.test(c) ? c : null;
}

/** «K7Q4M2» → «K7Q · 4M2», como lo muestra la tablet. */
export function formatearCodigo(c: string): string {
  return c.length === 6 ? `${c.slice(0, 3)} · ${c.slice(3)}` : c;
}

// ─── Carnés (NFC o QR) ───────────────────────────────────────────────────────

export type TipoCarne = 'carne_nfc' | 'carne_qr';
export type TipoCredencial = 'pin' | TipoCarne;

/** Prefijo de los códigos de carné QR que genera GO Admin (`fn_hr_carne_registrar`). */
export const PREFIJO_CARNE_QR = 'GA';
const CARNE_QR_RE = new RegExp(`^${PREFIJO_CARNE_QR}[${ALFABETO_CODIGO}]{12}$`);
/** Lo que puede llevar un carné QR impreso: el código solo o con este prefijo. */
export const ESQUEMA_CARNE_QR = 'GOADMIN-CARNE:';

/** Misma forma canónica que `fn_hr_carne_normalizar`: mayúsculas, sin separadores, 4 a 40. */
export function normalizarCarne(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const c = v.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  return /^[0-9A-Z]{4,40}$/.test(c) ? c : null;
}

/**
 * Lo que entrega un lector (NFC del celular o la tablet, lector USB que «teclea» o
 * cámara): el código de un carné QR de GO Admin, o el UID de un carné NFC.
 */
export function leerCarne(texto: unknown, origen: 'nfc' | 'teclado' | 'qr' = 'teclado'): { tipo: TipoCarne; valor: string } | null {
  if (typeof texto !== 'string' || texto.length > 200) return null;
  let v = texto.trim();
  if (v.toUpperCase().startsWith(ESQUEMA_CARNE_QR)) v = v.slice(ESQUEMA_CARNE_QR.length);
  const n = normalizarCarne(v);
  if (!n) return null;
  if (CARNE_QR_RE.test(n)) return { tipo: 'carne_qr', valor: n };
  if (origen === 'qr') return null;
  return { tipo: 'carne_nfc', valor: n };
}

/** Contenido del QR que se imprime en un carné. */
export function contenidoCarneQr(codigo: string): string {
  return `${ESQUEMA_CARNE_QR}${codigo}`;
}

// ─── Lector USB que «teclea» (modo lector de GO Admin Escritorio) ─────────────

/**
 * Los lectores USB de carnés y de QR se comportan como un teclado: escriben el
 * código muy rápido y terminan con Enter. Una persona no escribe 8 caracteres en
 * menos de medio segundo; un lector sí. Este acumulador separa una cosa de la otra.
 */
export interface EstadoTeclado {
  buffer: string;
  ultimaMs: number;
}

export const TECLADO_VACIO: EstadoTeclado = { buffer: '', ultimaMs: 0 };
/** Pausa máxima entre teclas de un lector. */
export const PAUSA_LECTOR_MS = 60;
const MINIMO_LECTURA = 4;

export function teclaLector(estado: EstadoTeclado, tecla: string, enMs: number): { estado: EstadoTeclado; lectura: string | null } {
  const continua = estado.buffer.length > 0 && enMs - estado.ultimaMs <= PAUSA_LECTOR_MS;
  if (tecla === 'Enter') {
    const lectura = continua && estado.buffer.length >= MINIMO_LECTURA ? estado.buffer : null;
    return { estado: TECLADO_VACIO, lectura };
  }
  if (tecla.length !== 1) return { estado, lectura: null };
  const buffer = (continua ? estado.buffer : '') + tecla;
  return { estado: { buffer: buffer.slice(-200), ultimaMs: enMs }, lectura: null };
}

// ─── Bloqueo (20.29.8) ───────────────────────────────────────────────────────

/** «Se desbloquea solo en 14:32»: minutos y segundos que faltan, o null si ya pasó. */
export function cuentaAtras(hastaIso: string | null | undefined, ahoraMs: number): { minutos: number; segundos: number; texto: string } | null {
  const h = hastaIso ? Date.parse(hastaIso) : NaN;
  if (!Number.isFinite(h)) return null;
  const s = Math.ceil((h - ahoraMs) / 1000);
  if (s <= 0) return null;
  const minutos = Math.floor(s / 60);
  const segundos = s % 60;
  return { minutos, segundos, texto: `${minutos}:${String(segundos).padStart(2, '0')}` };
}

// ─── Respuestas de la base → pantalla del kiosco ──────────────────────────────

export type EstadoIdentificacion =
  | 'identificada'
  | 'pin_incorrecto'
  | 'pin_bloqueado'
  | 'kiosco_bloqueado'
  | 'carne_desconocido'
  | 'credencial_invalida'
  | 'otra_sede'
  | 'metodo_no_disponible'
  | 'sin_marcacion'
  | 'sin_vinculo'
  | 'repetida';

export interface RespuestaIdentificar {
  estado: EstadoIdentificacion;
  nombre?: string | null;
  primer_nombre?: string | null;
  siguiente?: 'check_in' | 'check_out' | 'break_start' | 'break_end';
  turno?: { inicio: string | null; fin: string | null } | null;
  foto?: boolean;
  foto_dias?: number;
  restantes?: number;
  hasta?: string;
  credencial_id?: string;
}

/** A qué pantalla del kiosco lleva cada respuesta. */
export type PantallaKiosco = 'foto' | 'registrar' | 'pin_incorrecto' | 'bloqueado' | 'aviso';

export function pantallaDeIdentificacion(r: Pick<RespuestaIdentificar, 'estado' | 'foto'>, puedeFoto: boolean): PantallaKiosco {
  switch (r.estado) {
    case 'identificada':
      return r.foto && puedeFoto ? 'foto' : 'registrar';
    case 'pin_incorrecto':
      return 'pin_incorrecto';
    case 'pin_bloqueado':
    case 'kiosco_bloqueado':
      return 'bloqueado';
    default:
      return 'aviso';
  }
}

/** Iniciales para el círculo de 20.29.4 («CR»). */
export function iniciales(nombre: string | null | undefined): string {
  const partes = (nombre ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '·';
  const a = partes[0][0] ?? '';
  const b = partes.length > 1 ? partes[partes.length - 1][0] ?? '' : partes[0][1] ?? '';
  return (a + b).toUpperCase();
}
