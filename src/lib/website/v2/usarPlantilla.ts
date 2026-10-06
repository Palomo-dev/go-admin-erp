/**
 * «Usar esta plantilla › Solo estilo» (Figma A/06c): aplica a un borrador V2 el ESTILO de una
 * plantilla del catálogo —colores, fuentes, tokens y `plantillaBase`— y conserva todo el contenido:
 * páginas, secciones (en su orden), menús, encabezado, pie, identidad y SEO. Puro e inmutable: el
 * resultado se guarda con `useSitioV2().guardar` (compare-and-swap por versión; la API valida el
 * contrato y el permiso `website.sites.edit` en la base).
 *
 * Antes también reordenaba Inicio según la plantilla y dejaba al frente las secciones que ella
 * nombraba: en un sitio importado del viejo, Inicio arrancaba con «Nuestro Menú» y la portada
 * quedaba tercera (org 140, 2026-10-06). La estructura nueva es la otra opción del diálogo,
 * «Plantilla completa» (`plantillaCompleta.ts`), que deja lo anterior en el historial.
 */
import { valorPropio, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import type { PlantillaCatalogo } from '@/lib/website/contrato/catalogoPlantillas';
import { escribirEstilo } from './tokensEstilo';

/**
 * Solo el estilo de la plantilla. Lo comparten «Solo estilo» y «Plantilla completa». `extendidos`
 * decide si se escriben los tokens nuevos del contrato (ver `tokensEstilo.ts`).
 */
export function aplicarEstiloPlantilla(documento: DocumentoSitio, plantilla: PlantillaCatalogo, extendidos: boolean): DocumentoSitio {
  const conEstilo = escribirEstilo(documento, { ...plantilla.estilo, preset: plantilla.id }, extendidos);
  return { ...conEstilo, tema: { ...conEstilo.tema, plantillaBase: valorPropio(plantilla.base) } };
}
