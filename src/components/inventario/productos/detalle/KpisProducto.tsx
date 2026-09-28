'use client';

import { useTranslations } from 'next-intl';
import { Boxes, DollarSign, Percent } from 'lucide-react';
import { KpiStrip, StatCard } from '@/components/kit';
import { calcularMargen, descuentoComparacion, tonoMargen } from '../logica/margen';
import { totalesStock } from '../logica/stock';
import { useProductoDetalle } from './ContextoProducto';

/**
 * KPI del detalle (Figma `Producto — Cabecera`, A.2 #16-#18): precio de venta
 * con comparación y descuento, costo con margen, y stock de la sucursal activa
 * (o de todas) con reservado y disponible. Salen de `fn_producto_resumen`.
 */
export function KpisProducto() {
  const t = useTranslations('productoDetalle.kpi');
  const { producto, resumen, cargandoResumen, moneda, sucursalActiva, irA } = useProductoDetalle();

  const precio = resumen?.precio ?? null;
  const comparacion = resumen?.precio_comparacion ?? null;
  const costo = resumen?.costo ?? null;
  const margen = calcularMargen(precio, costo);
  const descuento = descuentoComparacion(precio, comparacion);
  const rastrea = producto.track_stock !== false && producto.product_type !== 'service';
  const totales = totalesStock(resumen?.sucursales ?? [], sucursalActiva);
  const nombreSucursal = sucursalActiva === null ? t('todasSucursales') : resumen?.sucursales.find((s) => s.branch_id === sucursalActiva)?.nombre ?? t('estaSucursal');
  const entero = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(n);

  return (
    <KpiStrip etiqueta={t('etiqueta')} columnas={3}>
      <StatCard
        etiqueta={t('precio')}
        icono={DollarSign}
        cargando={cargandoResumen && !resumen}
        valor={precio !== null ? moneda.formatear(precio) : t('sinPrecio')}
        detalle={
          comparacion && descuento !== null
            ? t('comparacion', { valor: moneda.formatear(comparacion), descuento })
            : t('precioAyuda')
        }
        tono={descuento !== null ? 'peligro' : 'neutro'}
        onClick={() => irA('precios')}
      />
      <StatCard
        etiqueta={t('costo')}
        icono={Percent}
        cargando={cargandoResumen && !resumen}
        valor={costo !== null ? moneda.formatear(costo) : t('sinCosto')}
        detalle={margen !== null ? t('margen', { valor: margen }) : t('costoAyuda')}
        tono={tonoMargen(margen)}
        onClick={() => irA('precios')}
      />
      <StatCard
        etiqueta={t('stock', { sucursal: nombreSucursal })}
        icono={Boxes}
        cargando={cargandoResumen && !resumen}
        valor={rastrea ? t('unidades', { n: entero(totales.enExistencia) }) : t('sinSeguimiento')}
        detalle={
          rastrea
            ? t('reservadoDisponible', { reservado: entero(totales.reservado), disponible: entero(totales.disponible) })
            : t('sinSeguimientoAyuda')
        }
        tono={!rastrea ? 'neutro' : totales.disponible <= 0 ? 'peligro' : totales.bajoMinimo > 0 ? 'advertencia' : 'neutro'}
        onClick={() => irA('inventario', 'stock')}
      />
    </KpiStrip>
  );
}
