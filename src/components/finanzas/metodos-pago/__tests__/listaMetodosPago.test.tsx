/**
 * @jest-environment jsdom
 *
 * Lista de Métodos de pago según Figma (escritorio `1010:85721`, captura
 * `72-tesoreria-14-metodos-de-pago.png`; móvil `1010:86844`, captura
 * `86-arreglos-metodos-pago-movil.png`). El dueño la abrió en el celular
 * (2026-11-08) y seguía con la tabla vieja.
 *
 * 1. Estructura a 1440 px (tabla) y a 390 px (tarjetas): aviso «usados y sin
 *    configurar», destino del dinero, reglas, canales, estado y «⋯».
 * 2. Caracterización de las acciones que la lista ya tenía, con la MISMA
 *    escritura: activar/desactivar (`is_active`), tienda web
 *    (`show_on_website`), orden (`website_display_order`), editar, quitar
 *    (desactivar con pagos / eliminar sin pagos, solo el vínculo), conectar
 *    pasarela con el asistente nuevo y ver la conexión.
 * Datos inventados.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';

type Registro = { tabla: string; op: 'select' | 'update' | 'delete'; payload?: unknown; filtros: Array<[string, unknown]> };
const mockLlamadas: Registro[] = [];
const PAGOS: Record<string, number> = { cash: 10, transfer: 5, wompi: 2, mp: 3, nequi: 590 };

function resultado(r: Registro): unknown {
  if (r.op === 'update') return { data: null, error: null };
  if (r.op === 'delete') return { data: [{ id: r.filtros.find(([c]) => c === 'id')?.[1] }], error: null };
  if (r.tabla === 'bank_accounts') return { data: [{ id: 3, name: 'Ahorros', bank_name: 'Banco de ejemplo', account_number: '0001234321' }], error: null };
  if (r.tabla === 'integration_connections') return { data: [{ id: 'c-1', name: 'Wompi tienda', status: 'connected' }], error: null };
  if (r.tabla === 'payments') {
    const metodo = String(r.filtros.find(([c]) => c === 'method')?.[1] ?? '');
    return { count: PAGOS[metodo] ?? 0, data: null, error: null };
  }
  return { data: [], error: null };
}

jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: (tabla: string) => {
      const r: Registro = { tabla, op: 'select', filtros: [] };
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.update = (payload: unknown) => {
        r.op = 'update';
        r.payload = payload;
        mockLlamadas.push(r);
        return q;
      };
      q.delete = () => {
        r.op = 'delete';
        mockLlamadas.push(r);
        return q;
      };
      q.eq = (c: string, v: unknown) => {
        r.filtros.push([c, v]);
        return q;
      };
      q.in = () => q;
      q.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(resultado(r)).then(ok, ko);
      return q;
    },
  },
}));
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('../SucursalesMetodoPago', () => ({ SucursalesMetodoBadges: () => null }));
jest.mock('@/components/pos/configuracion/configuracionService', () => ({
  ConfiguracionService: { getRequireCashSessionConfig: () => Promise.resolve({ require_cash_session: true }) },
}));

import PaymentMethodsList from '../PaymentMethodsList';
import type { OrganizationPaymentMethod, PaymentMethod } from '../PaymentMethodsPage';

const pm = (code: string, name: string, extra: Partial<PaymentMethod> = {}): PaymentMethod => ({
  code,
  name,
  requires_reference: false,
  is_active: true,
  is_system: false,
  ...extra,
});
const fila = (id: number, code: string, metodo: PaymentMethod, extra: Partial<OrganizationPaymentMethod> = {}): OrganizationPaymentMethod => ({
  id,
  organization_id: 7,
  payment_method_code: code,
  is_active: true,
  settings: {},
  show_on_website: true,
  website_display_order: id - 1,
  payment_method: metodo,
  ...extra,
});

const CATALOGO = [
  pm('cash', 'Efectivo', { is_system: true }),
  pm('transfer', 'Transferencia', { requires_reference: true }),
  pm('wompi', 'Wompi'),
  pm('mp', 'Mercado Pago'),
  pm('check', 'Cheque'),
  pm('nequi', 'Nequi'),
];
const METODOS: OrganizationPaymentMethod[] = [
  fila(1, 'cash', CATALOGO[0]),
  fila(2, 'transfer', CATALOGO[1], { settings: { account_mapping: { bank_account_id: '3' } } }),
  fila(3, 'wompi', CATALOGO[2], { integration_connection_id: 'c-1' }),
  fila(4, 'mp', CATALOGO[3], { show_on_website: false }),
  fila(5, 'check', CATALOGO[4]),
];

const onEdit = jest.fn();
const onAgregar = jest.fn();
const onRefresh = jest.fn();

function montar(props: Partial<React.ComponentProps<typeof PaymentMethodsList>> = {}) {
  return renderConIdioma(
    <PaymentMethodsList
      organizationId={7}
      paymentMethods={CATALOGO}
      orgPaymentMethods={METODOS}
      onEdit={onEdit}
      onAgregar={onAgregar}
      isLoading={false}
      onRefresh={onRefresh}
      puedeGestionar
      {...props}
    />,
  );
}

beforeEach(() => {
  mockLlamadas.length = 0;
  mockPush.mockReset();
  onEdit.mockReset();
  onAgregar.mockReset();
  onRefresh.mockReset();
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ porMetodo: PAGOS }) })) as unknown as typeof fetch;
});
afterAll(() => simularAncho(1440));

const tabla = () => screen.getByRole('table', { name: 'Métodos de pago de la organización' });
const filaDe = (codigo: string) => tabla().querySelector(`tr[data-metodo="${codigo}"]`) as HTMLElement;
const tarjetas = () => screen.getByRole('list', { name: 'Métodos de pago de la organización' });
const tarjetaDe = (nombre: string) =>
  within(tarjetas())
    .getAllByRole('listitem')
    .find((li) => within(li).queryByText(nombre)) as HTMLElement;

async function esperarDatos() {
  await screen.findByText('2 métodos usados y sin configurar');
}

async function elegirEnMenu(contenedor: HTMLElement, nombreFila: string, opcion: string) {
  const boton = within(contenedor).getByRole('button', { name: `Acciones de ${nombreFila}` });
  fireEvent.pointerDown(boton, { button: 0, ctrlKey: false, pointerType: 'mouse' });
  fireEvent.keyDown(boton, { key: 'Enter' });
  fireEvent.click(boton);
  fireEvent.click(await screen.findByRole('menuitem', { name: opcion }));
}

const escrituras = (op: Registro['op']) => mockLlamadas.filter((l) => l.tabla === 'organization_payment_methods' && l.op === op);

describe('estructura a 1440 px (tabla)', () => {
  beforeEach(() => simularAncho(1440));

  test('columnas del diseño, destino del dinero, reglas, interruptores y aviso con «Revisar»', async () => {
    montar();
    await esperarDatos();
    for (const c of ['Método', 'Tipo', 'Entra a', 'Caja abierta', 'Referencia', 'POS', 'Tienda web']) {
      expect(within(tabla()).getByRole('columnheader', { name: c })).toBeTruthy();
    }
    // Los configurados en su orden y, al final, el usado sin configurar.
    const codigos = Array.from(tabla().querySelectorAll('tr[data-metodo]')).map((tr) => tr.getAttribute('data-metodo'));
    expect(codigos).toEqual(['cash', 'transfer', 'wompi', 'mp', 'check', 'nequi']);

    expect(within(filaDe('cash')).getByText('Caja del turno')).toBeTruthy();
    expect(within(filaDe('transfer')).getByText('Banco de ejemplo ··4321')).toBeTruthy();
    expect(within(filaDe('transfer')).getAllByText('Obligatoria')).toHaveLength(2); // caja y referencia
    expect(within(filaDe('wompi')).getByText('Según la liquidación')).toBeTruthy();
    expect(within(filaDe('wompi')).getByText('Automática')).toBeTruthy();
    expect(within(filaDe('wompi')).getByText(/Wompi tienda/)).toBeTruthy();
    expect(within(filaDe('mp')).getByText('Pasarela sin conectar')).toBeTruthy();
    expect(filaDe('mp').getAttribute('data-incompleta')).toBe('true');
    expect(within(filaDe('nequi')).getByText('Usado en 590 pagos · no configurado')).toBeTruthy();
    expect(within(filaDe('nequi')).getByRole('button', { name: 'Agregar' })).toBeTruthy();

    expect((screen.getByRole('switch', { name: 'Activo en el POS: Transferencia' }) as HTMLButtonElement).getAttribute('aria-checked')).toBe('true');
    expect((screen.getByRole('switch', { name: 'Visible en la tienda web: Mercado Pago' }) as HTMLButtonElement).getAttribute('aria-checked')).toBe('false');

    const aviso = screen.getByText('2 métodos usados y sin configurar').closest('[role="note"]') as HTMLElement;
    expect(aviso.textContent).toContain('Nequi (590)');
    fireEvent.click(within(aviso).getByRole('button', { name: 'Revisar' }));
    await waitFor(() =>
      expect(Array.from(tabla().querySelectorAll('tr[data-metodo]')).map((tr) => tr.getAttribute('data-metodo'))).toEqual(['mp', 'nequi']),
    );
    fireEvent.click(within(aviso).getByRole('button', { name: 'Ver todos' }));
    await waitFor(() => expect(tabla().querySelectorAll('tr[data-metodo]')).toHaveLength(6));
  });
});

describe('estructura a 390 px (tarjetas)', () => {
  beforeEach(() => simularAncho(390));

  test('tarjeta por método: icono, nombre, destino y reglas, canales, estado y «⋯»', async () => {
    montar();
    await esperarDatos();
    const efectivo = tarjetaDe('Efectivo');
    expect(within(efectivo).getByText('Caja del turno · caja obligatoria')).toBeTruthy();
    expect(within(efectivo).getByText('POS · Web')).toBeTruthy();
    expect(within(efectivo).getByText('Activa')).toBeTruthy();
    expect(within(efectivo).getByRole('button', { name: 'Acciones de Efectivo' })).toBeTruthy();

    const transferencia = tarjetaDe('Transferencia');
    expect(within(transferencia).getByText('Banco de ejemplo ··4321 · caja obligatoria · referencia')).toBeTruthy();
    expect(within(tarjetaDe('Mercado Pago')).getByText('POS')).toBeTruthy();
    const nequi = tarjetaDe('Nequi');
    expect(within(nequi).getByText('Usado en 590 pagos · no configurado')).toBeTruthy();
    expect(within(nequi).getByText('Sin configurar')).toBeTruthy();
    expect(within(tarjetas()).getAllByRole('listitem')).toHaveLength(6);
    // El aviso compacto con «Revisar» (sin la descripción larga de escritorio).
    const aviso = screen.getByText('2 métodos usados y sin configurar').closest('[role="note"]') as HTMLElement;
    expect(within(aviso).getByRole('button', { name: 'Revisar' })).toBeTruthy();
    expect(aviso.textContent).not.toContain('Nequi (590)');
  });

  test('en el celular activar/desactivar y tienda web van en el «⋯» de la tarjeta, con la misma escritura', async () => {
    montar();
    await esperarDatos();
    await elegirEnMenu(tarjetaDe('Transferencia'), 'Transferencia', 'Desactivar');
    await waitFor(() => expect(escrituras('update')).toHaveLength(1));
    expect(escrituras('update')[0]).toMatchObject({ payload: { is_active: false }, filtros: [['id', 2]] });

    await elegirEnMenu(tarjetaDe('Mercado Pago'), 'Mercado Pago', 'Mostrar en la tienda web');
    await waitFor(() => expect(escrituras('update')).toHaveLength(2));
    expect(escrituras('update')[1]).toMatchObject({ payload: { show_on_website: true }, filtros: [['id', 4]] });
  });
});

describe('caracterización de las acciones conservadas (1440 px)', () => {
  beforeEach(() => simularAncho(1440));

  test('interruptor POS = is_active; interruptor Tienda web = show_on_website', async () => {
    montar();
    await esperarDatos();
    fireEvent.click(screen.getByRole('switch', { name: 'Activo en el POS: Transferencia' }));
    await waitFor(() => expect(escrituras('update')).toHaveLength(1));
    expect(escrituras('update')[0]).toMatchObject({ payload: { is_active: false }, filtros: [['id', 2]] });
    fireEvent.click(screen.getByRole('switch', { name: 'Visible en la tienda web: Mercado Pago' }));
    await waitFor(() => expect(escrituras('update')).toHaveLength(2));
    expect(escrituras('update')[1]).toMatchObject({ payload: { show_on_website: true }, filtros: [['id', 4]] });
  });

  test('Editar abre el diálogo con el método', async () => {
    montar();
    await esperarDatos();
    await elegirEnMenu(filaDe('transfer'), 'Transferencia', 'Editar');
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 2, payment_method_code: 'transfer' }));
  });

  test('Subir reescribe website_display_order de todos, como el arrastre', async () => {
    montar();
    await esperarDatos();
    await elegirEnMenu(filaDe('transfer'), 'Transferencia', 'Subir');
    await waitFor(() => expect(escrituras('update')).toHaveLength(5));
    expect(escrituras('update').map((l) => [l.filtros[0][1], (l.payload as { website_display_order: number }).website_display_order])).toEqual([
      [2, 0],
      [1, 1],
      [3, 2],
      [4, 3],
      [5, 4],
    ]);
  });

  test('Configurar integración de Mercado Pago lleva al asistente nuevo de Conexiones', async () => {
    montar();
    await esperarDatos();
    await elegirEnMenu(filaDe('mp'), 'Mercado Pago', 'Configurar integración');
    expect(mockPush).toHaveBeenCalledWith('/app/integraciones/conexiones?conectar=mercadopago&return=%2Fapp%2Ffinanzas%2Fmetodos-pago');
    expect(mockPush.mock.calls[0][0]).not.toMatch(/conexiones\/nueva/);
  });

  test('«Ver conexión» de una pasarela conectada lleva a Conexiones', async () => {
    montar();
    await esperarDatos();
    await elegirEnMenu(filaDe('wompi'), 'Wompi', 'Ver conexión');
    expect(mockPush).toHaveBeenCalledWith('/app/integraciones/conexiones');
  });

  test('Quitar con pagos desactiva (nunca borra)', async () => {
    montar();
    await esperarDatos();
    await elegirEnMenu(filaDe('transfer'), 'Transferencia', 'Quitar');
    const dialogo = await screen.findByRole('dialog');
    await within(dialogo).findByText(/tiene 5 pagos registrados/);
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => expect(escrituras('update')).toHaveLength(1));
    expect(escrituras('update')[0]).toMatchObject({ payload: { is_active: false }, filtros: [['id', 2]] });
    expect(escrituras('delete')).toHaveLength(0);
  });

  test('Quitar sin pagos elimina solo el vínculo de la organización', async () => {
    montar();
    await esperarDatos();
    await elegirEnMenu(filaDe('check'), 'Cheque', 'Quitar');
    const dialogo = await screen.findByRole('dialog');
    await within(dialogo).findByText(/no tiene pagos registrados/);
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));
    });
    await waitFor(() => expect(escrituras('delete')).toHaveLength(1));
    expect(escrituras('delete')[0].filtros).toEqual([['id', 5]]);
    await waitFor(() => expect(filaDe('check')).toBeNull());
  });

  test('un método del sistema no ofrece Quitar; un usado sin configurar ofrece Agregar', async () => {
    montar();
    await esperarDatos();
    const boton = within(filaDe('cash')).getByRole('button', { name: 'Acciones de Efectivo' });
    fireEvent.pointerDown(boton, { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.keyDown(boton, { key: 'Enter' });
    await screen.findByRole('menuitem', { name: 'Editar' });
    expect(screen.queryByRole('menuitem', { name: 'Quitar' })).toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    fireEvent.click(within(filaDe('nequi')).getByRole('button', { name: 'Agregar' }));
    expect(onAgregar).toHaveBeenCalledWith('nequi');
  });
});

describe('estados', () => {
  beforeEach(() => simularAncho(1440));

  test('sin permiso de facturación: solo lectura, sin «⋯» ni interruptores activos', async () => {
    montar({ puedeGestionar: false });
    await esperarDatos();
    expect(screen.getByText('Solo lectura')).toBeTruthy();
    expect(within(tabla()).queryAllByRole('button', { name: /^Acciones de/ })).toHaveLength(0);
    expect((screen.getByRole('switch', { name: 'Activo en el POS: Efectivo' }) as HTMLButtonElement).disabled).toBe(true);
  });

  test('error de carga ≠ vacío, con Reintentar', async () => {
    montar({ orgPaymentMethods: [], errorCarga: 'error' });
    expect(await screen.findAllByText('No se pudieron cargar los métodos de pago')).not.toHaveLength(0);
    fireEvent.click(screen.getAllByRole('button', { name: /Reintentar/ })[0]);
    expect(onRefresh).toHaveBeenCalled();
  });

  test('RLS niega la lectura: estado sin permiso', async () => {
    montar({ orgPaymentMethods: [], errorCarga: 'sinPermiso' });
    expect(await screen.findAllByText('No tienes acceso a los métodos de pago')).not.toHaveLength(0);
  });

  test('vacío: invita a crear el primero', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ porMetodo: {} }) })) as unknown as typeof fetch;
    montar({ orgPaymentMethods: [] });
    expect(await screen.findAllByText('Aún no tienes métodos de pago')).not.toHaveLength(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'Nuevo método' })[0]);
    expect(onAgregar).toHaveBeenCalledWith();
  });

  test('cargando: esqueleto, sin aviso', () => {
    montar({ isLoading: true });
    expect(tabla().getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByText(/usados y sin configurar/)).toBeNull();
  });
});
