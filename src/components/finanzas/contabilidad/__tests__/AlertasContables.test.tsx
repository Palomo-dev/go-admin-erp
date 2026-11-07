/**
 * @jest-environment jsdom
 *
 * AlertasContables no puede ocultar un error de consulta como si no hubiera
 * incidencias: cargando, error y vacío son estados distintos.
 */
import { fireEvent, screen, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';

jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ formatDate: (v: string | null) => v ?? '' }),
}));

const obtenerAlertas = jest.fn();
jest.mock('../ContabilidadService', () => ({
  ContabilidadService: { obtenerAlertas: (...a: unknown[]) => obtenerAlertas(...a) },
}));

import { AlertasContables } from '../AlertasContables';

const fallo = {
  id: 1,
  fecha: '2026-11-02',
  origen: 'invoice_sales',
  origenId: 'f1',
  debito: null,
  credito: '4135',
  importe: 100,
  motivo: 'period_closed',
  detalle: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AlertasContables', () => {
  it('cargando: no afirma nada todavía', () => {
    obtenerAlertas.mockReturnValue(new Promise(() => undefined));
    renderConIdioma(<AlertasContables />);
    expect(screen.getByLabelText('Revisando pendientes contables')).toBeTruthy();
    expect(screen.queryByText('Sin pendientes contables')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('error: lo muestra y no dice que no hay incidencias', async () => {
    obtenerAlertas.mockRejectedValue(new Error('caída'));
    renderConIdioma(<AlertasContables />);

    const aviso = await screen.findByRole('alert');
    expect(within(aviso).getByText('No pudimos revisar los pendientes')).toBeTruthy();
    expect(screen.queryByText('Sin pendientes contables')).toBeNull();
  });

  it('error: se puede reintentar', async () => {
    obtenerAlertas.mockRejectedValueOnce(new Error('caída'));
    obtenerAlertas.mockResolvedValue({ fallos: [], sinLineas: [] });
    renderConIdioma(<AlertasContables />);

    fireEvent.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Sin pendientes contables')).toBeTruthy();
  });

  it('vacío: dice que no hay pendientes', async () => {
    obtenerAlertas.mockResolvedValue({ fallos: [], sinLineas: [] });
    renderConIdioma(<AlertasContables />);
    expect(await screen.findByText('Sin pendientes contables')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('con fallos: lleva a la bandeja', async () => {
    obtenerAlertas.mockResolvedValue({ fallos: [fallo], sinLineas: [] });
    renderConIdioma(<AlertasContables />);

    expect(await screen.findByText('1 documento sin contabilizar')).toBeTruthy();
    expect(screen.getByText('Periodo cerrado')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ver pendientes' }).getAttribute('href')).toBe('/app/finanzas/contabilidad/salud');
  });

  it('avisa cuando la lista llegó al tope', async () => {
    const fallos = Array.from({ length: 50 }, (_, i) => ({ ...fallo, id: i + 1 }));
    obtenerAlertas.mockResolvedValue({ fallos, sinLineas: [] });
    renderConIdioma(<AlertasContables />);
    expect(await screen.findByText('50+ documentos sin contabilizar')).toBeTruthy();
  });

  it('asientos sin líneas', async () => {
    obtenerAlertas.mockResolvedValue({
      fallos: [],
      sinLineas: [{ id: 9, fecha: '2026-11-01', memo: null, origen: 'manual', publicado: false }],
    });
    renderConIdioma(<AlertasContables />);
    expect(await screen.findByText('1 asiento sin líneas')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Asiento 9/ }).getAttribute('href')).toBe('/app/finanzas/contabilidad/asientos/9');
  });
});
