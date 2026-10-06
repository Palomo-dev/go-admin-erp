import { redimirCuponPedidoWeb } from '../cuponPedidoWeb';

/**
 * Cliente falso mínimo: registra cada consulta (tabla, filtros, insert) y responde según la
 * tabla. Suficiente para fijar el contrato de la redención del cupón de un pedido web.
 */
function clienteFalso(opts: { yaVinculada?: { id: string } | null; cupon?: { id: string } | null; errorInsert?: unknown }) {
  const llamadas: Array<{ tabla: string; filtros: Array<[string, unknown]>; insert?: Record<string, unknown> }> = [];
  const client = {
    from(tabla: string) {
      const llamada = { tabla, filtros: [] as Array<[string, unknown]>, insert: undefined as Record<string, unknown> | undefined };
      llamadas.push(llamada);
      const respuesta = () => {
        if (tabla === 'coupons') return { data: opts.cupon ?? null, error: null };
        if (llamada.insert) return opts.errorInsert ? { data: null, error: opts.errorInsert } : { data: { id: 'red-nueva' }, error: null };
        return { data: opts.yaVinculada ?? null, error: null };
      };
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => { llamada.filtros.push([c, v]); return q; },
        limit: () => q,
        insert: (fila: Record<string, unknown>) => { llamada.insert = fila; return q; },
        maybeSingle: async () => respuesta(),
        single: async () => respuesta(),
      };
      return q;
    },
  };
  return { client: client as never, llamadas };
}

const pedido = { id: 'pedido-web-1', organization_id: 140, coupon_code: 'BIENVENIDA', customer_id: 'cli-1', discount_total: 5000 };

describe('redimirCuponPedidoWeb', () => {
  it('registra la redención contra la VENTA (FK a sales), nunca contra el pedido web', async () => {
    const { client, llamadas } = clienteFalso({ cupon: { id: 'cupon-1' } });
    const id = await redimirCuponPedidoWeb(client, pedido, 'venta-1');
    expect(id).toBe('red-nueva');
    const insert = llamadas.find((l) => l.insert)?.insert;
    expect(insert).toEqual({ coupon_id: 'cupon-1', sale_id: 'venta-1', customer_id: 'cli-1', discount_applied: 5000 });
    // El cupón se busca en la organización del pedido.
    expect(llamadas.find((l) => l.tabla === 'coupons')?.filtros).toContainEqual(['organization_id', 140]);
  });

  it('es idempotente por venta: un reintento devuelve la redención existente sin insertar', async () => {
    const { client, llamadas } = clienteFalso({ yaVinculada: { id: 'red-previa' }, cupon: { id: 'cupon-1' } });
    expect(await redimirCuponPedidoWeb(client, pedido, 'venta-1')).toBe('red-previa');
    expect(llamadas.some((l) => l.insert)).toBe(false);
  });

  it('sin cupón activo o sin código no inserta ni lanza', async () => {
    const a = clienteFalso({ cupon: null });
    expect(await redimirCuponPedidoWeb(a.client, pedido, 'venta-1')).toBe('');
    expect(a.llamadas.some((l) => l.insert)).toBe(false);
    const b = clienteFalso({ cupon: { id: 'cupon-1' } });
    expect(await redimirCuponPedidoWeb(b.client, { ...pedido, coupon_code: null }, 'venta-1')).toBe('');
    expect(b.llamadas).toHaveLength(0);
  });

  it('un error al insertar no lanza (la confirmación sigue)', async () => {
    const { client } = clienteFalso({ cupon: { id: 'cupon-1' }, errorInsert: { code: '23503' } });
    const espiaError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await redimirCuponPedidoWeb(client, pedido, 'venta-1')).toBe('');
    espiaError.mockRestore();
  });
});
