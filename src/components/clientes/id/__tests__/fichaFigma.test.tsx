/**
 * @jest-environment jsdom
 *
 * Ficha del cliente contra el Figma aprobado (06 Clientes, «Detalle de
 * cliente» 319:2837), con los textos reales de messages/es.json:
 *
 * - reglas puras (`fichaLogica`, menú «⋯» 332:119080);
 * - tarjeta de identidad (331:112918): badges, datos con icono, contacto
 *   principal y etiquetas;
 * - Resumen (331:112627): 6 KPIs, saldo en cartera con vencidas, historial con
 *   detalle y «Ver toda la actividad»;
 * - Tareas y Salud de la columna derecha;
 * - Finanzas (331:115207): KPIs, barra de acciones y filas de cartera.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { addPlainDays, todayInTz } from '@/lib/utils/dateDisplay';

jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ timezone: 'America/Bogota' }) }));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ formatear: (v: number) => `$ ${v}`, code: 'COP', paraDocumento: () => ({ code: 'COP' }) }),
}));
jest.mock('@/components/app-layout/Header/GlobalSearch/UserAvatar', () => ({ UserAvatar: () => <span /> }));
jest.mock('@/components/shared/HtmlContentRenderer', () => ({ HtmlContentRenderer: ({ html }: { html: string }) => <span>{html}</span> }));
jest.mock('@/components/finanzas/pagos/RegistrarPagoConectado', () => ({
  RegistrarPagoConectado: (p: { destino: { tipo: string; id?: string } }) => <p>{`cobro:${p.destino.tipo}:${p.destino.id}`}</p>,
}));
const enviarRecordatorio = jest.fn();
jest.mock('@/lib/finanzas/cartera/clienteCartera', () => ({ enviarRecordatorio: (...a: unknown[]) => enviarRecordatorio(...a) }));
const salud = jest.fn();
jest.mock('@/lib/services/crm/healthScoreService', () => ({
  healthScoreService: { getCustomerHealthScore: (...a: unknown[]) => salud(...a), countInvoices: async () => 2 },
}));

/** Respuestas por tabla: cada consulta encadenada termina en `{ data, error }`. */
let respuestas: Record<string, { data: unknown; error: unknown }> = {};
jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: (tabla: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'order', 'neq', 'limit']) q[m] = () => q;
      q.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(respuestas[tabla] ?? { data: [], error: null }).then(ok, ko);
      return q;
    },
  },
}));

import { diasParaVencer, estadoFicha, etiquetasVisibles, nivelFidelidad, tonoSalud } from '../fichaLogica';
import { construirAccionesFicha } from '../accionesFicha';
import { motivoSinCobro } from '../useCarteraFicha';
import ClienteHeader from '../ClienteHeader';
import ResumenTab from '../ResumenTab';
import TareasSidebar from '../TareasSidebar';
import CuentasTab from '../CuentasTab';
import { SaludClienteCard } from '../SaludClienteCard';
import type { FilaCartera } from '@/lib/finanzas/cartera/listadoCartera';

beforeEach(() => {
  respuestas = {};
  enviarRecordatorio.mockReset();
  salud.mockReset();
});

