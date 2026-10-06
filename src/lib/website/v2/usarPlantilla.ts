/**
 * «Usar esta plantilla» (Figma A/06c, decisión A/06h): aplica a un borrador V2 el
 * estilo y la ESTRUCTURA de Inicio de una plantilla del catálogo, conservando el
 * contenido. Puro e inmutable: el resultado se guarda con `useSitioV2().guardar`
 * (compare-and-swap por versión; la API valida el contrato y el permiso
 * `website.sites.edit` en la base). Sustituye a `resetToTemplate` de
 * `websiteSettingsService`, que pisaba colores y fuentes y no conservaba nada.
 *
 * Regla de fusión de Inicio («cambian el estilo, el orden y las variantes de las
 * secciones; tus textos, fotos, carta y páginas se conservan»):
 * 1. Por cada sección de la plantilla, en su orden, se toma la primera sección
 *    de Inicio del mismo tipo que aún no se usó: va en esa posición y adopta la
 *    variante de la plantilla. Su contenido, diseño, visibilidad e id no cambian.
 * 2. Las secciones de Inicio que la plantilla no tiene se conservan, en su orden
 *    original, después de las anteriores. Nunca se borra ninguna.
 * 3. Las secciones de la plantilla que el sitio no tiene NO se crean: no hay
 *    contenido que ponerles (se añaden desde el editor).
 * Las demás páginas, los menús, la identidad, el SEO y el contenido no se tocan.
 */
import { valorPropio, type DocumentoSitio, type SeccionSitio } from '@/lib/website/contrato/documentoSitio';
import type { PlantillaCatalogo } from '@/lib/website/contrato/catalogoPlantillas';
import { esInicio } from '@/components/sitio-web/paginas/tipoPagina';
import { escribirEstilo } from './tokensEstilo';

export interface ResultadoUsarPlantilla {
  documento: DocumentoSitio;
  /** Secciones de Inicio que cambiaron de lugar o de variante. */
  seccionesAjustadas: number;
  /** Secciones de la plantilla que el sitio aún no tiene (se pueden añadir en el editor). */
  seccionesSinContenido: number;
}

/** Ordena y ajusta las secciones de Inicio según la plantilla (reglas 1-3). */
export function fusionarInicio(
  secciones: readonly SeccionSitio[],
  estructura: PlantillaCatalogo['inicio'],
): { secciones: SeccionSitio[]; ajustadas: number; faltantes: number } {
  const usadas = new Set<number>();
  const ordenadas: SeccionSitio[] = [];
  let faltantes = 0;
  estructura.forEach(([tipo, variante]) => {
    const i = secciones.findIndex((s, j) => !usadas.has(j) && s.tipo === tipo);
    if (i < 0) {
      faltantes += 1;
      return;
    }
    usadas.add(i);
    ordenadas.push(secciones[i].variante === variante ? secciones[i] : { ...secciones[i], variante });
  });
  const resto = secciones.filter((_, j) => !usadas.has(j));
  const resultado = [...ordenadas, ...resto];
  const ajustadas = resultado.filter((s, j) => s !== secciones[j]).length;
  return { secciones: resultado, ajustadas, faltantes };
}

/**
 * Estilo + estructura de la plantilla sobre el borrador. `extendidos` decide si
 * se escriben los tokens nuevos del contrato (ver `tokensEstilo.ts`).
 */
export function usarPlantilla(documento: DocumentoSitio, plantilla: PlantillaCatalogo, extendidos: boolean): ResultadoUsarPlantilla {
  const conEstilo = escribirEstilo(documento, { ...plantilla.estilo, preset: plantilla.id }, extendidos);
  const tema = { ...conEstilo.tema, plantillaBase: valorPropio(plantilla.base) };
  let ajustadas = 0;
  let faltantes = plantilla.inicio.length;
  let tocada = false;
  const paginas = conEstilo.paginas.map((pagina) => {
    if (tocada || !esInicio(pagina)) return pagina;
    tocada = true;
    const r = fusionarInicio(pagina.secciones, plantilla.inicio);
    ajustadas = r.ajustadas;
    faltantes = r.faltantes;
    return r.ajustadas > 0 ? { ...pagina, secciones: r.secciones } : pagina;
  });
  return { documento: { ...conEstilo, tema, paginas }, seccionesAjustadas: ajustadas, seccionesSinContenido: faltantes };
}
