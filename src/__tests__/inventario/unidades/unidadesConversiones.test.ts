/**
 * Unidades y conversiones (inventario B6a).
 *
 * - La regla de conversión vive en SQL (`fn_unidad_factor`): la fachada TS solo
 *   llama RPC y nadie escribe `unit_conversions` desde el navegador.
 * - «Solo este producto» viaja como `producto_id` en `fn_conversion_guardar`,
 *   con la inversa en la misma llamada (antes eran dos inserts sueltos).
 * - Agrupación de las inversas del sistema, filtros y normalización del resumen.
 */
import fs from 'fs';
import path from 'path';

const llamadas: { fn: string; args: Record<string, unknown> }[] = [];
const respuestas: Record<string, { data: unknown; error: unknown }> = {};

jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      llamadas.push({ fn, args });
      return respuestas[fn] ?? { data: null, error: null };
    },
    from: () => {
      throw new Error('no debería tocar tablas en este caso');
    },
  },
}));
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 142 }));

import { ErrorConversion, unitConversionService } from '@/lib/services/unitConversionService';
import { aResumenUnidades } from '@/components/inventario/unidades/servicioUnidades';
import {
  codigoSugerido,
  equivalencia,
  filasConversion,
  filtrarConversiones,
  filtrarUnidades,
  formatoFactor,
  unidadEliminable,
} from '@/components/inventario/unidades/logicaUnidades';
import type { Conversion, Unidad } from '@/components/inventario/unidades/tipos';

beforeEach(() => {
  llamadas.length = 0;
  for (const k of Object.keys(respuestas)) delete respuestas[k];
});

const conv = (id: number, de: string, a: string, factor: number, extra: Partial<Conversion> = {}): Conversion => ({
  id,
  de,
  a,
  factor,
  nombre_de: null,
  nombre_a: null,
  tipo_de: 'weight',
  tipo_a: 'weight',
  ambito: 'sistema',
  producto: null,
  inversa_id: null,
  recetas: 0,
  revisar: false,
  ...extra,
});

const unidad = (codigo: string, extra: Partial<Unidad> = {}): Unidad => ({
  codigo,
  nombre: codigo,
  tipo: 'count',
  ambito: 'sistema',
  activo: true,
  dian_id: null,
  dian_codigo: null,
  dian_nombre: null,
  productos: 0,
  recetas: 0,
  conversiones: 0,
  ...extra,
});

describe('fachada de conversiones: solo RPC', () => {
  it('crear «solo este producto» con la inversa es UNA llamada a fn_conversion_guardar', async () => {
    respuestas.fn_conversion_guardar = { data: { id: 22, inversa_id: 23 }, error: null };
    const r = await unitConversionService.createConversion({ from_unit_code: 'paq ', to_unit_code: 'un', factor: 6, product_id: 77, inversa: true, organization_id: 999 });
    expect(r).toEqual({ id: 22, inversa_id: 23 });
    expect(llamadas).toEqual([
      { fn: 'fn_conversion_guardar', args: { p_org: 142, p_id: null, p_datos: { de: 'PAQ', a: 'UN', factor: 6, producto_id: 77, inversa: true } } },
    ]);
  });

  it('la organización del cliente se ignora: va la de la sesión', async () => {
    respuestas.fn_conversion_guardar = { data: { id: 1, inversa_id: null }, error: null };
    await unitConversionService.createConversion({ from_unit_code: 'GR', to_unit_code: 'LB', factor: 0.002, organization_id: 5 });
    expect(llamadas[0].args.p_org).toBe(142);
  });

  it('los errores de la base llegan con su código estable', async () => {
    respuestas.fn_conversion_guardar = { data: null, error: { message: 'tipos_distintos', code: '23514' } };
    await expect(unitConversionService.createConversion({ from_unit_code: 'UN', to_unit_code: 'KG', factor: 5 })).rejects.toMatchObject({
      codigo: 'tipos_distintos',
      sqlstate: '23514',
    });
    respuestas.fn_conversiones_eliminar = { data: null, error: { message: 'conversion_en_uso', code: '23503', hint: '2' } };
    const e = await unitConversionService.deleteConversions([9]).catch((x) => x);
    expect(e).toBeInstanceOf(ErrorConversion);
    expect(e).toMatchObject({ codigo: 'conversion_en_uso', relacionado: 2 });
  });

  it('convertir usa la regla de la base (fn_unidad_convertir), con el producto', async () => {
    respuestas.fn_unidad_convertir = { data: '12', error: null };
    expect(await unitConversionService.convert(2, 'PAQ', 'UN', undefined, 77)).toBe(12);
    expect(llamadas[0]).toEqual({ fn: 'fn_unidad_convertir', args: { p_org: 142, p_cantidad: 2, p_de: 'PAQ', p_a: 'UN', p_producto: 77 } });
    expect(await unitConversionService.convert(3, 'kg', 'KG')).toBe(3);
  });

  it('nadie escribe unit_conversions ni units desde src (todo por RPC)', () => {
    const raiz = path.resolve(__dirname, '../../../..');
    const malos: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (!['node_modules', '__tests__', '.next'].includes(e.name)) recorrer(p);
        } else if (/\.(ts|tsx)$/.test(e.name)) {
          const s = fs.readFileSync(p, 'utf8');
          if (/\.from\(\s*['"`]unit_conversions['"`]\s*\)\s*\.(insert|update|upsert|delete)\(/.test(s)) malos.push(path.relative(raiz, p));
        }
      }
    };
    recorrer(path.join(raiz, 'src'));
    expect(malos).toEqual([]);
  });
});

