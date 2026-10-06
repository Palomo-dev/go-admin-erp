import { errorDeCupo, esFuncionAusente, leerCupoPlan, usoDesdeFila, HINT_CUPO_SUCURSALES, HINT_CUPO_USUARIOS } from '../cupoPlanService';
import type { SupabaseClient } from '@supabase/supabase-js';

function clienteConRpc(respuesta: { data: unknown; error: unknown }) {
  const rpc = jest.fn().mockResolvedValue(respuesta);
  return { cliente: { rpc } as unknown as SupabaseClient, rpc };
}

describe('errorDeCupo', () => {
  it('reconoce el rechazo de usuarios y conserva el mensaje de la base', () => {
    const r = errorDeCupo({ hint: HINT_CUPO_USUARIOS, message: 'El plan permite 2 usuarios y ya están ocupados 2.' });
    expect(r).toEqual({ codigo: 'CUPO_PLAN_USUARIOS', mensaje: 'El plan permite 2 usuarios y ya están ocupados 2.' });
  });

  it('reconoce el rechazo de sucursales', () => {
    expect(errorDeCupo({ hint: HINT_CUPO_SUCURSALES, message: 'x' })?.codigo).toBe('CUPO_PLAN_SUCURSALES');
  });

  it('cualquier otro error no es de cupo', () => {
    expect(errorDeCupo({ hint: null, message: 'duplicate key' })).toBeNull();
    expect(errorDeCupo({ message: 'El plan permite…' })).toBeNull();
    expect(errorDeCupo(null)).toBeNull();
  });
});

describe('usoDesdeFila', () => {
  it('traduce la fila de fn_cupo_plan a la forma de /api/me/plan', () => {
    expect(
      usoDesdeFila({
        max_usuarios: 12,
        usuarios_activos: 7,
        invitaciones_vigentes: 2,
        extra_usuarios: 2,
        max_sucursales: 6,
        sucursales_activas: 3,
        extra_sucursales: 1,
      })
    ).toEqual({
      usuarios: { actual: 7, maximo: 12, comprados: 2, invitacionesVigentes: 2 },
      sucursales: { actual: 3, maximo: 6, comprados: 1 },
    });
  });

  it('un máximo null es ilimitado (plan a medida) y los conteos nunca son negativos', () => {
    const uso = usoDesdeFila({ max_usuarios: null, usuarios_activos: -1, max_sucursales: null });
    expect(uso.usuarios.maximo).toBeNull();
    expect(uso.sucursales.maximo).toBeNull();
    expect(uso.usuarios.actual).toBe(0);
    expect(uso.usuarios.invitacionesVigentes).toBe(0);
  });
});

describe('leerCupoPlan', () => {
  it('llama a fn_cupo_plan con la organización y devuelve el uso', async () => {
    const { cliente, rpc } = clienteConRpc({
      data: [{ max_usuarios: 10, usuarios_activos: 4, invitaciones_vigentes: 1, extra_usuarios: 0, max_sucursales: 1, sucursales_activas: 1, extra_sucursales: 0 }],
      error: null,
    });
    const uso = await leerCupoPlan(cliente, 120);
    expect(rpc).toHaveBeenCalledWith('fn_cupo_plan', { p_org: 120 });
    expect(uso?.usuarios).toEqual({ actual: 4, maximo: 10, comprados: 0, invitacionesVigentes: 1 });
  });

  it('devuelve null si la migración aún no está aplicada', async () => {
    const { cliente } = clienteConRpc({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    await expect(leerCupoPlan(cliente, 1)).resolves.toBeNull();
    expect(esFuncionAusente({ code: '42883' })).toBe(true);
  });

  it('cualquier otro error se lanza (no se inventan cupos)', async () => {
    const { cliente } = clienteConRpc({ data: null, error: { code: '57014', message: 'timeout' } });
    await expect(leerCupoPlan(cliente, 1)).rejects.toThrow('fn_cupo_plan');
  });
});
