/**
 * Menú del diálogo de Configuración (Figma pág. 10, sección 12): grupos con
 * encabezado (Organización, Ventas, Clientes y comunicación, Operación,
 * Conexiones y datos) y, dentro, una entrada por módulo o por entrada extra
 * (`ENTRADAS_EXTRA`). Cada entrada lleva sus secciones, que el diálogo pinta
 * como sub-pestañas cuando hay más de una.
 *
 * Puro: recibe SOLO las secciones que el servidor dejó ver (plan + permisos,
 * `useSeccionesPermitidas`), así que una entrada sin secciones visibles no sale
 * y un grupo vacío tampoco. Nada de listas cableadas: todo sale de los registros.
 */
import type { LucideIcon } from 'lucide-react';
import { CONFIG_MODULES, ENTRADAS_EXTRA, GRUPOS_CONFIG, type GrupoConfig } from './configModulesRegistry';
import type { SeccionConfig } from './configSectionsRegistry';

export interface EntradaMenu {
  /** Id del módulo o de la entrada extra. */
  id: string;
  grupo: GrupoConfig;
  icono: LucideIcon;
  /** Secciones visibles de la entrada, en el orden del registro. */
  secciones: SeccionConfig[];
}

export interface GrupoMenu {
  grupo: GrupoConfig;
  entradas: EntradaMenu[];
}

/** Entrada del menú en la que se muestra una sección. */
export function entradaDeSeccion(s: Pick<SeccionConfig, 'modulo' | 'entrada'>): string {
  return s.entrada ?? s.modulo;
}

interface Definicion {
  id: string;
  grupo: GrupoConfig;
  icono: LucideIcon;
}

/** Entradas en orden: módulos del registro y, tras cada una, las extra que van después. */
function definicionesOrdenadas(): Definicion[] {
  const salida: Definicion[] = [];
  const colocar = (id: string) => {
    for (const extra of ENTRADAS_EXTRA.filter((e) => e.despuesDe === id)) {
      salida.push({ id: extra.id, grupo: extra.grupo, icono: extra.icon });
      colocar(extra.id);
    }
  };
  for (const m of CONFIG_MODULES) {
    salida.push({ id: m.id, grupo: m.grupo, icono: m.icon });
    colocar(m.id);
  }
  return salida;
}

export function construirMenu(secciones: readonly SeccionConfig[]): GrupoMenu[] {
  const porEntrada = new Map<string, SeccionConfig[]>();
  for (const s of secciones) {
    const id = entradaDeSeccion(s);
    porEntrada.set(id, [...(porEntrada.get(id) ?? []), s]);
  }
  const entradas: EntradaMenu[] = definicionesOrdenadas()
    .map((d) => ({ ...d, secciones: porEntrada.get(d.id) ?? [] }))
    .filter((e) => e.secciones.length > 0);
  return GRUPOS_CONFIG.map((grupo) => ({ grupo, entradas: entradas.filter((e) => e.grupo === grupo) })).filter((g) => g.entradas.length > 0);
}

/** Entradas del menú en orden plano (para la navegación con flechas). */
export function entradasPlanas(menu: readonly GrupoMenu[]): EntradaMenu[] {
  return menu.flatMap((g) => g.entradas);
}

/** Entrada que contiene una sección, si es visible. */
export function entradaConSeccion(menu: readonly GrupoMenu[], seccionId: string): EntradaMenu | undefined {
  return entradasPlanas(menu).find((e) => e.secciones.some((s) => s.id === seccionId));
}
