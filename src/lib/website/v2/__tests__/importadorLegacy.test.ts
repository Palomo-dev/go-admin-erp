/**
 * Importador legacy → documento V2. Datos ficticios (org 120); las formas de las filas son las
 * columnas reales verificadas por MCP el 2026-10-05.
 */
import { validarDocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import {
  MENU_PAGINAS_ENCABEZADO,
  MENU_PAGINAS_PIE,
  documentoSedeDesdeBase,
  importarMenuSuelto,
  importarSitioLegacy,
  normalizarSlug,
  reemplazarMenu,
  type EntradaImportacion,
  type FilaPaginaLegacy,
} from '../importadorLegacy';

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function pagina(n: number, extra: Partial<FilaPaginaLegacy> = {}): FilaPaginaLegacy {
  return {
    id: UUID(n),
    slug: `pagina-${n}`,
    title: `Página ${n}`,
    page_type: 'custom',
    is_published: true,
    meta_title: null,
    meta_description: null,
    og_image_url: null,
    show_in_header: false,
    show_in_footer: false,
    header_order: n,
    footer_order: n,
    parent_page_id: null,
    page_settings: {},
    ...extra,
  };
}

function entradaBase(): EntradaImportacion {
  return {
    ajustes: {
      template_id: 'restaurant',
      theme_mode: 'dark',
      primary_color: '#112233',
      secondary_color: '#445566',
      accent_color: null,
      favicon_url: '',
      logo_height: 56,
      meta_title: 'Tienda de calzado',
      meta_description: null,
      meta_keywords: [],
      og_image_url: null,
      social_links: { instagram: 'https://example.com/ig' },
      business_hours: {},
      footer_text: 'Texto del pie',
      header_style: 'mega',
      footer_style: 'default',
      header_menu_id: UUID(900),
      header_mega_menu_id: null,
      // Igual al default → no entra en opciones
      show_header_cart: true,
      logo_position: 'left',
      // Distinto del default → sí entra
      show_topbar: true,
      header_cta_text: 'Reservar',
      actions_order: ['search', 'currency', 'cart', 'auth'],
      footer_columns: 3,
      // Columnas sin destino (D12): nunca entran
      background_color: '#ffffff',
      font_heading: 'Inter',
      enable_online_ordering: true,
      shipping_flat_rate: 10000,
      custom_scripts: '<script>pixel</script>',
    },
    paginas: [
      pagina(1, { slug: 'home', page_type: 'home', title: 'Inicio', meta_title: 'Inicio SEO', show_in_footer: true }),
      pagina(2, { slug: 'carta', page_type: 'menu', show_in_header: true }),
      pagina(3, { slug: '__product_detail', page_type: 'product_detail', page_settings: { columns: 2 } }),
      pagina(4, { slug: 'Nuestra_Historia', is_published: false }),
    ],
    secciones: [
      { id: UUID(11), page_id: UUID(1), section_type: 'hero', section_variant: 'split', content: { title: 'Hola' }, settings: { padding: 'lg' }, sort_order: 1, is_visible: true },
      { id: UUID(10), page_id: UUID(1), section_type: 'features', section_variant: null, content: null, settings: null, sort_order: 0, is_visible: false },
      { id: UUID(12), page_id: UUID(2), section_type: 'menu_preview', section_variant: 'tabs', content: {}, settings: {}, sort_order: 0, is_visible: true },
    ],
    menus: [
      { id: UUID(900), name: 'Principal', location: 'header', footer_column: null, footer_order: 0, header_order: 0, is_active: true, branch_id: null },
      { id: UUID(901), name: 'Pie', location: 'footer', footer_column: 1, footer_order: 0, header_order: 1, is_active: true, branch_id: null },
    ],
    itemsMenu: [
      { id: UUID(1000), menu_id: UUID(900), item_type: 'page', page_id: UUID(1), category_id: null, custom_label: null, custom_url: null, parent_item_id: null, display_order: 0, is_active: true },
      { id: UUID(1001), menu_id: UUID(900), item_type: 'page', page_id: UUID(2), category_id: null, custom_label: 'La carta', custom_url: null, parent_item_id: null, display_order: 1, is_active: true },
      { id: UUID(1002), menu_id: UUID(900), item_type: 'category', page_id: null, category_id: 42, custom_label: 'Postres', custom_url: null, parent_item_id: UUID(1001), display_order: 0, is_active: true },
      { id: UUID(1003), menu_id: UUID(900), item_type: 'page', page_id: UUID(999), category_id: null, custom_label: null, custom_url: null, parent_item_id: null, display_order: 2, is_active: true },
      { id: UUID(1004), menu_id: UUID(900), item_type: 'page', page_id: UUID(2), category_id: null, custom_label: null, custom_url: null, parent_item_id: null, display_order: 3, is_active: false },
      { id: UUID(1005), menu_id: UUID(901), item_type: 'custom', page_id: null, category_id: null, custom_label: 'Blog', custom_url: 'https://example.com/blog', parent_item_id: null, display_order: 0, is_active: true },
    ],
  };
}

function importar(entrada = entradaBase()) {
  const r = importarSitioLegacy(entrada);
  if (!r.ok) throw new Error(JSON.stringify(r.errores));
  return r;
}

describe('normalizarSlug', () => {
  test('las plantillas `__x_y` pasan a `plantillas/x-y` y los guiones bajos a guiones', () => {
    expect(normalizarSlug('__product_detail')).toBe('plantillas/product-detail');
    expect(normalizarSlug('Nuestra_Historia')).toBe('nuestra-historia');
    expect(normalizarSlug('home')).toBe('home');
    expect(normalizarSlug('a//b/')).toBe('a/b');
  });
});

describe('importarSitioLegacy', () => {
  test('el documento resultante cumple el contrato', () => {
    const { documento } = importar();
    expect(validarDocumentoSitio(documento).ok).toBe(true);
  });

  test('D6: el principal conserva sus valores como explícitos; vacío → clear', () => {
    const { documento } = importar();
    expect(documento.tema.plantillaBase).toEqual({ mode: 'value', value: 'restaurant' });
    expect(documento.tema.modo).toEqual({ mode: 'value', value: 'dark' });
    expect(documento.tema.colores.primario).toEqual({ mode: 'value', value: '#112233' });
    expect(documento.tema.colores.acento).toEqual({ mode: 'clear' });
    expect(documento.identidad.faviconUrl).toEqual({ mode: 'clear' });
    expect(documento.identidad.alturaLogo).toEqual({ mode: 'value', value: 56 });
    expect(documento.seo.palabrasClave).toEqual({ mode: 'clear' });
    expect(documento.contenido.redesSociales).toEqual({ mode: 'value', value: { instagram: 'https://example.com/ig' } });
    // Horario único (paquete F): el horario vive en la sede, no en el documento.
    expect(documento.contenido.horarios).toBeUndefined();
  });

  test('D12: las columnas sin efecto, comercio e integraciones no entran al documento', () => {
    const texto = JSON.stringify(importar().documento);
    for (const fuera of ['#ffffff', 'Inter', 'pixel', '10000', 'enable_online_ordering', 'background_color', 'font_heading']) {
      expect(texto).not.toContain(fuera);
    }
    expect(importar().documento.tema.colores.fondo).toBeUndefined();
    expect(importar().documento.tema.tipografia.titulos).toBeUndefined();
  });

  test('shell: composición y solo las opciones distintas del default', () => {
    const { shell } = importar().documento;
    expect(shell.header.composicion).toBe('mega');
    expect(shell.header.opciones).toEqual({ show_topbar: true, header_cta_text: 'Reservar' });
    expect(shell.footer.opciones).toEqual({ footer_columns: 3 });
    expect(shell.header.menuPrincipalId).toBe(UUID(900));
    expect(shell.footer.menuIds).toEqual([UUID(901)]);
  });

  test('páginas: orden de secciones, visibilidad, diseño y SEO por página', () => {
    const { documento } = importar();
    const inicio = documento.paginas.find((p) => p.id === UUID(1))!;
    expect(inicio.secciones.map((s) => s.id)).toEqual([UUID(10), UUID(11)]);
    expect(inicio.secciones[0].visibilidad).toEqual({ movil: false, escritorio: false });
    expect(inicio.secciones[0].contenido).toEqual({});
    expect(inicio.secciones[1].diseno).toEqual({ padding: 'lg' });
    expect(inicio.seo).toEqual({ titulo: { mode: 'value', value: 'Inicio SEO' } });
    const plantilla = documento.paginas.find((p) => p.id === UUID(3))!;
    expect(plantilla.slug).toBe('plantillas/product-detail');
    expect(plantilla.tipo).toBe('product_detail');
    expect(documento.paginas.find((p) => p.id === UUID(4))!.publicada).toBe(false);
  });

  test('menús: árbol, etiquetas, categoría como entidad; ítems inactivos o huérfanos fuera', () => {
    const r = importar();
    const principal = r.documento.menus.find((m) => m.id === UUID(900))!;
    expect(principal.items.map((i) => i.etiqueta)).toEqual(['Inicio', 'La carta']);
    expect(principal.items[1].hijos?.[0]).toEqual({ id: UUID(1002), etiqueta: 'Postres', tipo: 'entity', entidad: 'category', entidadId: '42' });
    expect(r.avisos).toContain(`item_menu_sin_pagina:${UUID(1003)}`);
    expect(r.avisos).toContain(`page_settings_sin_destino:${UUID(3)}`);
    const pie = r.documento.menus.find((m) => m.id === UUID(901))!;
    expect(pie.items[0]).toMatchObject({ tipo: 'custom', url: 'https://example.com/blog' });
  });

  test('sin menú nombrado, show_in_header / show_in_footer se convierten en menús (D3)', () => {
    const entrada = entradaBase();
    entrada.ajustes = { ...entrada.ajustes, header_menu_id: null };
    entrada.menus = [];
    entrada.itemsMenu = [];
    const { documento } = importar(entrada);
    expect(documento.shell.header.menuPrincipalId).toBe(MENU_PAGINAS_ENCABEZADO);
    expect(documento.shell.footer.menuIds).toEqual([MENU_PAGINAS_PIE]);
    const encabezado = documento.menus.find((m) => m.id === MENU_PAGINAS_ENCABEZADO)!;
    expect(encabezado.items).toEqual([{ id: `p-${UUID(2)}`, etiqueta: 'Página 2', tipo: 'page', paginaId: UUID(2) }]);
  });

  test('sin fila de website_settings: documento válido con defaults y aviso', () => {
    const r = importarSitioLegacy({ ...entradaBase(), ajustes: null });
    expect(r.ok).toBe(true);
    expect(r.avisos).toContain('sin_website_settings');
  });

  test('si el resultado no cumple el contrato devuelve errores, nunca un documento a medias', () => {
    const entrada = entradaBase();
    entrada.ajustes = { ...entrada.ajustes, primary_color: 'azul' };
    const r = importarSitioLegacy(entrada);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores[0].codigo).toBe('color_hex_invalido');
  });

  test('slugs repetidos tras normalizar reciben sufijo', () => {
    const entrada = entradaBase();
    entrada.paginas.push(pagina(5, { slug: 'carta_' }));
    const slugs = importar(entrada).documento.paginas.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toContain('carta-2');
  });
});

