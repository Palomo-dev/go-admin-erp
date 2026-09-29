/**
 * @jest-environment jsdom
 *
 * Listado de facturas de venta frente al Figma aprobado (B.1, 421:167503 y
 * «selección y acciones en lote»): subtítulo con el periodo, buscador único
 * sin pista «/», KPIs con subtexto, «Vencido» que filtra, chips con «Limpiar
 * filtros», columnas Método y PMS, número como enlace, selección con la barra
 * flotante y las acciones en lote sobre las rutas existentes.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { FilaFacturaListado, RespuestaListadoFacturas } from '@/lib/finanzas/ventas/listadoFacturas';

let params = new URLSearchParams();
const replace = jest.fn();
const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/app/finanzas/facturas-venta',
  useSearchParams: () => params,
}));

const pedirListadoFacturas = jest.fn();
const anularFacturaVenta = jest.fn();
jest.mock('@/lib/finanzas/ventas/clienteFacturas', () => ({
  ...jest.requireActual('@/lib/finanzas/ventas/clienteFacturas'),
  pedirListadoFacturas: (...a: unknown[]) => pedirListadoFacturas(...a),
  anularFacturaVenta: (...a: unknown[]) => anularFacturaVenta(...a),
}));

jest.mock('@/lib/finanzas/usePermisosFinanzas', () => ({
  usePermisosFinanzas: () => ({ ver: true, crear: true, anular: true, aprobar: false, posVer: false, posCrear: false, posAnular: false, cargando: false }),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({
  useOrganization: () => ({ organization: { id: 7, name: 'Mi empresa S.A.S.' }, isLoading: false }),
  getOrganizationId: () => 7,
}));
jest.mock('@/lib/context/BranchContext', () => ({
  useBranch: () => ({ branchFilter: 3, branches: [{ id: 3, name: 'Sucursal Principal' }], isLoading: false }),
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ getToday: () => '2026-09-28', formatDate: (v: string | null) => v ?? '' }),
}));
// Moneda cualquiera: la pantalla no cablea ninguna (guardarraíl L14).
const BASE = { code: 'EUR', decimals: 0, locale: 'es-CO' };
const MONEDA = { ...BASE, formatear: (n: number) => String(n), paraDocumento: () => BASE, resuelta: true };
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => MONEDA }));
const imprimirDocumento = jest.fn();
jest.mock('@/lib/documents/cliente', () => ({
  imprimirDocumento: (...a: unknown[]) => imprimirDocumento(...a),
  abrirDocumento: jest.fn(),
  descargarDocumento: jest.fn(),
}));
jest.mock('@/lib/services/clientesListadoService', () => ({ listarClientes: jest.fn() }));
jest.mock('@/components/ui/use-toast', () => ({ toastError: jest.fn(), toastSuccess: jest.fn(), toastWarning: jest.fn() }));
jest.mock('@/components/finanzas/pagos/RegistrarPagoConectado', () => ({
  RegistrarPagoConectado: ({ destino }: { destino: unknown }) => <pre data-testid="pago">{JSON.stringify(destino)}</pre>,
}));
jest.mock('../../ImportarCSVDialog', () => ({ ImportarCSVDialog: () => null }));
jest.mock('@/components/kit', () => ({
  ...jest.requireActual('@/components/kit'),
  BranchBadgeActiva: () => null,
}));

import { ListadoFacturasVenta } from '../ListadoFacturasVenta';

const fila = (p: Partial<FilaFacturaListado> & { id: string; numero: string }): FilaFacturaListado => ({
  estado: 'issued',
  tipo: 'invoice',
  emision: '2026-09-12',
  vencimiento: '2026-10-12',
  moneda: 'EUR',
  total: 4802000,
  saldo: 3302000,
  metodo: 'transfer',
  metodo_nombre: 'Transferencia bancaria',
  branch_id: 3,
  sucursal: 'Sucursal Principal',
  fe: 'accepted',
  sale_id: null,
  origen: null,
  pms: false,
  cliente_id: 'c1',
  cliente: 'Distribuidora del Norte',
  cliente_doc: 'NIT 900145221-7',
  dias_vencida: 0,
  ...p,
});

const FILAS: FilaFacturaListado[] = [
  fila({ id: 'f42', numero: 'FV-00042' }),
  fila({ id: 'f41', numero: 'FV-00041', saldo: 0, total: 12340000, metodo: 'cash', cliente_id: 'c2', cliente: 'Textiles Andinos S.A.S.' }),
  fila({ id: 'f39', numero: 'FV-00039', saldo: 0, total: 2150000, metodo: 'card', fe: 'sent', pms: true, cliente_id: 'c3', cliente: 'Hotel Miramar' }),
  fila({ id: 'f38', numero: 'FV-00038', estado: 'draft', saldo: 640000, total: 640000, metodo: null, fe: null, cliente_id: 'c4', cliente: 'Empaques del Valle' }),
  fila({ id: 'f37', numero: 'FV-00037', saldo: 500000, total: 900000, cliente_id: 'c1' }),
];

const RESPUESTA: RespuestaListadoFacturas = {
  total: 32,
  filas: FILAS,
  kpis: [
    {
      moneda: 'EUR',
      facturado: 86420000,
      facturas_emitidas: 32,
      por_cobrar: 21905400,
      facturas_con_saldo: 18,
      vencido: 4310000,
      facturas_vencidas: 5,
      vence_15: 7120000,
      facturas_vence_15: 9,
    },
  ],
};

/** Última query que pidió la pantalla. */
const ultimaQuery = () => pedirListadoFacturas.mock.calls.at(-1)?.[0] as URLSearchParams;
/** Query que la pantalla escribió en la URL. */
const urlEscrita = () => new URLSearchParams(String(replace.mock.calls.at(-1)?.[0] ?? '').split('?')[1] ?? '');

