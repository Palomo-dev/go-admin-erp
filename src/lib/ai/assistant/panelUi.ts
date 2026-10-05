/**
 * GO Asistente — lógica pura del panel de escritorio (Figma «GO Asistente —
 * escritorio (propuesta)», sección `667:34452`).
 *
 * Aquí vive todo lo que el panel decide y que se puede probar sin navegador:
 * el modo acoplado/ampliado, el atajo Ctrl/⌘+J, la fase del turno, qué aviso
 * corresponde a cada código de error, cuántas respuestas alcanzan con el saldo,
 * los minutos que quedan para deshacer, el teclado de la pregunta A/B/C y la
 * agrupación del historial por día en la zona horaria de la organización.
 *
 * Módulo hoja: sin React y sin cliente de Supabase, para que lo usen el panel,
 * sus piezas y las pruebas.
 */

import { claveDeEvento, type EventoTecla } from '@/components/kit/teclas';
import { addPlainDays, toPlainDate } from '@/lib/utils/dateCore';

// ---------------------------------------------------------------------------
// Modo del panel: acoplado (400 px) o ampliado (720 px)
// ---------------------------------------------------------------------------

export type ModoPanel = 'acoplado' | 'ampliado';

/** Preferencia recordada por navegador (y, por tanto, por la persona que lo usa). */
export const CLAVE_MODO = 'go-assistant:modo';

/**
 * Evento que el panel publica en `window` cada vez que se abre, se cierra o
 * cambia de modo: `{ abierto, modo }`. El shell lo puede escuchar para pasar el
 * sidebar a rail en el modo ampliado (Figma pantalla 09, `668:37351`) sin que
 * el panel tenga que conocer al shell ni el shell al panel.
 */
export const EVENTO_ESTADO_ASISTENTE = 'go-asistente:estado';

export interface EstadoAsistente {
  abierto: boolean;
  modo: ModoPanel;
}

/**
 * Ancho de ventana desde el que el modo ampliado se pinta de verdad a 720 px
 * (decisión 3 del dueño). Por debajo, el panel se queda en 400 aunque la
 * preferencia guardada diga «ampliado».
 */
export const ANCHO_MIN_AMPLIADO = 1280;

/** Lee `detail` del evento sin fiarse de su forma. `null` si no es un estado válido. */
export function estadoDesdeEvento(detalle: unknown): EstadoAsistente | null {
  if (!detalle || typeof detalle !== 'object') return null;
  const { abierto, modo } = detalle as Partial<EstadoAsistente>;
  if (typeof abierto !== 'boolean' || (modo !== 'acoplado' && modo !== 'ampliado')) return null;
  return { abierto, modo };
}

/**
 * ¿El panel ocupa de verdad 720 px? Solo abierto, en modo ampliado y con la
 * ventana en su punto de corte. Es la condición con la que el shell pasa el
 * sidebar a rail y compacta el header al mínimo (Figma pantalla 09).
 */
export function ampliadoEfectivo(estado: EstadoAsistente, anchoVentana: number): boolean {
  return estado.abierto && estado.modo === 'ampliado' && anchoVentana >= ANCHO_MIN_AMPLIADO;
}

// ---------------------------------------------------------------------------
// Abrir el asistente desde una pantalla, con su contexto (Figma Reportes §22)
// ---------------------------------------------------------------------------

/**
 * Evento que una pantalla publica en `window` para abrir el GO Asistente con
 * su contexto: `{ contexto }`. El shell (`AppLayout`) lo escucha y abre el
 * panel; el panel guarda el contexto y lo enseña como chip del composer. Así
 * reportes no conoce al shell ni el shell a reportes (y no hay un segundo chat
 * de reportes: la opción descartada en la sección 22).
 *
 * El contexto es un DATO de la página —qué reporte, qué periodo, qué
 * sucursal—, nunca un permiso: la organización sale de la sesión y el servidor
 * vuelve a validar la sucursal y la lista blanca de reportes.
 */
export const EVENTO_ABRIR_ASISTENTE = 'go-asistente:abrir';

/** Periodo tal como lo pinta la pantalla (la etiqueta ya viene en su idioma). */
export interface PeriodoContexto {
  tipo: string;
  fechaInicio: string;
  fechaFin: string;
  horaInicio: string | null;
  horaFin: string | null;
  etiqueta: string;
}

