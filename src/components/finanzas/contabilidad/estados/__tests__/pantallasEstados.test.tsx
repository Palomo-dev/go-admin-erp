/** @jest-environment jsdom */
/**
 * Las pantallas pintan lo que dice el servidor, con los textos de los cuatro
 * idiomas: una clave que falte rompe aquí. Un estado incompleto lo dice.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import es from '../../../../../../messages/es.json';
import en from '../../../../../../messages/en.json';
import fr from '../../../../../../messages/fr.json';
import pt from '../../../../../../messages/pt.json';
import { FlujoEfectivoPage } from '../FlujoEfectivoPage';
import { CambiosPatrimonioPage } from '../CambiosPatrimonioPage';
import { IndicadoresPage } from '../IndicadoresPage';
import { PresupuestoRealPage } from '../PresupuestoRealPage';
import { LibrosContablesPage } from '../LibrosContablesPage';
import { NotasEstadosPage } from '../NotasEstadosPage';
import { CertificacionPage } from '../CertificacionPage';
import { EstadoResultadosPage } from '../../estado-resultados/EstadoResultadosPage';

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

const flujo = {
  desde: '2026-01-01', hasta: '2026-11-06', utilidad: 4460000,
  filas: [
    { seccion: 'operacion', tipo: 'ajuste', grupo: 'depreciacion_amortizacion', sentido: null, nombre: null, valor: 1300000 },
    { seccion: 'operacion', tipo: 'variacion', grupo: '13', sentido: null, nombre: 'Deudores', valor: -2800000 },
    { seccion: 'inversion', tipo: 'movimiento', grupo: '15', sentido: 'salida', nombre: 'Propiedades', valor: -1200000 },
  ],
  operacion: 2960000, inversion: -1200000, financiacion: 0, pendiente: -100, efecto_cambiario: 0,
  variacion: 1759900, efectivo_inicial: 32700000, efectivo_final: 34459900, diferencia: 0,
  restringido: { inicial: 0, final: 0 },
  cuentas_efectivo: [{ cuenta: '1110', nombre: 'Bancos', inicial: 1, final: 2, restringida: false, propuesta: true }],
  pendientes_cuentas: [{ cuenta: '1705', nombre: 'Gastos pagados', valor: -100 }],
  revisar_cuentas: [],
  sin_efectivo: [{ asiento: 9, fecha: '2026-02-01T17:00:00+00:00', memo: 'Compra a crédito', monto: 700 }],
  avisos: { borradores: 1, fallos: 2, fallos_monto: 250 },
  politicas: { intereses_pagados: 'operacion', intereses_recibidos: 'operacion', dividendos_recibidos: 'operacion', dividendos_pagados: 'financiacion', impuestos: 'operacion' },
  politicas_confirmadas: false,
};
const patrimonio = {
  desde: '2026-01-01', hasta: '2026-11-06', utilidad: 4460000, saldo_final: 26440000, patrimonio_balance: 26440000, diferencia: 0,
  filas: [
    { clave: 'saldo_inicial', valores: { '31': 10000000 }, total: 10000000 },
    { clave: 'resultado', valores: { '36': 4460000 }, total: 4460000 },
    { clave: 'otros', valores: { '37': 5 }, total: 5 },
    { clave: 'saldo_final', valores: { '31': 10000000, '36': 4460000, '37': 5 }, total: 14460005 },
  ],
};
const indicadores = {
  desde: '2026-01-01', hasta: '2026-11-06', dias: 310, activo_corriente: 142, pasivo_corriente: 100, sin_clasificar: 40,
  activo: 200, pasivo: 100, patrimonio: 100, activo_inicial: 100, patrimonio_inicial: 60, cartera: 60, cartera_inicial: 40,
  inventario: 30, inventario_inicial: 10, proveedores: 40, proveedores_inicial: 20, ingresos: 1000, costo: 600,
  resultado_operacional: 112, resultado: 94,
};
const presupuesto = {
  tiene_presupuesto: true, borradores: 1, varios_por_anio: true,
  detalle: [
    { cuenta: '5105', nombre: 'Gastos de personal', tipo: 'expense', presupuesto: 1000, real: 900, diferencia: -100, variacion: -10, presupuestada: true, solapada: false },
    { cuenta: '4135', nombre: 'Comercio', tipo: 'income', presupuesto: 0, real: 2000, diferencia: 2000, variacion: null, presupuestada: false, solapada: false },
  ],
};
const resultado = {
  desde: '2026-01-01', hasta: '2026-11-06', utilidad: 100, ori: 5,
  cuentas: [{ cuenta: '4135', codigo: '4135', nombre: 'Comercio', neto: 300 }, { cuenta: '510506', codigo: '510506', nombre: 'Sueldos', neto: -200 }],
};
const configuracion = {
  version: 1, notas: {}, certificacion: {}, politicas: flujo.politicas, politicasConfirmadas: false, marcas: [],
  empresa: { nombre: 'Una empresa', nit: '900000000-1' },
};
const inventarios = {
  corte: '2026-11-06', filas: [{ codigo: '1105', nombre: 'Caja', saldo: 5 }], activo: 5, pasivo: 0, patrimonio: 5, resultado_abierto: 0, activos_fijos: 0,
};

function responder(url: string) {
  if (url.includes('/configuracion')) return configuracion;
  if (url.includes('/libros')) return inventarios;
  const informe = new URL(url, 'http://x').searchParams.get('informe');
  const datos = { flujo, patrimonio, indicadores, presupuesto, resultado }[informe ?? 'flujo'];
  return { actual: datos, anterior: url.includes('comparar=1') ? datos : null };
}

beforeEach(() => {
  global.fetch = jest.fn(async (url: string) => ({ ok: true, json: async () => responder(url) })) as unknown as typeof fetch;
});

function montar(pagina: ReactElement, locale: string, mensajes: unknown) {
  const errores: string[] = [];
  render(
    <NextIntlClientProvider locale={locale} messages={mensajes as Record<string, never>} onError={(e) => errores.push(e.message)}>
      {pagina}
    </NextIntlClientProvider>,
  );
  return errores;
}

const IDIOMAS: Array<[string, unknown]> = [['es', es], ['en', en], ['fr', fr], ['pt', pt]];
const PANTALLAS: Array<[string, () => ReactElement]> = [
  ['flujo', () => <FlujoEfectivoPage />],
  ['patrimonio', () => <CambiosPatrimonioPage />],
  ['indicadores', () => <IndicadoresPage />],
  ['presupuesto', () => <PresupuestoRealPage />],
  ['libros', () => <LibrosContablesPage />],
  ['notas', () => <NotasEstadosPage />],
  ['certificacion', () => <CertificacionPage />],
  ['resultado', () => <EstadoResultadosPage />],
];

describe.each(IDIOMAS)('textos en %s', (locale, mensajes) => {
  it.each(PANTALLAS)('%s no pide claves que no existen', async (_n, pagina) => {
    const errores = montar(pagina(), locale, mensajes);
    await waitFor(() => expect((global.fetch as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(0));
    await new Promise((r) => setTimeout(r, 0));
    await screen.findAllByRole('heading').catch(() => undefined);
    expect(errores).toEqual([]);
  });
});

describe('lo que dice cada pantalla', () => {
  it('el flujo avisa que está incompleto, lo pendiente y las operaciones sin efectivo', async () => {
    montar(<FlujoEfectivoPage />, 'es', es);
    expect(await screen.findByText('Este estado está incompleto')).toBeTruthy();
    expect(screen.getByText('Políticas pendientes del Contador')).toBeTruthy();
    expect(screen.getByText('Efectivo propuesto por el PUC')).toBeTruthy();
    expect(screen.getByText('Hay movimientos que no entraron al mayor')).toBeTruthy();
    expect(screen.getAllByText('Pendiente de clasificar').length).toBeGreaterThan(0);
    expect(screen.getByText('Variación de cartera')).toBeTruthy();
    expect(screen.getByText('Compra de activos de contado')).toBeTruthy();
    expect(screen.getByText('Compra a crédito')).toBeTruthy();
    expect(screen.getByText('Cuadra con bancos y caja')).toBeTruthy();
    expect(screen.getAllByText('($ 2800000)').length).toBeGreaterThan(0);
  });

  it('un error no se pinta como cero', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({ codigo: 'error_consulta' }) })) as unknown as typeof fetch;
    const espia = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    montar(<FlujoEfectivoPage />, 'es', es);
    expect(await screen.findByText('No se pudo cargar el informe')).toBeTruthy();
    expect(screen.queryByText('Cuadra con bancos y caja')).toBeNull();
    espia.mockRestore();
  });

  it('sin permiso lo dice', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({ codigo: 'sin_permiso' }) })) as unknown as typeof fetch;
    const espia = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    montar(<CambiosPatrimonioPage />, 'es', es);
    expect(await screen.findByText('No tienes permiso para ver este informe')).toBeTruthy();
    espia.mockRestore();
  });

  it('el presupuesto solo muestra lo aprobado y separa lo no presupuestado', async () => {
    montar(<PresupuestoRealPage />, 'es', es);
    expect(await screen.findByText('5105 Gastos de personal')).toBeTruthy();
    expect(screen.getByText('Con movimiento y sin presupuesto')).toBeTruthy();
    expect(screen.getByText(/no se tiene en cuenta/)).toBeTruthy();
  });

  it('el resultado integral abre por naturaleza', async () => {
    montar(<EstadoResultadosPage />, 'es', es);
    expect(await screen.findByText('Gastos de personal')).toBeTruthy();
    expect(screen.getByText('RESULTADO INTEGRAL DEL PERIODO')).toBeTruthy();
  });

  it('la certificación avisa que el texto legal es del Contador', async () => {
    montar(<CertificacionPage />, 'es', es);
    expect(await screen.findByText('Texto legal pendiente del Contador')).toBeTruthy();
    expect(screen.getByText('Faltan datos para firmar')).toBeTruthy();
  });
});
