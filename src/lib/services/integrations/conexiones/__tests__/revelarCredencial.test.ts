/**
 * «Ver» credencial (decisión del dueño, 2026-11-07): el valor guardado hoy sale tal cual, el de la
 * bóveda por fn_get_provider_secret, siempre con auditoría previa; sin auditoría no se revela.
 */
import fs from 'fs';
import path from 'path';
import { crearBaseFalsa } from './baseFalsa';
import { revelarCredencial } from '../conexiones.server';

const ORG = 7;
const ACTOR = { organizationId: ORG, userId: 'u-1' };
const CONEXION = 'cccccccc-cccc-4ccc-8ccc-000000000001';

function base() {
  return crearBaseFalsa({
    integration_connections: [{ id: CONEXION, organization_id: ORG, connector_id: 'x', status: 'connected', branch_id: null }],
    integration_credentials: [{ id: 'k1', connection_id: CONEXION, purpose: 'private_key', secret_ref: 'prv_prod_FALSO5678', status: 'active', created_at: '2026-11-01' }],
  });
}

describe('revelarCredencial', () => {
  it('devuelve el valor en claro (Wompi de hoy) y deja auditoría con quién, cuál e IP', async () => {
    const b = base();
    const r = await revelarCredencial(b.db, ACTOR, CONEXION, 'private_key', '1.2.3.4');
    expect(r).toEqual({ proposito: 'private_key', valor: 'prv_prod_FALSO5678', origen: 'registro' });
    expect(b.tablas.ops_audit_log[0]).toMatchObject({
      organization_id: ORG,
      user_id: 'u-1',
      entity_type: 'integration_credential',
      entity_id: 'k1',
      action: 'credential_revealed',
      ip_address: '1.2.3.4',
      metadata: { connection_id: CONEXION, purpose: 'private_key', origen: 'registro' },
    });
    expect(JSON.stringify(b.tablas.ops_audit_log)).not.toContain('prv_prod_FALSO5678');
    expect(b.rpc).not.toHaveBeenCalled();
  });

  it('lee de la bóveda lo que ya estaba allí (OTA, logística)', async () => {
    const b = crearBaseFalsa({ integration_connections: [{ id: CONEXION, organization_id: ORG, status: 'connected' }] });
    await b.db.rpc('fn_set_provider_secret', { p_connection_id: CONEXION, p_purpose: 'private_key', p_value: 'secreto-boveda' });
    const r = await revelarCredencial(b.db, ACTOR, CONEXION, 'private_key', null);
    expect(r).toMatchObject({ valor: 'secreto-boveda', origen: 'boveda' });
  });

  it('sin auditoría no se revela nada', async () => {
    const b = base();
    const original = b.db.from.bind(b.db);
    (b.db as unknown as { from: (t: string) => unknown }).from = (t: string) =>
      t === 'ops_audit_log' ? { insert: async () => ({ error: { message: 'fallo' } }) } : original(t);
    await expect(revelarCredencial(b.db, ACTOR, CONEXION, 'private_key', null)).rejects.toMatchObject({ status: 503, codigo: 'AUDITORIA' });
  });

  it('conexión de otra organización → 404; propósito inexistente → 404', async () => {
    await expect(revelarCredencial(base().db, { ...ACTOR, organizationId: 8 }, CONEXION, 'private_key', null)).rejects.toMatchObject({ status: 404 });
    await expect(revelarCredencial(base().db, ACTOR, CONEXION, 'public_key', null)).rejects.toMatchObject({ status: 404, codigo: 'SIN_CREDENCIAL' });
  });

  it('la ruta exige administración resuelta en el servidor', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/app/api/integrations/conexiones/[id]/credenciales/revelar/route.ts'), 'utf8');
    expect(src).toMatch(/\}, \{ admin: true \}\);\s*$/);
    expect(src).not.toMatch(/roleName|role_name/);
  });
});
