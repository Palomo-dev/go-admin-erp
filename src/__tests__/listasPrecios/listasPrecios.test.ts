/**
 * Listas de precios por cliente — FASE 1 (Figma «05 POS y ventas» 3018:198730, 2026-11-24).
 *
 * Fija: la regla de precio por cantidad (la misma de `fn_lista_precios_por_cantidad`), cómo el
 * carrito aplica y quita la lista, el ahorro, el enganche con promociones «no aplica con listas»
 * (sobre el motor puro de verdad), la lectura del Excel/CSV, el contrato de las migraciones
 * (RPC cerrada a anon, guarda de pertenencia, rollback) y las traducciones en 4 idiomas.
 * Datos ficticios de la «org 120».
 */
import fs from 'fs';
import path from 'path';
import {
  ahorroPorLista,
  aplicarListaALineas,
  normalizarFilaPrecio,
  precioListaPorCantidad,
  subtotalPrecioNormal,
  type LineaConLista,
  type PrecioClienteFila,
} from '@/lib/listasPrecios/precioLista';
import { promocionesConListas } from '@/lib/listasPrecios/promocionesConLista';
import { leerCsv, normalizarNumero } from '@/lib/listasPrecios/archivoPrecios';
import { codigoErrorLista } from '@/lib/listasPrecios/tipos';
import { evaluarPromociones, type FilaPromocion } from '@/lib/promotions/motorPromociones';
import { cambiosAvanzados } from '@/components/pos/promociones/formulario/logicaFormulario';
import { GUIAS } from '@/lib/ai/agent/guias/guias';

const LISTA = '00000000-0000-4000-8000-0000000000a1';

const fila = (extra: Partial<PrecioClienteFila> = {}): PrecioClienteFila => ({
  product_id: 1,
  normal_price: 10000,
  list_price: 9000,
  price_list_id: LISTA,
  price_list_name: 'Mayoristas',
  source: 'item',
  rule_percent: -10,
  rule_label: null,
  rule_price: 9000,
  tiers: [],
  no_discount: false,
  ...extra,
});

describe('precio de lista por cantidad', () => {
  it('gana el escalón de mayor cantidad que se cumple; sin escalón, la regla', () => {
    const f = fila({ tiers: [{ min_qty: 1, price: 9000 }, { min_qty: 12, price: 8700 }, { min_qty: 48, price: 8400 }] });
    expect(precioListaPorCantidad(f, 1)?.precio).toBe(9000);
    expect(precioListaPorCantidad(f, 11)?.precio).toBe(9000);
    expect(precioListaPorCantidad(f, 12)).toMatchObject({ precio: 8700, minQty: 12, fuente: 'item' });
    expect(precioListaPorCantidad(f, 60)?.precio).toBe(8400);
  });

  it('un escalón que no se cumple cae a la regla en % (marca › categoría › general)', () => {
    const f = fila({ tiers: [{ min_qty: 12, price: 8700 }], source: 'category', rule_price: 8700 * 0 + 8700, rule_label: 'Bebidas', rule_percent: -13 });
    expect(precioListaPorCantidad(f, 3)).toMatchObject({ precio: 8700, fuente: 'category', etiqueta: 'Bebidas', porcentaje: -13, minQty: null });
  });

  it('«sin descuento», sin lista o sin regla: precio normal (null)', () => {
    expect(precioListaPorCantidad(fila({ no_discount: true, tiers: [] }), 1)).toBeNull();
    expect(precioListaPorCantidad(fila({ price_list_id: null }), 1)).toBeNull();
    expect(precioListaPorCantidad(fila({ rule_price: null, tiers: [] }), 1)).toBeNull();
    expect(precioListaPorCantidad(undefined, 1)).toBeNull();
  });

  it('normaliza la fila de PostgREST (numeric como texto, escalones desordenados)', () => {
    const f = normalizarFilaPrecio({
      product_id: '7', normal_price: '10000.00', list_price: '9000', price_list_id: LISTA, price_list_name: 'M',
      source: 'item', rule_percent: '-10.000', rule_label: null, rule_price: '9000', no_discount: false,
      tiers: [{ min_qty: '12', price: '8700' }, { min_qty: '1', price: '9000' }],
    });
    expect(f.product_id).toBe(7);
    expect(f.normal_price).toBe(10000);
    expect(f.tiers).toEqual([{ min_qty: 1, price: 9000 }, { min_qty: 12, price: 8700 }]);
  });
});

