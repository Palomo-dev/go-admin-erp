'use client';

import type { ComponentProps } from 'react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/kit';
import { CartTabs } from '@/components/pos/CartTabs';
import { CartView } from '@/components/pos/CartView';
import { CustomerSelector } from '@/components/pos/CustomerSelector';
import type { Cart } from '@/components/pos/types';
import { teclaAtajo } from '@/lib/pos/venta/atajos';
import { cn } from '@/utils/Utils';

/**
 * Columna del carrito (paso 9 de POS-PLAN; Figma `Carrito (listo)`, POS-UX-V2
 * D3): pestañas · cliente · carrito, con las líneas en scroll propio y el
 * resumen y la botonera fijos abajo (con 4 líneas en 1440 × 900 el total y
 * «Cobrar» se ven sin scroll). La misma columna va a la derecha en escritorio
 * y tableta horizontal, y dentro de la hoja del carrito en el celular.
 *
 * Estados: «Elige la sucursal para vender» (la sucursal activa es «Todas»),
 * cargando (Skeleton de la página) y el carrito vacío (de `CartView`).
 * Solo compone: los datos y las acciones llegan de la página.
 */
type PropsCarrito = Omit<ComponentProps<typeof CartView>, 'cart' | 'className'>;

export interface PanelCarritoProps {
  carts: Cart[];
  activeCart: Cart | undefined;
  activeCartId: string;
  onCartSelect: (cartId: string) => void;
  onNewCart: () => void;
  onRemoveCart: (cartId: string) => void;
  /** La sucursal activa es «Todas»: no se puede vender. */
  sinSucursal: boolean;
  onElegirSucursal?: () => void;
  onClienteSelect: ComponentProps<typeof CustomerSelector>['onCustomerSelect'];
  clienteAbierto: boolean;
  onClienteAbiertoChange: (abierto: boolean) => void;
  /** Acciones del carrito activo (las de `CartView`). */
  carrito: PropsCarrito;
  /** false con el cobro abierto: apaga los atajos de pestañas y carrito. */
  atajosActivos: boolean;
  className?: string;
}

export function PanelCarrito({
  carts,
  activeCart,
  activeCartId,
  onCartSelect,
  onNewCart,
  onRemoveCart,
  sinSucursal,
  onElegirSucursal,
  onClienteSelect,
  clienteAbierto,
  onClienteAbiertoChange,
  carrito,
  atajosActivos,
  className,
}: PanelCarritoProps) {
  const t = useTranslations('posVenta.panel');

  if (sinSucursal) {
    return (
      <div className={cn('flex h-full flex-col justify-center rounded-xl border border-line bg-surface p-4', className)}>
        <EmptyState
          variante="sinSucursal"
          titulo={t('sinSucursalTitulo')}
          descripcion={t('sinSucursalDescripcion')}
          accion={onElegirSucursal ? { etiqueta: t('elegirSucursal'), onClick: onElegirSucursal } : undefined}
        />
      </div>
    );
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col gap-2', className)}>
      <CartTabs
        carts={carts}
        activeCartId={activeCartId}
        onCartSelect={onCartSelect}
        onNewCart={onNewCart}
        onRemoveCart={onRemoveCart}
        atajosActivos={atajosActivos}
        className="shrink-0"
      />
      {activeCart && (
        <>
          <CustomerSelector
            className="shrink-0"
            selectedCustomer={activeCart.customer}
            onCustomerSelect={onClienteSelect}
            open={clienteAbierto}
            onOpenChange={onClienteAbiertoChange}
            atajo={teclaAtajo('cliente')}
            accionesFichaEnPestanaNueva
          />
          <CartView {...carrito} cart={activeCart} atajosActivos={atajosActivos} className="min-h-0 flex-1" />
        </>
      )}
    </div>
  );
}