describe('lógica de la pantalla', () => {
  it('agrupa las inversas del sistema en una fila (la de factor ≥ 1) y deja sueltas las propias', () => {
    const lista = [
      conv(1, 'GR', 'KG', 0.001, { inversa_id: 2 }),
      conv(2, 'KG', 'GR', 1000, { inversa_id: 1 }),
      conv(25, 'BUL', 'KG', 25, { ambito: 'organizacion', inversa_id: 26 }),
      conv(26, 'KG', 'BUL', 0.04, { ambito: 'organizacion', inversa_id: 25 }),
    ];
    const filas = filasConversion(lista);
    expect(filas.map((f) => f.conversion.id)).toEqual([2, 25, 26]);
    expect(filas[0].inversa?.id).toBe(1);
    expect(filas[1].inversa).toBeNull();
  });

  it('filtra por tipo, ámbito, unidad, texto y «por revisar»', () => {
    const filas = filasConversion([
      conv(5, 'UN', 'PAQ', 0.1, { tipo_de: 'count', tipo_a: 'count', revisar: true }),
      conv(7, 'PAQ', 'UN', 6, { tipo_de: 'count', tipo_a: 'count', ambito: 'producto', producto: { id: 1, nombre: 'Pan tajado', sku: 'PAN' } }),
      conv(9, 'LT', 'ML', 1000, { tipo_de: 'volume', tipo_a: 'volume' }),
    ]);
    const base = { texto: '', tipo: 'todos' as const, ambito: 'todas' as const, unidad: null, soloRevisar: false };
    expect(filtrarConversiones(filas, { ...base, tipo: 'count' }).map((f) => f.conversion.id)).toEqual([5, 7]);
    expect(filtrarConversiones(filas, { ...base, ambito: 'producto' }).map((f) => f.conversion.id)).toEqual([7]);
    expect(filtrarConversiones(filas, { ...base, unidad: 'ML' }).map((f) => f.conversion.id)).toEqual([9]);
    expect(filtrarConversiones(filas, { ...base, texto: 'pan' }).map((f) => f.conversion.id)).toEqual([7]);
    expect(filtrarConversiones(filas, { ...base, soloRevisar: true }).map((f) => f.conversion.id)).toEqual([5]);
  });

  it('filtra unidades y solo deja eliminar las propias sin uso', () => {
    const lista = [unidad('UN', { productos: 12, conversiones: 4 }), unidad('BUL', { ambito: 'organizacion', tipo: 'weight' }), unidad('M2', { tipo: 'area' })];
    const base = { texto: '', tipo: 'todos' as const, ambito: 'todas' as const, uso: 'todas' as const, sinConversion: false };
    expect(filtrarUnidades(lista, { ...base, ambito: 'organizacion' }).map((u) => u.codigo)).toEqual(['BUL']);
    expect(filtrarUnidades(lista, { ...base, uso: 'conProductos' }).map((u) => u.codigo)).toEqual(['UN']);
    expect(filtrarUnidades(lista, { ...base, sinConversion: true }).map((u) => u.codigo)).toEqual(['BUL', 'M2']);
    expect(unidadEliminable(lista[1])).toBe(true);
    expect(unidadEliminable(lista[0])).toBe(false);
    expect(unidadEliminable(lista[2])).toBe(false);
  });

  it('formato y código sugerido', () => {
    expect(formatoFactor(1000)).toBe('1.000');
    expect(formatoFactor(0.001)).toBe('0,001');
    expect(equivalencia('KG', 'GR', 1000)).toBe('1 KG = 1.000 GR');
    expect(codigoSugerido('Bulto', new Set())).toBe('BUL');
    expect(codigoSugerido('Atado', new Set(['ATA']))).toBe('ATD');
  });

  it('normaliza el resumen de fn_unidades_resumen', () => {
    const r = aResumenUnidades({
      unidades: [{ codigo: 'KG  ', nombre: 'Kilogramo', tipo: 'weight', ambito: 'sistema', dian_id: 71, dian_codigo: 'KGM', productos: '3' }],
      conversiones: [{ id: 22, de: 'PAQ', a: 'UN', factor: '6', ambito: 'producto', producto: { id: 77, nombre: 'Pan', sku: null }, revisar: false }],
      kpis: { unidades_sin_conversion: ['m2', 'PR'], ingredientes_sin_conversion: '0' },
      dian: [{ id: 80, codigo: 'LBR', nombre: 'Libra' }],
    });
    expect(r.unidades[0]).toMatchObject({ codigo: 'KG', dian_codigo: 'KGM', productos: 3 });
    expect(r.conversiones[0]).toMatchObject({ factor: 6, ambito: 'producto', producto: { id: 77 } });
    expect(r.kpis.unidades_sin_conversion).toEqual(['M2', 'PR']);
    expect(r.dian).toEqual([{ id: 80, codigo: 'LBR', nombre: 'Libra' }]);
    expect(aResumenUnidades(null).unidades).toEqual([]);
  });
});