describe('carrito del POS', () => {
  const precios = new Map([[1, fila({ tiers: [{ min_qty: 1, price: 9000 }, { min_qty: 12, price: 8700 }] })]]);
  const linea = (extra: Partial<LineaConLista> = {}): LineaConLista => ({ product_id: 1, quantity: 2, unit_price: 10000, ...extra });

  it('aplica el precio de la lista y guarda el normal para tacharlo', () => {
    const [l] = aplicarListaALineas([linea()], precios, false);
    expect(l).toMatchObject({ unit_price: 9000, price_list_id: LISTA, price_list_name: 'Mayoristas', list_base_price: 10000 });
  });

  it('los extras de modificadores se suman a los dos precios', () => {
    const [l] = aplicarListaALineas([linea({ unit_price: 13000, modifiers: [{ extraPrice: 3000 }] })], precios, false);
    expect(l.unit_price).toBe(12000);
    expect(l.list_base_price).toBe(13000);
  });

  it('subir a 12 unidades toma el escalón', () => {
    const [l] = aplicarListaALineas([linea({ quantity: 12 })], precios, false);
    expect(l.unit_price).toBe(8700);
    expect(l.price_list_detail?.minQty).toBe(12);
  });

  it('«Usar precio normal» devuelve el normal y quita la marca', () => {
    const [con] = aplicarListaALineas([linea()], precios, false);
    const [sin] = aplicarListaALineas([con], precios, true);
    expect(sin).toMatchObject({ unit_price: 10000, price_list_id: null, list_base_price: null });
  });

  it('el descuento manual se topa en el nuevo bruto', () => {
    const [l] = aplicarListaALineas([linea({ quantity: 1, manual_discount_amount: 9500, discount_amount: 9500 })], precios, false);
    expect(l.manual_discount_amount).toBe(9000);
  });

  it('sin fila para el producto la línea no cambia', () => {
    const original = linea({ product_id: 99 });
    expect(aplicarListaALineas([original], precios, false)[0]).toBe(original);
  });

  it('ahorro y subtotal a precio normal (Figma 07)', () => {
    const ls = aplicarListaALineas([linea({ quantity: 12 }), linea({ product_id: 99, quantity: 1, unit_price: 5000 })], precios, false);
    expect(ahorroPorLista(ls)).toBe(12 * 1300);
    expect(subtotalPrecioNormal(ls)).toBe(12 * 10000 + 5000);
  });
});

describe('promociones «no aplica con listas» (decisión 1 del dueño)', () => {
  const base = (extra: Partial<FilaPromocion> = {}): FilaPromocion => ({
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Temporada',
    promotion_type: 'percentage',
    discount_value: 10,
    applies_to: 'all',
    start_date: '2026-01-01T00:00:00Z',
    end_date: null,
    is_active: true,
    usage_limit: null,
    usage_count: 0,
    is_combinable: false,
    priority: 0,
    created_at: '2026-01-01T00:00:00Z',
    branches: null,
    applicable_days: null,
    applies_to_pos: true,
    promotion_rules: [],
    ...extra,
  });
  const ctx = { canal: 'pos' as const, ahora: new Date('2026-11-24T15:00:00Z'), zonaHoraria: 'America/Bogota', sucursalId: 7 };
  const lineas = [
    { product_id: 1, quantity: 1, unit_price: 9000, price_list_id: LISTA },
    { product_id: 2, quantity: 1, unit_price: 10000, price_list_id: null },
  ];

  it('por defecto la promoción se calcula sobre el precio de lista (10 % de $ 9.000)', () => {
    const promos = promocionesConListas([base()], lineas);
    const r = evaluarPromociones(promos, lineas, ctx);
    expect(r.lineDiscounts).toEqual([900, 1000]);
  });

  it('con applies_with_price_lists = false la línea con lista paga su lista y la otra recibe la promoción', () => {
    const promos = promocionesConListas([{ ...base(), applies_with_price_lists: false } as FilaPromocion], lineas);
    const r = evaluarPromociones(promos, lineas, ctx);
    expect(r.lineDiscounts).toEqual([0, 1000]);
  });

  it('una promoción por productos conserva sus reglas y suma la exclusión', () => {
    const p = { ...base({ applies_to: 'products', promotion_rules: [{ rule_type: 'include_product', product_id: 1 }, { rule_type: 'include_product', product_id: 2 }] }), applies_with_price_lists: false };
    const [adaptada] = promocionesConListas([p], lineas);
    expect(adaptada.promotion_rules).toEqual([
      { rule_type: 'include_product', product_id: 1 },
      { rule_type: 'include_product', product_id: 2 },
      { rule_type: 'exclude_product', product_id: 1 },
    ]);
    expect(evaluarPromociones([adaptada as FilaPromocion], lineas, ctx).lineDiscounts).toEqual([0, 1000]);
  });

  it('sin líneas con lista no cambia nada', () => {
    const p = { ...base(), applies_with_price_lists: false };
    expect(promocionesConListas([p], [{ product_id: 2, price_list_id: null }])[0]).toBe(p);
  });
});

