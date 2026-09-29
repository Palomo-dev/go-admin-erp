/**
 * @jest-environment jsdom
 *
 * Kit · render de las piezas compartidas del formulario de documento (venta,
 * compra, orden de compra): «Agregar productos» (Enter agrega el primero,
 * ↑/↓, escáner, «Listo (n agregados)», crear producto que vuelve como
 * línea), «Elegir …» con chips y alta en línea que vuelve elegida, ítem
 * manual (validación, Enter agrega, vista previa), impuestos por línea
 * (varios, «Sin impuesto») y los estados de la tabla de líneas.
 */
import * as React from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { AgregarProductosDialog } from '../documento/AgregarProductosDialog';
import { DialogoItemManual } from '../documento/DialogoItemManual';
import { ImpuestosLinea } from '../documento/ImpuestosLinea';
import { DocumentoLineas } from '../documento/DocumentoLineas';
import { FormularioRapidoProducto } from '../documento/FormularioRapidoProducto';
import { FormularioRapidoTercero } from '../documento/FormularioRapidoTercero';
import { CustomerPicker } from '../CustomerPicker';
import type { ClientePicker } from '../selectorEntidadLogica';
import type { OpcionImpuesto, ProductoDocumento } from '../documento/edicionDocumentoLogica';

const moneda = { code: 'COP', decimals: 0, locale: 'es-CO' };
const IVA: OpcionImpuesto = { id: 'iva', codigo: 'IVA_19', nombre: 'IVA', tarifa: 19, predeterminado: true };
const ULTRA: OpcionImpuesto = { id: 'ul', codigo: null, nombre: 'Ultraprocesados', tarifa: 20 };

const productos: ProductoDocumento[] = [
  { id: 1, nombre: 'Zapatilla urbana Nova 42', sku: 'ZAP-NOVA-42', codigoBarras: '7700001', precio: 320000, stock: 14, controlaStock: true, descripcion: '<p>Cuero <b>negro</b></p>' },
  { id: 2, nombre: 'Morral urbano 25 L', sku: 'MOR-25', precio: 150000, stock: 0, controlaStock: true },
];

function Dialogo(props: Partial<React.ComponentProps<typeof AgregarProductosDialog>> & { onAgregar?: jest.Mock }) {
  const [abierto, setAbierto] = React.useState(true);
  return (
    <AgregarProductosDialog
      abierto={abierto}
      onAbiertoChange={setAbierto}
      variante="venta"
      moneda={moneda}
      buscar={async () => productos}
      onAgregar={props.onAgregar ?? jest.fn()}
      {...props}
    />
  );
}

describe('Agregar productos', () => {
  test('Enter agrega el primero; ↓ y Enter el siguiente; el pie cuenta los agregados; sin HTML en la descripción', async () => {
    const onAgregar = jest.fn();
    renderConIdioma(<Dialogo onAgregar={onAgregar} />);
    await screen.findByRole('option', { name: /Zapatilla urbana Nova 42/ });
    expect(screen.getByText('Cuero negro')).toBeTruthy();
    expect(screen.queryByText(/<p>/)).toBeNull();
    const buscador = screen.getByRole('combobox', { name: /Buscar por nombre/ });
    expect(document.activeElement).toBe(buscador);
    fireEvent.keyDown(buscador, { key: 'Enter' });
    expect(onAgregar).toHaveBeenLastCalledWith(productos[0]);
    fireEvent.keyDown(buscador, { key: 'ArrowDown' });
    fireEvent.keyDown(buscador, { key: 'Enter' });
    expect(onAgregar).toHaveBeenLastCalledWith(productos[1]);
    expect(screen.getByRole('button', { name: 'Listo (2 agregados)' })).toBeTruthy();
    expect(screen.getByText('2 agregados a la factura')).toBeTruthy();
  });

  test('venta: un producto sin stock se agrega igual (el bloqueo es al emitir)', async () => {
    const onAgregar = jest.fn();
    renderConIdioma(<Dialogo onAgregar={onAgregar} />);
    fireEvent.click(await screen.findByRole('option', { name: /Morral urbano/ }));
    expect(onAgregar).toHaveBeenCalledWith(productos[1]);
  });

  test('escáner: el código de barras exacto se agrega directo', async () => {
    const onAgregar = jest.fn();
    renderConIdioma(<Dialogo onAgregar={onAgregar} />);
    await screen.findByRole('option', { name: /Zapatilla/ });
    const buscador = screen.getByRole('combobox', { name: /Buscar por nombre/ });
    fireEvent.change(buscador, { target: { value: '7700001' } });
    fireEvent.keyDown(buscador, { key: 'Enter' });
    expect(onAgregar).toHaveBeenCalledWith(productos[0]);
  });

  test('compra: «Solo del proveedor» viene encendido y llega a la búsqueda', async () => {
    const buscar = jest.fn(async () => productos);
    renderConIdioma(<Dialogo variante="compra" hayProveedor buscar={buscar} />);
    await screen.findByRole('option', { name: /Zapatilla/ });
    expect(buscar).toHaveBeenCalledWith('', { conStock: false, soloProveedor: true }, expect.anything());
    const chip = screen.getByRole('button', { name: 'Solo del proveedor' });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chip);
    await waitFor(() => expect(buscar).toHaveBeenLastCalledWith('', { conStock: false, soloProveedor: false }, expect.anything()));
  });

  test('«Crear producto» abre el formulario rápido y el creado vuelve como línea', async () => {
    const onAgregar = jest.fn();
    const onCrear = jest.fn(async () => ({ id: 99, nombre: 'Guante de nitrilo', sku: 'GUA-1', precio: 4200, stock: 0 }));
    renderConIdioma(
      <Dialogo
        onAgregar={onAgregar}
        formularioCrear={({ texto, onCreado, onCancelar }) => (
          <FormularioRapidoProducto variante="venta" texto={texto} moneda={moneda} impuestos={[IVA]} onCrear={onCrear} onCreado={onCreado} onCancelar={onCancelar} />
        )}
      />,
    );
    await screen.findByRole('option', { name: /Zapatilla/ });
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));
    fireEvent.change(screen.getByLabelText(/Nombre del producto/), { target: { value: 'Guante de nitrilo' } });
    fireEvent.change(screen.getByLabelText(/SKU o código/), { target: { value: 'GUA-1' } });
    fireEvent.change(screen.getByLabelText(/Precio de venta/), { target: { value: '4200' } });
    fireEvent.blur(screen.getByLabelText(/Precio de venta/));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Crear y agregar' }));
    });
    expect(onCrear).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'Guante de nitrilo', sku: 'GUA-1', impuestos: ['iva'], controlaStock: true }));
    expect(onAgregar).toHaveBeenCalledWith(expect.objectContaining({ id: 99 }));
    expect(await screen.findByRole('button', { name: 'Listo (1 agregado)' })).toBeTruthy();
  });
});

