/**
 * Cupones v2: formulario (vaciar campos al editar, código en mayúsculas),
 * lote (prefijo, cantidad, ejemplos y CSV), vigencia y errores de la base
 * (migración 20261120181551).
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  ALFABETO_CODIGO,
  avisoVigencia,
  cambiosCupon,
  codigoAlAzar,
  codigoErrorCupon,
  csvLote,
  datosDelFormulario,
  diasEntre,
  ejemplosLote,
  normalizarPrefijo,
  usosRestantes,
  validarFormularioCupon,
  validarLote,
  type FormularioCupon,
} from '../cuponesVista';
import { DISCOUNT_TYPES } from '../types';

const FORM: FormularioCupon = {
  code: 'bienvenida10',
  name: ' Bienvenida ',
  discount_type: 'percentage',
  discount_value: 10,
  max_discount_amount: 30000,
  min_purchase_amount: 50000,
  start_date: '2026-01-01',
  end_date: null,
  usage_limit: 500,
  usage_limit_per_customer: 1,
  applies_to_first_purchase: true,
  customer_id: null,
  promotion_id: null,
  is_active: true,
};

describe('tipo de descuento', () => {
  it('el monto fijo es fixed_amount, como el CHECK de la base', () => {
    expect([...DISCOUNT_TYPES]).toEqual(['percentage', 'fixed_amount']);
  });
});

describe('formulario', () => {
  it('valida código, valor, vigencia y usos por cliente', () => {
    expect(validarFormularioCupon(FORM)).toEqual({});
    expect(validarFormularioCupon({ ...FORM, code: ' ' })).toEqual({ code: 'codigoVacio' });
    expect(validarFormularioCupon({ ...FORM, code: 'con espacio' })).toEqual({ code: 'codigoFormato' });
    expect(validarFormularioCupon({ ...FORM, discount_value: 150 })).toEqual({ discount_value: 'porcentajeMaximo' });
    expect(validarFormularioCupon({ ...FORM, end_date: '2025-12-31' })).toEqual({ end_date: 'vigencia' });
    expect(validarFormularioCupon({ ...FORM, usage_limit: 1, usage_limit_per_customer: 2 })).toEqual({ usage_limit_per_customer: 'usosCliente' });
  });

  it('código en mayúsculas, tope solo con porcentaje y vacíos como null', () => {
    const d = datosDelFormulario(FORM);
    expect(d.code).toBe('BIENVENIDA10');
    expect(d.name).toBe('Bienvenida');
    expect(d.max_discount_amount).toBe(30000);
    expect(datosDelFormulario({ ...FORM, discount_type: 'fixed_amount', discount_value: 5000 }).max_discount_amount).toBeNull();
    const vacio = datosDelFormulario({ ...FORM, min_purchase_amount: null, usage_limit: 0, end_date: null });
    expect(vacio).toMatchObject({ min_purchase_amount: null, usage_limit: null, end_date: null });
  });

  it('al editar, las claves vacías viajan como null (antes no se podían vaciar)', () => {
    expect(cambiosCupon({ min_purchase_amount: undefined, end_date: '', code: ' x1 ' })).toEqual({ min_purchase_amount: null, end_date: null, code: 'X1' });
  });
});

describe('lote', () => {
  it('prefijo de letras y números, en mayúsculas', () => {
    expect(normalizarPrefijo('fe-ria 2026!')).toBe('FERIA2026');
    expect(validarLote({ prefijo: '', cantidad: 10, discount_type: 'percentage', discount_value: 10 })).toEqual({ prefijo: 'prefijo' });
    expect(validarLote({ prefijo: 'FERIA', cantidad: 5001, discount_type: 'percentage', discount_value: 10 })).toEqual({ cantidad: 'cantidad' });
    expect(validarLote({ prefijo: 'FERIA', cantidad: 200, discount_type: 'percentage', discount_value: null })).toEqual({ discount_value: 'valor' });
    expect(validarLote({ prefijo: 'FERIA', cantidad: 200, discount_type: 'fixed_amount', discount_value: 5000, start_date: '2026-10-15', end_date: '2026-10-01' })).toEqual({ end_date: 'vigencia' });
  });

  it('los ejemplos tienen el formato real: PREFIJO-6 caracteres sin 0/O/1/I', () => {
    for (const c of ejemplosLote('feria')) expect(c).toMatch(/^FERIA-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
    expect(ALFABETO_CODIGO).not.toMatch(/[01OI]/);
    expect(codigoAlAzar('', () => 0)).toBe('22222222');
  });

  it('CSV del lote con encabezado y una fila por código', () => {
    expect(csvLote(['FERIA-8QX2K7', 'FERIA-M3T9PA'])).toBe('code\nFERIA-8QX2K7\nFERIA-M3T9PA\n');
  });
});

describe('usos y vigencia', () => {
  it('usos restantes', () => {
    expect(usosRestantes({ usage_limit: 100, usage_count: 18 })).toBe(82);
    expect(usosRestantes({ usage_limit: null, usage_count: 5 })).toBeNull();
    expect(usosRestantes({ usage_limit: 1, usage_count: 3 })).toBe(0);
  });

  it('días entre días calendario, sin depender de la zona del equipo', () => {
    expect(diasEntre('2026-09-28', '2026-09-30')).toBe(2);
    expect(diasEntre('2026-12-31', '2027-01-01')).toBe(1);
  });

  it('avisa «vence en» hasta 7 días y «empieza en» si está programado', () => {
    expect(avisoVigencia('activo', '2026-09-28', null, '2026-09-30')).toEqual({ tipo: 'vence', dias: 2 });
    expect(avisoVigencia('activo', '2026-09-01', null, '2026-09-30')).toBeNull();
    expect(avisoVigencia('programado', '2026-09-28', '2026-10-01', null)).toEqual({ tipo: 'empieza', dias: 3 });
    expect(avisoVigencia('vencido', '2026-10-01', null, '2026-09-30')).toBeNull();
  });
});

describe('errores de la base', () => {
  it('traduce permisos, duplicados y validaciones del lote', () => {
    expect(codigoErrorCupon({ code: '42501', message: 'Sin permiso para gestionar cupones' })).toBe('SIN_PERMISO');
    expect(codigoErrorCupon({ code: '23505', message: 'duplicate key value violates unique constraint "uk_coupons_org_code_ci"' })).toBe('CODIGO_DUPLICADO');
    expect(codigoErrorCupon({ code: '22023', message: 'prefijo_invalido' })).toBe('PREFIJO_INVALIDO');
    expect(codigoErrorCupon({ code: '22023', message: 'cantidad_invalida' })).toBe('CANTIDAD_INVALIDA');
    expect(codigoErrorCupon({ code: 'P0002', message: 'Cupón no encontrado' })).toBe('NO_ENCONTRADO');
  });
});

describe('migración', () => {
  const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261120181551_pos_cupones_lote_estado_canjes.sql'), 'utf8');

  it('unicidad sin distinguir mayúsculas y lote sin colisiones', () => {
    expect(sql).toMatch(/create unique index if not exists uk_coupons_org_code_ci on public\.coupons \(organization_id, lower\(code\)\)/);
    expect(sql).toMatch(/on conflict \(organization_id, lower\(code\)\) do nothing/);
    expect(sql).toMatch(/pg_advisory_xact_lock/);
  });

  it('el lote y la escritura exigen pos.cupones.gestionar; el canje (solo usage_count) no', () => {
    expect(sql).toMatch(/fn_tiene_permiso\(p_organization_id, 'pos\.cupones\.gestionar'\)/);
    expect(sql).toMatch(/- 'usage_count' - 'updated_at'\) = \(to_jsonb\(old\) - 'usage_count' - 'updated_at'\)/);
  });

  it('archivar en lugar de borrar: el cupón archivado queda inactivo', () => {
    expect(sql).toMatch(/if new\.archived_at is not null then\s+new\.is_active := false;/);
  });

  it('cada migración tiene su reversión', () => {
    for (const n of ['20261120181551_pos_cupones_lote_estado_canjes', '20261120182336_pos_cupones_estado_columna_calculada']) {
      expect(fs.existsSync(path.join(process.cwd(), `supabase/rollbacks/${n}_rollback.sql`))).toBe(true);
    }
  });
});

describe('textos', () => {
  it('posCupones y posCargos existen en los 4 idiomas con las mismas claves', () => {
    const claves = (o: unknown, p = ''): string[] =>
      o && typeof o === 'object' ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => claves(v, `${p}${k}.`)) : [p];
    const leer = (l: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), `messages/${l}.json`), 'utf8'));
    for (const ns of ['posCupones', 'posCargos']) {
      const base = claves(leer('es')[ns]).sort();
      expect(base.length).toBeGreaterThan(50);
      for (const l of ['en', 'fr', 'pt']) expect(claves(leer(l)[ns]).sort()).toEqual(base);
    }
  });
});