describe('reglas de la ficha', () => {
  test('estado: inactivo manda; luego la etapa del ciclo de vida', () => {
    expect(estadoFicha({ status: 'inactive', lifecycle_stage: 'customer' })).toBe('inactivo');
    expect(estadoFicha({ status: 'active', lifecycle_stage: 'lead' })).toBe('lead');
    expect(estadoFicha({ status: 'active', lifecycle_stage: 'customer' })).toBe('cliente');
    expect(estadoFicha({})).toBe('cliente');
  });

  test('nivel y etiquetas: el nivel sale de las etiquetas y no se repite como chip', () => {
    expect(nivelFidelidad(['corporativo', 'Oro'])).toBe('oro');
    expect(nivelFidelidad(['plata'])).toBe('plata');
    expect(nivelFidelidad(null)).toBe('basico');
    expect(etiquetasVisibles(['corporativo', 'oro', ' crédito 30 '])).toEqual(['corporativo', 'crédito 30']);
  });

  test('vencimiento de tareas en días calendario y tono de la salud', () => {
    const ahora = new Date('2026-09-22T15:00:00Z');
    expect(diasParaVencer('2026-09-23', 'America/Bogota', ahora)).toBe(1);
    expect(diasParaVencer('2026-09-21T23:00:00-05:00', 'America/Bogota', ahora)).toBe(-1);
    expect(diasParaVencer(null, 'America/Bogota', ahora)).toBeNull();
    expect(tonoSalud(78)).toBe('exito');
    expect(tonoSalud(50)).toBe('advertencia');
    expect(tonoSalud(10)).toBe('peligro');
  });

  test('«Registrar pago»: motivo según cartera y permisos', () => {
    const base = { estado: 'listo' as const, resumen: { por_cobrar: 10, cuentas_vencidas: 0 } as never, puedeCobrar: true, permisosCargando: false };
    expect(motivoSinCobro(base)).toBeNull();
    expect(motivoSinCobro({ ...base, resumen: { por_cobrar: 0 } as never })).toBe('sinSaldo');
    expect(motivoSinCobro({ ...base, puedeCobrar: false })).toBe('sinPermiso');
    expect(motivoSinCobro({ ...base, estado: 'cargando' })).toBe('cargando');
    expect(motivoSinCobro({ ...base, estado: 'error' })).toBe('error');
  });

  test('menú «⋯» (332:119080): dos grupos y eliminar al final', () => {
    const navegar = jest.fn();
    const nueva = jest.fn();
    const acciones = construirAccionesFicha({
      clienteId: 'c1',
      inactivo: false,
      t: (k) => k,
      navegar,
      onRegistrarPago: jest.fn(),
      motivoPago: 'Sin saldo por cobrar',
      onNuevaOportunidad: nueva,
      onEstadoCuenta: jest.fn(),
      motivoEstadoCuenta: null,
      onCambiarEstado: jest.fn(),
      onEliminar: jest.fn(),
    });
    expect(acciones.map((a) => a.id)).toEqual([
      'editar',
      'registrar-pago',
      'nueva-venta',
      'nueva-oportunidad',
      'estado-cuenta',
      'exportar-ficha',
      'inactivar',
      'unificar',
      'eliminar',
    ]);
    expect(acciones.find((a) => a.id === 'registrar-pago')).toMatchObject({ deshabilitada: true, motivo: 'Sin saldo por cobrar' });
    expect(acciones.find((a) => a.id === 'inactivar')?.separadorAntes).toBe(true);
    expect(acciones.find((a) => a.id === 'eliminar')?.destructiva).toBe(true);
    acciones.find((a) => a.id === 'nueva-oportunidad')?.onSelect();
    expect(nueva).toHaveBeenCalled();
    acciones.find((a) => a.id === 'editar')?.onSelect();
    expect(navegar).toHaveBeenCalledWith('/app/clientes/c1/editar');
  });
});

describe('tarjeta de identidad (331:112918)', () => {
  test('empresa: badges, datos con icono, contacto principal y etiquetas', async () => {
    respuestas.customer_company_links = { data: [{ is_primary: true, position: 'Gerente', person: { first_name: 'Jorge', last_name: 'Peña' } }], error: null };
    renderConIdioma(
      <ClienteHeader
        cliente={{
          id: 'c1',
          full_name: 'Comercial Ejemplo S.A.S.',
          customer_type: 'company',
          email: 'cartera@empresa-ejemplo.co',
          phone: '+57 604 444 1122',
          city: 'Medellín',
          address: 'Cra 43 #18-22',
          identification_type: 'NIT',
          identification_number: '901334221',
          dv: 7,
          tags: ['corporativo', 'crédito 30', 'oro'],
          lifecycle_stage: 'customer',
          status: 'active',
          health_score: 78,
          created_at: new Date().toISOString(),
        }}
      />,
    );
    for (const texto of ['Empresa', 'Cliente', 'Salud 78', 'Oro', 'NIT 901334221-7', 'cartera@empresa-ejemplo.co', '+57 604 444 1122', 'Medellín · Cra 43 #18-22', 'corporativo', 'crédito 30']) {
      expect(screen.getByText(texto)).toBeTruthy();
    }
    expect(await screen.findByText('Jorge Peña · Gerente')).toBeTruthy();
    expect(screen.getByText('Contacto principal:')).toBeTruthy();
    expect(screen.getByText('Etiquetas:')).toBeTruthy();
    // «oro» es el nivel, no un chip de etiqueta.
    expect(screen.queryByText('oro')).toBeNull();
  });

  test('persona antigua sin datos: solo lo que existe, sin «Nuevo»', () => {
    renderConIdioma(<ClienteHeader cliente={{ id: 'c2', full_name: 'Ana Pérez', customer_type: 'person', lifecycle_stage: 'lead', created_at: '2020-01-01T00:00:00Z' }} />);
    expect(screen.getByText('Persona')).toBeTruthy();
    expect(screen.getByText('Lead')).toBeTruthy();
    expect(screen.getByText('Básico')).toBeTruthy();
    expect(screen.queryByText('Nuevo')).toBeNull();
    expect(screen.queryByText(/Salud/)).toBeNull();
    expect(screen.queryByText('Etiquetas:')).toBeNull();
  });
});

