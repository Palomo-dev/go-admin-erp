/**
 * «Oportunidad con productos y servicios» (Figma 1764:134618): el cálculo
 * único de líneas (variante + modificadores, servicios por tipo, hospedaje
 * por tipo de habitación y conceptos), sus totales con impuestos, el cuerpo
 * que va a la RPC, la plantilla del lote y los pasos de «Ganar» que salen de
 * las líneas.
 */
import { oportunidadAltaSchema } from '@/lib/services/crm/opportunityWriteService';
import { accionesEfectivas, accionesIniciales } from '@/components/crm/kit/winDialogLogica';
import {
  agregarProducto,
  conteoFiltros,
  cuerpoLineas,
  faltanteStock,
  LINEAS_VACIAS,
  lineasDesdeApi,
  lineasParaLote,
  lineasValidas,
  tasaDeImpuestos,
  totalesLineas,
  type Lineas,
} from '../lineasLogica';
import { pasosDeLineas } from '../lineas/ganarDeLineas';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/utils/orgContext', () => ({ getServerOrgContext: jest.fn() }));
jest.mock('@/lib/services/crm/leadAutoAssign', () => ({ autoAssignLead: jest.fn() }));

const camiseta = {
  product_id: 501,
  nombre: 'Camiseta polo bordada',
  sku: 'POL-BOR-M-AZ',
  variante: 'M · Azul',
  quantity: 24,
  unit_price: 74_500,
  modifiers: [
    { modifier_id: 1, group_id: 9, name: 'Bordado de logo', extra_price: 8_000 },
    { modifier_id: 2, group_id: 10, name: 'Empaque individual', extra_price: 1_500 },
  ],
  controla_stock: true,
  tasa_impuesto: 19,
};
const membresia = { product_id: 600, nombre: 'Membresía anual corporativa', quantity: 1, unit_price: 1_200_000, es_servicio: true, tipo_servicio: 'membership' as const, service_config: { start_date: '2026-11-01', plan_name: 'Anual', periods: 1 }, tasa_impuesto: 19 };
const suite = { space_type_id: '00000000-0000-4000-8000-000000000001', branch_id: 7, nombre: 'Suite junior', nights: 3, unit_price: 550_000, checkin_date: '2026-11-12', checkout_date: '2026-11-15', adults: 2, children: 1, rate_plan: 'Desayuno incluido' };
const lineas: Lineas = { products: [camiseta, membresia], spaces: [suite], custom: [{ concept: 'Transporte del material', quantity: 1, unit_price: 250_000 }] };

describe('totales con impuestos y filtros (TotalesLineas, Figma 16)', () => {
  it('subtotal, IVA de cada producto (hospedaje y conceptos sin impuesto aquí) y total', () => {
    const t = totalesLineas(lineas);
    expect(t.subtotal).toBe(1_788_000 + 1_200_000 + 1_650_000 + 250_000);
    expect(t.impuestos).toBe(Math.round((1_788_000 + 1_200_000) * 0.19 * 100) / 100);
    expect(t.total).toBe(t.subtotal + t.impuestos);
    expect(t.tasaUnica).toBe(19);
    expect(conteoFiltros(lineas)).toEqual({ todas: 4, productos: 1, servicios: 1, hospedaje: 1, conceptos: 1 });
  });

  it('la tarifa del producto suma sus impuestos activos y deja fuera las retenciones', () => {
    expect(
      tasaDeImpuestos([
        { organization_taxes: { rate: 19, kind: 'tax', is_active: true } },
        { organization_taxes: [{ rate: 2.5, kind: 'withholding', is_active: true }] },
        { organization_taxes: { rate: 8, kind: 'tax', is_active: false } },
        { organization_taxes: { rate: 4, kind: null, tax_templates: { code: 'RETE_4' } } },
      ]),
    ).toBe(19);
  });
});

