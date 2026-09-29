/**
 * Regla 6 de CLAUDE.md: «admin» nunca se decide por el nombre del rol. RolesSection
 * lo deducía de `role_name` («admin» / «super»): un rol personalizado llamado así
 * veía «Gestionar sucursales». Ahora decide `isOrgAdminLike` por `role_id` e
 * `is_super_admin`.
 */
import fs from 'fs';
import path from 'path';

const fuente = fs.readFileSync(path.join(process.cwd(), 'src/components/profile/RolesSection.tsx'), 'utf8');

describe('RolesSection: admin por id de rol, no por nombre', () => {
  it('no compara role_name con «admin» ni «super»', () => {
    expect(fuente).not.toMatch(/role_name\??\.toLowerCase\(\)/);
    expect(fuente).not.toMatch(/includes\(['"](admin|super)['"]\)/);
  });

  it('usa isOrgAdminLike con role_id e is_super_admin', () => {
    expect(fuente).toMatch(/import \{ isOrgAdminLike \} from '@\/lib\/utils\/orgAdmin'/);
    expect(fuente).toMatch(/isOrgAdminLike\(\{ isSuperAdmin: r\.is_super_admin === true, roleId: Number\(r\.role_id \?\? 0\) \}\)/);
  });
});