async function montar(query = '') {
  params = new URLSearchParams(query);
  renderConIdioma(<ListadoFacturasVenta />);
  await screen.findByRole('link', { name: 'FV-00042' });
}

function marcar(numero: string) {
  // La tabla de escritorio (el DataTable también dibuja las tarjetas móviles).
  fireEvent.click(within(screen.getByRole('table')).getByRole('checkbox', { name: new RegExp(numero) }));
}

beforeEach(() => {
  jest.clearAllMocks();
  pedirListadoFacturas.mockResolvedValue(RESPUESTA);
});

describe('cabecera, KPIs y barra como el Figma', () => {
  it('subtítulo «organización · sucursal · periodo» y KPIs con su subtexto', async () => {
    await montar();
    expect(screen.getByText('Mi empresa S.A.S. · Sucursal Principal · 1 al 28 de septiembre de 2026')).toBeTruthy();
    expect(screen.getByText('32 facturas emitidas')).toBeTruthy();
    expect(screen.getByText('18 con saldo')).toBeTruthy();
    expect(screen.getByText('5 facturas · toca para filtrar →')).toBeTruthy();
    expect(screen.getByText('9 facturas · toca para filtrar →')).toBeTruthy();
    // La tarjeta «Vencido» lleva el borde rojo.
    expect(screen.getByRole('button', { name: /Vencido/ }).className).toContain('border-line-danger');
  });

  // La pista «/» vuelve (decisión del dueño, 2026-09-29): el Figma la dibuja en todo buscador de página.
  it('buscador único con la pista «/» y sin el rango de fechas en la barra', async () => {
    await montar();
    const buscador = screen.getByPlaceholderText('Buscar por número, cliente o referencia');
    const barra = buscador.closest('div.flex.items-center.gap-2') as HTMLElement;
    expect(within(barra).queryByText('/')).toBeTruthy();
    expect(buscador.getAttribute('aria-keyshortcuts')).toBe('/');
    expect(within(barra).queryByRole('button', { name: /Periodo de emisión/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Filtros/ })).toBeTruthy();
  });

  it('pide el mes en curso para el listado y para los KPIs, con la sucursal activa', async () => {
    await montar();
    const q = ultimaQuery();
    expect(q.get('desde')).toBe('2026-09-01');
    expect(q.get('hasta')).toBe('2026-09-28');
    expect(q.get('kpi_desde')).toBe('2026-09-01');
    expect(q.get('kpi_hasta')).toBe('2026-09-28');
    expect(q.get('sucursal')).toBe('3');
  });

  it('«Vencido» filtra toda la cartera vencida (sin límite de emisión)', async () => {
    await montar();
    fireEvent.click(screen.getByRole('button', { name: /Vencido/ }));
    const url = urlEscrita();
    expect(url.get('estado_pago')).toBe('vencida');
    expect(url.get('periodo')).toBe('todo');
  });

  it('con periodo=todo no manda desde/hasta al listado pero sí el periodo de los KPIs, y lo dice el chip', async () => {
    await montar('estado_pago=vencida&periodo=todo');
    const q = ultimaQuery();
    expect(q.get('desde')).toBeNull();
    expect(q.get('kpi_desde')).toBe('2026-09-01');
    expect(q.get('periodo')).toBeNull();
    expect(screen.getByText('Emitidas: todas las fechas')).toBeTruthy();
    expect(screen.getByText('Pago: Vencida')).toBeTruthy();
  });
});

