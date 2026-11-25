/**
 * Menú del celular — categorías con color e imagen y «Contenido del botón» (Figma «16 Sitio web»
 * 3290:101848, aprobado el 2026-11-25). Por defecto nada cambia; las reglas son las mismas que usa
 * la tienda (`@/lib/website/v2/categoriasCabecera`, copia idéntica).
 */
import {
  COLOR_CATEGORIA_POR_DEFECTO,
  avatarCategoria,
  colorCategoriaPropio,
  colorTextoSobre,
  menuArmadoSinUsar,
  usaMenuArmado,
} from '@/lib/website/v2/categoriasCabecera';
import { OPCIONES_SHELL, normalizarOpcionShell } from '@/lib/website/v2/mapeoAjustes';
import {
  automaticoUsa,
  cambioContenidoBoton,
  cambioEstiloCategorias,
  estiloCategoriasMovil,
  fuenteBotonCategorias,
  menuDelBoton,
  menuGuardadoSinUsar,
  tarjetasComoLista,
} from '../inspector/categoriasCabeceraLogica';
import { TEXTOS_EDITOR } from '../textos';

const MENUS = [
  { id: 'm1', name: 'Temporada' },
  { id: 'm2', name: 'Principal' },
];

describe('contrato: sin columnas nuevas, por defecto = hoy', () => {
  it('las dos opciones viven en shell.header.opciones con el valor de hoy', () => {
    expect(OPCIONES_SHELL.mobile_categories_look).toMatchObject({ zona: 'header', porDefecto: 'icono', nueva: true });
    expect(OPCIONES_SHELL.header_categories_source).toMatchObject({ zona: 'header', porDefecto: 'auto', nueva: true });
    expect(normalizarOpcionShell('mobile_categories_look', 'otra')).toBe('icono');
    expect(normalizarOpcionShell('header_categories_source', 'otra')).toBe('auto');
  });
});

describe('Categorías en el menú (celular)', () => {
  it('sin clave: Lista con ícono', () => {
    expect(estiloCategoriasMovil({})).toBe('icono');
    expect(estiloCategoriasMovil({ mobile_categories_look: 'redonda' })).toBe('redonda');
    expect(cambioEstiloCategorias('tarjetas')).toEqual({ mobile_categories_look: 'tarjetas' });
  });

  it('Tarjetas avisa en los menús que las pintan como lista redonda', () => {
    expect(tarjetasComoLista({ mobile_categories_look: 'tarjetas' })).toBe('cajon');
    expect(tarjetasComoLista({ mobile_categories_look: 'tarjetas', mobile_menu_style: 'fullscreen' })).toBeNull();
    expect(tarjetasComoLista({ mobile_categories_look: 'tarjetas', mobile_menu_style: 'tabs' })).toBeNull();
    expect(tarjetasComoLista({ mobile_categories_look: 'redonda' })).toBeNull();
  });

  it('el morado por defecto de la base cuenta como sin color', () => {
    expect(COLOR_CATEGORIA_POR_DEFECTO).toBe('#6366F1');
    expect(colorCategoriaPropio('#6366f1')).toBeNull();
    expect(colorCategoriaPropio('#DC2626')).toBe('#DC2626');
    expect(avatarCategoria({ nombre: 'Novedades', icono: 'sparkles', color: '#6366f1' })).toEqual({ imagen: null, icono: 'sparkles', fondo: null, glifo: null, inicial: 'N' });
  });

  it('glifo blanco o casi negro según el color', () => {
    expect(colorTextoSobre('#DC2626')).toBe('#FFFFFF');
    expect(colorTextoSobre('#FACC15')).toBe('#111827');
    expect(avatarCategoria({ nombre: 'Tenis', color: '#FACC15' }).glifo).toBe('#111827');
  });
});

describe('Contenido del botón', () => {
  it('Automático = la regla de hoy (menú armado solo con Mega)', () => {
    for (const c of ['default', 'centered', 'split', 'minimal', 'pill']) {
      expect(usaMenuArmado({ header_style: c })).toBe(false);
      expect(automaticoUsa({ header_style: c })).toBe('inventory');
    }
    expect(usaMenuArmado({ header_style: 'mega' })).toBe(true);
    expect(automaticoUsa({ header_style: 'mega' })).toBe('menu');
    expect(fuenteBotonCategorias({})).toBe('auto');
  });

  it('Menú armado en todas; inventario nunca', () => {
    expect(usaMenuArmado({ header_style: 'default', header_categories_source: 'menu' })).toBe(true);
    expect(usaMenuArmado({ header_style: 'mega', header_categories_source: 'inventory' })).toBe(false);
  });

  it('elegir el inventario enciende las categorías del encabezado (si no, el botón quedaría vacío)', () => {
    expect(cambioContenidoBoton({}, 'inventory')).toEqual({ header_categories_source: 'inventory', show_categories_in_header: true });
    expect(cambioContenidoBoton({ show_categories_in_header: true }, 'inventory')).toEqual({ header_categories_source: 'inventory' });
    expect(cambioContenidoBoton({}, 'menu')).toEqual({ header_categories_source: 'menu' });
    expect(cambioContenidoBoton({}, 'auto')).toEqual({ header_categories_source: 'auto' });
  });

  it('avisa cuando hay un menú guardado que no se ve', () => {
    expect(menuDelBoton({ header_mega_menu_id: 'm1' }, MENUS)?.name).toBe('Temporada');
    expect(menuGuardadoSinUsar({ header_mega_menu_id: 'm1', header_style: 'default' }, MENUS)?.name).toBe('Temporada');
    expect(menuGuardadoSinUsar({ header_mega_menu_id: 'm1', header_style: 'mega' }, MENUS)).toBeNull();
    expect(menuGuardadoSinUsar({ header_mega_menu_id: 'm1', header_categories_source: 'menu' }, MENUS)).toBeNull();
    expect(menuGuardadoSinUsar({ header_mega_menu_id: 'borrado' }, MENUS)).toBeNull();
    expect(menuArmadoSinUsar({}, false)).toBe(false);
  });
});

describe('textos', () => {
  it('cada opción tiene título y ayuda en español', () => {
    const c = TEXTOS_EDITOR.zonaGlobal.categoriasCabecera;
    for (const v of ['icono', 'redonda', 'tarjetas'] as const) expect(c.estilo.opcion[v].titulo).toBeTruthy();
    expect(c.contenido.opcion.auto.ahora.menu).toBeTruthy();
    expect(c.contenido.opcion.inventory.titulo).toBe('Categorías del inventario');
    expect(c.contenido.aviso).toContain('{menu}');
  });
});
