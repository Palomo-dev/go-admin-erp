/**
 * Regla 6 de CLAUDE.md: «admin» nunca se decide por el nombre del rol. La
 * antigua RolesSection lo deducía de `role_name` («admin» / «super»): un rol
 * personalizado llamado así veía «Gestionar sucursales». Desde 2026-10-05 la
 * sección es `OrganizacionRolesSection` (Figma 346:21440) y decide
 * `isOrgAdminLike` por `role_id` e `is_super_admin`.
 */
import fs from 'fs';
import path from 'path';

const fuente = fs.readFileSync(path.join(process.cwd(), 'src/components/profile/OrganizacionRolesSection.tsx'), 'utf8');

describe('OrganizacionRolesSection: admin por id de rol, no por nombre', () => {
  it('no compara el nombre del rol con «admin» ni «super»', () => {
    expect(fuente).not.toMatch(/\.rol\??\.toLowerCase\(\)|role_name/);
    expect(fuente).not.toMatch(/includes\(['"](admin|super)['"]\)/);
  });

  it('usa isOrgAdminLike con roleId e esSuperAdmin', () => {
    expect(fuente).toMatch(/import \{ isOrgAdminLike \} from '@\/lib\/utils\/orgAdmin'/);
    expect(fuente).toMatch(/isOrgAdminLike\(\{ isSuperAdmin: m\.esSuperAdmin === true, roleId: Number\(m\.roleId \?\? 0\) \}\)/);
  });
});
