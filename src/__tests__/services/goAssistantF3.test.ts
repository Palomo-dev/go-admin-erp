/**
 * GO Assistant — Fase 3: deshacer.
 *
 * Lo que se prueba aquí no es "que borre", sino **que NO borre cuando no debe**.
 * Verificado contra `pg_constraint` en la base real: en este esquema casi
 * ninguna clave foránea protege. Borrar una categoría descategoriza sus
 * productos (SET NULL) y borrar un proveedor se lleva sus facturas y órdenes de
 * compra (CASCADE). El `DELETE` no falla: funciona, destruyendo datos.
 */

import { applyUndo } from '@/lib/ai/assistant/undoService';
import { formatMoney } from '@/lib/ai/assistant/orgCurrency';

/** Cliente de BD falso que registra lo que se le pide. */
function fakeSupabase(opts: { counts?: Record<string, number>; rows?: Record<string, unknown> } = {}) {
  const deletes: string[] = [];
  const updates: Array<{ tabla: string; datos: Record<string, unknown> }> = [];

  const client = {
    from(tabla: string) {
      return {
        select: (_cols?: string, _opts?: unknown) => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: opts.rows?.[tabla] ?? { id: 1 } }) }),
            maybeSingle: async () => ({ data: opts.rows?.[tabla] ?? { id: 1 } }),
            then: undefined,
            count: opts.counts?.[tabla] ?? 0,
            error: null,
          }),
        }),
        delete: () => ({
          eq: () => ({ eq: async () => { deletes.push(tabla); return { error: null }; } }),
        }),
        update: (datos: Record<string, unknown>) => ({
          eq: () => ({
            eq: async () => { updates.push({ tabla, datos }); return { error: null }; },
            is: async () => { updates.push({ tabla, datos }); return { error: null }; },
            then: undefined,
          }),
        }),
      };
    },
  };
  return { client, deletes, updates };
}

/** El `select(...).eq(...)` con `head:true` devuelve `{count}` directamente. */
function conteos(counts: Record<string, number>) {
  return {
    from(tabla: string) {
      return {
        select: () => ({
          eq: async () => ({ count: counts[tabla] ?? 0, error: null }),
        }),
        delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
      };
    },
  };
}

describe('F3 — deshacer no destruye lo que ya se usa', () => {
  it('no borra una categoría que tiene productos', async () => {
    const supabase = conteos({ products: 3 }) as never;
    const out = await applyUndo(
      { supabase, organizationId: 1, userId: 'u' },
      { kind: 'delete_category', payload: { category_id: 5 } }
    );
    expect(out.ok).toBe(false);
    expect(out.errorCode).toBe('in_use');
    expect(out.message).toContain('productos');
  });

  it('no borra un proveedor con facturas de compra (la FK es CASCADE: las borraría)', async () => {
    const supabase = conteos({ invoice_purchase: 1 }) as never;
    const out = await applyUndo(
      { supabase, organizationId: 1, userId: 'u' },
      { kind: 'delete_supplier', payload: { supplier_id: 9 } }
    );
    expect(out.ok).toBe(false);
    expect(out.errorCode).toBe('in_use');
    expect(out.message).toContain('facturas de compra');
  });

  it('no borra un cliente con ventas', async () => {
    const supabase = conteos({ sales: 2 }) as never;
    const out = await applyUndo(
      { supabase, organizationId: 1, userId: 'u' },
      { kind: 'delete_customer', payload: { customer_id: 'uuid-1' } }
    );
    expect(out.ok).toBe(false);
    expect(out.errorCode).toBe('in_use');
  });

  it('sí borra lo que no tiene dependencias', async () => {
    const supabase = conteos({}) as never;
    const out = await applyUndo(
      { supabase, organizationId: 1, userId: 'u' },
      { kind: 'delete_category', payload: { category_id: 5 } }
    );
    expect(out.ok).toBe(true);
  });

  it('si no puede COMPROBAR la dependencia, no borra (fail-closed)', async () => {
    // Que la consulta falle no puede interpretarse como "no hay nada": borrar
    // por no haber podido mirar es justo el error que esta guarda evita.
    const supabase = {
      from: () => ({
        select: () => ({ eq: async () => ({ count: null, error: { message: 'boom' } }) }),
        delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
      }),
    } as never;
    const out = await applyUndo(
      { supabase, organizationId: 1, userId: 'u' },
      { kind: 'delete_category', payload: { category_id: 5 } }
    );
    expect(out.ok).toBe(false);
    expect(out.errorCode).toBe('in_use');
  });
});

describe('F3 — lo que no es reversible se dice, no se finge', () => {
  it('una venta no se deshace desde el chat', async () => {
    const out = await applyUndo(
      { supabase: {} as never, organizationId: 1, userId: 'u' },
      { kind: 'anular_venta', payload: {} }
    );
    expect(out.ok).toBe(false);
    expect(out.errorCode).toBe('not_undoable');
  });

  it('un payload sin identificador no revienta', async () => {
    const out = await applyUndo(
      { supabase: {} as never, organizationId: 1, userId: 'u' },
      { kind: 'delete_product', payload: {} }
    );
    expect(out.ok).toBe(false);
    expect(out.errorCode).toBe('bad_payload');
  });
});

describe('Moneda de la organización (no cableada)', () => {
  // Antes el asistente asumía COP. Para una organización que factura en dólares
  // eso guardaba importes en USD etiquetados como pesos, y a partir de ahí la
  // conciliación y los informes mienten.
  it('formatea en la moneda que se le pase, no en una fija', () => {
    const cop = formatMoney(19900, { code: 'COP', symbol: '$', decimals: 0, source: 'base' });
    const usd = formatMoney(19.9, { code: 'USD', symbol: '$', decimals: 2, source: 'base' });
    expect(cop).toContain('19.900');
    expect(cop).not.toContain(',00');
    expect(usd).toMatch(/19[.,]90/);
  });

  it('respeta los decimales de la moneda: el peso no tiene céntimos', () => {
    expect(formatMoney(1234.56, { code: 'COP', symbol: '$', decimals: 0, source: 'base' })).not.toMatch(/[.,]56/);
    expect(formatMoney(1234.56, { code: 'USD', symbol: '$', decimals: 2, source: 'base' })).toMatch(/[.,]56/);
  });

  it('un código que Intl no conoce no rompe la tarjeta', () => {
    expect(() => formatMoney(100, 'XXX')).not.toThrow();
    expect(formatMoney(100, 'NOEXISTE')).toContain('NOEXISTE');
  });

  it('acepta también un código suelto', () => {
    expect(formatMoney(1000, 'USD')).toMatch(/1[.,]000/);
  });
});
