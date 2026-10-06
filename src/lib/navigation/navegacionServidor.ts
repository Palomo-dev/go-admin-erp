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
import { moduleManagementService } from '@/lib/services/moduleManagementService';
import { jobPositionModuleAccessService } from '@/lib/services/jobPositionModuleAccessService';
import { CATALOGO_NAV, type CapacidadNav } from './catalog';
import { capacidadesNavServidor, type ContextoCapacidades } from './capacidadesNav.server';
import { filtrarNavegacion, type SeccionVisible } from './filtrar';

type Contexto = ContextoCapacidades;

/** Capacidades que exigen las páginas de los módulos activos (las demás no se consultan). */
function capacidadesPedidas(modulosActivos: readonly string[]): CapacidadNav[] {
  return CATALOGO_NAV.filter((m) => m.codigo === null || modulosActivos.includes(m.codigo)).flatMap((m) =>
    m.paginas.flatMap((p) => (p.requiere ? [p.requiere] : []))
  );
}

export async function seccionesVisiblesServidor(ctx: Contexto): Promise<SeccionVisible[]> {
  const db = ctx.supabase;
  const [modulos, paginasOcultas, cargo] = await Promise.all([
    moduleManagementService.getActiveModules(ctx.organizationId, db),
    moduleManagementService.getHiddenModulePages(ctx.organizationId, db),
    jobPositionModuleAccessService.getUserAccess(ctx.userId, ctx.organizationId, db),
  ]);
  const modulosActivos = modulos.map((m) => m.code);
  // Las mismas capacidades que el menú del navegador (`/api/me/capacidades`):
  // una página con `requiere` («Analítica», «Sedes en la web») se ve igual
  // aquí, en el buscador y en el inicio.
  const capacidades = await capacidadesNavServidor(ctx, capacidadesPedidas(modulosActivos));
  return filtrarNavegacion({
    modulosActivos,
    paginasOcultas,
    modulosCargo: cargo.visibleModules,
    paginasCargo: cargo.visiblePages,
    capacidades,
  });
}
