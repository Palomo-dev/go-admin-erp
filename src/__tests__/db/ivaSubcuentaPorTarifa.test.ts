/**
 * Contrato de las migraciones de H1 (subcuenta de IVA por tarifa y lado) y H2
 * (responsabilidades del RUT por vigencia), escritas y SIN aplicar el
 * 2026-11-07. La prueba en seco contra la base está en
 * docs/contador/pruebas/07_iva_subcuenta_por_tarifa.sql (32 de 32) y la
 * reversión se verificó con md5 de las definiciones. Aquí se fija lo que no
 * puede volver: la última cuenta mapeada sin tarifa, funciones abiertas a anon,
 * reemplazos sin verificar, nombres de clientes en el repo.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = process.cwd();
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');

const H1 = leer('supabase/migrations/20261108140000_iva_subcuenta_por_tarifa_y_lado.sql');
const H1_REV = leer('supabase/rollbacks/20261108140000_iva_subcuenta_por_tarifa_y_lado_rollback.sql');
const H2 = leer('supabase/migrations/20261108140500_responsabilidades_fiscales_en.sql');
const H2_REV = leer('supabase/rollbacks/20261108140500_responsabilidades_fiscales_en_rollback.sql');

/** Pares (viejo, nuevo) de cada reemplazo verificado, en orden. */
function reemplazos(sql: string): Array<{ viejo: string; nuevo: string; etiqueta: string }> {
  const pares: Array<{ viejo: string; nuevo: string; etiqueta: string }> = [];
  const re = /pg_temp\.fn_reemplazo_verificado\(v_def,\s*\$v\$([\s\S]*?)\$v\$,\s*(?:\$v\$([\s\S]*?)\$v\$|v_nuevo), '([^']+)'\)/g;
  for (const m of sql.matchAll(re)) {
    const nuevo = m[2] ?? /v_nuevo constant text := \$v\$([\s\S]*?)\$v\$;/.exec(sql)?.[1] ?? '';
    pares.push({ viejo: m[1], nuevo, etiqueta: m[3] });
  }
  return pares;
}

