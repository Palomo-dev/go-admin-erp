/**
 * Reglas puras de la pestaña Marcación de RR. HH. (Figma 20.26 «En vivo» y 20.28
 * «Dispositivos»; plan `docs/hrm/PLAN-MARCACION-DISPOSITIVOS.md`, fase M0). Sin
 * React: las prueban `__tests__/marcacionVista.test.ts`.
 *
 * Lo que decide de verdad (método, verificación, permisos) lo resuelve la base;
 * aquí solo se ordena, se filtra y se elige qué texto mostrar.
 */
import { claveRechazo, verificacionDeMarca, type MetodoMarca, type Verificacion } from '@/lib/hrm/marcacion/metodos';

// ─── Respuestas de la API ────────────────────────────────────────────────────

export interface PersonaVivo {
  employment_id: string;
  person_id: string | null;
  nombre: string;
  cargo: string | null;
  area: string | null;
  sede: string | null;
  branch_id: number | null;
}

export type TipoMarca = 'check_in' | 'check_out' | 'break_start' | 'break_end';

export interface MarcaVivo extends PersonaVivo {
  id: string;
  tipo: string;
  hora: string;
  metodo: MetodoMarca;
  punto: string | null;
  punto_id: string | null;
  punto_tipo: string | null;
  sede_marca: string | null;
  distancia_m: number | null;
  ubicacion_validada: boolean | null;
  revisar: string | null;
  manual: boolean;
  registrada_por: string | null;
  tarde_minutos: number | null;
}

export interface IntentoVivo extends PersonaVivo {
  id: string;
  hora: string;
  metodo: string | null;
  motivo: string;
  distancia_m: number | string | null;
  punto: string | null;
}

export interface IndicadoresVivo {
  con_turno: number;
  marcaron: number;
  sin_marcar: number;
  por_revisar: number;
  sin_senal: number;
  rechazadas: number;
  puntos: number;
  pantallas: number;
  pantallas_en_linea: number;
}

export interface RespuestaEnVivo {
  fecha: string;
  ahora: string;
  zona: string;
  puede_gestionar: boolean;
  indicadores: IndicadoresVivo;
  por_metodo: Record<string, number>;
  marcas: MarcaVivo[];
  intentos: IntentoVivo[];
}

// ─── Métodos ─────────────────────────────────────────────────────────────────

/** Método de una fila: el de la marca o el del intento (`desconocido` si la base no lo supo). */
export type MetodoFila = MetodoMarca | 'desconocido';

/** Orden fijo de los métodos en «Hoy por método» y en el filtro (Figma 20.26.1). */
export const ORDEN_METODOS: readonly MetodoFila[] = [
  'celular_ubicacion',
  'qr',
  'nfc_etiqueta',
  'carne',
  'carne_nfc',
  'carne_qr',
  'pin',
  'rostro',
  'huella',
  'remoto',
  'manual',
  'desconocido',
];

export function esMetodoFila(v: unknown): v is MetodoFila {
  return typeof v === 'string' && (ORDEN_METODOS as readonly string[]).includes(v);
}

export function metodoDe(v: unknown): MetodoFila {
  return esMetodoFila(v) ? v : 'desconocido';
}

/** «Hoy por método»: los métodos con entradas, del más usado al menos usado; empate, por el orden fijo. */
export function conteoPorMetodo(porMetodo: Record<string, number> | null | undefined): { metodo: MetodoFila; n: number }[] {
  const acum = new Map<MetodoFila, number>();
  for (const [k, v] of Object.entries(porMetodo ?? {})) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) continue;
    const m = metodoDe(k);
    acum.set(m, (acum.get(m) ?? 0) + n);
  }
  return [...acum.entries()]
    .map(([metodo, n]) => ({ metodo, n }))
    .sort((a, b) => b.n - a.n || ORDEN_METODOS.indexOf(a.metodo) - ORDEN_METODOS.indexOf(b.metodo));
}

// ─── Filas de «En vivo»: marcas e intentos mezclados ─────────────────────────

export type FilaVivo =
  | ({ clase: 'marca'; clave: string; metodoFila: MetodoFila } & MarcaVivo)
  | ({ clase: 'intento'; clave: string; metodoFila: MetodoFila } & IntentoVivo);

