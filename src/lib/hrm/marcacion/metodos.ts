/**
 * Reglas puras de Marcación (plan `docs/hrm/PLAN-MARCACION-DISPOSITIVOS.md`, M0).
 * Sin React ni base: las usan la pestaña Marcación, «Marcar turno», Asistencia,
 * Mi asistencia y las rutas del servidor; las prueban `__tests__/metodos.test.ts`.
 *
 * Lo que decide de verdad (método permitido, QR, etiqueta, hora) está en la base
 * (`fn_hr_marcar`, `fn_hr_metodos_vinculo`); aquí solo se valida la forma de lo que
 * manda la pantalla y se decide qué mostrar.
 */

/** Métodos que configura la sede (`hr_branch_clock_methods.method`). */
export const METODOS_SEDE = ['celular_ubicacion', 'qr', 'nfc_etiqueta', 'carne', 'pin', 'rostro', 'huella'] as const;
export type MetodoSede = (typeof METODOS_SEDE)[number];

/** Los que funcionan en M0. Carné y PIN llegan con el kiosco (M1); rostro y huella con los relojes (M2). */
export const METODOS_M0 = ['celular_ubicacion', 'qr', 'nfc_etiqueta'] as const satisfies readonly MetodoSede[];
export type MetodoM0 = (typeof METODOS_M0)[number];

/** Método de una marca (`attendance_events.method` o el derivado de `source`). */
export type MetodoMarca = MetodoSede | 'carne_nfc' | 'carne_qr' | 'remoto' | 'manual';

export function esMetodoM0(v: unknown): v is MetodoM0 {
  return typeof v === 'string' && (METODOS_M0 as readonly string[]).includes(v);
}

export function esMetodoSede(v: unknown): v is MetodoSede {
  return typeof v === 'string' && (METODOS_SEDE as readonly string[]).includes(v);
}

/** Icono de lucide por método (CATALOGO-ICONOS.md, adenda 2026-11-16). */
export const ICONO_METODO: Record<MetodoMarca, string> = {
  celular_ubicacion: 'LocateFixed',
  qr: 'ScanQrCode',
  nfc_etiqueta: 'Nfc',
  carne: 'Nfc',
  carne_nfc: 'Nfc',
  carne_qr: 'ScanQrCode',
  pin: 'KeyRound',
  rostro: 'ScanFace',
  huella: 'Fingerprint',
  remoto: 'Laptop',
  manual: 'PenLine',
};

// ─── Reglas de la sede (Figma 20.27) ─────────────────────────────────────────

export interface ConfigMetodo {
  activo: boolean;
  reglas: Record<string, unknown>;
}
export type ConfigSede = Partial<Record<MetodoSede, ConfigMetodo>>;

export const RADIO_MIN = 20;
export const RADIO_MAX = 2000;

export type ErrorMetodos = 'sin_metodos' | 'radio_invalido' | 'metodo_no_disponible';

/**
 * Cuerpo que se manda a `PUT /api/hrm/marcacion/metodos`: solo los métodos de M0 y
 * solo las reglas que la base entiende. Devuelve el error de la pantalla, si lo hay.
 */
export function cuerpoMetodos(c: ConfigSede): { ok: true; metodos: Record<MetodoM0, ConfigMetodo> } | { ok: false; error: ErrorMetodos } {
  for (const k of Object.keys(c)) {
    if (!esMetodoM0(k) && c[k as MetodoSede]?.activo) return { ok: false, error: 'metodo_no_disponible' };
  }
  const cel = c.celular_ubicacion ?? { activo: true, reglas: {} };
  const qr = c.qr ?? { activo: true, reglas: {} };
  const nfc = c.nfc_etiqueta ?? { activo: true, reglas: {} };
  const radio = Number(cel.reglas.radio_m ?? 150);
  if (!Number.isInteger(radio) || radio < RADIO_MIN || radio > RADIO_MAX) return { ok: false, error: 'radio_invalido' };
  if (!cel.activo && !qr.activo && !nfc.activo) return { ok: false, error: 'sin_metodos' };
  return {
    ok: true,
    metodos: {
      celular_ubicacion: { activo: cel.activo, reglas: { radio_m: radio, permitir_computador: cel.reglas.permitir_computador !== false } },
      qr: { activo: qr.activo, reglas: { exigir_ubicacion: qr.reglas.exigir_ubicacion === true } },
      nfc_etiqueta: { activo: nfc.activo, reglas: {} },
    },
  };
}

