/**
 * Credenciales en el Vault: lectura según la forma de `secret_ref` y guardarraíles para que
 * Wompi no vuelva a escribir ni leer secretos en claro.
 */
import fs from 'fs';
import path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { esReferenciaVault, resolverSecreto } from '../secretosIntegracion';

const UUID = '3f2b1c9e-8d7a-4b6c-9e1f-0a2b3c4d5e6f';

function clienteCon(respuesta: { data: unknown; error: { message: string } | null }) {
  const rpc = jest.fn(async () => respuesta);
  return { db: { rpc } as unknown as SupabaseClient, rpc };
}

describe('esReferenciaVault', () => {
  test('uuid del Vault (con o sin mayúsculas)', () => {
    expect(esReferenciaVault(UUID)).toBe(true);
    expect(esReferenciaVault(UUID.toUpperCase())).toBe(true);
  });
  test('cualquier otra cosa es un valor en claro', () => {
    for (const v of ['prv_test_abc123', 'pub_prod_x', '', null, undefined, 42, `${UUID}x`]) {
      expect(esReferenciaVault(v)).toBe(false);
    }
  });
});

describe('resolverSecreto', () => {
  test('valor en claro (anterior a Vault): se usa tal cual y no llama al Vault', async () => {
    const { db, rpc } = clienteCon({ data: 'no-debe-usarse', error: null });
    await expect(resolverSecreto(db, 'c1', 'private_key', 'prv_test_abc123')).resolves.toBe('prv_test_abc123');
    expect(rpc).not.toHaveBeenCalled();
  });

  test('uuid: lee del Vault con fn_get_provider_secret(conexión, propósito)', async () => {
    const { db, rpc } = clienteCon({ data: 'secreto-del-vault', error: null });
    await expect(resolverSecreto(db, 'c1', 'events_secret', UUID)).resolves.toBe('secreto-del-vault');
    expect(rpc).toHaveBeenCalledWith('fn_get_provider_secret', { p_connection_id: 'c1', p_purpose: 'events_secret' });
  });

  test('uuid y el Vault falla o no devuelve nada: cadena vacía, nunca el uuid', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    for (const r of [
      { data: null, error: { message: 'permission denied' } },
      { data: null, error: null },
      { data: '', error: null },
    ]) {
      const { db } = clienteCon(r);
      await expect(resolverSecreto(db, 'c1', 'integrity_secret', UUID)).resolves.toBe('');
    }
    errorSpy.mockRestore();
  });

  test('sin secret_ref: cadena vacía', async () => {
    const { db, rpc } = clienteCon({ data: 'x', error: null });
    await expect(resolverSecreto(db, 'c1', 'public_key', null)).resolves.toBe('');
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('guardarraíles: Wompi sin secretos en claro', () => {
  const SRC = path.resolve(__dirname, '../../../..');
  const leer = (r: string) => fs.readFileSync(path.join(SRC, r), 'utf8');

  test('wompiService no escribe en integration_credentials desde el navegador', () => {
    const src = leer('lib/services/integrations/wompi/wompiService.ts');
    expect(src).not.toMatch(/from\('integration_credentials'\)\s*\.(insert|upsert|update|delete)/);
    expect(src).toMatch(/fetch\('\/api\/integrations\/wompi\/credentials'/);
  });

  test('wompiService.getCredentials resuelve cada credencial con resolverSecreto', () => {
    const src = leer('lib/services/integrations/wompi/wompiService.ts');
    expect(src).toMatch(/resolverSecreto\(db, connectionId, purpose,/);
  });

  test('la ruta de credenciales guarda con fn_set_provider_secret', () => {
    const src = leer('app/api/integrations/wompi/credentials/route.ts');
    expect(src).toMatch(/rpc\('fn_set_provider_secret'/);
    expect(src).not.toMatch(/from\('integration_credentials'\)/);
  });

  test('el webhook de Wompi no usa secret_ref en crudo como events_secret', () => {
    const src = leer('app/api/integrations/wompi/webhook/route.ts');
    expect(src).toMatch(/resolverSecreto\(admin, String\(s\.connection_id\), 'events_secret', s\.secret_ref\)/);
  });

  test('webhookSecurity no adivina la conexión (ni la organización) del evento', () => {
    const src = leer('lib/services/integrations/qrShared/webhookSecurity.ts');
    expect(src).not.toMatch(/order\('created_at', \{ ascending: false \}\)\s*\.limit\(1\)\s*\.single\(\);\s*\n\s*if \(!connection\)/);
    expect(src).toMatch(/if \(!connectionId\) \{/);
  });
});
