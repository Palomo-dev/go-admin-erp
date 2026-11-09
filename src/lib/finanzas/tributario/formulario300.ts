/**
 * Borrador del formulario 300 por casillas y clasificación de IVA por línea.
 * Lee el jsonb de `fn_tributario_borrador_iva_300` (migración 20261108151000)
 * y valida lo que la pantalla manda a `fn_iva_clasificar_linea` (20261108150000)
 * y a `fn_iva_naturaleza_asiento_guardar` (20261108150500). Sin React ni Supabase.
 *
 * Reglas del Contador (2026-11-07, rondas 1 y 2): cada casilla sale de líneas
 * clasificadas o de asientos con naturaleza registrada CON SOPORTE; lo que no
 * se puede ubicar va a «pendientes» con su valor, nunca se omite. Las señales
 * (contrapartida banco, suma cero en 2408) no clasifican. «Conciliado» ≠
 * «aprobado fiscalmente» (el sistema nunca lo aprueba). Valores a miles.
 */

// ── Catálogos ───────────────────────────────────────────────────────────────

export const TRATAMIENTOS_IVA = ['gravada', 'exenta', 'excluida', 'no_sujeta'] as const;
export type TratamientoIva = (typeof TRATAMIENTOS_IVA)[number];

export const TIPOS_OPERACION_IVA = [
  'bienes',
  'servicios',
  'exportacion_bienes',
  'exportacion_servicios',
  'importacion',
  'aiu',
  'licores',
  'retiro_inventario',
  'otra_especial',
] as const;
export type TipoOperacionIva = (typeof TIPOS_OPERACION_IVA)[number];
export const TIPOS_EXPORTACION: readonly TipoOperacionIva[] = ['exportacion_bienes', 'exportacion_servicios'];

/** Soporte de la condición de una línea (B1: una exportación exige su declaración, número y fecha). */
export const SOPORTES_LINEA = ['declaracion_exportacion', 'soporte_exportacion_servicios', 'otro'] as const;
export type SoporteLinea = (typeof SOPORTES_LINEA)[number];

export const ESTADOS_DESCONTABLE = ['por_evaluar', 'descontable', 'no_descontable', 'proporcional'] as const;
export type EstadoDescontable = (typeof ESTADOS_DESCONTABLE)[number];

export const NATURALEZAS_MOVIMIENTO = [
  'pago_dian',
  'traslado_auxiliares',
  'cierre',
  'devolucion_compra',
  'ajuste_procedente',
  'correccion_error',
  'importacion',
  'otro',
] as const;
export type NaturalezaMovimiento = (typeof NATURALEZAS_MOVIMIENTO)[number];

export const SOPORTES_MOVIMIENTO = ['recibo_pago_dian', 'nota_credito_proveedor', 'nota_ajuste_documento_soporte', 'comprobante_interno', 'otro'] as const;
export type SoporteMovimiento = (typeof SOPORTES_MOVIMIENTO)[number];
/** Ronda 3: cómo quedó resuelto el documento electrónico de una venta que nunca existió. */
export const RESOLUCIONES_DOC_ELECTRONICO = ['nota_credito_electronica', 'anulacion_dian', 'constancia'] as const;
export type ResolucionDocElectronico = (typeof RESOLUCIONES_DOC_ELECTRONICO)[number];

/** Casillas del formulario 2026 fijadas por el Contador (rondas 1 y 2). */
export const CASILLAS_300 = [27, 28, 30, 31, 35, 39, 40, 42, 47, 50, 51, 52, 53, 54, 56, 58, 59, 66, 71, 72, 74, 75, 79] as const;
export type Casilla300 = (typeof CASILLAS_300)[number];

/** Filas del formulario: casilla de base y, si la hay, la de IVA. En el orden en que se muestran. */
export const FILAS_300: readonly { base: Casilla300; iva: Casilla300 | null; concepto: string; lado: 'generado' | 'descontable' }[] = [
  { base: 27, iva: 58, concepto: 'ventas_5', lado: 'generado' },
  { base: 28, iva: 59, concepto: 'ventas_general', lado: 'generado' },
  { base: 30, iva: null, concepto: 'exportacion_bienes', lado: 'generado' },
  { base: 31, iva: null, concepto: 'exportacion_servicios', lado: 'generado' },
  { base: 35, iva: null, concepto: 'exentas_nacionales', lado: 'generado' },
  { base: 39, iva: null, concepto: 'excluidas', lado: 'generado' },
  { base: 40, iva: null, concepto: 'no_gravadas', lado: 'generado' },
  { base: 56, iva: 66, concepto: 'devoluciones_compras', lado: 'generado' },
  { base: 47, iva: null, concepto: 'importaciones_no_gravadas', lado: 'descontable' },
  { base: 50, iva: 71, concepto: 'compras_bienes_5', lado: 'descontable' },
  { base: 51, iva: 72, concepto: 'compras_bienes_general', lado: 'descontable' },
  { base: 52, iva: 74, concepto: 'compras_servicios_5', lado: 'descontable' },
  { base: 53, iva: 75, concepto: 'compras_servicios_general', lado: 'descontable' },
  { base: 54, iva: null, concepto: 'compras_no_gravadas', lado: 'descontable' },
  { base: 42, iva: 79, concepto: 'devoluciones_ventas', lado: 'descontable' },
];

export const CASILLAS_GENERADO: readonly Casilla300[] = [58, 59, 66];
export const CASILLAS_DESCONTABLE: readonly Casilla300[] = [71, 72, 74, 75, 79];