/** Cuántos métodos de M0 cambiaron (para la barra «Cambios sin guardar», 20.27.2). */
export function cambiosMetodos(antes: ConfigSede, ahora: ConfigSede): number {
  return METODOS_M0.filter((m) => JSON.stringify(antes[m] ?? null) !== JSON.stringify(ahora[m] ?? null)).length;
}

// ─── Excepción temporal (Figma 20.27.11) ─────────────────────────────────────

export const MAX_DIAS_EXCEPCION = 90;

function diasEntre(desde: string, hasta: string): number {
  const a = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10));
  const b = Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

export type ErrorExcepcion = 'persona' | 'metodo' | 'fechas' | 'tope' | 'pasado' | 'motivo';

/** Fechas de la sede (`date`): «hasta» no antes de «desde», máximo 90 días y que no termine en el pasado. */
export function validarExcepcion(e: { vinculoId?: string | null; metodo?: string | null; desde?: string; hasta?: string; motivo?: string }, hoy: string): ErrorExcepcion | null {
  if (!e.vinculoId) return 'persona';
  if (!esMetodoSede(e.metodo)) return 'metodo';
  if (!e.desde || !e.hasta || !FECHA_RE.test(e.desde) || !FECHA_RE.test(e.hasta) || e.hasta < e.desde) return 'fechas';
  if (diasEntre(e.desde, e.hasta) > MAX_DIAS_EXCEPCION) return 'tope';
  if (e.hasta < hoy) return 'pasado';
  const m = (e.motivo ?? '').trim();
  if (m.length < 5 || m.length > 500) return 'motivo';
  return null;
}

// ─── Reclamo de una marca (R2, Figma 20.31.6) ────────────────────────────────

export const QUE_ESTA_MAL = ['hora', 'no_es_mia', 'tipo', 'metodo', 'otro'] as const;
export type QueEstaMal = (typeof QUE_ESTA_MAL)[number];

/**
 * Cuerpo del reclamo. «No es mía» pide excluir la marca; con hora correcta se
 * propone agregar una marca con esa hora. La marca original nunca cambia.
 */
export function cuerpoReclamo(r: { eventoId: string; que: string; motivo: string; hora?: string | null }):
  | { ok: true; cuerpo: { evento_id: string; que: QueEstaMal; motivo: string; hora?: string; excluir?: true } }
  | { ok: false; error: 'que' | 'motivo' | 'hora' } {
  if (!(QUE_ESTA_MAL as readonly string[]).includes(r.que)) return { ok: false, error: 'que' };
  const motivo = r.motivo.trim();
  if (motivo.length < 5 || motivo.length > 500) return { ok: false, error: 'motivo' };
  const que = r.que as QueEstaMal;
  if (que === 'no_es_mia') return { ok: true, cuerpo: { evento_id: r.eventoId, que, motivo, excluir: true } };
  if (r.hora) {
    if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(r.hora) || !Number.isFinite(Date.parse(r.hora))) return { ok: false, error: 'hora' };
    return { ok: true, cuerpo: { evento_id: r.eventoId, que, motivo, hora: r.hora } };
  }
  return { ok: true, cuerpo: { evento_id: r.eventoId, que, motivo } };
}

// ─── Etiqueta NFC ────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODIGO_RE = /^[A-Za-z0-9_-]{16,64}$/;

/** Lo que se graba en la etiqueta: abre «Marcar turno» con el punto y su código. */
export function urlEtiqueta(origen: string, relojId: string, codigo: string): string {
  return `${origen.replace(/\/+$/, '')}/marcar?nfc=${encodeURIComponent(`${relojId}.${codigo}`)}`;
}

