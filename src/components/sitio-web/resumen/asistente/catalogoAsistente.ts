'use client';

/**
 * Catálogo de plantillas y estilos que muestran el asistente (A/03b-03c) y el
 * héroe de «primera vez» (A/02b). Fuente: `TEMPLATE_PRESETS` de
 * `websiteSettingsService` (el catálogo real del ERP, solo lectura), adaptado a
 * las props de `TemplateCard` y `StylePresetCard`.
 *
 * Es un adaptador, no un catálogo nuevo: cuando el área Diseño publique su
 * catálogo de plantillas (con secciones y subgiros, Figma A/06b), este archivo
 * pasa a leerlo de allí sin cambiar las pantallas.
 */
import { TEMPLATE_PRESETS, type TemplatePresetInfo } from '@/lib/services/websiteSettingsService';
import type { MuestraEstilo } from '../../ui/StylePresetCard';
import type { TemaVistaSitio } from '../../ui/temaVistaSitio';
import { GIROS_SITIO, type GiroSitio } from '@/lib/website/onboardingSitio';
import type { PlantillaCatalogo } from '@/lib/website/contrato/catalogoPlantillas';
import { secundarioDe } from '@/lib/website/v2/tokensEstilo';
import { CATALOGO_SITIO, muestraDeEstilo, nombreFuentes, temaVistaDeEstilo } from '../../diseno/catalogo';
import { esPlantillaTiendaNueva } from '../../diseno/plantillasTienda';
import type { PresetTema } from '@/lib/website/v2/temaDesdePreset';
import { fondoDelModo } from '@/lib/website/v2/temaDesdePreset';
import { contraste } from '@/lib/utils/contrasteColor';

const GIRO_DE_NEGOCIO: Record<string, GiroSitio> = {
  restaurant: 'restaurante',
  retail: 'tienda',
  hotel: 'hotel',
  services: 'servicios',
  gym: 'gimnasio',
};

export interface PlantillaAsistente {
  id: string;
  nombre: string;
  descripcion: string;
  giro: GiroSitio;
  porDefecto: boolean;
  /** Par tipográfico «Títulos · Texto». */
  fuentes: string;
  preset: PresetTema;
  muestra: MuestraEstilo;
  tema: TemaVistaSitio;
}

/** Texto que se lee sobre el color (negro o blanco, el de más contraste). */
export function textoSobre(color: string): string {
  const negro = contraste(color, '#111111') ?? 0;
  const blanco = contraste(color, '#FFFFFF') ?? 0;
  return negro >= blanco ? '#111111' : '#FFFFFF';
}

function familia(nombre: string): string {
  return `'${nombre.replace(/'/g, '')}', sans-serif`;
}

export function plantillaDesdePreset(p: TemplatePresetInfo): PlantillaAsistente {
  const oscuro = p.theme_mode === 'dark';
  const fondo = fondoDelModo(p.theme_mode, p.colors.secondary);
  const texto = oscuro ? '#FFFFFF' : p.colors.secondary;
  const muestra: MuestraEstilo = {
    fondo,
    texto,
    acento: p.colors.primary,
    textoAcento: textoSobre(p.colors.primary),
    fuenteTitulos: familia(p.fonts.heading),
    fuenteTexto: familia(p.fonts.body),
    radioBoton: 6,
    puntos: [texto, p.colors.primary, oscuro ? '#2A2A2A' : '#E5E7EB'],
  };
  return {
    id: p.id,
    nombre: p.name,
    descripcion: p.description,
    giro: GIRO_DE_NEGOCIO[p.business_type] ?? 'otro',
    porDefecto: p.is_default,
    fuentes: `${p.fonts.heading} · ${p.fonts.body}`,
    preset: {
      id: p.id,
      modo: p.theme_mode,
      primario: p.colors.primary,
      secundario: p.colors.secondary,
      fuenteTitulos: p.fonts.heading,
      fuenteCuerpo: p.fonts.body,
    },
    muestra,
    tema: {
      ...muestra,
      fondoSecundario: oscuro ? '#1C1C1C' : '#F5F5F5',
      textoSuave: oscuro ? '#A3A3A3' : '#6B7280',
      linea: oscuro ? '#2A2A2A' : '#E5E7EB',
    },
  };
}

export const PLANTILLAS_ASISTENTE: readonly PlantillaAsistente[] = TEMPLATE_PRESETS.map(plantillaDesdePreset);

export function plantillaPorId(id: string | null | undefined): PlantillaAsistente | null {
  return id ? PLANTILLAS_ASISTENTE.find((p) => p.id === id) ?? null : null;
}

/** Las del giro primero (la de por defecto encabeza), luego el resto; `'todas'` no filtra. */
export function plantillasDelGiro(giro: GiroSitio | 'todas', lista: readonly PlantillaAsistente[] = PLANTILLAS_ASISTENTE): PlantillaAsistente[] {
  if (giro === 'todas') return [...lista];
  return lista.filter((p) => p.giro === giro).sort((a, b) => Number(b.porDefecto) - Number(a.porDefecto));
}