export const MOTIVOS_PENDIENTE = [
  'sin_clasificar',
  'tarifa_inconsistente',
  'sin_tipo_operacion',
  'operacion_especial',
  'tarifa_no_prevista',
  'exportacion_sin_soporte',
  'exenta_sin_fundamento',
  'sin_fundamento',
  'casilla_por_confirmar',
  'soporte_supuesto_especial',
  'descontable_por_evaluar',
  'no_descontable_en_2408',
  'sin_lineas',
  'no_cuadra',
  'documento_de_otro_periodo',
  'reversa_contable',
  'correccion_otro_periodo',
  'correccion_incompleta',
  // Ronda 4: completar el expediente no retira la venta; hace falta la decisión de tratamiento y período.
  'correccion_sin_decision',
  'correccion_por_nota_credito',
  'correccion_mantiene_venta',
  // Ronda 4 · casilla 47: soporte aduanero estructurado; un servicio del exterior no va a la 47.
  'importacion_sin_soporte_aduanero',
  'importacion_servicio_no_va_47',
  'devolucion_iva_no_descontado',
  'devolucion_compra_no_cuadra',
  'sugerido_por_confirmar',
  'sin_soporte',
  'otro_movimiento',
] as const;
export type MotivoPendiente = (typeof MOTIVOS_PENDIENTE)[number];

export type ClaseOrigen = 'venta_pos' | 'factura_venta' | 'nota_credito' | 'nota_debito' | 'factura_compra' | 'documento_soporte' | 'asiento';

// ── Tipos de la respuesta ───────────────────────────────────────────────────

export interface Origen300 {
  clase: ClaseOrigen;
  documentoId: string;
  numero: string | null;
  /** Fecha de contabilización (la que ubica el valor en el período). */
  fecha: string | null;
  /** Fecha del documento (su mes), que puede ser de otro período. */
  fechaDocumento: string | null;
  tabla: 'invoice_items' | 'sale_items' | null;
  lineaId: string | null;
  base: number | null;
  iva: number;
  asiento: number | null;
  entrePeriodos: boolean;
  corrigeOtroPeriodo: boolean;
  causadoPeriodoAnterior: boolean;
  posteriorDeclaracion: boolean;
  facturaOrigen: { id: string; numero: string | null } | null;
  /** Ronda 4: tarifa del POS deducida por coincidencia aritmética: no prueba sola su procedencia legal. */
  tarifaInferida: boolean;
}

export interface Casilla300Valor {
  casilla: Casilla300;
  tipo: 'base' | 'iva';
  par: Casilla300 | null;
  concepto: string;
  lado: 'generado' | 'descontable';
  valor: number;
  valorFormulario: number;
  diferenciaRedondeo: number;
  totalOrigenes: number;
  senalada: boolean;
  origenes: Origen300[];
}

export interface Pendiente300 {
  motivo: MotivoPendiente;
  lado: 'generado' | 'descontable' | 'otros';
  base: number;
  iva: number;
  efecto2408: number;
  totalOrigenes: number;
  origenes: Origen300[];
}

export type NaturalezaOtro = NaturalezaMovimiento | 'reversa_contable' | 'sin_registro';

export interface OtroMovimiento300 {
  asiento: number;
  origen: string | null;
  fecha: string | null;
  valor: number;
  naturaleza: NaturalezaOtro;
  declarada: boolean;
  /** Señal (no clasificación): contrapartida banco/caja, suma cero en 2408 o (ronda 4) asiento de cierre. */
  sugerida: 'pago_dian' | 'traslado_auxiliares' | 'cierre' | null;
  destino: 'no_afecta' | 'por_diligenciar' | 'casilla' | 'pendiente';
  motivo: MotivoPendiente | null;
  soporteTipo: SoporteMovimiento | null;
  soporte: string | null;
  soporteFecha: string | null;
  revierteA: number | null;
  facturaCompra: string | null;
  base: number | null;
  ivaRecuperable: number | null;
  posteriorDeclaracion: boolean;
  /** Ronda 3: estado de la corrección de error registrada sobre la reversa (null si no es una). */
  correccion: CorreccionError300 | null;
}

export interface CorreccionError300 {
  /** Solo completa saca la venta de las casillas: soporte, documento electrónico resuelto y marca de declaración. */
  completa: boolean;
  resolucion: ResolucionDocElectronico | null;
  referencia: string | null;
  fecha: string | null;
  corrigeDeclaracionAnterior: boolean | null;
  /** Ronda 4: lo que le falta al expediente (vacío = completo). */
  faltantes: string[];
  /** Ronda 4: decisión de tratamiento fiscal y período; sin ella la venta no sale de las casillas. */
  decision: { tratamiento: 'retirar_venta' | 'nota_credito' | 'mantener_venta'; periodoDesde: string | null; periodoHasta: string | null } | null;
  ventaEnOtroPeriodo: boolean;
}

export interface PorDiligenciar300 {
  clave: 'saldo_favor_anterior' | 'retenciones_iva_sufridas' | 'ajustes' | 'sanciones';
  valor: number | null;
  asientos: number[];
}

