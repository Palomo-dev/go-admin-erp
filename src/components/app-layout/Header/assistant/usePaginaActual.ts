'use client';

/**
 * Nombre de la página en la que está la persona, en su idioma, para el chip de
 * contexto del composer (Figma `AsistenteContexto` 660:16003) y el encabezado
 * de las sugerencias («Sugerencias para Inicio»).
 *
 * Sale del catálogo de navegación (`rutaActiva`, la misma regla que resalta el
 * menú) y de sus traducciones (`useNombresNav`): nada cableado aquí. `null` si
 * la ruta no corresponde a ninguna página del catálogo.
 */

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { rutaActiva } from '@/lib/navigation/filtrar';
import { useNombresNav } from '@/lib/navigation/useNombresNav';

export function usePaginaActual(): { ruta: string | null; nombre: string | null } {
  const pathname = usePathname();
  const nombres = useNombresNav();
  return useMemo(() => {
    const activa = rutaActiva(pathname);
    const pagina = activa?.pagina ?? activa?.modulo.paginas[0] ?? null;
    return { ruta: pathname ?? null, nombre: pagina ? nombres.pagina(pagina) : null };
  }, [pathname, nombres]);
}