describe('Elegir cliente con chips y alta en línea', () => {
  test('los chips llegan a la búsqueda; «Crear cliente» vuelve con el cliente elegido', async () => {
    const buscar = jest.fn(async () => [{ id: 'c1', nombre: 'Comercial Andina', tipo: 'Empresa', saldoPorCobrar: 'Por cobrar $ 1.200.000' }] as ClientePicker[]);
    const onCambiar = jest.fn();
    renderConIdioma(
      <CustomerPicker
        cliente={null}
        abierto
        buscar={buscar}
        onCambiar={onCambiar}
        filtros={[
          { id: 'empresa', etiqueta: 'Empresa' },
          { id: 'activos', etiqueta: 'Solo activos', activoPorDefecto: true },
        ]}
        textoCrearNuevo="Crear cliente"
        formularioCrear={({ texto, onCreado, onCancelar }) => (
          <FormularioRapidoTercero<ClientePicker>
            variante="cliente"
            texto={texto}
            onCrear={async (d) => ({ id: 'nuevo', nombre: `${d.nombres} ${d.apellidos}`.trim() })}
            onCreado={onCreado}
            onCancelar={onCancelar}
          />
        )}
      />,
    );
    const opcion = await screen.findByRole('option', { name: /Comercial Andina/ });
    expect(within(opcion).getByText('Por cobrar $ 1.200.000')).toBeTruthy();
    expect(buscar).toHaveBeenCalledWith('', expect.anything(), ['activos']);
    fireEvent.click(screen.getByRole('button', { name: 'Empresa' }));
    await waitFor(() => expect(buscar).toHaveBeenLastCalledWith('', expect.anything(), ['activos', 'empresa']));

    fireEvent.click(screen.getByRole('button', { name: 'Crear cliente' }));
    fireEvent.change(screen.getByLabelText(/Nombres/), { target: { value: 'Laura' } });
    fireEvent.change(screen.getByLabelText(/^Número/), { target: { value: '1020304050' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Crear y elegir' }));
    });
    expect(onCambiar).toHaveBeenCalledWith({ id: 'nuevo', nombre: 'Laura' });
  });

  test('el NIT calcula el DV y el formulario no crea sin documento', async () => {
    const onCrear = jest.fn();
    renderConIdioma(<FormularioRapidoTercero variante="cliente" texto="Comercial Andina" onCrear={onCrear} onCreado={jest.fn()} onCancelar={jest.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Crear y elegir' }));
    });
    expect(onCrear).not.toHaveBeenCalled();
    expect(screen.getByText('Este campo es obligatorio.')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Empresa' }));
    fireEvent.change(screen.getByLabelText(/^Número/), { target: { value: '900123456' } });
    expect((screen.getByLabelText('DV') as HTMLInputElement).value).toBe('8');
  });
});

describe('Ítem manual', () => {
  test('valida, calcula la vista previa con la función del dominio y Enter en la nota agrega', async () => {
    const onAgregar = jest.fn();
    const calcularTotal = jest.fn((i: { cantidad: number; precio: number }) => i.cantidad * i.precio * 1.08);
    function Envoltura() {
      const [abierto, setAbierto] = React.useState(true);
      return (
        <DialogoItemManual
          abierto={abierto}
          onAbiertoChange={setAbierto}
          variante="venta"
          moneda={moneda}
          impuestos={[IVA, ULTRA]}
          calcularTotal={calcularTotal as never}
          onAgregar={onAgregar}
        />
      );
    }
    renderConIdioma(<Envoltura />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/Descripción del ítem/)));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar ítem' }));
    expect(onAgregar).not.toHaveBeenCalled();
    expect(screen.getByText('Escribe la descripción del ítem.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Descripción del ítem/), { target: { value: 'Refrigerio para evento' } });
    const precio = screen.getByLabelText(/Precio unitario/);
    fireEvent.change(precio, { target: { value: '480000' } });
    fireEvent.blur(precio);
    fireEvent.change(screen.getByLabelText(/Nota de la línea/), { target: { value: 'Entrega 3 oct' } });
    expect(screen.getByText('Sale en el PDF de la factura')).toBeTruthy();
    expect(calcularTotal).toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText(/Nota de la línea/), { key: 'Enter' });
    expect(onAgregar).toHaveBeenCalledWith({ descripcion: 'Refrigerio para evento', cantidad: 1, precio: 480000, impuestos: ['iva'], incluido: false, nota: 'Entrega 3 oct' });
  });
});

describe('Impuestos por línea', () => {
  test('varios impuestos, incluido y «Sin impuesto»', async () => {
    const cambios: unknown[] = [];
    function Envoltura() {
      const [v, setV] = React.useState<{ ids: readonly string[]; incluido: boolean }>({ ids: ['iva'], incluido: false });
      return (
        <ImpuestosLinea
          opciones={[IVA, ULTRA]}
          valor={v}
          onValorChange={(x) => {
            cambios.push(x);
            setV(x);
          }}
          etiqueta="Impuestos de Zapatilla"
          avisoSinImpuesto="Se facturará al 0s?%"
        />
      );
    }
    renderConIdioma(<Envoltura />);
    const disparador = screen.getByRole('button', { name: /^Impuestos de Zapatilla: IVA 19\s?%$/ });
    fireEvent.click(disparador);
    fireEvent.click(await screen.findByRole('checkbox', { name: /Ultraprocesados/ }));
    expect(screen.getByRole('button', { name: /^Impuestos de Zapatilla: IVA 19\s?% \+ Ultraprocesados 20\s?%$/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sin impuesto (excluir esta línea)' }));
    expect(screen.getByText('Se facturará al 0s?%')).toBeTruthy();
    expect(cambios.at(-1)).toEqual({ ids: [], incluido: false });
  });
});

describe('Tabla de líneas en edición', () => {
  test('aviso, insignias, descripción editable del ítem manual y selector de impuestos', () => {
    const onCambiar = jest.fn();
    renderConIdioma(
      <DocumentoLineas
        modo="edicion"
        moneda={moneda}
        onCambiar={onCambiar}
        onQuitar={jest.fn()}
        impuestosDisponibles={[IVA, ULTRA]}
        lineas={[
          {
            id: 'l1',
            descripcion: 'Morral urbano 25 L',
            cantidad: 5,
            precioUnitario: 150000,
            total: 892500,
            aviso: 'Solo hay 3 en Sucursal Principal',
            insignias: [{ texto: 'Faltan 2', tono: 'advertencia' }],
            impuestosSeleccion: { ids: ['iva'], incluido: false },
            detalleTotal: 'IVA $ 142.500',
          },
          { id: 'l2', descripcion: '', cantidad: 1, precioUnitario: 0, total: 0, descripcionEditable: true, error: 'Escribe la descripción del ítem.', impuestosSeleccion: { ids: [], incluido: false } },
        ]}
      />,
    );
    expect(screen.getAllByText('Solo hay 3 en Sucursal Principal').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Faltan 2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('IVA $ 142.500').length).toBeGreaterThan(0);
    const campo = screen.getAllByLabelText('Descripción del ítem')[0];
    fireEvent.change(campo, { target: { value: 'Flete' } });
    expect(onCambiar).toHaveBeenCalledWith('l2', { descripcion: 'Flete' });
    expect(screen.getAllByRole('button', { name: /Impuestos de Morral urbano 25 L: IVA 19\s?%/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Sin impuesto asignado/ }).length).toBeGreaterThan(0);
  });
});