/** Lee la etiqueta: la URL completa, solo el parámetro o `<reloj>.<código>`. */
export function leerEtiqueta(contenido: unknown): { relojId: string; codigo: string } | null {
  if (typeof contenido !== 'string' || contenido.length > 1000) return null;
  let v = contenido.trim();
  if (/^https?:\/\//i.test(v)) {
    try {
      v = new URL(v).searchParams.get('nfc') ?? '';
    } catch {
      return null;
    }
  } else if (v.startsWith('?') || v.startsWith('nfc=')) {
    v = new URLSearchParams(v.replace(/^\?/, '')).get('nfc') ?? '';
  }
  const i = v.indexOf('.');
  if (i < 0) return null;
  const relojId = v.slice(0, i);
  const codigo = v.slice(i + 1);
  return UUID_RE.test(relojId) && CODIGO_RE.test(codigo) ? { relojId, codigo } : null;
}

// ─── En vivo (Figma 20.26): verificación de cada marca ───────────────────────

export interface MarcaEnVivo {
  metodo: MetodoMarca;
  revisar?: string | null;
  manual?: boolean;
  ubicacion_validada?: boolean | null;
  tarde_minutos?: number | null;
  distancia_m?: number | null;
}

export type Verificacion =
  | { clave: 'dentro'; tono: 'exito' }
  | { clave: 'verificada'; tono: 'exito' }
  | { clave: 'remoto'; tono: 'informacion' }
  | { clave: 'pendiente_aprobacion'; tono: 'advertencia' }
  | { clave: 'sin_ubicacion' | 'computador'; tono: 'advertencia' }
  | { clave: 'sin_senal'; tono: 'neutro' }
  | { clave: 'tarde'; tono: 'advertencia'; minutos: number };

/** Insignia de la columna «Verificación». La tardanza manda sobre «verificada». */
export function verificacionDeMarca(m: MarcaEnVivo): Verificacion {
  if (m.revisar === 'fuera_de_linea') return { clave: 'sin_senal', tono: 'neutro' };
  if (m.revisar === 'computador_sin_qr') return { clave: 'computador', tono: 'advertencia' };
  if (m.revisar === 'sin_ubicacion') return { clave: 'sin_ubicacion', tono: 'advertencia' };
  if (m.manual || m.metodo === 'manual') return { clave: 'pendiente_aprobacion', tono: 'advertencia' };
  if (m.tarde_minutos && m.tarde_minutos > 0) return { clave: 'tarde', tono: 'advertencia', minutos: m.tarde_minutos };
  if (m.metodo === 'remoto') return { clave: 'remoto', tono: 'informacion' };
  if (m.metodo === 'celular_ubicacion' && m.ubicacion_validada) return { clave: 'dentro', tono: 'exito' };
  return { clave: 'verificada', tono: 'exito' };
}

/** Motivo de un intento rechazado → clave de texto («Rechazada: fuera de la sede»). */
export function claveRechazo(motivo: string): string {
  const conocidos = [
    'fuera_de_rango',
    'qr_ya_usado',
    'qr_vencido',
    'qr_invalido',
    'etiqueta_invalida',
    'etiqueta_otra_sede',
    'metodo_no_disponible_en_sede',
    'mecanismo_no_permitido',
    'computador_no_permitido',
    'ubicacion_requerida',
    'ubicacion_requiere_consentimiento',
  ];
  return conocidos.includes(motivo) ? motivo : 'otro';
}

/** Motivos de rechazo de `fn_hr_marcar` que se guardan como intento (antifraude, plan §5.3). */
export const MOTIVOS_INTENTO: ReadonlySet<string> = new Set([
  'fuera_de_rango',
  'qr_ya_usado',
  'qr_vencido',
  'qr_invalido',
  'etiqueta_invalida',
  'etiqueta_otra_sede',
  'metodo_no_disponible_en_sede',
  'mecanismo_no_permitido',
  'computador_no_permitido',
  'remoto_no_permitido',
]);
