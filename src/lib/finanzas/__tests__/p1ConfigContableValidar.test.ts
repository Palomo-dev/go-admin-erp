/**
 * QA Soporte 25-oct: 134050 endurece fn_configuracion_contable_validar (NULL con hijos ya no es movimiento),
 * pero la comprobación de cuenta solo corre en alta real o cambio de cuenta. Reguardar una fila heredada
 * (p.ej. comisiones -> 5235) desde la pantalla (upsert de todas las claves) no debe fallar con 23514.
 *
 * Contratos sobre el SQL siempre; escenario real contra Postgres solo si P1_PG_URL apunta a una base
 * desechable (p.ej. postgresql://postgres@/postgres?host=/tmp&port=54329). Nunca contra producción.
 */
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

const DIR = join(__dirname, '..', '..', '..', '..', 'supabase');
const m134050 = readFileSync(join(DIR, 'migrations/20261025134050_p1_config_contable_solo_movimiento.sql'), 'utf8');
const r134050 = readFileSync(join(DIR, 'rollbacks/20261025134050_p1_config_contable_solo_movimiento_rollback.sql'), 'utf8');

describe('134050: contrato del validador', () => {
  test('la comprobación de cuenta depende de alta real o cambio de cuenta', () => {
    expect(m134050).toMatch(/tg_op\s*=\s*'INSERT'\s+and\s+not\s+exists/);
    expect(m134050).toMatch(/x\.account_code\s*=\s*new\.account_code/);
    expect(m134050).toMatch(/tg_op\s*=\s*'UPDATE'\s+and\s+new\.account_code\s+is\s+distinct\s+from\s+old\.account_code/);
  });
  test('sigue endurecido: NULL solo sin hijos; sede y updated_at siempre', () => {
    expect(m134050).toMatch(/c\.es_movimiento is null and not exists/);
    expect(m134050.indexOf('La sede no pertenece')).toBeLessThan(m134050.indexOf("tg_op = 'INSERT'"));
    expect(m134050).toMatch(/new\.updated_at := now\(\);/);
  });
  test('el rollback vuelve a la versión viva (es_movimiento is distinct from false, sin tg_op)', () => {
    expect(r134050).toMatch(/c\.es_movimiento is distinct from false/);
    expect(r134050).not.toMatch(/tg_op/);
  });
});

const PG = process.env.P1_PG_URL;
(PG ? describe : describe.skip)('134050 contra Postgres desechable', () => {
  const psql = (sql: string) =>
    execFileSync('psql', [PG as string, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const codigo = (sql: string): string => {
    try { psql(sql); return 'ok'; } catch (e) {
      const m = /ERROR:\s+(\w+)?/.exec(String((e as { stderr?: string }).stderr ?? e));
      return String((e as { stderr?: string }).stderr ?? '').includes('no es de movimiento') ? '23514' : (m?.[1] ?? 'error');
    }
  };

  beforeAll(() => {
    psql(`drop schema if exists public cascade; create schema public;
      create table public.branches (id int primary key, organization_id int);
      create table public.chart_of_accounts (organization_id int, account_code text, parent_code text,
        es_movimiento boolean, is_active boolean, activa boolean generated always as (coalesce(is_active, true)) stored,
        primary key (organization_id, account_code));
      create table public.configuracion_contable (id bigserial primary key, organization_id int, branch_id int,
        clave text, account_code text, updated_at timestamptz);
      create unique index configuracion_contable_unica on public.configuracion_contable (organization_id, branch_id, clave) nulls not distinct;
      insert into public.chart_of_accounts (organization_id, account_code, parent_code, es_movimiento) values
        (1, '5235', '52', null), (1, '523550', '5235', true), (1, '529505', '5295', true), (1, '1105', '11', false);
      insert into public.configuracion_contable (organization_id, branch_id, clave, account_code)
        values (1, null, 'comisiones', '5235'), (1, null, 'caja', '529505');`);
    psql(m134050);
    psql(`create trigger trg_configuracion_contable_validar before insert or update on public.configuracion_contable
      for each row execute function public.fn_configuracion_contable_validar();`);
  });

  test('(a) upsert que mantiene comisiones -> 5235 (NULL con hijos) no se rechaza', () => {
    expect(codigo(`insert into public.configuracion_contable (organization_id, branch_id, clave, account_code)
      values (1, null, 'comisiones', '5235'), (1, null, 'caja', '529505')
      on conflict (organization_id, branch_id, clave) do update set account_code = excluded.account_code`)).toBe('ok');
    expect(codigo(`update public.configuracion_contable set account_code = '5235' where clave = 'comisiones'`)).toBe('ok');
  });
  test('(b) alta nueva o cambio a cuenta no de movimiento: 23514', () => {
    expect(codigo(`insert into public.configuracion_contable (organization_id, branch_id, clave, account_code) values (1, null, 'bancos', '5235')`)).toBe('23514');
    expect(codigo(`insert into public.configuracion_contable (organization_id, branch_id, clave, account_code) values (1, null, 'bancos', '1105')`)).toBe('23514');
    expect(codigo(`update public.configuracion_contable set account_code = '1105' where clave = 'caja'`)).toBe('23514');
    expect(codigo(`insert into public.configuracion_contable (organization_id, branch_id, clave, account_code)
      values (1, null, 'caja', '1105') on conflict (organization_id, branch_id, clave) do update set account_code = excluded.account_code`)).toBe('23514');
    expect(codigo(`update public.configuracion_contable set account_code = '529505' where clave = 'comisiones'`)).toBe('ok');
  });
});
