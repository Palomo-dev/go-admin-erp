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
import type { GiroSitio } from '@/lib/website/onboardingSitio';
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
