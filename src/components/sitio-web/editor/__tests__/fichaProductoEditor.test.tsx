/**
 * @jest-environment jsdom
 *
 * «Ficha de producto» en el editor (decisión del dueño 2026-11-22, opción A):
 * - el selector de páginas la muestra junto a Inicio y las demás, en el grupo «Plantillas de la
 *   tienda» y con su icono (la bolsa, no la caja de «Productos»);
 * - al abrirla, el lienzo dice con qué producto real se ve, deja elegir otro y avisa que pinta la
 *   versión publicada. Textos en es/en/fr/pt. Datos ficticios.
 */
import { fireEvent, screen } from '@testing-library/react';
import { FileText, Home, LayoutGrid, Package, ShoppingBag } from 'lucide-react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { gruposPaginasSelector } from '../paginasSelector';
import { MuestraPlantillaLienzo, tieneMuestra } from '../MuestraPlantillaLienzo';
import { BarraEditor, type BarraEditorProps } from '../BarraEditor';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/app/sitio-web/editor/p-inicio',
  useSearchParams: () => new URLSearchParams(),
}));

const PAGINAS = [
  { id: 'p-nosotros', title: 'Nosotros', tipo: 'builtin', slug: 'nosotros' },
  { id: 'p-ficha', title: 'Ficha de producto', tipo: 'product_detail', slug: 'plantillas/product-detail' },
  { id: 'p-inicio', title: 'Inicio', tipo: 'home', slug: 'home' },
  { id: 'p-productos', title: 'Productos', tipo: 'builtin', slug: 'productos' },
  { id: 'p-categoria', title: 'Página de categoría', tipo: 'category_detail', slug: 'plantillas/category-detail' },
];

describe('gruposPaginasSelector', () => {
  it('Inicio primero, luego las del sitio en su orden; las plantillas de la tienda en su grupo', () => {
    const g = gruposPaginasSelector(PAGINAS);
    expect(g.sitio.map((p) => p.id)).toEqual(['p-inicio', 'p-nosotros', 'p-productos']);
    expect(g.tienda.map((p) => p.id)).toEqual(['p-ficha', 'p-categoria']);
  });

  it('cada página con el icono de su tipo; la ficha es la bolsa', () => {
    const g = gruposPaginasSelector(PAGINAS);
    const icono = (id: string) => [...g.sitio, ...g.tienda].find((p) => p.id === id)?.icono;
    expect(icono('p-inicio')).toBe(Home);
    expect(icono('p-productos')).toBe(Package);
    expect(icono('p-ficha')).toBe(ShoppingBag);
    expect(icono('p-categoria')).toBe(LayoutGrid);
  });

  it('sin tipo (lista vieja) todo va al grupo del sitio, sin romper', () => {
    const g = gruposPaginasSelector([{ id: 'a', title: 'A' }, { id: 'b', title: 'B', tipo: 'custom', slug: 'promo' }]);
    expect(g.tienda).toEqual([]);
    expect(g.sitio.map((p) => p.id)).toEqual(['a', 'b']);
    expect(g.sitio[1].icono).toBe(FileText);
  });
});

function propsBarra(paginaId: string): BarraEditorProps {
  return {
    paginas: PAGINAS,
    paginaId,
    onCambiarPagina: jest.fn(),
    sitioActual: null,
    sedes: [],
    dispositivo: 'escritorio',
    onDispositivo: jest.fn(),
    onDeshacer: jest.fn(),
    onRehacer: jest.fn(),
    puedeDeshacer: false,
    puedeRehacer: false,
    estado: null,
    enV2: true,
    urlPublica: null,
    onVistaPrevia: jest.fn(),
    textoPublicar: 'Publicar',
    onPublicar: jest.fn(),
    puedePublicar: true,
    acciones: [],
  };
}

describe('BarraEditor: selector de páginas', () => {
  it('con la ficha abierta, el selector la nombra', () => {
    renderConIdioma(<BarraEditor {...propsBarra('p-ficha')} />);
    expect(screen.getByRole('combobox', { name: 'Página que editas' }).textContent).toContain('Ficha de producto');
  });

  it.each<[IdiomaPrueba, string]>([
    ['es', 'Plantillas de la tienda'],
    ['en', 'Store templates'],
    ['fr', 'Modèles de la boutique'],
    ['pt', 'Modelos da loja'],
  ])('%s: la lista trae la ficha en «%s»', (idioma, grupo) => {
    renderConIdioma(<BarraEditor {...propsBarra('p-inicio')} />, { idioma });
    const selector = screen.getAllByRole('combobox')[0];
    fireEvent.keyDown(selector, { key: 'Enter' });
    expect(screen.getByText(grupo)).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Ficha de producto' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Inicio' })).toBeTruthy();
  });
});

describe('MuestraPlantillaLienzo', () => {
  it('solo en plantillas con registro de ejemplo', () => {
    expect(['product_detail', 'category_detail', 'space_detail'].every(tieneMuestra)).toBe(true);
    expect(['home', 'cart', 'checkout', null, undefined].some(tieneMuestra)).toBe(false);
  });

  it('dice con qué producto real se ve, deja elegir otro y avisa que pinta el borrador', () => {
    const onCambiar = jest.fn();
    renderConIdioma(
      <MuestraPlantillaLienzo
        muestra={{ tipo: 'product_detail', opciones: [{ id: 'u1', label: 'Camisa azul (SKU-1)' }, { id: 'u2', label: 'Gorra' }], valor: 'u1', onCambiar }}
      />,
    );
    const selector = screen.getByRole('combobox', { name: 'Ver con el producto' });
    expect(selector.textContent).toContain('Camisa azul (SKU-1)');
    expect(screen.getByText(/Se ve con tu borrador/)).toBeTruthy();
    fireEvent.keyDown(selector, { key: 'Enter' });
    fireEvent.click(screen.getByRole('option', { name: 'Gorra' }));
    expect(onCambiar).toHaveBeenCalledWith('u2');
  });

  it('la ficha de espacio sigue avisando que pinta lo publicado', () => {
    renderConIdioma(<MuestraPlantillaLienzo muestra={{ tipo: 'space_detail', opciones: [], valor: null, onCambiar: jest.fn() }} />);
    expect(screen.getByText(/muestra la versión publicada de esta plantilla/)).toBeTruthy();
  });

  it.each<[IdiomaPrueba, string, string]>([
    ['en', 'Preview with product', 'There are no active records'],
    ['fr', 'Voir avec le produit', 'Aucun enregistrement actif'],
    ['pt', 'Ver com o produto', 'Ainda não há registros ativos'],
  ])('%s: textos propios, también sin productos', (idioma, etiqueta, vacio) => {
    const { unmount } = renderConIdioma(
      <MuestraPlantillaLienzo muestra={{ tipo: 'product_detail', opciones: [{ id: 'u1', label: 'X' }], valor: 'u1', onCambiar: jest.fn() }} />,
      { idioma },
    );
    expect(screen.getByRole('combobox', { name: etiqueta })).toBeTruthy();
    unmount();
    renderConIdioma(<MuestraPlantillaLienzo muestra={{ tipo: 'product_detail', opciones: [], valor: null, onCambiar: jest.fn() }} />, { idioma });
    expect(screen.getByText(new RegExp(vacio))).toBeTruthy();
  });
});
