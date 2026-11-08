/**
 * Borrador del formulario 300 por casillas (versión 2) y clasificación de IVA
 * por línea. Lee el jsonb de `fn_tributario_borrador_iva_300` (migración
 * 20261108151000) y valida lo que la pantalla manda a `fn_iva_clasificar_linea`
 * (20261108150000). Sin React ni Supabase.
 *
 * Reglas del Contador (2026-11-07, P2/P3/P4/P9): cada casilla sale de líneas
 * clasificadas o de asientos con naturaleza; lo que no se puede ubicar va a
 * «pendientes» con su valor, nunca se omite. «Conciliado» ≠ «aprobado
 * fiscalmente» (el sistema nunca lo aprueba). Valores del formulario a miles.
 */

// ── Catálogos ───────────────────────────────────────────────────────────────

export const TRATAMIENTOS_IVA = ['gravada', 'exenta', 'excluida', 'no_sujeta'] as const;
export type TratamientoIva = (typeof TRATAMIENTOS_IVA)[number];

export const TIPOS_OPERACION_IVA = ['bienes', 'servicios', 'importacion', 'aiu', 'licores', 'retiro_inventario', 'otra_especial'] as const;
export type TipoOperacionIva = (typeof TIPOS_OPERACION_IVA)[number];

export const ESTADOS_DESCONTABLE = ['por_evaluar', 'descontable', 'no_descontable', 'proporcional'] as const;
export type EstadoDescontable = (typeof ESTADOS_DESCONTABLE)[number];

export const NATURALEZAS_MOVIMIENTO = ['pago_dian', 'traslado_auxiliares', 'cierre', 'devolucion_compra', 'ajuste_procedente', 'importacion', 'otro'] as const;
export type NaturalezaMovimiento = (typeof NATURALEZAS_MOVIMIENTO)[number];

/** Casillas que el Contador fijó (formulario e instructivo 2026, operaciones ordinarias). */
export const CASILLAS_300 = [27, 28, 42, 50, 51, 52, 53, 56, 58, 59, 66, 71, 72, 74, 75, 79] as const;
export type Casilla300 = (typeof CASILLAS_300)[number];

/** Pares base → IVA, en el orden del formulario. */
export const PARES_300: readonly { base: Casilla300; iva: Casilla300; concepto: string }[] = [
  { base: 27, iva: 58, concepto: 'ventas_5' },
  { base: 28, iva: 59, concepto: 'ventas_general' },
  { base: 56, iva: 66, concepto: 'devoluciones_compras' },
  { base: 50, iva: 71, concepto: 'compras_bienes_5' },
  { base: 51, iva: 72, concepto: 'compras_bienes_general' },
  { base: 52, iva: 74, concepto: 'compras_servicios_5' },
  { base: 53, iva: 75, concepto: 'compras_servicios_general' },
  { base: 42, iva: 79, concepto: 'devoluciones_ventas' },
];

export const CASILLAS_GENERADO: readonly Casilla300[] = [58, 59, 66];
export const CASILLAS_DESCONTABLE: readonly Casilla300[] = [71, 72, 74, 75, 79];

export const MOTIVOS_PENDIENTE = [
  'sin_clasificar',
  'tarifa_inconsistente',
  'sin_tipo_operacion',
  'operacion_especial',
  'tarifa_no_prevista',
  'exenta_sin_soporte',
  'casilla_por_confirmar',
  'descontable_por_evaluar',
  'no_descontable_en_2408',
  'descontable_en_otro_periodo',
  'sin_lineas',
  'no_cuadra',
  'documento_de_otro_periodo',
  'reversa_contable',
  'devolucion_compra_sin_descuento',
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
  fecha: string | null;
  tabla: 'invoice_items' | 'sale_items' | null;
  lineaId: string | null;
  base: number | null;
  iva: number;
  asiento: number | null;
  entrePeriodos: boolean;
  deOtroPeriodo: boolean;
  posteriorDeclaracion: boolean;
  facturaOrigen: { id: string; numero: string | null } | null;
}

export interface Casilla300Valor {
  casilla: Casilla300;
  tipo: 'base' | 'iva';
  par: Casilla300;
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

export interface OtroMovimiento300 {
  asiento: number;
  origen: string | null;
  fecha: string | null;
  valor: number;
  naturaleza: NaturalezaMovimiento | 'reversa_contable' | 'sin_soporte';
  declarada: boolean;
  destino: 'no_afecta' | 'por_diligenciar' | 'casilla' | 'pendiente';
  motivo: MotivoPendiente | null;
  soporte: string | null;
  revierteA: number | null;
  facturaCompra: string | null;
  base: number | null;
  posteriorDeclaracion: boolean;
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
  };
  conciliacion: { libro2408: number; casillas: number; pendientes: number; otros: number; redondeoLineas: number; diferencia: number };
  alertas: {
    documentosEntrePeriodos: number;
    descontableDeOtrosPeriodos: number;
    grabadosDespuesDeDeclarar: { asiento: number; origen: string | null; documentoId: string | null; fecha: string | null; periodo: { desde: string; hasta: string } }[];
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
    fecha: txt(o.fecha),
    tabla: o.tabla === 'invoice_items' || o.tabla === 'sale_items' ? o.tabla : null,
    lineaId: txt(o.linea_id),
    base: num(o.base),
    iva: num(o.iva) ?? 0,
    asiento: num(o.asiento),
    entrePeriodos: o.entre_periodos === true,
    deOtroPeriodo: o.de_otro_periodo === true,
    posteriorDeclaracion: o.posterior_declaracion === true,
    facturaOrigen: txt(fo.id) ? { id: String(fo.id), numero: txt(fo.numero) } : null,
  };
}

