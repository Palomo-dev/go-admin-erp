/**
 * Actividad (2026-11-09): paridad con la página vieja de Eventos en el servidor: filtros por
 * conexión, estado, sentido, fechas y texto; paginación con total; detalle con el cuerpo completo
 * solo si la conexión es de la organización.
 */
import { crearBaseFalsa, uuidFalso } from './baseFalsa';
import { detalleEvento, listarEventos } from '../conexiones.server';

const ORG = 7;
const CX_PROPIA = uuidFalso('a');
const CX_AJENA = uuidFalso('b');

function base() {
  return crearBaseFalsa({
    integration_connections: [
      { id: CX_PROPIA, organization_id: ORG, status: 'connected', created_at: '2026-11-01T00:00:00Z' },
      { id: CX_AJENA, organization_id: 8, status: 'connected', created_at: '2026-11-01T00:00:00Z' },
    ],
    integration_events: [
      { id: 'e1', connection_id: CX_PROPIA, created_at: '2026-11-09T10:00:00Z', event_type: 'transaction.updated', direction: 'inbound', status: 'processed', source: 'webhook', payload: { data: { transaction: { reference: 'REF-1' } } } },
      { id: 'e2', connection_id: CX_PROPIA, created_at: '2026-11-08T10:00:00Z', event_type: 'prueba_de_conexion', direction: 'outbound', status: 'error', source: 'system', error_message: 'prueba:rechazada (HTTP 401)', payload: {} },
      { id: 'e3', connection_id: CX_PROPIA, created_at: '2026-11-07T10:00:00Z', event_type: 'transaction.created', direction: 'inbound', status: 'received', source: 'webhook', external_event_id: 'ext-9', payload: { pagador: 'secreto' } },
      { id: 'e4', connection_id: CX_AJENA, created_at: '2026-11-09T11:00:00Z', event_type: 'transaction.updated', direction: 'inbound', status: 'error', source: 'webhook', payload: {} },
    ],
  });
}

describe('listarEventos', () => {
  it('solo eventos de conexiones de la organización, sin payload, con total', async () => {
    const r = await listarEventos(base().db, ORG, { pagina: 1, tamano: 50 });
    expect(r.total).toBe(3);
    expect(r.eventos.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
    expect(JSON.stringify(r.eventos)).not.toContain('secreto');
    expect(r.eventos[0].referencia).toBe('REF-1');
    expect(r.eventos[2].referencia).toBe('ext-9');
  });

  it('pagina en el servidor y conserva el total', async () => {
    const r = await listarEventos(base().db, ORG, { pagina: 2, tamano: 2 });
    expect(r).toMatchObject({ total: 3, pagina: 2, tamano: 2 });
    expect(r.eventos.map((e) => e.id)).toEqual(['e3']);
  });

  it('filtra por estado, sentido, fechas y texto', async () => {
    const db = base().db;
    expect((await listarEventos(db, ORG, { estado: 'error' })).eventos.map((e) => e.id)).toEqual(['e2']);
    expect((await listarEventos(db, ORG, { sentido: 'inbound' })).eventos.map((e) => e.id)).toEqual(['e1', 'e3']);
    expect((await listarEventos(db, ORG, { desde: '2026-11-08T00:00:00Z', hasta: '2026-11-08T23:59:59Z' })).eventos.map((e) => e.id)).toEqual(['e2']);
    expect((await listarEventos(db, ORG, { texto: 'ext-9' })).eventos.map((e) => e.id)).toEqual(['e3']);
    expect((await listarEventos(db, ORG, { texto: 'rechazada' })).eventos.map((e) => e.id)).toEqual(['e2']);
  });

  it('«Solo webhooks» y «Solo pruebas de conexión» (panel de filtros 85-57)', async () => {
    const db = base().db;
    expect((await listarEventos(db, ORG, { soloWebhooks: true })).eventos.map((e) => e.id)).toEqual(['e1', 'e3']);
    expect((await listarEventos(db, ORG, { soloPruebas: true })).eventos.map((e) => e.id)).toEqual(['e2']);
    expect((await listarEventos(db, ORG, { soloWebhooks: true, soloPruebas: true })).eventos).toEqual([]);
  });

  it('una conexión ajena pedida por id no devuelve nada', async () => {
    const r = await listarEventos(base().db, ORG, { conexionId: CX_AJENA });
    expect(r).toMatchObject({ eventos: [], total: 0 });
  });
});

describe('detalleEvento', () => {
  it('devuelve el cuerpo completo de un evento propio', async () => {
    const e = await detalleEvento(base().db, ORG, 'e3');
    expect(e).toMatchObject({ id: 'e3', tipo: 'transaction.created', datos: { pagador: 'secreto' }, referencia: 'ext-9' });
  });

  it('un evento de otra organización o inexistente es 404 sin distinguir', async () => {
    await expect(detalleEvento(base().db, ORG, 'e4')).rejects.toMatchObject({ status: 404 });
    await expect(detalleEvento(base().db, ORG, 'no-existe')).rejects.toMatchObject({ status: 404 });
  });
});
