'use client';

import { BranchBadgeActiva } from '@/components/kit/BranchBadge';

/**
 * Chip de la sucursal activa del contexto global, en las pantallas de
 * inventario. Delegado al kit (`@/components/kit` › `BranchBadgeActiva`):
 * - Todas las sucursales → tinte de marca con `Building2` («Todas (3)»).
 * - Sucursal concreta → Azul GO sólido con `Store` (el fucsia salió del manual,
 *   SISTEMA-BADGES.md §6).
 *
 * Se conserva este archivo porque lo importan ~37 pantallas; el código nuevo
 * importa `BranchBadgeActiva` del kit directamente.
 */
export function BranchBadge({ className = '' }: { className?: string }) {
  return <BranchBadgeActiva className={className} />;
}

export default BranchBadge;
