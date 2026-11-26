/**
 * Correo al equipo cuando se paga un pedido online (migración 20261126091500): las variantes,
 * la preferencia «Pagos de pedidos online», la idempotencia, la agrupación de más de 10 pagos
 * en una hora y que nunca salgan datos de tarjeta. El correo NO se envía: `sendEmail` es un espía.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn() }));
jest.mock('@/lib/services/crm/email/sendService', () => ({
  sendEmail: jest.fn(async () => ({ warnings: [], message: { status: 'queued' } })),
}));
jest.mock('@/lib/services/organizationTimezoneService', () => ({
  getOrganizationTimezone: jest.fn(async () => 'America/Bogota'),
}));
jest.mock('@/lib/services/cuentaCorreo', () => ({
  veredictosCorreoOperativo: jest.fn(async () => new Map()),
  veredictoCorreoOperativo: jest.fn(async () => ({ enviar: true })),
  decisionCorreoOperativo: jest.fn(() => 'enviar'),
}));
jest.mock('@/lib/services/monedaOrganizacion', () => ({
  resolverContextoMoneda: jest.fn(async () => {
    const { contextoMoneda } = jest.requireActual('@/lib/utils/moneda');
    return contextoMoneda('COP', { decimals: 0, locale: 'es-CO' });
  }),
}));

import { sendEmail } from '@/lib/services/crm/email/sendService';
import { despacharAvisosPendientes } from '@/lib/services/avisos/despachoAvisos';
import {
  correoPagoPedido,
  correoResumenPagos,
  franquiciaDeRespuesta,
  modoEnvioPago,
  varianteDe,
  ventanaHora,
  type DatosCorreoPago,
  type VariantePago,
} from '@/lib/services/avisos/correoPagoPedido';
import { correoPermitido, fusionarTiposAviso, gruposActivos, tiposDesdeGrupos } from '@/lib/services/avisos/reglas';
import { limpiarMonedasPagoPedido } from '@/lib/services/avisos/datosPagoPedido';

const enviar = sendEmail as jest.Mock;

// ── Base en memoria (solo lo que usa el despacho) ────────────────────────────
type Fila = Record<string, unknown>;

function comoRegex(patron: string): RegExp {
  const cuerpo = patron.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
  return new RegExp(`^${cuerpo}$`);
}

class Consulta implements PromiseLike<{ data: unknown; error: null }> {
  private filtros: ((f: Fila) => boolean)[] = [];
  private cambios: Fila | null = null;
  private devolver = false;
  private orden: { col: string; asc: boolean } | null = null;
  private tope: number | null = null;
  private unico = false;

  constructor(private tablas: Record<string, Fila[]>, private tabla: string) {}

  select() { if (this.cambios) this.devolver = true; return this; }
  update(cambios: Fila) { this.cambios = cambios; return this; }
  eq(c: string, v: unknown) { this.filtros.push((f) => f[c] === v); return this; }
  neq(c: string, v: unknown) { this.filtros.push((f) => f[c] !== v); return this; }
  in(c: string, vs: unknown[]) { this.filtros.push((f) => vs.includes(f[c])); return this; }
  like(c: string, p: string) { this.filtros.push((f) => comoRegex(p).test(String(f[c] ?? ''))); return this; }
  not(c: string, op: string, p: string) {
    if (op === 'like') this.filtros.push((f) => !comoRegex(p).test(String(f[c] ?? '')));
    return this;
  }
  gte(c: string, v: string) { this.filtros.push((f) => String(f[c]) >= v); return this; }
  lt(c: string, v: string) { this.filtros.push((f) => String(f[c]) < v); return this; }
  order(c: string, o?: { ascending?: boolean }) { this.orden = { col: c, asc: o?.ascending !== false }; return this; }
  limit(n: number) { this.tope = n; return this; }
  maybeSingle() { this.unico = true; return this; }

  then<A, B>(ok?: ((v: { data: unknown; error: null }) => A | PromiseLike<A>) | null, mal?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.resolver()).then(ok, mal);
  }

  private resolver(): { data: unknown; error: null } {
    let filas = (this.tablas[this.tabla] ?? []).filter((f) => this.filtros.every((filtro) => filtro(f)));
    if (this.cambios) {
      for (const f of filas) Object.assign(f, this.cambios);
      return { data: this.devolver ? filas.map((f) => ({ id: f.id })) : null, error: null };
    }
    if (this.orden) {
      const { col, asc } = this.orden;
      filas = [...filas].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1));
    }
    if (this.tope != null) filas = filas.slice(0, this.tope);
    if (this.unico) return { data: filas[0] ?? null, error: null };
    return { data: filas, error: null };
  }
}

function baseFalsa(tablas: Record<string, Fila[]>): SupabaseClient {
  return { from: (tabla: string) => new Consulta(tablas, tabla) } as unknown as SupabaseClient;
}

const ORG = 120;
const DUENA = '00000000-0000-4000-8000-0000000000a1';
const ADMIN = '00000000-0000-4000-8000-0000000000a2';
const PEDIDO = '00000000-0000-4000-8000-0000000000b1';

function pedido(extra: Fila = {}): Fila {
  return {
    id: PEDIDO, organization_id: ORG, branch_id: 7, order_number: 'WO-000123', status: 'confirmed',
    total: 110000, delivery_fee: 12000, delivery_type: 'delivery_own',
    delivery_address: { address: 'Cra 12 #34-56, apto 201', city: 'Bogotá', notes: 'tocar timbre' },
    payment_status: 'paid', payment_method: 'wompi', payment_method_detail: 'card', payment_reference: 'TX-998877',
    customer_name: 'Laura Gómez', customer_email: 'laura.gomez@correo.com', customer_phone: '300 123 4567',
    advance_amount: null, advance_status: null, advance_reference: null, advance_gateway: null,
    ...extra,
  };
}

function aviso(id: string, evento: string, usuario: string, creado: Date, extra: Fila = {}): Fila {
  return {
    id, organization_id: ORG, recipient_user_id: usuario, event: evento, entity_type: 'web_order', entity_id: PEDIDO,
    title: `Nuevo pago · WO-${id.slice(-6)}`, body: 'Pedido online', href: `/app/pos/pedidos-online/${PEDIDO}`,
    idempotency_key: `${ORG}:${evento}:web_order:${PEDIDO}:${usuario}`, email_status: 'pendiente',
    created_at: creado.toISOString(), ...extra,
  };
}

function tablasBase(avisos: Fila[], extra: Partial<Record<string, Fila[]>> = {}): Record<string, Fila[]> {
  return {
    member_notices: avisos,
    organization_members: [
      { organization_id: ORG, user_id: DUENA, is_active: true },
      { organization_id: ORG, user_id: ADMIN, is_active: true },
    ],
    profiles: [{ id: DUENA, email: 'duena@tiendaejemplo.co' }, { id: ADMIN, email: 'admin@tiendaejemplo.co' }],
    user_notification_preferences: [],
    organizations: [{ id: ORG, name: 'Tienda Ejemplo' }],
    branches: [{ id: 7, organization_id: ORG, name: 'Sucursal Centro' }],
    web_orders: [pedido()],
    payments: [{
      organization_id: ORG, source: 'web_order', source_id: PEDIDO, status: 'completed', method: 'card', amount: 110000,
      reference: 'TX-998877', created_at: '2026-11-25T20:10:00.000Z',
      processor_response: { data: { card: { brand: 'VISA', last_four: '4242', bin: '411111', exp_month: '12' } } },
    }],
    web_order_refunds: [],
    ...extra,
  };
}

beforeEach(() => {
  enviar.mockClear();
  limpiarMonedasPagoPedido();
});

// ── Plantilla ────────────────────────────────────────────────────────────────
function datos(variante: VariantePago, extra: Partial<DatosCorreoPago> = {}): DatosCorreoPago {
  return {
    variante, numero: 'WO-000123', tienda: 'Tienda Ejemplo', sede: 'Sucursal Centro', cuando: '25 nov 2026 3:10 p. m.',
    total: '$ 110.000', monto: '$ 110.000', porCobrar: null, queSePago: null, medio: 'Wompi · Tarjeta',
    franquicia: 'Visa', referencia: 'TX-998877',
    cliente: { nombre: 'Laura Gómez', telefono: '300 123 4567', correo: 'laura.gomez@correo.com' },
    entrega: { tipo: 'Domicilio propio', direccion: 'Cra 12 #34-56 · Bogotá' },
    enlace: 'https://app.goadmin.io/app/pos/pedidos-online/x', ...extra,
  };
}

describe('plantilla del correo', () => {
  test('01 pago en línea: encabezado, pago, cliente, entrega y «Ver pedido»; sin productos ni comisión', () => {
    const c = correoPagoPedido(datos('linea'));
    expect(c.asunto).toBe('Nuevo pago · WO-000123 · $ 110.000');
    for (const texto of ['Tienda Ejemplo · Sucursal Centro', 'Pago', 'Cliente', 'Entrega', 'Ver pedido', 'Visa', 'TX-998877', 'Laura Gómez', '300 123 4567', 'Domicilio propio']) {
      expect(c.html).toContain(texto);
    }
    expect(c.html).not.toMatch(/Producto|Comisi[oó]n|Cant\./);
    expect(c.texto).toContain('Ver pedido: https://app.goadmin.io/app/pos/pedidos-online/x');
  });

  test('02 contraentrega sin anticipo: se cobra todo en la puerta', () => {
    const c = correoPagoPedido(datos('contraentrega', { monto: '$ 0', porCobrar: '$ 98.000', total: '$ 98.000', medio: 'Contraentrega · paga al recibir', franquicia: null, referencia: null }));
    expect(c.asunto).toBe('Nuevo pedido contraentrega · WO-000123 · $ 98.000 por cobrar');
    expect(c.html).toContain('Por cobrar en puerta');
  });

  test('03 anticipo: qué se pagó y cuánto falta en la puerta', () => {
    const c = correoPagoPedido(datos('anticipo', { monto: '$ 12.000', porCobrar: '$ 98.000', queSePago: 'El envío (anticipo de la contraentrega)' }));
    expect(c.asunto).toBe('Anticipo pagado · WO-000123 · $ 12.000 hoy, $ 98.000 en puerta');
    expect(c.html).toContain('Qué se pagó');
    expect(c.html).toContain('El envío (anticipo de la contraentrega)');
  });

  test('04 anticipo tardío: reactivado solo o hay que revisar', () => {
    expect(correoPagoPedido(datos('anticipo_reactivado')).asunto).toContain('se reactivó solo');
    const revisar = correoPagoPedido(datos('anticipo_revisar'));
    expect(revisar.asunto).toContain('hay que revisar');
    expect(revisar.html).toContain('Hay que revisar');
    expect(varianteDe('pedido.pago.anticipo_tarde', 'expired')).toBe('anticipo_revisar');
    expect(varianteDe('pedido.pago.anticipo_tarde', 'pending')).toBe('anticipo_reactivado');
  });

  test('05 devolución', () => {
    const c = correoPagoPedido(datos('devolucion', { monto: '$ 12.000' }));
    expect(c.asunto).toBe('Devolución · WO-000123 · $ 12.000');
    expect(c.html).toContain('Devuelto');
  });

  test('nunca datos de tarjeta: solo la franquicia de una lista cerrada', () => {
    expect(franquiciaDeRespuesta({ data: { card: { brand: 'VISA', last_four: '4242' } } })).toBe('Visa');
    expect(franquiciaDeRespuesta({ payment_method_id: 'master' })).toBe('Mastercard');
    expect(franquiciaDeRespuesta({ card_brand: '4111 11** **** 4242' })).toBeNull();
    expect(franquiciaDeRespuesta({}, 'nequi')).toBeNull();
  });

  test('resumen de la hora: un solo correo con la lista', () => {
    const c = correoResumenPagos({ tienda: 'Tienda Ejemplo', hora: '3:00 p. m. – 4:00 p. m.', lineas: ['Nuevo pago · WO-1', 'Nuevo pago · WO-2'], enlace: 'https://x/app/pos/pedidos-online' });
    expect(c.asunto).toBe('2 pagos más de pedidos online · 3:00 p. m. – 4:00 p. m.');
    expect(c.html).toContain('Ver pedidos online');
  });

  test('ventana de la hora en la zona de la organización y tope de 10', () => {
    const instante = new Date('2026-11-25T20:37:15.000Z'); // 3:37 p. m. en Bogotá
    const v = ventanaHora(instante, 15 * 60 + 37, '2026-11-25');
    expect(v.clave).toBe('2026-11-25T15');
    expect(v.inicio.toISOString()).toBe('2026-11-25T20:00:00.000Z');
    expect(v.fin.toISOString()).toBe('2026-11-25T21:00:00.000Z');
    expect(modoEnvioPago(9, instante, v.fin)).toBe('individual');
    expect(modoEnvioPago(10, instante, v.fin)).toBe('esperar');
    expect(modoEnvioPago(10, v.fin, v.fin)).toBe('resumen');
  });
});

// ── Preferencia «Pagos de pedidos online» ────────────────────────────────────
describe('preferencia', () => {
  test('prendida de fábrica, también con listas guardadas antes de existir', () => {
    expect(correoPermitido([], 'pedido.pago.linea', false)).toBe(true);
    expect(correoPermitido(null, 'pedido.pago.anticipo', false)).toBe(true);
    expect(correoPermitido(['tarea.asignada'], 'pedido.pago.devolucion', false)).toBe(true);
    expect(gruposActivos(['tarea.asignada'])['pedido.pago']).toBe(true);
  });

  test('se apaga sola, con «silenciar todo» o con el silencio general', () => {
    const todos = gruposActivos([]);
    const sinPagos = tiposDesdeGrupos({ ...todos, 'pedido.pago': false });
    expect(correoPermitido(sinPagos, 'pedido.pago.linea', false)).toBe(false);
    expect(correoPermitido(sinPagos, 'tarea.asignada', false)).toBe(true);
    expect(gruposActivos(sinPagos)['pedido.pago']).toBe(false);
    expect(gruposActivos(sinPagos)['tarea.asignada']).toBe(true);
    expect(correoPermitido(['ninguno'], 'pedido.pago.linea', false)).toBe(false);
    expect(correoPermitido([], 'pedido.pago.linea', true)).toBe(false);
    // Solo los pagos prendidos: la lista no queda vacía (vacía es «todos»).
    const apagados = Object.fromEntries(Object.keys(todos).map((k) => [k, false])) as typeof todos;
    const soloPagos = tiposDesdeGrupos({ ...apagados, 'pedido.pago': true });
    expect(soloPagos.length).toBeGreaterThan(0);
    expect(correoPermitido(soloPagos, 'pedido.pago.linea', false)).toBe(true);
    expect(correoPermitido(soloPagos, 'tarea.asignada', false)).toBe(false);
    expect(tiposDesdeGrupos(apagados)).toEqual(['ninguno']);
    // Volver a prender conserva el resto del canal.
    expect(fusionarTiposAviso(['stock_low', 'sin.pedido.pago'], todos)).not.toContain('sin.pedido.pago');
  });
});

// ── Despacho ─────────────────────────────────────────────────────────────────
describe('despacho', () => {
  const haceDosHoras = () => new Date(Date.now() - 2 * 60 * 60 * 1000);

  test('01: un correo por persona, con la marca GO Admin y la llave del aviso; sin datos de tarjeta', async () => {
    const t = haceDosHoras();
    const tablas = tablasBase([aviso('n1', 'pedido.pago.linea', DUENA, t), aviso('n2', 'pedido.pago.linea', ADMIN, t)]);
    const r = await despacharAvisosPendientes(ORG, baseFalsa(tablas));
    expect(r.enviados).toBe(2);
    expect(enviar).toHaveBeenCalledTimes(2);
    const [org, , mensaje] = enviar.mock.calls[0];
    expect(org).toBe(ORG);
    expect(mensaje.avisoMiembro).toBe(true);
    expect(mensaje.to).toEqual(['duena@tiendaejemplo.co']);
    expect(mensaje.client_request_id).toBe(`${ORG}:pedido.pago.linea:web_order:${PEDIDO}:${DUENA}`);
    expect(mensaje.subject).toMatch(/^Nuevo pago · WO-000123 · \$\s?110\.000$/);
    expect(mensaje.content.html).toContain('Visa');
    for (const prohibido of ['4242', '411111', 'exp_month']) {
      expect(mensaje.content.html).not.toContain(prohibido);
      expect(mensaje.content.text).not.toContain(prohibido);
    }
    expect(mensaje.content.html).toContain('Cra 12 #34-56, apto 201 · Bogotá');
    expect(mensaje.content.html).not.toContain('tocar timbre');
    expect(tablas.member_notices.every((f) => f.email_status === 'enviado')).toBe(true);
  });

  test('idempotente: el mismo aviso no sale dos veces', async () => {
    const tablas = tablasBase([aviso('n1', 'pedido.pago.linea', DUENA, haceDosHoras())]);
    await despacharAvisosPendientes(ORG, baseFalsa(tablas));
    await despacharAvisosPendientes(ORG, baseFalsa(tablas));
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  test('preferencia apagada: no envía y queda omitido', async () => {
    const tablas = tablasBase([aviso('n1', 'pedido.pago.linea', DUENA, haceDosHoras())], {
      user_notification_preferences: [{ user_id: DUENA, channel: 'email', mute: false, allowed_types: ['tarea.asignada', 'sin.pedido.pago'], dnd_start: null, dnd_end: null }],
    });
    const r = await despacharAvisosPendientes(ORG, baseFalsa(tablas));
    expect(enviar).not.toHaveBeenCalled();
    expect(r.omitidos).toBe(1);
    expect(tablas.member_notices[0].email_status).toBe('omitido');
  });

  test('un miembro que ya no está activo no recibe nada', async () => {
    const tablas = tablasBase([aviso('n1', 'pedido.pago.linea', DUENA, haceDosHoras())]);
    tablas.organization_members[0].is_active = false;
    await despacharAvisosPendientes(ORG, baseFalsa(tablas));
    expect(enviar).not.toHaveBeenCalled();
  });

  test('03 anticipo: monto pagado y lo que falta en puerta con la misma regla de la contraentrega', async () => {
    const tablas = tablasBase([aviso('n1', 'pedido.pago.anticipo', DUENA, haceDosHoras())], {
      web_orders: [pedido({ payment_method: 'cash', payment_method_detail: null, payment_reference: null, payment_status: 'partial', advance_amount: 12000, advance_status: 'paid', advance_reference: 'ANT-000125', advance_gateway: 'wompi' })],
      payments: [{ organization_id: ORG, source: 'web_order', source_id: PEDIDO, status: 'completed', method: 'nequi', amount: 12000, reference: 'ANT-000125', created_at: '2026-11-25T20:10:00.000Z', processor_response: { gateway: 'wompi', concepto: 'anticipo_contraentrega' } }],
    });
    await despacharAvisosPendientes(ORG, baseFalsa(tablas));
    const mensaje = enviar.mock.calls[0][2];
    expect(mensaje.subject).toMatch(/Anticipo pagado · WO-000123 · \$\s?12\.000 hoy, \$\s?98\.000 en puerta/);
    expect(mensaje.content.html).toContain('Nequi · Wompi');
    expect(mensaje.content.html).toContain('El envío (anticipo de la contraentrega)');
  });

  test('04: el anticipo tardío mira si el pedido se reactivó', async () => {
    const tablas = tablasBase([aviso('n1', 'pedido.pago.anticipo_tarde', DUENA, haceDosHoras())], {
      web_orders: [pedido({ status: 'expired', payment_method: 'cash', payment_status: 'partial', advance_amount: 12000, advance_status: 'paid' })],
    });
    await despacharAvisosPendientes(ORG, baseFalsa(tablas));
    expect(enviar.mock.calls[0][2].subject).toContain('hay que revisar');
  });

  test('más de 10 pagos en una hora: 10 sueltos y un resumen al cerrar la hora', async () => {
    const t = haceDosHoras();
    t.setUTCMinutes(5, 0, 0);
    const avisos = Array.from({ length: 13 }, (_, i) => aviso(`p${String(i).padStart(2, '0')}`, 'pedido.pago.linea', DUENA, new Date(t.getTime() + i * 60_000), {
      idempotency_key: `${ORG}:pedido.pago.linea:web_order:pedido-${i}:${DUENA}`,
    }));
    const tablas = tablasBase(avisos);
    const r = await despacharAvisosPendientes(ORG, baseFalsa(tablas));
    expect(enviar).toHaveBeenCalledTimes(11);
    expect(r.enviados).toBe(11);
    const resumen = enviar.mock.calls[10][2];
    expect(resumen.subject).toMatch(/^3 pagos más de pedidos online/);
    expect(resumen.client_request_id).toMatch(/^pagos-hora:/);
    expect(tablas.member_notices.every((f) => f.email_status === 'enviado')).toBe(true);
  });

  test('con la hora abierta, los que pasan del tope esperan', async () => {
    const ahora = new Date();
    const inicio = new Date(ahora.getTime());
    inicio.setUTCMinutes(0, 0, 0);
    const avisos = Array.from({ length: 12 }, (_, i) => aviso(`q${String(i).padStart(2, '0')}`, 'pedido.pago.linea', DUENA, new Date(inicio.getTime() + i), {
      idempotency_key: `k-${i}`,
    }));
    const tablas = tablasBase(avisos);
    await despacharAvisosPendientes(ORG, baseFalsa(tablas));
    expect(enviar).toHaveBeenCalledTimes(10);
    expect(tablas.member_notices.filter((f) => f.email_status === 'pendiente')).toHaveLength(2);
  });
});

// ── Disparador: destinatarios por permiso, sin rechazos y sin campana duplicada ──
describe('migración', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261126091500_avisos_pago_pedido_web.sql'), 'utf8');
  const rollback = readFileSync(join(process.cwd(), 'supabase/rollbacks/20261126091500_avisos_pago_pedido_web_rollback.sql'), 'utf8');

  test('destinatarios resueltos por permiso en la base, nunca por nombre de rol', () => {
    expect(sql).toContain("fn_avisos_miembro_destinatarios(new.organization_id, 'admin.full_access')");
    expect(sql).not.toMatch(/role_name|roles\.name|'(owner|admin|dueño)'/i);
  });

  test('idempotente por pedido, evento y persona; rechazos sin aviso; la campana no cambia', () => {
    expect(sql).toContain("new.organization_id || ':' || v_evento || ':web_order:' || new.id::text || ':' || v_user::text");
    expect(sql).toContain('on conflict (idempotency_key) do nothing');
    expect(sql).not.toMatch(/payment_status = 'failed'|'rejected' then/);
    expect(sql).toMatch(/dismissed_at\s*\n?\s*\) values/);
    expect(rollback).toContain('DROP TRIGGER IF EXISTS trg_avisos_pago_pedido_web');
  });
});

// ── Remitente: los avisos al equipo salen como GO Admin, nunca con el nombre de la tienda ──
describe('remitente del aviso al equipo', () => {
  const previo = { from: process.env.EMAIL_FROM_ADDRESS, key: process.env.RESEND_API_KEY };
  afterEach(() => {
    if (previo.from === undefined) delete process.env.EMAIL_FROM_ADDRESS;
    else process.env.EMAIL_FROM_ADDRESS = previo.from;
    if (previo.key === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previo.key;
  });

  test('«GO Admin <EMAIL_FROM_ADDRESS>» con la key maestra; sin configuración, el de siempre', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { remitenteAvisoEquipo } = require('@/lib/services/crm/email/domainsService') as typeof import('@/lib/services/crm/email/domainsService');
    process.env.EMAIL_FROM_ADDRESS = 'Tienda Ejemplo <notificaciones@goadmin.io>';
    process.env.RESEND_API_KEY = 're_prueba_123';
    const r = remitenteAvisoEquipo();
    expect(r?.from).toBe('GO Admin <notificaciones@goadmin.io>');
    expect(r?.replyTo).toBeNull();
    delete process.env.RESEND_API_KEY;
    expect(remitenteAvisoEquipo()).toBeNull();
  });
});
