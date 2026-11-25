/**
 * @jest-environment jsdom
 *
 * «Facturar a» en pantalla (Figma «06 Clientes» 3201-21518 / 3205-22900), con el cambio del dueño:
 * arranca en «Persona», muestra el aviso y la lista sin nada marcado (ni «La última vez»), y un
 * toque escoge la empresa. Textos reales de messages/<idioma>.json (una clave que falte rompe).
 *
 * Datos inventados: organización 120, persona `per-1`, empresas `emp-1` (48) y `emp-2` (49).
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { DatosFacturacionCliente } from '@/lib/clientes/facturacionClienteDatos';
import type { SeleccionFacturarA } from '@/lib/clientes/facturarA';

const datos: DatosFacturacionCliente = {
  ficha: { id: 'per-1', organization_id: 120, customer_type: 'person', identification_type: 'cc', identification_number: '1020456789', first_name: 'Persona', last_name: 'Prueba', full_name: 'Persona Prueba' },
  municipio: null,
  empresas: [
    { id: 'emp-1', nombre: 'Empresa Uno S.A.S.', identification_type: 'nit', identification_number: '900000001', dv: 1, cargo: 'Compras', principal: true, fiscal_responsibilities: ['O-48'], billing_email: 'factura@uno.example' },
    { id: 'emp-2', nombre: 'Empresa Dos S.A.S.', identification_type: 'nit', identification_number: '900000002', dv: 2, cargo: null, principal: false, fiscal_responsibilities: ['O-49'] },
  ],
  personasLigadas: 0,
};
let conEmpresas = true;

jest.mock('@/lib/clientes/facturacionClienteDatos', () => ({
  cargarFacturacionCliente: jest.fn(async () => (conEmpresas ? datos : { ...datos, empresas: [] })),
  ultimaEmpresaFacturada: jest.fn(async () => 'emp-2'),
}));
jest.mock('@/components/clientes/facturacion/EditarFacturacionDialog', () => ({
  EditarFacturacionDialog: () => null,
  datosEmpresaNueva: () => ({ ficha: { id: 'nueva', organization_id: 120 }, municipio: null, empresas: [], personasLigadas: 0 }),
}));

import { FacturarASelector } from '@/components/clientes/facturacion/FacturarASelector';

describe('FacturarASelector', () => {
  beforeEach(() => {
    conEmpresas = true;
  });

  test('arranca en la persona, con el aviso y ninguna empresa marcada', async () => {
    const onCambio = jest.fn();
    renderConIdioma(<FacturarASelector organizationId={120} personaId="per-1" valor={null} onCambio={onCambio} />);
    expect(await screen.findByText('Este cliente tiene empresas: ¿la factura va a una de ellas?')).toBeTruthy();
    await waitFor(() => expect(onCambio).toHaveBeenCalled());
    const primera = onCambio.mock.calls[0][0] as SeleccionFacturarA;
    expect(primera).toEqual({ valor: { modo: 'persona', empresaId: null }, personaTieneDocumento: true, empresa: null });
    // «La última vez» se ofrece como sugerencia, sin marcarla.
    expect(screen.getByText('La última vez: Empresa Dos S.A.S.')).toBeTruthy();
    const empresas = screen.getAllByRole('radio').filter((r) => /Empresa (Uno|Dos)/.test(r.textContent ?? ''));
    expect(empresas).toHaveLength(2);
    expect(empresas.every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
  });

  test('un toque en la empresa la escoge como adquiriente', async () => {
    const onCambio = jest.fn();
    renderConIdioma(<FacturarASelector organizationId={120} personaId="per-1" valor={null} onCambio={onCambio} />);
    const uno = await screen.findByRole('radio', { name: /Empresa Uno S\.A\.S\./ });
    fireEvent.click(uno);
    const ultima = onCambio.mock.calls[onCambio.mock.calls.length - 1][0] as SeleccionFacturarA;
    expect(ultima.valor).toEqual({ modo: 'empresa', empresaId: 'emp-1' });
    expect(ultima.empresa?.iva).toBe('48');
    expect(ultima.empresa?.correoFactura).toBe('factura@uno.example');
  });

  test('con la empresa escogida muestra adquiriente y quien recibe', async () => {
    renderConIdioma(<FacturarASelector organizationId={120} personaId="per-1" valor={{ modo: 'empresa', empresaId: 'emp-2' }} onCambio={jest.fn()} />);
    expect(await screen.findByText('Adquiriente · va en la factura')).toBeTruthy();
    expect(screen.getByText('Recibe · contacto')).toBeTruthy();
    expect(screen.getByText('Sin correo de factura')).toBeTruthy();
  });

  test('sin empresas ligadas: una línea con «Agregar empresa con NIT», sin aviso', async () => {
    conEmpresas = false;
    renderConIdioma(<FacturarASelector organizationId={120} personaId="per-1" valor={null} onCambio={jest.fn()} />);
    expect(await screen.findByText('Agregar empresa con NIT')).toBeTruthy();
    expect(screen.queryByText('Este cliente tiene empresas: ¿la factura va a una de ellas?')).toBeNull();
  });

  test('en inglés', async () => {
    renderConIdioma(<FacturarASelector organizationId={120} personaId="per-1" valor={null} onCambio={jest.fn()} />, { idioma: 'en' });
    expect(await screen.findByText('This customer has companies: should the invoice go to one of them?')).toBeTruthy();
  });
});
