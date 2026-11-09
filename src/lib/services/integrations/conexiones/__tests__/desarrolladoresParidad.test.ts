/**
 * Desarrolladores (2026-11-09): paridad con las páginas viejas de Llaves de API y Webhooks
 * salientes, en el servidor. Cada escritura queda acotada a la organización del actor; lo de otra
 * organización es «no encontrado» (404), sin distinguir.
 */
import { crearBaseFalsa } from './baseFalsa';
import {
  borrarLlave,
  borrarWebhook,
  crearLlave,
  crearWebhook,
  editarLlave,
  editarWebhook,
  huellaLlave,
  listarLlaves,
  regenerarSecretoWebhook,
} from '../desarrolladores.server';

const ORG = 7;
const AJENA = 8;
const actor = { organizationId: ORG, userId: 'u', memberId: 3 };
const resolver = async () => ['8.8.8.8'];

describe('llaves de API: editar, desactivar, borrar', () => {
  async function conLlave() {
    const base = crearBaseFalsa();
    const r = await crearLlave(base.db, actor, { nombre: 'Tienda propia', alcances: ['read:products'] });
    return { base, llave: r.llave, completa: r.completa };
  }

  it('edita nombre, permisos y vencimiento sin tocar la huella', async () => {
    const { base, llave, completa } = await conLlave();
    const manana = new Date(Date.now() + 24 * 3600_000).toISOString();
    const r = await editarLlave(base.db, actor, llave.id, { nombre: ' Contable ', alcances: ['read:orders', 'inventado', 'read:orders'], expira: manana });
    expect(r).toMatchObject({ nombre: 'Contable', alcances: ['read:orders'], expira: manana, activa: true });
    expect(base.tablas.channel_api_keys[0].key_hash).toBe(huellaLlave(completa));
  });

  it('el listado dice quién la creó (85-53), solo con miembros de la organización', async () => {
    const base = crearBaseFalsa({
      organization_members: [
        { id: 3, organization_id: ORG, user_id: 'u-ana' },
        { id: 9, organization_id: AJENA, user_id: 'u-otro' },
      ],
      profiles: [
        { id: 'u-ana', first_name: 'Ana', last_name: 'Gómez', email: 'ana@ejemplo.co' },
        { id: 'u-otro', first_name: 'Otro', last_name: 'Usuario', email: 'otro@ejemplo.co' },
      ],
    });
    const creada = await crearLlave(base.db, actor, { nombre: 'Tienda propia', alcances: ['read:products'] });
    expect(creada.llave.creadaPor).toBe('Ana Gómez');
    base.tablas.channel_api_keys.push({ id: 'k-2', organization_id: ORG, name: 'Rara', key_hash: 'h', key_prefix: 'goak_··0000', scopes: [], created_by: 9, created_at: '2026-11-01T00:00:00Z' });
    const lista = await listarLlaves(base.db, ORG);
    expect(lista.find((k) => k.nombre === 'Tienda propia')?.creadaPor).toBe('Ana Gómez');
    expect(lista.find((k) => k.nombre === 'Rara')?.creadaPor).toBeNull();
  });

  it('desactivar y activar no revocan; `expira: null` quita el vencimiento', async () => {
    const { base, llave } = await conLlave();
    expect((await editarLlave(base.db, actor, llave.id, { activa: false })).activa).toBe(false);
    expect(base.tablas.channel_api_keys[0].revoked_at).toBeUndefined();
    expect((await editarLlave(base.db, actor, llave.id, { activa: true, expira: null })).activa).toBe(true);
    expect(base.tablas.channel_api_keys[0].expires_at).toBeNull();
  });

  it('rechaza un vencimiento pasado, un nombre vacío y permisos sin ninguno válido', async () => {
    const { base, llave } = await conLlave();
    await expect(editarLlave(base.db, actor, llave.id, { expira: '2020-01-01T00:00:00Z' })).rejects.toMatchObject({ status: 400, codigo: 'EXPIRA' });
    await expect(editarLlave(base.db, actor, llave.id, { nombre: '  ' })).rejects.toMatchObject({ status: 400, codigo: 'NOMBRE' });
    await expect(editarLlave(base.db, actor, llave.id, { alcances: ['nada'] })).rejects.toMatchObject({ status: 400, codigo: 'ALCANCES' });
  });

  it('una llave de otra organización no se edita ni se borra (404)', async () => {
    const { base, llave } = await conLlave();
    const ajeno = { organizationId: AJENA, userId: 'x', memberId: 9 };
    await expect(editarLlave(base.db, ajeno, llave.id, { nombre: 'robada' })).rejects.toMatchObject({ status: 404 });
    await expect(borrarLlave(base.db, ajeno, llave.id)).rejects.toMatchObject({ status: 404 });
    expect(base.tablas.channel_api_keys).toHaveLength(1);
    expect(base.tablas.channel_api_keys[0].name).toBe('Tienda propia');
  });

  it('una llave revocada no se edita (409) pero sí se borra', async () => {
    const { base, llave } = await conLlave();
    base.tablas.channel_api_keys[0].revoked_at = '2026-11-01T00:00:00Z';
    await expect(editarLlave(base.db, actor, llave.id, { nombre: 'x' })).rejects.toMatchObject({ status: 409, codigo: 'REVOCADA' });
    await borrarLlave(base.db, actor, llave.id);
    expect(base.tablas.channel_api_keys).toHaveLength(0);
  });
});

