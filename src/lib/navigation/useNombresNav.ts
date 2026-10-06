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
import { claveGrupo, clavePagina, moduloPorCodigo, type PaginaNav } from './catalog';

export interface NombresNav {
  pagina: (p: Pick<PaginaNav, 'href' | 'nombre'>) => string;
  grupo: (grupo: string) => string;
  /** Línea de ayuda de la página (`nav.descripciones.*`), o `undefined` si no tiene. */
  descripcion: (p: Pick<PaginaNav, 'href' | 'descripcion'>) => string | undefined;
  /**
   * Nombre de un módulo por su código de base de datos, el MISMO que pinta el
   * menú lateral (`nav.<etiqueta>` del catálogo). `null` si el código no es un
   * módulo del catálogo: quien llama decide el respaldo.
   */
  modulo: (codigo: string) => string | null;
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

  const descripcion = useCallback(
    (p: Pick<PaginaNav, 'href' | 'descripcion'>) => {
      if (!p.descripcion) return undefined;
      const clave = `descripciones.${clavePagina(p.href)}`;
      return t.has(clave) ? t(clave) : p.descripcion;
    },
    [t]
  );

  const modulo = useCallback(
    (codigo: string) => {
      const m = moduloPorCodigo(codigo);
      return m && t.has(m.etiqueta) ? t(m.etiqueta) : null;
    },
    [t]
  );

  return useMemo(() => ({ pagina, grupo, descripcion, modulo }), [pagina, grupo, descripcion, modulo]);
}
