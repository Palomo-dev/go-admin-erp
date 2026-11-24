/** @jest-environment jsdom */
/**
 * Logística › Envíos (Figma «21 Logística», secciones 11 y 12):
 * - la lista con datos en los cuatro idiomas sin claves faltantes, con sus pestañas con conteo y el
 *   cobro que sale del pedido; vacía, con el estado «Aún no hay envíos»; una pestaña va a la URL;
 * - el formulario nuevo deja todo editable y no guarda sin lo mínimo; editar un envío en camino
 *   bloquea destinatario y paquete y deja promesa, notas y teléfono;
 * - los diálogos: cambiar estado de varios (solo pasan los que pueden), cancelar (pide motivo),
 *   devolver (el dinero va por el pedido) e imprimir guías (copias).
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import es from '../../../../../messages/es.json';
import en from '../../../../../messages/en.json';
import fr from '../../../../../messages/fr.json';
import pt from '../../../../../messages/pt.json';
import type { FilaEnvio } from '@/lib/logistica/envios';
import type { EnvioEditable } from '@/lib/services/logistica/enviosService';

const push = jest.fn();
const replace = jest.fn();
let parametros = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/app/logistica/envios',
  useSearchParams: () => parametros,
}));
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({
  ...jest.requireActual('@/components/shell/header/cabeceraMovil'),
  useCabeceraMovil: () => undefined,
}));
jest.mock('@/components/configuracion/AtajoConfigurar', () => ({ AtajoConfigurar: () => null }));
jest.mock('@/lib/documents/cliente', () => ({ guardarArchivo: jest.fn() }));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ code: 'COP', locale: 'es-CO', decimals: 0, formatear: (v: number) => `$ ${Number(v).toLocaleString('es-CO')}` }),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 1, name: 'Org 1' } }), getOrganizationId: () => 1 }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({
    timezone: 'America/Bogota',
    getToday: () => '2026-11-24',
    formatTime: () => '11:52',
    formatPlain: (v: string) => v,
    formatDateTime: (v: string) => v,
  }),
}));
jest.mock('@/lib/context/BranchContext', () => ({
  useBranch: () => ({ branches: [{ id: 3, name: 'Sede Centro' }], branchFilter: null, selectedBranchId: 3, isLoading: false }),
}));
const toastError = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({ toastSuccess: jest.fn(), toastError: (...a: unknown[]) => toastError(...a) }));
jest.mock('../../useImpresionLogistica', () => ({ useImpresionLogistica: () => ({ imprimirGuias: jest.fn(), imprimirHojaRuta: jest.fn() }) }));
jest.mock('../../asignar/HojaAsignarDomiciliario', () => ({ HojaAsignarDomiciliario: () => null }));
jest.mock('../../logisticaApi', () => ({ avisarCliente: jest.fn(async () => true) }));
jest.mock('../../cotizar/useCotizacionDomicilio', () => ({
  useCotizacionDomicilio: () => ({ estado: 'inactivo', respuesta: null, hayDireccion: false, cotizacion: null, puedeEditarCargo: false }),
}));
jest.mock('@/components/finanzas/documento/terceros', () => ({ ElegirCliente: () => <div data-testid="elegir-cliente" /> }));
const changeStatus = jest.fn(async () => ({ status: 'out_for_delivery', aviso: 'en_camino' }));
jest.mock('@/lib/services/deliveryIntegrationService', () => ({
  EnvioError: class extends Error {
    constructor(public codigo: string) {
      super(codigo);
    }
  },
  deliveryIntegrationService: { changeStatus: (...a: unknown[]) => changeStatus(...(a as [])) },
}));
jest.mock('@/lib/services/shipmentsService', () => ({ shipmentsService: { bulkMarkPaid: jest.fn(async () => ({ succeeded: 0, failed: 0 })) } }));

const listarEnvios = jest.fn();
const leerEnvioEditable = jest.fn();
const crearEnvio = jest.fn();
jest.mock('@/lib/services/logistica/enviosService', () => ({
  listarEnvios: (...a: unknown[]) => listarEnvios(...a),
  opcionesEnvios: jest.fn(async () => ({ domiciliarios: [{ id: 'd1', nombre: 'Andrés Pérez' }], transportadoras: [], viajes: [], zonas: [], paradas: [] })),
  leerEnvioEditable: (...a: unknown[]) => leerEnvioEditable(...a),
  pedidosSinEnvio: jest.fn(async () => []),
  crearEnvio: (...a: unknown[]) => crearEnvio(...a),
  actualizarEnvio: jest.fn(),
}));

import { EnviosPage } from '../EnviosPage';
import { FormularioEnvio, datosVacios } from '../FormularioEnvio';
import { DialogoCambiarEstado, DialogoCancelar, DialogoDevolver, DialogoImprimirGuias } from '../DialogosEnvios';

const IDIOMAS = { es, en, fr, pt } as const;
type Idioma = keyof typeof IDIOMAS;

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: true, media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined,
    addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  window.scrollTo = () => undefined;
});
beforeEach(() => {
  jest.clearAllMocks();
  parametros = new URLSearchParams();
});

function pintar(ui: ReactElement, locale: Idioma = 'es') {
  const errores: string[] = [];
  const r = render(
    <NextIntlClientProvider locale={locale} messages={IDIOMAS[locale] as unknown as Record<string, never>} onError={(e) => errores.push(e.message)}>
      {ui}
    </NextIntlClientProvider>,
  );
  return { errores, ...r };
}

function fila(p: Partial<FilaEnvio> = {}): FilaEnvio {
  return {
    id: 'e1', numero: 'ENV-0712', status: 'out_for_delivery', modo: 'own', branchId: 3, canal: 'web', pedido: 'WO-000412', pedidoWebId: 'w1',
    creado: '2026-11-24T16:52:00Z', cliente: 'Ana Gómez', telefono: '300 555 12 34', direccion: 'Cra 45 #12-30', ciudad: 'Bogotá', barrio: 'Chapinero',
    instrucciones: null, promesa: '2026-11-24T18:00:00Z', fechaEsperada: null, valor: 128900, moneda: 'COP', contraentrega: 128900, codStatus: 'pending',
    pagado: false, domiciliarioId: 'd1', domiciliario: 'Andrés Pérez', vehiculoId: null, asignado: null, intentosFallidos: 0, motivoNovedad: null,
    codigoRequerido: true, sourceType: 'web_order', sourceId: 'w1', guia: null, transportadora: null, transportadoraId: null, vehiculoTipo: 'motorcycle',
    sede: 'Sede Centro', zonaId: null, zona: null, viajeId: null, salio: '2026-11-24T17:44:00Z', entregado: null, actualizado: null, pesoKg: 1.2,
    costoEnvio: 8000, pagoPedido: 'pending', pedidoAnulado: false, recibio: null, recibioConFoto: false,
    ...p,
  };
}

const FILAS: FilaEnvio[] = [
  fila(),
  fila({ id: 'e2', numero: 'ENV-0711', status: 'delivered', contraentrega: 0, codStatus: null, pagoPedido: 'paid', pedido: 'WO-000411', recibio: 'Jorge', recibioConFoto: true }),
  fila({ id: 'e3', numero: 'ENV-0710', status: 'pending', domiciliarioId: null, domiciliario: null, canal: 'pos', sourceType: 'sale', pedido: 'ENV-0710', contraentrega: 0, codStatus: null }),
  fila({ id: 'e4', numero: 'ENV-0708', status: 'failed_attempt', motivoNovedad: 'not_home', intentosFallidos: 1 }),
  fila({ id: 'e5', numero: 'ENV-0702', status: 'cancelled', canal: 'manual', sourceType: 'manual', sourceId: null, pedido: null, contraentrega: 0, codStatus: null, pedidoAnulado: true }),
];

describe('Lista de Envíos (2959:8043)', () => {
  test.each(Object.keys(IDIOMAS) as Idioma[])('%s: con datos, sin claves faltantes', async (idioma) => {
    listarEnvios.mockResolvedValue({ filas: FILAS, recortada: false });
    const { errores } = pintar(<EnviosPage />, idioma);
    await screen.findAllByText('ENV-0712');
    expect(errores).toEqual([]);
  });

  test('pestañas con su conteo, KPI y cobro del pedido', async () => {
    listarEnvios.mockResolvedValue({ filas: FILAS, recortada: false });
    pintar(<EnviosPage />);
    await screen.findAllByText('ENV-0712');
    const pestanas = screen.getByRole('tablist', { name: 'Envíos por estado' });
    const textos = within(pestanas).getAllByRole('tab').map((t) => t.textContent);
    expect(textos).toEqual(['Todos5', 'Por asignar1', 'En camino1', 'Con novedad1', 'Entregados1', 'Devueltos0', 'Cancelados1']);
    // El envío de la tienda con pedido pagado se ve «Pagado» (antes «Pendiente»), y el cancelado «Sin cobro».
    const tabla = screen.getByRole('table');
    expect(within(tabla).getAllByText('Pagado').length).toBeGreaterThan(0);
    expect(within(tabla).getAllByText('Sin cobro').length).toBeGreaterThan(0);
    expect(within(tabla).getAllByText('Contraentrega').length).toBe(2);
    expect(screen.getByText('Envíos del periodo')).toBeTruthy();
    expect(screen.getByText(/1 con novedad: cliente ausente/)).toBeTruthy();
  });

  test('elegir una pestaña la lleva a la URL', async () => {
    listarEnvios.mockResolvedValue({ filas: FILAS, recortada: false });
    pintar(<EnviosPage />);
    await screen.findAllByText('ENV-0712');
    fireEvent.click(screen.getByRole('tab', { name: /Entregados/ }));
    expect(replace).toHaveBeenCalledWith(expect.stringContaining('pestana=entregados'), expect.anything());
  });

  test('con una pestaña en la URL solo se ven los suyos', async () => {
    parametros = new URLSearchParams('pestana=cancelados');
    listarEnvios.mockResolvedValue({ filas: FILAS, recortada: false });
    pintar(<EnviosPage />);
    await screen.findAllByText('ENV-0702');
    expect(screen.queryAllByText('ENV-0712')).toHaveLength(0);
  });

  test('vacía: explica de dónde salen los envíos y ofrece crear uno', async () => {
    listarEnvios.mockResolvedValue({ filas: [], recortada: false });
    pintar(<EnviosPage />);
    expect(await screen.findByText('Aún no hay envíos')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Nuevo envío/ }).length).toBeGreaterThan(0);
  });
});

function editable(status: string): EnvioEditable {
  return {
    id: 's1', numero: 'ENV-0712', status, sourceType: 'manual', sourceId: null, pedido: null, domiciliario: 'Andrés Pérez', creado: '2026-11-24T16:52:00Z',
    metadata: {},
    datos: { ...datosVacios(3, 'Org 1'), destinatario: 'Ana', telefono: '+57 3005551234', direccion: 'Cra 45 #12-30', ciudad: 'Bogotá', notas: 'Llamar' },
  };
}

describe('Formulario de envío (2963:8719 y 2965:9202)', () => {
  test.each(Object.keys(IDIOMAS) as Idioma[])('%s: nuevo, sin claves faltantes', (idioma) => {
    const { errores } = pintar(<FormularioEnvio />, idioma);
    expect(errores).toEqual([]);
  });

  test('nuevo: todo editable y no guarda sin lo mínimo', async () => {
    pintar(<FormularioEnvio />);
    const direccion = screen.getByLabelText(/Dirección/) as HTMLInputElement;
    expect(direccion.disabled).toBe(false);
    fireEvent.click(screen.getAllByRole('button', { name: /Crear envío/ })[0]);
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(crearEnvio).not.toHaveBeenCalled();
  });

  test('editar en camino: destinatario y paquete bloqueados; promesa, notas y teléfono no', async () => {
    leerEnvioEditable.mockResolvedValue(editable('out_for_delivery'));
    pintar(<FormularioEnvio id="s1" />);
    expect(await screen.findByText(/Este envío va en camino/)).toBeTruthy();
    expect((screen.getByLabelText(/Dirección/) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText(/Contenido de la línea 1/) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText(/Notas para quien entrega/) as HTMLTextAreaElement).disabled).toBe(false);
    expect(screen.getAllByRole('button', { name: /Guardar cambios/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Crear e imprimir/ })).toBeNull();
  });

  test('editar entregado: solo las notas', async () => {
    leerEnvioEditable.mockResolvedValue(editable('delivered'));
    pintar(<FormularioEnvio id="s1" />);
    expect(await screen.findByText(/solo se pueden cambiar las notas/)).toBeTruthy();
    expect((screen.getByLabelText(/Indicaciones/) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText(/Notas para quien entrega/) as HTMLTextAreaElement).disabled).toBe(false);
  });
});

const enDialogo = (p: Partial<FilaEnvio>) => fila(p);

describe('Diálogos (2965:9890, 9958, 10022, 10078)', () => {
  test.each(Object.keys(IDIOMAS) as Idioma[])('%s: los cuatro diálogos sin claves faltantes', (idioma) => {
    const envios = [enDialogo({}), enDialogo({ id: 'b', numero: 'ENV-0709', status: 'delivered' })];
    const { errores } = pintar(
      <>
        <DialogoCambiarEstado abierto onAbiertoChange={() => undefined} envios={envios} onHecho={() => undefined} />
        <DialogoDevolver abierto onAbiertoChange={() => undefined} envios={[{ ...envios[0], pagado: true }]} onHecho={() => undefined} />
        <DialogoCancelar abierto onAbiertoChange={() => undefined} envios={[enDialogo({ status: 'pending' })]} onHecho={() => undefined} />
        <DialogoImprimirGuias abierto onAbiertoChange={() => undefined} envios={envios} organizacion="Org 1" onImprimir={() => undefined} />
      </>,
      idioma,
    );
    expect(errores).toEqual([]);
  });

  test('cambiar estado de varios: solo pasan los que pueden, uno por uno por la RPC', async () => {
    const onHecho = jest.fn();
    const envios = [
      enDialogo({ id: 'a', numero: 'ENV-0712', status: 'assigned' }),
      enDialogo({ id: 'b', numero: 'ENV-0715', status: 'ready_for_pickup' }),
      enDialogo({ id: 'c', numero: 'ENV-0702', status: 'cancelled' }),
    ];
    pintar(<DialogoCambiarEstado abierto onAbiertoChange={() => undefined} envios={envios} onHecho={onHecho} />);
    // El primer estado al que alguno puede pasar es «Listo para recoger» (solo ENV-0712).
    expect(screen.getByTestId('pueden').textContent).toContain('ENV-0712');
    expect(screen.getByTestId('no-pueden').textContent).toContain('ENV-0702');
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar 1 envío' }));
    await waitFor(() => expect(onHecho).toHaveBeenCalled());
    expect(changeStatus).toHaveBeenCalledTimes(1);
    expect(changeStatus).toHaveBeenCalledWith('a', 'ready_for_pickup', { nota: undefined });
  });

  test('cancelar pide el motivo antes de llamar a la base', async () => {
    pintar(<DialogoCancelar abierto onAbiertoChange={() => undefined} envios={[enDialogo({ status: 'pending', pedido: 'POS-V-1088' })]} onHecho={() => undefined} />);
    expect(screen.getByText(/sigue activo/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar envío' }));
    expect(await screen.findByText('Elige el motivo de la cancelación')).toBeTruthy();
    expect(changeStatus).not.toHaveBeenCalled();
  });

  test('devolver: el dinero de un pedido pagado se devuelve desde el pedido', () => {
    pintar(<DialogoDevolver abierto onAbiertoChange={() => undefined} envios={[{ ...enDialogo({ numero: 'ENV-0705', pedido: 'WO-000400' }), pagado: true }]} onHecho={() => undefined} />);
    expect(screen.getByText('Devolver ENV-0705 a la sede')).toBeTruthy();
    expect(screen.getByText(/WO-000400 ya está pagado/)).toBeTruthy();
    expect(screen.getByText('Reingresar al inventario de Sede Centro')).toBeTruthy();
  });

  test('imprimir guías: vista previa y copias por envío', async () => {
    const onImprimir = jest.fn();
    pintar(<DialogoImprimirGuias abierto onAbiertoChange={() => undefined} envios={[enDialogo({}), enDialogo({ id: 'b', numero: 'ENV-0711' })]} organizacion="Org 1" onImprimir={onImprimir} />);
    expect(screen.getByText('CONTRAENTREGA $ 128.900')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Imprimir 2 guías' }));
    await waitFor(() => expect(onImprimir).toHaveBeenCalledWith(1));
  });
});
