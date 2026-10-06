/**
 * Estilo global del sitio que se edita en Diseño › Estilo (Figma A/06a, A/06g) y
 * en el estilo global del editor (A/05f): UNA lectura y UNA escritura del tema
 * del borrador V2 para las dos pantallas. Puro, sin React ni Supabase.
 *
 * Cómo se guarda en `documento.tema` (decisión A/06h-06i):
 * - «Acento» (el color del botón principal) es `colores.primario`: es la columna
 *   `primary_color` que pinta el sitio público y la que ya escribe el asistente
 *   (`aplicarAcento`). «Fondo» y «Texto» son `colores.fondo` y `colores.texto`.
 * - `colores.secundario` lo fija el estilo (el oscuro del modo: fondo en modo
 *   oscuro, texto en modo claro), como hacen las plantillas del sitio.
 * - Par tipográfico en `tipografia.titulos` y `tipografia.cuerpo`.
 * - `preset`, `radio`, `estiloBoton` y `movimiento` son campos nuevos del
 *   contrato. El lector público de goadmin-websites valida el documento en modo
 *   estricto: si el ERP los escribe antes de que el sitio los acepte, la vista
 *   previa y la revisión dejan de pintarse. Por eso solo se escriben con
 *   `NEXT_PUBLIC_WEBSITE_TOKENS_ESTILO=1` (se activa al desplegar el PR del sitio).
 *
 * Un preset es el punto de partida: los ajustes quedan encima y «Restablecer el
 * preset» los devuelve a los del preset (A/06h).
 */
