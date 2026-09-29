'use client';

import type { ReactNode } from 'react';
import type { Cart, CartItem, CartItemModifier, Product } from '@/components/pos/types';
import { POSService } from '@/lib/services/posService';
import { usePesarConBascula } from './usePesarConBascula';

/**
 * «Pesar» en la venta del POS: abrir para agregar un producto por peso o
 * medida (tarjeta, buscador o lector: todos pasan por la página) o para
 * cambiar el peso de una línea (chip «⚖ 0,735 kg», P). Cada pesada es una
 * línea nueva (`POSService.addItemToCart` no funde líneas medidas).
 *
 * Con báscula en el equipo (fase 3 y venta en un paso, §11): el lector queda
 * abierto mientras la caja está en pantalla; escanear o tocar un producto por
 * peso con una lectura estable, válida y nueva lo agrega de una; si no, abre
 * «Pesar» y lo agrega solo al estabilizarse (regla `agregar_al_estabilizar`,
 * activa por defecto). Tras agregar: toast «Agregado: 0,735 kg · Queso ·
 * $ 13.892» con «Deshacer». La lógica es la de `usePesarConBascula` (la
 * comparte la mesa); aquí solo el destino: el carrito del POS.
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
  const pesar = usePesarConBascula<CartItemModifier>(
    {
      agregar: async ({ producto, cantidad, pesaje, modifiers }) => {
        if (!cartId) return null;
        const cart = await POSService.addItemToCart(cartId, producto, cantidad, modifiers, { pesaje });
        actualizar(cart);
        // La línea nueva va al final (una pesada nunca se funde con otra).
        return cart.items[cart.items.length - 1]?.id ?? null;
      },
      deshacer: async (id) => {
        actualizar(await POSService.removeItemFromCart(cartId, id));
      },
      cambiar: async (id, cantidad, pesaje) => {
        actualizar(await POSService.updateCartItemPesaje(cartId, id, cantidad, pesaje));
      },
    },
    { pantallaCliente: true },
  );

  const abrirAgregar = (producto: Product, modifiers?: CartItemModifier[]) =>
    pesar.abrirAgregar(producto, { modifiers, extras: (modifiers ?? []).reduce((s, m) => s + (m.extraPrice || 0), 0) });

  const abrirCambiar = (item: CartItem) =>
    pesar.abrirCambiar({ id: item.id, producto: item.product, precio: item.unit_price, cantidad: item.quantity });

  return { abrirAgregar, abrirCambiar, dialogo: pesar.dialogo };
}
