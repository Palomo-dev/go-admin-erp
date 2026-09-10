/**
 * GO Assistant — capacidades efectivas de un usuario dentro de una organización.
 *
 * Sustituye a la heurística del cliente
 * (`context.userRole.toLowerCase().includes('admin')`, C2 del plan), que hacía
 * admin a cualquier rol cuyo NOMBRE contuviera "admin" ("Auxiliar
 * administrativo") y viajaba en el body hasta el endpoint de ejecución.
 *
 * El permiso efectivo es la intersección de tres cosas, todas resueltas en el
 * servidor (§9.2 del plan):
 *
 *   nivel de capacidad de la organización  ∩  permisos del usuario  ∩  módulos activos
 *
 * El nivel vive en `ai_assistant_settings` y arranca en `off`: una organización
 * que no ha configurado nada ve el asistente de siempre (responde y guía) sin
 * ninguna herramienta de escritura. Es el contrato de no regresión §3.2.
 */

import type { ServerOrgContext } from '@/lib/utils/orgContext';
// Se importa del módulo hoja, no de `orgContext`: ese arrastra
// `webhookSignatures` → `svix` (ESM puro) y convertiría este archivo ligero en
// intestable bajo Jest. La regla sigue siendo la misma y única.
import { isOrgAdminLike } from '@/lib/utils/orgAdmin';

export type CapabilityLevel = 'off' | 'read' | 'write_low' | 'write_full';

/** Orden de inclusión: cada nivel contiene a los anteriores. */
const LEVEL_ORDER: Record<CapabilityLevel, number> = {
  off: 0,
  read: 1,
  write_low: 2,
  write_full: 3,
};

export function levelAtLeast(actual: CapabilityLevel, required: CapabilityLevel): boolean {
  return LEVEL_ORDER[actual] >= LEVEL_ORDER[required];
}

export interface AssistantCapabilities {
  level: CapabilityLevel;
  /** `null` = todas las herramientas del nivel. */
  enabledTools: string[] | null;
  /** Códigos de permiso del usuario (rol + cargo, vía RPC). */
  permissions: Set<string>;
  isAdmin: boolean;
  /** Módulos activos de la organización (códigos). Vacío = no se pudo resolver. */
  activeModules: Set<string>;
  undoWindowMinutes: number;
  bulkMaxRows: number;
}

const DEFAULTS = {
  undoWindowMinutes: 15,
  bulkMaxRows: 500,
};

/**
 * Lee el nivel de la organización y los permisos del usuario.
 *
 * Fail-safe hacia abajo: si algo falla, se devuelve el nivel más restrictivo
 * (`off`) y un conjunto de permisos vacío. Nunca se abre por error.
 */
export async function getAssistantCapabilities(
  ctx: ServerOrgContext
): Promise<AssistantCapabilities> {
  const isAdmin = isOrgAdminLike(ctx);

  const [settingsRes, permsRes, modulesRes] = await Promise.all([
    ctx.supabase
      .from('ai_assistant_settings')
      .select('capability_level, enabled_tools, undo_window_minutes, bulk_max_rows')
      .eq('organization_id', ctx.organizationId)
      .maybeSingle(),
    ctx.supabase.rpc('get_user_permission_codes', {
      p_user_id: ctx.userId,
      p_organization_id: ctx.organizationId,
    }),
    ctx.supabase
      .from('organization_modules')
      .select('module_code')
      .eq('organization_id', ctx.organizationId)
      .eq('is_active', true),
  ]);

  const settings = settingsRes.data as
    | {
        capability_level: CapabilityLevel;
        enabled_tools: string[] | null;
        undo_window_minutes: number | null;
        bulk_max_rows: number | null;
      }
    | null;

  const codes = Array.isArray(permsRes.data) ? (permsRes.data as string[]) : [];
  const modules = Array.isArray(modulesRes.data)
    ? (modulesRes.data as Array<{ module_code: string | null }>)
        .map((m) => m.module_code)
        .filter((c): c is string => Boolean(c))
    : [];

  return {
    level: settings?.capability_level ?? 'off',
    enabledTools: settings?.enabled_tools ?? null,
    permissions: new Set(codes),
    isAdmin,
    activeModules: new Set(modules),
    undoWindowMinutes: settings?.undo_window_minutes ?? DEFAULTS.undoWindowMinutes,
    bulkMaxRows: settings?.bulk_max_rows ?? DEFAULTS.bulkMaxRows,
  };
}

/**
 * ¿Tiene el usuario alguno de estos permisos?
 *
 * Un administrador de organización los tiene todos: es el mismo criterio que
 * `requireOrgAdmin` usa en el resto del ERP, y evita que el asistente sea más
 * restrictivo que la propia UI que el usuario ya puede abrir.
 */
export function hasAnyPermission(caps: AssistantCapabilities, codes: readonly string[]): boolean {
  if (caps.isAdmin) return true;
  if (codes.length === 0) return true;
  return codes.some((c) => caps.permissions.has(c));
}
