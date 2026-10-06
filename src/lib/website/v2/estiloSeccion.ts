/**
 * Estilo por sección (Figma «figma-estilo» 01-10, aprobado por el dueño el 2026-10-06).
 *
 * Cada sección puede sobrescribir, SOLO para ella, lo que el «Estilo del sitio» decide para todo
 * el sitio: fondo, entrada al aparecer, espaciado, ancho, tipografía (par del sitio o fuentes
 * propias con tamaño, grosor, interlineado y mayúsculas), colores (enlazados a la marca o un hex
 * propio) y en qué dispositivos se muestra. Lo que no sobrescribe, lo hereda del estilo general.
 *
 * Dónde se guarda (contrato que lee goadmin-websites):
 * - V2: `seccion.diseno.estilo` (objeto de abajo) y `seccion.visibilidad`
 *   `{ escritorio, movil, tableta? }` del documento del borrador.
 * - Legacy: el mismo objeto en `website_page_sections.settings.estilo` y la visibilidad en
 *   `settings.visibilidad` `{ computador, tableta, celular }` (jsonb existente, sin esquema nuevo).
 *
 * Precedencia al pintar: Avanzado (`content`, STYLE_FIELDS) > estilo de la sección > tema.
 * Puro: sin React, Next ni Supabase.
 */
import { resolverColorMarca, rolDeReferencia, type ColoresMarca } from './colorMarca';
import { resolverFuenteTema, type FuentesTema } from './fuenteTema';

export const VERSION_ESTILO_SECCION = 1 as const;

export const FONDOS_SECCION = ['tema', 'alterno', 'oscuro', 'imagen'] as const;
export const ENTRADAS_SECCION = ['ninguna', 'aparecer', 'revelar_texto'] as const;
export const ESPACIADOS_SECCION = ['compacto', 'normal', 'amplio'] as const;
export const ANCHOS_SECCION = ['contenedor', 'completo'] as const;
export const TAMANOS_TEXTO = ['S', 'M', 'L', 'XL'] as const;
export const GROSORES_TEXTO = [400, 500, 600, 700] as const;
export const INTERLINEADOS = ['compacto', 'normal', 'amplio'] as const;

export type FondoSeccion = (typeof FONDOS_SECCION)[number];
export type EntradaSeccion = (typeof ENTRADAS_SECCION)[number];
export type EspaciadoSeccion = (typeof ESPACIADOS_SECCION)[number];
export type AnchoSeccion = (typeof ANCHOS_SECCION)[number];
export type TamanoTexto = (typeof TAMANOS_TEXTO)[number];
export type GrosorTexto = (typeof GROSORES_TEXTO)[number];
export type Interlineado = (typeof INTERLINEADOS)[number];

/** Ajustes de un rol de texto (título o texto) de la sección. */
export interface EstiloTexto {
  /** `null`/ausente = la fuente del sitio para ese rol; `tema:titulos|tema:cuerpo` o una familia. */
  fuente?: string | null;
  /** Escala S/M/L/XL o px exactos (12-120). */
  tamano?: TamanoTexto | number;
  grosor?: GrosorTexto;
  /** Escala o multiplicador exacto (0,8-2,5). */
  interlineado?: Interlineado | number;
  mayusculas?: boolean;
}

export type TipografiaSeccion = { modo: 'sitio' } | { modo: 'propia'; titulo?: EstiloTexto; texto?: EstiloTexto };

/** Colores de la sección: `marca:<rol>` (sigue a la marca) o `#RRGGBB` (propio). */
export interface ColoresSeccion {
  texto?: string;
  borde?: string;
}

export interface EstiloSeccion {
  v: typeof VERSION_ESTILO_SECCION;
  fondo?: FondoSeccion;
  entrada?: EntradaSeccion;
  espaciado?: EspaciadoSeccion;
  ancho?: AnchoSeccion;
  tipografia?: TipografiaSeccion;
  colores?: ColoresSeccion;
}

/** Valores que se muestran cuando la sección no dice nada (lo que pinta el sitio por defecto). */
export const ESTILO_POR_DEFECTO = {
  fondo: 'tema',
  entrada: 'ninguna',
  espaciado: 'normal',
  ancho: 'contenedor',
} as const satisfies Pick<Required<EstiloSeccion>, 'fondo' | 'entrada' | 'espaciado' | 'ancho'>;

