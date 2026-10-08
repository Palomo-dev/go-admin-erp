/**
 * GO-seguridad 2026-10-08: la configuración del chat IA (`ai_settings`) ya no
 * la escribe el navegador.
 *
 * Lo que se probó en la base viva (bloque `do $$ … raise exception
 * 'ENSAYO_OK' $$`, con `set local role` y `request.jwt.claims`) antes de
 * aplicar la migración:
 *   - ANTES: un miembro activo sin `admin.full_access` actualizaba la fila de
 *     su organización (el hueco);
 *   - DESPUÉS: ese miembro sigue leyendo, pero no actualiza (0 filas), no borra
 *     y no inserta (42501); el administrador inserta y actualiza;
 *   - service_role sigue escribiendo (no pasa por RLS).
 * Aquí se fija que el código y los archivos no vuelvan atrás.
 */
import * as fs from 'fs';
import * as path from 'path';

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const SRC = path.join(RAIZ, 'src');
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf-8');
const MIGRACION = 'supabase/migrations/20261008005828_ai_settings_escritura_solo_admin.sql';
const ROLLBACK = 'supabase/rollbacks/20261008005828_ai_settings_escritura_solo_admin_rollback.sql';

function archivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : archivos(ruta);
    return /\.(ts|tsx)$/.test(e.name) ? [ruta] : [];
  });
}

/** Escrituras `.from('ai_settings')…insert|update|upsert|delete(` en el mismo encadenamiento. */
const ESCRITURA = /\.from\(\s*['"]ai_settings['"]\s*\)(?:(?!\.from\()[\s\S]){0,200}?\.(insert|update|upsert|delete)\s*\(/;

describe('ningún cliente de navegador escribe en ai_settings', () => {
  const clientes = archivos(SRC).filter((f) => {
    const src = fs.readFileSync(f, 'utf-8');
    return /^\s*['"]use client['"]/.test(src) || /from ['"]@\/lib\/supabase\/config['"]/.test(src);
  });

  test('se revisan los archivos de navegador (sanity)', () => {
    expect(clientes.length).toBeGreaterThan(100);
  });

  test('ningún archivo de navegador hace insert/update/upsert/delete en ai_settings', () => {
    const culpables = clientes.filter((f) => ESCRITURA.test(fs.readFileSync(f, 'utf-8'))).map((f) => path.relative(RAIZ, f));
    expect(culpables).toEqual([]);
  });

  test('AISettingsService guarda por la ruta del servidor y la pantalla no manda memberId', () => {
    const servicio = leer('src/lib/services/aiSettingsService.ts');
    expect(servicio).toMatch(/fetch\('\/api\/chat\/ai\/settings', \{\s*method: 'PATCH'/);
    const pantalla = leer('src/components/chat/ia/configuracion/ConfiguracionIAChat.tsx');
    expect(pantalla).toMatch(/service\.toggleAI\(\)/);
    expect(pantalla).not.toMatch(/updateSettings\([\s\S]*?\}, memberId\)/);
  });

  test('la ruta toma la organización de la sesión, rechaza otra y exige admin en el servidor', () => {
    const ruta = leer('src/app/api/chat/ai/settings/route.ts');
    expect(ruta).toMatch(/getServerOrgContext\(request\)/);
    expect(ruta).toMatch(/readOrgBody\(ctx, request/);
    expect(ruta).toMatch(/requireOrgAdminOrPermission\(ctx, PERMISO_CONFIGURAR_IA_CHAT\)/);
    expect(leer('src/lib/services/chat/aiSettingsServidor.ts')).toMatch(/PERMISO_CONFIGURAR_IA_CHAT = 'admin\.full_access'/);
  });
});

describe('migración: escritura de ai_settings solo para administradores', () => {
  const sql = leer(MIGRACION);

  test('existe con su rollback y sin borrar nada', () => {
    expect(fs.existsSync(path.join(RAIZ, ROLLBACK))).toBe(true);
    expect(sql.toLowerCase()).not.toContain('drop');
  });

  test.each(['insert', 'update', 'delete'])('política RESTRICTIVE de %s con el permiso de administrador', (cmd) => {
    const re = new RegExp(`create policy ai_settings_escritura_admin_${cmd} on public\\.ai_settings\\s+as restrictive for ${cmd} to authenticated[\\s\\S]*?fn_crm_tiene_permiso\\(organization_id, 'admin\\.full_access'\\)`);
    expect(sql).toMatch(re);
  });

  test('la lectura no cambia', () => {
    expect(sql).not.toMatch(/for select/i);
  });
});
