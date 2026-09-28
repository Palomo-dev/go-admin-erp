'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FileText, History, Package, Truck } from 'lucide-react';
import { DataTable, ListCard, StatusBadge, type ColumnaTabla } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDateInTz } from '@/lib/utils/dateDisplay';
import type { EventoHistorial } from '@/lib/services/productoService';
import { useProductoDetalle } from '../ContextoProducto';

/** Una línea de compra del historial (`fn_producto_historial`, tipo `compra`). */
export interface CompraProducto {
  clave: string;
  fecha: string;
  documento: string;
  tipo: 'orden_compra' | 'factura_compra' | string;
  documentoId: string | null;
  estado: string | null;
  cantidad: number;
  costoUnitario: number;
  total: number;
  supplierId: number | null;
  proveedor: string | null;
  producto: string | null;
  esVariante: boolean;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function aCompra(e: EventoHistorial, productoId: number): CompraProducto {
  const d = e.detalle;
  return {
    clave: e.clave,
    fecha: e.fecha,
    documento: String(d.documento ?? ''),
    tipo: String(d.documento_tipo ?? ''),
    documentoId: d.documento_id != null ? String(d.documento_id) : null,
    estado: d.estado != null ? String(d.estado) : null,
    cantidad: num(d.cantidad),
    costoUnitario: num(d.costo_unitario),
    total: num(d.total),
    supplierId: d.supplier_id != null ? num(d.supplier_id) : null,
    proveedor: d.proveedor != null ? String(d.proveedor) : null,
    producto: e.producto_nombre,
    esVariante: e.product_id !== productoId,
  };
}

const ANULADAS = new Set(['cancelled', 'canceled', 'void', 'voided', 'anulada', 'cancelada', 'rejected']);

/** Última compra (no anulada) por proveedor: costo unitario y fecha. */
export function ultimaCompraPorProveedor(compras: readonly CompraProducto[]): Map<number, CompraProducto> {
  const m = new Map<number, CompraProducto>();
  for (const c of compras) {
    if (c.supplierId === null || (c.estado && ANULADAS.has(c.estado.toLowerCase()))) continue;
    const previa = m.get(c.supplierId);
    if (!previa || new Date(c.fecha).getTime() > new Date(previa.fecha).getTime()) m.set(c.supplierId, c);
  }
  return m;
}

export function rutaDocumentoCompra(c: Pick<CompraProducto, 'tipo' | 'documentoId'>): string | null {
  if (!c.documentoId) return null;
  if (c.tipo === 'orden_compra') return `/app/inventario/ordenes-compra/${c.documentoId}`;
  if (c.tipo === 'factura_compra') return `/app/inventario/facturas-compra/${c.documentoId}`;
  return null;
}

/**
 * «Historial de compras» del producto (y sus variantes): órdenes y facturas
 * de compra con enlace al documento, filtro por proveedor. Fechas en la zona
 * horaria de la organización; importes en su moneda.
 */
export function HistorialComprasProducto({
  compras,
  total,
  limite,
  cargando,
  error,
  onReintentar,
}: {
  compras: readonly CompraProducto[];
  total: number;
  limite: number;
  cargando: boolean;
  error: string | null;
  onReintentar: () => void;
}) {
  const t = useTranslations('productoDetalle.proveedores');
  const { moneda, fechas } = useProductoDetalle();
  const locale = useLocaleIntl();
  const router = useRouter();
  const [filtro, setFiltro] = useState<string>('todos');

  const cantidad = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }), [locale]);
  const fecha = (v: string) => formatDateInTz(v, fechas.timezone, { locale, day: '2-digit', month: 'short', year: 'numeric' });

  const proveedores = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of compras) if (c.supplierId !== null) m.set(String(c.supplierId), c.proveedor ?? t('sinNombre'));
    return Array.from(m, ([valor, nombre]) => ({ valor, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [compras, t]);

  const filas = useMemo(
    () => (filtro === 'todos' ? compras : compras.filter((c) => String(c.supplierId) === filtro)),
    [compras, filtro],
  );

  const documento = (c: CompraProducto) => {
    const ruta = rutaDocumentoCompra(c);
    const texto = c.tipo === 'orden_compra' ? t('compras.tipoOrden', { doc: c.documento }) : t('compras.tipoFactura', { doc: c.documento });
    return ruta ? (
      <Link href={ruta} className="font-medium text-link hover:underline" onClick={(e) => e.stopPropagation()}>
        {texto}
      </Link>
    ) : (
      <span>{texto}</span>
    );
  };

  const columnas: ColumnaTabla<CompraProducto>[] = [
    { id: 'fecha', encabezado: t('compras.fecha'), celda: (c) => fecha(c.fecha), ancho: 120 },
    {
      id: 'documento',
      encabezado: t('compras.documento'),
      celda: (c) => (
        <div className="flex flex-col">
          {documento(c)}
          {c.esVariante && c.producto && <span className="text-xs text-fg-secondary">{c.producto}</span>}
        </div>
      ),
    },
    { id: 'proveedor', encabezado: t('compras.proveedor'), celda: (c) => c.proveedor ?? t('sinNombre'), ocultarDebajo: 'xl' },
    { id: 'cantidad', encabezado: t('compras.cantidad'), variante: 'importe', celda: (c) => cantidad.format(c.cantidad) },
    { id: 'costo', encabezado: t('compras.costoUnitario'), variante: 'importe', celda: (c) => moneda.formatear(c.costoUnitario) },
    { id: 'total', encabezado: t('compras.total'), variante: 'importe', celda: (c) => moneda.formatear(c.total) },
    { id: 'estado', encabezado: t('compras.estado'), celda: (c) => (c.estado ? <StatusBadge estado={c.estado} /> : '—') },
  ];

  return (
    <section className="flex flex-col gap-3" aria-label={t('compras.titulo')}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <h3 className="flex items-center gap-2 text-base font-semibold text-fg">
            <History className="size-4 text-fg-secondary" aria-hidden /> {t('compras.titulo')}
          </h3>
          <p className="text-xs text-fg-secondary">
            {total > limite ? t('compras.limitado', { n: limite, total }) : t('compras.subtitulo')}
          </p>
        </div>
        {proveedores.length > 1 && (
          <Select value={filtro} onValueChange={setFiltro}>
            <SelectTrigger className="h-10 w-full sm:w-64" aria-label={t('compras.filtro')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">{t('compras.todos')}</SelectItem>
              {proveedores.map((p) => (
                <SelectItem key={p.valor} value={p.valor}>
                  {p.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <DataTable
        etiqueta={t('compras.titulo')}
        columnas={columnas}
        filas={filas}
        obtenerId={(c) => c.clave}
        densidad="compacta"
        estado={cargando ? 'cargando' : error ? 'error' : 'listo'}
        onReintentar={onReintentar}
        error={{ titulo: t('compras.error'), descripcion: error ?? undefined }}
        vacio={{ titulo: t('compras.vacio'), descripcion: t('compras.vacioAyuda'), icono: FileText }}
        tarjetaMovil={(c) => (
          <ListCard
            icono={FileText}
            titulo={c.tipo === 'orden_compra' ? t('compras.tipoOrden', { doc: c.documento }) : t('compras.tipoFactura', { doc: c.documento })}
            subtitulo={fecha(c.fecha)}
            valor={moneda.formatear(c.total)}
            estado={c.estado ? <StatusBadge estado={c.estado} /> : undefined}
            datos={[
              c.proveedor ? { icono: Truck, texto: c.proveedor, etiqueta: t('compras.proveedor') } : null,
              {
                icono: Package,
                texto: t('compras.cantidadPorCosto', { cantidad: cantidad.format(c.cantidad), costo: moneda.formatear(c.costoUnitario) }),
                etiqueta: t('compras.cantidad'),
              },
            ]}
            onClick={(() => {
              const ruta = rutaDocumentoCompra(c);
              return ruta ? () => router.push(ruta) : undefined;
            })()}
          />
        )}
      />
    </section>
  );
}