function instante(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/** Marcas e intentos rechazados en una sola lista, por hora (la primera del día arriba, como el Figma). */
export function filasEnVivo(r: Pick<RespuestaEnVivo, 'marcas' | 'intentos'> | null | undefined): FilaVivo[] {
  if (!r) return [];
  const marcas: FilaVivo[] = (r.marcas ?? []).map((m) => ({ ...m, clase: 'marca', clave: `m:${m.id}`, metodoFila: metodoDe(m.metodo) }));
  const intentos: FilaVivo[] = (r.intentos ?? []).map((i) => ({ ...i, clase: 'intento', clave: `i:${i.id}`, metodoFila: metodoDe(i.metodo) }));
  return [...marcas, ...intentos].sort((a, b) => instante(a.hora) - instante(b.hora) || a.clave.localeCompare(b.clave));
}

/** Clave de texto de la columna «Marca». Los rechazados se muestran como «Intento». */
export function claveTipoFila(f: FilaVivo): 'entrada' | 'salida' | 'inicioDescanso' | 'finDescanso' | 'intento' | 'otra' {
  if (f.clase === 'intento') return 'intento';
  switch (f.tipo) {
    case 'check_in':
      return 'entrada';
    case 'check_out':
      return 'salida';
    case 'break_start':
      return 'inicioDescanso';
    case 'break_end':
      return 'finDescanso';
    default:
      return 'otra';
  }
}

export type VerificacionFila = Verificacion | { clave: 'rechazada'; tono: 'peligro'; motivo: string };

/** Insignia de «Verificación»: la de la marca (metodos.ts) o «Rechazada: <motivo>». */
export function verificacionFila(f: FilaVivo): VerificacionFila {
  if (f.clase === 'intento') return { clave: 'rechazada', tono: 'peligro', motivo: claveRechazo(f.motivo) };
  return verificacionDeMarca({
    metodo: f.metodo,
    revisar: f.revisar,
    manual: f.manual,
    ubicacion_validada: f.ubicacion_validada,
    tarde_minutos: f.tarde_minutos,
    distancia_m: f.distancia_m,
  });
}

/** Grupo del filtro «Verificación». */
export type GrupoVerificacion = 'correctas' | 'por_revisar' | 'rechazadas';
export const GRUPOS_VERIFICACION: readonly GrupoVerificacion[] = ['correctas', 'por_revisar', 'rechazadas'];

export function grupoVerificacion(v: VerificacionFila): GrupoVerificacion {
  if (v.clave === 'rechazada') return 'rechazadas';
  return v.tono === 'exito' || v.tono === 'informacion' ? 'correctas' : 'por_revisar';
}

function metros(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/** Qué se escribe en «Punto o dispositivo». */
export type PuntoFila =
  | { tipo: 'registrada'; por: string }
  | { tipo: 'punto'; nombre: string }
  | { tipo: 'sede'; sede: string; metros: number | null }
  | { tipo: 'distancia'; metros: number }
  | { tipo: 'ninguno' };

export function puntoDeFila(f: FilaVivo): PuntoFila {
  if (f.clase === 'intento') {
    if (f.punto) return { tipo: 'punto', nombre: f.punto };
    const m = metros(f.distancia_m);
    return m !== null ? { tipo: 'distancia', metros: m } : { tipo: 'ninguno' };
  }
  if (f.manual && f.registrada_por) return { tipo: 'registrada', por: f.registrada_por };
  if (f.punto) return { tipo: 'punto', nombre: f.punto };
  if (f.metodo === 'remoto') return { tipo: 'ninguno' };
  if (f.sede_marca) return { tipo: 'sede', sede: f.sede_marca, metros: metros(f.distancia_m) };
  return { tipo: 'ninguno' };
}

function normalizar(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Búsqueda «persona, punto o dispositivo»: nombre, cargo, área, sede y punto, sin tildes. */
export function coincideFila(f: FilaVivo, texto: string): boolean {
  const q = normalizar(texto);
  if (!q) return true;
  const campos = [f.nombre, f.cargo, f.area, f.sede, f.punto, f.clase === 'marca' ? f.sede_marca : null, f.clase === 'marca' ? f.registrada_por : null];
  return campos.some((c) => normalizar(c).includes(q));
}

export interface FiltrosVivo {
  texto: string;
  metodo: MetodoFila | null;
  verificacion: GrupoVerificacion | null;
}

export function filtrarVivo(filas: readonly FilaVivo[], f: FiltrosVivo): FilaVivo[] {
  return filas.filter(
    (x) =>
      coincideFila(x, f.texto) && (!f.metodo || x.metodoFila === f.metodo) && (!f.verificacion || grupoVerificacion(verificacionFila(x)) === f.verificacion)
  );
}

/** Métodos que aparecen en las filas de hoy (opciones del filtro), en el orden fijo. */
export function metodosDeFilas(filas: readonly FilaVivo[]): MetodoFila[] {
  const presentes = new Set(filas.map((f) => f.metodoFila));
  return ORDEN_METODOS.filter((m) => presentes.has(m));
}

/** Motivos de «Por revisar» que hay hoy, para el detalle del indicador («sin ubicación, manual»). */
export type MotivoRevisar = 'sin_ubicacion' | 'computador' | 'sin_senal' | 'manual';
export function motivosPorRevisar(marcas: readonly Pick<MarcaVivo, 'revisar' | 'manual' | 'metodo'>[]): MotivoRevisar[] {
  const s = new Set<MotivoRevisar>();
  for (const m of marcas) {
    if (m.revisar === 'sin_ubicacion') s.add('sin_ubicacion');
    else if (m.revisar === 'computador_sin_qr') s.add('computador');
    else if (m.revisar === 'fuera_de_linea') s.add('sin_senal');
    if (m.manual || m.metodo === 'manual') s.add('manual');
  }
  return (['sin_ubicacion', 'computador', 'sin_senal', 'manual'] as const).filter((k) => s.has(k));
}

/** Tipo de marca que propone el diálogo de ajuste al corregir una marca. */
export function marcaParaAjuste(tipo: string): 'check_in' | 'check_out' | 'descanso' {
  if (tipo === 'check_in') return 'check_in';
  if (tipo === 'break_start' || tipo === 'break_end') return 'descanso';
  return 'check_out';
}

// ─── Dispositivos (Figma 20.28; en M0 pantallas de QR y etiquetas NFC) ───────

export const TIPOS_ALTA_M0 = ['pantalla_qr', 'etiqueta_nfc'] as const;
export type TipoAlta = (typeof TIPOS_ALTA_M0)[number];

export function esTipoAlta(v: unknown): v is TipoAlta {
  return v === 'pantalla_qr' || v === 'etiqueta_nfc';
}

/** Tipos de `time_clocks.kind`; `null` = registro viejo (antes de M0). */
export type TipoDispositivo = 'pantalla_qr' | 'etiqueta_nfc' | 'terminal_huella' | 'terminal_facial' | 'kiosco' | 'lector_escritorio' | 'anterior';

export interface Dispositivo {
  id: string;
  nombre: string;
  tipo: string | null;
  tipo_legado: string | null;
  sede_id: number | null;
  sede: string | null;
  descripcion: string | null;
  activo: boolean;
  ultima_conexion: string | null;
  chip: string | null;
  hoy: number;
}

export interface RespuestaDispositivos {
  puede_gestionar: boolean;
  ahora: string;
  dispositivos: Dispositivo[];
}

const TIPOS_CONOCIDOS: readonly TipoDispositivo[] = ['pantalla_qr', 'etiqueta_nfc', 'terminal_huella', 'terminal_facial', 'kiosco', 'lector_escritorio'];

export function tipoDispositivo(d: Pick<Dispositivo, 'tipo'>): TipoDispositivo {
  return (TIPOS_CONOCIDOS as readonly string[]).includes(d.tipo ?? '') ? (d.tipo as TipoDispositivo) : 'anterior';
}

/** Una pantalla está «en línea» si consultó hace menos de 2 min (la misma ventana que «En vivo»). */
export const VENTANA_EN_LINEA_MS = 2 * 60_000;

export type EstadoDispositivo = 'activa' | 'en_linea' | 'sin_conexion' | 'desactivado';

/**
 * Estado de la fila: la etiqueta no se conecta (está «Activa»); la pantalla y los
 * equipos están en línea o sin conexión según su última consulta.
 */
export function estadoDispositivo(d: Pick<Dispositivo, 'tipo' | 'activo' | 'ultima_conexion'>, ahoraMs: number): EstadoDispositivo {
  if (!d.activo) return 'desactivado';
  if (tipoDispositivo(d) === 'etiqueta_nfc') return 'activa';
  const t = d.ultima_conexion ? Date.parse(d.ultima_conexion) : NaN;
  return Number.isFinite(t) && ahoraMs - t < VENTANA_EN_LINEA_MS ? 'en_linea' : 'sin_conexion';
}

export function tonoEstadoDispositivo(e: EstadoDispositivo): 'exito' | 'peligro' | 'neutro' {
  return e === 'en_linea' ? 'exito' : e === 'sin_conexion' ? 'peligro' : 'neutro';
}

/** «hace N»: unidad y cantidad para el texto de «Última conexión». */
export function haceCuanto(desdeIso: string | null | undefined, ahoraMs: number): { unidad: 'ahora' | 'min' | 'h' | 'd'; n: number } | null {
  const t = desdeIso ? Date.parse(desdeIso) : NaN;
  if (!Number.isFinite(t)) return null;
  const min = Math.max(0, Math.floor((ahoraMs - t) / 60_000));
  if (min < 1) return { unidad: 'ahora', n: 0 };
  if (min < 60) return { unidad: 'min', n: min };
  const h = Math.floor(min / 60);
  if (h < 24) return { unidad: 'h', n: h };
  return { unidad: 'd', n: Math.floor(h / 24) };
}

export function coincideDispositivo(d: Pick<Dispositivo, 'nombre' | 'descripcion' | 'sede'>, texto: string): boolean {
  const q = normalizar(texto);
  if (!q) return true;
  return [d.nombre, d.descripcion, d.sede].some((c) => normalizar(c).includes(q));
}

/** Acciones de la fila según tipo, estado y permiso. */
export function accionesDispositivo(
  d: Pick<Dispositivo, 'tipo' | 'activo'>,
  puedeGestionar: boolean
): { abrirPantalla: boolean; regenerar: boolean; desactivar: boolean; activar: boolean } {
  const tipo = tipoDispositivo(d);
  const m0 = tipo === 'pantalla_qr' || tipo === 'etiqueta_nfc';
  return {
    abrirPantalla: puedeGestionar && tipo === 'pantalla_qr' && d.activo,
    regenerar: puedeGestionar && m0 && d.activo,
    desactivar: puedeGestionar && d.activo,
    activar: puedeGestionar && !d.activo,
  };
}

export const CHIPS_ETIQUETA = ['ntag215', 'ntag213', 'ntag424'] as const;
export type ChipEtiqueta = (typeof CHIPS_ETIQUETA)[number];

export interface AltaPunto {
  tipo: TipoAlta | null;
  nombre: string;
  sedeId: number | null;
  descripcion: string;
  chip: ChipEtiqueta;
}

export type ErrorAlta = 'tipo' | 'nombre' | 'sede' | 'descripcion';

/** Valida el alta antes de mandarla (la base vuelve a validar todo). */
export function validarAlta(a: AltaPunto): ErrorAlta | null {
  if (!esTipoAlta(a.tipo)) return 'tipo';
  const n = a.nombre.trim();
  if (n.length < 2 || n.length > 80) return 'nombre';
  if (a.sedeId === null || !Number.isInteger(a.sedeId) || a.sedeId <= 0) return 'sede';
  if (a.descripcion.trim().length > 200) return 'descripcion';
  return null;
}

/** Cuerpo de `POST /api/hrm/marcacion/dispositivos`. */
export function cuerpoAlta(a: AltaPunto): { tipo: TipoAlta; nombre: string; sede_id: number; descripcion?: string; chip?: ChipEtiqueta } | null {
  if (validarAlta(a) !== null || !esTipoAlta(a.tipo) || a.sedeId === null) return null;
  const descripcion = a.descripcion.trim();
  return {
    tipo: a.tipo,
    nombre: a.nombre.trim(),
    sede_id: a.sedeId,
    ...(descripcion ? { descripcion } : {}),
    ...(a.tipo === 'etiqueta_nfc' ? { chip: a.chip } : {}),
  };
}

// ─── URL de la pestaña ───────────────────────────────────────────────────────

export type VistaMarcacion = 'envivo' | 'metodos' | 'dispositivos';
export const VISTAS_MARCACION: readonly VistaMarcacion[] = ['envivo', 'metodos', 'dispositivos'];

export function vistaDeParametro(v: string | null | undefined): VistaMarcacion {
  return (VISTAS_MARCACION as readonly string[]).includes(v ?? '') ? (v as VistaMarcacion) : 'envivo';
}

export function agregarDeParametro(v: string | null | undefined): TipoAlta | null {
  return esTipoAlta(v) ? v : null;
}

/** Minutos desde la última carga, para «actualizado hace N min». */
export function minutosDesde(cargadoEn: number | null, ahoraMs: number): number | null {
  return cargadoEn === null ? null : Math.max(0, Math.floor((ahoraMs - cargadoEn) / 60_000));
}
