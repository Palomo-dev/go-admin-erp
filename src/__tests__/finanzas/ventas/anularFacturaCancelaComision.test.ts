/// <reference types="jest" />
/**
 * Pendiente 2 (docs/hallazgos/comisiones-e-impuestos-2026-09-28.md): anular
 * una factura de venta dejaba viva su comisión devengada (y su asiento). Ahora
 * `fn_factura_venta_anular` la cancela y el disparador
 * `fn_auto_journal_commission` hace el contra-asiento; una ya pagada no se
 * toca y se avisa (`comision_ya_pagada`), igual que `pos_anular_venta_v1`.
 *
 * Probado por MCP en un DO … RAISE que se deshace (organización 115):
 *   factura con comisión devengada → comisiones_canceladas 1, comisión
 *   'cancelled', 1 contra-asiento cuyo crédito (12.000) iguala el débito del
 *   devengo; factura cuya comisión estaba pagada → comisiones_canceladas 0,
 *   avisos ['comision_ya_pagada'], la comisión sigue 'paid'.
 * El rollback se verificó igual a la versión anterior (mismo md5 de
 * pg_get_functiondef que la migración 20260924104430).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const leer = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const sinComentarios = (s: string) => s.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');

describe('fn_factura_venta_anular cancela la comisión con contra-asiento', () => {
  const code = sinComentarios(leer('supabase/migrations/20260928211000_factura_venta_anular_cancela_comision.sql'));

  it('cancela las devengadas de la factura y de su venta ligada, acotadas a la organización', () => {
    expect(code).toMatch(/update public\.commissions\s+set status = 'cancelled'/);
    expect(code).toMatch(/where organization_id = v_inv\.organization_id and status = 'accrued'/);
    expect(code).toMatch(/source_type = 'invoice_sale' and source_id = v_inv\.id::text/);
    expect(code).toMatch(/v_inv\.sale_id is not null and source_type = 'sale' and source_id = v_inv\.sale_id::text/);
  });

  it('no borra ni edita asientos: el contra-asiento es del disparador (fn_auto_journal_commission)', () => {
    expect(code).not.toMatch(/delete\s+from\s+(public\.)?(journal_entries|journal_lines|commissions)/i);
    expect(code).not.toMatch(/update\s+(public\.)?journal_/i);
    const disparador = leer('supabase/migrations/20260928171000_comisiones_contra_asiento_y_pago_con_cuenta.sql');
    expect(disparador).toMatch(/NEW\.status = 'cancelled'\s+AND OLD\.status IN \('accrued', 'paid'\)/);
  });

  it('una comisión ya pagada no se toca y se avisa', () => {
    expect(code).toMatch(/status = 'paid'[\s\S]*v_avisos := array_append\(v_avisos, 'comision_ya_pagada'\)/);
    expect(code).toMatch(/'comisiones_canceladas', v_comisiones,\s+'avisos', to_jsonb\(v_avisos\)\);/);
  });

  it('conserva las guardas previas (permiso finance.void, sucursal, con pagos, FE aceptada)', () => {
    for (const g of ["array['finance.void']", 'app_branch_access', "'con_pagos'", "'fe_aceptada'", "'ya_anulada'", "'nota_credito'"]) {
      expect(code).toContain(g);
    }
    expect(code).toMatch(/revoke all on function public\.fn_factura_venta_anular\(uuid, text\) from public, anon/);
  });

  it('el rollback restaura la versión anterior (sin comisiones)', () => {
    const rb = leer('supabase/rollbacks/20260928211000_factura_venta_anular_cancela_comision_rollback.sql');
    expect(sinComentarios(rb)).not.toMatch(/commissions/);
    expect(rb).toMatch(/'seriales_devueltos', v_seriales\);\nend;/);
  });
});

describe('la interfaz avisa si la comisión ya estaba pagada', () => {
  it('DetalleFacturaVenta muestra el aviso del POS (mismo texto en 4 idiomas)', () => {
    const src = leer('src/components/finanzas/facturas-venta/detalle/DetalleFacturaVenta.tsx');
    expect(src).toMatch(/useTranslations\('posCobroServidor\.avisos'\)/);
    expect(src).toMatch(/resultado\?\.avisos\?\.includes\('comision_ya_pagada'\)\) toastWarning\(tAvisos\('comision_ya_pagada'\)\)/);
    for (const idioma of ['es', 'en', 'fr', 'pt']) {
      const m = JSON.parse(leer(`messages/${idioma}.json`)) as { posCobroServidor?: { avisos?: Record<string, string> } };
      expect(typeof m.posCobroServidor?.avisos?.comision_ya_pagada).toBe('string');
    }
  });
});
