// ============================================================
// Guardarraíl: las membresías se crean, activan y revierten DENTRO de las funciones de venta
// (docs/design/MEMBRESIAS-FASE-1-2.md §4). La migración 20260929001100 las enganchó parchando la
// definición viva de seis funciones. Si una migración posterior REDEFINE una de ellas completa
// (create or replace con el cuerpo entero), tiene que conservar su enganche; si no, las ventas de
// membresías dejan de activarlas (o las devoluciones dejan de recortarlas) sin que nada falle.
// ============================================================
import fs from 'fs';
import path from 'path';

const DIR = path.join(process.cwd(), 'supabase', 'migrations');
const DESDE = '20260929001100';

const ENGANCHES: Record<string, string> = {
  pos_checkout_v1: 'fn_membresias_activar_venta',
  fn_factura_venta_emitir: 'fn_membresias_activar_venta',
  fn_registrar_pago: 'fn_membresias_activar_venta',
  pos_anular_venta_v1: 'fn_membresias_revertir_linea',
  procesar_devolucion: 'fn_membresias_revertir_linea',
  fn_nota_credito_emitir: 'fn_membresias_revertir_producto',
};

function migracionesPosteriores(): Array<{ archivo: string; sql: string }> {
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith('.sql') && f.slice(0, 14) > DESDE)
    .sort()
    .map((archivo) => ({ archivo, sql: fs.readFileSync(path.join(DIR, archivo), 'utf8') }));
}

describe('enganche de membresías en las funciones de venta', () => {
  it('la migración del enganche existe y parcha las seis funciones', () => {
    const sql = fs.readFileSync(path.join(DIR, `${DESDE}_membresias_enganche_venta.sql`), 'utf8');
    for (const [fn, llamada] of Object.entries(ENGANCHES)) {
      expect(sql).toContain(`public.${fn}(`);
      expect(sql).toContain(llamada);
    }
  });

  it.each(Object.entries(ENGANCHES))('una redefinición completa posterior de %s conserva %s', (fn, llamada) => {
    const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\s*\\(`, 'i');
    for (const { archivo, sql } of migracionesPosteriores()) {
      const i = sql.search(re);
      if (i < 0) continue;
      const cuerpo = sql.slice(i, i + 200_000);
      const fin = cuerpo.search(/\n\$(function)?\$\s*;/);
      const def = fin > 0 ? cuerpo.slice(0, fin) : cuerpo;
      if (!def.includes(llamada)) {
        throw new Error(`${archivo} redefine public.${fn} sin llamar a ${llamada} (ver MEMBRESIAS-FASE-1-2.md §4)`);
      }
    }
  });
});
