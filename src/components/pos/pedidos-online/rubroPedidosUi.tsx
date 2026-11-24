'use client';

/**
 * Pedidos online habla el idioma de cada negocio (2026-11-24): el gorro de
 * chef y «preparación» son de restaurante; una tienda alista el empaque.
 * La regla vive en `@/lib/pos/pedidosWeb/rubroPedidos` (solo presentación).
 *
 * El layout de `/app/pos/pedidos-online` pone el proveedor una vez para la
 * lista y el detalle; los componentes leen el rubro con `useRubroPedidos()`.
 * Sin proveedor: tienda (el default de Pedidos online).
 */
import { createContext, useContext, type ReactNode } from 'react';
import { ChefHat, PackageOpen, type LucideIcon } from 'lucide-react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { rubroDeTipoOrgId, type RubroPedidos } from '@/lib/pos/pedidosWeb/rubroPedidos';

const RubroPedidosContext = createContext<RubroPedidos>('tienda');

/** Rubro desde la organización activa (`organizations.type_id`). */
export function RubroPedidosProvider({ children }: { children: ReactNode }) {
  const { organization } = useOrganization();
  return <RubroPedidosContext.Provider value={rubroDeTipoOrgId(organization?.type_id)}>{children}</RubroPedidosContext.Provider>;
}

export function useRubroPedidos(): RubroPedidos {
  return useContext(RubroPedidosContext);
}

/**
 * Ícono del paso «preparar»: gorro de chef solo en restaurante; en una tienda,
 * la caja abierta de alistar el empaque (junto a «Marcar listo» = `Package` y
 * «Enviar» = `Truck`).
 */
export const ICONO_PREPARAR: Record<RubroPedidos, LucideIcon> = {
  restaurante: ChefHat,
  tienda: PackageOpen,
};
