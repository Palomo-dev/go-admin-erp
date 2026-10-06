const rpc = jest.fn();
jest.mock('@/lib/supabase/config', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

import { asignarSucursalesMiembro, ErrorGestionMiembro } from '../miembrosService';

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: {}, error: null });
});

describe('asignarSucursalesMiembro (P0-10)', () => {
  it('una lista explícita va a la RPC transaccional, sin duplicados ni basura', async () => {
    await asignarSucursalesMiembro('15', { todas: false, sucursales: ['3', 7, 7, 'x', 0] });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('fn_miembro_asignar_sucursales', { p_member_id: 15, p_branch_ids: [3, 7], p_todas: false });
  });

  it('«todas» solo se manda cuando se eligió así', async () => {
    await asignarSucursalesMiembro(15, { todas: true });
    expect(rpc).toHaveBeenCalledWith('fn_miembro_asignar_sucursales', { p_member_id: 15, p_branch_ids: null, p_todas: true });
  });

  it('una lista vacía NO se convierte en «todas»: se rechaza sin llamar a la base', async () => {
    await expect(asignarSucursalesMiembro(15, { todas: false, sucursales: [] })).rejects.toBeInstanceOf(ErrorGestionMiembro);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('el rechazo de la base llega con su mensaje, sin el prefijo técnico', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'miembros: alguna sucursal no es de esta organización', code: '22023' } });
    await expect(asignarSucursalesMiembro(15, { todas: false, sucursales: [99] })).rejects.toMatchObject({
      message: 'alguna sucursal no es de esta organización',
      codigo: '22023',
    });
  });
});
