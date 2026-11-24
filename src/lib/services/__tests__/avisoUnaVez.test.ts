/**
 * Aviso automático una sola vez por momento y canal (sincronización envío ↔ pedido, 2026-11-24):
 * si Pedidos online ya avisó «listo» y luego Logística marca «Listo para salir» (o al revés), el
 * cliente no recibe el aviso dos veces. «Reenviar» (sin `unaVez`) sí repite.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { avisarClientePedido, type PedidoParaAviso } from '../avisosClienteService';

jest.mock('@/lib/services/organizationTimezoneService', () => ({ getOrganizationTimezone: jest.fn(async () => 'America/Bogota') }));

type Tablas = Record<string, unknown>;

function crearDb(tablas: Tablas) {
  const inserts: Array<{ tabla: string; fila: Record<string, unknown> }> = [];
  const from = jest.fn((tabla: string) => {
    const r = { data: tablas[tabla] ?? null, error: null };
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order', 'limit']) b[m] = () => b;
    b.maybeSingle = async () => ({ data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: null });
    b.insert = async (fila: Record<string, unknown>) => {
      inserts.push({ tabla, fila });
      return { error: null };
    };
    b.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(r).then(ok, ko);
    return b;
  });
  return { db: { from } as unknown as SupabaseClient, inserts };
}

const pedido: PedidoParaAviso = {
  id: '00000000-0000-0000-0000-000000000001',
  organization_id: 1,
  branch_id: null,
  order_number: 'WO-1',
  status: 'ready',
  customer_id: null,
  customer_email: 'cliente@example.com',
  customer_name: 'Laura',
  customer_phone: null,
  estimated_ready_at: null,
  estimated_delivery_at: null,
  cancellation_reason: null,
  total: 1000,
  payment_status: 'paid',
  delivery_type: 'delivery_own',
};

const ajustes = { moments: { listo: { email: true, whatsapp: false } }, sender_name: null, reply_to_email: null, whatsapp_number: null };

function contexto(unaVez: boolean) {
  const enviarCorreo = jest.fn(async () => ({ ok: true, id: 'msg' }));
  return { enviarCorreo, ctx: { negocio: 'Tienda', url: null, unaVez, enviarCorreo, estadoConAvisoLegado: () => true } };
}

describe('aviso automático una sola vez', () => {
  it('si «listo» ya salió por correo, no se repite', async () => {
    const { db, inserts } = crearDb({ web_order_notice_settings: ajustes, web_order_notices: [{ channel: 'email' }] });
    const { enviarCorreo, ctx } = contexto(true);
    const r = await avisarClientePedido(db, 1, pedido, ctx);
    expect(enviarCorreo).not.toHaveBeenCalled();
    expect(r.email).toBe('ya_enviado');
    expect(inserts).toHaveLength(0);
  });

  it('si no había salido, sale y queda registrado', async () => {
    const { db, inserts } = crearDb({ web_order_notice_settings: ajustes, web_order_notices: [] });
    const { enviarCorreo, ctx } = contexto(true);
    const r = await avisarClientePedido(db, 1, pedido, ctx);
    expect(enviarCorreo).toHaveBeenCalledTimes(1);
    expect(r.email).toBe('sent');
    expect(inserts.map((i) => i.fila.moment)).toEqual(['listo']);
  });

  it('«Reenviar» (sin unaVez) repite aunque ya haya salido', async () => {
    const { db } = crearDb({ web_order_notice_settings: ajustes, web_order_notices: [{ channel: 'email' }] });
    const { enviarCorreo, ctx } = contexto(false);
    const r = await avisarClientePedido(db, 1, pedido, ctx);
    expect(enviarCorreo).toHaveBeenCalledTimes(1);
    expect(r.email).toBe('sent');
  });
});