export interface Formulario300 {
  desde: string;
  hasta: string;
  estado: 'conciliado' | 'no_conciliado';
  /** Siempre false: el sistema nunca aprueba fiscalmente un borrador. */
  aprobadoFiscalmente: false;
  /** Siempre false: faltan las casillas «por diligenciar». */
  liquidacionCompleta: false;
  periodoDeclarado: { desde: string; hasta: string; numeroFormulario: string | null; presentadaEn: string } | null;
  casillas: Casilla300Valor[];
  pendientes: Pendiente300[];
  otrosMovimientos: OtroMovimiento300[];
  porDiligenciar: PorDiligenciar300[];
  resumen: {
    ivaGenerado: number;
    ivaGeneradoFormulario: number;
    ivaDescontable: number;
    ivaDescontableFormulario: number;
    diferenciaPreliminar: number;
    diferenciaPreliminarFormulario: number;
    pendientes: number;
    pendientesIva: number;
    /** B5: IVA no descontable que el asiento de compra ya llevó al costo (no está en la 2408 ni es pendiente). */
    ivaNoDescontableAlCosto: number;
  };
  conciliacion: { libro2408: number; casillas: number; pendientes: number; otros: number; redondeoLineas: number; diferencia: number };
  alertas: {
    documentosEntrePeriodos: number;
    notasDebitoOtroPeriodo: number;
    comprasCausadasAntes: number;
    /** Ronda 4: líneas del POS en casillas con la tarifa inferida (no probada). */
    tarifasInferidas: { lineas: number; base: number; iva: number };
    grabadosDespuesDeDeclarar: { asiento: number; origen: string | null; documentoId: string | null; fecha: string | null; periodo: { desde: string; hasta: string } }[];
    /** Ronda 3: correcciones de error de ventas de un período declarado, o marcadas «corrige una declaración anterior». */
    correccionesDeclaracionAnterior: {
      asiento: number;
      ventaAsiento: number | null;
      fechaVenta: string | null;
      completa: boolean;
      corrigeDeclaracionAnterior: boolean | null;
      periodoDeclarado: { desde: string; hasta: string; numeroFormulario: string | null } | null;
    }[];
  };
}

// ── Lectura ─────────────────────────────────────────────────────────────────

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const esCasilla = (v: unknown): v is Casilla300 => CASILLAS_300.includes(Number(v) as Casilla300);
const enLista = <T extends string>(lista: readonly T[], v: unknown): T | null => (lista.includes(v as T) ? (v as T) : null);
const CLASES: readonly ClaseOrigen[] = ['venta_pos', 'factura_venta', 'nota_credito', 'nota_debito', 'factura_compra', 'documento_soporte', 'asiento'];

function leerOrigen(v: unknown): Origen300 | null {
  const o = obj(v);
  const clase = o.clase as ClaseOrigen;
  if (!CLASES.includes(clase)) return null;
  const fo = obj(o.factura_origen);
  return {
    clase,
    documentoId: String(o.documento_id ?? ''),
    numero: txt(o.numero),
    fecha: txt(o.fecha_contabilizacion) ?? txt(o.fecha),
    fechaDocumento: txt(o.fecha_documento),
    tabla: o.tabla === 'invoice_items' || o.tabla === 'sale_items' ? o.tabla : null,
    lineaId: txt(o.linea_id),
    base: num(o.base),
    iva: num(o.iva) ?? 0,
    asiento: num(o.asiento),
    entrePeriodos: o.entre_periodos === true,
    corrigeOtroPeriodo: o.corrige_otro_periodo === true,
    causadoPeriodoAnterior: o.causado_periodo_anterior === true,
    posteriorDeclaracion: o.posterior_declaracion === true,
    facturaOrigen: txt(fo.id) ? { id: String(fo.id), numero: txt(fo.numero) } : null,
    tarifaInferida: o.tarifa_inferida === true,
  };
}

const origenes = (v: unknown) => arr(v).map(leerOrigen).filter((o): o is Origen300 => o !== null);

function leerCorreccion(v: unknown): CorreccionError300 | null {
  if (!v || typeof v !== 'object') return null;
  const c = obj(v);
  return {
    completa: c.completa === true,
    resolucion: enLista(RESOLUCIONES_DOC_ELECTRONICO, c.resolucion),
    referencia: txt(c.referencia),
    fecha: txt(c.fecha),
    corrigeDeclaracionAnterior: typeof c.corrige_declaracion_anterior === 'boolean' ? c.corrige_declaracion_anterior : null,
    faltantes: arr(c.faltantes).map(String),
    decision: (() => {
      const d = c.decision ? obj(c.decision) : null;
      const tratamiento = d ? enLista(['retirar_venta', 'nota_credito', 'mantener_venta'] as const, d.tratamiento) : null;
      return tratamiento ? { tratamiento, periodoDesde: txt(d!.periodo_desde), periodoHasta: txt(d!.periodo_hasta) } : null;
    })(),
    ventaEnOtroPeriodo: c.venta_en_otro_periodo === true,
  };
}