describe('Resumen (331:112627)', () => {
  test('6 KPIs, saldo en cartera con vencidas e historial con detalle', async () => {
    const ahora = new Date().toISOString();
    respuestas.sales = {
      data: [{ id: 'a1b2c3d4-0000', total: 120000, sale_date: ahora, status: 'completed', payment_status: 'paid', user_id: 'u1', branch: { name: 'Sucursal Centro' }, sale_items: [{ count: 6 }] }],
      error: null,
    };
    respuestas.profiles = { data: [{ id: 'u1', first_name: 'Ana', last_name: 'Gómez' }], error: null };
    const verActividad = jest.fn();
    renderConIdioma(
      <ResumenTab
        clienteId="c1"
        organizationId={120}
        cartera={{ estado: 'listo', resumen: { por_cobrar: 3480000, cuentas_vencidas: 1 } as never, filas: [{ dias: 12 } as FilaCartera] }}
        onVerActividad={verActividad}
      />,
    );
    const kpis = await screen.findByRole('region', { name: 'Indicadores del cliente' });
    for (const etiqueta of ['Compras', 'Gasto Total', 'Saldo en cartera', 'Estadías', 'Pedidos Web', 'Saldo Folios']) {
      expect(within(kpis).getByText(etiqueta)).toBeTruthy();
    }
    expect(within(kpis).queryByText('Reservas Futuras')).toBeNull();
    expect(within(kpis).getByText('$ 3480000')).toBeTruthy();
    expect(within(kpis).getByText('1 factura vencida')).toBeTruthy();

    expect(await screen.findByText('Venta #A1B2C3D4')).toBeTruthy();
    expect(screen.getByText('6 productos · Sucursal Centro · $ 120000')).toBeTruthy();
    expect(screen.getByText(/^Hoy \d{1,2}:\d{2}.* · Ana Gómez$/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ver toda la actividad' }));
    expect(verActividad).toHaveBeenCalled();
  });
});

describe('columna derecha', () => {
  test('tareas: conteo, prioridad, «Vence mañana» y «Ver todas las tareas del cliente»', async () => {
    const manana = addPlainDays(todayInTz('America/Bogota'), 1);
    respuestas.tasks = {
      data: [
        { id: 't1', title: 'Llamar para confirmar el pago', description: null, due_date: manana, status: 'pending', priority: 'high', assigned_to: null },
        { id: 't2', title: 'Tarea cerrada', description: null, due_date: null, status: 'completed', priority: 'low', assigned_to: null },
      ],
      error: null,
    };
    const nueva = jest.fn();
    renderConIdioma(<TareasSidebar clienteId="c1" organizationId={120} onNuevaTarea={nueva} />);
    expect(await screen.findByText('Llamar para confirmar el pago')).toBeTruthy();
    expect(screen.getByText('Alta')).toBeTruthy();
    expect(screen.getByText('Vence mañana')).toBeTruthy();
    expect(screen.getByText('Tareas Finalizadas')).toBeTruthy();
    expect(screen.queryByText('Tarea cerrada')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ver todas las tareas del cliente' }));
    expect(screen.getByText('Tarea cerrada')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Nueva' }));
    expect(nueva).toHaveBeenCalled();
  });

  test('salud: puntaje, banda «N / 100» y alertas', async () => {
    salud.mockResolvedValue({ score: 78, band: 'green', alerts: [{ code: 'overdue' }, { code: 'no_invoice' }], raw: { days_since_last_invoice: 30 }, indicators: [] });
    renderConIdioma(<SaludClienteCard customerId="c1" lifecycleStage="customer" />);
    expect(await screen.findByText('78 / 100')).toBeTruthy();
    expect(screen.getByText('Saludable')).toBeTruthy();
    expect(screen.getByText('Alertas: cartera vencida · sin compras en 30 d')).toBeTruthy();
  });

  test('salud de un lead con facturas: el aviso de siempre', async () => {
    salud.mockResolvedValue(null);
    renderConIdioma(<SaludClienteCard customerId="c1" lifecycleStage="lead" />);
    expect(await screen.findByText(/esta ficha es un lead con 2 facturas/)).toBeTruthy();
  });
});

describe('Finanzas (331:115207)', () => {
  const fila = (p: Partial<FilaCartera>): FilaCartera => ({
    id: 'ar1',
    invoice_id: 'f1',
    numero: 'FV-2026-00418',
    sale_id: null,
    origen: 'factura',
    cliente_id: 'c1',
    cliente: null,
    cliente_doc: null,
    cliente_email: null,
    cliente_telefono: null,
    branch_id: null,
    sucursal: null,
    vencimiento: '2026-09-10T05:00:00Z',
    monto: 3480000,
    saldo: 1250000,
    moneda: 'COP',
    estado: 'overdue',
    dias: 12,
    cuotas: 0,
    cuotas_pendientes: 0,
    ultimo_recordatorio: null,
    ...p,
  });

  test('KPIs, barra de acciones y filas con «Ver» y «Registrar pago»', async () => {
    const recargar = jest.fn();
    enviarRecordatorio.mockResolvedValue({ enviado: true, destino: 'cartera@empresa-ejemplo.co' });
    renderConIdioma(
      <CuentasTab
        clienteId="c1"
        organizationId={120}
        cartera={{
          estado: 'listo',
          resumen: { por_cobrar: 1670000, cuentas_vencidas: 1, monedas: ['COP'] } as never,
          filas: [fila({}), fila({ id: 'ar2', invoice_id: null, numero: null, origen: 'pos', saldo: 420000, monto: 420000, dias: 0, estado: 'current' })],
          puedeCobrar: true,
          permisosCargando: false,
          recargar,
        }}
        motivoPago={null}
        onRegistrarPago={jest.fn()}
        onEstadoCuenta={jest.fn()}
        motivoEstadoCuenta={null}
      />,
    );
    const kpis = screen.getByRole('region', { name: 'Resumen financiero del cliente' });
    for (const etiqueta of ['Deuda total', 'Folios pendientes', 'Facturas por cobrar']) expect(within(kpis).getByText(etiqueta)).toBeTruthy();
    expect(within(kpis).getByText('1 vencida hace 12 d')).toBeTruthy();
    expect(screen.getByText('Moneda: COP')).toBeTruthy();

    expect(await screen.findByText('Factura FV-2026-00418')).toBeTruthy();
    expect(screen.getByText('Vencida 12 d')).toBeTruthy();
    expect(screen.getByText('de $ 3480000')).toBeTruthy();
    expect(screen.getByText('Cuenta por cobrar')).toBeTruthy();
    expect(screen.getByText('Facturas por cobrar (1) · Folios de reservas (0) · Cuentas por cobrar (1)')).toBeTruthy();

    const filaFactura = screen.getByText('Factura FV-2026-00418').closest('li') as HTMLElement;
    expect(within(filaFactura).getByRole('link', { name: 'Ver' }).getAttribute('href')).toBe('/app/finanzas/cuentas-por-cobrar/ar1');
    fireEvent.click(within(filaFactura).getByRole('button', { name: 'Registrar pago' }));
    expect(await screen.findByText('cobro:cuenta:ar1')).toBeTruthy();

    // Recordatorio: confirma y lo envía solo por la vencida.
    fireEvent.click(screen.getByRole('button', { name: 'Enviar recordatorio' }));
    const dialogo = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Enviar recordatorio' }));
    await waitFor(() => expect(enviarRecordatorio).toHaveBeenCalledTimes(1));
    expect(enviarRecordatorio).toHaveBeenCalledWith('ar1', { canal: 'correo', origen: 'finanzas' });
  });

  test('sin vencidas, «Enviar recordatorio» queda deshabilitado con su motivo', () => {
    renderConIdioma(
      <CuentasTab
        clienteId="c1"
        organizationId={120}
        cartera={{ estado: 'listo', resumen: { por_cobrar: 0, cuentas_vencidas: 0, monedas: ['COP'] } as never, filas: [], puedeCobrar: true, permisosCargando: false, recargar: jest.fn() }}
        motivoPago="Sin saldo por cobrar"
        onRegistrarPago={jest.fn()}
        onEstadoCuenta={jest.fn()}
        motivoEstadoCuenta={null}
      />,
    );
    const recordatorio = screen.getByRole('button', { name: 'Enviar recordatorio' }) as HTMLButtonElement;
    expect(recordatorio.disabled).toBe(true);
    expect(recordatorio.getAttribute('title')).toBe('Sin facturas vencidas');
    expect((screen.getByRole('button', { name: 'Registrar pago' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
