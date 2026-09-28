'use client';

/**
 * Nombres de página y de grupo del catálogo en el idioma de la persona.
 *
 * El catálogo guarda el nombre en español (`PaginaNav.nombre`, `grupo`) y la
 * traducción vive en `nav.paginas.<clavePagina(href)>` y
 * `nav.grupos.<claveGrupo(grupo)>`. Si falta una clave se muestra el nombre en
 * español en vez de la clave cruda; el test `traducciones.test.ts` impide que
 * eso llegue a producción.
 */
import { useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { claveGrupo, clavePagina, type PaginaNav } from './catalog';

export interface NombresNav {
  pagina: (p: Pick<PaginaNav, 'href' | 'nombre'>) => string;
  grupo: (grupo: string) => string;
}

export function useNombresNav(): NombresNav {
  const t = useTranslations('nav');

  const pagina = useCallback(
    (p: Pick<PaginaNav, 'href' | 'nombre'>) => {
      const clave = `paginas.${clavePagina(p.href)}`;
      return t.has(clave) ? t(clave) : p.nombre;
    },
    [t]
  );

  const grupo = useCallback(
    (g: string) => {
      const clave = `grupos.${claveGrupo(g)}`;
      return t.has(clave) ? t(clave) : g;
    },
    [t]
  );

  return useMemo(() => ({ pagina, grupo }), [pagina, grupo]);
}