describe('filtros → chips → URL', () => {
  it('chips con prefijo y «Limpiar filtros»; quitar uno reescribe la URL', async () => {
    await montar('estado_doc=emitida&desde=2026-09-01&hasta=2026-09-15');
    expect(screen.getByText('Estado: Emitida')).toBeTruthy();
    expect(screen.getByText('Emitidas: 1 – 15 sep 2026')).toBeTruthy();
    expect(ultimaQuery().get('estado_doc')).toBe('emitida');
    expect(ultimaQuery().get('hasta')).toBe('2026-09-15');

    fireEvent.click(screen.getByRole('button', { name: /Quitar.*Emitidas: 1 – 15 sep 2026|Emitidas: 1 – 15 sep 2026/ }));
    const url = urlEscrita();
    expect(url.get('desde')).toBeNull();
    expect(url.get('estado_doc')).toBe('emitida');

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(urlEscrita().toString()).toBe('');
  });
});

describe('filtro «Vence: …» (vencimiento resuelto en el servidor)', () => {
  it('la URL manda el atajo a la RPC y lo muestra como chip; quitarlo limpia las tres claves', async () => {
    await montar('vence=mes&periodo=todo&estado_doc=emitida');
    expect(ultimaQuery().get('vence')).toBe('mes');
    expect(ultimaQuery().get('desde')).toBeNull();
    expect(screen.getByText('Vence: este mes')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Vence: este mes/ }));
    const url = urlEscrita();
    expect(url.get('vence')).toBeNull();
    expect(url.get('estado_doc')).toBe('emitida');
  });

  it('rango: chip con los días elegidos y vence_desde / vence_hasta en la query', async () => {
    await montar('vence=rango&vence_desde=2026-10-01&vence_hasta=2026-10-15&periodo=todo');
    expect(screen.getByText('Vence: 1 – 15 oct 2026')).toBeTruthy();
    const q = ultimaQuery();
    expect(q.get('vence')).toBe('rango');
    expect(q.get('vence_desde')).toBe('2026-10-01');
    expect(q.get('vence_hasta')).toBe('2026-10-15');

    fireEvent.click(screen.getByRole('button', { name: /Vence: 1 – 15 oct 2026/ }));
    const url = urlEscrita();
    expect(url.get('vence')).toBeNull();
    expect(url.get('vence_desde')).toBeNull();
    expect(url.get('vence_hasta')).toBeNull();
  });

  it('un atajo desconocido en la URL no pinta chip', async () => {
    await montar('vence=manana');
    expect(screen.queryByText(/^Vence:/)).toBeNull();
  });

  it('«Vence en 15 días» filtra con el mismo filtro sobre toda la cartera', async () => {
    await montar('estado_pago=vencida&periodo=todo');
    fireEvent.click(screen.getByRole('button', { name: /Vence en 15 días/ }));
    const url = urlEscrita();
    expect(url.get('vence')).toBe('proximos15');
    expect(url.get('periodo')).toBe('todo');
    // Vencida y «vence en 15 días» se contradicen: la tarjeta deja solo el suyo.
    expect(url.get('estado_pago')).toBeNull();
  });

  it('«Vencido» quita el filtro de vencimiento', async () => {
    await montar('vence=mes&periodo=todo');
    fireEvent.click(screen.getByRole('button', { name: /Vencido/ }));
    const url = urlEscrita();
    expect(url.get('estado_pago')).toBe('vencida');
    expect(url.get('vence')).toBeNull();
  });
});

