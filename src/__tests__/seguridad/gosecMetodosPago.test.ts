/**
 * GO-sec 2026-09-28, punto 5: una organización solo modifica SU vínculo con un
 * método de pago; el catálogo global `payment_methods` es de la plataforma.
 *
 * Probado en la base viva (transacción que se deshace) antes de aplicar
 * 20260928173749_gosec_metodos_pago_catalogo_solo_plataforma:
 *   - un admin de organización ya no renombra ni borra «wompi» (0 filas) ni
 *     inserta en payment_methods (RLS), y los 61 vínculos de wompi siguen;
 *   - fn_metodo_pago_personalizado_crear crea código + vínculo con display_name;
 *   - cajero sin permiso → sin_permiso; miembro de otra organización → acceso denegado;
 *   - el admin sí edita settings de su propio vínculo.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  claveErrorMetodoPago,
  nombreVisibleMetodo,
  ordenarMetodosDeLaOrganizacion,
  requiereReferenciaMetodo,
} from '@/lib/finanzas/metodosPagoOrganizacion';

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf-8');

// ── Doble de supabase para la caché de etiquetas ─────────────────────────────
const consultas: number[] = [];
const filasPorOrg: Record<number, unknown[]> = {
  1: [{ payment_method_code: 'cash', settings: { display_name: 'Caja uno' }, payment_methods: { name: 'Efectivo' } }],
  2: [{ payment_method_code: 'cash', settings: {}, payment_methods: { name: 'Efectivo' } }],
};
jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: () => {
      let org = 0;
      const q = {
        select: () => q,
        eq: (col: string, val: unknown) => {
          if (col === 'organization_id') org = val as number;
          return q;
        },
        then: (resolve: (v: unknown) => void) => {
          consultas.push(org);
          resolve({ data: filasPorOrg[org] ?? [], error: null });
        },
      };
      return q;
    },
  },
}));
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 1 }));

import { getPaymentMethodLabels, limpiarCacheEtiquetasMetodosPago } from '@/lib/services/paymentMethodHelper';

describe('personalización propia de la organización', () => {
  test('el nombre propio manda; si no hay, el del catálogo; si no, el código', () => {
    expect(nombreVisibleMetodo({ display_name: ' Caja ' }, 'Efectivo', 'cash')).toBe('Caja');
    expect(nombreVisibleMetodo({ display_name: '' }, 'Efectivo', 'cash')).toBe('Efectivo');
    expect(nombreVisibleMetodo(null, null, 'cash')).toBe('cash');
  });

  test('«requiere referencia» propio, con el del catálogo de respaldo', () => {
    expect(requiereReferenciaMetodo({ requires_reference: false }, true)).toBe(false);
    expect(requiereReferenciaMetodo({}, true)).toBe(true);
    expect(requiereReferenciaMetodo(undefined, false)).toBe(false);
  });

  test('el orden es el de la organización; sin orden, al final y en el orden de la consulta', () => {
    const filas = [
      { payment_method_code: 'transfer', website_display_order: null },
      { payment_method_code: 'card', website_display_order: 2 },
      { payment_method_code: 'cash', website_display_order: 0 },
      { payment_method_code: 'check' },
    ];
    expect(ordenarMetodosDeLaOrganizacion(filas).map((f) => f.payment_method_code)).toEqual(['cash', 'card', 'transfer', 'check']);
  });

  test('errores de la RPC traducidos', () => {
    expect(claveErrorMetodoPago({ message: 'sin_permiso' })).toBe('sinPermiso');
    expect(claveErrorMetodoPago({ message: 'x', code: '42501' })).toBe('sinPermiso');
    expect(claveErrorMetodoPago({ message: 'codigo_existe' })).toBe('codigoExiste');
    expect(claveErrorMetodoPago({ message: 'codigo_invalido' })).toBe('codigoInvalido');
    expect(claveErrorMetodoPago({ message: 'nombre_invalido' })).toBe('nombreInvalido');
    expect(claveErrorMetodoPago(new Error('otra'))).toBeNull();
  });
});

describe('caché de etiquetas por organización', () => {
  beforeEach(() => {
    consultas.length = 0;
    limpiarCacheEtiquetasMetodosPago();
  });

  test('cada organización tiene su caché y su nombre propio', async () => {
    expect(await getPaymentMethodLabels(1)).toEqual({ cash: 'Caja uno' });
    expect(await getPaymentMethodLabels(2)).toEqual({ cash: 'Efectivo' });
    // La segunda lectura de la org 1 sale de su caché, no de la de la org 2.
    expect(await getPaymentMethodLabels(1)).toEqual({ cash: 'Caja uno' });
    expect(consultas).toEqual([1, 2]);
  });
});

describe('pantallas y POS', () => {
  test('eliminar y editar un método no escriben payment_methods', () => {
    for (const f of ['PaymentMethodsList.tsx', 'PaymentMethodForm.tsx']) {
      const src = leer(`src/components/finanzas/metodos-pago/${f}`);
      expect(`${f}: ${/from\(\s*["']payment_methods["']\s*\)[\s\S]{0,120}?\.(insert|update|upsert|delete)\(/.test(src)}`).toBe(`${f}: false`);
    }
    const form = leer('src/components/finanzas/metodos-pago/PaymentMethodForm.tsx');
    expect(form).toMatch(/rpc\("fn_metodo_pago_personalizado_crear"/);
    expect(form).toMatch(/display_name: nombrePropio/);
  });

  test('ningún archivo de cliente escribe el catálogo global payment_methods', () => {
    const archivos: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (!['node_modules', '__tests__', 'api'].includes(e.name)) recorrer(p);
        } else if (/\.tsx?$/.test(e.name) && !/\.(test|server)\.tsx?$/.test(e.name)) archivos.push(p);
      }
    };
    recorrer(path.join(RAIZ, 'src'));
    const escriben = archivos
      .filter((f) => /from\(\s*["']payment_methods["']\s*\)[\s\S]{0,160}?\.(insert|update|upsert|delete)\(/.test(fs.readFileSync(f, 'utf-8')))
      .map((f) => path.relative(RAIZ, f).replace(/\\/g, '/'));
    expect(escriben).toEqual([]);
  });

  test('el POS ordena como la organización, en línea y sin red', () => {
    const pos = leer('src/lib/services/posService.ts');
    const i = pos.indexOf('static async getPaymentMethods()');
    const cuerpo = pos.slice(i, pos.indexOf('static async getCurrencies()', i));
    expect(cuerpo).toMatch(/\.order\('website_display_order'/);
    expect(cuerpo.match(/ordenarMetodosDeLaOrganizacion\(/g)).toHaveLength(2);
    expect(pos).toMatch(/name: nombreVisibleMetodo\(method\.settings/);
    expect(leer('src/lib/offline/catalogReplicator.ts')).toMatch(/payment_method_code, is_active, settings, website_display_order/);
  });
});

describe('migración', () => {
  const base = '20260928173749_gosec_metodos_pago_catalogo_solo_plataforma';
  const sql = leer(`supabase/migrations/${base}.sql`);

  test('existe con su rollback', () => {
    expect(fs.existsSync(path.join(RAIZ, 'supabase', 'rollbacks', `${base}_rollback.sql`))).toBe(true);
  });

  test('quita las escrituras de miembros y deja solo plataforma', () => {
    for (const p of ['payment_methods_insert_policy', 'payment_methods_update_policy', 'payment_methods_delete_policy']) {
      expect(sql).toContain(`drop policy if exists ${p} on public.payment_methods`);
    }
    expect(sql).toMatch(/create policy payment_methods_escritura_plataforma[\s\S]*fn_is_platform_admin/);
  });

  test('la RPC de alta exige billing_management, fija search_path y no es de anon', () => {
    expect(sql).toMatch(/fn_finanzas_exigir_permiso\(p_organization_id, array\['billing_management'\]\)/);
    expect(sql).toMatch(/security definer\s+set search_path to 'public', 'pg_temp'/);
    expect(sql).toMatch(/revoke all on function public\.fn_metodo_pago_personalizado_crear\(integer, text, text, boolean\) from public, anon/);
  });

  test('el namespace metodosPagoSeguridad existe con las mismas claves en los 4 idiomas', () => {
    const claves = (idioma: string) =>
      Object.keys((JSON.parse(leer(`messages/${idioma}.json`)) as Record<string, Record<string, string>>).metodosPagoSeguridad ?? {}).sort();
    const es = claves('es');
    expect(es).toEqual(['codigoExiste', 'codigoInvalido', 'nombreInvalido', 'sinPermiso']);
    for (const idioma of ['en', 'fr', 'pt']) expect(claves(idioma)).toEqual(es);
  });
});
