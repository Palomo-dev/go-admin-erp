import { OPCIONES_SHELL, COLUMNAS_NUEVAS_SHELL } from '@/lib/website/v2/mapeoAjustes';
import { CLAVES_ENCABEZADO } from '@/lib/website/ajustesVivos';
import { opcionBooleana, cambiosParaFilaLegacy } from '../inspector/zonaGlobalLogica';
import { campoLayoutCategorias } from '../inspector/layoutCategorias';
import type { ContentFieldDef } from '@/lib/services/websitePageBuilderService';

describe('mobile_search_bar_categories', () => {
  it('está en el contrato del encabezado, booleana y apagada por defecto', () => {
    expect(OPCIONES_SHELL.mobile_search_bar_categories).toMatchObject({ zona: 'header', porDefecto: false, regla: { tipo: 'booleano' }, nueva: true });
    expect(COLUMNAS_NUEVAS_SHELL).toContain('mobile_search_bar_categories');
  });
  it('la vista previa en vivo la manda al lienzo', () => {
    expect(CLAVES_ENCABEZADO as readonly string[]).toContain('mobile_search_bar_categories');
  });
  it('sin guardar: false; guardada: su valor', () => {
    expect(opcionBooleana({}, 'mobile_search_bar_categories')).toBe(false);
    expect(opcionBooleana({ mobile_search_bar_categories: true }, 'mobile_search_bar_categories')).toBe(true);
  });
  it('legacy sin la columna: no se envía (no rompe el guardado)', () => {
    expect(cambiosParaFilaLegacy({ mobile_search_bar_categories: true }, { search_style: 'bar' }).omitidas).toEqual(['mobile_search_bar_categories']);
  });
});

describe('Layout en escritorio de categorías', () => {
  const campo: ContentFieldDef = {
    key: 'desktop_layout', label: 'Layout en escritorio', type: 'select', group: 'layout', defaultValue: 'grid',
    options: [{ value: 'grid', label: 'Grid' }, { value: 'carousel', label: 'Carrusel' }, { value: 'list', label: 'Lista' }],
  } as ContentFieldDef;
  const valores = (c: ContentFieldDef | null) => c?.options?.map((o) => o.value);
  it('sin estilo o superpuesto: las tres opciones de siempre', () => {
    expect(campoLayoutCategorias(campo, {}, 'categories_grid')).toBe(campo);
    expect(campoLayoutCategorias(campo, { category_style: 'overlay' }, 'categories_grid')).toBe(campo);
  });
  it('pastilla y círculo: solo Grid y Carrusel', () => {
    expect(valores(campoLayoutCategorias(campo, { category_style: 'pill' }, 'categories_grid'))).toEqual(['grid', 'carousel']);
    expect(valores(campoLayoutCategorias(campo, { category_style: 'circle' }, 'categories_grid'))).toEqual(['grid', 'carousel']);
  });
  it('estilos que no lo leen: se oculta', () => {
    for (const e of ['card_bottom', 'bento', 'minimal_icon']) expect(campoLayoutCategorias(campo, { category_style: e }, 'categories_grid')).toBeNull();
  });
  it('otras secciones: igual', () => {
    expect(campoLayoutCategorias(campo, { category_style: 'pill' }, 'products_grid')).toBe(campo);
  });
});
