/**
 * @jest-environment jsdom
 *
 * Render del editor de receta y del bloque «Avanzado › Receta» del formulario,
 * con el proveedor real de next-intl en los 4 idiomas (una clave que falte
 * rompe la prueba). El costo lo da un doble de fn_receta_costo.
 */
const costo = jest.fn();
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/services/recipeService', () => {
  const real = jest.requireActual('@/lib/services/recipeService');
  return {
    ...real,
    recipeService: {
      costo: (...a: unknown[]) => costo(...a),
      buscarIngredientes: jest.fn(async () => []),
      ingredientePorId: jest.fn(async () => null),
    },
  };
});
jest.mock('@/lib/context/BranchContext', () => ({ useBranch: () => ({ selectedBranchId: 109 }) }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ formatDate: () => '12 ago 2026' }) }));
jest.mock('next/dynamic', () => () => () => null);

import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { normalizarCosto } from '@/lib/services/recipeService';
import { EditorReceta } from '../EditorReceta';
import { ingredienteDesdeOpcion, recetaVacia, type RecetaBorrador } from '../recetaLogica';
import { SeccionReceta } from '@/components/inventario/productos/formulario/secciones/SeccionReceta';
import { estadoInicial, type EstadoFormularioProducto } from '@/components/inventario/productos/logica/formularioProducto';
import { CATALOGOS_VACIOS, type PropsSeccionFormulario } from '@/components/inventario/productos/formulario/tipos';

const unidades = [
  { code: 'GR', name: 'Gramo', unit_type: 'weight' },
  { code: 'KG', name: 'Kilogramo', unit_type: 'weight' },
  { code: 'UN', name: 'Unidad', unit_type: 'count' },
];

function borrador(): RecetaBorrador {
  return {
    ...recetaVacia('UN'),
    ingredientes: [
      ingredienteDesdeOpcion({ id: 10, nombre: 'Pan brioche', sku: 'PAN-004', unidad: 'UN', trackStock: true }),
      { ...ingredienteDesdeOpcion({ id: 11, nombre: 'Carne molida', sku: 'CAR-010', unidad: 'KG', trackStock: true }), cantidad: 150, unidad: 'GR' },
      { ...ingredienteDesdeOpcion({ id: 12, nombre: 'Tocineta', sku: 'TOC-003', unidad: 'UN', trackStock: true }), cantidad: 40, unidad: 'GR' },
    ],
  };
}

const respuesta = normalizarCosto({
  permitido: true, rinde: 1, costo_tanda: 5100, costo_unidad: 5100, completo: false, lineas_sin_costo: 0, lineas_con_error: 1,
  lineas: [
    { orden: 1, ingredient_product_id: 10, cantidad: 1, factor: 1, costo_unitario: 1200, costo_linea: 1200, existencia: 120, unidad_receta: 'UN', unidad_ingrediente: 'UN', fuente: 'promedio_sucursal', error: null },
    { orden: 2, ingredient_product_id: 11, cantidad: 0.15, factor: 0.001, costo_unitario: 26000, costo_linea: 3900, existencia: 18, unidad_receta: 'GR', unidad_ingrediente: 'KG', fuente: 'promedio_sucursal', error: null },
    { orden: 3, ingredient_product_id: 12, cantidad: 40, factor: null, costo_unitario: 900, costo_linea: null, existencia: 5, unidad_receta: 'GR', unidad_ingrediente: 'UN', fuente: 'promedio_sucursal', error: 'conversion_faltante' },
  ],
});

beforeEach(() => {
  jest.useFakeTimers();
  costo.mockReset().mockResolvedValue(respuesta);
});
afterEach(() => jest.useRealTimers());

