/**
 * Cuentas por cobrar — filtro «Fecha de corte» (2026-11-24).
 *
 * Ventas y Finanzas usan la MISMA página (ListadoCartera → GET /api/cartera →
 * fn_cxc_listado). Con `corte` la base devuelve los saldos al cierre de ese día;
 * aquí se fija que el filtro viaja solo si es un día válido y que la migración
 * calcula el corte partiendo del saldo de hoy (no recalcula la historia).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FILTROS_CARTERA, consultaCarteraDesde, esDiaCorte } from '@/lib/finanzas/cartera/listadoCartera';

describe('fecha de corte: lectura del filtro', () => {
  test('es uno de los filtros del listado (URL, chips y «Limpiar»)', () => {
    expect(FILTROS_CARTERA).toContain('corte');
  });

  test('un día válido viaja a la base', () => {
    expect(consultaCarteraDesde(new URLSearchParams('corte=2026-11-02')).filtros.corte).toBe('2026-11-02');
  });

  test.each(['2026-02-30', '2026-13-01', '02/11/2026', '2026-11-2', 'hoy', "2026-11-02'; drop table x;--", ''])(
    'un valor inválido (%p) no viaja',
    (valor) => {
      expect(consultaCarteraDesde(new URLSearchParams({ corte: valor })).filtros.corte).toBeUndefined();
    },
  );

  test('esDiaCorte reconoce bisiestos', () => {
    expect(esDiaCorte('2028-02-29')).toBe(true);
    expect(esDiaCorte('2026-02-29')).toBe(false);
    expect(esDiaCorte(null)).toBe(false);
  });
});

describe('fecha de corte: la función de la base', () => {
  const sql = readFileSync(join(__dirname, '../../../../supabase/migrations/20261124130000_cxc_listado_fecha_de_corte.sql'), 'utf8');
  const reversion = readFileSync(join(__dirname, '../../../../supabase/rollbacks/20261124130000_cxc_listado_fecha_de_corte_rollback.sql'), 'utf8');

  test('parte del saldo de hoy y devuelve solo lo posterior al corte, con tope', () => {
    expect(sql).toContain('least(greatest(k.tope, k.saldo_hoy), k.saldo_hoy + k.devuelto)');
    expect(sql).toMatch(/p\.payment_date >= v_corte_fin/);
    expect(sql).toMatch(/coalesce\(n\.issue_date, n\.created_at\) >= v_corte_fin/);
  });

  test('solo cuentas que ya existían y un corte de hoy o futuro no aplica', () => {
    expect(sql).toContain('coalesce(i.issue_date, ar.created_at) < v_corte_fin');
    expect(sql).toMatch(/if v_corte >= \(now\(\) at time zone v_tz\)::date then\s+v_corte := null;/);
  });

  test('devuelve el corte aplicado para la etiqueta y conserva los permisos', () => {
    expect(sql).toContain("'corte', v_corte");
    expect(sql).toContain('perform public.fn_assert_acceso_org(p_org);');
    expect(sql).toContain("array['finance.view', 'pos.view']");
    expect(sql).toMatch(/stable security definer/i);
  });

  test('la reversión vuelve a la función sin corte', () => {
    expect(reversion).toContain('CREATE OR REPLACE FUNCTION public.fn_cxc_listado(');
    expect(reversion).not.toContain('v_corte');
  });
});
