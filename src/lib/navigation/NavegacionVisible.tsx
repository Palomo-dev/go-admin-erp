'use client';

/**
 * Lo que el menú deja ver a esta persona, compartido con las páginas.
 *
 * `AppLayout` ya calcula `filtrarNavegacion()` (módulos y páginas activos de la
 * organización, acceso del cargo y capacidades del servidor) para el sidebar y
 * el buscador. Las pestañas de un módulo (p. ej. las del Chat) deben respetar
 * exactamente lo mismo, así que leen ese resultado de aquí en vez de volver a
 * consultar módulos y cargos por su cuenta (CLAUDE.md, regla 7).
 *
 * Fuera del shell (tests, páginas públicas) no hay proveedor: `usePaginasModulo`
 * devuelve `null` y quien llama decide el respaldo.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { SeccionVisible } from './filtrar';
import type { PaginaNav } from './catalog';

export interface NavegacionVisible {
  secciones: SeccionVisible[];
  /** Aún no se conocen los módulos de la organización o el acceso del cargo. */
  cargando: boolean;
}

const NavegacionVisibleContext = createContext<NavegacionVisible | null>(null);

export function NavegacionVisibleProvider({ valor, children }: { valor: NavegacionVisible; children: ReactNode }) {
  return <NavegacionVisibleContext.Provider value={valor}>{children}</NavegacionVisibleContext.Provider>;
}

export function useNavegacionVisible(): NavegacionVisible | null {
  return useContext(NavegacionVisibleContext);
}

/**
 * Páginas visibles de un módulo, en el orden del catálogo. `null` si no hay
 * proveedor o si la navegación todavía está cargando; `[]` si el módulo no
 * tiene ninguna página visible.
 */
export function usePaginasModulo(codigo: string): PaginaNav[] | null {
  const nav = useNavegacionVisible();
  return useMemo(() => {
    if (!nav || nav.cargando) return null;
    for (const s of nav.secciones) {
      const m = s.modulos.find((x) => x.modulo.codigo === codigo);
      if (m) return m.paginas;
    }
    return [];
  }, [nav, codigo]);
}