describe.each<IdiomaPrueba>(['es', 'en', 'fr', 'pt'])('EditorReceta (%s)', (idioma) => {
  it('pinta ingredientes, costo del servidor y la fila sin conversión', async () => {
    const onCambio = jest.fn();
    renderConIdioma(
      <EditorReceta
        idBase="t"
        valor={borrador()}
        onCambio={onCambio}
        organizacionId={134}
        sucursal={{ id: 109, nombre: 'Principal' }}
        unidades={unidades}
        precioVenta={24900}
        formatearMoneda={(n) => `$${Math.round(n)}`}
      />,
      { idioma },
    );
    expect(screen.getByText('Carne molida')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(450);
    });
    await waitFor(() => expect(costo).toHaveBeenCalledTimes(1));
    expect(costo.mock.calls[0][0]).toBe(134);
    expect(costo.mock.calls[0][1]).toBe(109);
    expect(costo.mock.calls[0][2].ingredientes[1]).toMatchObject({ ingredient_product_id: 11, quantity: 150, unit_code: 'GR' });
    await waitFor(() => expect(screen.getAllByText('$3900').length).toBeGreaterThan(0));
    expect(screen.getAllByText('$5100').length).toBeGreaterThan(0);
    // Tocineta en GR sin conversión a UN: error con la acción «Crear conversión».
    expect(screen.getAllByRole('alert').some((a) => /GR/.test(a.textContent ?? '') && /UN/.test(a.textContent ?? ''))).toBe(true);
  });
});

describe('validación en línea', () => {
  it('cantidad 0 se marca en la fila y el editor vacío invita a agregar', () => {
    const b = borrador();
    b.ingredientes[0].cantidad = 0;
    renderConIdioma(
      <EditorReceta idBase="t" valor={b} onCambio={jest.fn()} organizacionId={134} sucursal={{ id: 109, nombre: 'Principal' }}
        unidades={unidades} formatearMoneda={String} />,
    );
    expect(screen.getByText('La cantidad debe ser mayor que 0.')).toBeTruthy();
  });
  it('el propio producto como ingrediente se marca para quitarlo', () => {
    renderConIdioma(
      <EditorReceta idBase="t" valor={borrador()} onCambio={jest.fn()} organizacionId={134} sucursal={{ id: 109, nombre: 'Principal' }}
        unidades={unidades} formatearMoneda={String} excluirIds={[11]} />,
    );
    expect(screen.getByText('Es el propio producto o una de sus variantes: quítalo de la receta.')).toBeTruthy();
  });
});

function props(estado: EstadoFormularioProducto, actualizar = jest.fn()): PropsSeccionFormulario {
  return {
    estado,
    cambiar: jest.fn(),
    actualizar,
    errores: {},
    modo: 'crear',
    catalogos: { ...CATALOGOS_VACIOS, unidades, sucursales: [{ branch_id: 109, nombre: 'Principal', principal: true }] },
    agregarACatalogo: jest.fn(),
    organizacionId: 134,
    moneda: { codigo: 'COP', simbolo: '$', decimales: 0, formatear: (n) => `$${n}` },
    hoy: '2026-09-28',
  };
}

describe.each<IdiomaPrueba>(['es', 'en', 'fr', 'pt'])('SeccionReceta (%s)', (idioma) => {
  it('apagada: solo el interruptor; al encenderla crea una receta vacía en la unidad del producto', () => {
    const actualizar = jest.fn();
    const e = { ...estadoInicial(), sku: 'HAM', name: 'Hamburguesa' };
    renderConIdioma(<SeccionReceta {...props(e, actualizar)} />, { idioma });
    fireEvent.click(screen.getByRole('switch'));
    expect(actualizar).toHaveBeenCalledWith({ receta: expect.objectContaining({ activa: true, compartida: expect.objectContaining({ unidadRinde: 'UN', ingredientes: [] }) }) });
  });
  it('por variante: chips por variante y «Al producir» sin inventario avisa', () => {
    const e: EstadoFormularioProducto = {
      ...estadoInicial(),
      sku: 'HAM',
      name: 'Hamburguesa',
      track_stock: false,
      tiene_variantes: true,
      variantes: [
        { clave: 'v_1', sku: 'S', barcode: '', name: 'Sencilla', attributes: {}, price: null, compare_price: null, cost: null, status: 'active', stock: [] },
        { clave: 'v_2', sku: 'D', barcode: '', name: 'Doble', attributes: {}, price: null, compare_price: null, cost: null, status: 'active', stock: [] },
      ],
      receta: { activa: true, modo: 'al_producir', alcance: 'por_variante', compartida: borrador(), porVariante: { v_2: borrador() } },
    };
    renderConIdioma(<SeccionReceta {...props(e)} />, { idioma });
    expect(screen.getAllByText(/Doble/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });
});
