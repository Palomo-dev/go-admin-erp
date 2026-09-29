/**
 * @jest-environment jsdom
 *
 * Kit · `SelectorVariantes` (Figma `VariantModifierDialog` 155:7980): roles
 * y nombres accesibles, que cada toque llame lo que debe, el botón «Agregar N
 * · $ total», el bloqueo por agotado con su motivo, el aviso de un grupo
 * obligatorio, la hoja en móvil y otro idioma.
 */
import type { ComponentProps } from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { SelectorVariantes } from '../SelectorVariantes';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';

const moneda = { code: 'COP', decimals: 0, locale: 'es-CO' };

function renderSelector(props: Partial<ComponentProps<typeof SelectorVariantes>> = {}, idioma: 'es' | 'en' = 'es') {
  const fns = {
    onAbiertoChange: jest.fn(),
    onAtributo: jest.fn(),
    onOpcion: jest.fn(),
    onCantidad: jest.fn(),
    onAgregar: jest.fn(),
  };
  renderConIdioma(
    <SelectorVariantes
      abierto
      producto={{ nombre: 'Zapatilla urbana Nova 42' }}
      totalVariantes={6}
      atributos={[
        {
          nombre: 'Talla',
          valores: [
            { valor: '40', elegido: true, existe: true },
            { valor: '41', elegido: false, existe: true },
            { valor: '43', elegido: false, existe: false },
          ],
        },
        {
          nombre: 'Color',
          valores: [
            { valor: 'Negro', elegido: true, existe: true },
            { valor: 'Azul', elegido: false, existe: true, agotado: true },
          ],
        },
      ]}
      resumen={{ etiqueta: '40 · Negro · ZAP-0042-40-NEG', precio: 189900, stock: { tipo: 'disponible', cantidad: 4, sucursal: 'Sucursal Principal' } }}
      grupos={[
        {
          id: 1,
          nombre: 'Plantilla',
          regla: { tipo: 'uno' },
          obligatorio: true,
          opciones: [
            { id: 11, nombre: 'Sin plantilla', extra: 0, elegida: true },
            { id: 12, nombre: 'Plantilla ortopédica', extra: 25000, elegida: false },
          ],
        },
        {
          id: 2,
          nombre: 'Extras',
          regla: { tipo: 'hasta', maximo: 2 },
          obligatorio: false,
          opciones: [{ id: 21, nombre: 'Cordones de repuesto', extra: 8000, elegida: true }],
        },
      ]}
      cantidad={2}
      precioUnitario={197900}
      moneda={moneda}
      {...fns}
      {...props}
    />,
    { idioma },
  );
  return fns;
}

beforeEach(() => simularAncho(1440));

