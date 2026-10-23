import fs from 'fs';
import path from 'path';

describe('consecutivo al publicar el asiento', () => {
  const migracion = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20261023063513_consecutivo_al_publicar.sql'),
    'utf8',
  );
  const rollback = fs.readFileSync(
    path.join(process.cwd(), 'supabase/rollbacks/20261023063513_consecutivo_al_publicar_rollback.sql'),
    'utf8',
  );

  it('numera al publicar y reconoce las fuentes automáticas', () => {
    expect(migracion).toContain('before insert or update of posted');
    expect(migracion).toContain('fn_tipo_comprobante_de_asiento');
    expect(migracion).toContain("'sales', 'sale'");
    expect(migracion).toContain('stock_movements');
    expect(migracion).toContain("tipo := 'nota_contable'");
    expect(migracion).toContain("p_source = 'bank_transactions'");
    expect(migracion).toContain("p_source = 'payments'");
    expect(migracion).toContain('order by b.entry_date nulls last, b.id');
    expect(migracion).toContain("app.contabilidad_mantenimiento");
    expect(migracion).toContain(
      'revoke all on function public.fn_tipo_comprobante_de_asiento(integer, text, text) from public, anon, authenticated',
    );
    expect(migracion).not.toMatch(/create\s+or\s+replace\s+function\s+public\.fn_create_journal_entry/i);
    expect(migracion).not.toMatch(/create\s+or\s+replace\s+function\s+public\.fn_auto_journal_stock_movement/i);
  });

  it('el rollback no borra los números ya asignados', () => {
    expect(rollback).toContain('before insert on public.journal_entries');
    expect(rollback).not.toContain('before insert or update of posted');
    expect(rollback).toContain('drop function if exists public.fn_tipo_comprobante_de_asiento(integer, text, text)');
    expect(rollback).toContain('No borra comprobante_numero');
    expect(rollback).toContain('No rebobina comprobante_consecutivos');
    expect(rollback).not.toMatch(/delete\s+from\s+journal_entries/i);
    expect(rollback).not.toMatch(/comprobante_numero\s*=\s*null/i);
  });
});
