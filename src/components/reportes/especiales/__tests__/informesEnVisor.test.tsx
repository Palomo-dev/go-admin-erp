/** @jest-environment jsdom */
/**
 * Dentro del visor de Reportes, los informes que antes eran pantallas de
 * Finanzas no dibujan su encabezado ni sus fechas: piden al servidor el
 * periodo de la barra de filtros del visor y vuelven a pedir cuando cambia.
 * Fuera del visor se comportan como antes.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import es from '../../../../../messages/es.json';
import en from '../../../../../messages/en.json';
import fr from '../../../../../messages/fr.json';
import pt from '../../../../../messages/pt.json';
import { ProveedorVisorInforme } from '../contextoVisor';
import { CambiosPatrimonioPage } from '@/components/finanzas/contabilidad/estados/CambiosPatrimonioPage';
import { EstadoResultadosPage } from '@/components/finanzas/contabilidad/estado-resultados/EstadoResultadosPage';
import { CertificacionPage } from '@/components/finanzas/contabilidad/estados/CertificacionPage';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ getToday: () => '2026-11-06', formatDate: (v: string) => v }),
  useOrgTimezone: () => ({ isLoading: false, timezone: 'America/Bogota' }),
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ formatear: (v: number) => `$ ${v}` }),
}));
jest.mock('@/lib/finanzas/usePermisosFinanzas', () => ({ usePermisosFinanzas: () => ({ aprobar: true, ver: true }) }));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({ useCabeceraMovil: () => undefined }));
jest.mock('@/lib/services/fiscalCalendar', () => ({ primerDiaDelAnioDe: () => '2026-01-01' }));

const patrimonio = {
  desde: '2026-03-01', hasta: '2026-03-31', utilidad: 0, saldo_final: 0, patrimonio_balance: 0, diferencia: 0,
  filas: [{ clave: 'saldo_inicial', valores: { '31': 10 }, total: 10 }, { clave: 'saldo_final', valores: { '31': 10 }, total: 10 }],
};
const resultado = { desde: '2026-03-01', hasta: '2026-03-31', utilidad: 100, ori: 0, cuentas: [{ cuenta: '4135', codigo: '4135', nombre: 'Comercio', neto: 100 }] };
const configuracion = {
  version: 1, notas: {}, certificacion: {}, politicas: {}, politicasConfirmadas: false, marcas: [],
  empresa: { nombre: 'Una empresa', nit: '900000000-1' },
};

function responder(url: string) {
  if (url.includes('/configuracion')) return configuracion;
  const informe = new URL(url, 'http://x').searchParams.get('informe');
  const datos = informe === 'resultado' ? resultado : patrimonio;
  return { actual: datos, anterior: null };
}

const pedidas = () => (global.fetch as jest.Mock).mock.calls.map(([url]) => String(url));

beforeEach(() => {
  global.fetch = jest.fn(async (url: string) => ({ ok: true, json: async () => responder(url) })) as unknown as typeof fetch;
});

function enVisor(pagina: ReactElement, desde: string, hasta: string, mensajes: unknown = es, locale = 'es') {
  const errores: string[] = [];
  const arbol = (d: string, h: string) => (
    <NextIntlClientProvider locale={locale} messages={mensajes as Record<string, never>} onError={(e) => errores.push(e.message)}>
      <ProveedorVisorInforme valor={{ desde: d, hasta: h, sucursal: null }}>{pagina}</ProveedorVisorInforme>
    </NextIntlClientProvider>
  );
  const vista = render(arbol(desde, hasta));
  return { errores, cambiar: (d: string, h: string) => vista.rerender(arbol(d, h)) };
}

describe('en el visor de Reportes', () => {
  it('el patrimonio usa el periodo del visor, sin fechas propias ni migas de Finanzas', async () => {
    const { cambiar } = enVisor(<CambiosPatrimonioPage />, '2026-03-01', '2026-03-31');
    await waitFor(() => expect(pedidas().some((u) => u.includes('desde=2026-03-01') && u.includes('hasta=2026-03-31'))).toBe(true));
    expect(screen.queryByText('Desde')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(pedidas().some((u) => u.includes('desde=2026-01-01'))).toBe(false);

    cambiar('2026-04-01', '2026-04-30');
    await waitFor(() => expect(pedidas().some((u) => u.includes('desde=2026-04-01') && u.includes('hasta=2026-04-30'))).toBe(true));
  });

  it('el resultado integral consulta el periodo del visor y vuelve a consultar al cambiarlo', async () => {
    const { cambiar } = enVisor(<EstadoResultadosPage />, '2026-03-01', '2026-03-31');
    await waitFor(() => expect(pedidas().some((u) => u.includes('informe=resultado') && u.includes('desde=2026-03-01'))).toBe(true));
    expect(await screen.findByText('RESULTADO INTEGRAL DEL PERIODO')).toBeTruthy();
    cambiar('2026-05-01', '2026-05-31');
    await waitFor(() => expect(pedidas().some((u) => u.includes('desde=2026-05-01') && u.includes('hasta=2026-05-31'))).toBe(true));
  });

  it('la certificación toma el corte del visor y no muestra su propio campo de fecha', async () => {
    enVisor(<CertificacionPage />, '2026-01-01', '2026-12-31');
    await waitFor(() => expect(pedidas().some((u) => u.includes('/configuracion'))).toBe(true));
    await screen.findByText('Faltan datos para firmar');
    expect(screen.queryByText('Corte')).toBeNull();
  });

  it.each([['en', en], ['fr', fr], ['pt', pt]])('en %s no pide claves que no existen', async (locale, mensajes) => {
    const { errores } = enVisor(<CambiosPatrimonioPage />, '2026-03-01', '2026-03-31', mensajes, locale);
    await waitFor(() => expect(pedidas().length).toBeGreaterThan(0));
    expect(errores).toEqual([]);
  });
});

describe('fuera del visor', () => {
  it('la certificación muestra su campo de corte', async () => {
    render(
      <NextIntlClientProvider locale="es" messages={es as unknown as Record<string, never>}>
        <CertificacionPage />
      </NextIntlClientProvider>,
    );
    expect(await screen.findByText('Corte')).toBeTruthy();
  });

  it('el patrimonio abre del 1 de enero a hoy, como antes', async () => {
    render(
      <NextIntlClientProvider locale="es" messages={es as unknown as Record<string, never>}>
        <CambiosPatrimonioPage />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(pedidas().some((u) => u.includes('desde=2026-01-01') && u.includes('hasta=2026-11-06'))).toBe(true));
  });
});