describe('SelectorVariantes (render)', () => {
  test('cabecera con nombre y subtítulo armado con los atributos', () => {
    renderSelector();
    const dialogo = screen.getByRole('dialog', { name: 'Zapatilla urbana Nova 42' });
    expect(within(dialogo).getByText('Elige talla y color · 6 variantes')).toBeTruthy();
  });

  test('un radiogroup por atributo; tocar un valor avisa con atributo y valor', () => {
    const f = renderSelector();
    const talla = screen.getByRole('radiogroup', { name: 'Talla' });
    const cuarenta = within(talla).getByRole('radio', { name: '40' });
    expect(cuarenta.getAttribute('aria-checked')).toBe('true');
    // La combinación que no existe se ve atenuada pero se puede tocar (salta de variante).
    const cuarentaYTres = within(talla).getByRole('radio', { name: '43' });
    expect(cuarentaYTres.className).toMatch(/opacity-45/);
    fireEvent.click(cuarentaYTres);
    expect(f.onAtributo).toHaveBeenCalledWith('Talla', '43');
    // El valor agotado lo anuncia el lector de pantalla.
    expect(within(screen.getByRole('radiogroup', { name: 'Color' })).getByRole('radio', { name: 'Azul · Agotado' })).toBeTruthy();
  });

  test('resumen con stock en la sucursal y precio; grupos con su insignia', () => {
    renderSelector();
    expect(screen.getByText('40 · Negro · ZAP-0042-40-NEG')).toBeTruthy();
    expect(screen.getByText('4 disponibles en Sucursal Principal')).toBeTruthy();
    expect(screen.getByText('Obligatorio · elige 1')).toBeTruthy();
    expect(screen.getByText('Hasta 2')).toBeTruthy();
  });

  test('las casillas de las opciones llaman con grupo y opción', () => {
    const f = renderSelector();
    const orto = screen.getByRole('checkbox', { name: 'Plantilla ortopédica' });
    expect(orto.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(orto);
    expect(f.onOpcion).toHaveBeenCalledWith(1, 12);
  });

  test('cantidad − n + y «Agregar 2 · $ 395.800»', () => {
    const f = renderSelector();
    const agregar = screen.getByRole('button', { name: /Agregar 2 · \$\s?395\.800/ });
    fireEvent.click(agregar);
    expect(f.onAgregar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Sumar una unidad' }));
    expect(f.onCantidad).toHaveBeenLastCalledWith(3);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar una unidad' }));
    expect(f.onCantidad).toHaveBeenLastCalledWith(1);
    fireEvent.change(screen.getByRole('textbox', { name: 'Cantidad' }), { target: { value: '7' } });
    expect(f.onCantidad).toHaveBeenLastCalledWith(7);
  });

  test('pedir más de lo disponible avisa en ámbar sin bloquear', () => {
    renderSelector({ cantidad: 6 });
    expect(screen.getByText('Solo hay 4 disponibles y pides 6')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Agregar 6/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  test('agotado: «Agregar» deshabilitado con el motivo asociado', () => {
    const f = renderSelector({
      bloqueo: 'agotado',
      resumen: { etiqueta: '40 · Azul', precio: 189900, stock: { tipo: 'agotado', sucursal: 'Sucursal Principal' } },
    });
    expect(screen.getByText('Agotado en Sucursal Principal')).toBeTruthy();
    const agregar = screen.getByRole('button', { name: /Agregar 2/ }) as HTMLButtonElement;
    expect(agregar.disabled).toBe(true);
    const motivo = document.getElementById(agregar.getAttribute('aria-describedby') ?? '');
    expect(motivo?.textContent).toBe('Esta variante está agotada en la sucursal: elige otra.');
    fireEvent.click(agregar);
    expect(f.onAgregar).not.toHaveBeenCalled();
  });

  test('sin precio: insignia y botón sin total', () => {
    renderSelector({ precioUnitario: null, resumen: { etiqueta: 'M', precio: null } });
    expect(screen.getAllByText('Sin precio').length).toBeGreaterThan(0);
    expect((screen.getByRole('button', { name: 'Agregar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  test('aviso de un grupo obligatorio: alerta y grupo inválido', () => {
    renderSelector({ errorGrupo: { grupoId: 1, mensaje: 'Selecciona una opción en «Plantilla»' } });
    expect(screen.getByRole('alert').textContent).toBe('Selecciona una opción en «Plantilla»');
    expect(screen.getByRole('group', { name: 'Plantilla' }).getAttribute('aria-invalid')).toBe('true');
  });

  test('lista sin atributos (198:14715): filas radio con precio, «Sin precio» o «Agotado»', () => {
    const f = { onElegirVariante: jest.fn() };
    renderSelector({
      atributos: [],
      resumen: null,
      grupos: [],
      totalVariantes: 3,
      lista: [
        { id: 1, nombre: 'Medias ×3 blancas', sku: 'MED-BL', precio: 24900, elegida: true },
        { id: 2, nombre: 'Medias ×3 negras', sku: 'MED-NE', precio: 24900, elegida: false, agotado: true },
        { id: 3, nombre: 'Medias ×3 grises', sku: 'MED-GR', precio: null, elegida: false },
      ],
      ...f,
    });
    expect(screen.getByText('Elige una de las 3 variantes')).toBeTruthy();
    const grupo = screen.getByRole('radiogroup', { name: 'Variantes de Zapatilla urbana Nova 42' });
    const filas = within(grupo).getAllByRole('radio');
    expect(filas).toHaveLength(3);
    expect(filas[0].getAttribute('aria-checked')).toBe('true');
    expect(within(filas[1]).getByText('Agotado')).toBeTruthy();
    expect(within(filas[2]).getByText('Sin precio')).toBeTruthy();
    fireEvent.click(filas[2]);
    expect(f.onElegirVariante).toHaveBeenCalledWith(3);
  });

  test('cargando y error con «Reintentar»', () => {
    const onReintentar = jest.fn();
    renderSelector({ errorCarga: { mensaje: 'No se pudieron cargar las variantes del producto.', onReintentar } });
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onReintentar).toHaveBeenCalled();
    expect((screen.getByRole('button', { name: /Agregar/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  test('móvil: hoja inferior con el mismo contenido', () => {
    simularAncho(390);
    renderSelector();
    const hoja = screen.getByRole('dialog', { name: 'Zapatilla urbana Nova 42' });
    expect(hoja.className).toMatch(/rounded-t-2xl/);
    expect(within(hoja).getByRole('radiogroup', { name: 'Talla' })).toBeTruthy();
  });

  test('en inglés', () => {
    renderSelector({}, 'en');
    expect(screen.getByText('Choose talla and color · 6 variants')).toBeTruthy();
    expect(screen.getByText('4 available at Sucursal Principal')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Add 2 · / })).toBeTruthy();
    expect(screen.getByText('Required · choose 1')).toBeTruthy();
  });
});
