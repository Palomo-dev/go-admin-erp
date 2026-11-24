/**
 * @jest-environment jsdom
 */
/**
 * Paneles de Ventas, Logística y Transporte en «Módulos» del inicio (Figma
 * `03` › Inicio, 2915:45356; aprobado el 2026-11-23). Render real con
 * next-intl en los cuatro idiomas: una clave que falte saldría cruda. Cifras
 * ficticias.
 */
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ formatTime: (v: string) => (v ? '2:32 p. m.' : '') }),
}));
jest.mock('@/components/pos/pedidos-online/manual/DialogoPedidoManual', () => ({
  DialogoPedidoManual: ({ abierto }: { abierto: boolean }) => (abierto ? <div data-testid="dialogo-pedido-manual" /> : null),
}));
jest.mock('@/components/pos/cajas/paymentMethodLabels', () => ({
  useEtiquetaMetodoPago: () => (m: string) => (m === 'cash' ? 'Efectivo' : m),
}));

import { fireEvent, waitFor, within } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { ModulosInicio } from '../ModulosInicio';
import { PanelVentasInicio } from '../modulos/PanelVentasInicio';
import { PanelLogisticaInicio } from '../modulos/PanelLogisticaInicio';
import { PanelTransporteInicio } from '../modulos/PanelTransporteInicio';
import { PREFERENCIAS_VACIAS } from '@/lib/dashboard/preferenciasInicio';
import { resumirModulo } from '@/lib/dashboard/resumenModulos';
import { armarVentas } from '@/lib/dashboard/ventasWidgetInicio';
import { armarLogistica } from '@/lib/dashboard/logisticaInicio';
import { armarTransporte } from '@/lib/dashboard/transporteInicio';
import type { FilaVenta } from '@/lib/pos/ventas/listadoServidor';

const IDIOMAS: IdiomaPrueba[] = ['es', 'en', 'fr', 'pt'];
const sinClavesCrudas = (texto: string | null) =>
  expect(texto ?? '').not.toMatch(/\b(inicioWidgets|ventas|logistica|transporte|comun|canales|home)\.[a-zA-Z]/);
const todo = (p: string) => p;

const venta: FilaVenta = {
  id: 'v1',
  fecha: '2026-11-23T19:32:00Z',
  creada: '2026-11-23T19:32:00Z',
  total: 38900,
  saldo: 0,
  status: 'paid',
  payment_status: 'paid',
  estado: 'pagada',
  origen: 'pos',
  canal: 'menu_qr',
  numero: 'WO-000430',
  tipo_numero: 'pedido',
  factura_id: null,
  cxc_id: null,
  web_order_id: null,
  cliente: { id: 'c', nombre: 'Cliente de prueba', documento: null },
  cajero: { id: 'u', nombre: null },
  sucursal: { id: 1, nombre: 'Principal' },
  metodos: ['cash'],
  devuelto: 0,
  notas_credito: 0,
};

const ventas = (hay = true) =>
  armarVentas({
    crudo: {
      moneda: 'COP',
      periodo: { ventas: 48320500, efectivas: 1312, ticket_promedio: 36830 },
      anterior: { ventas: 43000000, efectivas: 1200 },
      hoy: { ventas: 4862300, efectivas: 131 },
      semana: { ventas: 4502100, efectivas: 120 },
      por_canal: [
        { canal: 'pos', ventas: 30512000 },
        { canal: 'menu_qr', ventas: 2418000 },
      ],
      por_sede: [
        { id: 1, nombre: 'Principal', ventas: 30000000 },
        { id: 2, nombre: 'Norte', ventas: 2930000 },
      ],
      sucursales: 2,
      pedidos: { pendientes: 7, por_expirar: 3, minutos: 30 },
      hay_ventas: hay,
    },
    ultimas: [venta],
    monedaBase: 'COP',
    periodoEsHoy: false,
    sucursal: null,
    cajas: { abiertas: 2, anteriores: 1 },
    href: todo,
  });

