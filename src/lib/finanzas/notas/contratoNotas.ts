/**
 * Notas crédito y débito de venta — contrato y lógica de presentación (hoja:
 * sin servidor ni React). Lo importan las rutas (`/api/notas`,
 * `/api/notas-credito/[id]`, `/api/notas-debito/[id]`,
 * `/api/facturas-venta/[id]/nota-debito`), el servicio de servidor, la pantalla
 * y las pruebas.
 *
 * Diseño: docs/design/FINANZAS-DOCUMENTOS-V2.md §4 y §5 (Figma `1021:91497`
 * listado, `1021:92512` detalle NC, `1021:93831` diálogo ND, `1021:93962`
 * detalle ND). Las notas son filas de `invoice_sales` con
 * `document_type = 'credit_note' | 'debit_note'` y `related_invoice_id`.
 */
import { z } from 'zod';

// ─── Tipos de nota ──────────────────────────────────────────────────────────

export const TIPOS_NOTA = ['credito', 'debito'] as const;
export type TipoNota = (typeof TIPOS_NOTA)[number];

export function esTipoNota(v: unknown): v is TipoNota {
  return typeof v === 'string' && (TIPOS_NOTA as readonly string[]).includes(v);
}

export function documentTypeDeNota(tipo: TipoNota): 'credit_note' | 'debit_note' {
  return tipo === 'debito' ? 'debit_note' : 'credit_note';
}

export function tipoNotaDeDocumento(documentType: string | null | undefined): TipoNota | null {
  if (documentType === 'credit_note') return 'credito';
  if (documentType === 'debit_note') return 'debito';
  return null;
}

/** Ruta del detalle de una nota según su tipo. */
export function rutaDetalleNota(tipo: TipoNota, id: string): string {
  return tipo === 'debito' ? `/app/finanzas/notas-debito/${id}` : `/app/finanzas/notas-credito/${id}`;
}

export const RUTA_NOTAS = '/app/finanzas/notas-credito';

// ─── Estado ante la DIAN (derivado, §4.4.6) ─────────────────────────────────

export const ESTADOS_DIAN_NOTA = [
  'no_aplica',
  'espera_factura',
  'sin_enviar',
  'retenido',
  'en_cola',
  'en_envio',
  'aceptada',
  'rechazada',
  'error',
] as const;
export type EstadoDianNota = (typeof ESTADOS_DIAN_NOTA)[number];

/**
 * Estado DIAN de una nota, en lenguaje del usuario. La nota solo existe ante la
 * DIAN si su factura fue aceptada: sin factura electrónica → «No aplica»; con la
 * factura en camino → «Espera la factura»; con la factura aceptada y la nota sin
 * envío → «Sin enviar». Si la nota ya tiene envío, manda su propio estado.
 */
export function estadoDianNota(p: {
  notaFe: string | null | undefined;
  facturaFe: string | null | undefined;
  retenida?: boolean;
}): EstadoDianNota {
  const nota = p.notaFe ?? null;
  switch (nota) {
    case 'accepted':
      return 'aceptada';
    case 'rejected':
      return 'rechazada';
    case 'failed':
      return 'error';
    case 'pending':
      return p.retenida ? 'retenido' : 'en_cola';
    case 'processing':
    case 'sent':
      return 'en_envio';
    default:
      break;
  }
  const factura = p.facturaFe ?? null;
  if (factura === 'accepted') return 'sin_enviar';
  if (factura && factura !== 'cancelled') return 'espera_factura';
  return 'no_aplica';
}

/** Tono de `StatusBadge` para el estado DIAN derivado (clave de `kit/estadoTono`). */
export function estadoBadgeDian(e: EstadoDianNota): string {
  switch (e) {
    case 'aceptada':
      return 'accepted';
    case 'rechazada':
    case 'error':
      return 'rejected';
    case 'espera_factura':
    case 'retenido':
    case 'sin_enviar':
      return 'pending';
    case 'en_cola':
    case 'en_envio':
      return 'queued';
    default:
      return 'no aplica';
  }
}

