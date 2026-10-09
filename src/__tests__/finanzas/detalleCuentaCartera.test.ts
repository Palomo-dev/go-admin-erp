/**
 * El detalle de una cuenta por cobrar no puede embeber `branches` desde
 * `accounts_receivable`: `branch_id` no tiene llave foránea y PostgREST
 * rechaza la consulta entera (la pantalla muestra «No se pudo cargar la cuenta»).
 * El nombre de la sucursal se lee en una consulta aparte, acotada a la organización.
 */
import { detalleCuenta, ErrorCarteraServidor } from '@/lib/services/cartera/cuentasPorCobrar.server';

const CUENTA = '11111111-1111-4111-8111-111111111111';
const FACTURA = '22222222-2222-4222-8222-222222222222';
const CLIENTE = '33333333-3333-4333-8333-333333333333';
const ORG = 7;

interface Cadena {
  select: (columnas: string) => Cadena;
  eq: (columna: string, valor: unknown) => Cadena;
  neq: () => Cadena;
  gt: () => Cadena;
  or: () => Cadena;
  order: () => Cadena;
  limit: () => Cadena;
  maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
  then: (resolver: (v: { data: unknown; error: null }) => unknown) => Promise<unknown>;
}

function clienteFalso(opciones?: { sinSucursal?: boolean }) {
  const selects: string[] = [];
  const filtrosSucursal: Array<[string, unknown]> = [];

  const from = (tabla: string): Cadena => {
    let columnas = '';
    const filtros: Array<[string, unknown]> = [];
    const cadena: Cadena = {
      select(cols) {
        columnas = cols;
        selects.push(`${tabla}:${cols}`);
        return cadena;
      },
      eq(columna, valor) {
        filtros.push([columna, valor]);
        if (tabla === 'branches') filtrosSucursal.push([columna, valor]);
        return cadena;
      },
      neq: () => cadena,
      gt: () => cadena,
      or: () => cadena,
      order: () => cadena,
      limit: () => cadena,
      maybeSingle: async () => {
        if (tabla === 'accounts_receivable') {
          if (columnas.includes('branches:')) {
            return { data: null, error: { message: 'Could not find a relationship between accounts_receivable and branches' } };
          }
          return {
            data: {
              id: CUENTA,
              invoice_id: FACTURA,
              sale_id: null,
              customer_id: CLIENTE,
              branch_id: opciones?.sinSucursal ? null : 15,
              amount: '34000',
              balance: '34000',
              due_date: '2026-11-07T05:00:00Z',
              status: 'current',
              created_at: '2026-10-01T12:00:00Z',
              last_reminder_date: null,
              invoice_sales: {
                id: FACTURA,
                number: 'FACT-0001',
                total: '34000',
                balance: '34000',
                issue_date: '2026-10-01',
                due_date: '2026-11-07',
                currency: 'COP',
                status: 'issued',
                sale_id: null,
              },
              customers: { id: CLIENTE, full_name: 'Cliente de prueba', doc_type: 'CC', doc_number: '1', email: null, phone: null },
            },
            error: null,
          };
        }
        if (tabla === 'branches') return { data: { name: 'Sucursal Norte' }, error: null };
        return { data: null, error: null };
      },
      then: (resolver) => {
        const data = tabla === 'accounts_receivable' ? [{ balance: '34000' }] : [];
        return Promise.resolve({ data, error: null }).then(resolver);
      },
    };
    return cadena;
  };

  return {
    selects,
    filtrosSucursal,
    supabase: {
      from,
      rpc: async (nombre: string) => {
        if (nombre === 'fn_cxc_estado_vivo') {
          return { data: [{ account_id: CUENTA, dias_vencida: 0, estado_efectivo: 'current' }], error: null };
        }
        if (nombre === 'fn_moneda_base_organizacion') return { data: 'COP', error: null };
        return { data: null, error: null };
      },
    },
  };
}

describe('detalleCuenta', () => {
  test('carga el detalle y el nombre de la sucursal sin embeber branches', async () => {
    const falso = clienteFalso();
    const detalle = await detalleCuenta({ organizationId: ORG, userId: 'usuario', supabase: falso.supabase as never }, CUENTA);

    expect(falso.selects.some((s) => s.startsWith('accounts_receivable:') && s.includes('branches:'))).toBe(false);
    expect(falso.selects.some((s) => s.startsWith('branches:'))).toBe(true);
    expect(falso.filtrosSucursal).toEqual(expect.arrayContaining([['id', 15], ['organization_id', ORG]]));
    expect(detalle.cuenta.sucursal).toBe('Sucursal Norte');
    expect(detalle.cuenta.saldo).toBe(34000);
    expect(detalle.factura?.numero).toBe('FACT-0001');
    expect(detalle.cliente?.carteraTotal).toBe(34000);
  });

  test('sin sucursal no consulta branches', async () => {
    const falso = clienteFalso({ sinSucursal: true });
    const detalle = await detalleCuenta({ organizationId: ORG, userId: 'usuario', supabase: falso.supabase as never }, CUENTA);
    expect(detalle.cuenta.sucursal).toBeNull();
    expect(falso.selects.some((s) => s.startsWith('branches:'))).toBe(false);
  });

  test('si la consulta de la cuenta falla, el detalle no se inventa', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const falso = clienteFalso();
    falso.supabase.from = () => {
      const cadena = {
        select: () => cadena,
        eq: () => cadena,
        maybeSingle: async () => ({ data: null, error: { message: 'fallo' } }),
      };
      return cadena as never;
    };
    try {
      await expect(detalleCuenta({ organizationId: ORG, userId: 'usuario', supabase: falso.supabase as never }, CUENTA)).rejects.toBeInstanceOf(ErrorCarteraServidor);
    } finally {
      jest.restoreAllMocks();
    }
  });
});
