/**
 * Estilos listos. `actual` no escribe perillas: la tienda sigue igual.
 * Los demás son un paquete de tokens; lo que el usuario cambie después queda encima.
 */

export interface PresetDiseno {
  id: string;
  tokens: Record<string, unknown>;
  headerLayout: string | null;
}

export const PRESETS_DISENO: readonly PresetDiseno[] = [
  { id: 'actual', tokens: {}, headerLayout: null },
  {
    id: 'comercio_vibrante',
    headerLayout: 'comercio',
    tokens: {
      radio: { mode: 'value', value: 'redondeado' },
      densidad: { mode: 'value', value: 'compacta' },
      sombra: { mode: 'value', value: 'suave' },
      borde: { mode: 'value', value: 'fino' },
      boton: { forma: { mode: 'value', value: 'pildora' }, relleno: { mode: 'value', value: 'solido' }, tamano: { mode: 'value', value: 'm' } },
      tipografia: { par: { mode: 'value', value: 'nunito_nunito' }, escala: { mode: 'value', value: 'grande' } },
    },
  },
  {
    id: 'minimal_premium',
    headerLayout: 'transparente_centrado',
    tokens: {
      radio: { mode: 'value', value: 'sutil' },
      densidad: { mode: 'value', value: 'amplia' },
      sombra: { mode: 'value', value: 'ninguna' },
      borde: { mode: 'value', value: 'ninguno' },
      boton: { forma: { mode: 'value', value: 'redondeado' }, relleno: { mode: 'value', value: 'fantasma' }, tamano: { mode: 'value', value: 's' }, mayusculas: { mode: 'value', value: true } },
      tipografia: { par: { mode: 'value', value: 'dm_serif_dm_sans' }, escala: { mode: 'value', value: 'editorial' } },
    },
  },
  {
    id: 'editorial',
    headerLayout: 'logo_centro_menu_abajo',
    tokens: {
      radio: { mode: 'value', value: 'ninguno' },
      densidad: { mode: 'value', value: 'amplia' },
      sombra: { mode: 'value', value: 'ninguna' },
      borde: { mode: 'value', value: 'fino' },
      boton: { forma: { mode: 'value', value: 'cuadrado' }, relleno: { mode: 'value', value: 'contorno' } },
      tipografia: { par: { mode: 'value', value: 'fraunces_inter' }, escala: { mode: 'value', value: 'display' } },
    },
  },
  {
    id: 'lujo_oscuro',
    headerLayout: 'solido_negro_menu_centro',
    tokens: {
      radio: { mode: 'value', value: 'ninguno' },
      densidad: { mode: 'value', value: 'amplia' },
      sombra: { mode: 'value', value: 'ninguna' },
      borde: { mode: 'value', value: 'fino' },
      boton: { forma: { mode: 'value', value: 'cuadrado' }, relleno: { mode: 'value', value: 'contorno' }, mayusculas: { mode: 'value', value: true } },
      tipografia: { par: { mode: 'value', value: 'cormorant_montserrat' }, escala: { mode: 'value', value: 'editorial' }, estiloTitulos: { mode: 'value', value: 'mayusculas' } },
    },
  },
  {
    id: 'jugueton',
    headerLayout: 'comercio',
    tokens: {
      radio: { mode: 'value', value: 'muy_redondeado' },
      densidad: { mode: 'value', value: 'normal' },
      sombra: { mode: 'value', value: 'dura' },
      borde: { mode: 'value', value: 'marcado' },
      boton: { forma: { mode: 'value', value: 'pildora' }, relleno: { mode: 'value', value: 'sombra_dura' }, tamano: { mode: 'value', value: 'l' } },
      tipografia: { par: { mode: 'value', value: 'bricolage_inter' }, escala: { mode: 'value', value: 'grande' } },
    },
  },
  {
    id: 'natural_suave',
    headerLayout: 'clasico',
    tokens: {
      radio: { mode: 'value', value: 'suave' },
      densidad: { mode: 'value', value: 'normal' },
      sombra: { mode: 'value', value: 'suave' },
      borde: { mode: 'value', value: 'ninguno' },
      boton: { forma: { mode: 'value', value: 'pildora' }, relleno: { mode: 'value', value: 'contorno' } },
      tipografia: { par: { mode: 'value', value: 'playfair_lato' }, escala: { mode: 'value', value: 'grande' } },
    },
  },
  {
    id: 'tecnico',
    headerLayout: 'solido_negro_menu_centro',
    tokens: {
      radio: { mode: 'value', value: 'sutil' },
      densidad: { mode: 'value', value: 'compacta' },
      sombra: { mode: 'value', value: 'ninguna' },
      borde: { mode: 'value', value: 'fino' },
      boton: { forma: { mode: 'value', value: 'cuadrado' }, relleno: { mode: 'value', value: 'solido' } },
      tipografia: { par: { mode: 'value', value: 'space_grotesk_inter' }, escala: { mode: 'value', value: 'normal' } },
    },
  },
];

export function presetDisenoPorId(id: string | null | undefined): PresetDiseno {
  return PRESETS_DISENO.find((p) => p.id === id) ?? PRESETS_DISENO[0];
}
