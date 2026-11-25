import { clienteFacturaPedidoWebId } from '../adquirientePedido';

/**
 * El adquiriente de la factura de un pedido web sale de la RPC fn_web_order_cliente_factura
 * (migración 20261125170000): la empresa del NIT o el cliente del pedido. El helper nunca lanza y,
 * si la RPC falla, devuelve el respaldo (el cliente del pedido, como antes).
 */
describe('clienteFacturaPedidoWebId', () => {
  const PERSONA = '11111111-1111-4111-8111-111111111111';
  const EMPRESA = '22222222-2222-4222-8222-222222222222';
  const PEDIDO = '33333333-3333-4333-8333-333333333333';

  const conRpc = (respuesta: { data?: unknown; error?: { code?: string } | null } | Error) => {
    const rpc = jest.fn(async () => {
      if (respuesta instanceof Error) throw respuesta;
      return { data: respuesta.data ?? null, error: respuesta.error ?? null };
    });
    return { rpc } as unknown as Parameters<typeof clienteFacturaPedidoWebId>[0] & { rpc: jest.Mock };
  };

  let errorLog: jest.SpyInstance;
  beforeEach(() => {
    errorLog = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => errorLog.mockRestore());

  test('con NIT y empresa: devuelve la empresa que resolvió la base', async () => {
    const db = conRpc({ data: EMPRESA });
    await expect(clienteFacturaPedidoWebId(db, PEDIDO, PERSONA)).resolves.toBe(EMPRESA);
    expect(db.rpc).toHaveBeenCalledWith('fn_web_order_cliente_factura', { p_order_id: PEDIDO });
  });

  test('sin NIT: la base devuelve el cliente del pedido y se usa tal cual', async () => {
    await expect(clienteFacturaPedidoWebId(conRpc({ data: PERSONA }), PEDIDO, PERSONA)).resolves.toBe(PERSONA);
  });

  test('pedido sin cliente (la base devuelve null): el respaldo, p. ej. el cliente creado por correo', async () => {
    await expect(clienteFacturaPedidoWebId(conRpc({ data: null }), PEDIDO, PERSONA)).resolves.toBe(PERSONA);
    await expect(clienteFacturaPedidoWebId(conRpc({ data: null }), PEDIDO, null)).resolves.toBeNull();
  });

  test('si la RPC responde error o lanza: el respaldo y un error en el log, nunca una excepción', async () => {
    await expect(clienteFacturaPedidoWebId(conRpc({ error: { code: '42883' } }), PEDIDO, PERSONA)).resolves.toBe(PERSONA);
    await expect(clienteFacturaPedidoWebId(conRpc(new Error('red')), PEDIDO, PERSONA)).resolves.toBe(PERSONA);
    expect(errorLog).toHaveBeenCalledTimes(2);
  });
});
