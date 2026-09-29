/**
 * Exportar listados de Membresías a CSV (§12.3) — construcción pura del archivo.
 *
 * Con la utilidad única de CSV del repo (`filasACsv` de `@/lib/utils/csv`: BOM, «;», CRLF, comillas
 * cuando hace falta y celdas que empiezan por `=`, `+`, `-`, `@` neutralizadas contra inyección de
 * fórmulas: los nombres de los miembros son datos de terceros). Importes como en los listados de
 * Finanzas: número con los separadores de la moneda de la organización y sin símbolo
 * (`formatNumeroMoneda`, «1.250.000»). No hay utilidad de exportación a Excel (.xlsx) en el repo;
 * el CSV con BOM y «;» abre directo en Excel en español. Fechas en la zona de
 * la organización (`formatDateInTz` / `formatDateTimeInTz`). Los textos salen de `messages/*.json`
 * (namespace `membresias` y los estados del kit), con el traductor que recibe.
 */
import { claveEtiquetaEstado, etiquetaEstado } from '@/components/kit/estadoTono';
import { filasACsv } from '@/lib/utils/csv';
import { formatDateInTz, formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import { formatNumeroMoneda } from '@/lib/utils/moneda';
import type { MembresiaFila, MiembroFila, PagoFila, TipoExportacion } from './tipos';

/** Traductor sobre el catálogo completo (claves absolutas: `membresias.…`, `kit.estados.…`). */
export interface Traductor {
  (clave: string, valores?: Record<string, string | number>): string;
  has?: (clave: string) => boolean;
}

export interface FormatoExportacion {
  t: Traductor;
  /** Zona IANA de la organización. */
  zona: string;
  /** Locale de Intl (`es-CO`, `en-US`…). */
  locale: string;
  /** Código ISO de la moneda de la organización. */
  moneda: string;
}

type Celda = string | number | null | undefined;

const COLUMNAS: Record<TipoExportacion, readonly string[]> = {
  membresias: ['miembro', 'documento', 'plan', 'codigo', 'desde', 'hasta', 'estado', 'sede', 'ultimaEntrada', 'origen'],
  miembros: ['miembro', 'documento', 'correo', 'telefono', 'planVigente', 'estado', 'vence', 'ultimaEntrada', 'membresias'],
  pagos: ['fecha', 'cliente', 'documento', 'producto', 'cantidad', 'total', 'estadoVenta', 'factura', 'saldo', 'membresia'],
};

/** Tope de filas por archivo: 50 páginas de 100 (el servidor corta ahí y lo avisa en la cabecera). */
export const MAX_FILAS_EXPORTACION = 5000;

export function encabezados(tipo: TipoExportacion, t: Traductor): string[] {
  return COLUMNAS[tipo].map((c) => t(`membresias.exportar.columnas.${tipo}.${c}`));
}

function fecha(v: string | null | undefined, f: FormatoExportacion): string {
  return formatDateInTz(v ?? null, f.zona, { locale: f.locale });
}

function fechaHora(v: string | null | undefined, f: FormatoExportacion): string {
  return formatDateTimeInTz(v ?? null, f.zona, { locale: f.locale });
}

function importe(v: number | null | undefined, f: FormatoExportacion): string {
  return v === null || v === undefined ? '' : formatNumeroMoneda(v, f.moneda);
}

function estadoMembresia(m: Pick<MembresiaFila, 'estadoVisual' | 'dias'>, f: FormatoExportacion): string {
  return f.t(`membresias.estados.${m.estadoVisual}`, { dias: m.dias ?? 0 });
}

/** Estado de una venta con la misma tabla que `StatusBadge` del kit. */
function estadoVenta(estado: string | null, f: FormatoExportacion): string {
  if (!estado) return '';
  const c = claveEtiquetaEstado(estado);
  const clave = c ? `kit.estados.${c.clave}` : null;
  if (!c || !clave || (f.t.has && !f.t.has(clave))) return etiquetaEstado(estado);
  return `${f.t(clave)}${c.sufijo}`;
}

export function filasMembresias(filas: readonly MembresiaFila[], f: FormatoExportacion): Celda[][] {
  return filas.map((m) => [
    m.cliente.nombre,
    m.cliente.documento,
    m.plan.nombre,
    m.codigo,
    fecha(m.desde, f),
    fecha(m.hasta, f),
    estadoMembresia(m, f),
    m.sucursal ?? '',
    fechaHora(m.ultimaEntrada, f),
    m.origen ? f.t(`membresias.origen.${m.origen}`) : '',
  ]);
}

export function filasMiembros(filas: readonly MiembroFila[], f: FormatoExportacion): Celda[][] {
  return filas.map((m) => [
    m.cliente.nombre,
    m.cliente.documento,
    m.cliente.email,
    m.cliente.telefono,
    m.vigente?.plan.nombre ?? '',
    m.vigente ? estadoMembresia(m.vigente, f) : f.t('membresias.miembros.sinVigente'),
    fecha(m.vigente?.hasta, f),
    fechaHora(m.ultimaEntrada, f),
    m.membresias,
  ]);
}

export function filasPagos(filas: readonly PagoFila[], f: FormatoExportacion): Celda[][] {
  return filas.map((p) => [
    fecha(p.fecha, f),
    p.cliente?.nombre ?? f.t('membresias.pagos.sinCliente'),
    p.cliente?.documento,
    p.producto,
    p.cantidad,
    importe(p.total, f),
    estadoVenta(p.estadoVenta, f),
    p.factura?.numero ?? '',
    p.factura ? importe(p.factura.saldo, f) : '',
    p.membresiaId,
  ]);
}

export function construirCsv(
  tipo: TipoExportacion,
  filas: readonly MembresiaFila[] | readonly MiembroFila[] | readonly PagoFila[],
  f: FormatoExportacion,
): string {
  const cuerpo =
    tipo === 'membresias'
      ? filasMembresias(filas as readonly MembresiaFila[], f)
      : tipo === 'miembros'
        ? filasMiembros(filas as readonly MiembroFila[], f)
        : filasPagos(filas as readonly PagoFila[], f);
  return filasACsv(encabezados(tipo, f.t), cuerpo);
}

/** `membresias_2026-09-29.csv` con el nombre del listado en el idioma y el día de la organización. */
export function nombreArchivo(tipo: TipoExportacion, hoy: string, t: Traductor): string {
  const base = t(`membresias.exportar.archivo.${tipo}`)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${base || tipo}_${hoy}.csv`;
}
