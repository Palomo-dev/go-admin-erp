'use client';

import { Package, TrendingUp } from 'lucide-react';
import { cn } from '@/utils/Utils';
import {
  descuentoUnitario,
  normalizarEscalones,
  precioConEscalon,
  siguienteEscalon,
  type Escalon,
} from '@/lib/promotions/precioVolumen';
import type { CreatePromotionData, PromotionTier } from '../types';

type T = (clave: string, valores?: Record<string, string | number>) => string;

export interface ProductoEjemplo {
  nombre: string;
  precio: number;
}

/** Texto de la insignia de la tarjeta según el tipo («−20 %», «Desde 6: −14 %»…). */
export function insigniaPromocion(d: CreatePromotionData, escalones: readonly Escalon[], precio: number, t: T, formatear: (n: number) => string): string | null {
  const valor = Number(d.discount_value) || 0;
  switch (d.promotion_type) {
    case 'percentage':
      return valor > 0 ? `−${valor} %` : null;
    case 'fixed_amount':
      return valor > 0 ? `−${formatear(valor)}` : null;
    case 'buy_x_get_y':
      return d.buy_quantity && d.get_quantity ? t('v2.vista.insigniaLleva', { x: d.buy_quantity, y: d.get_quantity }) : null;
    case 'bundle':
      return (Number(d.bundle_price) || 0) > 0
        ? t('v2.vista.insigniaCombo', { precio: formatear(Number(d.bundle_price)) })
        : valor > 0 ? `−${valor} %` : null;
    case 'volume_tiers': {
      const e = escalones[0];
      if (!e) return null;
      const pct = precio > 0 ? Math.round((descuentoUnitario(precio, e) / precio) * 100) : 0;
      return t('v2.vista.insigniaVolumen', { desde: e.desde, pct });
    }
    default:
      return null;
  }
}

interface Props {
  datos: CreatePromotionData;
  tiers: readonly PromotionTier[];
  producto: ProductoEjemplo;
  t: T;
  formatear: (n: number) => string;
  /** Detalle (A3): sin el título propio, va dentro de una Tarjeta. */
  compacta?: boolean;
}

export function VistaPreviaCliente({ datos, tiers, producto, t, formatear }: Props) {
  const escalones = datos.promotion_type === 'volume_tiers' ? normalizarEscalones(tiers) : [];
  const precio = producto.precio;
  const insignia = insigniaPromocion(datos, escalones, precio, t, formatear);
  const nombrePromo = datos.name.trim() || t('v2.vista.sinNombre');
  const pct = (e: Escalon) => (precio > 0 ? Math.round((descuentoUnitario(precio, e) / precio) * 100) : 0);

  // Precio después del descuento para los tipos simples (una unidad).
  const valor = Number(datos.discount_value) || 0;
  const precioPromo =
    datos.promotion_type === 'percentage' ? Math.max(0, precio - (precio * Math.min(valor, 100)) / 100)
      : datos.promotion_type === 'fixed_amount' ? Math.max(0, precio - valor)
        : null;

  const primer = escalones[0] ?? null;
  const cantidadCarrito = primer ? primer.desde : 0;
  const totalNormal = precio * cantidadCarrito;
  const totalEscalon = primer ? precioConEscalon(precio, primer) * cantidadCarrito : 0;
  const sig = primer ? siguienteEscalon(escalones, cantidadCarrito) : null;

  return (
    <div className="flex flex-col gap-4" data-testid="promo-vista-previa">
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="relative flex h-28 items-center justify-center bg-subtle">
          {insignia && (
            <span className="absolute left-2 top-2 rounded-full bg-warning px-2 py-0.5 text-xs font-semibold text-white">{insignia}</span>
          )}
          <Package className="size-8 text-fg-muted" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-0.5 p-3">
          <span className="text-sm text-fg">{producto.nombre}</span>
          <span className="flex items-baseline gap-2">
            <span className="text-lg font-semibold tabular-nums text-fg">{formatear(precioPromo ?? precio)}</span>
            {precioPromo != null && precioPromo < precio && (
              <span className="text-xs tabular-nums text-fg-muted line-through">{formatear(precio)}</span>
            )}
            {datos.promotion_type === 'volume_tiers' && <span className="text-xs text-fg-muted">{t('v2.vista.cu')}</span>}
          </span>
          {escalones.length > 0 && (
            <span className="text-xs text-warning-text">
              {escalones.map((e) => t('v2.vista.oMas', { n: e.desde, precio: formatear(precioConEscalon(precio, e)) })).join(' · ')}
            </span>
          )}
        </div>
      </div>

      {escalones.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-fg">{t('v2.vista.compraMas')}</p>
          <ul className="overflow-hidden rounded-lg border border-line text-[13px]">
            {[{ desde: 1, precioUnidad: precio, porcentaje: null } as Escalon, ...escalones].map((e, i, todos) => {
              const siguiente = todos[i + 1];
              const rango = siguiente
                ? t('v2.vista.rango', { desde: e.desde, hasta: siguiente.desde - 1 })
                : t('v2.vista.oMasCorto', { n: e.desde });
              return (
                <li key={e.desde} className={cn('flex items-center justify-between gap-2 border-b border-line px-3 py-2 last:border-b-0', i === 1 && 'bg-warning-subtle')}>
                  <span className="text-fg">{rango}</span>
                  <span className="flex items-center gap-2 tabular-nums">
                    {i > 0 && <span className="text-xs text-warning-text">−{pct(e)} %</span>}
                    <span className="text-fg">{t('v2.vista.precioCu', { precio: formatear(i === 0 ? precio : precioConEscalon(precio, e)) })}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {primer && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-fg">{t('v2.vista.enCarrito')}</p>
          <div className="rounded-lg bg-subtle px-3 py-2 text-[13px]">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-fg">{cantidadCarrito} × {producto.nombre}</span>
              <span className="flex items-baseline gap-2 tabular-nums">
                <span className="text-xs text-fg-muted line-through">{formatear(totalNormal)}</span>
                <span className="text-fg">{formatear(totalEscalon)}</span>
              </span>
            </div>
            <p className="text-xs text-success-text">
              {t('v2.vista.ahorras', { nombre: nombrePromo, monto: formatear(totalNormal - totalEscalon) })}
            </p>
          </div>
          {sig && (
            <p className="flex items-start gap-2 rounded-lg bg-warning-subtle px-3 py-2 text-[13px] text-warning-text">
              <TrendingUp className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t('v2.vista.agrega', { n: sig.faltan, precio: formatear(precioConEscalon(precio, sig.escalon)) })}
            </p>
          )}
          <p className="text-xs text-fg-secondary">{t('v2.vista.notaPos', { nombre: nombrePromo, n: cantidadCarrito })}</p>
        </div>
      )}

      {!primer && insignia && (
        <p className="text-[13px] text-success-text">{t('v2.vista.carrito', { nombre: nombrePromo, insignia })}</p>
      )}
    </div>
  );
}
