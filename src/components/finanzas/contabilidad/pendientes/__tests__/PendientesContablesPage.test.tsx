/**
 * @jest-environment jsdom
 *
 * Bandeja de pendientes contables: tres estados distintos. Un error de consulta
 * nunca se muestra como cero ni como «no hay pendientes».
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { FilaPendiente, ResumenPendientes } from '@/lib/finanzas/pendientesContables';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/app/finanzas/contabilidad/pendientes',
  useSearchParams: () => new URLSearchParams(),
}));
const permisos = { crear: true, ver: true, cargando: false };
jest.mock('@/lib/finanzas/usePermisosFinanzas', () => ({
  usePermisosFinanzas: () => permisos,
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ formatear: (n: number) => `$ ${n}` }),
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({
    formatDate: (v: string | null) => v ?? '',
    formatDateTime: () => 'hoy, 3:42 p. m.',
  }),
}));
const toastError = jest.fn();
const toastSuccess = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({
  toastError: (...a: unknown[]) => toastError(...a),
  toastSuccess: (...a: unknown[]) => toastSuccess(...a),
}));

const listar = jest.fn();
const reintentar = jest.fn();
jest.mock('../PendientesContablesService', () => ({
  PendientesContablesService: {
    listar: (...a: unknown[]) => listar(...a),
    reintentar: (...a: unknown[]) => reintentar(...a),
  },
}));

import { PendientesContablesPage } from '../PendientesContablesPage';

const fila = (extra: Partial<FilaPendiente> = {}): FilaPendiente => ({
  id: 1,
  fecha: '2026-11-02T15:00:00Z',
  creado: '2026-10-25T15:00:00Z',
  dias: 12,
  origen: 'invoice_sales',
  origenId: 'f1',
  documento: 'FV-1043',
  clave: 'accrual:sale:f1',
  debito: null,
  credito: '4135',
  importe: 3570000,
  motivo: 'credit_account_missing',
  detalle: 'La cuenta de credito 4135 no esta en el plan',
  sede: 'Sede de prueba',
  intentos: 2,
  ultimoIntento: '2026-11-06T13:10:00Z',
  periodoCerrado: false,
  reintentable: true,
  ...extra,
});

const resumen = (filas: FilaPendiente[], extra: Partial<ResumenPendientes> = {}): ResumenPendientes => ({
  pendientes: filas.length,
  masAntiguoDias: filas.length ? 12 : null,
  bloqueanCierre: filas.length,
  periodoInicio: filas.length ? '2026-11-01' : null,
  valor: filas.reduce((s, f) => s + (f.importe ?? 0), 0),
  totalFiltradas: filas.length,
  filas,
  ...extra,
});

// Mientras carga también hay tabla (el esqueleto): se espera a que lleguen las filas.
async function tablaLista() {
  await screen.findAllByText('Factura FV-1043');
  return screen.getByRole('table');
}

async function abrirDetalle() {
  fireEvent.click(within(await tablaLista()).getByText('Factura FV-1043'));
}

beforeEach(() => {
  jest.clearAllMocks();
  permisos.crear = true;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('estado listo', () => {
  it('muestra documento, error, dato faltante, responsable, antigüedad y acción', async () => {
    listar.mockResolvedValue(resumen([fila()]));
    renderConIdioma(<PendientesContablesPage />);

    const tabla = await tablaLista();
    expect(within(tabla).getByText('Factura FV-1043')).toBeTruthy();
    expect(within(tabla).getByText('La regla usa una cuenta que no existe')).toBeTruthy();
    expect(within(tabla).getByText('Cuenta 4135')).toBeTruthy();
    expect(within(tabla).getByText('Contador')).toBeTruthy();
    expect(within(tabla).getByText('12 días')).toBeTruthy();
    expect(within(tabla).getByRole('link', { name: 'Corregir regla' }).getAttribute('href')).toBe('/app/finanzas/reglas-contables');
  });

  it('los KPI traen las cifras del servidor', async () => {
    listar.mockResolvedValue(resumen([fila()]));
    renderConIdioma(<PendientesContablesPage />);
    const kpis = await screen.findByRole('region', { name: 'Resumen de pendientes' });
    await waitFor(() => expect(within(kpis).getByText('$ 3570000')).toBeTruthy());
    expect(within(kpis).queryByText('—')).toBeNull();
  });

  it('reintenta desde el detalle y refresca la bandeja', async () => {
    listar.mockResolvedValue(resumen([fila()]));
    reintentar.mockResolvedValue({ estado: 'resuelto', aviso: null });
    renderConIdioma(<PendientesContablesPage />);

    await abrirDetalle();
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar ahora' }));

    await waitFor(() => expect(reintentar).toHaveBeenCalledWith(1));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Documento contabilizado'));
    expect(listar).toHaveBeenCalledTimes(2);
  });

  it('un reintento que sigue fallando lo dice', async () => {
    listar.mockResolvedValue(resumen([fila()]));
    reintentar.mockResolvedValue({ estado: 'sigue', aviso: null });
    renderConIdioma(<PendientesContablesPage />);

    await abrirDetalle();
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar ahora' }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('con periodo cerrado no ofrece reintentar', async () => {
    listar.mockResolvedValue(resumen([fila({ motivo: 'period_closed', periodoCerrado: true })]));
    renderConIdioma(<PendientesContablesPage />);

    await abrirDetalle();
    expect(await screen.findByText(/no se reintenta hasta que se reabra/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reintentar ahora' })).toBeNull();
  });

  it('en celular la tarjeta también abre el detalle', async () => {
    listar.mockResolvedValue(resumen([fila()]));
    renderConIdioma(<PendientesContablesPage />);

    const tarjeta = (await screen.findAllByText('Factura FV-1043')).find((n) => n.closest('button'));
    fireEvent.click(tarjeta as HTMLElement);
    expect(await screen.findByRole('button', { name: 'Reintentar ahora' })).toBeTruthy();
  });

  it('redondeo y reversas llevan a su página', async () => {
    listar.mockResolvedValue(
      resumen([
        fila({ id: 31, motivo: 'redondeo_sin_cuenta' }),
        fila({ id: 32, motivo: 'reversa_cuenta_titulo', origen: 'reversal', origenId: '9000', documento: '9000' }),
        fila({ id: 33, motivo: 'linea_sin_cuenta', origen: 'reversal', origenId: '9001', documento: '9001' }),
      ]),
    );
    renderConIdioma(<PendientesContablesPage />);

    const tabla = await tablaLista();
    const destino = (nombre: string) => within(tabla).getByRole('link', { name: nombre }).getAttribute('href');
    expect(destino('Configurar redondeo')).toBe('/app/finanzas/contabilidad/pendientes/31');
    expect(destino('Elegir auxiliar')).toBe('/app/finanzas/contabilidad/pendientes/32');
    expect(destino('Asignar cuenta')).toBe('/app/finanzas/contabilidad/pendientes/33');
    expect(within(tabla).getByText('Falta la cuenta de redondeo')).toBeTruthy();
  });

  it('una reversa a la que le faltan cuentas lo dice', async () => {
    listar.mockResolvedValue(resumen([fila({ motivo: 'reversa_cuenta_titulo' })]));
    reintentar.mockResolvedValue({ estado: 'faltan_cuentas', aviso: null });
    renderConIdioma(<PendientesContablesPage />);

    await abrirDetalle();
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar ahora' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Falta elegir la cuenta de alguna línea', undefined));
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('sin permiso para reversar lo dice', async () => {
    listar.mockResolvedValue(resumen([fila({ motivo: 'linea_sin_cuenta' })]));
    reintentar.mockRejectedValue({ message: 'sin_permiso' });
    renderConIdioma(<PendientesContablesPage />);

    await abrirDetalle();
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar ahora' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('No tienes permiso para hacer esto'));
  });

  it('sin destino, la acción abre el detalle', async () => {
    listar.mockResolvedValue(resumen([fila({ motivo: 'motivo_nuevo' })]));
    renderConIdioma(<PendientesContablesPage />);

    fireEvent.click(within(await tablaLista()).getByRole('button', { name: 'Ver detalle' }));
    expect(await screen.findByText(/Sin contabilizar desde/)).toBeTruthy();
  });

  it('sin permiso de registro no ofrece reintentar', async () => {
    permisos.crear = false;
    listar.mockResolvedValue(resumen([fila()]));
    renderConIdioma(<PendientesContablesPage />);

    await abrirDetalle();
    await screen.findByText(/Sin contabilizar desde/);
    expect(screen.queryByRole('button', { name: 'Reintentar ahora' })).toBeNull();
  });
});

describe('estado todo en orden', () => {
  it('dice que no hay pendientes y cuándo se revisó', async () => {
    listar.mockResolvedValue(resumen([]));
    renderConIdioma(<PendientesContablesPage />);

    expect(await screen.findByText('No hay pendientes')).toBeTruthy();
    expect(screen.getByText(/Última revisión: hoy, 3:42 p\. m\./)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('estado error de consulta', () => {
  it('avisa del error, deja los KPI en «—» y no muestra cero ni «no hay pendientes»', async () => {
    listar.mockRejectedValue(new Error('caída'));
    renderConIdioma(<PendientesContablesPage />);

    const aviso = await screen.findByRole('alert');
    expect(within(aviso).getByText('No pudimos revisar los pendientes')).toBeTruthy();
    expect(screen.getByText(/Esto no significa que no haya incidencias/)).toBeTruthy();

    const kpis = screen.getByRole('region', { name: 'Resumen de pendientes' });
    expect(within(kpis).getAllByText('—')).toHaveLength(4);
    expect(within(kpis).queryByText('0')).toBeNull();
    expect(screen.queryByText('No hay pendientes')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('reintentar la consulta vuelve a pedir los datos', async () => {
    listar.mockRejectedValueOnce(new Error('caída'));
    listar.mockResolvedValue(resumen([fila()]));
    renderConIdioma(<PendientesContablesPage />);

    const aviso = await screen.findByRole('alert');
    fireEvent.click(within(aviso).getByRole('button', { name: 'Reintentar' }));

    expect(await tablaLista()).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('un error después de tener datos no deja cifras viejas', async () => {
    listar.mockResolvedValueOnce(resumen([fila()]));
    listar.mockRejectedValue(new Error('caída'));
    reintentar.mockResolvedValue({ estado: 'sigue', aviso: null });
    renderConIdioma(<PendientesContablesPage />);

    await abrirDetalle();
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar ahora' }));

    // El panel sigue abierto: el resto queda oculto y el nombre accesible no se resuelve.
    await waitFor(() => {
      const kpis = document.querySelector<HTMLElement>('section[aria-label="Resumen de pendientes"]');
      expect(within(kpis as HTMLElement).getAllByText('—')).toHaveLength(4);
    });
  });
});