const logistica = (hay = true) =>
  armarLogistica({
    crudo: {
      hayEnvios: hay,
      despacho: { porDespachar: 38, paraHoy: 31, paraManana: 7, atrasados: 5, contraentregaHoy: 1126400, enviosContraentregaHoy: 14, sinDomiciliario: 21, sinDomiciliarioHoy: 21, saleHoy: 31 },
      masAtrasado: { numero: 'WO-000412', minutos: 18 },
      seguimiento: { todo: 12, novedades: 4, sinMovimiento: 8, vencenHoy: 2, sinMovimientoTransportadora: 3 },
      cuadres: { porRecibir: 718100, domiciliariosPorRecibir: 2, cuadradosHoy: 3, recibidoHoy: 0, conDiferenciaHoy: 1, faltanteHoy: -4000, abiertosAnteriores: 0 },
      abiertos: { porDespachar: 38, enCamino: 42, conNovedad: 4 },
      primerIntento: 0.914,
      metaPrimerIntento: 0.9,
    },
    moneda: 'COP',
    href: todo,
  });

const transporte = () =>
  armarTransporte({
    crudo: {
      hayViajes: true,
      hayVehiculos: true,
      viajes: [
        { id: 't1', codigo: 'V-1123', salida: '2026-11-23T19:30:00Z', status: 'scheduled', despachadoEn: null, conExcepcion: false, ruta: 'Ruta A', placa: 'WNP104', puestos: 40, disponibles: 10, retraso: 0 },
        { id: 't2', codigo: 'V-1124', salida: '2026-11-23T12:30:00Z', status: 'in_transit', despachadoEn: '2026-11-23T12:31:00Z', conExcepcion: false, ruta: 'Ruta B', placa: 'TKL203', puestos: 40, disponibles: 8, retraso: 15 },
      ],
      cumplimiento: new Map([['t1', { tripId: 't1', bloqueos: [{ causa: 'soat', grupo: 'vehiculo', vence: '2026-11-20', excepcion: false }], avisos: [], admiteExcepcion: false, pidePin: true }]]),
      vehiculos: { total: 15, disponibles: 9, enUso: 4, mantenimiento: 2, placasMantenimiento: ['WNP105'] },
      documentos: { vencidos: 2, porVencer: 5, vigentes: 20, total: 27, sinFecha: 0, sinArchivo: 0, primero: null, vencidosEjemplo: [{ nombre: 'WNP104', tipo: 'soat' }] },
    },
    href: todo,
  });