/** jsonb de la RPC → formulario. Lo que no se entiende se descarta (la prueba lo vigila). */
export function leerFormulario300(data: unknown): Formulario300 {
  const d = obj(data);
  const periodo = obj(d.periodo);
  const res = obj(d.resumen);
  const con = obj(d.conciliacion);
  const al = obj(d.alertas);
  const pd = d.periodo_declarado ? obj(d.periodo_declarado) : null;

  const casillas = arr(d.casillas)
    .map(obj)
    .filter((c) => esCasilla(c.casilla) && (c.par === null || c.par === undefined || esCasilla(c.par)) && (c.tipo === 'base' || c.tipo === 'iva'))
    .map<Casilla300Valor>((c) => ({
      casilla: Number(c.casilla) as Casilla300,
      tipo: c.tipo as 'base' | 'iva',
      par: esCasilla(c.par) ? (Number(c.par) as Casilla300) : null,
      concepto: String(c.concepto ?? ''),
      lado: c.lado === 'descontable' ? 'descontable' : 'generado',
      valor: num(c.valor) ?? 0,
      valorFormulario: num(c.valor_formulario) ?? redondearMiles(num(c.valor) ?? 0),
      diferenciaRedondeo: num(c.diferencia_redondeo) ?? 0,
      totalOrigenes: num(c.total_origenes) ?? 0,
      senalada: c.senalada === true,
      origenes: origenes(c.origenes),
    }));

  const pendientes = arr(d.pendientes)
    .map(obj)
    .filter((p) => MOTIVOS_PENDIENTE.includes(p.motivo as MotivoPendiente))
    .map<Pendiente300>((p) => ({
      motivo: p.motivo as MotivoPendiente,
      lado: p.lado === 'descontable' ? 'descontable' : p.lado === 'otros' ? 'otros' : 'generado',
      base: num(p.base) ?? 0,
      iva: num(p.iva) ?? 0,
      efecto2408: num(p.efecto_2408) ?? 0,
      totalOrigenes: num(p.total_origenes) ?? 0,
      origenes: origenes(p.origenes),
    }));

  const NATURALEZAS_OTRO: readonly NaturalezaOtro[] = [...NATURALEZAS_MOVIMIENTO, 'reversa_contable', 'sin_registro'];
  const otrosMovimientos = arr(d.otros_movimientos)
    .map(obj)
    .filter((o) => num(o.asiento) !== null)
    .map<OtroMovimiento300>((o) => ({
      asiento: num(o.asiento) as number,
      origen: txt(o.origen),
      fecha: txt(o.fecha),
      valor: num(o.valor) ?? 0,
      naturaleza: enLista(NATURALEZAS_OTRO, o.naturaleza) ?? 'sin_registro',
      declarada: o.declarada === true,
      sugerida: o.sugerida === 'pago_dian' || o.sugerida === 'traslado_auxiliares' || o.sugerida === 'cierre' ? o.sugerida : null,
      destino: (['no_afecta', 'por_diligenciar', 'casilla', 'pendiente'].includes(String(o.destino)) ? o.destino : 'pendiente') as OtroMovimiento300['destino'],
      motivo: enLista(MOTIVOS_PENDIENTE, o.motivo),
      soporteTipo: enLista(SOPORTES_MOVIMIENTO, o.soporte_tipo),
      soporte: txt(o.soporte),
      soporteFecha: txt(o.soporte_fecha),
      revierteA: num(o.revierte_a),
      facturaCompra: txt(o.factura_compra),
      base: num(o.base),
      ivaRecuperable: num(o.iva_recuperable),
      posteriorDeclaracion: o.posterior_declaracion === true,
      correccion: leerCorreccion(o.correccion),
    }));

  const porDiligenciar = arr(d.por_diligenciar)
    .map(obj)
    .filter((p) => ['saldo_favor_anterior', 'retenciones_iva_sufridas', 'ajustes', 'sanciones'].includes(String(p.clave)))
    .map<PorDiligenciar300>((p) => ({
      clave: p.clave as PorDiligenciar300['clave'],
      valor: num(p.valor),
      asientos: arr(p.asientos).map(Number).filter((n) => Number.isInteger(n) && n > 0),
    }));

  return {
    desde: String(periodo.desde ?? ''),
    hasta: String(periodo.hasta ?? ''),
    estado: d.estado === 'conciliado' ? 'conciliado' : 'no_conciliado',
    aprobadoFiscalmente: false,
    liquidacionCompleta: false,
    periodoDeclarado:
      pd && txt(pd.desde)
        ? { desde: String(pd.desde), hasta: String(pd.hasta ?? ''), numeroFormulario: txt(pd.numero_formulario), presentadaEn: String(pd.presentada_en ?? '') }
        : null,
    casillas,
    pendientes,
    otrosMovimientos,
    porDiligenciar,
    resumen: {
      ivaGenerado: num(res.iva_generado) ?? 0,
      ivaGeneradoFormulario: num(res.iva_generado_formulario) ?? 0,
      ivaDescontable: num(res.iva_descontable) ?? 0,
      ivaDescontableFormulario: num(res.iva_descontable_formulario) ?? 0,
      diferenciaPreliminar: num(res.diferencia_preliminar) ?? 0,
      diferenciaPreliminarFormulario: num(res.diferencia_preliminar_formulario) ?? 0,
      pendientes: num(res.pendientes) ?? pendientes.reduce((s, p) => s + p.totalOrigenes, 0),
      pendientesIva: num(res.pendientes_iva) ?? 0,
      ivaNoDescontableAlCosto: num(res.iva_no_descontable_al_costo) ?? 0,
    },
    conciliacion: {
      libro2408: num(con.libro_2408) ?? 0,
      casillas: num(con.casillas) ?? 0,
      pendientes: num(con.pendientes) ?? 0,
      otros: num(con.otros_no_afectan_o_por_diligenciar) ?? 0,
      redondeoLineas: num(con.redondeo_lineas_libros) ?? 0,
      diferencia: num(con.diferencia) ?? 0,
    },
    alertas: {
      documentosEntrePeriodos: num(al.documentos_entre_periodos) ?? 0,
      notasDebitoOtroPeriodo: num(al.notas_debito_otro_periodo) ?? 0,
      comprasCausadasAntes: num(al.compras_causadas_antes) ?? 0,
      tarifasInferidas: {
        lineas: num(obj(al.tarifas_inferidas).lineas) ?? 0,
        base: num(obj(al.tarifas_inferidas).base) ?? 0,
        iva: num(obj(al.tarifas_inferidas).iva) ?? 0,
      },
      grabadosDespuesDeDeclarar: arr(al.grabados_despues_de_declarar)
        .map(obj)
        .filter((a) => num(a.asiento) !== null)
        .map((a) => {
          const p = obj(a.periodo_declarado);
          return {
            asiento: num(a.asiento) as number,
            origen: txt(a.origen),
            documentoId: txt(a.documento_id),
            fecha: txt(a.fecha),
            periodo: { desde: String(p.desde ?? ''), hasta: String(p.hasta ?? '') },
          };
        }),
      correccionesDeclaracionAnterior: arr(al.correcciones_declaracion_anterior)
        .map(obj)
        .filter((a) => num(a.asiento) !== null)
        .map((a) => {
          const p = a.periodo_declarado ? obj(a.periodo_declarado) : null;
          return {
            asiento: num(a.asiento) as number,
            ventaAsiento: num(a.venta_asiento),
            fechaVenta: txt(a.fecha_venta),
            completa: a.completa === true,
            corrigeDeclaracionAnterior: typeof a.corrige_declaracion_anterior === 'boolean' ? a.corrige_declaracion_anterior : null,
            periodoDeclarado: p && txt(p.desde) ? { desde: String(p.desde), hasta: String(p.hasta ?? ''), numeroFormulario: txt(p.numero_formulario) } : null,
          };
        }),
    },
  };
}