/** ¿Se puede (re)enviar la nota crédito a la DIAN desde su detalle? (`/api/factus/credit-note`). */
export function puedeEnviarDian(e: EstadoDianNota, anulada: boolean): boolean {
  return !anulada && (e === 'sin_enviar' || e === 'rechazada' || e === 'error');
}

// ─── Concepto y motivo (guardados en la descripción) ────────────────────────

/** Conceptos DIAN de la nota crédito (1 devolución parcial … 5 otros). */
export const CONCEPTOS_NOTA_CREDITO = ['1', '2', '3', '4', '5'] as const;
/** Conceptos DIAN de la nota débito (1 intereses, 2 gastos por cobrar, 3 cambio del valor, 4 otros). */
export const CONCEPTOS_NOTA_DEBITO = ['1', '2', '3', '4'] as const;
export type ConceptoNotaDebito = (typeof CONCEPTOS_NOTA_DEBITO)[number];

/**
 * Motivo escrito al emitir: `fn_nota_credito_emitir` y `fn_nota_debito_emitir`
 * lo dejan al final de la descripción («… Motivo: <texto>»).
 */
export function motivoDeDescripcion(descripcion: string | null | undefined): string | null {
  const m = /Motivo:\s*([\s\S]+)$/.exec(descripcion ?? '');
  const texto = m?.[1]?.trim();
  return texto ? texto : null;
}

/** Concepto DIAN guardado por `fn_nota_debito_emitir` («Concepto DIAN: 2.»). */
export function conceptoDeDescripcion(descripcion: string | null | undefined): string | null {
  const m = /Concepto DIAN:\s*([1-5])\b/.exec(descripcion ?? '');
  return m ? m[1] : null;
}

/**
 * Concepto de una nota crédito cuando no quedó guardado: el que pidió el envío
 * (opciones del job) o el que la cola deduce (misma regla que
 * `conceptoNotaCredito` de `payloadsFactus.ts`).
 */
export function conceptoNotaCreditoDerivado(p: {
  concepto?: string | null;
  totalNota: number;
  totalFactura: number;
  conProductos: boolean;
}): string {
  if (p.concepto && (CONCEPTOS_NOTA_CREDITO as readonly string[]).includes(p.concepto)) return p.concepto;
  const r = (n: number) => Math.round(Math.abs(n) * 100) / 100;
  if (p.totalFactura > 0 && r(p.totalNota) >= r(p.totalFactura)) return '2';
  return p.conProductos ? '1' : '3';
}

// ─── Listado ────────────────────────────────────────────────────────────────

