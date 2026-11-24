/**
 * Regla de correspondencia envío ↔ pedido web: la copia en TS debe decir lo mismo que la base
 * (se lee la migración aplicada, fuente de verdad), y el «solo avanza» se fija con casos.
 */
import fs from 'fs';
import path from 'path';
import { ESTADOS_ENVIO } from '../estadosEnvio';
import { estadoPedidoDelAviso } from '../misEnvios';
import {
  ESTADOS_ENVIO_SIN_MOVER,
  ESTADOS_ENVIO_SIN_SALIR,
  ESTADOS_PEDIDO_QUE_CANCELAN_ENVIO,
  envioTrasPedido,
  estadoPedidoDeEnvio,
  pedidoTrasEnvio,
  rangoPedido,
} from '../sincronizacionPedidoEnvio';

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase', 'migrations', '20261124233000_sincronizar_estado_envio_pedido_web.sql'),
  'utf8',
);

const ESTADOS_PEDIDO = ['pending', 'confirmed', 'preparing', 'ready', 'in_delivery', 'delivered', 'cancelled', 'rejected', 'refunded', 'expired'];

function cuerpo(funcion: string): string {
  return new RegExp(`function public\\.${funcion}\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`).exec(sql)?.[1] ?? '';
}

function tablaCase(texto: string): Record<string, string> {
  return Object.fromEntries([...texto.matchAll(/when '([a-z_]+)' then '?([a-z_0-9]+)'?/g)].map((m) => [m[1], m[2]]));
}

function listaSql(texto: string): string[] {
  return [...texto.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
}

describe('copia = migración', () => {
  it('envío → pedido (fn_pedido_web_estado_de_envio)', () => {
    const tabla = tablaCase(cuerpo('fn_pedido_web_estado_de_envio'));
    expect(Object.keys(tabla).length).toBe(7);
    for (const e of ESTADOS_ENVIO) expect([e, estadoPedidoDeEnvio(e)]).toEqual([e, tabla[e] ?? null]);
  });

  it('rango del pedido (fn_pedido_web_rango)', () => {
    const tabla = tablaCase(cuerpo('fn_pedido_web_rango'));
    for (const e of ESTADOS_PEDIDO) expect([e, rangoPedido(e)]).toEqual([e, tabla[e] ? Number(tabla[e]) : null]);
  });

  it('pedido → envío: listas del trigger', () => {
    const f = cuerpo('fn_web_orders_sincroniza_envio');
    const listo = /if new\.status = 'ready' then[\s\S]*?s\.status in \(([^)]*)\)/.exec(f)?.[1] ?? '';
    const cancela = /elsif new\.status in \(([^)]*)\) then[\s\S]*?s\.status in \(([^)]*)\)/.exec(f);
    expect(listaSql(listo)).toEqual([...ESTADOS_ENVIO_SIN_MOVER].sort());
    expect(listaSql(cancela?.[1] ?? '')).toEqual([...ESTADOS_PEDIDO_QUE_CANCELAN_ENVIO].sort());
    expect(listaSql(cancela?.[2] ?? '')).toEqual([...ESTADOS_ENVIO_SIN_SALIR].sort());
  });

  it('la RPC ya no escribe el pedido: lo hace el trigger', () => {
    const rpc = cuerpo('logistica_cambiar_estado');
    expect(rpc).not.toMatch(/update public\.web_orders/);
    expect(rpc).toMatch(/'listo'/);
  });
});

describe('envío → pedido: solo avanza', () => {
  it('casos del reporte', () => {
    expect(pedidoTrasEnvio('confirmed', 'ready_for_pickup')).toBe('ready');
    expect(pedidoTrasEnvio('preparing', 'ready')).toBe('ready');
    expect(pedidoTrasEnvio('ready', 'picked')).toBe('in_delivery');
    expect(pedidoTrasEnvio('confirmed', 'out_for_delivery')).toBe('in_delivery');
    expect(pedidoTrasEnvio('in_delivery', 'delivered')).toBe('delivered');
  });

  it('nunca retrocede ni repite', () => {
    expect(pedidoTrasEnvio('in_delivery', 'ready_for_pickup')).toBeNull();
    expect(pedidoTrasEnvio('ready', 'ready_for_pickup')).toBeNull();
    expect(pedidoTrasEnvio('delivered', 'out_for_delivery')).toBeNull();
  });

  it('novedad, devolución y cancelación del envío no mueven el pedido', () => {
    for (const e of ['assigned', 'failed_attempt', 'failed', 'returned', 'cancelled', 'pending', 'draft']) {
      expect([e, pedidoTrasEnvio('confirmed', e)]).toEqual([e, null]);
    }
  });

  it('un pedido sin confirmar o cerrado no se toca', () => {
    for (const p of ['pending', 'cancelled', 'rejected', 'expired', 'refunded']) {
      expect([p, pedidoTrasEnvio(p, 'delivered')]).toEqual([p, null]);
    }
  });
});

describe('pedido → envío', () => {
  it('pedido listo: el envío quieto queda listo para salir', () => {
    expect(envioTrasPedido('pending', 'ready')).toBe('ready_for_pickup');
    expect(envioTrasPedido('draft', 'ready')).toBe('ready_for_pickup');
    expect(envioTrasPedido('assigned', 'ready')).toBeNull();
    expect(envioTrasPedido('picked', 'ready')).toBeNull();
  });

  it('pedido cancelado: cancela solo el envío que no salió', () => {
    expect(envioTrasPedido('assigned', 'cancelled')).toBe('cancelled');
    expect(envioTrasPedido('ready_for_pickup', 'expired')).toBe('cancelled');
    expect(envioTrasPedido('out_for_delivery', 'cancelled')).toBeNull();
    expect(envioTrasPedido('delivered', 'refunded')).toBeNull();
  });

  it('en camino / entregado desde Pedidos online no mueven el envío', () => {
    expect(envioTrasPedido('pending', 'in_delivery')).toBeNull();
    expect(envioTrasPedido('assigned', 'delivered')).toBeNull();
  });
});

describe('avisos', () => {
  it('el aviso «listo» de la RPC confirma el pedido en «ready»', () => {
    expect(estadoPedidoDelAviso('listo')).toBe('ready');
  });
});
