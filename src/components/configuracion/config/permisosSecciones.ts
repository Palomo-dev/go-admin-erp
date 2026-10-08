/**
 * Qué secciones de Configuración ve una persona y cuáles puede editar.
 *
 * Regla pura que aplica el servidor (`GET /api/configuracion/secciones`) con
 * los módulos activos de la organización (plan) y los permisos resueltos con
 * `hasOrgAdminOrPermission` (sesión, nunca el cliente):
 *
 * - Módulo del plan inactivo → la sección NO aparece (ni en el menú ni en el
 *   buscador). Los módulos base (`isCore`) siempre están.
 * - Sin el permiso de la sección → aparece en solo lectura.
 * - Un ajuste con permiso propio (el desinterés pide `crm.stages.manage`) se
 *   evalúa aparte: `ajustes[ancla]`.
 */
import { canonicalModuleCode } from '@/lib/config/moduleAliases';
import { CONFIG_MODULES } from './configModulesRegistry';
import { SECCIONES_CONFIG, type SeccionConfig } from './configSectionsRegistry';

export interface PermisoSeccion {
  id: string;
  puedeEditar: boolean;
  /** Ajustes con permiso propio: ancla → puede editarlo. */
  ajustes: Record<string, boolean>;
}

export function moduloActivo(moduloId: string, modulosActivos: readonly string[]): boolean {
  const mod = CONFIG_MODULES.find((m) => m.id === moduloId);
  if (!mod) return false;
  if (mod.isCore) return true;
  const activos = new Set(modulosActivos.map(canonicalModuleCode));
  return activos.has(canonicalModuleCode(mod.moduleCode));
}

export async function resolverPermisosSecciones(
  modulosActivos: readonly string[],
  tienePermiso: (codigo: string) => Promise<boolean>,
  secciones: readonly SeccionConfig[] = SECCIONES_CONFIG,
): Promise<PermisoSeccion[]> {
  // Una consulta por código distinto, no una por sección.
  const cache = new Map<string, Promise<boolean>>();
  const permiso = (codigo: string) => {
    if (!cache.has(codigo)) cache.set(codigo, tienePermiso(codigo).catch(() => false));
    return cache.get(codigo) as Promise<boolean>;
  };
  const visibles = secciones.filter((s) => moduloActivo(s.modulo, modulosActivos));
  return Promise.all(
    visibles.map(async (s) => {
      const ajustes: Record<string, boolean> = {};
      for (const a of s.ajustes) {
        if (a.permiso) ajustes[a.ancla] = await permiso(a.permiso);
      }
      return { id: s.id, puedeEditar: await permiso(s.permiso), ajustes };
    }),
  );
}