export const FILTROS_NOTAS = ['tipo', 'estado', 'dian', 'cliente', 'desde', 'hasta', 'periodo'] as const;
export const CAMPOS_ORDEN_NOTAS = ['fecha', 'numero', 'valor'] as const;
export type CampoOrdenNotas = (typeof CAMPOS_ORDEN_NOTAS)[number];
export const TAMANOS_PAGINA_NOTAS = [10, 25, 50, 100] as const;
export const ESTADOS_FILTRO_NOTA = ['emitida', 'anulada'] as const;
/** Tope de filas que el servidor lee para filtrar, ordenar y contar (volumen bajo: 28 notas en total el 2026-09-28). */
export const TOPE_LECTURA_NOTAS = 5000;

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const consultaNotasSchema = z.object({
  tipo: z.enum(TIPOS_NOTA).default('credito'),
  q: z.string().trim().max(120).optional(),
  estado: z.enum(ESTADOS_FILTRO_NOTA).optional(),
  dian: z.enum(ESTADOS_DIAN_NOTA).optional(),
  cliente: z.string().uuid().optional(),
  desde: fecha.optional(),
  hasta: fecha.optional(),
  /** Periodo de los KPI (por defecto el del listado). */
  kpi_desde: fecha.optional(),
  kpi_hasta: fecha.optional(),
  sucursal: z.coerce.number().int().positive().optional(),
  orden: z.enum(CAMPOS_ORDEN_NOTAS).default('fecha'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  pagina: z.coerce.number().int().min(1).max(10000).default(1),
  tamano: z.coerce.number().int().min(1).max(200).default(25),
});
export type ConsultaNotas = z.infer<typeof consultaNotasSchema>;

/** Query de la URL → consulta validada (claves desconocidas o vacías fuera). */
export function leerConsultaNotas(params: URLSearchParams): ConsultaNotas | null {
  const crudo: Record<string, string> = {};
  for (const k of Object.keys(consultaNotasSchema.shape)) {
    const v = params.get(k);
    if (v !== null && v.trim() !== '') crudo[k] = v.trim();
  }
  const r = consultaNotasSchema.safeParse(crudo);
  return r.success ? r.data : null;
}

/** Fila del listado, ya enriquecida en el servidor. Valores siempre positivos. */
export interface FilaNota {
  id: string;
  tipo: TipoNota;
  numero: string | null;
  fecha: string | null;
  estado: string;
  anulada: boolean;
  valor: number;
  saldo: number;
  moneda: string | null;
  branchId: number | null;
  cliente: string | null;
  clienteDoc: string | null;
  clienteId: string | null;
  factura: { id: string; numero: string | null } | null;
  concepto: string | null;
  motivo: string | null;
  dian: EstadoDianNota;
  /** Excedente de la nota crédito que quedó como saldo a favor. */
  excedente: number;
  conProductos: boolean;
}

export interface KpisNotas {
  /** Valor de las notas vivas del periodo. */
  valor: number;
  notas: number;
  /** Notas crédito: excedente a saldo a favor y cuántas lo dejaron. */
  excedente: number;
  notasConExcedente: number;
  anuladas: number;
  /** Notas de facturas aceptadas que aún no salen a la DIAN. */
  sinEnviar: number;
  /** Notas débito: lo que falta cobrar. */
  porCobrar: number;
}

export interface RespuestaListadoNotas {
  total: number;
  filas: FilaNota[];
  kpis: KpisNotas;
  conteo: Record<TipoNota, number>;
  moneda: string | null;
  /** Se leyeron más filas que el tope: los KPI y el total pueden quedarse cortos. */
  truncado: boolean;
}

/** Texto en minúsculas sin tildes, para buscar. */
export function normalizar(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function coincideBusqueda(f: Pick<FilaNota, 'numero' | 'cliente' | 'clienteDoc' | 'factura' | 'motivo'>, q: string | undefined): boolean {
  const n = normalizar(q);
  if (!n) return true;
  return [f.numero, f.cliente, f.clienteDoc, f.factura?.numero, f.motivo].some((v) => normalizar(v).includes(n));
}

/** Filtros que no resuelve la consulta a la base (búsqueda, estado y DIAN). */
export function filtrarNotas(filas: readonly FilaNota[], c: Pick<ConsultaNotas, 'q' | 'estado' | 'dian'>): FilaNota[] {
  return filas.filter(
    (f) =>
      coincideBusqueda(f, c.q) &&
      (!c.estado || (c.estado === 'anulada' ? f.anulada : !f.anulada)) &&
      (!c.dian || f.dian === c.dian),
  );
}

export function ordenarNotas(filas: readonly FilaNota[], campo: CampoOrdenNotas, dir: 'asc' | 'desc'): FilaNota[] {
  const signo = dir === 'asc' ? 1 : -1;
  const clave = (f: FilaNota): string | number => {
    if (campo === 'valor') return f.valor;
    if (campo === 'numero') return f.numero ?? '';
    return f.fecha ?? '';
  };
  return [...filas].sort((a, b) => {
    const x = clave(a);
    const y = clave(b);
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es', { numeric: true });
    return c !== 0 ? c * signo : (b.fecha ?? '').localeCompare(a.fecha ?? '');
  });
}

export function paginar<T>(filas: readonly T[], pagina: number, tamano: number): T[] {
  const desde = (Math.max(1, pagina) - 1) * tamano;
  return filas.slice(desde, desde + tamano);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** KPI del periodo (sin búsqueda ni filtros de estado: miran todo el periodo). */
export function kpisNotas(filas: readonly FilaNota[]): KpisNotas {
  const vivas = filas.filter((f) => !f.anulada);
  return {
    valor: r2(vivas.reduce((s, f) => s + f.valor, 0)),
    notas: vivas.length,
    excedente: r2(vivas.reduce((s, f) => s + f.excedente, 0)),
    notasConExcedente: vivas.filter((f) => f.excedente > 0).length,
    anuladas: filas.length - vivas.length,
    sinEnviar: vivas.filter((f) => f.dian === 'sin_enviar' || f.dian === 'error' || f.dian === 'rechazada').length,
    porCobrar: r2(vivas.reduce((s, f) => s + f.saldo, 0)),
  };
}

// ─── Detalle ────────────────────────────────────────────────────────────────

export interface FacturaOrigenNota {
  id: string;
  numero: string | null;
  emision: string | null;
  vencimiento: string | null;
  total: number;
  saldo: number;
  estado: string;
  fe: string | null;
  feNumero: string | null;
}

export interface DetalleNotaExtra {
  tipo: TipoNota;
  factura: FacturaOrigenNota | null;
  dian: EstadoDianNota;
  concepto: string | null;
  motivo: string | null;
  /** Saldo a favor que dejó la nota crédito (excedente sobre lo pagado). */
  saldoAFavor: { id: string; monto: number; saldo: number; estado: string } | null;
  /** Devolución de dinero del excedente (payments.source = 'credit_note'). */
  devolucion: { id: string; monto: number; estado: string } | null;
  productosReingresados: number;
  retenida: string | null;
}

// ─── Anular ─────────────────────────────────────────────────────────────────

export type MotivoNoAnulableNota = 'ya_anulada' | 'aceptada_dian' | 'en_envio_dian' | 'con_pagos' | 'sin_permiso';

/**
 * ¿Se puede anular la nota desde la pantalla? La base vuelve a comprobarlo
 * (`fn_nota_credito_anular` / `fn_nota_debito_anular`); esto solo decide si el
 * diálogo se abre con el bloqueo y su salida.
 */
export function anulabilidadNota(p: {
  tipo: TipoNota;
  anulada: boolean;
  dian: EstadoDianNota;
  pagado?: number;
  permisoAnular: boolean;
}): { ok: true } | { ok: false; motivo: MotivoNoAnulableNota } {
  if (p.anulada) return { ok: false, motivo: 'ya_anulada' };
  if (!p.permisoAnular) return { ok: false, motivo: 'sin_permiso' };
  if (p.dian === 'aceptada') return { ok: false, motivo: 'aceptada_dian' };
  if (p.dian === 'en_envio') return { ok: false, motivo: 'en_envio_dian' };
  if (p.tipo === 'debito' && (p.pagado ?? 0) > 0) return { ok: false, motivo: 'con_pagos' };
  return { ok: true };
}

/** Consecuencias de anular, como claves de texto (`finanzasDocumentosR3.notas.anular.consecuencias.*`). */
export function consecuenciasAnular(p: {
  tipo: TipoNota;
  saldoAFavor: boolean;
  devolucion: boolean;
  productosReingresados: number;
}): string[] {
  if (p.tipo === 'debito') return ['cartera_nd', 'asiento'];
  const c = ['factura_vuelve', 'asiento'];
  if (p.productosReingresados > 0) c.push('inventario');
  if (p.saldoAFavor) c.push('saldo_a_favor');
  if (p.devolucion) c.push('devolucion');
  return c;
}

// ─── Nota débito ────────────────────────────────────────────────────────────

export const lineaNotaDebitoSchema = z
  .object({
    descripcion: z.string().trim().min(1).max(200),
    cantidad: z.number().positive().max(1e9),
    valorUnitario: z.number().positive().max(1e12),
    impuestoId: z.string().uuid().nullable().optional(),
  })
  .strict();
export type LineaNotaDebito = z.infer<typeof lineaNotaDebitoSchema>;

export const solicitudNotaDebitoSchema = z
  .object({
    concepto: z.enum(CONCEPTOS_NOTA_DEBITO),
    motivo: z.string().trim().min(5).max(500),
    lineas: z.array(lineaNotaDebitoSchema).min(1).max(50),
    claveIdempotencia: z.string().trim().min(8).max(200),
  })
  .strict();
export type SolicitudNotaDebito = z.infer<typeof solicitudNotaDebitoSchema>;

export const anulacionNotaDebitoSchema = z.object({ motivo: z.string().trim().min(5).max(500) }).strict();

export const ERRORES_NOTA_DEBITO = [
  'no_autenticado',
  'sin_permiso',
  'factura_no_encontrada',
  'nota_no_encontrada',
  'sin_acceso_sucursal',
  'clave_idempotencia_invalida',
  'concepto_invalido',
  'motivo_obligatorio',
  'documento_invalido',
  'factura_borrador',
  'ya_anulada',
  'sin_lineas',
  'demasiadas_lineas',
  'linea_invalida',
  'impuesto_invalido',
  'monto_invalido',
  'sin_numeracion',
  'nota_aceptada_dian',
  'nota_en_envio_dian',
  'nota_con_pagos',
  'nota_debito_no_disponible',
] as const;
export type ErrorNotaDebito = (typeof ERRORES_NOTA_DEBITO)[number] | 'error_desconocido' | 'datos_invalidos';

/** Código de error de Postgres o PostgREST que dice que la función aún no existe (migración sin aplicar). */
export function esFuncionInexistente(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '42883' || error.code === 'PGRST202') return true;
  return /Could not find the function|function .* does not exist/i.test(error.message ?? '');
}

export function codigoErrorNotaDebito(mensaje: string | null | undefined): ErrorNotaDebito {
  const texto = (mensaje ?? '').trim();
  if (texto.startsWith('Acceso denegado a la organización')) return 'factura_no_encontrada';
  const primero = texto.split(/[\s:]/)[0];
  return (ERRORES_NOTA_DEBITO as readonly string[]).includes(primero) ? (primero as ErrorNotaDebito) : 'error_desconocido';
}

export function estadoHttpErrorNotaDebito(codigo: ErrorNotaDebito): number {
  switch (codigo) {
    case 'no_autenticado':
      return 401;
    case 'sin_permiso':
    case 'sin_acceso_sucursal':
      return 403;
    case 'factura_no_encontrada':
    case 'nota_no_encontrada':
      return 404;
    case 'nota_debito_no_disponible':
      return 501;
    case 'error_desconocido':
      return 500;
    case 'ya_anulada':
    case 'factura_borrador':
    case 'documento_invalido':
    case 'sin_numeracion':
    case 'nota_aceptada_dian':
    case 'nota_en_envio_dian':
    case 'nota_con_pagos':
      return 409;
    default:
      return 422;
  }
}

/** Impuesto que el diálogo ofrece por línea (de `organization_taxes`, tipo impuesto). */
export interface ImpuestoNotaDebito {
  id: string;
  nombre: string;
  tarifa: number;
}

export interface ContextoNotaDebito {
  /** false mientras la migración de la nota débito no esté aplicada. */
  disponible: boolean;
  factura: {
    id: string;
    numero: string | null;
    cliente: string | null;
    estado: string;
    tipoDocumento: string;
    saldo: number;
    total: number;
    moneda: string | null;
    feAceptada: boolean;
    emision: string | null;
    vencimiento: string | null;
  };
  impuestos: ImpuestoNotaDebito[];
}

export interface ResultadoNotaDebito {
  id: string;
  numero: string | null;
  total: number;
  repetida: boolean;
  /** El envío a la DIAN de notas débito aún no existe en la cola: queda pendiente si la factura fue aceptada. */
  fe: 'pendiente' | 'no_aplica';
}

export interface LineaNotaDebitoEdicion {
  id: string;
  descripcion: string;
  cantidad: number | null;
  valorUnitario: number | null;
  impuestoId: string | null;
}

/** Totales que verá el servidor (sin impuesto incluido, redondeo por línea como `fn_nota_debito_emitir`). */
export function totalesNotaDebito(
  lineas: readonly LineaNotaDebitoEdicion[],
  impuestos: readonly ImpuestoNotaDebito[],
): { subtotal: number; impuestos: { nombre: string; tarifa: number; base: number; importe: number }[]; total: number } {
  const porId = new Map(impuestos.map((i) => [i.id, i]));
  const grupos = new Map<string, { nombre: string; tarifa: number; base: number; importe: number }>();
  let subtotal = 0;
  let total = 0;
  for (const l of lineas) {
    if (!(l.cantidad && l.cantidad > 0) || !(l.valorUnitario && l.valorUnitario > 0)) continue;
    const base = r2(l.cantidad * l.valorUnitario);
    const imp = l.impuestoId ? porId.get(l.impuestoId) : undefined;
    const tarifa = imp?.tarifa ?? 0;
    const totalLinea = r2(base * (1 + tarifa / 100));
    subtotal = r2(subtotal + base);
    total = r2(total + totalLinea);
    if (imp && tarifa > 0) {
      const g = grupos.get(imp.id) ?? { nombre: imp.nombre, tarifa, base: 0, importe: 0 };
      g.base = r2(g.base + base);
      g.importe = r2(g.importe + (totalLinea - base));
      grupos.set(imp.id, g);
    }
  }
  return { subtotal, impuestos: [...grupos.values()].sort((a, b) => b.tarifa - a.tarifa), total };
}

/** Lo que falta para poder emitir (claves de texto); vacío = listo. */
export function faltantesNotaDebito(p: { concepto: string | null; motivo: string; lineas: readonly LineaNotaDebitoEdicion[] }): string[] {
  const f: string[] = [];
  if (!p.concepto) f.push('concepto');
  if (p.motivo.trim().length < 5) f.push('motivo');
  const validas = p.lineas.filter((l) => l.descripcion.trim() && (l.cantidad ?? 0) > 0 && (l.valorUnitario ?? 0) > 0);
  if (validas.length === 0) f.push('lineas');
  if (validas.length !== p.lineas.length) f.push('lineaIncompleta');
  return f;
}

/** Líneas del diálogo → cuerpo del POST (solo las completas). */
export function lineasParaEnviar(lineas: readonly LineaNotaDebitoEdicion[]): LineaNotaDebito[] {
  return lineas
    .filter((l) => l.descripcion.trim() && (l.cantidad ?? 0) > 0 && (l.valorUnitario ?? 0) > 0)
    .map((l) => ({
      descripcion: l.descripcion.trim(),
      cantidad: l.cantidad as number,
      valorUnitario: l.valorUnitario as number,
      impuestoId: l.impuestoId ?? null,
    }));
}

/** ¿Admite nota débito la factura? Emitida, viva y factura (no nota). */
export function facturaAdmiteNotaDebito(f: { estado: string; tipoDocumento: string | null | undefined }): boolean {
  const tipo = f.tipoDocumento ?? 'invoice';
  return tipo === 'invoice' && !['draft', 'void', 'voided', 'cancelled'].includes(f.estado);
}