const origenes = (v: unknown) => arr(v).map(leerOrigen).filter((o): o is Origen300 => o !== null);

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
    .filter((c) => esCasilla(c.casilla) && esCasilla(c.par) && (c.tipo === 'base' || c.tipo === 'iva'))
    .map<Casilla300Valor>((c) => ({
      casilla: Number(c.casilla) as Casilla300,
      tipo: c.tipo as 'base' | 'iva',
      par: Number(c.par) as Casilla300,
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

  const otrosMovimientos = arr(d.otros_movimientos)
    .map(obj)
    .filter((o) => num(o.asiento) !== null)
    .map<OtroMovimiento300>((o) => ({
      asiento: num(o.asiento) as number,
      origen: txt(o.origen),
      fecha: txt(o.fecha),
      valor: num(o.valor) ?? 0,
      naturaleza: String(o.naturaleza ?? 'sin_soporte') as OtroMovimiento300['naturaleza'],
      declarada: o.declarada === true,
      destino: (['no_afecta', 'por_diligenciar', 'casilla', 'pendiente'].includes(String(o.destino)) ? o.destino : 'pendiente') as OtroMovimiento300['destino'],
      motivo: MOTIVOS_PENDIENTE.includes(o.motivo as MotivoPendiente) ? (o.motivo as MotivoPendiente) : null,
      soporte: txt(o.soporte),
      revierteA: num(o.revierte_a),
      facturaCompra: txt(o.factura_compra),
      base: num(o.base),
      posteriorDeclaracion: o.posterior_declaracion === true,
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
    periodoDeclarado: pd && txt(pd.desde)
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
      descontableDeOtrosPeriodos: num(al.descontable_de_otros_periodos) ?? 0,
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

/** Pendientes de líneas/documentos y otros movimientos pendientes, en una sola lista para la sección «Pendientes de clasificar». */
export function totalPendientes(f: Formulario300): { grupos: number; origenes: number; iva: number } {
  const otros = f.otrosMovimientos.filter((o) => o.destino === 'pendiente');
  return {
    grupos: f.pendientes.length + (otros.length > 0 ? 1 : 0),
    origenes: f.pendientes.reduce((s, p) => s + p.totalOrigenes, 0) + otros.length,
    iva: f.resumen.pendientesIva,
  };
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

export const TIPOS_DOCUMENTO_LINEAS = ['factura_venta', 'factura_compra', 'documento_soporte', 'venta_pos'] as const;
export type TipoDocumentoLineas = (typeof TIPOS_DOCUMENTO_LINEAS)[number];

export interface ClasificacionLinea {
  tratamiento: TratamientoIva | null;
  tarifa: number | null;
  tipoOperacion: TipoOperacionIva | null;
  fundamento: string | null;
  origen: 'sugerida' | 'heredada' | 'manual' | null;
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
  clasificacion: ClasificacionLinea;
  descontable: { estado: EstadoDescontable; porcentaje: number | null; motivo: string | null; periodo: string | null } | null;
  sugerencia: { tratamiento: TratamientoIva | null; tarifa: number | null; tipoOperacion: TipoOperacionIva | null };
}

const enLista = <T extends string>(lista: readonly T[], v: unknown): T | null => (lista.includes(v as T) ? (v as T) : null);

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
        clasificacion: {
          tratamiento: enLista(TRATAMIENTOS_IVA, c.tratamiento),
          tarifa: num(c.tarifa),
          tipoOperacion: enLista(TIPOS_OPERACION_IVA, c.tipo_operacion),
          fundamento: txt(c.fundamento),
          origen: enLista(['sugerida', 'heredada', 'manual'] as const, c.origen),
        },
        descontable: d
          ? { estado: enLista(ESTADOS_DESCONTABLE, d.estado) ?? 'por_evaluar', porcentaje: num(d.porcentaje), motivo: txt(d.motivo), periodo: txt(d.periodo) }
          : null,
        sugerencia: { tratamiento: enLista(TRATAMIENTOS_IVA, s.tratamiento), tarifa: num(s.tarifa), tipoOperacion: enLista(TIPOS_OPERACION_IVA, s.tipo_operacion) },
      };
    });
}

export interface SolicitudClasificacion {
  tratamiento: TratamientoIva;
  tarifa: number;
  tipo_operacion: TipoOperacionIva | null;
  fundamento: string | null;
  descontable?: EstadoDescontable;
  descontable_porcentaje?: number | null;
  descontable_motivo?: string | null;
  descontable_periodo?: string | null;
}

export type ErrorClasificacion =
  | 'tratamiento_invalido'
  | 'tarifa_invalida'
  | 'tipo_operacion_invalido'
  | 'texto_largo'
  | 'descontable_solo_compras'
  | 'descontable_invalido'
  | 'porcentaje_invalido'
  | 'motivo_requerido'
  | 'periodo_invalido';

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida el cuerpo que manda la pantalla (lista blanca). Las mismas reglas que
 * la RPC, que las vuelve a aplicar: aquí solo se evita un viaje inútil.
 */
export function validarClasificacion(
  cuerpo: unknown,
  opciones: { compra: boolean },
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
  const fundamento = typeof c.fundamento === 'string' && c.fundamento.trim() ? c.fundamento.trim() : null;
  if ((fundamento?.length ?? 0) > 500) return { ok: false, error: 'texto_largo' };
  const datos: SolicitudClasificacion = { tratamiento, tarifa, tipo_operacion: tipo, fundamento };

  if (c.descontable !== undefined) {
    if (!opciones.compra) return { ok: false, error: 'descontable_solo_compras' };
    const estado = enLista(ESTADOS_DESCONTABLE, c.descontable);
    if (!estado) return { ok: false, error: 'descontable_invalido' };
    const pct = num(c.descontable_porcentaje);
    if (estado === 'proporcional' && (pct === null || pct <= 0 || pct >= 100)) return { ok: false, error: 'porcentaje_invalido' };
    const motivo = typeof c.descontable_motivo === 'string' && c.descontable_motivo.trim() ? c.descontable_motivo.trim() : null;
    if (estado !== 'por_evaluar' && !motivo) return { ok: false, error: 'motivo_requerido' };
    if ((motivo?.length ?? 0) > 500) return { ok: false, error: 'texto_largo' };
    const periodo = typeof c.descontable_periodo === 'string' && c.descontable_periodo ? c.descontable_periodo : null;
    if (periodo !== null && !DIA.test(periodo)) return { ok: false, error: 'periodo_invalido' };
    datos.descontable = estado;
    datos.descontable_porcentaje = estado === 'proporcional' ? pct : null;
    datos.descontable_motivo = motivo;
    datos.descontable_periodo = estado === 'por_evaluar' ? null : periodo;
  }
  return { ok: true, datos };
}

/** Clasificación de partida del diálogo: la guardada; si no hay, la sugerencia (la persona confirma). */
export function clasificacionInicial(l: LineaFiscal): ClasificacionLinea {
  if (l.clasificacion.tratamiento) return l.clasificacion;
  return {
    tratamiento: l.sugerencia.tratamiento,
    tarifa: l.sugerencia.tarifa,
    tipoOperacion: l.sugerencia.tipoOperacion ?? l.clasificacion.tipoOperacion,
    fundamento: l.clasificacion.fundamento,
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

/** Cuerpo de «naturaleza de un asiento». `naturaleza: null` = quitar el registro. */
export function validarNaturaleza(
  cuerpo: unknown,
):
  | { ok: true; asiento: number; datos: { naturaleza: NaturalezaMovimiento; invoice_purchase_id: string | null; base: number | null; soporte: string | null; nota: string | null } | null }
  | { ok: false; error: 'asiento_invalido' | 'naturaleza_invalida' | 'devolucion_sin_factura' | 'soporte_requerido' | 'texto_largo' } {
  const c = obj(cuerpo);
  const asiento = num(c.asiento);
  if (asiento === null || !Number.isInteger(asiento) || asiento <= 0) return { ok: false, error: 'asiento_invalido' };
  if (c.naturaleza === null) return { ok: true, asiento, datos: null };
  const naturaleza = enLista(NATURALEZAS_MOVIMIENTO, c.naturaleza);
  if (!naturaleza) return { ok: false, error: 'naturaleza_invalida' };
  const soporte = typeof c.soporte === 'string' && c.soporte.trim() ? c.soporte.trim() : null;
  const nota = typeof c.nota === 'string' && c.nota.trim() ? c.nota.trim() : null;
  if ((soporte?.length ?? 0) > 500 || (nota?.length ?? 0) > 500) return { ok: false, error: 'texto_largo' };
  let factura: string | null = null;
  let base: number | null = null;
  if (naturaleza === 'devolucion_compra') {
    base = num(c.base);
    if (!esUuid(c.invoice_purchase_id) || base === null || base < 0) return { ok: false, error: 'devolucion_sin_factura' };
    factura = c.invoice_purchase_id;
  }
  if (naturaleza === 'ajuste_procedente' && !soporte) return { ok: false, error: 'soporte_requerido' };
  return { ok: true, asiento, datos: { naturaleza, invoice_purchase_id: factura, base, soporte, nota } };
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
  const numero = typeof c.numero_formulario === 'string' && c.numero_formulario.trim() ? c.numero_formulario.trim() : null;
  const nota = typeof c.nota === 'string' && c.nota.trim() ? c.nota.trim() : null;
  if ((numero?.length ?? 0) > 40 || (nota?.length ?? 0) > 500) return { ok: false, error: 'texto_largo' };
  return { ok: true, desde, hasta, datos: { numero_formulario: numero, presentada_en: presentada, nota } };
}
