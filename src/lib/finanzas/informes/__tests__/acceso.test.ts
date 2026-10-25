import { exigirLecturaInformes } from '../acceso.server';
import type { ServerOrgContext } from '@/lib/utils/orgContext';

function contexto(rpc: jest.Mock) {
  return { userId: 'usuario-sesion', organizationId: 12, roleId: 2, roleName: 'Admin', supabase: { rpc } } as unknown as ServerOrgContext;
}

describe('Permisos de lectura contable', () => {
  test('usa solo usuario y organización de sesión y permite cualquiera de los permisos de lectura', async () => {
    const rpc = jest.fn().mockResolvedValueOnce({ data: false, error: null }).mockResolvedValueOnce({ data: true, error: null });
    await expect(exigirLecturaInformes(contexto(rpc))).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('check_user_permission', { p_user_id: 'usuario-sesion', p_organization_id: 12, p_permission_code: 'finance.view' });
    expect(rpc).toHaveBeenCalledWith('check_user_permission', { p_user_id: 'usuario-sesion', p_organization_id: 12, p_permission_code: 'reports.finance' });
  });
  test('no autoriza por nombre de rol ni por un fallo de red', async () => {
    const rpc = jest.fn().mockRejectedValue(new Error('Sin conexión'));
    await expect(exigirLecturaInformes(contexto(rpc))).rejects.toMatchObject({ statusCode: 403 });
    const sinPermiso = jest.fn().mockResolvedValue({ data: false, error: null });
    await expect(exigirLecturaInformes(contexto(sinPermiso))).rejects.toMatchObject({ statusCode: 403 });
  });
});
