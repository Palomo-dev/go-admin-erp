/**
 * Perillas combinables del tema. Ausentes = el sitio de hoy: no se emite ninguna
 * variable `--gw-*` y los componentes siguen con sus clases fijas.
 */

export const RADIOS_TOKEN = {
  ninguno: '0px',
  sutil: '4px',
  suave: '8px',
  redondeado: '16px',
  muy_redondeado: '24px',
  pildora: '999px',
} as const;

export const DENSIDAD_TOKEN = { compacta: '0.75', normal: '1', amplia: '1.35' } as const;

export const SOMBRAS_TOKEN = {
  ninguna: 'none',
  suave: '0 1px 2px rgba(0,0,0,.06)',
  media: '0 4px 12px rgba(0,0,0,.08)',
  marcada: '0 12px 28px rgba(0,0,0,.14)',
  dura: '4px 4px 0 #111111',
} as const;

export const PARES_TIPOGRAFICOS = {
  inter_inter: { titulos: 'Inter', cuerpo: 'Inter' },
  fraunces_inter: { titulos: 'Fraunces', cuerpo: 'Inter' },
  playfair_lato: { titulos: 'Playfair Display', cuerpo: 'Lato' },
  space_grotesk_inter: { titulos: 'Space Grotesk', cuerpo: 'Inter' },
  nunito_nunito: { titulos: 'Nunito', cuerpo: 'Nunito' },
  cormorant_montserrat: { titulos: 'Cormorant Garamond', cuerpo: 'Montserrat' },
  dm_serif_dm_sans: { titulos: 'DM Serif Display', cuerpo: 'DM Sans' },
  bricolage_inter: { titulos: 'Bricolage Grotesque', cuerpo: 'Inter' },
} as const;

export type ParTipografico = keyof typeof PARES_TIPOGRAFICOS;

type Campo<T> = { mode: 'value'; value: T } | { mode: 'clear' } | undefined;

function valor<T>(campo: Campo<T> | null | undefined): T | undefined {
  if (!campo || campo.mode !== 'value') return undefined;
  return campo.value;
}

export interface TokensCrudos {
  radio?: Campo<keyof typeof RADIOS_TOKEN>;
  densidad?: Campo<keyof typeof DENSIDAD_TOKEN>;
  sombra?: Campo<keyof typeof SOMBRAS_TOKEN>;
  borde?: Campo<'ninguno' | 'fino' | 'marcado'>;
  boton?: {
    forma?: Campo<'cuadrado' | 'redondeado' | 'pildora'>;
    relleno?: Campo<'solido' | 'contorno' | 'fantasma' | 'sombra_dura'>;
    tamano?: Campo<'s' | 'm' | 'l'>;
    mayusculas?: Campo<boolean>;
  };
  iconos?: { trazo?: Campo<'fino' | 'normal' | 'grueso'>; relleno?: Campo<boolean> };
  tipografia?: { par?: Campo<ParTipografico>; escala?: Campo<'normal' | 'grande' | 'editorial' | 'display'> };
  hover?: Campo<'ninguno' | 'sutil' | 'expresivo'>;
}

/** Variables CSS solo de lo que la tienda eligió. Vacío = no hay perillas. */
export function variablesDeTokens(tokens: TokensCrudos | null | undefined): Record<string, string> {
  if (!tokens) return {};
  const vars: Record<string, string> = {};
  const radio = valor(tokens.radio);
  if (radio && radio in RADIOS_TOKEN) {
    vars['--gw-radius-card'] = RADIOS_TOKEN[radio];
    vars['--gw-radius-image'] = RADIOS_TOKEN[radio];
    const forma = valor(tokens.boton?.forma);
    vars['--gw-btn-radius'] = forma === 'pildora' || radio === 'pildora' ? '999px' : forma === 'cuadrado' ? '0px' : RADIOS_TOKEN[radio];
  }
  const densidad = valor(tokens.densidad);
  if (densidad && densidad in DENSIDAD_TOKEN) vars['--gw-density'] = DENSIDAD_TOKEN[densidad];
  const sombra = valor(tokens.sombra);
  if (sombra && sombra in SOMBRAS_TOKEN) vars['--gw-shadow-card'] = SOMBRAS_TOKEN[sombra];
  const borde = valor(tokens.borde);
  if (borde === 'fino') vars['--gw-border-width'] = '1px';
  if (borde === 'marcado') vars['--gw-border-width'] = '2px';
  if (borde === 'ninguno') vars['--gw-border-width'] = '0px';
  const par = valor(tokens.tipografia?.par);
  if (par && par in PARES_TIPOGRAFICOS) {
    vars['--gw-font-display'] = `'${PARES_TIPOGRAFICOS[par].titulos}'`;
    vars['--font-heading'] = `'${PARES_TIPOGRAFICOS[par].titulos}'`;
    vars['--font-body'] = `'${PARES_TIPOGRAFICOS[par].cuerpo}'`;
  }
  const escala = valor(tokens.tipografia?.escala);
  if (escala === 'grande') vars['--gw-h1'] = '64px';
  if (escala === 'editorial') vars['--gw-h1'] = '88px';
  if (escala === 'display') vars['--gw-h1'] = 'clamp(64px, 10vw, 120px)';
  if (escala === 'normal') vars['--gw-h1'] = '48px';
  const trazo = valor(tokens.iconos?.trazo);
  if (trazo === 'fino') vars['--gw-icon-stroke'] = '1.5';
  if (trazo === 'normal') vars['--gw-icon-stroke'] = '2';
  if (trazo === 'grueso') vars['--gw-icon-stroke'] = '2.5';
  return vars;
}

/** Familias de Google Fonts que pide un par, para no dejar la variable sin archivo. */
export function familiasDePar(par: string | undefined): string[] {
  if (!par || !(par in PARES_TIPOGRAFICOS)) return [];
  const p = PARES_TIPOGRAFICOS[par as ParTipografico];
  return p.titulos === p.cuerpo ? [p.titulos] : [p.titulos, p.cuerpo];
}
