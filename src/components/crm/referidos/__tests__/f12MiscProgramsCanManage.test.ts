/// <reference types="jest" />
/**
 * F12-misc — `GET /api/crm/referrals/programs` no devolvía `can_manage`, así
 * que `ReferralProgramsSheet` mostraba crear/editar/borrar a todo miembro
 * aunque el PATCH/DELETE/POST de `/api/crm/referrals/programs/**` ya exigían
 * admin/manager (`requirePartnerManager`, regla dura 5/6). Ahora el GET lo
 * calcula con `canManagePartners` (la misma función que partners, regla dura
 * 7 — no se duplica la lista de roles), `useReferrals` lo propaga y la hoja
 * oculta las acciones de escritura cuando es `false`. El contrato del GET
 * (rol 4 → false, 5/2/super admin → true) vive en
 * `src/app/api/crm/referrals/__tests__/referralsProgramsCanManage.contract.test.ts`
 * (archivo aparte: `referrals.contract.test.ts` ya iba en 311 líneas).
 *
 * Sin infraestructura de render de componentes en este repo (jest en node,
 * sin @testing-library): contrato estático sobre el fuente, como
 * `secuencias/__tests__/round4SourceContract.test.ts`.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

describe('GET /api/crm/referrals/programs: expone `can_manage` con la función única', () => {
  it('usa `canManagePartners(ctx)` (no una lista de roles propia)', () => {
    const src = read('src/app/api/crm/referrals/programs/route.ts');
    expect(src).toMatch(/import\s*\{[^}]*canManagePartners[^}]*\}\s*from\s*'@\/lib\/services\/crm\/f12RouteSupport'/);
    expect(src).toMatch(/can_manage:\s*canManagePartners\(ctx\)/);
    expect(src).not.toMatch(/roleName|role_name|===\s*'admin'|===\s*'manager'/i);
  });
});

describe('useReferrals: propaga `can_manage` del GET, no lo inventa en el cliente', () => {
  const src = read('src/components/crm/referidos/useReferrals.ts');

  it('lo lee del body del GET de programas como booleano estricto', () => {
    expect(src).toMatch(/setCanManage\(progs\.body\.can_manage === true\)/);
  });

  it('lo expone en el valor de retorno del hook', () => {
    expect(src).toMatch(/return \{ referrals, programs, requests, currency, canManage,/);
  });

  it('no deriva el permiso de un nombre de rol en el cliente', () => {
    expect(src).not.toMatch(/roleName|role_name/);
  });
});

describe('ReferralProgramsSheet: acciones de escritura condicionadas a `canManage`', () => {
  const src = read('src/components/crm/referidos/ReferralProgramsSheet.tsx');

  it('declara `canManage: boolean` en las props y lo recibe', () => {
    expect(src).toMatch(/canManage:\s*boolean/);
    expect(src).toMatch(/export function ReferralProgramsSheet\(\{[^}]*canManage[^}]*\}:\s*Props\)/);
  });

  it('«Nuevo programa» y el formulario de alta están tras `canManage`', () => {
    expect(src).toMatch(/\{canManage && \(\s*<Button ref=\{newButtonRef\}/);
    expect(src).toMatch(/\{canManage && creating && \(/);
  });

  it('la creación no se fuerza a `true` para quien no puede gestionar (lista vacía)', () => {
    expect(src).toMatch(/setCreating\(canManage && programs\.length === 0\)/);
  });

  it('«Editar» y «Eliminar» de cada programa, y su formulario de edición, están tras `canManage`', () => {
    expect(src).toMatch(/\{canManage && \(\s*<div className="flex shrink-0 gap-1">/);
    expect(src).toMatch(/aria-label=\{`Eliminar programa \$\{p\.name\}`\}/);
    expect(src).toMatch(/\{canManage && isEditing && \(/);
  });

  it('no queda texto de "no tienes permiso" añadido para el estado de solo lectura', () => {
    expect(src).not.toMatch(/no tienes permiso/i);
  });
});

describe('ReferidosPage: propaga el mismo `canManage` de `useReferrals` a `ReferralProgramsSheet`', () => {
  it('pasa `canManage={canManage}` (no un valor fijo ni otro booleano)', () => {
    const src = read('src/components/crm/referidos/ReferidosPage.tsx');
    expect(src).toMatch(/const \{ referrals, programs, requests, currency, canManage,/);
    expect(src).toMatch(/<ReferralProgramsSheet open=\{programsOpen\} programs=\{programs\} currency=\{currency\} canManage=\{canManage\}/);
  });
});