// ── Utilidades ──────────────────────────────────────────────────────────────

/** Como el formulario: a miles, la mitad hacia arriba (en valor absoluto). */
export function redondearMiles(valor: number): number {
  const r = Math.sign(valor) * Math.round(Math.abs(valor) / 1000) * 1000;
  return r === 0 ? 0 : r;
}

export function casilla(f: Formulario300, n: Casilla300): Casilla300Valor | undefined {
  return f.casillas.find((c) => c.casilla === n);
}

/** Pendientes de líneas/documentos y otros movimientos pendientes, para la sección «Pendientes de clasificar». */
export function totalPendientes(f: Formulario300): { grupos: number; origenes: number; iva: number } {
  const otros = f.otrosMovimientos.filter((o) => o.destino === 'pendiente');
  return {
    grupos: f.pendientes.length + (otros.length > 0 ? 1 : 0),
    origenes: f.pendientes.reduce((s, p) => s + p.totalOrigenes, 0) + otros.length,
    iva: f.resumen.pendientesIva,
  };
}

/**
 * Puente de «otros movimientos» de la conciliación, componente por componente
 * (lo que el Contador pidió explicar): cada asiento con su naturaleza, su destino
 * y su efecto en la 2408. Suma = conciliacion.otros + la parte pendiente.
 */
export function puenteOtrosMovimientos(f: Formulario300): { asiento: number; naturaleza: NaturalezaOtro; destino: OtroMovimiento300['destino']; valor: number }[] {
  return f.otrosMovimientos.map((o) => ({ asiento: o.asiento, naturaleza: o.naturaleza, destino: o.destino, valor: o.valor }));
}

/** Ruta de la pantalla del documento de origen (para el enlace de cada línea). */
export function rutaOrigen(o: Pick<Origen300, 'clase' | 'documentoId'>): string | null {
  if (!o.documentoId) return null;
  switch (o.clase) {
    case 'venta_pos':
      return `/app/pos/ventas/${o.documentoId}`;
    case 'factura_venta':
    case 'nota_credito':
    case 'nota_debito':
      return `/app/finanzas/facturas-venta/${o.documentoId}`;
    case 'factura_compra':
      return `/app/finanzas/facturas-compra/${o.documentoId}`;
    case 'documento_soporte':
      return `/app/finanzas/documentos-soporte/${o.documentoId}`;
    default:
      return null;
  }
}

export const TIPOS_DOCUMENTO_LINEAS = ['factura_venta', 'factura_compra', 'documento_soporte', 'venta_pos'] as const;
export type TipoDocumentoLineas = (typeof TIPOS_DOCUMENTO_LINEAS)[number];

/** Tipo de documento para `fn_iva_lineas_documento` a partir de la clase del origen. */
export function tipoDocumentoLineas(clase: ClaseOrigen): TipoDocumentoLineas | null {
  switch (clase) {
    case 'venta_pos':
      return 'venta_pos';
    case 'factura_venta':
    case 'nota_credito':
    case 'nota_debito':
      return 'factura_venta';
    case 'factura_compra':
      return 'factura_compra';
    case 'documento_soporte':
      return 'documento_soporte';
    default:
      return null;
  }
}

// ── Clasificación por línea ─────────────────────────────────────────────────

export interface ClasificacionLinea {
  tratamiento: TratamientoIva | null;
  tarifa: number | null;
  tipoOperacion: TipoOperacionIva | null;
  fundamento: string | null;
  /** Ronda 4: «inferida» = tarifa del POS deducida por coincidencia aritmética (no probada). */
  origen: 'sugerida' | 'inferida' | 'heredada' | 'manual' | null;
  soporteTipo: SoporteLinea | null;
  soporteNumero: string | null;
  soporteFecha: string | null;
}

export interface LineaFiscal {
  tabla: 'invoice_items' | 'sale_items';
  id: string;
  descripcion: string;
  cantidad: number;
  base: number;
  iva: number;
  taxCode: string | null;
  taxRate: number | null;
  compra: boolean;
  /** Línea de documento soporte (compra a un no responsable): no admite «descontable» por marca manual. */
  soporteDoc: boolean;
  clasificacion: ClasificacionLinea;
  descontable: { estado: EstadoDescontable; porcentaje: number | null; motivo: string | null } | null;
  sugerencia: { tratamiento: TratamientoIva | null; tarifa: number | null; tipoOperacion: TipoOperacionIva | null };
}

export function leerLineasFiscales(data: unknown): LineaFiscal[] {
  return arr(obj(data).lineas)
    .map(obj)
    .filter((l) => (l.tabla === 'invoice_items' || l.tabla === 'sale_items') && typeof l.id === 'string')
    .map<LineaFiscal>((l) => {
      const c = obj(l.clasificacion);
      const s = obj(l.sugerencia);
      const d = l.descontable ? obj(l.descontable) : null;
      return {
        tabla: l.tabla as LineaFiscal['tabla'],
        id: String(l.id),
        descripcion: String(l.descripcion ?? ''),
        cantidad: num(l.cantidad) ?? 0,
        base: num(l.base) ?? 0,
        iva: num(l.iva) ?? 0,
        taxCode: txt(l.tax_code),
        taxRate: num(l.tax_rate),
        compra: l.compra === true,
        soporteDoc: l.soporte_doc === true,
        clasificacion: {
          tratamiento: enLista(TRATAMIENTOS_IVA, c.tratamiento),
          tarifa: num(c.tarifa),
          tipoOperacion: enLista(TIPOS_OPERACION_IVA, c.tipo_operacion),
          fundamento: txt(c.fundamento),
          origen: enLista(['sugerida', 'inferida', 'heredada', 'manual'] as const, c.origen),
          soporteTipo: enLista(SOPORTES_LINEA, c.soporte_tipo),
          soporteNumero: txt(c.soporte_numero),
          soporteFecha: txt(c.soporte_fecha),
        },
        descontable: d ? { estado: enLista(ESTADOS_DESCONTABLE, d.estado) ?? 'por_evaluar', porcentaje: num(d.porcentaje), motivo: txt(d.motivo) } : null,
        sugerencia: { tratamiento: enLista(TRATAMIENTOS_IVA, s.tratamiento), tarifa: num(s.tarifa), tipoOperacion: enLista(TIPOS_OPERACION_IVA, s.tipo_operacion) },
      };
    });
}

