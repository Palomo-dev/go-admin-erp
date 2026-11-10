/**
 * Ronda 5 del Contador, anticipos (docs/contador/RESPUESTAS-CONTADOR-RONDA-5-2026-11-09.md, respuestas 9, 12 y 13 y las
 * citas que corrige): período de la reteIVA en reversiones (DUR 1625 de 2016, art. 1.3.2.3.1), renta con los arts.
 * 1.2.4.8 (anulación) y 1.2.4.16 (exceso), reteIVA en exceso con la manifestación escrita de no imputación, excedente de
 * ReteICA sin límite de períodos con la solicitud escrita y piso del 10 % del AIU por operación y acumulado del
 * contrato. Lo que el cuerpo de la ruta exige y lo que la migración (sin aplicar) no puede perder.
 * Prueba en seco: docs/contador/pruebas/25_anticipos_ronda5_contador.sql.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { excesoRetencionSchema } from '@/lib/finanzas/anticiposProveedor/contrato';

const leer = (r: string) => readFileSync(join(process.cwd(), r), 'utf8');
const sql = leer('supabase/migrations/20261108170000_anticipos_proveedores_contador.sql');
const sinComentarios = (s: string) => s.replace(/--.*$/gm, '');

describe('reteIVA en exceso: solicitud escrita y manifestación escrita de no imputación (respuesta 9)', () => {
  const e = {
    clase: 'reteiva',
    base_correcta: 190000,
    tarifa_correcta: 10,
    metodo: 'transfer',
    motivo: 'Tarifa de reteIVA equivocada',
    soportes: { calculo: 'Cálculo', certificado: 'Certificado corregido', solicitud: 'Solicitud escrita del proveedor', pruebas: 'Factura y RUT' },
    requiere_correccion: false,
    clave_idempotencia: 'exceso:r5-0001',
  };

  test('sin la manifestación, el cuerpo se rechaza; con ella, pasa', () => {
    expect(excesoRetencionSchema.safeParse(e).success).toBe(false);
    expect(excesoRetencionSchema.safeParse({ ...e, soportes: { ...e.soportes, manifestacion_no_imputacion: 'x' } }).success).toBe(false);
    expect(excesoRetencionSchema.safeParse({ ...e, soportes: { ...e.soportes, manifestacion_no_imputacion: 'Manifestación escrita del proveedor' } }).success).toBe(true);
  });

  test('en renta no se exige (su procedimiento es el art. 1.2.4.16)', () => {
    expect(excesoRetencionSchema.safeParse({ ...e, clase: 'retefuente', tarifa_correcta: 2.5 }).success).toBe(true);
  });
});

describe('lo que la migración sin aplicar no puede perder (20261108170000)', () => {
  const codigo = sinComentarios(sql);

  test('las citas corregidas: anulación 1.2.4.8, exceso 1.2.4.16, reteIVA 1.3.2.3.1; ninguna cita al artículo retirado', () => {
    expect(codigo).toContain('DUR 1.2.4.8');
    expect(codigo).toContain('DUR 1.2.4.16');
    expect(codigo).toContain('DUR 1.3.2.3.1');
    expect(sql).not.toContain('1.2.4.17');
  });

  test('reteIVA anulada: el saldo solo en los dos períodos siguientes', () => {
    expect(codigo).toContain("'dos_siguientes'");
    expect(codigo).toMatch(/'limite_periodos', case p_per ->> 'saldo' when 'dos_siguientes' then 2 end/);
  });

  test('reteIVA en exceso: la manifestación de no imputación es obligatoria en la base', () => {
    expect(codigo).toMatch(/p_clase = 'reteiva' and length\(btrim\(coalesce\(v_sop ->> 'manifestacion_no_imputacion'/);
  });

  test('ReteICA: el excedente pendiente exige la solicitud escrita y no tiene límite de períodos', () => {
    expect(codigo).toContain('reteica_solicitud_escrita_obligatoria');
    expect(codigo).toContain("'siguientes_sin_limite'");
    expect(sql).not.toMatch(/seis\s+per[ií]odos|6\s+per[ií]odos/i);
  });

  test('AIU: el piso del 10 % se controla por operación y acumulado del contrato', () => {
    expect(codigo).toContain('fn_aiu_contrato_acumulado');
    expect(codigo).toContain('aiu_minimo_10_operacion');
    expect(codigo).toContain('aiu_minimo_10_contrato');
    expect(codigo).toContain('aiu_excede_valor_contrato');
  });

  test('sigue escrita y sin aplicar', () => {
    expect(sql).toMatch(/SIN APLICAR/);
  });
});
