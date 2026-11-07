/**
 * «Botones de las secciones» de Estilo del sitio (Figma P2, nota «el mismo control sirve para el
 * segundo botón y para los botones de las secciones», 2026-11-07). Puro, sin React ni Supabase.
 *
 * Dónde se guarda:
 * - Forma, relleno y tamaño en `tema.tokens.boton` (`forma`, `relleno`, `tamano`), con el formato de
 *   campo de los tokens (`{ mode: 'value', value }`, como los presets de `presetsDiseno.ts`).
 * - El interruptor `buttons_theme_active` en `shell.header.opciones` (contrato de
 *   `mapeoAjustes.ts`, `porDefecto: false`). Sin él encendido el sitio NO pinta esos tokens: 9 de
 *   los 15 sitios V2 publicados ya los guardan por un preset y no deben cambiar solos. Por eso
 *   tocar forma, relleno o tamaño lo enciende, y «Volver a lo de hoy» lo apaga sin borrar los
 *   tokens (son del preset).
 * - Mayúsculas en `tema.tokens.boton.mayusculas` y su propio interruptor ya existente,
 *   `buttons_uppercase_active` (mismo patrón, `variablesMayusculasBoton`). Apagarlas solo apaga el
 *   interruptor: el token del preset queda.
 *
 * Con el interruptor encendido, el relleno de los tokens manda sobre «Estilo de botón»
 * (`tema.estiloBoton`), que sigue existiendo: así lo resuelve el sitio.
 */
import { valorPropio, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { normalizarOpcionShell } from './mapeoAjustes';
import { valorCampo } from './valorCampo';

export const FORMAS_BOTON_TEMA = ['cuadrado', 'redondeado', 'pildora'] as const;
export const RELLENOS_BOTON_TEMA = ['solido', 'contorno', 'fantasma', 'sombra_dura'] as const;
export const TAMANOS_BOTON_TEMA = ['s', 'm', 'l'] as const;
export type FormaBotonTema = (typeof FORMAS_BOTON_TEMA)[number];
export type RellenoBotonTema = (typeof RELLENOS_BOTON_TEMA)[number];
export type TamanoBotonTema = (typeof TAMANOS_BOTON_TEMA)[number];

export interface BotonesSecciones {
  /** `buttons_theme_active`: el sitio pinta forma, relleno y tamaño de los tokens. */
  activo: boolean;
  /** Tokens guardados (por el dueño o por un preset); `null` = no hay. */
  forma: FormaBotonTema | null;
  relleno: RellenoBotonTema | null;
  tamano: TamanoBotonTema | null;
  /** Mayúsculas que el sitio pinta hoy: token `true` Y `buttons_uppercase_active`. */
  mayusculas: boolean;
}

export type CambioBotonesSecciones =
  | { forma: FormaBotonTema }
  | { relleno: RellenoBotonTema }
  | { tamano: TamanoBotonTema }
  | { mayusculas: boolean }
  | { volverAHoy: true };

type TokensDoc = NonNullable<DocumentoSitio['tema']['tokens']>;
type BotonDoc = NonNullable<TokensDoc['boton']>;

function deLista<T extends string>(lista: readonly T[], v: unknown): T | null {
  return (lista as readonly unknown[]).includes(v) ? (v as T) : null;
}

export function leerBotonesSecciones(documento: DocumentoSitio | null | undefined): BotonesSecciones {
  const boton = documento?.tema.tokens?.boton;
  const opciones = (documento?.shell.header.opciones ?? {}) as Record<string, unknown>;
  const activa = (k: string) => normalizarOpcionShell(k, opciones[k]) === true;
  return {
    activo: activa('buttons_theme_active'),
    forma: deLista(FORMAS_BOTON_TEMA, valorCampo(boton?.forma)),
    relleno: deLista(RELLENOS_BOTON_TEMA, valorCampo(boton?.relleno)),
    tamano: deLista(TAMANOS_BOTON_TEMA, valorCampo(boton?.tamano)),
    mayusculas: activa('buttons_uppercase_active') && valorCampo(boton?.mayusculas) === true,
  };
}

/** Escribe el cambio en el documento (inmutable). Un valor fuera del contrato no cambia nada. */
export function cambiarBotonesSecciones(documento: DocumentoSitio, cambio: CambioBotonesSecciones): DocumentoSitio {
  const opciones: Record<string, unknown> = { ...documento.shell.header.opciones };
  const conOpciones = (d: DocumentoSitio): DocumentoSitio => ({
    ...d,
    shell: { ...d.shell, header: { ...d.shell.header, opciones } },
  });
  const conBoton = (boton: BotonDoc): DocumentoSitio => ({
    ...documento,
    tema: { ...documento.tema, tokens: { ...(documento.tema.tokens ?? {}), boton } as TokensDoc },
  });
  const botonActual: BotonDoc = { ...(documento.tema.tokens?.boton ?? {}) };

  if ('volverAHoy' in cambio) {
    opciones.buttons_theme_active = false;
    return conOpciones(documento);
  }
  if ('mayusculas' in cambio) {
    if (cambio.mayusculas !== true) {
      // Apagar = solo el interruptor: el token puede ser del preset.
      opciones.buttons_uppercase_active = false;
      return conOpciones(documento);
    }
    opciones.buttons_uppercase_active = true;
    return conOpciones(conBoton({ ...botonActual, mayusculas: valorPropio(true) }));
  }
  let boton: BotonDoc | null = null;
  if ('forma' in cambio) {
    const v = deLista(FORMAS_BOTON_TEMA, cambio.forma);
    if (v) boton = { ...botonActual, forma: valorPropio(v) };
  } else if ('relleno' in cambio) {
    const v = deLista(RELLENOS_BOTON_TEMA, cambio.relleno);
    if (v) boton = { ...botonActual, relleno: valorPropio(v) };
  } else if ('tamano' in cambio) {
    const v = deLista(TAMANOS_BOTON_TEMA, cambio.tamano);
    if (v) boton = { ...botonActual, tamano: valorPropio(v) };
  }
  if (!boton) return documento;
  opciones.buttons_theme_active = true;
  return conOpciones(conBoton(boton));
}

/** Radio de la muestra (px) según la forma; sin tokens activos, el radio del botón de hoy. */
export function radioMuestraBoton(forma: FormaBotonTema | null, radioDeHoy: number): number {
  if (forma === 'pildora') return 9999;
  if (forma === 'cuadrado') return 0;
  if (forma === 'redondeado') return radioDeHoy > 0 && radioDeHoy < 9999 ? radioDeHoy : 8;
  return radioDeHoy;
}
