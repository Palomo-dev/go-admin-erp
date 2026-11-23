/**
 * Guardas de las migraciones de logística Fase 1 (20261123145040 … 20261123150641):
 * - cada una tiene su rollback;
 * - toda función SECURITY DEFINER fija search_path y revoca EXECUTE a public y anon
 *   (`revoke execute on function ... from public, anon`), como pide docs/POLITICA-MIGRACIONES.md;
 * - ninguna concede EXECUTE a anon;
 * - el rastreo público solo lo ejecuta service_role;
 * - toda tabla nueva activa RLS y las políticas usan el patrón rápido `(select auth.uid())`.
 */
import fs from 'fs';
import path from 'path';

const RAIZ = process.cwd();
const VERSIONES = [
  '20261123145040_logistica_f1_domiciliarios_envios',
  '20261123145549_logistica_f1_zonas_tarifas_reglas',
  '20261123150003_logistica_f1_rpc_envios',
  '20261123150416_logistica_f1_cuadres_domiciliario',
  '20261123150641_logistica_f1_pos_rastreo_avisos',
];

const leer = (p: string) => fs.readFileSync(p, 'utf8');
const sinComentarios = (s: string) => s.replace(/^\s*--.*$/gm, '');

describe.each(VERSIONES.map((v) => [v]))('%s', (version) => {
  const sql = sinComentarios(leer(path.join(RAIZ, 'supabase', 'migrations', `${version}.sql`)));

  it('tiene rollback', () => {
    expect(fs.existsSync(path.join(RAIZ, 'supabase', 'rollbacks', `${version}_rollback.sql`))).toBe(true);
  });

  it('cada SECURITY DEFINER fija search_path y revoca EXECUTE a public y anon', () => {
    const funciones = [...sql.matchAll(/create or replace function public\.(\w+)\s*\(([\s\S]*?)\)\s*returns[\s\S]*?as \$\$/gi)];
    // Cada migración de la fase define al menos una SECURITY DEFINER: la guarda no puede pasar en vacío.
    expect(funciones.filter((m) => /security definer/i.test(m[0])).length).toBeGreaterThan(0);
    const ofensores: string[] = [];
    for (const m of funciones) {
      const nombre = m[1];
      const cabecera = m[0];
      if (!/security definer/i.test(cabecera)) continue;
      if (!/set search_path = public/i.test(cabecera)) ofensores.push(`${nombre}: sin search_path`);
      const revoke = new RegExp(`revoke execute on function public\\.${nombre}\\s*\\([^;]*\\)\\s*from public, anon`, 'i');
      if (!revoke.test(sql)) ofensores.push(`${nombre}: sin revoke execute ... from public, anon`);
    }
    expect(ofensores).toEqual([]);
  });

  it('no concede nada a anon', () => {
    expect(sql).not.toMatch(/grant[^;]*\bto\s+[^;]*\banon\b/i);
  });

  it('políticas con (select auth.uid()) y sin EXISTS anidado', () => {
    const politicas = [...sql.matchAll(/create policy[\s\S]*?;/gi)].map((m) => m[0]);
    for (const p of politicas) {
      expect(p).not.toMatch(/auth\.uid\(\)(?!\s*\))/);
      expect(p).not.toMatch(/\bexists\s*\(/i);
    }
  });
});

it('las tablas nuevas activan RLS', () => {
  const todo = VERSIONES.map((v) => leer(path.join(RAIZ, 'supabase', 'migrations', `${v}.sql`))).join('\n');
  for (const t of ['shipment_delivery_codes', 'courier_settlements', 'courier_settlement_lines']) {
    expect(todo).toMatch(new RegExp(`alter table public\\.${t} enable row level security`, 'i'));
  }
  // Zonas, cobertura y reglas: las activa el bloque dinámico.
  expect(todo).toMatch(/foreach t in array array\['shipping_zones', 'shipping_zone_locations', 'delivery_rules'\]/);
  expect(todo).toMatch(/alter table public\.%I enable row level security/);
});

it('el rastreo público es solo de service_role', () => {
  const sql = leer(path.join(RAIZ, 'supabase', 'migrations', '20261123150641_logistica_f1_pos_rastreo_avisos.sql'));
  expect(sql).toMatch(/revoke execute on function public\.logistica_rastreo_publico\(integer, uuid\) from public, anon, authenticated/);
  expect(sql).toMatch(/grant execute on function public\.logistica_rastreo_publico\(integer, uuid\) to service_role;/);
});

it('las fases 1 de reglas solo admiten domiciliario propio', () => {
  const sql = leer(path.join(RAIZ, 'supabase', 'migrations', '20261123145549_logistica_f1_zonas_tarifas_reglas.sql'));
  expect(sql).toMatch(/constraint delivery_rules_fase1_solo_propio check \(action = 'own'\)/);
});
