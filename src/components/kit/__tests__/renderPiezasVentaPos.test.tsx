/**
 * @jest-environment jsdom
 *
 * Kit · render de las piezas de venta del POS (Testing Library, POS-PLAN D9):
 * `CartTag`, `CartLine`, `ProductCard` y `CategoryBar`. Roles, nombres
 * accesibles, que cada clic llame lo que debe (la estrella no agrega,
 * «Agotado» y «Sin precio» no se eligen), `aria-keyshortcuts` y otro idioma.
 */
import type { ComponentProps } from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { CartTag } from '../CartTag';
import { CartLine, type LineaCarrito } from '../CartLine';
import { ProductCard } from '../ProductCard';
import { CategoryBar } from '../CategoryBar';
import type { ProductoTarjeta } from '../productCardLogica';
import type { CategoriaBarra } from '../categoryBarLogica';
import { renderConIdioma } from '@/test-utils/renderConIdioma';

describe('CartTag (render)', () => {
  test('sin onClick es texto; con onClick es un botón que llama y anuncia su atajo', () => {
    const onClick = jest.fn();
    const { rerender } = renderConIdioma(<CartTag tono="informacion">En preparación</CartTag>);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('En preparación')).toBeTruthy();
    rerender(
      <CartTag origen="manual" onClick={onClick} atajo="D">
        -$ 10.000
      </CartTag>,
    );
    const boton = screen.getByRole('button', { name: /-\$ 10\.000/ });
    expect(boton.getAttribute('aria-keyshortcuts')).toBe('D');
    expect(boton.getAttribute('title')).toBe('Descuento manual');
    fireEvent.click(boton);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('descuento general: sufijo y tooltip traducidos', () => {
    renderConIdioma(<CartTag origen="general">-$ 6.667</CartTag>, { idioma: 'en' });
    const tag = screen.getByTitle('Part of the sale’s general discount');
    expect(tag.textContent).toBe('-$ 6.667 · general');
  });
});

const linea: LineaCarrito = {
  id: 'l1',
  nombre: 'Pan artesanal',
  variante: 'Integral',
  sku: 'PAN-01',
  cantidad: 1,
  unidad: 'und',
  precioUnitario: 45000,
  total: 45000,
  impuesto: { modo: 'incluido', importe: 7185 },
};

function renderLinea(props: Partial<ComponentProps<typeof CartLine>> = {}, idioma: 'es' | 'en' = 'es') {
  const fns = {
    onCantidad: jest.fn(),
    onIncluidoChange: jest.fn(),
    onNota: jest.fn(),
    onExcluirImpuesto: jest.fn(),
    onQuitar: jest.fn(),
    onAgregarDescuento: jest.fn(),
    onFoco: jest.fn(),
  };
  renderConIdioma(<CartLine linea={linea} moneda="COP" incluido {...fns} {...props} />, { idioma });
  return fns;
}

describe('CartLine (render)', () => {
  test('grupo con el nombre, importe, precio por unidad e impuesto incluido; SKU en el tooltip', () => {
    renderLinea();
    const grupo = screen.getByRole('group', { name: 'Pan artesanal' });
    expect(grupo.textContent).toMatch(/1 × \$\s?45\.000 \/ und/);
    expect(grupo.textContent).toMatch(/inc\. \$\s?7\.185 impuestos/);
    expect(screen.getByTitle('Pan artesanal · Integral · SKU PAN-01')).toBeTruthy();
  });

  test('− con cantidad 1 pide 0 (la pantalla confirma); + pide 2', () => {
    const f = renderLinea();
    fireEvent.click(screen.getByRole('button', { name: 'Disminuir la cantidad de Pan artesanal' }));
    expect(f.onCantidad).toHaveBeenLastCalledWith(0);
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar la cantidad de Pan artesanal' }));
    expect(f.onCantidad).toHaveBeenLastCalledWith(2);
  });

  test('el campo de cantidad no manda ≤ 0 ni vacío', () => {
    const f = renderLinea();
    const campo = screen.getByRole('textbox', { name: 'Cantidad de Pan artesanal' });
    fireEvent.change(campo, { target: { value: '0' } });
    fireEvent.change(campo, { target: { value: '' } });
    expect(f.onCantidad).not.toHaveBeenCalled();
    fireEvent.change(campo, { target: { value: '4' } });
    expect(f.onCantidad).toHaveBeenCalledWith(4);
  });

  test('acciones con su atajo anunciado y su llamada', () => {
    const f = renderLinea();
    const nota = screen.getByRole('button', { name: 'Agregar nota a Pan artesanal' });
    const excluir = screen.getByRole('button', { name: 'Excluir el impuesto de Pan artesanal' });
    const quitar = screen.getByRole('button', { name: 'Quitar Pan artesanal del carrito' });
    const descuento = screen.getByRole('button', { name: 'Agregar descuento a Pan artesanal' });
    expect(nota.getAttribute('aria-keyshortcuts')).toBe('N');
    expect(excluir.getAttribute('aria-keyshortcuts')).toBe('T');
    expect(excluir.getAttribute('aria-pressed')).toBe('false');
    expect(quitar.getAttribute('aria-keyshortcuts')).toBe('Delete');
    expect(quitar.getAttribute('title')).toBe('Quitar (Supr)');
    expect(descuento.getAttribute('aria-keyshortcuts')).toBe('D');
    fireEvent.click(nota);
    fireEvent.click(excluir);
    fireEvent.click(quitar);
    fireEvent.click(descuento);
    expect(f.onNota).toHaveBeenCalledTimes(1);
    expect(f.onExcluirImpuesto).toHaveBeenCalledTimes(1);
    expect(f.onQuitar).toHaveBeenCalledTimes(1);
    expect(f.onAgregarDescuento).toHaveBeenCalledTimes(1);
  });

  test('«Incluido» avisa el cambio; el foco en la línea avisa a la pantalla', () => {
    const f = renderLinea();
    const casilla = screen.getByRole('checkbox', { name: 'Incluido' });
    fireEvent.click(casilla);
    expect(f.onIncluidoChange).toHaveBeenCalledWith(false);
    fireEvent.focus(casilla);
    expect(f.onFoco).toHaveBeenCalled();
  });

  test('impuesto excluido: «Sin impuesto», etiqueta, excluir pulsado e «Incluido» deshabilitado', () => {
    renderLinea({ linea: { ...linea, impuesto: { modo: 'excluido' } } });
    expect(screen.getByText('Sin impuesto')).toBeTruthy();
    expect(screen.getByText('Sin impuesto (excluido)')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Excluir el impuesto/ }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByRole('checkbox', { name: 'Incluido' }) as HTMLInputElement).disabled).toBe(true);
  });

  test('bloqueada: controles deshabilitados y sin «Agregar descuento»', () => {
    renderLinea({ bloqueada: true });
    expect((screen.getByRole('button', { name: /Disminuir/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Quitar/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('textbox') as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /Agregar descuento/ })).toBeNull();
  });

  test('con descuento no ofrece agregarlo; las ranuras se pintan', () => {
    renderLinea({
      conDescuento: true,
      etiquetas: [<CartTag key="d" origen="manual">-$ 5.000</CartTag>],
      editorNota: <div>Editor de nota</div>,
      accionExtra: <button type="button">Más</button>,
    });
    expect(screen.queryByRole('button', { name: /Agregar descuento/ })).toBeNull();
    expect(screen.getByText('-$ 5.000')).toBeTruthy();
    expect(screen.getByText('Editor de nota')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Más' })).toBeTruthy();
  });

  test('móvil sin etiquetas ni descuento: no pinta el tercer renglón', () => {
    renderLinea({ layout: 'movil', onAgregarDescuento: undefined });
    const grupo = screen.getByRole('group', { name: 'Pan artesanal' });
    // Renglón 1 y renglón 2 (cantidad · Incluido · acciones), nada más.
    expect(grupo.children.length).toBe(2);
  });

  test('en inglés', () => {
    renderLinea({ linea: { ...linea, impuesto: { modo: 'encima', importe: 1900 } } }, 'en');
    expect(screen.getByRole('checkbox', { name: 'Included' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove Pan artesanal from the cart' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Pan artesanal' }).textContent).toMatch(/\+\$\s?1[.,]900 taxes/);
  });
});

const producto: ProductoTarjeta = {
  id: 10,
  nombre: 'Zapatilla urbana Nova 42',
  precio: 189900,
  precioComparacion: 229900,
  variantes: 3,
  stock: { cantidad: 22 },
  top: 12,
};

describe('ProductCard (render)', () => {
  test('un control principal «Elegir {nombre}»; el clic en la tarjeta también elige', () => {
    const onElegir = jest.fn();
    const { container } = renderConIdioma(<ProductCard producto={producto} moneda="COP" onElegir={onElegir} />);
    const elegir = screen.getByRole('button', { name: 'Elegir Zapatilla urbana Nova 42' });
    fireEvent.click(elegir);
    expect(onElegir).toHaveBeenCalledTimes(1);
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onElegir).toHaveBeenCalledTimes(2);
    expect(screen.getByText('-17 %')).toBeTruthy();
    expect(screen.getByText('3 var.')).toBeTruthy();
    expect(screen.getByText('22 uds')).toBeTruthy();
    expect(screen.getByTitle('12 unidades vendidas en los últimos 90 días')).toBeTruthy();
  });

  test('la estrella no agrega y cambia su tooltip según el estado', () => {
    const onElegir = jest.fn();
    const onFavorito = jest.fn();
    const { rerender } = renderConIdioma(<ProductCard producto={producto} moneda="COP" onElegir={onElegir} onFavorito={onFavorito} />);
    const estrella = screen.getByRole('button', { name: 'Marcar Zapatilla urbana Nova 42 como favorita' });
    expect(estrella.getAttribute('title')).toBe('Marcar como favorita');
    fireEvent.click(estrella);
    expect(onFavorito).toHaveBeenCalledTimes(1);
    expect(onElegir).not.toHaveBeenCalled();
    rerender(<ProductCard producto={{ ...producto, favorito: true }} moneda="COP" onElegir={onElegir} onFavorito={onFavorito} />);
    expect(screen.getByRole('button', { name: 'Quitar Zapatilla urbana Nova 42 de favoritas' }).getAttribute('title')).toBe('Quitar de favoritas');
  });

  test('la receta no agrega', () => {
    const onElegir = jest.fn();
    const onReceta = jest.fn();
    renderConIdioma(<ProductCard producto={{ ...producto, receta: true }} moneda="COP" onElegir={onElegir} onReceta={onReceta} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver la receta de Zapatilla urbana Nova 42' }));
    expect(onReceta).toHaveBeenCalledTimes(1);
    expect(onElegir).not.toHaveBeenCalled();
  });

  test('agotado: «Agotado» sobre la imagen y no se elige (ni el botón ni la tarjeta)', () => {
    const onElegir = jest.fn();
    const { container } = renderConIdioma(<ProductCard producto={{ ...producto, agotado: true }} moneda="COP" onElegir={onElegir} />);
    const boton = screen.getByRole('button', { name: 'Agotado Zapatilla urbana Nova 42' });
    expect(boton.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(boton);
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onElegir).not.toHaveBeenCalled();
    expect(screen.getByText('Sin stock')).toBeTruthy();
  });

  test('sin precio (B-14): «Sin precio» y no se elige', () => {
    const onElegir = jest.fn();
    renderConIdioma(<ProductCard producto={{ ...producto, precio: null, precioComparacion: null }} moneda="COP" onElegir={onElegir} />);
    const boton = screen.getByRole('button', { name: 'Sin precio Zapatilla urbana Nova 42' });
    expect(boton.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(boton);
    expect(onElegir).not.toHaveBeenCalled();
    expect(screen.getAllByText('Sin precio').length).toBeGreaterThan(0);
  });

  test('sin foto: marcador con icono e inicial', () => {
    renderConIdioma(<ProductCard producto={producto} moneda="COP" onElegir={() => undefined} />);
    const marcador = screen.getByRole('img', { name: 'Sin foto' });
    expect(marcador.textContent).toBe('Z');
  });

  test('foco itinerante: tabIndex y ref llegan al control principal', () => {
    const ref = { current: null as HTMLButtonElement | null };
    renderConIdioma(<ProductCard ref={ref} producto={producto} moneda="COP" onElegir={() => undefined} tabIndex={-1} enfocada />);
    expect(ref.current?.getAttribute('tabindex')).toBe('-1');
    expect(ref.current?.textContent).toContain('Elegir');
  });

  test('lista: botón «+» y estrella aparte, en inglés', () => {
    const onElegir = jest.fn();
    const onFavorito = jest.fn();
    renderConIdioma(<ProductCard producto={producto} variante="movil-lista" moneda="COP" onElegir={onElegir} onFavorito={onFavorito} />, {
      idioma: 'en',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mark Zapatilla urbana Nova 42 as favorite' }));
    expect(onElegir).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Select Zapatilla urbana Nova 42' }));
    expect(onElegir).toHaveBeenCalledTimes(1);
    expect(screen.getByText('3 var. · 22 units')).toBeTruthy();
  });
});

const categorias: CategoriaBarra[] = [
  { id: 7, nombre: 'Bebidas', conteo: 42, top: 30, favorita: true, color: 'rgb(14 165 233)' },
  { id: 3, nombre: 'Panadería', conteo: 18 },
];

describe('CategoryBar (render)', () => {
  test('radiogroup con «Todas», «Favoritas» y las categorías; el clic elige', () => {
    const onValorChange = jest.fn();
    renderConIdioma(<CategoryBar categorias={categorias} valor={null} onValorChange={onValorChange} mostrarFavoritas />);
    const grupo = screen.getByRole('radiogroup', { name: 'Categorías' });
    const radios = within(grupo).getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('data-clave'))).toEqual(['todas', 'favoritas', 'c:7', 'c:3']);
    expect(radios[0].getAttribute('aria-checked')).toBe('true');
    expect(radios.map((r) => r.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1']);
    fireEvent.click(radios[3]);
    expect(onValorChange).toHaveBeenCalledWith(3);
    fireEvent.click(radios[1]);
    expect(onValorChange).toHaveBeenLastCalledWith('favoritas');
  });

  test('flechas: mueven y eligen', () => {
    const onValorChange = jest.fn();
    renderConIdioma(<CategoryBar categorias={categorias} valor={7} onValorChange={onValorChange} />);
    const radios = screen.getAllByRole('radio');
    fireEvent.keyDown(radios[1], { key: 'ArrowRight' });
    expect(onValorChange).toHaveBeenLastCalledWith(3);
    fireEvent.keyDown(radios[1], { key: 'Home' });
    expect(onValorChange).toHaveBeenLastCalledWith(null);
  });

  test('la estrella marca la favorita sin cambiar el filtro; «Top» con su tooltip', () => {
    const onValorChange = jest.fn();
    const onFavorita = jest.fn();
    renderConIdioma(<CategoryBar categorias={categorias} valor={null} onValorChange={onValorChange} onFavorita={onFavorita} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Bebidas de favoritas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Marcar Panadería como favorita' }));
    expect(onFavorita.mock.calls).toEqual([[7], [3]]);
    expect(onValorChange).not.toHaveBeenCalled();
    expect(screen.getByTitle('30 unidades vendidas en los últimos 90 días')).toBeTruthy();
  });

  test('modo imágenes: mismos radios', () => {
    const onValorChange = jest.fn();
    renderConIdioma(<CategoryBar modo="imagenes" categorias={categorias} valor={3} onValorChange={onValorChange} />);
    const radios = screen.getAllByRole('radio');
    expect(radios[2].getAttribute('aria-checked')).toBe('true');
    fireEvent.click(radios[1]);
    expect(onValorChange).toHaveBeenCalledWith(7);
  });

  test('en inglés', () => {
    renderConIdioma(<CategoryBar categorias={categorias} valor={null} onValorChange={() => undefined} mostrarFavoritas />, { idioma: 'en' });
    expect(screen.getByRole('radiogroup', { name: 'Categories' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'All' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Favorites' })).toBeTruthy();
  });
});
