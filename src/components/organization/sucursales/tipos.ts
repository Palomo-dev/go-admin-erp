import type { Branch } from '@/types/branch';

/** Sucursal con su gerente (`branchService.getBranchesWithManagers`). */
export type SucursalFila = Branch & {
  id: number;
  manager?: { id: string; first_name?: string | null; last_name?: string | null; email?: string | null; avatar_url?: string | null } | null;
};

export function nombreGerente(s: SucursalFila): string | null {
  if (!s.manager) return null;
  const n = `${s.manager.first_name ?? ''} ${s.manager.last_name ?? ''}`.trim();
  return n || s.manager.email || null;
}
