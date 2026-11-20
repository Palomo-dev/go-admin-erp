/**
 * Cargos de servicio v2 (Figma 1088:714506): estado con archivo, filtros que
 * incluyen los globales, avisos de las decisiones 2 y 3 del 2026-09-24, vista
 * previa del recibo e impuesto del cargo (migración 20261120180425).
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  estadoCargo,
  filtrarCargos,
  FILTROS_CARGO_INICIALES,
  pareceFlete,
  pareceUnaPropina,
  resumirCargos,
  validarFormularioCargo,
  vistaPreviaCargo,
  type FormularioCargo,
} from '../cargosVista';
import { cambiosParaActualizar, codigoErrorCargo, dividirLineaCsv, filaParaInsertar, parsearCsvCargos } from '../cargosLogica';
import type { ServiceCharge } from '../types';

function cargo(p: Partial<ServiceCharge>): ServiceCharge {
  return {
    id: 1,
    organization_id: 120,
    name: 'Servicio',
    charge_type: 'percentage',
    charge_value: 10,
    applies_to: 'dine_in',
    is_taxable: false,
    is_optional: false,
    is_active: true,
    created_at: '',
    updated_at: '',
    ...p,
  };
}

const FORM: FormularioCargo = {
  name: 'Servicio mesa grande',
  charge_type: 'percentage',
  charge_value: 10,
  tax_id: 'imp',
  applies_to: 'dine_in',
  min_guests: 8,
  min_amount: null,
  branch_id: null,
  is_optional: false,
};

describe('estado y filtros', () => {
  const lista = [
    cargo({ id: 1, name: 'Mesa', applies_to: 'dine_in' }),
    cargo({ id: 2, name: 'Global', applies_to: 'all', is_optional: true }),
    cargo({ id: 3, name: 'Domicilio', applies_to: 'delivery', is_active: false }),
    cargo({ id: 4, name: 'Viejo', archived_at: '2026-11-01T00:00:00Z', is_active: false }),
  ];

  it('archivado manda sobre activo/inactivo', () => {
    expect(estadoCargo({ is_active: true, archived_at: 'x' })).toBe('archivado');
    expect(estadoCargo({ is_active: false, archived_at: null })).toBe('inactivo');
  });

  it('«Todos» no trae archivados; «Archivados» solo ellos', () => {
    expect(filtrarCargos(lista, FILTROS_CARGO_INICIALES).map((c) => c.id)).toEqual([1, 2, 3]);
    expect(filtrarCargos(lista, { ...FILTROS_CARGO_INICIALES, estado: 'archivados' }).map((c) => c.id)).toEqual([4]);
    expect(filtrarCargos(lista, { ...FILTROS_CARGO_INICIALES, estado: 'inactivos' }).map((c) => c.id)).toEqual([3]);
  });

  it('el filtro «Aplica a» incluye los cargos globales', () => {
    expect(filtrarCargos(lista, { ...FILTROS_CARGO_INICIALES, aplicaA: 'delivery' }).map((c) => c.id)).toEqual([2, 3]);
  });

  it('cobro y búsqueda sin tildes', () => {
    expect(filtrarCargos(lista, { ...FILTROS_CARGO_INICIALES, cobro: 'opcional' }).map((c) => c.id)).toEqual([2]);
    expect(filtrarCargos([cargo({ name: 'Servicio de MESÓN' })], { ...FILTROS_CARGO_INICIALES, q: 'meson' })).toHaveLength(1);
  });

  it('el resumen cuenta sin archivados', () => {
    expect(resumirCargos(lista)).toEqual({ total: 3, activos: 2, inactivos: 1, archivados: 1 });
  });
});

describe('formulario', () => {
  it('valida nombre, valor y tope del porcentaje', () => {
    expect(validarFormularioCargo(FORM)).toEqual({});
    expect(validarFormularioCargo({ ...FORM, name: ' ', charge_value: null })).toEqual({ name: 'nombre', charge_value: 'valor' });
    expect(validarFormularioCargo({ ...FORM, charge_value: 120 })).toEqual({ charge_value: 'porcentajeMaximo' });
    expect(validarFormularioCargo({ ...FORM, charge_type: 'fixed_amount', charge_value: 120000 })).toEqual({});
  });

  it('decisión 2: avisa si parece una propina', () => {
    expect(pareceUnaPropina(FORM)).toBe(false);
    expect(pareceUnaPropina({ ...FORM, is_optional: true, tax_id: null })).toBe(true);
    expect(pareceUnaPropina({ ...FORM, name: 'Propina sugerida 10 %' })).toBe(true);
    expect(pareceUnaPropina({ ...FORM, is_optional: true, charge_type: 'fixed_amount', tax_id: null })).toBe(false);
  });

  it('decisión 3: avisa si un cargo fijo de domicilio sin impuesto parece el flete', () => {
    expect(pareceFlete({ charge_type: 'fixed_amount', applies_to: 'delivery', tax_id: null })).toBe(true);
    expect(pareceFlete({ charge_type: 'fixed_amount', applies_to: 'delivery', tax_id: 'iva' })).toBe(false);
    expect(pareceFlete({ charge_type: 'percentage', applies_to: 'delivery', tax_id: null })).toBe(false);
  });
});

describe('vista previa del recibo', () => {
  it('reproduce el ejemplo del Figma: 10 % + Impoconsumo 8 % sobre productos y cargo', () => {
    const v = vistaPreviaCargo({ ...FORM, min_amount: 162000 }, 8);
    expect(v).toEqual({ subtotal: 162000, comensales: 8, cargo: 16200, impuesto: 14256, total: 192456 });
  });

  it('el subtotal de ejemplo cumple las condiciones del cargo', () => {
    expect(vistaPreviaCargo({ ...FORM, min_guests: 8 }, null).subtotal).toBe(160000);
    expect(vistaPreviaCargo({ ...FORM, min_guests: null }, null).subtotal).toBe(100000);
  });

  it('monto fijo y sin impuesto', () => {
    expect(vistaPreviaCargo({ charge_type: 'fixed_amount', charge_value: 5000, min_guests: null, min_amount: 30000 }, null)).toEqual({
      subtotal: 100000, comensales: null, cargo: 5000, impuesto: 0, total: 105000,
    });
  });
});

describe('impuesto del cargo en la escritura', () => {
  it('insertar y actualizar mandan tax_id y nunca is_taxable (lo deriva la base)', () => {
    const fila = filaParaInsertar({ name: 'X', charge_type: 'percentage', charge_value: 10, applies_to: 'all', is_optional: false, is_taxable: true, tax_id: 'abc' });
    expect(fila).toMatchObject({ tax_id: 'abc' });
    expect(fila).not.toHaveProperty('is_taxable');
    expect(cambiosParaActualizar({ tax_id: null })).toEqual({ tax_id: null });
    expect(cambiosParaActualizar({ is_taxable: true } as never)).toEqual({});
  });

  it('el impuesto de otra organización se traduce', () => {
    expect(codigoErrorCargo({ code: '23514', message: 'El impuesto del cargo no es de esta organización' })).toBe('IMPUESTO_INVALIDO');
  });

  it('la migración deriva is_taxable de tax_id y valida la organización del impuesto', () => {
    const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261120180425_pos_cargos_servicio_impuesto_y_archivo.sql'), 'utf8');
    expect(sql).toMatch(/new\.is_taxable := new\.tax_id is not null/);
    expect(sql).toMatch(/t\.organization_id = new\.organization_id/);
    expect(fs.existsSync(path.join(process.cwd(), 'supabase/rollbacks/20261120180425_pos_cargos_servicio_impuesto_y_archivo_rollback.sql'))).toBe(true);
  });
});

describe('CSV', () => {
  it('respeta las comas entre comillas', () => {
    expect(dividirLineaCsv('"Servicio, mesa grande",percentage,10')).toEqual(['Servicio, mesa grande', 'percentage', '10']);
    expect(dividirLineaCsv('"Dice ""hola""",fixed,1')).toEqual(['Dice "hola"', 'fixed', '1']);
    const r = parsearCsvCargos('name,charge_type,charge_value\n"Servicio, mesa",percentage,10');
    expect(r.filas[0].datos.name).toBe('Servicio, mesa');
  });
});
