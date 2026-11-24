/**
 * Estados del envío: la copia en TS debe decir lo mismo que la base.
 * Se lee la migración aplicada (fuente de verdad) y se compara con estadosEnvio.ts.
 */
import fs from 'fs';
import path from 'path';
import {
  ESTADOS_ENVIO,
  ESTADOS_CANONICOS,
  MOTIVOS_NOVEDAD,
  admiteNovedad,
  canonicoDeEstado,
  momentoAvisoDeEstado,
  puedeAsignarse,
  puedeEntregarse,
  siguientesEstados,
  transicionValida,
} from '../estadosEnvio';

const MIG = path.join(process.cwd(), 'supabase', 'migrations');
const sqlEnvios = fs.readFileSync(path.join(MIG, '20261123150003_logistica_f1_rpc_envios.sql'), 'utf8');
const sqlBase = fs.readFileSync(path.join(MIG, '20261123145040_logistica_f1_domiciliarios_envios.sql'), 'utf8');

function listaSql(texto: string): string[] {
  return [...texto.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

describe('transiciones = fn_logistica_transicion_valida', () => {
  const cuerpo = /fn_logistica_transicion_valida[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(sqlEnvios)?.[1] ?? '';
  const tabla = Object.fromEntries(
    [...cuerpo.matchAll(/when '([a-z_]+)' then p_hacia in \(([^)]*)\)/g)].map((m) => [m[1], listaSql(m[2]).sort()]),
  );

  it('la migración trae la tabla', () => {
    expect(Object.keys(tabla).length).toBeGreaterThanOrEqual(10);
  });

  it.each(ESTADOS_ENVIO.map((e) => [e]))('desde %s se permite lo mismo', (desde) => {
    expect([...siguientesEstados(desde)].sort()).toEqual(tabla[desde] ?? []);
  });

  it('un estado desconocido no transiciona', () => {
    expect(transicionValida('inventado', 'delivered')).toBe(false);
    expect(transicionValida(null, 'picked')).toBe(false);
  });

  it('casos del flujo propio', () => {
    expect(transicionValida('pending', 'assigned')).toBe(true);
    expect(transicionValida('assigned', 'out_for_delivery')).toBe(true);
    expect(transicionValida('failed_attempt', 'out_for_delivery')).toBe(true);
    expect(transicionValida('out_for_delivery', 'picked')).toBe(false);
    expect(transicionValida('delivered', 'returned')).toBe(false);
  });
});

describe('listas = CHECK de la base', () => {
  it('estados del envío', () => {
    const check = /shipments_status_check\s+check \(status = any \(array\[([\s\S]*?)\]\)\)/.exec(sqlBase)?.[1] ?? '';
    expect(listaSql(check).sort()).toEqual([...ESTADOS_ENVIO].sort());
  });

  it('estados canónicos', () => {
    const check = /transport_events_canonical_status_check[\s\S]*?array\[([\s\S]*?)\]/.exec(sqlBase)?.[1] ?? '';
    expect(listaSql(check).sort()).toEqual([...ESTADOS_CANONICOS].sort());
  });

  it('motivos de novedad', () => {
    const check = /shipments_exception_reason_check[\s\S]*?in \(([\s\S]*?)\)\);/.exec(sqlBase)?.[1] ?? '';
    expect(listaSql(check).sort()).toEqual([...MOTIVOS_NOVEDAD].sort());
  });
});

describe('acciones por estado', () => {
  it('asignar no exige vehículo y se permite tras una novedad', () => {
    expect(puedeAsignarse('pending')).toBe(true);
    expect(puedeAsignarse('failed_attempt')).toBe(true);
    expect(puedeAsignarse('delivered')).toBe(false);
  });

  it('entregar y registrar novedad solo en curso', () => {
    expect(puedeEntregarse('out_for_delivery')).toBe(true);
    expect(puedeEntregarse('pending')).toBe(false);
    expect(admiteNovedad('out_for_delivery')).toBe(true);
    expect(admiteNovedad('delivered')).toBe(false);
  });

  it('canónico de los estados heredados', () => {
    expect(canonicoDeEstado('pending')).toBe('created');
    expect(canonicoDeEstado('ready')).toBe('ready_for_pickup');
    expect(canonicoDeEstado('dispatched')).toBe('in_transit');
    expect(canonicoDeEstado('failed')).toBe('exception');
    expect(canonicoDeEstado('failed_attempt')).toBe('failed_attempt');
    expect(canonicoDeEstado('x')).toBeNull();
  });

  it('avisos al cliente: en camino, entregado y novedad', () => {
    expect(momentoAvisoDeEstado('out_for_delivery')).toBe('en_camino');
    expect(momentoAvisoDeEstado('delivered')).toBe('entregado');
    expect(momentoAvisoDeEstado('failed_attempt')).toBe('novedad');
    expect(momentoAvisoDeEstado('assigned')).toBeNull();
  });
});
