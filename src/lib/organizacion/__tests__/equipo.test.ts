/**
 * Equipo (Miembros e Invitaciones) — lógica pura. Datos ficticios con la forma
 * real de `get_profiles_by_organization` e `invitations`.
 */
import {
  accionesInvitacion,
  contarVigentes,
  diasParaVencer,
  estadoInvitacion,
  filtrarInvitaciones,
  normalizar,
  ocupaCupo,
  ordenarInvitaciones,
} from '../invitaciones';
import {
  FILTROS_MIEMBRO_VACIOS,
  agruparMiembros,
  alcanceSedes,
  contarFiltrosActivos,
  filtrarMiembros,
  puedeQuitarSede,
  separarSeleccion,
  type FilaPerfilMiembro,
} from '../miembros';

const AHORA = Date.parse('2026-10-06T15:00:00Z');
const DIA = 86_400_000;
const enDias = (n: number) => new Date(AHORA + n * DIA).toISOString();

describe('estadoInvitacion', () => {
  test('pendiente vigente, vencida por fecha y vencida guardada', () => {
    expect(estadoInvitacion({ status: 'pending', expires_at: enDias(3) }, AHORA)).toBe('pendiente');
    expect(estadoInvitacion({ status: 'pending', expires_at: enDias(-1) }, AHORA)).toBe('vencida');
    expect(estadoInvitacion({ status: 'expired', expires_at: null }, AHORA)).toBe('vencida');
    expect(estadoInvitacion({ status: 'pending', expires_at: null }, AHORA)).toBe('pendiente');
  });

  test('aceptada, revocada y estados desconocidos (había una fila «half»)', () => {
    expect(estadoInvitacion({ status: 'used', expires_at: null }, AHORA)).toBe('aceptada');
    expect(estadoInvitacion({ status: 'revoked', expires_at: null }, AHORA)).toBe('revocada');
    expect(estadoInvitacion({ status: 'half', expires_at: enDias(5) }, AHORA)).toBe('revocada');
    expect(estadoInvitacion({ status: null, expires_at: null }, AHORA)).toBe('revocada');
  });

  test('una vencida no ocupa cupo (P1-5)', () => {
    const filas = [
      { status: 'pending', expires_at: enDias(2) },
      { status: 'pending', expires_at: enDias(-2) },
      { status: 'used', expires_at: null },
      { status: 'pending', expires_at: null },
    ];
    expect(ocupaCupo(filas[1], AHORA)).toBe(false);
    expect(contarVigentes(filas, AHORA)).toBe(2);
  });

  test('días para vencer', () => {
    expect(diasParaVencer({ status: 'pending', expires_at: enDias(3.5) }, AHORA)).toBe(3);
    expect(diasParaVencer({ status: 'pending', expires_at: enDias(0.2) }, AHORA)).toBe(0);
    expect(diasParaVencer({ status: 'pending', expires_at: enDias(-1) }, AHORA)).toBeNull();
    expect(diasParaVencer({ status: 'pending', expires_at: null }, AHORA)).toBeNull();
  });

  test('acciones: reenviar pendientes y vencidas; revocar solo pendientes', () => {
    expect(accionesInvitacion('pendiente')).toEqual({ reenviar: true, revocar: true });
    expect(accionesInvitacion('vencida')).toEqual({ reenviar: true, revocar: false });
    expect(accionesInvitacion('aceptada')).toEqual({ reenviar: false, revocar: false });
    expect(accionesInvitacion('revocada')).toEqual({ reenviar: false, revocar: false });
  });
});

describe('filtrar y ordenar invitaciones', () => {
  const filas = [
    { id: 1, email: 'ana@ejemplo.co', role_id: 3, status: 'used', expires_at: null, created_at: '2026-09-01' },
    { id: 2, email: 'Íñigo@ejemplo.co', role_id: 2, status: 'pending', expires_at: enDias(5), created_at: '2026-10-01' },
    { id: 3, email: 'luis@ejemplo.co', role_id: 3, status: 'pending', expires_at: enDias(-1), created_at: '2026-09-20' },
    { id: 4, email: 'marta@ejemplo.co', role_id: 3, status: 'pending', expires_at: enDias(9), created_at: '2026-10-05' },
  ];

  test('un buscador sin tildes ni mayúsculas', () => {
    expect(normalizar('  ÍÑIGO ')).toBe('inigo');
    expect(filtrarInvitaciones(filas, { texto: 'inigo', estado: 'todas', rolId: null }, AHORA).map((f) => f.id)).toEqual([2]);
  });

  test('por estado y por rol', () => {
    expect(filtrarInvitaciones(filas, { texto: '', estado: 'vencida', rolId: null }, AHORA).map((f) => f.id)).toEqual([3]);
    expect(filtrarInvitaciones(filas, { texto: '', estado: 'todas', rolId: 2 }, AHORA).map((f) => f.id)).toEqual([2]);
  });

  test('pendientes primero (la más reciente arriba), luego vencidas y aceptadas', () => {
    expect(ordenarInvitaciones(filas, AHORA).map((f) => f.id)).toEqual([4, 2, 3, 1]);
  });
});

