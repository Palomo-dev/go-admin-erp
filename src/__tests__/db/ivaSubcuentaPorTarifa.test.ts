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
const B5 = leer('supabase/migrations/20261108152000_iva_no_descontable_al_costo.sql');
const B5_REV = leer('supabase/rollbacks/20261108152000_iva_no_descontable_al_costo_rollback.sql');
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

  it('ronda 2 · A1: la tarifa no identificada nunca se asume al 19 % (cuenta NULL → pendiente visible)', () => {
    const cuenta = H1.slice(H1.indexOf('create or replace function public.fn_cuenta_iva_tarifa'), H1.indexOf('-- ── 3.'));
    expect(cuenta).toContain('v_tarifa numeric := round(nullif(p_tarifa, 0), 2);');
    expect(cuenta).toMatch(/if v_tarifa is null then\s+return null;/);
    expect(cuenta).not.toMatch(/coalesce\(round\(nullif\(p_tarifa, 0\), 2\), 19\)/);
    const reparto = H1.slice(H1.indexOf('create or replace function public.fn_iva_reparto'), H1.indexOf('-- ── 5.'));
    expect(reparto).not.toMatch(/coalesce\(w\.tarifa, 19\)/);
    expect(reparto).toContain("format('Tarifa de IVA no identificada: el documento no tiene líneas");
    expect(reparto).toContain("format('Tarifa de IVA no identificada en %s de IVA %s");
    expect(reparto).toMatch(/if v_f\.tarifa is null then[\s\S]*cuenta := null;/);
  });

  it('ronda 2 · A2: la nota crédito sin líneas no se reparte por la mezcla de la factura', () => {
    const pesos = H1.slice(H1.indexOf('create or replace function public.fn_iva_pesos_por_tarifa'), H1.indexOf('-- ── 4.'));
    // Total → composición exacta; factura de una tarifa → esa; cualquier otro caso → tarifa NULL (pendiente).
    expect(pesos).toContain("then 'total'");
    expect(pesos).toContain("then 'unica'");
    expect(pesos).toContain("select null::numeric, v_iva_doc from modo where modo.m = 'ninguno'");
    expect(pesos).not.toContain('(select count(*) from m) <> 1');
  });

  it('ronda 3: «una sola tarifa» no basta si la factura tiene conceptos sin IVA (excluidos, exentos, no gravados) o INC', () => {
    const pesos = H1.slice(H1.indexOf('create or replace function public.fn_iva_pesos_por_tarifa'), H1.indexOf('-- ── 4.'));
    expect(pesos).toContain('sin_iva as (');
    expect(pesos).toContain("or upper(coalesce(it.tax_code, '')) like 'INC%'");
    expect(pesos).toContain("when (select count(distinct w.tarifa) from w) = 1 and not (select sin_iva.hay from sin_iva) then 'unica'");
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

describe('B5 · IVA no descontable determinado antes de contabilizar → al costo (ronda 3)', () => {
  it('solo cuenta la evaluación anterior al primer asiento del documento (no reescribe históricos)', () => {
    expect(B5).toContain('and je.created_at < it.iva_descontable_evaluado_en) then 1');
    expect(B5).not.toMatch(/update\s+public\.journal_(entries|lines)/i);
    expect(B5).not.toMatch(/delete\s+from\s+public\.journal_(entries|lines)/i);
  });

  it('las funciones nuevas nacen cerradas a anon', () => {
    for (const firma of [
      'fn_iva_factor_descontable_linea(uuid)',
      'fn_iva_no_descontable_linea(uuid)',
      'fn_iva_no_descontable_documento(text, uuid)',
      'fn_iva_no_descontable_cuenta_unica_fallo(uuid, text)',
    ]) {
      expect(B5).toContain(`revoke all on function public.${firma} from public, anon;`);
      expect(B5_REV).toContain(`drop function if exists public.${firma};`);
    }
    expect(B5).not.toMatch(/security definer/i);
  });

  it('cada llamador cambia por reemplazo verificado y la reversión es el inverso exacto', () => {
    const ida = reemplazos(B5);
    const vuelta = reemplazos(B5_REV);
    expect(ida.map((p) => p.etiqueta)).toEqual([
      'fn_iva_pesos_por_tarifa/factor',
      'fn_iva_pesos_por_tarifa/base',
      'fn_iva_pesos_por_tarifa/suma',
      'fn_armar_asiento_documento/declare',
      'fn_armar_asiento_documento/no_descontable',
      'fn_armar_asiento_documento/reparto',
      'fn_armar_asiento_documento/linea',
      'fn_armar_asiento_documento/bucle',
      'fn_armar_asiento_documento/parte',
      'fn_auto_journal_purchase/declare',
      'fn_auto_journal_purchase/no_descontable',
      'fn_auto_journal_purchase/pendiente',
    ]);
    expect(vuelta).toHaveLength(ida.length);
    for (const p of ida) {
      const inverso = vuelta.find((v) => v.etiqueta === `${p.etiqueta} (reversión)`);
      expect(inverso?.viejo).toBe(p.nuevo);
      expect(inverso?.nuevo).toBe(p.viejo);
    }
  });

  it('ronda 4: datos inconsistentes dejan el documento pendiente de corregir, sin asiento (nunca todo a la 2408)', () => {
    // Asiento por líneas: ok=false con el motivo (la bandeja de pendientes contables lo muestra).
    expect(B5).toMatch(/if v_nd > v_tax or v_nd > v_total then\s+return jsonb_build_object\('ok', false, 'fallo',/);
    // Asiento de cabecera: pendiente 'iva_no_descontable_por_corregir' y ningún fn_create_journal_entry.
    expect(B5).toContain("'iva_no_descontable_por_corregir', v_nd_fallo);");
    expect(B5).toMatch(/elsif v_nd_fallo is not null then[\s\S]*?fn_log_journal_failure[\s\S]*?else\s+v_entry_id := fn_create_journal_entry\(/);
    // Ya no existe el «si no cuadra, todo a la 2408» de la ronda 3.
    expect(B5).not.toMatch(/if v_nd > v_tax then\s+v_nd := 0;/);
    expect(B5).not.toMatch(/then\s+v_nd := 0;\s+end if;\s+v_inc := v_inc \+ v_nd;/);
  });

  it('ronda 4: sin cuenta única de cabecera cuando las líneas son de activos o gastos distintos', () => {
    expect(B5).toContain('v_nd_fallo := public.fn_iva_no_descontable_cuenta_unica_fallo(new.id, v_debito);');
    expect(B5).toMatch(/count\(distinct l\.tipo\) from l\) > 1/);
    expect(B5).toContain("coalesce(p_cuenta_cabecera, '') like '14%' and exists (select 1 from l where l.tipo = 'servicios')");
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
    for (const sql of [H1, H1_REV, H2, H2_REV, B5, B5_REV, pruebas]) {
      expect(sql).not.toMatch(/service_role_key|eyJhbGciOi|sk_live|password\s*=\s*'/i);
    }
  });
});
