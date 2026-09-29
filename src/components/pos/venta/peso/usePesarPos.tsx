'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { Cart, CartItem, CartItemModifier, Product } from '@/components/pos/types';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { usePesajeContexto } from '@/lib/pos/peso/usePesajeContexto';
import { ProductoSinPrecioError } from '@/lib/pos/precioVigente';
import { POSService } from '@/lib/services/posService';
import { DialogoPesar } from './DialogoPesar';

interface EstadoPesar {
  producto: Product;
  precio: number;
  modo: 'agregar' | 'cambiar';
  itemId?: string;
  cantidadInicial?: number;
  modifiers?: CartItemModifier[];
}

/**
 * «Pesar» en la venta del POS: abrir para agregar un producto por peso o
 * medida (tarjeta, buscador o lector: todos pasan por la página) o para
 * cambiar el peso de una línea (chip «⚖ 0,735 kg», P). Cada pesada es una
 * línea nueva (`POSService.addItemToCart` no funde líneas medidas).
 */
export function usePesarPos({
  cartId,
  actualizar,
}: {
  cartId: string;
  actualizar: (cart: Cart) => void;
}): {
  abrirAgregar: (producto: Product, modifiers?: CartItemModifier[]) => Promise<void>;
  abrirCambiar: (item: CartItem) => void;
  dialogo: ReactNode;
} {
  const t = useTranslations('posPeso.dialogo');
  const moneda = useMonedaOrganizacion();
  const contexto = usePesajeContexto();
  const [estado, setEstado] = useState<EstadoPesar | null>(null);

  const avisarError = (error: unknown, producto: Product) => {
    console.error('Error agregando la pesada:', error);
    toast.error(
      error instanceof ProductoSinPrecioError
        ? t(error.causa === 'sin_precio' ? 'sinPrecio' : 'precioNoConsultado', { producto: producto.name })
        : t('errorAgregar', { producto: producto.name }),
    );
  };

  const abrirAgregar = async (producto: Product, modifiers?: CartItemModifier[]) => {
    const extras = (modifiers ?? []).reduce((s, m) => s + (m.extraPrice || 0), 0);
    let precio = Number(producto.price);
    if (!Number.isFinite(precio)) {
      try {
        precio = await POSService.precioVigenteProducto(producto.id, producto.name);
      } catch (error) {
        avisarError(error, producto);
        return;
      }
    }
    setEstado({ producto, precio: precio + extras, modo: 'agregar', modifiers });
  };

  const abrirCambiar = (item: CartItem) => {
    setEstado({
      producto: item.product,
      precio: item.unit_price,
      modo: 'cambiar',
      itemId: item.id,
      cantidadInicial: item.quantity,
    });
  };

  const confirmar = async (cantidad: number, pesaje: CartItem['pesaje']) => {
    if (!estado || !cartId) return;
    const actual = estado;
    try {
      const cart =
        actual.modo === 'cambiar' && actual.itemId
          ? await POSService.updateCartItemPesaje(cartId, actual.itemId, cantidad, pesaje)
          : await POSService.addItemToCart(cartId, actual.producto, cantidad, actual.modifiers, { pesaje });
      actualizar(cart);
      setEstado(null);
    } catch (error) {
      avisarError(error, actual.producto);
    }
  };

  const dialogo = (
    <DialogoPesar
      abierto={estado !== null}
      onAbiertoChange={(abierto) => {
        if (!abierto) setEstado(null);
      }}
      producto={estado?.producto ?? null}
      precioPorUnidad={estado?.precio ?? 0}
      moneda={moneda}
      puedePesarAMano={contexto.puedePesarAMano}
      modo={estado?.modo ?? 'agregar'}
      cantidadInicial={estado?.cantidadInicial ?? null}
      onConfirmar={confirmar}
    />
  );

  return { abrirAgregar, abrirCambiar, dialogo };
}
