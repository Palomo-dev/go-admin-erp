'use client';

/**
 * InsigniaCanal (Figma 24 Ventas, componente 2896:12337, aprobado el
 * 2026-11-23): el canal de una venta o pedido con su icono. Una sola insignia
 * por canal en todo el sistema (Todas las ventas, tarjetas del celular,
 * Pedidos online). Hecha con el Badge del kit, `suave` e icono lucide:
 * POS = marca · ShoppingCart, Tienda web = información · Globe, Menú QR =
 * éxito · QrCode, Marketplace = advertencia · Store, Manual = neutro · PenLine.
 */
import { useTranslations } from 'next-intl';
import { Globe, PenLine, QrCode, ShoppingCart, Store, type LucideIcon } from 'lucide-react';
import { Badge, type TamanoBadge } from '@/components/ui/badge';
import type { TonoBadge } from '@/components/kit/estadoTono';
import type { CanalVenta } from '@/lib/pos/ventas/canalVenta';

export const TONO_CANAL: Record<CanalVenta, TonoBadge> = {
  pos: 'marca',
  tienda_web: 'informacion',
  menu_qr: 'exito',
  marketplace: 'advertencia',
  manual: 'neutro',
};

export const ICONO_CANAL: Record<CanalVenta, LucideIcon> = {
  pos: ShoppingCart,
  tienda_web: Globe,
  menu_qr: QrCode,
  marketplace: Store,
  manual: PenLine,
};

/** Nombre del canal en el idioma de la persona (`ventas.canales.*`). */
export function useNombreCanal(): (canal: CanalVenta) => string {
  const t = useTranslations('ventas.canales');
  return (canal) => t(canal);
}

export function InsigniaCanal({ canal, tamano = 'sm', className }: { canal: CanalVenta; tamano?: TamanoBadge; className?: string }) {
  const nombre = useNombreCanal();
  return (
    <Badge tono={TONO_CANAL[canal]} apariencia="suave" tamano={tamano} icono={ICONO_CANAL[canal]} className={className}>
      {nombre(canal)}
    </Badge>
  );
}
