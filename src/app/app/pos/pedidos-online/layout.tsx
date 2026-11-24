'use client';

import type { ReactNode } from 'react';
import { RubroPedidosProvider } from '@/components/pos/pedidos-online/rubroPedidosUi';

/** Lista y detalle de Pedidos online comparten el vocabulario del negocio (restaurante o tienda). */
export default function PedidosOnlineLayout({ children }: { children: ReactNode }) {
  return <RubroPedidosProvider>{children}</RubroPedidosProvider>;
}