export interface SolicitudClasificacion {
  tratamiento: TratamientoIva;
  tarifa: number;
  tipo_operacion: TipoOperacionIva | null;
  fundamento: string | null;
  soporte_tipo: SoporteLinea | null;
  soporte_numero: string | null;
  soporte_fecha: string | null;
  descontable?: EstadoDescontable;
  descontable_porcentaje?: number | null;
  descontable_motivo?: string | null;
}

export type ErrorClasificacion =
  | 'tratamiento_invalido'
  | 'tarifa_invalida'
  | 'tipo_operacion_invalido'
  | 'exportacion_debe_ser_exenta'
  | 'soporte_invalido'
  | 'texto_largo'
  | 'descontable_solo_compras'
  | 'descontable_invalido'
  | 'porcentaje_invalido'
  | 'motivo_requerido'
  | 'soporte_no_descontable';

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Valida el cuerpo que manda la pantalla (lista blanca). Las mismas reglas que
 * la RPC, que las vuelve a aplicar: aquí solo se evita un viaje inútil.
 */
export function validarClasificacion(
  cuerpo: unknown,
  opciones: { compra: boolean; soporteDoc?: boolean },
): { ok: true; datos: SolicitudClasificacion } | { ok: false; error: ErrorClasificacion } {
  const c = obj(cuerpo);
  const tratamiento = enLista(TRATAMIENTOS_IVA, c.tratamiento);
  if (!tratamiento) return { ok: false, error: 'tratamiento_invalido' };
  let tarifa = num(c.tarifa);
  if (tratamiento === 'gravada') {
    if (tarifa === null || tarifa <= 0 || tarifa > 100) return { ok: false, error: 'tarifa_invalida' };
  } else {
    if (tarifa !== null && tarifa !== 0) return { ok: false, error: 'tarifa_invalida' };
    tarifa = 0;
  }
  const tipo = c.tipo_operacion === null || c.tipo_operacion === undefined || c.tipo_operacion === '' ? null : enLista(TIPOS_OPERACION_IVA, c.tipo_operacion);
  if (tipo === null && c.tipo_operacion) return { ok: false, error: 'tipo_operacion_invalido' };
  if (tipo && TIPOS_EXPORTACION.includes(tipo) && tratamiento !== 'exenta') return { ok: false, error: 'exportacion_debe_ser_exenta' };
  const soporteTipo = c.soporte_tipo === null || c.soporte_tipo === undefined || c.soporte_tipo === '' ? null : enLista(SOPORTES_LINEA, c.soporte_tipo);
  if (soporteTipo === null && c.soporte_tipo) return { ok: false, error: 'soporte_invalido' };
  const soporteFecha = texto(c.soporte_fecha);
  if (soporteFecha !== null && !DIA.test(soporteFecha)) return { ok: false, error: 'soporte_invalido' };
  const fundamento = texto(c.fundamento);
  const soporteNumero = texto(c.soporte_numero);
  if ((fundamento?.length ?? 0) > 500 || (soporteNumero?.length ?? 0) > 80) return { ok: false, error: 'texto_largo' };
  const datos: SolicitudClasificacion = {
    tratamiento,
    tarifa,
    tipo_operacion: tipo,
    fundamento,
    soporte_tipo: soporteTipo,
    soporte_numero: soporteNumero,
    soporte_fecha: soporteFecha,
  };

  if (c.descontable !== undefined) {
    if (!opciones.compra) return { ok: false, error: 'descontable_solo_compras' };
    const estado = enLista(ESTADOS_DESCONTABLE, c.descontable);
    if (!estado) return { ok: false, error: 'descontable_invalido' };
    const pct = num(c.descontable_porcentaje);
    if (estado === 'proporcional' && (pct === null || pct <= 0 || pct >= 100)) return { ok: false, error: 'porcentaje_invalido' };
    const motivo = texto(c.descontable_motivo);
    if (estado !== 'por_evaluar' && !motivo) return { ok: false, error: 'motivo_requerido' };
    if ((motivo?.length ?? 0) > 500) return { ok: false, error: 'texto_largo' };
    // Corrección (c): compra a un no responsable no genera IVA descontable por marca manual.
    if (opciones.soporteDoc && (estado === 'descontable' || estado === 'proporcional') && (!(tipo === 'otra_especial' || tipo === 'importacion') || !fundamento)) {
      return { ok: false, error: 'soporte_no_descontable' };
    }
    datos.descontable = estado;
    datos.descontable_porcentaje = estado === 'proporcional' ? pct : null;
    datos.descontable_motivo = motivo;
  }
  return { ok: true, datos };
}

/** Clasificación de partida del diálogo: la guardada; si no hay, la sugerencia (la persona confirma). */
export function clasificacionInicial(l: LineaFiscal): ClasificacionLinea {
  if (l.clasificacion.tratamiento) return l.clasificacion;
  return {
    ...l.clasificacion,
    tratamiento: l.sugerencia.tratamiento,
    tarifa: l.sugerencia.tarifa,
    tipoOperacion: l.sugerencia.tipoOperacion ?? l.clasificacion.tipoOperacion,
    origen: null,
  };
}