/** Giros con al menos una plantilla, para los filtros del paso 2. */
export function girosConPlantillas(lista: readonly PlantillaAsistente[] = PLANTILLAS_ASISTENTE): GiroSitio[] {
  return Array.from(new Set(lista.map((p) => p.giro)));
}

// ─── Paso 2 con el catálogo real (Figma «Asistente / Paso 2 — todas a la vista», 2026-11-22) ──
//
// El paso 2 ya no ofrece los 28 presets de color: muestra las plantillas del catálogo de Diseño
// (`CATALOGO_SITIO`), con su Inicio diseñado como miniatura, y al elegir una se arma el sitio
// con ella (la misma «Plantilla completa» de Diseño). El paso 3 sigue con los presets de estilo.

/** Plantilla del paso 2: la del catálogo, con lo que pintan las tarjetas y el paso 3. */
export interface PlantillaCatalogoAsistente extends PlantillaAsistente {
  /** La del catálogo (`plantillaCompleta` y «Solo estilo» la necesitan entera). */
  catalogo: PlantillaCatalogo;
  /** Las 7 de tienda de 2026-11: insignia «Nueva». */
  nueva: boolean;
}

function giroDelAsistente(giro: PlantillaCatalogo['giro']): GiroSitio {
  return (GIROS_SITIO as readonly string[]).includes(giro) ? (giro as GiroSitio) : 'otro';
}

export function plantillaDesdeCatalogo(p: PlantillaCatalogo): PlantillaCatalogoAsistente {
  const e = p.estilo;
  const muestra = muestraDeEstilo(e);
  return {
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    giro: giroDelAsistente(p.giro),
    porDefecto: p.porDefecto,
    fuentes: nombreFuentes(e),
    preset: {
      id: p.id,
      modo: e.modo,
      primario: e.acento,
      secundario: e.secundario ?? secundarioDe(e),
      fuenteTitulos: e.fuenteTitulos,
      fuenteCuerpo: e.fuenteCuerpo,
    },
    muestra,
    tema: temaVistaDeEstilo(e),
    catalogo: p,
    nueva: esPlantillaTiendaNueva(p.id),
  };
}

/**
 * Orden del paso 2 dentro de un giro: en tienda, las 4 clásicas renovadas primero (la de por
 * defecto encabeza) y después las 7 nuevas en el orden de la galería; en los demás giros, la de
 * por defecto y luego el orden del catálogo.
 */
function ordenDelPaso(a: PlantillaCatalogoAsistente, b: PlantillaCatalogoAsistente): number {
  return Number(a.nueva) - Number(b.nueva) || Number(b.porDefecto) - Number(a.porDefecto);
}

export const PLANTILLAS_CATALOGO_ASISTENTE: readonly PlantillaCatalogoAsistente[] = CATALOGO_SITIO.plantillas.map(plantillaDesdeCatalogo);

/** Las del filtro, en el orden del paso 2; `'todas'` pone primero las del giro del sitio. */
export function plantillasCatalogoDelGiro(
  filtro: GiroSitio | 'todas',
  giroSitio: GiroSitio,
  lista: readonly PlantillaCatalogoAsistente[] = PLANTILLAS_CATALOGO_ASISTENTE,
): PlantillaCatalogoAsistente[] {
  if (filtro !== 'todas') return lista.filter((p) => p.giro === filtro).sort(ordenDelPaso);
  // `sort` es estable: dentro de cada giro se respeta el orden del paso.
  const giros = Array.from(new Set(lista.map((p) => p.giro)));
  const orden = [giroSitio, ...giros.filter((g) => g !== giroSitio)];
  return [...lista].sort((a, b) => orden.indexOf(a.giro) - orden.indexOf(b.giro) || ordenDelPaso(a, b));
}

/**
 * La plantilla del paso 2 a partir de lo guardado: el id del catálogo (lo que guarda el asistente
 * nuevo y `tema.preset`) o, para lo guardado antes, la plantilla del sitio que lo traía de base.
 */
export function plantillaCatalogoPorId(
  id: string | null | undefined,
  lista: readonly PlantillaCatalogoAsistente[] = PLANTILLAS_CATALOGO_ASISTENTE,
): PlantillaCatalogoAsistente | null {
  if (!id) return null;
  return lista.find((p) => p.id === id) ?? lista.find((p) => p.catalogo.base === id && p.porDefecto) ?? lista.find((p) => p.catalogo.base === id) ?? null;
}

/**
 * Estilos del paso 3 cuando la plantilla elegida no es uno de los presets: la plantilla va
 * primero («quedarse con el de la plantilla») y después los presets del giro.
 */
export function estilosConPlantilla(
  plantilla: PlantillaAsistente | null,
  giro: GiroSitio,
  lista: readonly PlantillaAsistente[] = PLANTILLAS_ASISTENTE,
): readonly PlantillaAsistente[] | undefined {
  if (!plantilla || lista.some((p) => p.id === plantilla.id)) return undefined;
  // Con el giro del sitio, para que el paso 3 la muestre aunque se haya elegido de otro giro.
  return [{ ...plantilla, giro, porDefecto: true }, ...lista.map((p) => (p.porDefecto ? { ...p, porDefecto: false } : p))];
}
