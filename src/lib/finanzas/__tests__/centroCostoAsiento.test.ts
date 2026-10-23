import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const dir = join(process.cwd(), 'supabase/migrations');
const rollbacks = join(process.cwd(), 'supabase/rollbacks');

describe('centro de costo en el insert del asiento', () => {
  const archivos = readdirSync(dir).filter((nombre) => nombre.endsWith('_centro_costo_en_asiento.sql'));
  const sql = archivos.map((nombre) => readFileSync(join(dir, nombre), 'utf8')).join('\n');
  const reversa = readdirSync(rollbacks)
    .filter((nombre) => nombre.includes('centro_costo_en_asiento') && nombre.endsWith('_rollback.sql'))
    .map((nombre) => readFileSync(join(rollbacks, nombre), 'utf8'))
    .join('\n');

  it('pasa el centro en la creación y no deja el update de la línea publicada', () => {
    expect(archivos).toHaveLength(1);
    expect(sql).toContain('p_cost_center_id uuid DEFAULT NULL::uuid');
    expect(sql).toContain('p_cuenta_sin_centro := v_tesoreria');
    expect(sql).toContain('p_cuenta_sin_centro := v_banco');
    expect(sql).toContain('cost_center_id');
    expect(sql).toContain("''P0001''");
    expect(sql).toContain('revoke all on function');
    expect(sql).toContain('from public, anon, authenticated');
  });

  it('el rollback avisa que no borra movimientos y devuelve el 42501', () => {
    expect(reversa).toContain('No borra movimientos de caja');
    expect(reversa).toContain("''42501''");
    expect(reversa).toContain('update public.journal_lines');
  });
});