describe('documentoSedeDesdeBase', () => {
  test('identidad, tema, SEO y contenido heredan; shell, menús y páginas se copian', () => {
    const base = importar().documento;
    const sede = documentoSedeDesdeBase(base);
    expect(validarDocumentoSitio(sede).ok).toBe(true);
    expect(sede.tema.colores.primario).toEqual({ mode: 'inherit' });
    expect(sede.seo.titulo).toEqual({ mode: 'inherit' });
    expect(sede.paginas).toEqual(base.paginas);
    expect(sede.menus).toEqual(base.menus);
    // Copia, no referencia: editar la sede no toca la base.
    sede.paginas[0].titulo = 'Cambiado';
    expect(base.paginas[0].titulo).not.toBe('Cambiado');
  });
});

describe('importarMenuSuelto + reemplazarMenu', () => {
  test('una copia de sede entra al documento con su id propio', () => {
    const base = importar().documento;
    const entrada = entradaBase();
    const copia = { ...entrada.menus[0], id: UUID(950), branch_id: 7 };
    const items = entrada.itemsMenu.filter((i) => i.menu_id === UUID(900)).map((i) => ({ ...i, menu_id: UUID(950) }));
    const { menu } = importarMenuSuelto(base, copia, items);
    const doc = reemplazarMenu(base, menu);
    expect(doc.menus.map((m) => m.id)).toContain(UUID(950));
    expect(base.menus.map((m) => m.id)).not.toContain(UUID(950));
  });
});