describe('H1 · subcuenta de IVA por tarifa y lado', () => {
  it('la subcuenta se elige por tarifa y por el título del lado (240805 generado, 240810 descontable)', () => {
    const fn = H1.slice(H1.indexOf('create or replace function public.fn_cuenta_iva_tarifa'), H1.indexOf('-- ── 3.'));
    expect(fn).toContain('round(coalesce(ot.rate, tt.rate), 2) = v_tarifa');
    expect(fn).toContain("tam.account_code like v_titulo || '%'");
    expect(fn).toContain("case v_lado when 'descontable' then '240810' else '240805' end");
    // La configuración contable (iva_generado / iva_descontable) es la tarifa general: solo 19 %.
    expect(fn).toMatch(/if v_tarifa = 19 then\s+select c\.account_code into v_cta\s+from public\.configuracion_contable/);
    // El respaldo documentado solo conoce 19 % y 5 %; otra tarifa sin mapeo → NULL (no se inventa).
    expect(fn).toContain('if v_tarifa in (19, 5) then');
    expect(fn).toMatch(/-- e\) No se inventa[^\n]*\n\s+return null;/);
  });

  it('fn_cuenta_iva conserva la firma y ya no devuelve «la última cuenta mapeada»', () => {
    const fn = H1.slice(H1.indexOf('create or replace function public.fn_cuenta_iva(p_organization_id integer'));
    expect(fn).toMatch(/select public\.fn_cuenta_iva_tarifa\(p_organization_id, p_branch_id, p_source, p_cuenta_regla, null, null\);/);
  });

  it('las funciones nuevas nacen cerradas a anon y no se elevan', () => {
    for (const firma of [
      'fn_iva_lado(text, text, text)',
      'fn_cuenta_iva_tarifa(integer, integer, text, text, numeric, text)',
      'fn_iva_pesos_por_tarifa(integer, text, text)',
      'fn_iva_reparto(integer, integer, text, text, text, numeric, text, integer)',
    ]) {
      expect(H1).toContain(`revoke all on function public.${firma} from public, anon;`);
      expect(H1).toContain(`grant execute on function public.${firma} to authenticated, service_role;`);
    }
    expect(H1).not.toMatch(/security definer/i);
  });

  it('cada llamador cambia por reemplazo verificado y la reversión es el inverso exacto', () => {
    const ida = reemplazos(H1);
    const vuelta = reemplazos(H1_REV);
    expect(ida.map((p) => p.etiqueta)).toEqual([
      'fn_create_journal_entry/declare',
      'fn_create_journal_entry/cuenta',
      'fn_create_journal_entry/pendiente',
      'fn_create_journal_entry/iva_credito',
      'fn_create_journal_entry/iva_debito',
      'fn_armar_asiento_documento/iva',
      'fn_nc_asiento_devolucion/guarda',
      'fn_nc_asiento_devolucion/iva',
      'fn_auto_journal_purchase/iva',
    ]);
    expect(vuelta).toHaveLength(ida.length);
    for (const p of ida) {
      const inverso = vuelta.find((v) => v.etiqueta === `${p.etiqueta} (reversión)`);
      expect(inverso).toBeDefined();
      expect(inverso?.viejo).toBe(p.nuevo);
      expect(inverso?.nuevo).toBe(p.viejo);
    }
    // Ningún llamador sigue llamando a la función vieja después del reemplazo.
    for (const p of ida) expect(p.nuevo).not.toMatch(/public\.fn_cuenta_iva\(/);
    expect(H1).toMatch(/if v_veces <> 1 then\s+raise exception/);
  });

  it('sin subcuenta: pendiente contable visible (cuenta_no_configurada con el motivo) y sin asiento', () => {
    const cuenta = reemplazos(H1).find((p) => p.etiqueta === 'fn_create_journal_entry/cuenta')?.nuevo ?? '';
    expect(cuenta).toMatch(/'cuenta_no_configurada',[\s\S]*e->>'motivo'[\s\S]*return null;/);
    const guarda = reemplazos(H1).find((p) => p.etiqueta === 'fn_nc_asiento_devolucion/guarda')?.nuevo ?? '';
    // La guarda va ANTES de crear la cabecera del asiento.
    expect(guarda.indexOf("'cuenta_no_configurada'")).toBeLessThan(guarda.indexOf('insert into public.journal_entries'));
    expect(H1).toContain("format('Falta la subcuenta de IVA %s al %s %%");
  });

  it('no reescribe asientos: ni UPDATE ni DELETE sobre journal_entries / journal_lines', () => {
    expect(H1).not.toMatch(/update\s+public\.journal_(entries|lines)/i);
    expect(H1).not.toMatch(/delete\s+from\s+public\.journal_(entries|lines)/i);
    expect(H1).not.toMatch(/app\.contabilidad_mantenimiento/);
  });

  it('la reversión restaura fn_cuenta_iva y borra las funciones nuevas', () => {
    expect(H1_REV).toContain('order by tam.updated_at desc nulls last, tam.id desc');
    for (const f of ['fn_iva_reparto', 'fn_iva_pesos_por_tarifa', 'fn_cuenta_iva_tarifa', 'fn_iva_lado']) {
      expect(H1_REV).toMatch(new RegExp(`drop function if exists public\\.${f}\\(`));
    }
    expect(H1_REV).toMatch(/NO revierte datos/);
  });
});

describe('H2 · responsabilidades del RUT por vigencia', () => {
  it('lee la vigencia que rige en la fecha y cae a la ficha de la organización', () => {
    expect(H2).toContain('p.vigente_desde <= org.dia');
    expect(H2).toContain('(p.vigente_hasta is null or p.vigente_hasta >= org.dia)');
    expect(H2).toContain('(select org.fiscal_responsibilities from org)');
    expect(H2).toMatch(/security invoker/);
    expect(H2).not.toMatch(/security definer/i);
    expect(H2).toContain('revoke all on function public.fn_responsabilidades_fiscales_en(integer, date) from public, anon;');
    expect(H2_REV).toContain('drop function if exists public.fn_responsabilidades_fiscales_en(integer, date);');
  });
});

describe('repositorio público', () => {
  it('las migraciones, reversiones y pruebas no traen credenciales', () => {
    const pruebas = leer('docs/contador/pruebas/07_iva_subcuenta_por_tarifa.sql');
    for (const sql of [H1, H1_REV, H2, H2_REV, pruebas]) {
      expect(sql).not.toMatch(/service_role_key|eyJhbGciOi|sk_live|password\s*=\s*'/i);
    }
  });
});
