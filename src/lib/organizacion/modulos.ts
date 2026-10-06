/**
 * Organización › Módulos: qué puede hacer la organización con cada módulo y
 * cómo se agrupan en pantalla.
 *
 * - Los módulos BÁSICOS (`modules.is_core`) van siempre: candado «Incluido
 *   siempre», sin interruptor.
 * - Un módulo opcional se puede encender si el plan lo trae
 *   (`plans.module_config.available_modules`) y queda cupo de módulos: la
 *   misma cuenta que el disparador `validate_module_activation` (tope del plan
 *   menos los básicos activos).
 * - Si el plan no lo trae: «Disponible en el plan X», con X el plan activo más
 *   barato que sí lo incluye; si ninguno, «A medida».
 *
 * Los grupos («verticales») salen de la sección del módulo en el catálogo de
 * navegación (`src/lib/navigation/catalog.ts`): no hay otra lista de módulos.
 */
import { CATALOGO_NAV, SECCIONES, moduloPorCodigo, type CodigoSeccion } from '@/lib/navigation/catalog';

export interface ModuloBase {
  code: string;
  name: string;
  description?: string | null;
  is_core?: boolean | null;
  rank?: number | null;
}

export interface ConfigModulosPlan {
  available_modules?: string[] | null;
}

export interface PlanModulos {
  code: string;
  name: string;
  max_modules: number | null;
  price_cop_month?: number | string | null;
  is_active?: boolean | null;
  is_custom_enterprise?: boolean | null;
  module_config?: ConfigModulosPlan | null;
}

/** Códigos que el catálogo de planes escribe distinto que `modules.code`. */
const ALIAS: Record<string, string> = { transporte: 'transport', gym: 'memberships' };

export function codigoCanonico(codigo: string): string {
  return ALIAS[codigo] ?? codigo;
}

/** ¿El plan trae el módulo? Un plan sin lista (a medida, heredado) no restringe. */
export function planIncluye(plan: PlanModulos | null | undefined, codigo: string): boolean {
  if (!plan) return false;
  const lista = plan.module_config?.available_modules;
  if (plan.is_custom_enterprise || !Array.isArray(lista)) return true;
  const c = codigoCanonico(codigo);
  return lista.some((x) => codigoCanonico(x) === c);
}

/** El plan activo más barato que incluye el módulo (excluye los «a medida»). */
export function planMinimoPara(planes: readonly PlanModulos[], codigo: string): PlanModulos | null {
  const candidatos = planes
    .filter((p) => p.is_active !== false && !p.is_custom_enterprise && Array.isArray(p.module_config?.available_modules))
    .filter((p) => planIncluye(p, codigo))
    .sort((a, b) => Number(a.price_cop_month ?? Infinity) - Number(b.price_cop_month ?? Infinity));
  return candidatos[0] ?? null;
}

export type EstadoModulo =
  | { tipo: 'basico' }
  | { tipo: 'activo' }
  | { tipo: 'disponible' }
  | { tipo: 'limite' }
  | { tipo: 'otroPlan'; plan: string | null };

export interface ContextoModulos {
  modulos: readonly ModuloBase[];
  activos: ReadonlySet<string>;
  plan: PlanModulos | null;
  planes: readonly PlanModulos[];
}

/** Cuántos opcionales caben (tope del plan − básicos activos), `null` = sin tope. */
export function cupoOpcionales(ctx: Pick<ContextoModulos, 'modulos' | 'plan'>): number | null {
  const max = ctx.plan?.max_modules;
  if (max == null) return null;
  const basicos = ctx.modulos.filter((m) => m.is_core).length;
  return Math.max(0, max - basicos);
}

export function opcionalesActivos(ctx: Pick<ContextoModulos, 'modulos' | 'activos'>): number {
  return ctx.modulos.filter((m) => !m.is_core && ctx.activos.has(m.code)).length;
}

export function estadoModulo(m: ModuloBase, ctx: ContextoModulos): EstadoModulo {
  if (m.is_core) return { tipo: 'basico' };
  if (ctx.activos.has(m.code)) return { tipo: 'activo' };
  if (!planIncluye(ctx.plan, m.code)) {
    return { tipo: 'otroPlan', plan: planMinimoPara(ctx.planes, m.code)?.name ?? null };
  }
  const cupo = cupoOpcionales(ctx);
  if (cupo !== null && opcionalesActivos(ctx) >= cupo) return { tipo: 'limite' };
  return { tipo: 'disponible' };
}

export interface GrupoModulos<T extends ModuloBase = ModuloBase> {
  /** `nucleo` para los básicos; si no, la sección del catálogo o `otros`. */
  clave: 'nucleo' | CodigoSeccion | 'otros';
  modulos: T[];
}

function seccionDe(codigo: string): CodigoSeccion | 'otros' {
  return moduloPorCodigo(codigoCanonico(codigo))?.seccion ?? 'otros';
}

/** Básicos primero; luego por sección del menú (Ventas, Gestión, Sistema…); dentro, por `rank`. */
export function agruparPorVertical<T extends ModuloBase>(modulos: readonly T[]): GrupoModulos<T>[] {
  const porRank = [...modulos].sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999) || a.name.localeCompare(b.name, 'es'));
  const grupos: GrupoModulos<T>[] = [{ clave: 'nucleo', modulos: porRank.filter((m) => m.is_core) }];
  const orden: (CodigoSeccion | 'otros')[] = [...SECCIONES.map((s) => s.codigo), 'otros'];
  for (const clave of orden) {
    const lista = porRank.filter((m) => !m.is_core && seccionDe(m.code) === clave);
    if (lista.length) grupos.push({ clave, modulos: lista });
  }
  return grupos.filter((g) => g.modulos.length > 0);
}

/** ¿El catálogo conoce el módulo? (los que no, no tienen páginas que mostrar). */
export function moduloEnCatalogo(codigo: string): boolean {
  return CATALOGO_NAV.some((m) => m.codigo === codigoCanonico(codigo));
}

/** Filtro del buscador: nombre, descripción o nombre de alguna página. */
export function coincideModulo(m: ModuloBase, texto: string, paginas: readonly { name: string }[] = []): boolean {
  const q = texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  if (!q) return true;
  const pajar = `${m.name} ${m.description ?? ''} ${paginas.map((p) => p.name).join(' ')}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return pajar.includes(q);
}
