/**
 * Ronda 6 del Contador, anticipos (docs/contador/RESPUESTAS-CONTADOR-RONDA-6-2026-11-10.md, respuestas 9 y 11):
 * reteIVA en exceso con el saldo en los dos períodos siguientes (DUR 1625 de 2016, art. 1.3.2.3.1: «aplicará el mismo
 * procedimiento»), anticipo de AIU sin costo directo pendiente hasta validar el contrato y la naturaleza del pago, y el
 * cierre del contrato con el piso del 10 % sobre su valor final. Lo que la migración (sin aplicar) no puede perder.
 * Prueba en seco: docs/contador/pruebas/29_anticipos_ronda6_contador.sql.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { codigoErrorAnticipo, estadoHttpErrorAnticipo } from '@/lib/finanzas/anticiposProveedor/contrato';

const leer = (r: string) => readFileSync(join(process.cwd(), r), 'utf8');
const sql = leer('supabase/migrations/20261108170000_anticipos_proveedores_contador.sql');
const codigo = sql.replace(/--.*$/gm, '');

describe('respuesta 9: reteIVA en exceso', () => {
  test('el saldo que no alcance va a los dos períodos siguientes, como en la anulación', () => {
    const reteiva = codigo.indexOf("elsif p_clase = 'reteiva' then", codigo.indexOf('create or replace function public.fn_retencion_periodo_descuento('));
    const exceso = codigo.slice(codigo.indexOf("if p_origen = 'exceso' then", reteiva), codigo.indexOf('else', codigo.indexOf("if p_origen = 'exceso' then", reteiva)));
    expect(reteiva).toBeGreaterThan(0);
    expect(exceso).toContain("v_saldo := 'dos_siguientes';");
    expect(exceso).toContain('el saldo, en los dos períodos siguientes');
    expect(codigo).not.toContain("'por_confirmar'");
  });

  test('siguen obligatorias la solicitud y la manifestación escritas', () => {
    expect(codigo).toMatch(/p_clase = 'reteiva' and length\(btrim\(coalesce\(v_sop ->> 'manifestacion_no_imputacion'/);
    expect(codigo).toContain("'solicitud_y_pruebas'");
  });
});

describe('respuesta 11: anticipo de AIU sin costo directo y cierre del contrato', () => {
  test('sin costo directo queda pendiente y no se le aplica el 10 % de todo el contrato', () => {
    expect(codigo).toContain("'aiu_anticipo_sin_costo_directo'");
    expect(codigo).toContain("if not v_sin_costo and v_deficit > 0.005 then");
    expect(codigo).toContain("'sin_costo_directo', v_sin_costo");
    expect(codigo).not.toMatch(/contrato_valor\s*\*\s*0\.10/);
  });

  test('su pendiente no se resuelve con el contrato sin validar', () => {
    expect(codigo).toContain("raise exception 'aiu_contrato_sin_validar'");
    expect(codigoErrorAnticipo('aiu_contrato_sin_validar')).toBe('aiu_contrato_sin_validar');
    expect(estadoHttpErrorAnticipo('aiu_contrato_sin_validar')).toBe(409);
  });

  test('cerrar el contrato exige el piso del 10 % sobre el valor final y ningún anticipo así pendiente', () => {
    expect(codigo).toContain('create or replace function public.fn_aiu_contrato_cerrar(p_contrato uuid, p_cierre jsonb, p_organization_id integer)');
    expect(codigo).toContain("'aiu_minimo_10_contrato_al_cierre'");
    expect(codigo).toContain("'aiu_cierre_con_anticipos_pendientes'");
    expect(codigo).toContain("when v_contrato.cerrado_en is not null then 'aiu_contrato_cerrado'");
    expect(codigo).toContain('revoke all on function public.fn_aiu_contrato_cerrar(uuid, jsonb, integer) from public, anon;');
  });

  test('la reversión borra la función nueva', () => {
    const rb = leer('supabase/rollbacks/20261108170000_anticipos_proveedores_contador_rollback.sql');
    expect(rb).toContain('drop function if exists public.fn_aiu_contrato_cerrar(uuid, jsonb, integer);');
  });

  test('sigue escrita y sin aplicar', () => {
    expect(sql).toMatch(/SIN APLICAR/);
  });
});
