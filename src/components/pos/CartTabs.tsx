'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Clock, Plus, ShoppingCart, X } from 'lucide-react';
import { Dialogo, EmptyState, KbdButton, useAtajos } from '@/components/kit';
import { clasesBadgeTono } from '@/components/ui/badge';
import { useDragScroll } from '@/hooks/useDragScroll';
import { hayRafagaDelLector } from '@/hooks/useHardwareBarcodeScanner';
import { teclaAtajo } from '@/lib/pos/venta/atajos';
import { etiquetaPestana, puedeCerrarPestana } from '@/lib/pos/venta/pestanaCarrito';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { cn } from '@/utils/Utils';
import { Cart } from './types';

/**
 * Pestañas de los carritos de la sucursal (paso 8 de POS-PLAN; POS-UX-V2 D3):
 * cliente o «Carrito N», total y líneas; «Nuevo · Ctrl+N»; cerrar con
 * confirmación solo con más de un carrito (L12). Ctrl+Tab pasa al siguiente.
 * Misma API de siempre.
 */
interface CartTabsProps {
  carts: Cart[];
  activeCartId: string;
  onCartSelect: (cartId: string) => void;
  onNewCart: () => void;
  onRemoveCart: (cartId: string) => void;
  className?: string;
  /** false apaga Ctrl+N y Ctrl+Tab (la página lo hace con el cobro abierto). */
  atajosActivos?: boolean;
}

export function CartTabs({ carts, activeCartId, onCartSelect, onNewCart, onRemoveCart, className, atajosActivos = true }: CartTabsProps) {
  const t = useTranslations('posVenta.pestanas');
  const tAtajos = useTranslations('posVenta.atajos');
  const { formatear } = useMonedaOrganizacion();
  const [isCreatingCart, setIsCreatingCart] = useState(false);
  const [cartToRemove, setCartToRemove] = useState<string | null>(null);
  const arrastre = useDragScroll<HTMLDivElement>();

  const handleNewCart = async () => {
    if (isCreatingCart) return;
    setIsCreatingCart(true);
    try {
      await onNewCart();
    } finally {
      setIsCreatingCart(false);
    }
  };

  const siguiente = () => {
    if (carts.length < 2) return;
    const i = carts.findIndex((c) => c.id === activeCartId);
    onCartSelect(carts[(i + 1) % carts.length].id);
  };

  useAtajos(
    [
      { tecla: teclaAtajo('nuevoCarrito'), descripcion: tAtajos('nuevoCarrito'), accion: () => void handleNewCart(), permitirEnCampo: true },
      { tecla: teclaAtajo('siguienteCarrito'), descripcion: tAtajos('siguienteCarrito'), accion: siguiente, cuando: () => carts.length > 1, permitirEnCampo: true },
    ],
    { activo: atajosActivos, hayRafaga: hayRafagaDelLector },
  );

  const confirmRemoveCart = () => {
    if (cartToRemove) onRemoveCart(cartToRemove);
    setCartToRemove(null);
  };

  const nombre = (cart: Cart, index: number) => {
    const e = etiquetaPestana(cart, index);
    return e.cliente ?? t('carritoN', { n: e.numero });
  };

  if (carts.length === 0) {
    return (
      <div className={className}>
        <EmptyState
          variante="empty"
          icono={ShoppingCart}
          titulo={t('sinCarritosTitulo')}
          descripcion={t('sinCarritosDescripcion')}
          accion={{ etiqueta: t('crear'), onClick: () => void handleNewCart() }}
        />
      </div>
    );
  }

  const aCerrar = carts.find((c) => c.id === cartToRemove);
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div ref={arrastre.ref} className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:thin]">
        <div role="tablist" aria-label={t('etiqueta')} className="flex w-max items-center gap-1 rounded-lg bg-subtle p-1">
          {carts.map((cart, index) => {
            const e = etiquetaPestana(cart, index);
            const activa = cart.id === activeCartId;
            const Icono = e.enEspera ? Clock : ShoppingCart;
            return (
              <div
                key={cart.id}
                className={cn(
                  'flex items-center rounded-md transition-colors',
                  activa ? (e.enEspera ? 'bg-warning-subtle text-warning-text shadow-sm' : 'bg-surface text-fg shadow-sm') : 'text-fg-secondary hover:bg-hover',
                )}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activa}
                  tabIndex={activa ? 0 : -1}
                  title={e.enEspera && cart.hold_reason ? t('enEsperaMotivo', { motivo: cart.hold_reason }) : undefined}
                  onClick={() => onCartSelect(cart.id)}
                  onKeyDown={(ev) => {
                    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
                    ev.preventDefault();
                    const j = (index + (ev.key === 'ArrowRight' ? 1 : -1) + carts.length) % carts.length;
                    onCartSelect(carts[j].id);
                  }}
                  className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <Icono aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
                  <span className="max-w-[9rem] truncate">{nombre(cart, index)}</span>
                  {/* Figma `906:115555`/`906:115556`: Badge de total y de conteo. Con las
                      clases del Badge (no el componente: es un `div` y va dentro de un botón). */}
                  {e.mostrarTotal && (
                    <span className={cn(clasesBadgeTono('neutro', 'suave', 'sm'), 'tabular-nums')}>{formatear(e.total)}</span>
                  )}
                  {e.lineas > 0 && (
                    <span
                      className={cn(
                        clasesBadgeTono(e.enEspera ? 'advertencia' : 'marca', e.enEspera ? 'contorno' : 'solido', 'sm'),
                        'min-w-5 justify-center tabular-nums',
                      )}
                      aria-label={t('lineas', { n: e.lineas })}
                    >
                      {e.lineas}
                    </span>
                  )}
                </button>
                {puedeCerrarPestana(carts.length) && (
                  <button
                    type="button"
                    aria-label={t('cerrarCarrito', { nombre: nombre(cart, index) })}
                    title={t('cerrar')}
                    onClick={() => setCartToRemove(cart.id)}
                    className="mr-1 flex size-6 items-center justify-center rounded text-fg-muted hover:bg-danger-subtle hover:text-danger-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <X aria-hidden="true" className="size-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <KbdButton
        variante="secundario"
        tamano="sm"
        icono={Plus}
        atajo={teclaAtajo('nuevoCarrito')}
        cargando={isCreatingCart}
        onClick={() => void handleNewCart()}
        aria-label={t('nuevo')}
      >
        <span className="hidden xl:inline">{t('nuevo')}</span>
      </KbdButton>

      <Dialogo
        abierto={!!cartToRemove}
        onAbiertoChange={(abierto) => {
          if (!abierto) setCartToRemove(null);
        }}
        titulo={t('confirmarTitulo')}
        descripcion={
          aCerrar && aCerrar.items.length > 0
            ? t('confirmarConProductos', { n: aCerrar.items.length, total: formatear(aCerrar.total) })
            : t('confirmarDescripcion')
        }
        ancho={440}
        primario={{ etiqueta: t('confirmar'), destructiva: true, onClick: confirmRemoveCart }}
      />
    </div>
  );
}