describe('webhooks salientes: crear, editar, pausar, nuevo secreto, borrar', () => {
  it('crea con secreto criptográfico que se devuelve una vez y nunca completo en el listado', async () => {
    const base = crearBaseFalsa();
    const r = await crearWebhook(base.db, actor, { nombre: 'ERP', url: 'https://erp.ejemplo.co/hooks', eventos: ['order.created', 'order.created', 'inventado'] }, resolver);
    expect(r.secreto).toMatch(/^whsec_/);
    expect(r.webhook).toMatchObject({ nombre: 'ERP', url: 'https://erp.ejemplo.co/hooks', eventos: ['order.created'], activo: true, secreto: `··${r.secreto.slice(-4)}` });
    expect(base.tablas.webhook_endpoints[0]).toMatchObject({ organization_id: ORG, secret: r.secreto });
  });

  it('rechaza destinos no públicos o sin HTTPS y listas sin eventos válidos', async () => {
    const base = crearBaseFalsa();
    await expect(crearWebhook(base.db, actor, { nombre: 'x', url: 'http://erp.ejemplo.co/hooks', eventos: ['order.created'] }, resolver)).rejects.toMatchObject({ status: 400, codigo: 'URL' });
    await expect(crearWebhook(base.db, actor, { nombre: 'x', url: 'https://interno.ejemplo.co/hooks', eventos: ['order.created'] }, async () => ['10.0.0.1'])).rejects.toMatchObject({ status: 400, codigo: 'URL' });
    await expect(crearWebhook(base.db, actor, { nombre: 'x', url: 'https://erp.ejemplo.co/hooks', eventos: ['inventado'] }, resolver)).rejects.toMatchObject({ status: 400, codigo: 'EVENTOS' });
    expect(base.tablas.webhook_endpoints ?? []).toHaveLength(0);
  });

  it('edita, pausa y reactiva (la racha de fallos vuelve a 0); otra organización → 404', async () => {
    const base = crearBaseFalsa();
    const { webhook } = await crearWebhook(base.db, actor, { nombre: 'ERP', url: 'https://erp.ejemplo.co/hooks', eventos: ['order.created'] }, resolver);
    base.tablas.webhook_endpoints[0].consecutive_failures = 3;
    const editado = await editarWebhook(base.db, actor, webhook.id, { nombre: 'ERP 2', eventos: ['payment.received'] }, resolver);
    expect(editado).toMatchObject({ nombre: 'ERP 2', eventos: ['payment.received'], fallosSeguidos: 3 });
    expect((await editarWebhook(base.db, actor, webhook.id, { activo: false })).activo).toBe(false);
    expect(await editarWebhook(base.db, actor, webhook.id, { activo: true })).toMatchObject({ activo: true, fallosSeguidos: 0 });
    const ajeno = { organizationId: AJENA, userId: 'x' };
    await expect(editarWebhook(base.db, ajeno, webhook.id, { nombre: 'robado' })).rejects.toMatchObject({ status: 404 });
    await expect(regenerarSecretoWebhook(base.db, ajeno, webhook.id)).rejects.toMatchObject({ status: 404 });
    await expect(borrarWebhook(base.db, ajeno, webhook.id)).rejects.toMatchObject({ status: 404 });
    expect(base.tablas.webhook_endpoints[0].name).toBe('ERP 2');
  });

  it('un secreto nuevo reemplaza al anterior y se devuelve una vez; borrar quita la fila', async () => {
    const base = crearBaseFalsa();
    const { webhook, secreto } = await crearWebhook(base.db, actor, { nombre: 'ERP', url: 'https://erp.ejemplo.co/hooks', eventos: ['order.created'] }, resolver);
    const r = await regenerarSecretoWebhook(base.db, actor, webhook.id);
    expect(r.secreto).toMatch(/^whsec_/);
    expect(r.secreto).not.toBe(secreto);
    expect(base.tablas.webhook_endpoints[0].secret).toBe(r.secreto);
    expect(r.webhook.secreto).toBe(`··${r.secreto.slice(-4)}`);
    await borrarWebhook(base.db, actor, webhook.id);
    expect(base.tablas.webhook_endpoints).toHaveLength(0);
  });
});