export interface ContextoReportesAsistente {
  origen: 'reportes';
  /** `null` en el inicio del centro de reportes (sin un reporte abierto). */
  reporte: {
    id: string;
    titulo: string;
    /** Tarjeta del centro (`ventas`, `inventario`…): decide las sugerencias. */
    grupo: string;
    /** El reporte se puede correr con el periodo anterior y comparar. */
    comparativo: boolean;
    /** El reporte se filtra por sucursal y la persona puede elegir más de una. */
    porSucursal: boolean;
  } | null;
  periodo: PeriodoContexto;
  /** `id: null` = consolidado. El nombre es solo para el chip. */
  sucursal: { id: number | null; nombre: string | null };
  /** Pestaña del visor («Por sucursal», «Por medio de pago»…), o `null`. */
  vista: string | null;
  /** Ruta desde la que se abrió: al salir de ella, el contexto caduca. */
  ruta: string;
}

/** Hoy solo reportes; otras pantallas añadirán su variante con su `origen`. */
export type ContextoAsistente = ContextoReportesAsistente;

const RE_ID = /^[\w-]{1,80}$/;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const RE_TIPO = /^[a-z]{3,20}$/;

/** Texto corto sin saltos ni caracteres de control; `null` si no sirve. */
function textoCorto(valor: unknown, max: number): string | null {
  if (typeof valor !== 'string') return null;
  // eslint-disable-next-line no-control-regex -- se quitan a propósito los caracteres de control
  const limpio = valor.replace(/[\u0000-\u001f\u007f`]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!limpio) return null;
  return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio;
}

function idSucursal(valor: unknown): number | null | undefined {
  if (valor === null) return null;
  return typeof valor === 'number' && Number.isSafeInteger(valor) && valor > 0 ? valor : undefined;
}

/**
 * Valida un contexto sin fiarse de su forma: lo publica cualquier código de la
 * página (o una extensión del navegador). `null` si no es un contexto válido.
 * Lo que sobra se descarta; los textos se recortan.
 */
export function parsearContextoAsistente(valor: unknown): ContextoAsistente | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const v = valor as Record<string, unknown>;
  if (v.origen !== 'reportes') return null;

  const p = v.periodo as Record<string, unknown> | null | undefined;
  if (!p || typeof p !== 'object') return null;
  if (typeof p.tipo !== 'string' || !RE_TIPO.test(p.tipo)) return null;
  if (typeof p.fechaInicio !== 'string' || !RE_FECHA.test(p.fechaInicio)) return null;
  if (typeof p.fechaFin !== 'string' || !RE_FECHA.test(p.fechaFin) || p.fechaInicio > p.fechaFin) return null;
  const conFranja = typeof p.horaInicio === 'string' && RE_HORA.test(p.horaInicio) && typeof p.horaFin === 'string' && RE_HORA.test(p.horaFin);
  const periodo: PeriodoContexto = {
    tipo: p.tipo,
    fechaInicio: p.fechaInicio,
    fechaFin: p.fechaFin,
    horaInicio: conFranja ? (p.horaInicio as string) : null,
    horaFin: conFranja ? (p.horaFin as string) : null,
    etiqueta: textoCorto(p.etiqueta, 80) ?? `${p.fechaInicio} – ${p.fechaFin}`,
  };

  const s = v.sucursal as Record<string, unknown> | null | undefined;
  if (!s || typeof s !== 'object') return null;
  const sucursalId = idSucursal(s.id);
  if (sucursalId === undefined) return null;

  let reporte: ContextoReportesAsistente['reporte'] = null;
  if (v.reporte !== null && v.reporte !== undefined) {
    const r = v.reporte as Record<string, unknown>;
    if (typeof r !== 'object' || typeof r.id !== 'string' || !RE_ID.test(r.id)) return null;
    const grupo = typeof r.grupo === 'string' && RE_ID.test(r.grupo) ? r.grupo : 'general';
    reporte = {
      id: r.id,
      titulo: textoCorto(r.titulo, 120) ?? r.id,
      grupo,
      comparativo: r.comparativo === true,
      porSucursal: r.porSucursal === true,
    };
  }

  const ruta = typeof v.ruta === 'string' && v.ruta.startsWith('/') && !v.ruta.startsWith('//') ? v.ruta.slice(0, 300) : null;
  if (!ruta) return null;

  return {
    origen: 'reportes',
    reporte,
    periodo,
    sucursal: { id: sucursalId, nombre: textoCorto(s.nombre, 120) },
    vista: typeof v.vista === 'string' && RE_ID.test(v.vista) ? v.vista : null,
    ruta,
  };
}

/** Lee `detail` del evento de apertura. `null` si no trae un contexto válido. */
export function contextoDesdeEvento(detalle: unknown): ContextoAsistente | null {
  if (!detalle || typeof detalle !== 'object') return null;
  return parsearContextoAsistente((detalle as { contexto?: unknown }).contexto);
}

/**
 * ¿El evento solo actualiza el contexto (cambiaron los filtros de la pantalla
 * desde la que ya se abrió) sin volver a abrir un panel que la persona cerró?
 */
export function esSoloActualizacion(detalle: unknown): boolean {
  return Boolean(detalle) && typeof detalle === 'object' && (detalle as { abrir?: unknown }).abrir === false;
}

/**
 * Contexto que debe quedar en el panel tras un evento: una apertura lo
 * sustituye; una actualización solo vale para la misma pantalla de la que ya
 * vino el contexto (otra pantalla no puede colarse sin que la persona lo pida).
 */
export function contextoTrasEvento(actual: ContextoAsistente | null, detalle: unknown): ContextoAsistente | null {
  const nuevo = contextoDesdeEvento(detalle);
  if (!nuevo) return actual;
  if (!esSoloActualizacion(detalle)) return nuevo;
  return actual && actual.ruta === nuevo.ruta ? nuevo : actual;
}

/**
 * Abre el GO Asistente con este contexto (o, con `abrir: false`, solo lo
 * actualiza si ya vino de esta pantalla). Devuelve `false` si el contexto no
 * es válido (no se publica nada) o si no hay `window`.
 */
export function abrirAsistente(
  contexto: ContextoAsistente,
  opciones: { abrir?: boolean; destino?: Pick<Window, 'dispatchEvent'> } = {}
): boolean {
  const valido = parsearContextoAsistente(contexto);
  if (!valido) return false;
  const objetivo = opciones.destino ?? (typeof window !== 'undefined' ? window : null);
  if (!objetivo) return false;
  try {
    const detail = opciones.abrir === false ? { contexto: valido, abrir: false } : { contexto: valido };
    objetivo.dispatchEvent(new CustomEvent(EVENTO_ABRIR_ASISTENTE, { detail }));
    return true;
  } catch {
    // Sin CustomEvent (entornos muy viejos): el botón del header sigue abriendo.
    return false;
  }
}

/**
 * ¿Sigue vigente el contexto en esta ruta? Caduca al salir de la pantalla
 * desde la que se abrió: el chip no puede decir «Ventas por día» en Productos.
 */
export function contextoVigente(contexto: ContextoAsistente | null, rutaActual: string | null): boolean {
  return Boolean(contexto && rutaActual && contexto.ruta === rutaActual);
}

/**
 * Lo que viaja al servidor: el id del reporte, el periodo, la sucursal y la
 * vista. Ni el título ni el nombre de la sucursal (el servidor los resuelve
 * del catálogo) ni nada que parezca un permiso.
 */
export function contextoParaServidor(contexto: ContextoAsistente): Record<string, unknown> {
  return {
    reporteId: contexto.reporte?.id ?? null,
    periodo: {
      tipo: contexto.periodo.tipo,
      fechaInicio: contexto.periodo.fechaInicio,
      fechaFin: contexto.periodo.fechaFin,
      horaInicio: contexto.periodo.horaInicio,
      horaFin: contexto.periodo.horaFin,
    },
    sucursalId: contexto.sucursal.id,
    vista: contexto.vista,
  };
}

/** Una sugerencia derivada del contexto: clave de `asistente.reporte.sugerencias` e icono. */
export interface SugerenciaContexto {
  clave: string;
  icono: IconoSugerencia;
}

const SUGERENCIAS_POR_GRUPO: Record<string, SugerenciaContexto[]> = {
  ventas: [
    { clave: 'mejorDia', icono: 'ventas' },
    { clave: 'vendedorTicket', icono: 'personas' },
  ],
  inventario: [
    { clave: 'agotarse', icono: 'inventario' },
    { clave: 'sinRotacion', icono: 'inventario' },
  ],
  compras: [{ clave: 'proveedor', icono: 'facturas' }],
  finanzas: [
    { clave: 'variacion', icono: 'facturas' },
    { clave: 'vencimientos', icono: 'facturas' },
  ],
  contabilidad: [{ clave: 'variacion', icono: 'facturas' }],
};

/**
 * «Preguntas sobre este reporte» (Figma 22-02): cuatro sugerencias derivadas
 * del reporte, sin llamar al servidor ni gastar créditos. Las propias del
 * grupo van primero; la comparación solo si el reporte la admite (y «por
 * sucursal» solo si se filtra por sucursal y hay entre cuáles elegir); el
 * resumen para el gerente siempre cierra la lista.
 *
 * Sin reporte (inicio del centro) devuelve `[]`: ahí mandan las sugerencias de
 * la página que da el servidor.
 */
export function sugerenciasReporte(contexto: ContextoAsistente | null, maximo = 4): SugerenciaContexto[] {
  const reporte = contexto?.reporte;
  if (!reporte) return [];
  const propias = SUGERENCIAS_POR_GRUPO[reporte.grupo] ?? [];

  const comparar: SugerenciaContexto[] = [];
  if (reporte.comparativo && reporte.porSucursal) comparar.push({ clave: 'compararSucursal', icono: 'sucursal' });
  else if (reporte.comparativo) comparar.push({ clave: 'comparar', icono: 'ventas' });
  else if (reporte.porSucursal) comparar.push({ clave: 'porSucursal', icono: 'sucursal' });

  const relleno: SugerenciaContexto[] = [
    { clave: 'destaca', icono: 'general' },
    { clave: 'revisar', icono: 'general' },
    { clave: 'fueraDeLoNormal', icono: 'general' },
  ];
  const cierre: SugerenciaContexto = { clave: 'resumen', icono: 'resumen' };

  // Orden del Figma: la del grupo, la comparación, la segunda del grupo, el resumen.
  const cuerpo = [propias[0], ...comparar, ...propias.slice(1), ...relleno].filter((s): s is SugerenciaContexto => Boolean(s));
  const vistos = new Set<string>();
  const unicos = cuerpo.filter((s) => {
    if (vistos.has(s.clave)) return false;
    vistos.add(s.clave);
    return true;
  });
  return [...unicos.slice(0, Math.max(0, maximo - 1)), cierre];
}

type LecturaAlmacen = Pick<Storage, 'getItem'>;
type EscrituraAlmacen = Pick<Storage, 'setItem'>;

/** Lee el modo guardado. Sin almacenamiento, o con un valor raro, acoplado. */
export function leerModo(almacen: LecturaAlmacen | null | undefined): ModoPanel {
  try {
    return almacen?.getItem(CLAVE_MODO) === 'ampliado' ? 'ampliado' : 'acoplado';
  } catch {
    // Safari privado, cookies bloqueadas: el accesor mismo lanza.
    return 'acoplado';
  }
}

/** Guarda el modo. Si el navegador no deja, se pierde la preferencia y nada más. */
export function guardarModo(almacen: EscrituraAlmacen | null | undefined, modo: ModoPanel): void {
  try {
    almacen?.setItem(CLAVE_MODO, modo);
  } catch {
    /* sin almacenamiento, sin preferencia */
  }
}

// ---------------------------------------------------------------------------
// Atajo global: Ctrl+J (⌘+J en Mac)
// ---------------------------------------------------------------------------

/**
 * ¿Es el atajo del asistente? Se compara por `code` (tecla física) a través de
 * `claveDeEvento` del kit, así que funciona igual en teclados no QWERTY. Ctrl+K
 * es del buscador global: por eso el asistente usa J (decisión de la propuesta).
 */
export function esAtajoAsistente(evento: EventoTecla): boolean {
  const clave = claveDeEvento(evento);
  return clave === 'ctrl+j' || clave === 'meta+j';
}

export type AccionAtajo = 'abrir' | 'enfocar' | 'cerrar';

/**
 * Qué hace Ctrl+J según el estado. La propuesta dice «abre, cierra y enfoca el
 * composer»; en la práctica eso son tres casos, no dos: si el panel ya está
 * abierto pero el foco está en la pantalla, cerrarlo sería justo lo contrario
 * de lo que la persona quiere (volver a escribirle al asistente).
 */
export function accionAtajo(estado: { abierto: boolean; focoDentro: boolean }): AccionAtajo {
  if (!estado.abierto) return 'abrir';
  return estado.focoDentro ? 'cerrar' : 'enfocar';
}

// ---------------------------------------------------------------------------
// Fase del turno (Figma `AsistentePasos`: pensando / consultando / escribiendo)
// ---------------------------------------------------------------------------

export type FaseTurno = 'pensando' | 'consultando' | 'escribiendo';

export interface PasoTurno {
  name: string;
  label: string;
  summary?: string;
  ok?: boolean;
}

export function faseDelTurno(pasos: readonly PasoTurno[], textoEnCurso: string): FaseTurno {
  if (textoEnCurso) return 'escribiendo';
  return pasos.length > 0 ? 'consultando' : 'pensando';
}

/** Un paso terminó cuando llegó su `tool_end` (trae `summary` u `ok`). */
export function pasoTerminado(paso: PasoTurno): boolean {
  return paso.ok !== undefined || Boolean(paso.summary);
}

// ---------------------------------------------------------------------------
// Avisos (Figma `AsistenteAviso` 664:16499)
// ---------------------------------------------------------------------------

/**
 * Los cuatro tipos del Figma más dos que el diseño no contemplaba y que sí
 * ocurren: la sesión caducada (401) y el límite de velocidad (429). Sin ellos,
 * esos dos casos caían en «error» con un «Reintentar» que no arregla nada.
 */
export type TipoAviso = 'creditos_bajos' | 'sin_creditos' | 'error' | 'sin_permiso' | 'sesion' | 'limite';

/** Motivos de denegación de `evaluateTool` y códigos 403 de la sesión. */
const CODIGOS_SIN_PERMISO = new Set([
  'FORBIDDEN_TOOL',
  'level_off',
  'level_too_low',
  'not_enabled',
  'voice_blocked',
  'no_permission',
  'module_inactive',
  'ORG_FORBIDDEN',
  'NO_MEMBERSHIP',
  'ADMIN_REQUIRED',
]);

/** Qué aviso corresponde a un código de error del stream o de una ruta. */
export function avisoPorCodigo(codigo: string | null | undefined): TipoAviso {
  if (!codigo) return 'error';
  if (codigo === 'NO_CREDITS') return 'sin_creditos';
  if (codigo === 'UNAUTHENTICATED') return 'sesion';
  if (codigo === 'RATE_LIMITED') return 'limite';
  if (CODIGOS_SIN_PERMISO.has(codigo)) return 'sin_permiso';
  return 'error';
}

/**
 * ¿Tiene sentido ofrecer «Reintentar»? Solo cuando reintentar puede cambiar el
 * resultado. Sin créditos, sin permiso o sin sesión, reintentar es gastar un
 * clic (y, con créditos, quizá un cobro) en algo que va a fallar igual.
 */
export function avisoPermiteReintentar(tipo: TipoAviso): boolean {
  return tipo === 'error' || tipo === 'limite';
}

// ---------------------------------------------------------------------------
// Créditos
// ---------------------------------------------------------------------------

/**
 * Cuántas respuestas alcanzan con el saldo. El promedio es el REAL de la
 * organización (lo calcula `GET /api/ai-assistant/credits` sobre sus últimos
 * cobros `assistant_chat`); el Figma decía «unas 4» con un número fijo.
 * Devuelve `null` si no hay promedio fiable: mejor no decir nada que inventar.
 */
export function respuestasEstimadas(saldo: number, promedioPorRespuesta: number | null | undefined): number | null {
  if (!promedioPorRespuesta || !Number.isFinite(promedioPorRespuesta) || promedioPorRespuesta <= 0) return null;
  if (!Number.isFinite(saldo) || saldo <= 0) return 0;
  return Math.floor(saldo / promedioPorRespuesta);
}

// ---------------------------------------------------------------------------
// Deshacer y caducidad
// ---------------------------------------------------------------------------

/**
 * Minutos que quedan hasta `hastaIso`, redondeando hacia arriba (con 30 s
 * restantes se lee «1 min», no «0 min»). `null` si la fecha no sirve; 0 si ya
 * pasó.
 */
export function minutosRestantes(hastaIso: string | null | undefined, ahora: number = Date.now()): number | null {
  if (!hastaIso) return null;
  const hasta = Date.parse(hastaIso);
  if (!Number.isFinite(hasta)) return null;
  const ms = hasta - ahora;
  return ms <= 0 ? 0 : Math.ceil(ms / 60_000);
}

// ---------------------------------------------------------------------------
// Pregunta A/B/C: teclado
// ---------------------------------------------------------------------------

/**
 * Opción que corresponde a una tecla (A, B, C, D…). Solo letras sueltas sin
 * modificadores: Ctrl+C sigue siendo copiar.
 */
export function opcionPorTecla<T extends { key: string }>(
  evento: Pick<EventoTecla, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>,
  opciones: readonly T[]
): T | null {
  if (evento.ctrlKey || evento.metaKey || evento.altKey) return null;
  const tecla = (evento.key ?? '').toUpperCase();
  if (!/^[A-Z]$/.test(tecla)) return null;
  return opciones.find((o) => o.key.toUpperCase() === tecla) ?? null;
}

// ---------------------------------------------------------------------------
// Confirmación de riesgo alto (§6.2 del plan)
// ---------------------------------------------------------------------------

/**
 * §6.2: en riesgo `high` «el resumen se **repite** antes de ejecutar». Con un
 * solo clic la tarjeta no lo cumplía. Riesgo medio: un clic basta.
 */
export function requiereDobleConfirmacion(riesgo: string | null | undefined): boolean {
  return riesgo === 'high';
}

// ---------------------------------------------------------------------------
// Historial agrupado por día (en la zona de la organización)
// ---------------------------------------------------------------------------

export type GrupoFecha = 'hoy' | 'ayer' | 'semana' | 'anteriores';

export const ORDEN_GRUPOS: readonly GrupoFecha[] = ['hoy', 'ayer', 'semana', 'anteriores'];

/**
 * Grupo de un instante. El día se calcula en la zona horaria de la
 * organización (`toPlainDate`), nunca con `toISOString().split('T')[0]`: a las
 * 20:00 en Bogotá ya es mañana en UTC, y una conversación de hoy saldría en
 * «Ayer» (el bug del día corrido, CLAUDE.md).
 */
export function grupoDeFecha(iso: string | null | undefined, zona: string, ahora: Date = new Date()): GrupoFecha {
  if (!iso) return 'anteriores';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return 'anteriores';
  const dia = toPlainDate(fecha, zona);
  const hoy = toPlainDate(ahora, zona);
  if (dia >= hoy) return 'hoy';
  if (dia === addPlainDays(hoy, -1)) return 'ayer';
  if (dia >= addPlainDays(hoy, -6)) return 'semana';
  return 'anteriores';
}

/** Agrupa conservando el orden de llegada (el servidor ya ordena por recencia). */
export function agruparPorFecha<T>(
  elementos: readonly T[],
  fechaDe: (e: T) => string | null | undefined,
  zona: string,
  ahora: Date = new Date()
): Array<{ grupo: GrupoFecha; elementos: T[] }> {
  const mapa = new Map<GrupoFecha, T[]>();
  for (const e of elementos) {
    const g = grupoDeFecha(fechaDe(e), zona, ahora);
    if (!mapa.has(g)) mapa.set(g, []);
    mapa.get(g)!.push(e);
  }
  return ORDEN_GRUPOS.filter((g) => mapa.has(g)).map((g) => ({ grupo: g, elementos: mapa.get(g)! }));
}

// ---------------------------------------------------------------------------
// Sugerencias: icono según lo que piden
// ---------------------------------------------------------------------------

export type IconoSugerencia =
  | 'ventas'
  | 'inventario'
  | 'clientes'
  | 'facturas'
  | 'configuracion'
  | 'archivo'
  | 'sucursal'
  | 'personas'
  | 'resumen'
  | 'general';

/** Palabras → icono. Las sugerencias llegan como texto del servidor. */
const PISTAS_ICONO: Array<[IconoSugerencia, RegExp]> = [
  ['archivo', /\b(sube|subir|carga|cargar|listado|archivo|excel|csv)\b/],
  ['facturas', /\b(factura|facturas|cobrar|vencid[ao]s?|cartera|pagar)\b/],
  ['inventario', /\b(stock|inventario|producto|productos|existencias|bodega)\b/],
  ['clientes', /\b(cliente|clientes|contacto|lead|leads)\b/],
  ['ventas', /\b(venta|ventas|vendimos|vendi|ingresos|caja)\b/],
  ['configuracion', /\b(configur[oa]r?|configuracion|impuestos?|metodos? de pago|ajustes?|permisos?)\b/],
];

export function iconoSugerencia(texto: string): IconoSugerencia {
  const t = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  for (const [icono, patron] of PISTAS_ICONO) if (patron.test(t)) return icono;
  return 'general';
}