/**
 * Filas del CSV (Excel) del borrador por casillas. Importes sin formato y, aparte,
 * el valor del formulario a miles y su diferencia.
 */
export function filasCsvFormulario300(
  f: Formulario300,
  textos: {
    encabezado: [string, string, string, string, string, string];
    concepto: (c: Casilla300Valor) => string;
    pendiente: (p: Pendiente300) => string;
    otro: (o: OtroMovimiento300) => string;
  },
): (string | number | null)[][] {
  const filas: (string | number | null)[][] = [textos.encabezado];
  for (const c of [...f.casillas].sort((a, b) => a.casilla - b.casilla)) {
    filas.push([c.casilla, textos.concepto(c), c.valor, c.valorFormulario, c.diferenciaRedondeo, c.totalOrigenes]);
  }
  for (const p of f.pendientes) filas.push([null, textos.pendiente(p), p.iva, null, null, p.totalOrigenes]);
  for (const o of f.otrosMovimientos) filas.push([null, textos.otro(o), o.valor, null, null, 1]);
  return filas;
}

// ── Naturaleza de un movimiento y período declarado ─────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const esUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

export interface SolicitudNaturaleza {
  naturaleza: NaturalezaMovimiento;
  soporte_tipo: SoporteMovimiento | null;
  soporte: string | null;
  soporte_fecha: string | null;
  invoice_purchase_id: string | null;
  support_document_id: string | null;
  base: number | null;
  iva: number | null;
  lineas: { invoice_item_id: string; base: number; iva: number }[] | null;
  nota: string | null;
  doc_electronico_resolucion: ResolucionDocElectronico | null;
  doc_electronico_referencia: string | null;
  doc_electronico_fecha: string | null;
  corrige_declaracion_anterior: boolean | null;
  /** Ronda 4: expediente de la corrección de error (los campos que no vengan quedan vacíos). */
  expediente_explicacion?: string | null;
  factura_referencia?: string | null;
  estado_electronico?: EstadoElectronico | null;
  contingencia_verificada?: boolean | null;
  contingencia_nota?: string | null;
  entrega_prestacion?: 'no_hubo' | 'hubo' | 'parcial' | null;
  entrega_soporte?: string | null;
  cobro?: 'no_hubo' | 'hubo_devuelto' | 'hubo_sin_devolver' | null;
  cobro_soporte?: string | null;
}

/** Ronda 4: estado del documento electrónico en el expediente. Rechazo comercial ≠ rechazo de validación de la DIAN. */
export const ESTADOS_ELECTRONICOS = ['validada_dian', 'rechazada_validacion_dian', 'rechazo_comercial_comprador', 'nunca_transmitida', 'expedida_contingencia'] as const;
export type EstadoElectronico = (typeof ESTADOS_ELECTRONICOS)[number];

export type ErrorNaturaleza =
  | 'asiento_invalido'
  | 'naturaleza_invalida'
  | 'soporte_invalido'
  | 'soporte_requerido'
  | 'devolucion_incompleta'
  | 'devolucion_lineas_no_suman'
  | 'resolucion_invalida'
  | 'cierre_requiere_explicacion'
  | 'expediente_invalido'
  | 'texto_largo';

