/**
 * El menú que ve una persona, resuelto EN EL SERVIDOR con el cliente de su
 * sesión: módulos activos de la organización (`organization_modules`), páginas
 * apagadas (`organization_module_pages`) y restricciones del cargo, pasados por
 * la misma regla pura del sidebar (`filtrarNavegacion`).
 *
 * Lo comparten el buscador global (qué páginas puede ofrecer) y el inicio
 * (qué módulos puede resumir y a dónde lleva «Ver módulo»). Nada de listas
 * cableadas de módulos o rutas.
 *
 * Falla CERRADO: si no se pueden leer los módulos, lanza; quien llama decide
 * (el buscador y el inicio no ofrecen nada que no sepan que se puede ver).
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { moduleManagementService } from '@/lib/services/moduleManagementService';
import { jobPositionModuleAccessService } from '@/lib/services/jobPositionModuleAccessService';
import { filtrarNavegacion, type SeccionVisible } from './filtrar';

type Contexto = Pick<ServerOrgContext, 'userId' | 'organizationId' | 'supabase'>;

export async function seccionesVisiblesServidor(ctx: Contexto): Promise<SeccionVisible[]> {
  const db = ctx.supabase;
  const [modulos, paginasOcultas, cargo] = await Promise.all([
    moduleManagementService.getActiveModules(ctx.organizationId, db),
    moduleManagementService.getHiddenModulePages(ctx.organizationId, db),
    jobPositionModuleAccessService.getUserAccess(ctx.userId, ctx.organizationId, db),
  ]);
  return filtrarNavegacion({
    modulosActivos: modulos.map((m) => m.code),
    paginasOcultas,
    modulosCargo: cargo.visibleModules,
    paginasCargo: cargo.visiblePages,
    // Las páginas que piden capacidades (bandeja de notificaciones) no
    // respaldan ningún módulo del inicio ni grupo del buscador.
    capacidades: new Set(),
  });
}