describe('importar Excel o CSV', () => {
  it.each([
    ['$ 9.000', '9000'],
    ['8.700,50', '8700.50'],
    ['1,5', '1.5'],
    ['12.5', '12.5'],
    ['1.234.567', '1234567'],
    ['9,000', '9000'],
    [9000, '9000'],
    ['abc', 'abc'],
  ])('normaliza %p → %p', (entrada, salida) => {
    expect(normalizarNumero(entrada)).toBe(salida);
  });

  it('reconoce las columnas aunque cambien de nombre y numera las filas del archivo', () => {
    const r = leerCsv('Código;Precio de lista;Desde cantidad\nBEB-0400;$ 9.000;1\n\nBEB-0400;8.700;12\n');
    expect(r.columnas).toEqual({ sku: 'Código', precio: 'Precio de lista', cantidad: 'Desde cantidad' });
    expect(r.filas).toEqual([
      { fila: 2, sku: 'BEB-0400', price: '9000', min_qty: '1' },
      { fila: 4, sku: 'BEB-0400', price: '8700', min_qty: '12' },
    ]);
  });
});

describe('códigos de error', () => {
  it('reconoce el mensaje de la RPC', () => {
    expect(codigoErrorLista({ message: 'sin_permiso' })).toBe('sin_permiso');
    expect(codigoErrorLista({ message: 'nombre_duplicado' })).toBe('nombre_duplicado');
    expect(codigoErrorLista(new Error('otra cosa'))).toBe('error_desconocido');
  });
});

describe('migraciones', () => {
  const raiz = process.cwd();
  const leer = (p: string) => fs.readFileSync(path.join(raiz, p), 'utf8');
  const BASE = 'supabase/migrations/20261124213000_listas_precios_base.sql';
  const VENTAS = 'supabase/migrations/20261124213100_listas_precios_ventas_y_documentos.sql';
  const GESTION = 'supabase/migrations/20261124213200_listas_precios_gestion.sql';

  it('cada migración tiene su reversión y no lleva credenciales', () => {
    for (const m of [BASE, VENTAS, GESTION]) {
      const rb = m.replace('migrations/', 'rollbacks/').replace('.sql', '_rollback.sql');
      expect(fs.existsSync(path.join(raiz, rb))).toBe(true);
      expect(leer(m)).not.toMatch(/eyJ[a-zA-Z0-9_-]{10,}|service_role_key|sk_live/i);
    }
  });

  it('resolve_customer_prices: SECURITY DEFINER, guarda de pertenencia o del propio cliente, cerrada a anon', () => {
    for (const m of [BASE, VENTAS]) {
      const s = leer(m);
      expect(s).toContain('revoke all on function public.resolve_customer_prices(integer, uuid, integer[], text, integer) from public, anon;');
      expect(s).toMatch(/om\.user_id = v_uid and om\.organization_id = p_org and om\.is_active/);
      expect(s).toMatch(/c\.user_id = v_uid\) then/);
    }
    expect(leer(VENTAS)).toMatch(/if coalesce\(auth\.role\(\), ''\) in \('anon', 'authenticated'\) then/);
  });

  it('las tablas nuevas tienen RLS por pertenencia y escritura con permiso', () => {
    const s = leer(BASE);
    expect(s).toMatch(/enable row level security/);
    expect(s).toMatch(/fn_tiene_permiso\(organization_id, 'pos\.listas_precios\.gestionar'\)/);
    expect(s).toMatch(/applies_with_price_lists boolean not null default true/);
  });

  it('el cobro valida el precio de la lista y exige permiso para «Usar precio normal»', () => {
    const s = leer(VENTAS);
    expect(s).toContain("v_item || jsonb_build_object(''_lista_cliente'', v_customer)");
    expect(s).toContain("public.fn_tiene_permiso(v_s.organization_id, 'pos.precios.cambiar_en_venta')");
    expect(s).toMatch(/raise exception 'pos_checkout_v1 cambió/);
  });

  it('las funciones de gestión exigen el permiso y se cierran a anon', () => {
    const s = leer(GESTION);
    expect(s).toMatch(/perform public\.fn_lista_precios_exigir_gestion\(p_org\);[\s\S]*price_list_save/);
    expect(s).toContain("execute format('revoke all on function %s from public, anon', f);");
  });
});