describe('cuerpo de la RPC (fn_crm_opp_lineas_aplicar)', () => {
  it('modificadores, configuración del servicio, notas y hospedaje por tipo; sin ids al copiar', () => {
    const c = cuerpoLineas({ ...lineas, products: [{ ...camiseta, id: 'l1', notes: ' Según manual ' }, membresia] });
    expect(c.products[0]).toEqual({ id: 'l1', product_id: 501, quantity: 24, unit_price: 74_500, modifiers: camiseta.modifiers, notes: 'Según manual' });
    expect(c.products[1]).toMatchObject({ product_id: 600, service_config: { start_date: '2026-11-01', plan_name: 'Anual', periods: 1 } });
    expect(c.spaces[0]).toEqual({ space_type_id: suite.space_type_id, nights: 3, unit_price: 550_000, checkin_date: '2026-11-12', checkout_date: '2026-11-15', adults: 2, children: 1, rate_plan: 'Desayuno incluido', branch_id: 7 });
    expect(JSON.stringify(cuerpoLineas({ ...lineas, products: [{ ...camiseta, id: 'l1' }] }, { sinIds: true }))).not.toContain('"id"');
  });

  it('el esquema del servidor acepta la línea nueva y rechaza hospedaje sin tipo ni habitación o con fechas al revés', () => {
    const base = { name: 'Convenio' };
    expect(oportunidadAltaSchema.safeParse({ ...base, ...cuerpoLineas(lineas) }).success).toBe(true);
    expect(oportunidadAltaSchema.safeParse({ ...base, spaces: [{ nights: 1, unit_price: 0 }] }).success).toBe(false);
    expect(oportunidadAltaSchema.safeParse({ ...base, spaces: [{ space_type_id: suite.space_type_id, checkin_date: '2026-11-15', checkout_date: '2026-11-12' }] }).success).toBe(false);
    expect(oportunidadAltaSchema.safeParse({ ...base, products: [{ product_id: 1, modifiers: [{ modifier_id: 0 }] }] }).success).toBe(false);
  });

  it('la misma variante con los mismos modificadores suma cantidad; con otros, es otra línea', () => {
    const una = agregarProducto(LINEAS_VACIAS, camiseta);
    expect(agregarProducto(una, { ...camiseta, quantity: 6 }).products).toHaveLength(1);
    expect(agregarProducto(una, { ...camiseta, quantity: 6 }).products[0].quantity).toBe(30);
    expect(agregarProducto(una, { ...camiseta, modifiers: [] }).products).toHaveLength(2);
  });

  it('lote: mismas líneas para todos y sin hospedaje; validez de las líneas', () => {
    expect(lineasParaLote(lineas).spaces).toEqual([]);
    expect(lineasParaLote(lineas).products).toHaveLength(2);
    expect(lineasValidas(lineas)).toBe(true);
    expect(lineasValidas({ ...lineas, spaces: [{ ...suite, checkout_date: null }] })).toBe(false);
  });

  it('aviso de stock solo en productos que controlan stock', () => {
    expect(faltanteStock({ quantity: 24, controla_stock: true }, 18)).toBe(6);
    expect(faltanteStock({ quantity: 24, controla_stock: false }, 0)).toBe(0);
    expect(faltanteStock({ quantity: 2, controla_stock: true }, null)).toBe(0);
  });
});

describe('lectura del detalle (GET /api/crm/opportunities/[id])', () => {
  it('modificadores, servicio, impuestos, hospedaje y orden de alta', () => {
    const l = lineasDesdeApi({
      opportunity_products: [
        { id: 'b', product_id: 600, quantity: 1, unit_price: 1_200_000, created_at: '2026-11-02', service_config: { start_date: '2026-11-01' }, producto: { name: 'Membresía', product_type: 'service', service_type: 'membership' } },
        { id: 'a', product_id: 501, quantity: '24', unit_price: '74500', created_at: '2026-11-01', modifiers: [{ modifier_id: '1', name: 'Bordado', extra_price: '8000' }, { name: 'sin id' }], producto: { name: 'Camiseta', sku: 'POL', track_stock: true, variant_data: { talla: 'M', color: 'Azul' }, product_tax_relations: [{ organization_taxes: { rate: 19, kind: 'tax', is_active: true } }] } },
      ],
      opportunity_spaces: [{ id: 's', space_id: null, space_type_id: 't', nights: 3, unit_price: 550_000, branch_id: 7, checkin_date: '2026-11-12', checkout_date: '2026-11-15', adults: 2, children: 1, rate_plan: null, tipo: { name: 'Suite junior' } }],
      opportunity_custom_lines: [],
    });
    expect(l.products.map((x) => x.id)).toEqual(['a', 'b']);
    expect(l.products[0]).toMatchObject({ variante: 'M · Azul', quantity: 24, unit_price: 74_500, tasa_impuesto: 19, controla_stock: true, modifiers: [{ modifier_id: 1, name: 'Bordado', extra_price: 8_000 }] });
    expect(l.products[1]).toMatchObject({ es_servicio: true, tipo_servicio: 'membership', service_config: { start_date: '2026-11-01' } });
    expect(l.spaces[0]).toMatchObject({ space_id: null, space_type_id: 't', nombre: 'Suite junior', branch_id: 7, adults: 2 });
  });
});

describe('«Ganar» con pasos derivados de las líneas (Figma 1787:900392)', () => {
  const tx = (k: string) => k;
  const fmt = { fecha: (d: string) => d, instante: (d: string) => d, rango: (a: string, b: string) => `${a}–${b}` };
  it('solo los pasos que piden las líneas; renovación sin marcar; emitir depende de la factura', () => {
    const clase = { product_id: 700, nombre: 'Funcional', quantity: 1, unit_price: 180_000, es_servicio: true, tipo_servicio: 'class' as const, service_config: { gym_class_id: 3, class_title: 'Funcional', class_start: '2026-11-17T23:00:00Z' } };
    const pasos = pasosDeLineas({ ...lineas, products: [...lineas.products, clase] }, tx, fmt, 'Cliente');
    expect(pasos.map((p) => p.accion)).toEqual(['factura', 'emitir', 'membresia', 'reserva', 'cupo', 'onboarding', 'renovacion']);
    expect(accionesIniciales(pasos)).toEqual(['factura', 'emitir', 'membresia', 'reserva', 'cupo', 'onboarding']);
    expect(accionesEfectivas(['emitir', 'membresia', 'onboarding'], pasos)).toEqual(['onboarding']);
    expect(pasosDeLineas({ products: [], spaces: [suite], custom: [] }, tx, fmt, null).map((p) => p.accion)).toEqual(['reserva', 'onboarding', 'renovacion']);
  });
});
