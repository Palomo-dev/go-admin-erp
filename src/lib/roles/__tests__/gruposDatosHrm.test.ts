/**
 * Grupos de datos de RR. HH. en el editor de rol (diseño 10.RH.4).
 * Decisión del dueño (2026-11-15): con «Solo su equipo», salario, cuenta
 * bancaria y salud quedan bloqueados aunque se marquen.
 */
import { accionDe, sensibilidadDe, type PermisoCatalogo } from '../matrizPermisos';
import {
  BLOQUEADOS_CON_EQUIPO,
  aplicarAlcance,
  alternarEditarGrupo,
  alternarVerGrupo,
  esCodigoDeAlcance,
  leerGruposHrm,
} from '../gruposDatosHrm';

const GRUPOS = ['identificacion', 'salario_pago', 'banco', 'salud', 'disciplinario', 'sst'];
const CODIGOS = [
  'hr.employees.view',
  'hr.employees.view_branch',
  'hr.employees.view_team',
  'hr.employees.edit',
  'hr.leaves.approve',
  ...GRUPOS.flatMap((g) => [`hr.data.${g}.view`, `hr.data.${g}.view_branch`, `hr.data.${g}.view_team`, `hr.data.${g}.edit`]),
];
const CATALOGO: PermisoCatalogo[] = CODIGOS.map((codigo, i) => ({ id: i + 1, codigo, modulo: 'hr', nombre: codigo, accion: accionDe(codigo), sensible: sensibilidadDe(codigo, 'hr') }));
const id = (codigo: string) => CATALOGO.find((p) => p.codigo === codigo)!.id;
const codigos = (sel: ReadonlySet<number>) => CATALOGO.filter((p) => sel.has(p.id)).map((p) => p.codigo).sort();

describe('matriz: alcance y sensibilidad de RR. HH.', () => {
  test('view_team y view_branch son «Ver»; los grupos son «Sensible · datos»', () => {
    expect(accionDe('hr.data.salud.view_team')).toBe('ver');
    expect(accionDe('hr.employees.view_branch')).toBe('ver');
    expect(sensibilidadDe('hr.data.salario_pago.view', 'hr')).toBe('datos');
    expect(sensibilidadDe('hr.employees.edit', 'hr')).toBe('datos');
    expect(sensibilidadDe('hr.payroll.process', 'hr')).toBe('dinero');
  });

  test('la vista reemplaza solo los códigos de alcance y de grupos', () => {
    expect(esCodigoDeAlcance('hr.employees.view_team')).toBe(true);
    expect(esCodigoDeAlcance('hr.data.banco.edit')).toBe(true);
    expect(esCodigoDeAlcance('hr.data.export')).toBe(false);
    expect(esCodigoDeAlcance('hr.employees.edit')).toBe(false);
    expect(esCodigoDeAlcance('hr.leaves.approve')).toBe(false);
  });
});

describe('grupos de datos', () => {
  test('sin «Ver empleados» no hay alcance', () => {
    expect(leerGruposHrm(CATALOGO, new Set()).alcance).toBeNull();
  });

  test('cambiar a «Solo su equipo» quita salario, banco y salud (ver y editar) y conserva el resto con el nuevo sufijo', () => {
    const sel = new Set([
      id('hr.employees.view'),
      id('hr.data.salario_pago.view'),
      id('hr.data.salario_pago.edit'),
      id('hr.data.identificacion.view'),
      id('hr.data.sst.view'),
      id('hr.data.sst.edit'),
      id('hr.leaves.approve'),
    ]);
    const equipo = aplicarAlcance(CATALOGO, sel, 'equipo');
    expect(codigos(equipo)).toEqual(
      ['hr.data.identificacion.view_team', 'hr.data.sst.edit', 'hr.data.sst.view_team', 'hr.employees.view_team', 'hr.leaves.approve'].sort(),
    );
    const estado = leerGruposHrm(CATALOGO, equipo);
    for (const g of BLOQUEADOS_CON_EQUIPO) expect(estado.grupos[g]).toEqual({ ver: false, editar: false, bloqueado: true });
  });

  test('con «Solo su equipo», marcar un grupo bloqueado no hace nada', () => {
    const sel = aplicarAlcance(CATALOGO, new Set(), 'equipo');
    expect(alternarVerGrupo(CATALOGO, sel, 'salud')).toEqual(sel);
    expect(alternarEditarGrupo(CATALOGO, sel, 'banco')).toEqual(sel);
  });

  test('«Sus sedes» usa view_branch; editar marca también ver; quitar ver quita editar', () => {
    let sel = aplicarAlcance(CATALOGO, new Set(), 'sedes');
    sel = alternarEditarGrupo(CATALOGO, sel, 'salario_pago');
    expect(codigos(sel)).toEqual(['hr.data.salario_pago.edit', 'hr.data.salario_pago.view_branch', 'hr.employees.view_branch']);
    sel = alternarVerGrupo(CATALOGO, sel, 'salario_pago');
    expect(codigos(sel)).toEqual(['hr.employees.view_branch']);
  });

  test('quitar el alcance quita todo lo que se ve a través de él, pero no editar ni otros permisos', () => {
    const sel = new Set([id('hr.employees.view'), id('hr.data.sst.view'), id('hr.data.sst.edit'), id('hr.leaves.approve')]);
    expect(codigos(aplicarAlcance(CATALOGO, sel, null))).toEqual(['hr.data.sst.edit', 'hr.leaves.approve']);
  });

  test('el alcance más amplio manda si hay varios marcados', () => {
    const sel = new Set([id('hr.employees.view_team'), id('hr.employees.view')]);
    expect(leerGruposHrm(CATALOGO, sel).alcance).toBe('organizacion');
  });
});
