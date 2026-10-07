/**
 * Modelo de DIBUJO del encabezado y el pie de una plantilla (Figma «16 Sitio web», sección
 * «Plantillas · encabezado y pie en la miniatura»): traduce un shell —el de
 * `shellPorPlantilla.ts` o el del borrador del cliente— a lo que hay que pintar de forma
 * esquemática: dónde va el logo, el menú, la barra superior, los botones con su texto, el
 * megamenú; las columnas y los bloques del pie; la barra fija del celular.
 *
 * Lo usan la miniatura de la galería, la vista previa de la plantilla y el diálogo «Usar esta
 * plantilla» (`components/sitio-web/diseno/EsquemaShell.tsx`). Es la ÚNICA traducción: no hay
 * una segunda tabla de «cómo se ve cada plantilla»; los datos salen de `shellDePlantilla` y de
 * los tokens de estilo.
 *
 * Puro, sin React ni i18n: los textos visibles se piden por clave (`RasgoShell`) y los traduce
 * quien pinta (`sitioWeb.diseno.shell.*`).
 *
 * Las opciones se leen con `normalizarOpcionShell`: ausente o inválida = el default del sitio de
 * hoy, igual que las lee el sitio público.
 */
import type { Giro } from '@/components/sitio-web/paginas/plantillasPagina';
import type { DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { mezclarHex } from '@/lib/utils/contrasteColor';
import { COMPOSICIONES_FOOTER, COMPOSICIONES_HEADER, normalizarOpcionShell, type ACCIONES_BARRA_MOVIL } from './mapeoAjustes';
import { shellDePlantilla, type ClaveMenuPie, type ShellPlantilla } from './shellPorPlantilla';
import { radioBoton, textoSobreAcento, type TokensEstilo } from './tokensEstilo';

export type ComposicionEncabezadoDibujo = (typeof COMPOSICIONES_HEADER)[number];
export type ComposicionPieDibujo = (typeof COMPOSICIONES_FOOTER)[number];
export type AccionBarraCelular = (typeof ACCIONES_BARRA_MOVIL)[number];

/** Qué muestra la barra superior, en orden. */
export type PiezaBarraSuperior = 'sede' | 'envio' | 'cupos' | 'telefono' | 'correo';
/** Acciones a la derecha del encabezado, en orden. */
export type AccionEncabezado = 'sede' | 'idioma' | 'buscar' | 'barraBusqueda' | 'cuenta' | 'carrito';
/** Bloques del pie además de la marca y los menús. */
export type BloquePie = 'horario' | 'contacto' | 'redes' | 'whatsapp' | 'mapa' | 'boletin' | 'pagos';

/**
 * Dónde va el menú principal:
 * - `linea`: a la derecha del logo;
 * - `partido`: el logo al centro y los enlaces a los dos lados;
 * - `fila`: en una fila propia, centrada, debajo del logo;
 * - `oculto`: tras el botón de menú (hamburguesa);
 * - `categorias`: fila de categorías del megamenú.
 */
export type PosicionMenu = 'linea' | 'partido' | 'fila' | 'oculto' | 'categorias';

export interface BotonDibujo {
  texto: string;
  /** Texto abreviado para la miniatura («Reservar mesa» → «Reservar»). */
  corto: string;
  variante: 'solido' | 'contorno';
}

export interface DibujoEncabezado {
  composicion: ComposicionEncabezadoDibujo;
  logo: 'izquierda' | 'centro';
  menu: PosicionMenu;
  /** Enlaces del menú que se dibujan. */
  enlaces: number;
  /** `null`: sin barra superior. */
  barraSuperior: readonly PiezaBarraSuperior[] | null;
  botones: readonly BotonDibujo[];
  acciones: readonly AccionEncabezado[];
  /** Megamenú abierto con N columnas de categorías. */
  megamenu: { columnas: number } | null;
  /** Hotel: barra de reserva con fechas bajo el encabezado. */
  barraReserva: boolean;
  /** El menú son las categorías de la carta (Carta QR). */
  menuCarta: boolean;
  menuCelular: string;
}

/** Nombre de un menú del pie: por clave de la lámina («Legal») o el nombre que puso el cliente. */
export type MenuPieDibujo = { clave: ClaveMenuPie } | { nombre: string };

export interface DibujoPie {
  composicion: ComposicionPieDibujo;
  /** Menús del pie (legal, ayuda, envíos…), uno por columna. */
  menus: readonly MenuPieDibujo[];
  bloques: readonly BloquePie[];
  boletinTitulo: string | null;
  /** «Hecho con GO Admin». */
  firma: boolean;
  celular: 'acordeon' | 'apilado';
}

export interface ColoresDibujo {
  fondo: string;
  texto: string;
  suave: string;
  linea: string;
  acento: string;
  textoAcento: string;
  barraSuperior: string;
  textoBarraSuperior: string;
  /** Banda neutra que representa «el contenido de tu página». */
  contenido: string;
  fondoPie: string;
  textoPie: string;
  suavePie: string;
  lineaPie: string;
}

export interface DibujoShell {
  encabezado: DibujoEncabezado;
  pie: DibujoPie;
  /** Barra fija del celular, en orden; vacía = sin barra. */
  barraCelular: readonly AccionBarraCelular[];
  colores: ColoresDibujo;
  radioBoton: number;
  fuenteTitulos: string;
  fuenteCuerpo: string;
}

/** Lo que entra al modelo: un shell con composición, opciones, botones y cuántos menús hay. */
export interface EntradaShell {
  encabezado: {
    composicion: string;
    opciones: Readonly<Record<string, unknown>>;
    /** Textos de los botones (principal y secundario), sin vacíos. */
    botones: readonly string[];
    /** Enlaces del menú principal, si se conocen (borrador del cliente). */
    enlaces?: number;
  };
  pie: { composicion: string; opciones: Readonly<Record<string, unknown>>; menus: readonly MenuPieDibujo[] };
}

const ENLACES_POR_DEFECTO = 4;
const MAX_ENLACES = 5;
const MAX_TEXTO_CORTO = 12;
const MAX_MENUS_PIE = 4;

/** «Reservar mesa» → «Reservar»; «Cómo llegar» y «Pedir ya» se quedan. */
export function textoCorto(texto: string): string {
  const limpio = texto.trim();
  if (limpio.length <= MAX_TEXTO_CORTO) return limpio;
  return limpio.split(/\s+/)[0];
}

function opcion(clave: string, opciones: Readonly<Record<string, unknown>>): unknown {
  return normalizarOpcionShell(clave, opciones[clave]);
}

const si = (clave: string, opciones: Readonly<Record<string, unknown>>) => opcion(clave, opciones) === true;

function composicionEncabezado(valor: string): ComposicionEncabezadoDibujo {
  return (COMPOSICIONES_HEADER as readonly string[]).includes(valor) ? (valor as ComposicionEncabezadoDibujo) : 'default';
}

function composicionPie(valor: string): ComposicionPieDibujo {
  return (COMPOSICIONES_FOOTER as readonly string[]).includes(valor) ? (valor as ComposicionPieDibujo) : 'default';
}

export function dibujoEncabezado(e: EntradaShell['encabezado']): DibujoEncabezado {
  const o = e.opciones;
  const composicion = composicionEncabezado(e.composicion);
  const logoCentro = opcion('logo_position', o) === 'center';
  const posicion: { logo: DibujoEncabezado['logo']; menu: PosicionMenu } =
    composicion === 'centered'
      ? { logo: 'centro', menu: 'fila' }
      : composicion === 'minimal'
        ? { logo: 'izquierda', menu: 'oculto' }
        : composicion === 'mega'
          ? { logo: 'izquierda', menu: 'categorias' }
          : composicion === 'split' || logoCentro
            ? { logo: 'centro', menu: 'partido' }
            : { logo: 'izquierda', menu: 'linea' };

  const barraSuperior: PiezaBarraSuperior[] = [];
  if (si('topbar_show_branch_status', o)) barraSuperior.push('sede');
  if (si('topbar_show_free_shipping', o)) barraSuperior.push('envio');
  if (si('topbar_show_availability', o)) barraSuperior.push('cupos');
  if (si('topbar_show_phone', o)) barraSuperior.push('telefono');
  if (si('topbar_show_email', o)) barraSuperior.push('correo');

  const acciones: AccionEncabezado[] = [];
  if (si('header_show_branch_selector', o)) acciones.push('sede');
  if (si('header_show_language', o)) acciones.push('idioma');
  const busqueda = opcion('search_style', o);
  if (busqueda === 'bar') acciones.push('barraBusqueda');
  else if (busqueda !== 'hidden') acciones.push('buscar');
  if (si('show_header_auth', o)) acciones.push('cuenta');
  if (si('show_header_cart', o)) acciones.push('carrito');

  const botones = e.botones
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((texto, i): BotonDibujo => ({ texto, corto: textoCorto(texto), variante: i === 0 ? 'solido' : 'contorno' }));

  const columnas = Number(opcion('mega_menu_columns', o));
  return {
    composicion,
    ...posicion,
    enlaces: Math.max(1, Math.min(MAX_ENLACES, e.enlaces ?? ENLACES_POR_DEFECTO)),
    barraSuperior: si('show_topbar', o) ? barraSuperior : null,
    botones,
    acciones,
    megamenu: composicion === 'mega' ? { columnas: Number.isFinite(columnas) && columnas >= 2 ? Math.min(columnas, 6) : 4 } : null,
    barraReserva: si('header_booking_bar', o),
    menuCarta: opcion('header_menu_source', o) === 'categorias_carta',
    menuCelular: String(opcion('mobile_menu_style', o) ?? 'drawer'),
  };
}

export function dibujoPie(p: EntradaShell['pie']): DibujoPie {
  const o = p.opciones;
  const bloques: BloquePie[] = [];
  if (si('footer_show_hours', o)) bloques.push('horario');
  if (si('footer_show_contact', o)) bloques.push('contacto');
  if (si('footer_show_social', o)) bloques.push('redes');
  if (si('footer_show_whatsapp', o)) bloques.push('whatsapp');
  if (si('footer_show_map', o)) bloques.push('mapa');
  if (si('footer_show_newsletter', o)) bloques.push('boletin');
  if (si('footer_show_payment_methods', o)) bloques.push('pagos');
  const titulo = opcion('footer_newsletter_title', o);
  return {
    composicion: composicionPie(p.composicion),
    menus: p.menus.slice(0, MAX_MENUS_PIE),
    bloques,
    boletinTitulo: bloques.includes('boletin') && typeof titulo === 'string' && titulo.trim() ? titulo.trim() : null,
    firma: si('show_powered_by', o),
    celular: opcion('mobile_footer_style', o) === 'stacked' ? 'apilado' : 'acordeon',
  };
}

/**
 * Barra fija del celular. `auto` es la de hoy, solo en restaurante: Reservar · Cómo llegar ·
 * Llamar, y Pedir delante cuando el encabezado lleva carrito (pedidos en línea).
 */
export function barraCelular(opciones: Readonly<Record<string, unknown>>, giro: Giro): AccionBarraCelular[] {
  const v = opcion('mobile_bottom_bar', opciones);
  if (Array.isArray(v)) return v as AccionBarraCelular[];
  if (v !== 'auto' || giro !== 'restaurante') return [];
  return si('show_header_cart', opciones) ? ['pedir', 'reservar', 'como_llegar', 'llamar'] : ['reservar', 'como_llegar', 'llamar'];
}

/**
 * Colores del esquema (regla de las láminas): encabezado = fondo y texto del tema; pie = fondo del
 * tema más oscuro (o un tono más oscuro en plantillas claras); botón = acento con texto legible.
 */
export function coloresDibujo(estilo: Pick<TokensEstilo, 'modo' | 'fondo' | 'texto' | 'acento'>, opcionesPie: Readonly<Record<string, unknown>>): ColoresDibujo {
  const { fondo, texto, acento } = estilo;
  const oscuro = estilo.modo === 'dark';
  const fondoPieOpcion = opcion('footer_background', opcionesPie);
  let fondoPie: string;
  let textoPie: string;
  switch (fondoPieOpcion) {
    case 'tema':
      fondoPie = oscuro ? mezclarHex(fondo, '#000000', 0.4) : mezclarHex(fondo, texto, 0.06);
      textoPie = texto;
      break;
    case 'light':
      fondoPie = '#F8FAFC';
      textoPie = '#111827';
      break;
    case 'primary':
      fondoPie = acento;
      textoPie = textoSobreAcento(acento);
      break;
    case 'custom': {
      const propio = opcion('footer_custom_bg_color', opcionesPie);
      fondoPie = typeof propio === 'string' && /^#[0-9a-f]{6}$/i.test(propio) ? propio.toUpperCase() : '#111827';
      textoPie = textoSobreAcento(fondoPie);
      break;
    }
    default:
      fondoPie = '#111827';
      textoPie = '#F9FAFB';
  }
  return {
    fondo,
    texto,
    suave: mezclarHex(texto, fondo, 0.45),
    linea: mezclarHex(fondo, texto, 0.16),
    acento,
    textoAcento: textoSobreAcento(acento),
    barraSuperior: oscuro ? mezclarHex(fondo, texto, 0.08) : mezclarHex(fondo, texto, 0.9),
    textoBarraSuperior: oscuro ? mezclarHex(texto, fondo, 0.3) : fondo,
    contenido: mezclarHex(fondo, texto, 0.05),
    fondoPie,
    textoPie,
    suavePie: mezclarHex(textoPie, fondoPie, 0.45),
    lineaPie: mezclarHex(fondoPie, textoPie, 0.18),
  };
}

/** El dibujo completo de una entrada con un estilo. */
export function dibujoShell(entrada: EntradaShell, estilo: TokensEstilo, giro: Giro): DibujoShell {
  return {
    encabezado: dibujoEncabezado(entrada.encabezado),
    pie: dibujoPie(entrada.pie),
    barraCelular: barraCelular(entrada.encabezado.opciones, giro),
    colores: coloresDibujo(estilo, entrada.pie.opciones),
    radioBoton: radioBoton(estilo),
    fuenteTitulos: estilo.fuenteTitulos,
    fuenteCuerpo: estilo.fuenteCuerpo,
  };
}

/** Entrada desde la lámina de una plantilla (`shellPorPlantilla.ts`). */
export function entradaDePlantilla(shell: ShellPlantilla): EntradaShell {
  return {
    encabezado: {
      composicion: shell.encabezado.composicion,
      opciones: shell.encabezado.opciones,
      botones: [shell.encabezado.boton?.texto ?? '', shell.encabezado.boton2?.texto ?? ''],
    },
    pie: { composicion: shell.pie.composicion, opciones: shell.pie.opciones, menus: shell.pie.menus.map((clave) => ({ clave })) },
  };
}

/**
 * Entrada desde el borrador del cliente: lo que conserva «Solo estilo». Los botones salen de
 * `header_cta_text` / `header_cta2_text` (sin enlace no se pintan en el sitio: tampoco aquí).
 */
export function entradaDelDocumento(documento: DocumentoSitio): EntradaShell {
  const { header, footer } = documento.shell;
  const o = header.opciones;
  const boton = (texto: string, url: string) => (typeof o[texto] === 'string' && typeof o[url] === 'string' && o[url] ? (o[texto] as string) : '');
  const menu = documento.menus.find((m) => m.id === header.menuPrincipalId);
  return {
    encabezado: {
      composicion: header.composicion,
      opciones: o,
      botones: [boton('header_cta_text', 'header_cta_url'), boton('header_cta2_text', 'header_cta2_url')],
      enlaces: menu ? menu.items.length : documento.paginas.filter((p) => p.publicada).length,
    },
    pie: {
      composicion: footer.composicion,
      opciones: footer.opciones,
      menus: footer.menuIds.flatMap((id) => {
        const m = documento.menus.find((x) => x.id === id);
        return m ? [{ nombre: m.nombre }] : [];
      }),
    },
  };
}

/** Lo mínimo de una plantilla del catálogo para dibujarla. */
export interface PlantillaDibujable {
  id: string;
  giro: Giro;
  estilo: TokensEstilo;
}

/** Dibujo de una plantilla: su lámina, o la de su giro si no tiene (`shellDePlantilla`). */
export function dibujoDePlantilla(plantilla: PlantillaDibujable): DibujoShell {
  return dibujoShell(entradaDePlantilla(shellDePlantilla(plantilla.id, plantilla.giro)), plantilla.estilo, plantilla.giro);
}

/** El borrador del cliente pintado con el estilo de la plantilla: lo que deja «Solo estilo». */
export function dibujoDelDocumentoConEstilo(documento: DocumentoSitio, estilo: TokensEstilo, giro: Giro): DibujoShell {
  return dibujoShell(entradaDelDocumento(documento), estilo, giro);
}

// ─── Rasgos: el texto («Encabezado centrado · Pie en 3 columnas con mapa») por clave ─────────

/**
 * Un texto por clave de `sitioWeb.diseno.shell.*`. `valores` van tal cual; `claves` son valores que
 * a su vez se traducen; `lista` son claves que se traducen y se unen en `{lista}`.
 */
export interface RasgoShell {
  clave: string;
  valores?: Record<string, string | number>;
  claves?: Record<string, string>;
  lista?: readonly string[];
}

/**
 * Bloques del pie que distinguen una plantilla, en orden de prioridad para la línea corta. Horario,
 * contacto y redes no: vienen activos por defecto y casi todas los llevan.
 */
const BLOQUES_DISTINTIVOS: readonly BloquePie[] = ['mapa', 'boletin', 'pagos', 'whatsapp'];

/** Rasgo principal del encabezado (para la línea corta). */
export function rasgoPrincipalEncabezado(e: DibujoEncabezado): RasgoShell {
  if (e.megamenu) return { clave: 'encabezado.mega' };
  if (e.composicion === 'centered') return { clave: 'encabezado.centered' };
  if (e.composicion === 'minimal') return { clave: 'encabezado.minimal' };
  if (e.menu === 'partido') return { clave: 'encabezado.logoCentro' };
  if (e.barraReserva) return { clave: 'encabezado.reserva' };
  if (e.menuCarta) return { clave: 'encabezado.carta' };
  if (e.botones.length > 1) return { clave: 'encabezado.dosBotones' };
  if (e.composicion === 'transparent') return { clave: 'encabezado.transparent' };
  return { clave: 'encabezado.default' };
}

/** Rasgo principal del pie: composición y hasta dos bloques distintivos. */
export function rasgoPrincipalPie(p: DibujoPie): RasgoShell {
  const extra = BLOQUES_DISTINTIVOS.filter((b) => p.bloques.includes(b)).slice(0, 2);
  const base = `pie.${p.composicion}`;
  if (extra.length === 0) return { clave: base };
  return { clave: extra.length === 1 ? `${base}Con1` : `${base}Con2`, claves: Object.fromEntries(extra.map((b, i) => [i === 0 ? 'a' : 'b', `bloqueCorto.${b}`])) };
}

/** Todos los rasgos, para el texto alternativo y la lista de la vista previa: encabezado, pie y celular. */
export function rasgosShell(d: DibujoShell): { encabezado: RasgoShell[]; pie: RasgoShell[]; celular: RasgoShell | null } {
  const e = d.encabezado;
  const principal = rasgoPrincipalEncabezado(e);
  // El principal ya nombra el megamenú, la carta o la barra de reserva: no se repiten abajo.
  const encabezado: RasgoShell[] = [e.megamenu ? { clave: 'rasgo.megaColumnas', valores: { n: e.megamenu.columnas } } : principal];
  if (e.menuCarta && principal.clave !== 'encabezado.carta') encabezado.push({ clave: 'rasgo.menuCarta' });
  if (e.barraSuperior) {
    encabezado.push(
      e.barraSuperior.length ? { clave: 'rasgo.barraSuperiorCon', lista: e.barraSuperior.map((p) => `barra.${p}`) } : { clave: 'rasgo.barraSuperior' },
    );
  }
  e.botones.forEach((b) => encabezado.push({ clave: b.variante === 'solido' ? 'rasgo.boton' : 'rasgo.boton2', valores: { texto: b.texto } }));
  if (e.barraReserva && principal.clave !== 'encabezado.reserva') encabezado.push({ clave: 'rasgo.barraReserva' });
  e.acciones.forEach((a) => encabezado.push({ clave: `accion.${a}` }));

  const p = d.pie;
  const pie: RasgoShell[] = [{ clave: `pie.${p.composicion}` }];
  if (p.menus.length > 0) pie.push({ clave: p.menus.length === 1 ? 'rasgo.menusUno' : 'rasgo.menus', valores: { n: p.menus.length } });
  p.bloques.forEach((b) => pie.push(b === 'boletin' && p.boletinTitulo ? { clave: 'rasgo.boletinTitulo', valores: { titulo: p.boletinTitulo } } : { clave: `bloque.${b}` }));
  const celular: RasgoShell | null = d.barraCelular.length ? { clave: 'rasgo.barraCelular', lista: d.barraCelular.map((a) => `celular.${a}`) } : null;
  return { encabezado, pie, celular };
}
