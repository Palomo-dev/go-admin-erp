import type { SupabaseClient } from '@supabase/supabase-js';
import { cargarConfiguracionInformes, guardarConfiguracionInformes } from '@/lib/services/finanzas/configuracionInformes.server';
import { configuracionPredeterminada } from '../configuracion';

function clienteFalso() {
  const filtros: Array<{ tabla: string; campo: string; valor: unknown }> = [];
  const paginas: Array<{ tabla: string; inicio: number }> = [];
  const filas = Array.from({ length: 1001 }, (_, index) => ({ account_code: String(100000 + index), name: `Cuenta ${index}`, presentacion_niif: index === 0 ? 'corriente' : index === 1 ? 'segun_plazo' : null }));
  const from = jest.fn((tabla: string) => {
    const builder = {
      select: () => builder,
      eq: (campo: string, valor: unknown) => { filtros.push({ tabla, campo, valor }); return builder; },
      order: () => builder,
      single: async () => ({ data: { name: 'Entidad', legal_name: '', nit: '', tax_id: '000000000' }, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      range: async (inicio: number, fin: number) => {
        paginas.push({ tabla, inicio });
        return { data: tabla === 'chart_of_accounts' ? filas.slice(inicio, fin + 1) : [{ account_code: '100000', costo_comportamiento: null, es_ori: false, equivalente_efectivo: false, plazo_meses: null }], error: null };
      },
    };
    return builder;
  });
  const rpc = jest.fn(async () => ({ data: { version: 1 }, error: null as null | { code: string } }));
  return { cliente: { from, rpc } as unknown as SupabaseClient, from, rpc, filtros, paginas };
}

test('carga todas las cuentas por páginas y filtra cada lectura por organización', async () => {
  const falso = clienteFalso();
  const config = await cargarConfiguracionInformes(falso.cliente, 120);
  expect(config.cuentas).toHaveLength(1001);
  expect(config.cuentas[0].clasificacion_corriente).toBe('corriente');
  expect(config.cuentas[1].clasificacion_corriente).toBe('segun_plazo');
  expect(config.cuentas[1000].clasificacion_corriente).toBeNull();
  expect(config.certificacion.entidad).toBe('Entidad');
  expect(config.certificacion.nit).toBe('000000000');
  expect(config.version).toBe(0);
  expect(falso.paginas).toContainEqual({ tabla: 'chart_of_accounts', inicio: 1000 });
  expect(falso.filtros.every(({ tabla, campo, valor }) => valor === 120 && campo === (tabla === 'organizations' ? 'id' : 'organization_id'))).toBe(true);
});

test('guarda todo en una RPC y conserva conflictos y autorización como errores HTTP', async () => {
  const falso = clienteFalso();
  const cambios = configuracionPredeterminada();
  await guardarConfiguracionInformes(falso.cliente, 120, cambios);
  expect(falso.rpc).toHaveBeenCalledWith('fn_guardar_configuracion_informes', { p_organization_id: 120, p_configuracion: cambios });
  falso.rpc.mockResolvedValueOnce({ data: { version: 1 }, error: { code: '40001' } });
  await expect(guardarConfiguracionInformes(falso.cliente, 120, cambios)).rejects.toMatchObject({ statusCode: 409 });
  falso.rpc.mockResolvedValueOnce({ data: { version: 1 }, error: { code: '42501' } });
  await expect(guardarConfiguracionInformes(falso.cliente, 120, cambios)).rejects.toMatchObject({ statusCode: 403 });
});