/** Tamaño de título en computador por escala (figma-estilo/01: «S 28 · M 34 · L 40 · XL 48 px»). */
export const TAMANOS_PX: Readonly<Record<TamanoTexto, number>> = { S: 28, M: 34, L: 40, XL: 48 };
/** Tamaño del texto por escala (el cuerpo es más chico que el título). */
export const TAMANOS_TEXTO_PX: Readonly<Record<TamanoTexto, number>> = { S: 14, M: 16, L: 18, XL: 20 };
/** En celular se reduce un 20 % (figma-estilo/01). */
export const FACTOR_CELULAR = 0.8;
export const VALOR_INTERLINEADO: Readonly<Record<Interlineado, number>> = { compacto: 1.1, normal: 1.3, amplio: 1.5 };
/** «Todo en mayúsculas · Con espaciado de letras +4 %». */
export const ESPACIADO_MAYUSCULAS_EM = 0.04;

export const LIMITES_TAMANO_PX = { min: 12, max: 120 } as const;
export const LIMITES_INTERLINEADO = { min: 0.8, max: 2.5 } as const;

const HEX = /^#[0-9a-fA-F]{6}$/;

function de<T extends string | number>(lista: readonly T[], valor: unknown): T | undefined {
  return (lista as readonly unknown[]).includes(valor) ? (valor as T) : undefined;
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function leerColor(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  if (rolDeReferencia(v)) return v;
  return HEX.test(v) ? v.toUpperCase() : undefined;
}

function leerTexto(v: unknown): EstiloTexto | undefined {
  if (!esObjeto(v)) return undefined;
  const r: EstiloTexto = {};
  if (v.fuente === null) r.fuente = null;
  else if (typeof v.fuente === 'string' && v.fuente.trim() && v.fuente.length <= 80) r.fuente = v.fuente.trim();
  const tam = de(TAMANOS_TEXTO, v.tamano);
  if (tam) r.tamano = tam;
  else if (typeof v.tamano === 'number' && Number.isFinite(v.tamano)) {
    r.tamano = Math.round(Math.min(LIMITES_TAMANO_PX.max, Math.max(LIMITES_TAMANO_PX.min, v.tamano)));
  }
  const grosor = de(GROSORES_TEXTO, v.grosor);
  if (grosor) r.grosor = grosor;
  const inter = de(INTERLINEADOS, v.interlineado);
  if (inter) r.interlineado = inter;
  else if (typeof v.interlineado === 'number' && Number.isFinite(v.interlineado)) {
    r.interlineado = Math.round(Math.min(LIMITES_INTERLINEADO.max, Math.max(LIMITES_INTERLINEADO.min, v.interlineado)) * 100) / 100;
  }
  if (typeof v.mayusculas === 'boolean') r.mayusculas = v.mayusculas;
  return Object.keys(r).length > 0 ? r : undefined;
}

/**
 * Lee (y sanea) el estilo de una sección desde su `diseno` (V2) o sus `settings` (legacy).
 * Lo que no se entiende se descarta: nunca se pinta un valor inválido.
 */
export function leerEstiloSeccion(diseno: unknown): EstiloSeccion {
  const crudo = esObjeto(diseno) ? diseno.estilo : undefined;
  const r: EstiloSeccion = { v: VERSION_ESTILO_SECCION };
  if (!esObjeto(crudo)) return r;
  const fondo = de(FONDOS_SECCION, crudo.fondo);
  if (fondo) r.fondo = fondo;
  const entrada = de(ENTRADAS_SECCION, crudo.entrada);
  if (entrada) r.entrada = entrada;
  const espaciado = de(ESPACIADOS_SECCION, crudo.espaciado);
  if (espaciado) r.espaciado = espaciado;
  const ancho = de(ANCHOS_SECCION, crudo.ancho);
  if (ancho) r.ancho = ancho;
  if (esObjeto(crudo.tipografia)) {
    if (crudo.tipografia.modo === 'propia') {
      const titulo = leerTexto(crudo.tipografia.titulo);
      const texto = leerTexto(crudo.tipografia.texto);
      r.tipografia = { modo: 'propia', ...(titulo ? { titulo } : {}), ...(texto ? { texto } : {}) };
    } else if (crudo.tipografia.modo === 'sitio') {
      r.tipografia = { modo: 'sitio' };
    }
  }
  if (esObjeto(crudo.colores)) {
    const texto = leerColor(crudo.colores.texto);
    const borde = leerColor(crudo.colores.borde);
    if (texto || borde) r.colores = { ...(texto ? { texto } : {}), ...(borde ? { borde } : {}) };
  }
  return r;
}

/** `true` si la sección no sobrescribe nada (hereda todo del estilo del sitio). */
export function estiloVacio(e: EstiloSeccion): boolean {
  const tipografiaPropia = e.tipografia?.modo === 'propia';
  return !e.fondo && !e.entrada && !e.espaciado && !e.ancho && !tipografiaPropia && !e.colores;
}

/** Quita lo que equivale a heredar (tipografía «como el sitio», colores vacíos). */
export function normalizarEstilo(e: EstiloSeccion): EstiloSeccion {
  const r: EstiloSeccion = { v: VERSION_ESTILO_SECCION };
  if (e.fondo) r.fondo = e.fondo;
  if (e.entrada) r.entrada = e.entrada;
  if (e.espaciado) r.espaciado = e.espaciado;
  if (e.ancho) r.ancho = e.ancho;
  if (e.tipografia?.modo === 'propia') r.tipografia = e.tipografia;
  if (e.colores && (e.colores.texto || e.colores.borde)) {
    r.colores = {
      ...(e.colores.texto ? { texto: e.colores.texto } : {}),
      ...(e.colores.borde ? { borde: e.colores.borde } : {}),
    };
  }
  return r;
}

/**
 * Devuelve un `diseno`/`settings` nuevo con el estilo escrito. Si el estilo queda vacío se
 * borra la clave `estilo` (la sección vuelve a «como el sitio»). No toca el resto de claves.
 */
export function escribirEstiloSeccion(diseno: unknown, estilo: EstiloSeccion | null): Record<string, unknown> {
  const base: Record<string, unknown> = esObjeto(diseno) ? { ...diseno } : {};
  const limpio = estilo ? normalizarEstilo(estilo) : null;
  if (!limpio || estiloVacio(limpio)) delete base.estilo;
  else base.estilo = limpio;
  return base;
}

// ─── Tamaños y tipografía ───────────────────────────────────────────────────────────────────

export type RolTexto = 'titulo' | 'texto';
export type DispositivoTexto = 'computador' | 'celular';

/** px finales de un rol de texto; `null` = el tamaño del sitio. */
export function tamanoEnPx(
  tamano: EstiloTexto['tamano'],
  rol: RolTexto,
  dispositivo: DispositivoTexto = 'computador',
): number | null {
  if (tamano === undefined) return null;
  const base = typeof tamano === 'number' ? tamano : (rol === 'titulo' ? TAMANOS_PX : TAMANOS_TEXTO_PX)[tamano];
  return dispositivo === 'celular' ? Math.round(base * FACTOR_CELULAR) : base;
}

/** Escala que corresponde a unos px exactos (para marcar el chip), o `null` si no hay. */
export function escalaDePx(px: number, rol: RolTexto): TamanoTexto | null {
  const tabla = rol === 'titulo' ? TAMANOS_PX : TAMANOS_TEXTO_PX;
  return TAMANOS_TEXTO.find((t) => tabla[t] === px) ?? null;
}

export function interlineadoNumero(v: EstiloTexto['interlineado']): number | null {
  if (v === undefined) return null;
  return typeof v === 'number' ? v : VALOR_INTERLINEADO[v];
}

export function escalaDeInterlineado(n: number): Interlineado | null {
  return INTERLINEADOS.find((i) => VALOR_INTERLINEADO[i] === n) ?? null;
}

export interface TemaParaEstilo {
  colores: ColoresMarca;
  fuentes: FuentesTema;
}

/** Valores ya resueltos contra el tema (para el resumen en sedes y para el lector público). */
export interface EstiloResuelto {
  fuenteTitulo: string | null;
  fuenteTexto: string | null;
  colorTexto: string | null;
  colorBorde: string | null;
  propia: boolean;
}

export function resolverEstiloSeccion(e: EstiloSeccion, tema: TemaParaEstilo): EstiloResuelto {
  const propia = e.tipografia?.modo === 'propia';
  const tip = e.tipografia?.modo === 'propia' ? e.tipografia : null;
  return {
    fuenteTitulo: resolverFuenteTema(tip?.titulo?.fuente ?? null, tema.fuentes, 'titulos'),
    fuenteTexto: resolverFuenteTema(tip?.texto?.fuente ?? null, tema.fuentes, 'cuerpo'),
    colorTexto: e.colores?.texto ? resolverColorMarca(e.colores.texto, tema.colores) : null,
    colorBorde: e.colores?.borde ? resolverColorMarca(e.colores.borde, tema.colores) : null,
    propia,
  };
}

const VARIABLE_MARCA: Readonly<Record<string, string>> = {
  primario: 'var(--primary-color)',
  secundario: 'var(--secondary-color)',
  acento: 'var(--accent-color)',
  texto: 'var(--text-color)',
  fondo: 'var(--background-color)',
};

/** Un color de sección como valor CSS: la referencia a la marca va como variable (sigue a la marca). */
export function colorCss(valor: string | undefined): string | null {
  if (!valor) return null;
  const rol = rolDeReferencia(valor);
  if (rol) return VARIABLE_MARCA[rol] ?? null;
  return HEX.test(valor) ? valor : null;
}

/**
 * Variables CSS que la sección declara (referencia para el lector de goadmin-websites y para
 * la vista del editor). Solo se emiten las que la sección sobrescribe.
 */
export function variablesCssSeccion(e: EstiloSeccion, dispositivo: DispositivoTexto = 'computador'): Record<string, string> {
  const vars: Record<string, string> = {};
  if (e.tipografia?.modo === 'propia') {
    const roles: [RolTexto, EstiloTexto | undefined][] = [
      ['titulo', e.tipografia.titulo],
      ['texto', e.tipografia.texto],
    ];
    for (const [rol, t] of roles) {
      if (!t) continue;
      if (t.fuente) vars[`--seccion-fuente-${rol}`] = t.fuente.startsWith('tema:')
        ? t.fuente === 'tema:titulos' ? 'var(--font-heading)' : 'var(--font-body)'
        : `'${t.fuente.replace(/'/g, '')}'`;
      const px = tamanoEnPx(t.tamano, rol, dispositivo);
      if (px !== null) vars[`--seccion-tamano-${rol}`] = `${px}px`;
      if (t.grosor) vars[`--seccion-grosor-${rol}`] = String(t.grosor);
      const lh = interlineadoNumero(t.interlineado);
      if (lh !== null) vars[`--seccion-interlineado-${rol}`] = String(lh);
      if (t.mayusculas) {
        vars[`--seccion-mayusculas-${rol}`] = 'uppercase';
        vars[`--seccion-espaciado-${rol}`] = `${ESPACIADO_MAYUSCULAS_EM}em`;
      }
    }
  }
  const texto = colorCss(e.colores?.texto);
  if (texto) vars['--seccion-color-texto'] = texto;
  const borde = colorCss(e.colores?.borde);
  if (borde) vars['--seccion-color-borde'] = borde;
  return vars;
}

// ─── Visibilidad por dispositivo ───────────────────────────────────────────────────────────

export const DISPOSITIVOS = ['computador', 'tableta', 'celular'] as const;
export type Dispositivo = (typeof DISPOSITIVOS)[number];
export type Visibilidad = Record<Dispositivo, boolean>;

/** Lo que el editor necesita de una sección para leer su visibilidad. */
export interface SeccionConVisibilidad {
  is_visible: boolean;
  settings?: Record<string, unknown> | null;
}

function leerVisibilidadVista(v: unknown): Visibilidad | null {
  if (!esObjeto(v)) return null;
  if (typeof v.computador !== 'boolean' || typeof v.tableta !== 'boolean' || typeof v.celular !== 'boolean') return null;
  return { computador: v.computador, tableta: v.tableta, celular: v.celular };
}

/** Visibilidad efectiva de una sección del editor (`settings.visibilidad` o el ojo). */
export function visibilidadDeSeccion(s: SeccionConVisibilidad): Visibilidad {
  // El ojo cerrado manda: oculta en los tres aunque quede una visibilidad fina guardada.
  if (!s.is_visible) return { computador: false, tableta: false, celular: false };
  const fina = leerVisibilidadVista(s.settings?.visibilidad);
  if (fina) return fina;
  return { computador: s.is_visible, tableta: s.is_visible, celular: s.is_visible };
}

/**
 * Aplica una visibilidad: `is_visible` = visible en algún dispositivo; `settings.visibilidad`
 * solo si no es la misma en los tres (si es uniforme basta el ojo).
 */
export function aplicarVisibilidad<T extends SeccionConVisibilidad>(s: T, v: Visibilidad): T {
  const settings: Record<string, unknown> = { ...(s.settings ?? {}) };
  const uniforme = v.computador === v.tableta && v.tableta === v.celular;
  if (uniforme) delete settings.visibilidad;
  else settings.visibilidad = { ...v };
  return { ...s, is_visible: v.computador || v.tableta || v.celular, settings };
}

/** El ojo de la lista: ocultar en todo o volver a mostrar en todo. */
export function alternarVisibleTodo<T extends SeccionConVisibilidad>(s: T, visible: boolean): T {
  return aplicarVisibilidad(s, { computador: visible, tableta: visible, celular: visible });
}

/** ¿Se puede ocultar en `d`? Siempre queda al menos un dispositivo activo (figma-estilo/01). */
export function puedeOcultar(v: Visibilidad, d: Dispositivo): boolean {
  return DISPOSITIVOS.filter((x) => x !== d).some((x) => v[x]);
}

/** Visibilidad del documento V2 (`tableta` solo cuando difiere del computador). */
export function visibilidadAlDocumento(v: Visibilidad): { escritorio: boolean; movil: boolean; tableta?: boolean } {
  return {
    escritorio: v.computador,
    movil: v.celular,
    ...(v.tableta !== v.computador ? { tableta: v.tableta } : {}),
  };
}

export function visibilidadDesdeDocumento(v: { escritorio?: boolean; movil?: boolean; tableta?: boolean } | null | undefined): Visibilidad {
  const computador = v?.escritorio ?? true;
  return { computador, tableta: v?.tableta ?? computador, celular: v?.movil ?? true };
}

// ─── Herencia en sedes (figma-estilo/03 y 04) ─────────────────────────────────────────────

export const GRUPOS_ESTILO = ['tipografia', 'mostrar', 'colores', 'fondo'] as const;
export type GrupoEstilo = (typeof GRUPOS_ESTILO)[number];
export type OrigenGrupo = 'heredado' | 'personalizado';

/** Estilo + visibilidad de una sección, lo que se compara entre sede y principal. */
export interface EstiloComparable {
  estilo: EstiloSeccion;
  visibilidad: Visibilidad;
}

export function comparableDe(s: SeccionConVisibilidad): EstiloComparable {
  return { estilo: leerEstiloSeccion(s.settings), visibilidad: visibilidadDeSeccion(s) };
}

function valorGrupo(c: EstiloComparable, g: GrupoEstilo): unknown {
  const e = c.estilo;
  switch (g) {
    case 'tipografia':
      return e.tipografia?.modo === 'propia' ? e.tipografia : null;
    case 'mostrar':
      return c.visibilidad;
    case 'colores':
      return e.colores ?? null;
    default:
      return { fondo: e.fondo ?? null, entrada: e.entrada ?? null, espaciado: e.espaciado ?? null, ancho: e.ancho ?? null };
  }
}

function igual(a: unknown, b: unknown): boolean {
  return JSON.stringify(ordenar(a)) === JSON.stringify(ordenar(b));
}

function ordenar(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(ordenar);
  if (esObjeto(v)) {
    return Object.keys(v)
      .sort()
      .reduce<Record<string, unknown>>((a, k) => {
        if (v[k] !== undefined) a[k] = ordenar(v[k]);
        return a;
      }, {});
  }
  return v;
}

/**
 * Origen de cada grupo de estilo de una sección de sede frente a la misma sección del principal:
 * igual = «Heredado de la principal», distinto = «Personalizado». Sin sección en el principal
 * (sección nueva de la sede) todo cuenta como personalizado.
 */
export function origenGruposEstilo(
  sede: EstiloComparable,
  principal: EstiloComparable | null,
): Record<GrupoEstilo, OrigenGrupo> {
  const r = {} as Record<GrupoEstilo, OrigenGrupo>;
  for (const g of GRUPOS_ESTILO) {
    r[g] = principal && igual(valorGrupo(sede, g), valorGrupo(principal, g)) ? 'heredado' : 'personalizado';
  }
  return r;
}

/** Copia a la sede el grupo `g` del principal («Restablecer» de un grupo). */
export function restablecerGrupoEstilo(sede: EstiloComparable, principal: EstiloComparable, g: GrupoEstilo): EstiloComparable {
  const e: EstiloSeccion = { ...sede.estilo };
  const p = principal.estilo;
  switch (g) {
    case 'tipografia':
      if (p.tipografia) e.tipografia = p.tipografia;
      else delete e.tipografia;
      return { estilo: e, visibilidad: sede.visibilidad };
    case 'mostrar':
      return { estilo: e, visibilidad: { ...principal.visibilidad } };
    case 'colores':
      if (p.colores) e.colores = { ...p.colores };
      else delete e.colores;
      return { estilo: e, visibilidad: sede.visibilidad };
    default:
      for (const k of ['fondo', 'entrada', 'espaciado', 'ancho'] as const) {
        if (p[k]) (e as unknown as Record<string, unknown>)[k] = p[k];
        else delete e[k];
      }
      return { estilo: e, visibilidad: sede.visibilidad };
  }
}

/** Escribe un comparable de vuelta en la sección del editor (settings + is_visible). */
export function aplicarComparable<T extends SeccionConVisibilidad>(s: T, c: EstiloComparable): T {
  const conEstilo = { ...s, settings: escribirEstiloSeccion(s.settings, c.estilo) };
  return aplicarVisibilidad(conEstilo, c.visibilidad);
}
