/// <reference types="jest" />
/**
 * F0-SEC r2 (sub-parte C, punto 12) — `orgAdmin.ts` es un módulo hoja: la
 * decisión síncrona de «admin de la organización» es SOLO por
 * `is_super_admin` o `role_id ∈ ORG_ADMIN_ROLE_IDS`. El nombre del rol no
 * participa (regla dura 6): un rol personalizado llamado igual que el admin
 * con otro id no obtiene nada. Sin mocks: importa el módulo hoja tal cual.
 */
import { isOrgAdminLike, ORG_ADMIN_PERMISSION_CODE, ORG_ADMIN_ROLE_IDS } from '../orgAdmin';

describe('orgAdmin · isOrgAdminLike', () => {
  test('la lista de roles admin es exactamente 1 (Super Admin) y 2 (Admin de organización)', () => {
    expect(ORG_ADMIN_ROLE_IDS).toEqual([1, 2]);
    expect(ORG_ADMIN_PERMISSION_CODE).toBe('admin.full_access');
  });

  test('rol 1 o 2 → admin, con cualquier nombre o sin nombre', () => {
    expect(isOrgAdminLike({ isSuperAdmin: false, roleId: 1 })).toBe(true);
    expect(isOrgAdminLike({ isSuperAdmin: false, roleId: 2, roleName: 'cualquiera' })).toBe(true);
  });

  test('is_super_admin → admin aunque el rol sea otro', () => {
    expect(isOrgAdminLike({ isSuperAdmin: true, roleId: 7 })).toBe(true);
  });

  test('un rol personalizado con NOMBRE de admin y otro id NO es admin (regla dura 6)', () => {
    expect(isOrgAdminLike({ isSuperAdmin: false, roleId: 99, roleName: 'Admin de organización' })).toBe(false);
    expect(isOrgAdminLike({ isSuperAdmin: false, roleId: 99, roleName: 'Super Admin' })).toBe(false);
    expect(isOrgAdminLike({ isSuperAdmin: false, roleId: 5, roleName: 'Manager' })).toBe(false);
  });

  test('valores raros no conceden: isSuperAdmin no booleano, roleId NaN/0/negativo', () => {
    expect(isOrgAdminLike({ isSuperAdmin: 'true' as unknown as boolean, roleId: 4 })).toBe(false);
    expect(isOrgAdminLike({ isSuperAdmin: false, roleId: Number.NaN })).toBe(false);
    expect(isOrgAdminLike({ isSuperAdmin: false, roleId: 0 })).toBe(false);
    expect(isOrgAdminLike({ isSuperAdmin: false, roleId: -1 })).toBe(false);
  });
});
