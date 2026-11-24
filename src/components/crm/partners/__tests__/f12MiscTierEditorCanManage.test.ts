/// <reference types="jest" />
/**
 * F12-misc — `TierEditor` mostraba crear/editar/borrar a todo miembro aunque
 * el PATCH/DELETE de `/api/crm/partners/tiers/**` ya exigían admin/manager
 * (`requirePartnerManager`, regla dura 5/6: el permiso se resuelve en el
 * servidor). Recibe `canManage` — el booleano que el GET de partners calcula
 * con `canManagePartners` — y oculta las acciones de escritura cuando es `false`.
 *
 * Rediseño Figma 2026-11-15 (zona F, Partners): los textos pasaron a
 * `crm.redPartners` y la página a `PartnersPantalla`; el contrato es el mismo.
 *
 * Sin infraestructura de render de componentes en este repo (jest en node,
 * sin @testing-library): contrato estático sobre el fuente.
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

  it('«Nuevo nivel» y el formulario de alta están tras `canManage`', () => {
    expect(src).toMatch(/\{canManage && \(\s*<button ref=\{nuevoRef\}/);
    expect(src).toMatch(/\{canManage && creando && \(/);
  });

  it('la creación no se fuerza a `true` para quien no puede gestionar (niveles vacíos)', () => {
    expect(src).toMatch(/setCreando\(canManage && tiers\.length === 0\)/);
  });

  it('«Editar» y «Eliminar» de cada nivel, y su formulario de edición, están tras `canManage`', () => {
    expect(src).toMatch(/\{canManage && \(\s*<div className="flex shrink-0 gap-1">/);
    expect(src).toMatch(/aria-label=\{t\('niveles\.eliminarAria', \{ nombre: x\.name \}\)\}/);
    expect(src).toMatch(/\{canManage && editando && \(/);
  });

  it('no queda texto de "no tienes permiso" añadido para el estado de solo lectura', () => {
    expect(src).not.toMatch(/no tienes permiso/i);
  });
});

describe('PartnersPantalla: propaga el mismo `canManage` de `usePartners` a `TierEditor`', () => {
  it('pasa `canManage={d.canManage}` (no un valor fijo ni otro booleano)', () => {
    const src = read('src/components/crm/partners/PartnersPantalla.tsx');
    expect(src).toMatch(/<TierEditor abierto=\{niveles\} tiers=\{d\.tiers\} canManage=\{d\.canManage\}/);
  });
});
