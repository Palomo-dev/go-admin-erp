/// <reference types="jest" />
/**
 * F12-misc — `TierEditor` mostraba crear/editar/borrar a todo miembro aunque
 * el PATCH/DELETE de `/api/crm/partners/tiers/**` ya exigían admin/manager
 * (`requirePartnerManager`, regla dura 5/6: el permiso se resuelve en el
 * servidor). Ahora recibe `canManage` — el mismo booleano que `PartnerList`
 * ya usa, calculado por `canManagePartners` en el GET de partners — y oculta
 * las acciones de escritura cuando es `false`.
 *
 * Sin infraestructura de render de componentes en este repo (jest en node,
 * sin @testing-library): contrato estático sobre el fuente, como
 * `secuencias/__tests__/round4SourceContract.test.ts`.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

describe('TierEditor: acciones de escritura condicionadas a `canManage`', () => {
  const src = read('src/components/crm/partners/TierEditor.tsx');

  it('declara `canManage: boolean` en las props y lo recibe (no lo deriva de un rol)', () => {
    expect(src).toMatch(/canManage:\s*boolean/);
    expect(src).toMatch(/export function TierEditor\(\{[^}]*canManage[^}]*\}:\s*Props\)/);
    expect(src).not.toMatch(/roleName|role_name|roleId/);
  });

  it('«Nuevo tier» y el formulario de alta están tras `canManage`', () => {
    expect(src).toMatch(/\{canManage && \(\s*<Button ref=\{newButtonRef\}/);
    expect(src).toMatch(/\{canManage && creating && \(/);
  });

  it('la creación no se fuerza a `true` para quien no puede gestionar (tiers vacíos)', () => {
    expect(src).toMatch(/setCreating\(canManage && tiers\.length === 0\)/);
  });

  it('«Editar» y «Eliminar» de cada tier, y su formulario de edición, están tras `canManage`', () => {
    expect(src).toMatch(/\{canManage && \(\s*<div className="flex shrink-0 gap-1">/);
    expect(src).toMatch(/aria-label=\{`Eliminar tier \$\{t\.name\}`\}/);
    expect(src).toMatch(/\{canManage && isEditing && <div className="mt-4/);
  });

  it('no queda texto de "no tienes permiso" añadido para el estado de solo lectura', () => {
    expect(src).not.toMatch(/no tienes permiso/i);
  });
});

describe('PartnersPage: propaga el mismo `canManage` de `usePartners` a `TierEditor`', () => {
  it('pasa `canManage={canManage}` (no un valor fijo ni otro booleano)', () => {
    const src = read('src/components/crm/partners/PartnersPage.tsx');
    expect(src).toMatch(/<TierEditor open=\{tiersOpen\} tiers=\{tiers\} canManage=\{canManage\}/);
  });
});
