/**
 * Contrato de 20261022221035: fn_stock_listado publica uuid y parent_uuid,
 * siempre de la misma organización, y el rollback devuelve el cuerpo anterior.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = process.cwd();
const NOMBRE = '20261022221035_stock_listado_uuid';
const mig = readFileSync(join(RAIZ, 'supabase/migrations', `${NOMBRE}.sql`), 'utf8');
const rb = readFileSync(join(RAIZ, 'supabase/rollbacks', `${NOMBRE}_rollback.sql`), 'utf8');

describe('fn_stock_listado publica el uuid de la ficha', () => {
  it('tiene rollback y los md5 de partida y de llegada', () => {
    expect(existsSync(join(RAIZ, 'supabase/rollbacks', `${NOMBRE}_rollback.sql`))).toBe(true);
    expect(mig).toContain("if v_md5 = '3033c44fdb9fa0892e413f7c659412fe'");
    expect(mig).toContain("if v_md5 <> 'f1fdb0f8f75c4ed15a262c35a1e4cbf7'");
    expect(rb).toContain("if v_md5 = 'f1fdb0f8f75c4ed15a262c35a1e4cbf7'");
    expect(rb).toContain("if v_md5 <> '3033c44fdb9fa0892e413f7c659412fe'");
  });

  it('el uuid y el del padre salen de products de la misma organización', () => {
    expect(mig).toContain("'uuid', (select pu.uuid from public.products pu where pu.id = g.product_id and pu.organization_id = p_org)");
    expect(mig).toContain("'parent_uuid', (select ppu.uuid from public.products ppu where ppu.id = g.parent_product_id and ppu.organization_id = p_org)");
    expect(mig).toMatch(/revoke all on function public\.fn_stock_listado\(integer, jsonb, integer, integer\) from anon, public/);
  });

  it('el rollback quita esas claves y no toca datos', () => {
    expect(rb).not.toMatch(/delete from|update public\.products/i);
    expect(rb).toContain("'product_id', g.product_id,\n        'nombre', g.name,");
    expect(rb).toContain("'parent_id', g.parent_product_id,\n        'atributos',");
  });
});