describe('tabla como el Figma', () => {
  it('columnas Método y PMS, número como enlace al detalle, FE y «Sin FE»', async () => {
    await montar();
    const tabla = screen.getByRole('table');
    for (const col of ['Número', 'Cliente', 'Emitida', 'Vencimiento', 'Total', 'Saldo', 'Método', 'Estado', 'Fact. electrónica', 'PMS']) {
      expect(within(tabla).getByRole('columnheader', { name: new RegExp(col) })).toBeTruthy();
    }
    expect(screen.getByRole('link', { name: 'FV-00042' }).getAttribute('href')).toBe('/app/finanzas/facturas-venta/f42');
    expect(within(tabla).getAllByText('Transferencia').length).toBeGreaterThan(0);
    expect(within(tabla).getByText('Efectivo')).toBeTruthy();
    expect(within(tabla).getByText('Sin definir')).toBeTruthy();
    expect(within(tabla).getAllByText('Aceptada DIAN').length).toBeGreaterThan(0);
    expect(within(tabla).getByText('Enviado')).toBeTruthy();
    expect(within(tabla).getByText('Sin FE')).toBeTruthy();
    expect(within(tabla).getByRole('img', { name: 'Con reserva' })).toBeTruthy();
    expect(within(tabla).getAllByText('NIT 900145221-7').length).toBeGreaterThan(0);
  });

  it('paginación completa del kit con el total del servidor', async () => {
    await montar();
    expect(screen.getAllByText(/de 32 facturas/).length).toBeGreaterThan(0);
  });
});

describe('selección y acciones en lote', () => {
  it('barra flotante «N facturas seleccionadas · Seleccionar las 32» con las acciones del Figma', async () => {
    await montar();
    marcar('FV-00042');
    marcar('FV-00041');
    const region = screen.getAllByRole('region', { name: 'Acciones masivas' })[0];
    expect(within(region).getByText('2 facturas seleccionadas')).toBeTruthy();
    expect(within(region).getByRole('button', { name: 'Seleccionar las 32' })).toBeTruthy();
    for (const accion of ['Registrar pago', 'Imprimir', 'Exportar', 'Anular']) {
      expect(within(region).getByRole('button', { name: new RegExp(accion) })).toBeTruthy();
    }
  });

  it('registrar pago: clientes distintos → deshabilitado con motivo; mismo cliente → reparto del cliente', async () => {
    await montar();
    marcar('FV-00042');
    marcar('FV-00041');
    let region = screen.getAllByRole('region', { name: 'Acciones masivas' })[0];
    const boton = within(region).getByRole('button', { name: /Registrar pago/ }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(boton.title).toMatch(/Hay facturas sin saldo|clientes distintos/);

    marcar('FV-00041');
    marcar('FV-00037');
    region = screen.getAllByRole('region', { name: 'Acciones masivas' })[0];
    fireEvent.click(within(region).getByRole('button', { name: /Registrar pago/ }));
    expect(JSON.parse(screen.getByTestId('pago').textContent ?? '{}')).toEqual({ tipo: 'tercero', customerId: 'c1', facturaIds: ['f42', 'f37'] });
  });

  it('imprimir abre el documento de cada factura elegida', async () => {
    await montar();
    marcar('FV-00042');
    marcar('FV-00039');
    const region = screen.getAllByRole('region', { name: 'Acciones masivas' })[0];
    fireEvent.click(within(region).getByRole('button', { name: /Imprimir/ }));
    expect(imprimirDocumento.mock.calls.map((c) => c[1]).sort()).toEqual(['f39', 'f42']);
  });

  it('anular en lote pide motivo, dice cuáles no se anulan y solo llama a la ruta con las anulables', async () => {
    anularFacturaVenta.mockResolvedValue({ productos_devueltos: 0 });
    await montar();
    marcar('FV-00042'); // con pagos (saldo < total) → excluida
    marcar('FV-00038'); // borrador → anulable
    const region = screen.getAllByRole('region', { name: 'Acciones masivas' })[0];
    fireEvent.click(within(region).getByRole('button', { name: /Anular/ }));

    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByText('Anular 1 factura', { selector: 'h2' })).toBeTruthy();
    expect(within(dialogo).getByText('1 factura no se anula')).toBeTruthy();
    expect(within(dialogo).getByText(/La factura tiene pagos/)).toBeTruthy();

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Error en la factura' }));
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Anular 1 factura' }));
    await waitFor(() => expect(anularFacturaVenta).toHaveBeenCalledTimes(1));
    expect(anularFacturaVenta).toHaveBeenCalledWith('f38', 'Error en la factura');
  });

  it('«Seleccionar las 32» trae todas las filas del filtro', async () => {
    await montar();
    marcar('FV-00042');
    const region = screen.getAllByRole('region', { name: 'Acciones masivas' })[0];
    pedirListadoFacturas.mockResolvedValueOnce({ ...RESPUESTA, total: 5 });
    fireEvent.click(within(region).getByRole('button', { name: 'Seleccionar las 32' }));
    await waitFor(() => expect(screen.getAllByText('5 facturas seleccionadas').length).toBeGreaterThan(0));
    expect(ultimaQuery().get('tamano')).toBe('200');
  });
});
