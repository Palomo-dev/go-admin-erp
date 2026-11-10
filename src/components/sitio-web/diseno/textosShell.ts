/**
 * Textos del dibujo del encabezado y el pie (`sitioWeb.diseno.shell.*`): la línea corta de la
 * tarjeta («Encabezado centrado · Pie en 3 columnas con mapa»), el texto alternativo de la
 * miniatura y la lista de la vista previa. Traduce los `RasgoShell` del modelo
 * (`lib/website/v2/dibujoShell.ts`), que solo dice QUÉ mostrar.
 */
import type { DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import type { TokensEstilo } from '@/lib/website/v2/tokensEstilo';
import { PAGINAS_BASE_GIRO, type Giro } from '../paginas/plantillasPagina';
import {
  dibujoDePlantilla,
  dibujoDelDocumentoConEstilo,
  rasgoPrincipalEncabezado,
  rasgoPrincipalPie,
  rasgosShell,
  type DibujoShell,
  type MenuPieDibujo,
  type RasgoShell,
} from '@/lib/website/v2/dibujoShell';
import type { TraductorDiseno } from './textos';
import { shellDePlantilla } from '@/lib/website/v2/shellPorPlantilla';
import { extrasShellTienda, SIN_EXTRAS_TIENDA, type ExtrasShellTienda } from './plantillasTienda';

const SEPARADOR_LISTA = ', ';

/** Un rasgo en el idioma activo. */
export function textoRasgo(t: TraductorDiseno, r: RasgoShell): string {
  const valores: Record<string, string | number> = { ...r.valores };
  for (const [k, clave] of Object.entries(r.claves ?? {})) valores[k] = t(`shell.${clave}`);
  if (r.lista) valores.lista = r.lista.map((c) => t(`shell.${c}`)).join(SEPARADOR_LISTA);
  return t(`shell.${r.clave}`, valores);
}

/**
 * Pie de la línea corta con un rasgo de tienda (A1: «Pie en 3 columnas con la marca gigante»,
 * «Pie mínimo con enlaces grandes», «Pie en 3 columnas, como tarjeta»): el rasgo de tienda manda
 * sobre los bloques distintivos. Sin rasgos de tienda, `null` (la línea de siempre).
 */
function pieConRasgoTienda(t: TraductorDiseno, d: DibujoShell, e: ExtrasShellTienda): string | null {
  const clave = e.marcaGigante ? 'conMarca' : e.pieTarjeta ? 'comoTarjeta' : e.enlacesGrandes ? 'conEnlaces' : null;
  return clave ? t(`shell.tienda.pie.${clave}`, { pie: t(`shell.pie.${d.pie.composicion}`) }) : null;
}

/** «Encabezado centrado · Pie en 3 columnas con mapa». */
export function lineaShell(t: TraductorDiseno, d: DibujoShell, extras: ExtrasShellTienda = SIN_EXTRAS_TIENDA): string {
  const principal = rasgoPrincipalEncabezado(d.encabezado);
  const encabezado =
    extras.buscadorPildora && principal.clave === 'encabezado.default' ? t('shell.tienda.encabezadoBuscador') : textoRasgo(t, principal);
  return t('shell.linea', { encabezado, pie: pieConRasgoTienda(t, d, extras) ?? textoRasgo(t, rasgoPrincipalPie(d.pie)) });
}

const minusculaInicial = (s: string) => (s ? s.charAt(0).toLocaleLowerCase() + s.slice(1) : s);

/** Rasgos traducidos, por zona (lista de la vista previa). Los de tienda se suman al final de su zona. */
export function textosRasgos(
  t: TraductorDiseno,
  d: DibujoShell,
  extras: ExtrasShellTienda = SIN_EXTRAS_TIENDA,
): { encabezado: string[]; pie: string[]; celular: string | null } {
  const r = rasgosShell(d);
  // El buscador en píldora es la búsqueda de siempre con otra forma: reemplaza a «búsqueda».
  const encabezado = r.encabezado.map((x) => (extras.buscadorPildora && x.clave === 'accion.buscar' ? { clave: 'tienda.rasgo.buscador' } : x));
  const pie: RasgoShell[] = [...r.pie];
  if (extras.marcaGigante) pie.push({ clave: 'tienda.rasgo.marca' });
  if (extras.enlacesGrandes) pie.push({ clave: 'tienda.rasgo.enlaces' });
  if (extras.pieTarjeta) pie.push({ clave: 'tienda.rasgo.tarjeta' });
  return {
    encabezado: encabezado.map((x) => textoRasgo(t, x)),
    pie: pie.map((x) => textoRasgo(t, x)),
    celular: r.celular ? textoRasgo(t, r.celular) : null,
  };
}

/** Texto alternativo de la miniatura: describe el encabezado y el pie. */
export function altShell(t: TraductorDiseno, d: DibujoShell, extras: ExtrasShellTienda = SIN_EXTRAS_TIENDA): string {
  const r = textosRasgos(t, d, extras);
  const [pie, ...restoPie] = r.pie;
  const base = t('shell.alt', {
    encabezado: r.encabezado.map(minusculaInicial).join(SEPARADOR_LISTA),
    pie: [pie, ...restoPie.map(minusculaInicial)].join(SEPARADOR_LISTA),
  });
  return r.celular ? `${base} ${t('shell.altCelular', { barra: r.celular })}` : base;
}

/** Nombre visible de un menú del pie. */
export function nombreMenuPie(t: TraductorDiseno, m: MenuPieDibujo): string {
  return 'clave' in m ? t(`shell.menu.${m.clave}`) : m.nombre;
}

/** Todo lo que se pinta de un shell: el dibujo, los textos del menú y del pie, la línea y el alt. */
export interface ShellParaVer {
  dibujo: DibujoShell;
  enlaces: string[];
  menusPie: string[];
  linea: string;
  alt: string;
  /** Rasgos de tienda que el dibujo pinta de más (todos `false` en las demás plantillas). */
  extras: ExtrasShellTienda;
}

function paraVer(t: TraductorDiseno, dibujo: DibujoShell, enlaces: string[], extras: ExtrasShellTienda): ShellParaVer {
  return {
    dibujo,
    enlaces,
    menusPie: dibujo.pie.menus.map((m) => nombreMenuPie(t, m)),
    linea: lineaShell(t, dibujo, extras),
    alt: altShell(t, dibujo, extras),
    extras,
  };
}

/**
 * El shell de una plantilla del catálogo (o el de su giro): el menú son las páginas que crea
 * «Plantilla completa» y van al menú (`PAGINAS_BASE_GIRO`, sin Inicio, que es el logo).
 */
export function shellDePlantillaParaVer(t: TraductorDiseno, plantilla: { id: string; giro: Giro; estilo: TokensEstilo }): ShellParaVer {
  const enlaces = PAGINAS_BASE_GIRO[plantilla.giro].filter((p) => p.enMenu && p.slug !== 'home').map((p) => p.titulo);
  const shell = shellDePlantilla(plantilla.id, plantilla.giro);
  return paraVer(t, dibujoDePlantilla(plantilla), enlaces, extrasShellTienda(shell.encabezado.opciones, shell.pie.opciones));
}

/** El shell del borrador del cliente con el estilo de la plantilla: lo que deja «Solo estilo». */
export function shellDelDocumentoParaVer(t: TraductorDiseno, documento: DocumentoSitio, estilo: TokensEstilo, giro: Giro, enlaces: string[]): ShellParaVer {
  const { header, footer } = documento.shell;
  return paraVer(t, dibujoDelDocumentoConEstilo(documento, estilo, giro), enlaces, extrasShellTienda(header.opciones, footer.opciones));
}