const fila = (p: Partial<FilaPerfilMiembro> & { id: number }): FilaPerfilMiembro => ({
  first_name: null,
  last_name: null,
  email: null,
  role_id: 3,
  role_name: 'Empleado',
  is_active: true,
  is_super_admin: false,
  branch_id: null,
  branch_name: null,
  job_position_name: null,
  created_at: '2026-01-01',
  ...p,
});

describe('agruparMiembros', () => {
  const filas: FilaPerfilMiembro[] = [
    fila({ id: 10, first_name: 'Zoe', last_name: 'Ruiz', email: 'zoe@ejemplo.co', branch_id: 2, branch_name: 'Norte' }),
    fila({ id: 10, first_name: 'Zoe', last_name: 'Ruiz', email: 'zoe@ejemplo.co', branch_id: 1, branch_name: 'Centro' }),
    fila({ id: 10, first_name: 'Zoe', last_name: 'Ruiz', email: 'zoe@ejemplo.co', branch_id: 1, branch_name: 'Centro' }),
    fila({ id: 11, first_name: 'Ana', last_name: 'Gómez', email: 'ana@ejemplo.co', role_id: 2, role_name: 'Admin', job_position_name: 'Gerente' }),
    fila({ id: 12, email: 'sin-nombre@ejemplo.co', is_active: false }),
  ];
  const miembros = agruparMiembros(filas, new Map([['10', 'u-10'], ['11', 'u-11']]));

  test('una fila por miembro, sedes sin duplicar y ordenadas', () => {
    expect(miembros).toHaveLength(3);
    const zoe = miembros.find((m) => m.id === '10')!;
    expect(zoe.sedes.map((s) => s.nombre)).toEqual(['Centro', 'Norte']);
    expect(zoe.userId).toBe('u-10');
  });

  test('ordenados por nombre (o correo si no tiene)', () => {
    expect(miembros.map((m) => m.id)).toEqual(['11', '12', '10']);
  });

  test('sin sedes = todas las sedes', () => {
    const ana = miembros.find((m) => m.id === '11')!;
    expect(alcanceSedes(ana)).toEqual({ todas: true });
    expect(alcanceSedes(miembros.find((m) => m.id === '10')!)).toMatchObject({ todas: false });
  });

  test('nunca se ofrece quitar la última sede (ampliaría el acceso)', () => {
    const zoe = miembros.find((m) => m.id === '10')!;
    expect(puedeQuitarSede(zoe, 1)).toBe(true);
    expect(puedeQuitarSede(zoe, 99)).toBe(false);
    expect(puedeQuitarSede({ sedes: [{ id: 1, nombre: 'Centro' }] }, 1)).toBe(false);
  });

  test('filtros por valor, no por el texto traducido (P1-7)', () => {
    expect(filtrarMiembros(miembros, { ...FILTROS_MIEMBRO_VACIOS, estado: 'inactivo' }).map((m) => m.id)).toEqual(['12']);
    expect(filtrarMiembros(miembros, { ...FILTROS_MIEMBRO_VACIOS, rolId: 2 }).map((m) => m.id)).toEqual(['11']);
    expect(filtrarMiembros(miembros, { ...FILTROS_MIEMBRO_VACIOS, texto: 'gerente' }).map((m) => m.id)).toEqual(['11']);
    // Un miembro sin sedes cuenta en todas.
    expect(filtrarMiembros(miembros, { ...FILTROS_MIEMBRO_VACIOS, sedeId: 2 }).map((m) => m.id)).toEqual(['11', '12', '10']);
    expect(filtrarMiembros(miembros, { ...FILTROS_MIEMBRO_VACIOS, sedeId: 3 }).map((m) => m.id)).toEqual(['11', '12']);
  });

  test('conteo de filtros activos (el buscador no cuenta)', () => {
    expect(contarFiltrosActivos({ texto: 'x', rolId: 2, sedeId: null, estado: 'activo' })).toBe(2);
  });

  test('selección masiva: se omiten uno mismo y los super admin', () => {
    const conSuper = [...miembros, { ...miembros[0], id: '13', userId: 'u-13', esSuperAdmin: true }];
    const { aplicables, omitidos } = separarSeleccion(conSuper, new Set(['10', '11', '13']), 'u-11');
    expect(aplicables.map((m) => m.id)).toEqual(['10']);
    expect(omitidos.map((m) => m.id).sort()).toEqual(['11', '13']);
  });
});
