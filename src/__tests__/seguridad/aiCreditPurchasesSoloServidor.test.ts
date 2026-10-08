/**
 * GO-seguridad 2026-10-08: las compras de créditos IA (`ai_credit_purchases`)
 * solo las escribe el servidor, y cada compra suma sus créditos una vez.
 *
 * Lo que se probó en la base viva (bloque `do $$ … raise exception
 * 'ENSAYO_OK' $$`, con `set local role` y `request.jwt.claims`) antes de
 * aplicar la migración 20261008013059:
 *   - ANTES: un miembro activo insertaba compras `pending` de su organización;
 *     el webhook sumaba dos veces (trigger + suma a mano: 2000 → 2500 → 3000),
 *     un reenvío otra vez (3500) y un `completed → pending → completed` otra
 *     más (4000);
 *   - DESPUÉS: miembro y administrador no insertan (`completed` ni `pending`),
 *     no actualizan ni borran (42501), aun si alguien vuelve a conceder la
 *     escritura (política RESTRICTIVE: 42501 / 0 filas); el miembro sigue
 *     leyendo sus compras; anon no lee ni escribe; service_role pasa la compra
 *     a `completed` y suma una vez (2000 → 2500), el reenvío y el vaivén de
 *     estado no suman (2500), y un segundo registro del mismo Checkout da 23505.
 * Aquí se fija que el código y los archivos no vuelvan atrás.
 */
import * as fs from 'fs';
import * as path from 'path';

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const SRC = path.join(RAIZ, 'src');
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf-8');
const MIGRACION = 'supabase/migrations/20261008013059_ai_credit_purchases_solo_servidor_suma_unica.sql';
const ROLLBACK = 'supabase/rollbacks/20261008013059_ai_credit_purchases_solo_servidor_suma_unica_rollback.sql';

function archivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : archivos(ruta);
    return /\.(ts|tsx)$/.test(e.name) ? [ruta] : [];
  });
}

const escrituraEn = (tabla: string) =>
  new RegExp(`\\.from\\(\\s*['"]${tabla}['"]\\s*\\)(?:(?!\\.from\\()[\\s\\S]){0,200}?\\.(insert|update|upsert|delete)\\s*\\(`);

describe('ai_credit_purchases: el navegador no escribe', () => {
  const todos = archivos(SRC);
  const clientes = todos.filter((f) => {
    const src = fs.readFileSync(f, 'utf-8');
    return /^\s*['"]use client['"]/.test(src) || /from ['"]@\/lib\/supabase\/config['"]/.test(src);
  });

  test('se revisan los archivos de navegador (sanity)', () => {
    expect(clientes.length).toBeGreaterThan(100);
  });

  test('ningún archivo de navegador hace insert/update/upsert/delete en ai_credit_purchases', () => {
    const culpables = clientes
      .filter((f) => escrituraEn('ai_credit_purchases').test(fs.readFileSync(f, 'utf-8')))
      .map((f) => path.relative(RAIZ, f));
    expect(culpables).toEqual([]);
  });

  test('solo escriben ai_credit_purchases el checkout de créditos y aplicarCompraCreditosIa', () => {
    const escritores = todos
      .filter((f) => escrituraEn('ai_credit_purchases').test(fs.readFileSync(f, 'utf-8')))
      .map((f) => path.relative(RAIZ, f).split(path.sep).join('/'))
      .sort();
    expect(escritores).toEqual([
      'src/app/api/stripe/purchase-ai-credits/route.ts',
      'src/lib/stripe/aplicarCompraCreditosIa.ts',
    ]);
  });
});

describe('una sola suma por compra: el código no suma créditos comprados', () => {
  test('el webhook delega en aplicarCompraCreditosIa y no escribe ai_settings', () => {
    const webhook = leer('src/app/api/stripe/webhook/route.ts');
    expect(webhook).toMatch(/aplicarCompraCreditosIa\(getServiceClient\(\), checkoutSession\)/);
    expect(webhook).not.toMatch(escrituraEn('ai_settings'));
    expect(webhook).not.toMatch(/purchased_credits/);
  });

  test('aplicarCompraCreditosIa no escribe ai_settings ni saldos', () => {
    const modulo = leer('src/lib/stripe/aplicarCompraCreditosIa.ts');
    expect(modulo).not.toMatch(/from\(\s*['"]ai_settings['"]/);
    expect(modulo).not.toMatch(/credits_remaining|purchased_credits/);
  });

  test('la firma se verifica antes de procesar y falla cerrado sin secreto', () => {
    const webhook = leer('src/app/api/stripe/webhook/route.ts');
    expect(webhook).toMatch(/event = constructWebhookEvent\(body, signature\)/);
    const servidor = leer('src/lib/stripe/server.ts');
    expect(servidor).toMatch(/if \(!webhookSecret\) \{\s*throw new Error/);
  });
});

describe('migración: escritura solo del servidor y suma idempotente', () => {
  const sql = leer(MIGRACION);

  test('existe con su rollback y sin borrar nada', () => {
    expect(fs.existsSync(path.join(RAIZ, ROLLBACK))).toBe(true);
    expect(sql.toLowerCase()).not.toContain('drop');
  });

  test('revoca la escritura de anon y authenticated, y la lectura de anon', () => {
    expect(sql).toMatch(/revoke insert, update, delete, truncate, references, trigger on public\.ai_credit_purchases from anon, authenticated;/);
    expect(sql).toMatch(/revoke select on public\.ai_credit_purchases from anon;/);
    expect(sql).not.toMatch(/revoke select on public\.ai_credit_purchases from[^;]*authenticated/);
  });

  test.each(['insert', 'update', 'delete'])('política RESTRICTIVE de %s para anon y authenticated', (cmd) => {
    const re = new RegExp(`create policy ai_credit_purchases_sin_escritura_cliente_${cmd} on public\\.ai_credit_purchases\\s+as restrictive for ${cmd} to anon, authenticated`);
    expect(sql).toMatch(re);
  });

  test('un solo trigger suma, con la marca credits_applied_at protegida', () => {
    expect(sql).toMatch(/add column if not exists credits_applied_at timestamptz/);
    expect(sql).toMatch(/disable trigger trg_sync_ai_credits/);
    expect(sql).toMatch(/before insert or update on public\.ai_credit_purchases/);
    expect(sql).toMatch(/NEW\.credits_applied_at := OLD\.credits_applied_at/);
    expect(sql).toMatch(/NEW\.status = 'completed' and NEW\.credits_applied_at is null/);
    expect(sql).toMatch(/create unique index if not exists ux_ai_credit_purchases_checkout_session/);
  });
});