/** Cuerpo de «naturaleza de un asiento». `naturaleza: null` = quitar el registro. */
export function validarNaturaleza(
  cuerpo: unknown,
): { ok: true; asiento: number; datos: SolicitudNaturaleza | null } | { ok: false; error: ErrorNaturaleza } {
  const c = obj(cuerpo);
  const asiento = num(c.asiento);
  if (asiento === null || !Number.isInteger(asiento) || asiento <= 0) return { ok: false, error: 'asiento_invalido' };
  if (c.naturaleza === null) return { ok: true, asiento, datos: null };
  const naturaleza = enLista(NATURALEZAS_MOVIMIENTO, c.naturaleza);
  if (!naturaleza) return { ok: false, error: 'naturaleza_invalida' };
  const soporteTipo = c.soporte_tipo === null || c.soporte_tipo === undefined || c.soporte_tipo === '' ? null : enLista(SOPORTES_MOVIMIENTO, c.soporte_tipo);
  if (soporteTipo === null && c.soporte_tipo) return { ok: false, error: 'soporte_invalido' };
  const soporte = texto(c.soporte);
  const soporteFecha = texto(c.soporte_fecha);
  if (soporteFecha !== null && !DIA.test(soporteFecha)) return { ok: false, error: 'soporte_invalido' };
  const nota = texto(c.nota);
  if ((soporte?.length ?? 0) > 500 || (nota?.length ?? 0) > 500) return { ok: false, error: 'texto_largo' };
  // Ronda 2: la naturaleza se registra con su soporte. Ronda 4: también el cierre (llamarlo «cierre» no basta), que
  // además explica en la nota por qué ese movimiento de la 2408 no es un ajuste fiscal.
  if (!soporte || !soporteFecha) return { ok: false, error: 'soporte_requerido' };
  if (naturaleza === 'cierre' && !nota) return { ok: false, error: 'cierre_requiere_explicacion' };

  const datos: SolicitudNaturaleza = {
    naturaleza,
    soporte_tipo: soporteTipo,
    soporte,
    soporte_fecha: soporteFecha,
    invoice_purchase_id: null,
    support_document_id: null,
    base: null,
    iva: null,
    lineas: null,
    nota,
    doc_electronico_resolucion: null,
    doc_electronico_referencia: null,
    doc_electronico_fecha: null,
    corrige_declaracion_anterior: null,
  };
  if (naturaleza === 'correccion_error') {
    // Ronda 3: el soporte que acredita el error lleva su tipo. Se puede guardar incompleta (constancia del avance);
    // la venta solo sale de las casillas cuando también constan la resolución del documento electrónico (con
    // referencia y fecha) y la marca de si corresponde corregir una declaración anterior.
    if (!soporteTipo) return { ok: false, error: 'soporte_requerido' };
    const resolucion = c.doc_electronico_resolucion === null || c.doc_electronico_resolucion === undefined || c.doc_electronico_resolucion === ''
      ? null
      : enLista(RESOLUCIONES_DOC_ELECTRONICO, c.doc_electronico_resolucion);
    if (resolucion === null && c.doc_electronico_resolucion) return { ok: false, error: 'resolucion_invalida' };
    const referencia = texto(c.doc_electronico_referencia);
    if ((referencia?.length ?? 0) > 120) return { ok: false, error: 'texto_largo' };
    const fechaRes = texto(c.doc_electronico_fecha);
    if (fechaRes !== null && !DIA.test(fechaRes)) return { ok: false, error: 'resolucion_invalida' };
    // Ronda 4: expediente (la base valida además sus contradicciones y qué falta; la decisión va aparte).
    const lista = <T extends string>(l: readonly T[], v: unknown): T | null | false =>
      v === null || v === undefined || v === '' ? null : (enLista(l, v) ?? false);
    const estadoElectronico = lista(ESTADOS_ELECTRONICOS, c.estado_electronico);
    const entrega = lista(['no_hubo', 'hubo', 'parcial'] as const, c.entrega_prestacion);
    const cobro = lista(['no_hubo', 'hubo_devuelto', 'hubo_sin_devolver'] as const, c.cobro);
    if (estadoElectronico === false || entrega === false || cobro === false) return { ok: false, error: 'expediente_invalido' };
    const textos = {
      expediente_explicacion: texto(c.expediente_explicacion),
      factura_referencia: texto(c.factura_referencia),
      contingencia_nota: texto(c.contingencia_nota),
      entrega_soporte: texto(c.entrega_soporte),
      cobro_soporte: texto(c.cobro_soporte),
    };
    if ((textos.expediente_explicacion?.length ?? 0) > 2000 || (textos.factura_referencia?.length ?? 0) > 120
        || [textos.contingencia_nota, textos.entrega_soporte, textos.cobro_soporte].some((x) => (x?.length ?? 0) > 500)) {
      return { ok: false, error: 'texto_largo' };
    }
    Object.assign(datos, {
      doc_electronico_resolucion: resolucion,
      doc_electronico_referencia: referencia,
      doc_electronico_fecha: fechaRes,
      corrige_declaracion_anterior: typeof c.corrige_declaracion_anterior === 'boolean' ? c.corrige_declaracion_anterior : null,
      ...textos,
      estado_electronico: estadoElectronico,
      contingencia_verificada: typeof c.contingencia_verificada === 'boolean' ? c.contingencia_verificada : null,
      entrega_prestacion: entrega,
      cobro,
    });
  }
  if (naturaleza === 'devolucion_compra') {
    // B4: vínculo con la compra Y sus líneas, base e IVA; la RPC además exige que el IVA cuadre con el asiento.
    const fc = esUuid(c.invoice_purchase_id) ? c.invoice_purchase_id : null;
    const ds = esUuid(c.support_document_id) ? c.support_document_id : null;
    const base = num(c.base);
    const iva = num(c.iva);
    const lineas = arr(c.lineas)
      .map(obj)
      .map((l) => ({ invoice_item_id: l.invoice_item_id, base: num(l.base), iva: num(l.iva) }))
      .filter((l): l is { invoice_item_id: string; base: number; iva: number } => esUuid(l.invoice_item_id) && l.base !== null && l.iva !== null && l.base >= 0 && l.iva >= 0);
    if ((fc ? 1 : 0) + (ds ? 1 : 0) !== 1 || base === null || base < 0 || iva === null || iva < 0 || lineas.length === 0 || !soporteTipo) {
      return { ok: false, error: 'devolucion_incompleta' };
    }
    const sumaBase = lineas.reduce((s, l) => s + l.base, 0);
    const sumaIva = lineas.reduce((s, l) => s + l.iva, 0);
    if (Math.abs(sumaBase - base) > 1 || Math.abs(sumaIva - iva) > 1) return { ok: false, error: 'devolucion_lineas_no_suman' };
    Object.assign(datos, { invoice_purchase_id: fc, support_document_id: ds, base, iva, lineas });
  }
  return { ok: true, asiento, datos };
}

/** Cuerpo de «registrar período declarado». `presentada_en: null` = quitar el registro. */
export function validarDeclaracion(
  cuerpo: unknown,
):
  | { ok: true; desde: string; hasta: string; datos: { numero_formulario: string | null; presentada_en: string; nota: string | null } | null }
  | { ok: false; error: 'periodo_invalido' | 'fecha_presentacion_invalida' | 'texto_largo' } {
  const c = obj(cuerpo);
  const desde = typeof c.desde === 'string' ? c.desde : '';
  const hasta = typeof c.hasta === 'string' ? c.hasta : '';
  if (!DIA.test(desde) || !DIA.test(hasta) || hasta < desde) return { ok: false, error: 'periodo_invalido' };
  if (c.presentada_en === null) return { ok: true, desde, hasta, datos: null };
  const presentada = typeof c.presentada_en === 'string' ? c.presentada_en : '';
  if (!DIA.test(presentada) || presentada < hasta) return { ok: false, error: 'fecha_presentacion_invalida' };
  const numero = texto(c.numero_formulario);
  const nota = texto(c.nota);
  if ((numero?.length ?? 0) > 40 || (nota?.length ?? 0) > 500) return { ok: false, error: 'texto_largo' };
  return { ok: true, desde, hasta, datos: { numero_formulario: numero, presentada_en: presentada, nota } };
}
