/**
 * Contrato de la fase M1 del kiosco (plan de Marcación): migraciones, rutas sin
 * sesión y textos. Lee los archivos del repositorio; no toca la base.
 */
import fs from 'fs';
import path from 'path';

const RAIZ = path.resolve(__dirname, '../../../../..');
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

const ESQUEMA = 'supabase/migrations/20261117191900_hrm_m1_01_kiosco_esquema.sql';
const FUNCIONES = 'supabase/migrations/20261117193540_hrm_m1_02_kiosco_funciones.sql';

describe('migraciones de M1', () => {
  test('cada migración tiene su reversión', () => {
    for (const m of [ESQUEMA, FUNCIONES]) {
      const r = m.replace('supabase/migrations/', 'supabase/rollbacks/').replace('.sql', '_rollback.sql');
      expect(fs.existsSync(path.join(RAIZ, r))).toBe(true);
    }
  });

  test('toda tabla nueva tiene RLS activa y anon fuera', () => {
    const sql = leer(ESQUEMA);
    const tablas = [...sql.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]);
    expect(tablas.length).toBe(6);
    for (const t of tablas) {
      expect(sql).toContain(`alter table public.${t} enable row level security;`);
      expect(sql).toMatch(new RegExp(`revoke all on public\\.${t} from public, anon`));
    }
  });

  test('las tablas con secretos no tienen políticas (solo funciones SECURITY DEFINER)', () => {
    const sql = leer(ESQUEMA);
    for (const t of ['hr_kiosk_pairings', 'hr_marcacion_claves', 'hr_credentials']) {
      expect(sql).not.toMatch(new RegExp(`create policy \\w+ on public\\.${t}\\b`));
      expect(sql).toContain(`revoke all on public.${t} from public, anon, authenticated;`);
    }
  });

  test('toda función SECURITY DEFINER nueva revoca anon y authenticated en la misma migración', () => {
    const sql = leer(FUNCIONES);
    const bloques = sql.split(/(?=create or replace function public\.)/).slice(1);
    const definers = bloques.filter((b) => /\bsecurity definer\b/.test(b.split('$$')[0] + (b.split('$function$')[0] ?? '')));
    expect(definers.length).toBeGreaterThan(20);
    for (const b of definers) {
      const nombre = /create or replace function public\.(\w+)/.exec(b)![1];
      // M0 ya revocó las que se reemplazan (CREATE OR REPLACE conserva el ACL).
      const deM0 = ['fn_hr_metodos_sede', 'fn_hr_metodos_sede_guardar', 'fn_hr_metodos_sede_leer', 'fn_hr_dispositivos'].includes(nombre);
      if (deM0) continue;
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${nombre}\\([^)]*\\)\\s+from public, anon, authenticated`));
    }
  });

  test('ninguna función nueva deriva el día con CURRENT_DATE ni now()::date', () => {
    const sql = leer(FUNCIONES).toLowerCase();
    expect(sql).not.toMatch(/current_date/);
    expect(sql).not.toMatch(/now\(\)::date/);
  });

  test('sin nombres de organizaciones ni credenciales en los .sql', () => {
    for (const m of [ESQUEMA, FUNCIONES]) {
      const sql = leer(m);
      expect(sql).not.toMatch(/eyJ[a-zA-Z0-9_-]{20,}/); // JWT
      expect(sql).not.toMatch(/service_role_key|sk_live|password\s*=/i);
    }
  });
});

describe('rutas del equipo (sin sesión)', () => {
  const DIR = path.join(RAIZ, 'src/app/api/hrm/kiosco');
  const rutas = fs
    .readdirSync(DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(DIR, d.name, 'route.ts'));

  test('cada ruta autentica con la clave del equipo, salvo el canje del código con límite', () => {
    expect(rutas.length).toBe(6);
    for (const r of rutas) {
      const c = fs.readFileSync(r, 'utf8');
      if (r.includes(`${path.sep}vinculo${path.sep}`)) expect(c).toMatch(/codigoDeVinculo\(/);
      else expect(c).toMatch(/autenticarKiosco\(req\)/);
      // La organización nunca sale de la petición.
      expect(c).not.toMatch(/organization_?[iI]d|p_org/);
    }
  });

  test('el middleware deja pasar /api/hrm/kiosco/ y /marcacion/kiosco', () => {
    const mw = leer('src/middleware.ts');
    expect(mw).toContain("'/api/hrm/kiosco/'");
    expect(mw).toContain('api/hrm/kiosco/|');
    expect(mw).toContain("pathname === '/marcacion/kiosco'");
  });
});

describe('textos en 4 idiomas', () => {
  function claves(o: unknown, p = ''): string[] {
    if (typeof o !== 'object' || o === null) return [p];
    return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => claves(v, p ? `${p}.${k}` : k));
  }
  const es = JSON.parse(leer('messages/es.json')).hrmKiosco;

  test.each(['en', 'fr', 'pt'])('%s tiene las mismas claves de hrmKiosco que es', (l) => {
    const otro = JSON.parse(leer(`messages/${l}.json`)).hrmKiosco;
    expect(claves(otro).sort()).toEqual(claves(es).sort());
  });

  test('la autorización de huella y rostro usa el texto de D4 (cambiada el 2026-11-17)', () => {
    expect(es.autorizaciones.bloques.queSeGuarda.texto).toContain('se guardan cifrados en GO Admin');
    expect(JSON.stringify(es)).not.toMatch(/solo recibe tu número/);
  });
});