describe('traducciones', () => {
  const claves = (o: Record<string, unknown>, p = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? claves(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`]));
  const leer = (l: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), `messages/${l}.json`), 'utf8'));

  it('listasPrecios tiene las mismas claves en es, en, fr y pt, y la página está en el menú', () => {
    const es = leer('es');
    const base = claves(es.listasPrecios).sort();
    expect(base.length).toBeGreaterThan(200);
    for (const l of ['en', 'fr', 'pt']) {
      const m = leer(l);
      expect(claves(m.listasPrecios).sort()).toEqual(base);
      expect(typeof m.nav.paginas['pos_listas-precios']).toBe('string');
    }
    expect(es.nav.paginas['pos_listas-precios']).toBe('Listas de precios');
  });

  it('la casilla «No aplica a clientes con lista de precios» del formulario de promociones está en 4 idiomas', () => {
    for (const l of ['es', 'en', 'fr', 'pt']) {
      const av = leer(l).posPromociones.v2.avanzadas;
      for (const k of ['listasPrecios', 'listasPreciosCasilla', 'listasPreciosAyuda', 'resumenSinListas']) {
        expect({ l, k, tipo: typeof av[k] }).toEqual({ l, k, tipo: 'string' });
      }
    }
    expect(leer('es').posPromociones.v2.avanzadas.listasPreciosCasilla).toBe('No aplica a clientes con lista de precios');
  });
});

describe('formulario de promociones (Figma 09: casilla en Opciones avanzadas, apagada por defecto)', () => {
  const raiz = process.cwd();
  const leer = (p: string) => fs.readFileSync(path.join(raiz, p), 'utf8');

  it('la casilla escribe applies_with_price_lists = false al marcarla; por defecto queda true', () => {
    const form = leer('src/components/pos/promociones/formulario/PromocionFormulario.tsx');
    expect(form).toMatch(/applies_with_price_lists:\s*true,/);
    expect(form).toMatch(/checked=\{formData\.applies_with_price_lists === false\}/);
    expect(form).toMatch(/cambiar\('applies_with_price_lists', v !== true\)/);
    // Al editar, la promoción guardada llega con su valor.
    expect(leer('src/app/app/pos/promociones/[id]/page.tsx')).toMatch(/applies_with_price_lists:\s*promotion\.applies_with_price_lists !== false/);
  });

  it('cuenta como opción avanzada cambiada solo cuando está marcada', () => {
    const base = { name: 'x', promotion_type: 'percentage' as const, applies_to: 'all' as const, start_date: '2026-11-24' };
    expect(cambiosAvanzados({ ...base, applies_with_price_lists: true })).toBe(0);
    expect(cambiosAvanzados({ ...base, applies_with_price_lists: false })).toBe(1);
  });
});

describe('GO Assistant', () => {
  it('tiene la guía de listas de precios con la página real del menú', () => {
    const g = GUIAS.find((x) => x.id === 'listas-precios');
    expect(g?.rutas.map((r) => r.ruta)).toEqual(['/app/pos/listas-precios', '/app/pos/listas-precios/nueva']);
    expect(g?.permisos).toEqual(['pos.listas_precios.gestionar', 'pos.precios.cambiar_en_venta']);
  });
});