describe.each(IDIOMAS)('paneles de widgets del inicio (%s)', (idioma) => {
  test('Ventas: cuatro cifras, última venta con canal, acciones y desgloses', () => {
    const { container, getByTestId, queryByTestId } = renderConIdioma(<PanelVentasInicio datos={ventas()} organizationId={120} onCambio={() => {}} />, { idioma });
    sinClavesCrudas(container.textContent);
    expect(container.querySelectorAll('[data-kpi]')).toHaveLength(4);
    expect(container.querySelector('[data-venta="v1"] a')?.getAttribute('href')).toBe('/app/pos/ventas/v1');
    expect(container.querySelector('[data-desglose="porCanal"]')).not.toBeNull();
    expect(container.querySelector('[data-desglose="porSede"]')).not.toBeNull();
    expect(container.querySelector('[data-cajas]')).not.toBeNull();
    expect(queryByTestId('dialogo-pedido-manual')).toBeNull();
    const botones = within(container as HTMLElement).getAllByRole('button');
    fireEvent.click(botones[botones.length - 1]);
    expect(getByTestId('dialogo-pedido-manual')).toBeTruthy();
  });

  test('Ventas sin datos: «Sin datos» con su primer paso', () => {
    const { container } = renderConIdioma(<PanelVentasInicio datos={ventas(false)} organizationId={120} onCambio={() => {}} />, { idioma });
    sinClavesCrudas(container.textContent);
    expect(container.querySelector('[data-estado-widget="sinDatos"]')).not.toBeNull();
    expect(container.querySelector('a[href="/app/pos"]')).not.toBeNull();
  });

  test('Logística: «Requiere atención» con la acción que resuelve cada cosa y el primer intento', () => {
    const { container } = renderConIdioma(<PanelLogisticaInicio datos={logistica()} />, { idioma });
    sinClavesCrudas(container.textContent);
    expect(container.querySelectorAll('[data-atencion]')).toHaveLength(5);
    expect(container.querySelector('[data-atencion="atrasados"] a')?.getAttribute('href')).toBe('/app/logistica/por-despachar?atrasados=1');
    expect(container.querySelector('[data-desglose="abiertos"]')).not.toBeNull();
    expect(container.querySelector('[data-primer-intento]')).not.toBeNull();
  });

  test('Logística sin envíos: «Sin datos» con zonas y domiciliario', () => {
    const { container } = renderConIdioma(<PanelLogisticaInicio datos={logistica(false)} />, { idioma });
    sinClavesCrudas(container.textContent);
    expect(container.querySelector('a[href="/app/logistica/zonas"]')).not.toBeNull();
  });

  test('Transporte: despacho bloqueado con hora y causa traducida', () => {
    const { container } = renderConIdioma(<PanelTransporteInicio datos={transporte()} />, { idioma });
    sinClavesCrudas(container.textContent);
    const b = container.querySelector('[data-atencion="bloqueado-t1"]');
    expect(b?.textContent).toContain('V-1123');
    expect(b?.textContent).toContain('2:32 p. m.');
    expect(b?.textContent).not.toContain('soat');
    expect(container.querySelector('[data-desglose="porEstado"]')).not.toBeNull();
  });
});

describe('ModulosInicio con los widgets', () => {
  afterEach(() => {
    (globalThis as unknown as { fetch: unknown }).fetch = undefined;
  });

  test('la fila usa el badge y la línea del widget y el panel es el del módulo', async () => {
    const v = ventas();
    const l = logistica();
    const resumenPos = resumirModulo({ codigo: 'pos', ventas_cobradas: 3, neto: 100, monedas: ['COP'] }, 'COP')!;
    const resumenLog = resumirModulo({ codigo: 'logistica' }, 'COP')!;
    const json = {
      modulos: [
        { codigo: 'pos', idNav: 'pos', etiqueta: 'pos', href: '/app/pos/ventas', oculto: false, resumen: { ...resumenPos, tono: v.fila.tono, badge: v.fila.badge }, ventas: v, filaWidget: v.fila },
        { codigo: 'logistica', idNav: 'logistica', etiqueta: 'logistics', href: '/app/logistica/por-despachar', oculto: false, resumen: { ...resumenLog, tono: l.fila.tono, badge: l.fila.badge }, logistica: l, filaWidget: l.fila },
      ],
      badgeSolido: 'logistica',
      moneda: 'COP',
      zona: 'America/Bogota',
      calculadoEn: '2026-11-23T20:00:00Z',
    };
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => json }) as Response);
    const r = renderConIdioma(<ModulosInicio organizationId={120} periodo="30d" sucursal={null} prefs={PREFERENCIAS_VACIAS} onGuardar={async () => true} />);
    await waitFor(() => expect(r.container.querySelector('[data-modulo="pos"]')).not.toBeNull());
    sinClavesCrudas(r.container.textContent);
    const filaPos = r.container.querySelector('[data-modulo="pos"]') as HTMLElement;
    expect(filaPos.textContent).toContain('7 por atender');
    fireEvent.click(within(filaPos).getAllByRole('button')[0]);
    expect(filaPos.querySelector('[data-widget-inicio="ventas"]')).not.toBeNull();
    const filaLog = r.container.querySelector('[data-modulo="logistica"]') as HTMLElement;
    expect(filaLog.textContent).toContain('5 atrasados');
    fireEvent.click(within(filaLog).getAllByRole('button')[0]);
    expect(filaLog.querySelector('[data-widget-inicio="logistica"]')).not.toBeNull();
  });
});