import { valorPropio, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { contraste, CONTRASTE_AA, normalizarHex } from '@/lib/utils/contrasteColor';
import { valorCampo } from './valorCampo';

export const RADIOS_SITIO = [0, 4, 12, 24] as const;
export type RadioSitio = (typeof RADIOS_SITIO)[number];

export const ESTILOS_BOTON = ['solido', 'contorno', 'pastilla', 'sombra_dura'] as const;
export type EstiloBoton = (typeof ESTILOS_BOTON)[number];

export const MOVIMIENTOS_SITIO = ['ninguno', 'bajo', 'medio', 'alto'] as const;
export type MovimientoSitio = (typeof MOVIMIENTOS_SITIO)[number];

export type ModoSitio = 'light' | 'dark';

/** Lo que define un estilo (preset del catálogo) y lo que edita el panel. */
export interface TokensEstilo {
  modo: ModoSitio;
  fondo: string;
  texto: string;
  /** Botón principal y enlaces del sitio (`colores.primario`). */
  acento: string;
  fuenteTitulos: string;
  fuenteCuerpo: string;
  radio: RadioSitio;
  estiloBoton: EstiloBoton;
  movimiento: MovimientoSitio;
}

/** Estilo leído del borrador: tokens efectivos + id del preset del que parte (si se sabe). */
export interface EstiloEditable extends TokensEstilo {
  preset: string | null;
}

/**
 * ¿El sitio público ya acepta `preset`, `radio`, `estiloBoton` y `movimiento`?
 * Lectura literal de la variable (Next la incrusta en el navegador solo así).
 */
export function tokensExtendidosDisponibles(): boolean {
  return process.env.NEXT_PUBLIC_WEBSITE_TOKENS_ESTILO === '1';
}

/** El oscuro del estilo, que el sitio pinta como `secondary_color`. */
export function secundarioDe(t: Pick<TokensEstilo, 'modo' | 'fondo' | 'texto'>): string {
  return t.modo === 'dark' ? t.fondo : t.texto;
}

function deLista<T extends string | number>(lista: readonly T[], valor: unknown): T | null {
  return (lista as readonly unknown[]).includes(valor) ? (valor as T) : null;
}

/**
 * Estilo efectivo del borrador. Lo que el documento no define sale de `base`
 * (el preset del sitio o, si no se sabe, el primero del giro): nunca de un
 * color cableado.
 */
export function leerEstilo(documento: DocumentoSitio | null | undefined, base: TokensEstilo & { id?: string }): EstiloEditable {
  const tema = documento?.tema;
  const color = (c: unknown) => normalizarHex(c);
  return {
    preset: valorCampo(tema?.preset) ?? null,
    modo: valorCampo(tema?.modo) ?? base.modo,
    fondo: color(valorCampo(tema?.colores.fondo)) ?? base.fondo,
    texto: color(valorCampo(tema?.colores.texto)) ?? base.texto,
    acento: color(valorCampo(tema?.colores.primario)) ?? base.acento,
    fuenteTitulos: valorCampo(tema?.tipografia.titulos) ?? base.fuenteTitulos,
    fuenteCuerpo: valorCampo(tema?.tipografia.cuerpo) ?? base.fuenteCuerpo,
    radio: deLista(RADIOS_SITIO, valorCampo(tema?.radio)) ?? base.radio,
    estiloBoton: deLista(ESTILOS_BOTON, valorCampo(tema?.estiloBoton)) ?? base.estiloBoton,
    movimiento: deLista(MOVIMIENTOS_SITIO, valorCampo(tema?.movimiento)) ?? base.movimiento,
  };
}

/**
 * Escribe el estilo en el tema del borrador (inmutable). Con
 * `extendidos=false` no toca `preset`, `radio`, `estiloBoton` ni `movimiento`
 * (ver cabecera). No cambia `plantillaBase`, páginas ni contenido.
 */
export function escribirEstilo(documento: DocumentoSitio, estilo: EstiloEditable, extendidos: boolean): DocumentoSitio {
  const tema = documento.tema;
  const siguiente: DocumentoSitio['tema'] = {
    ...tema,
    modo: valorPropio(estilo.modo),
    colores: {
      ...tema.colores,
      primario: valorPropio(estilo.acento),
      secundario: valorPropio(secundarioDe(estilo)),
      fondo: valorPropio(estilo.fondo),
      texto: valorPropio(estilo.texto),
    },
    tipografia: { ...tema.tipografia, titulos: valorPropio(estilo.fuenteTitulos), cuerpo: valorPropio(estilo.fuenteCuerpo) },
  };
  if (extendidos) {
    if (estilo.preset) siguiente.preset = valorPropio(estilo.preset);
    else delete siguiente.preset;
    siguiente.radio = valorPropio(estilo.radio);
    siguiente.estiloBoton = valorPropio(estilo.estiloBoton);
    siguiente.movimiento = valorPropio(estilo.movimiento);
  }
  return { ...documento, tema: siguiente };
}

/** ¿Cambió algo que se guarda? (para no escribir el borrador sin motivo). */
export function mismoEstilo(a: EstiloEditable, b: EstiloEditable, extendidos: boolean): boolean {
  const base =
    a.modo === b.modo &&
    a.fondo === b.fondo &&
    a.texto === b.texto &&
    a.acento === b.acento &&
    a.fuenteTitulos === b.fuenteTitulos &&
    a.fuenteCuerpo === b.fuenteCuerpo;
  if (!extendidos) return base;
  return base && a.preset === b.preset && a.radio === b.radio && a.estiloBoton === b.estiloBoton && a.movimiento === b.movimiento;
}

/** Contraste del acento contra el fondo (A/06a: «Contraste 2,9:1 con el fondo»). */
export function contrasteAcento(estilo: Pick<TokensEstilo, 'acento' | 'fondo'>): { razon: number | null; cumple: boolean } {
  const razon = contraste(estilo.acento, estilo.fondo);
  return { razon, cumple: razon !== null && razon >= CONTRASTE_AA };
}

/** Texto que se lee sobre el acento (negro o blanco, el de más contraste): «on-accent» calculado, no guardado. */
export function textoSobreAcento(acento: string): string {
  const negro = contraste(acento, '#111111') ?? 0;
  const blanco = contraste(acento, '#FFFFFF') ?? 0;
  return negro >= blanco ? '#111111' : '#FFFFFF';
}

/** Radio del botón en px según el estilo (la píldora es un radio máximo). */
export function radioBoton(t: Pick<TokensEstilo, 'radio' | 'estiloBoton'>): number {
  return t.estiloBoton === 'pastilla' ? 9999 : t.radio;
}

/**
 * Columnas que el sitio aplica EN VIVO en la vista previa sin guardar
 * (`goadmin:settings`, `CLAVES_TEMA_VIVO` de `ajustesVivos.ts`).
 */
export function ajustesVivosDeEstilo(t: TokensEstilo): Record<string, unknown> {
  return {
    primary_color: t.acento,
    secondary_color: secundarioDe(t),
    background_color: t.fondo,
    text_color: t.texto,
    theme_mode: t.modo,
  };
}
