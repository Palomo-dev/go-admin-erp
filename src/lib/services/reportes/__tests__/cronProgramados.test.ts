/**
 * Cron de envíos programados (plan de reportes v2, decisión 11).
 * - El envío se reclama con un UPDATE condicionado a `next_run_at`: si otro
 *   cron ya lo tomó, no sale ningún correo.
 * - Cada miembro recibe el reporte generado con SU sesión; si ya no tiene
 *   membresía, permiso o alcance, se pausa para él y se avisa a quien lo programó.
 * - Un externo pendiente no recibe nada; uno aprobado sale con la sesión de
 *   quien lo programó, y solo si quien lo aprobó sigue siendo administrador.
 * - Si quien lo programó ya no es miembro, el envío entero se pausa.
 * - La clave idempotente del correo incluye la ejecución (`next_run_at`).
 */
import { OrgContextError } from '@/lib/utils/orgContextError';
import { fakeTablas } from './fakeTablas';

const ORG = 120;
const DUENO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ANA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LUIS = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const EXADMIN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const VENCE = '2026-09-30T12:00:00.000Z';

const guion = {
  sesiones: new Set<string>([DUENO, ANA, LUIS]),
  fallaArchivosDe: new Map<string, Error>(),
};
const archivosPedidos: Array<{ userId: string; idioma: string }> = [];
const correos: Array<{ para: string; clave: string; externo: boolean; idioma: string }> = [];

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn() }));
jest.mock('@/lib/services/monedaOrganizacion', () => ({ resolverContextoMoneda: jest.fn(async () => null) }));
jest.mock('@/lib/documents/textos', () => ({
  cargarTextos: jest.fn(async () => (clave: string, vars?: Record<string, unknown>) => (vars ? `${clave}:${JSON.stringify(vars)}` : clave)),
}));
jest.mock('@/lib/utils/orgContext', () => ({
  hasOrgAdminOrPermission: jest.fn(async (s: { roleId: number }) => s.roleId === 1 || s.roleId === 2),
}));
jest.mock('@/lib/services/reportes/programados/sesionMiembro.server', () => ({
  sesionDeMiembro: jest.fn(async (organizationId: number, userId: string) =>
    guion.sesiones.has(userId) ? { userId, organizationId, memberId: 1, organizationName: 'Org de prueba' } : null,
  ),
}));
async function archivosFalsos(sesion: { userId: string }, _envio: unknown, idioma: string) {
  archivosPedidos.push({ userId: sesion.userId, idioma });
  const err = guion.fallaArchivosDe.get(sesion.userId);
  if (err) throw err;
  return { titulo: 'Ventas por día', adjuntos: [] };
}
jest.mock('@/lib/services/reportes/programados/archivosMiembro.server', () => ({ archivosParaMiembro: jest.fn(archivosFalsos) }));
jest.mock('@/lib/services/reportes/programados/envio.server', () => ({
  idiomaDe: (v: unknown) => (typeof v === 'string' && ['es', 'en', 'pt', 'fr'].includes(v) ? v : 'es'),
  archivosDelEnvio: jest.fn(archivosFalsos),
  enviarCorreoReporte: jest.fn(async (c: { para: string; clave: string; externo: boolean; idioma: string }) => {
    correos.push({ para: c.para, clave: c.clave, externo: c.externo, idioma: c.idioma });
    return 'email-1';
  }),
}));

import { motivoDeError, procesarEnvio, resultadoDe } from '../programados/cron.server';
import type { FilaProgramado } from '../programados/programados.server';

function fila(recipients: unknown[], extra: Partial<FilaProgramado> = {}): FilaProgramado {
  return {
    id: 'prog-1',
    organization_id: ORG,
    user_id: DUENO,
    name: 'Ventas de la semana',
    frequency: 'weekly',
    recipients,
    next_run_at: VENCE,
    is_active: true,
    report_id: 'ventas-por-dia',
    filtros: { periodo: 'semanal' },
    branch_id: null,
    formato: 'pdf',
    hora: '07:00:00',
    dia: 3,
    dias_semana: null,
    zona_horaria: 'America/Bogota',
    last_run_at: null,
    last_status: null,
    last_error: null,
    created_at: null,
    ...extra,
  };
}

const miembro = (user_id: string, email: string, estado = 'activo') => ({ tipo: 'miembro', user_id, email, nombre: null, estado });
const externo = (email: string, estado: string, aprobado_por: string | null) => ({ tipo: 'externo', email, estado, aprobado_por });

function montar(f: FilaProgramado, miembros: Array<{ user_id: string; role_id: number }> = [{ user_id: DUENO, role_id: 2 }]) {
  return fakeTablas({
    scheduled_reports: [{ ...f }],
    profiles: [
      { id: DUENO, email: 'dueno@example.com', first_name: 'Dueño', last_name: null, preferred_language: 'es' },
      { id: ANA, email: 'ana@example.com', first_name: 'Ana', last_name: 'Gómez', preferred_language: 'en' },
      { id: LUIS, email: 'luis@example.com', first_name: 'Luis', last_name: null, preferred_language: null },
    ],
    organization_members: miembros.map((m) => ({ organization_id: ORG, is_active: true, is_super_admin: false, ...m })),
  });
}

const AHORA = new Date('2026-09-30T12:05:00.000Z');

beforeEach(() => {
  guion.sesiones = new Set([DUENO, ANA, LUIS]);
  guion.fallaArchivosDe.clear();
  archivosPedidos.length = 0;
  correos.length = 0;
});

describe('procesarEnvio', () => {
  it('si otro cron ya reclamó el envío, no manda nada ni toca el resultado', async () => {
    const f = fila([miembro(ANA, 'ana@example.com')]);
    const db = montar(f);
    (db.tablas.scheduled_reports[0] as Record<string, unknown>).next_run_at = '2026-10-07T12:00:00.000Z';
    const r = await procesarEnvio(db as never, f, AHORA);
    expect(r.estado).toBe('reclamado_por_otro');
    expect(correos).toHaveLength(0);
    expect(db.escrituras.filter((e) => e.afectadas > 0)).toHaveLength(0);
  });

  it('reclama moviendo next_run_at al siguiente, condicionado al valor leído', async () => {
    const f = fila([miembro(ANA, 'ana@example.com')]);
    const db = montar(f);
    await procesarEnvio(db as never, f, AHORA);
    const reclamo = db.escrituras[0];
    expect(reclamo.filtros).toEqual(expect.arrayContaining([['next_run_at', 'eq', VENCE], ['is_active', 'eq', true]]));
    expect(reclamo.valores?.next_run_at).toBe('2026-10-07T12:00:00.000Z');
  });

  it('cada miembro recibe con su sesión y su idioma; la clave incluye la ejecución', async () => {
    const f = fila([miembro(ANA, 'ana@example.com'), miembro(LUIS, 'luis@example.com')]);
    const db = montar(f);
    const r = await procesarEnvio(db as never, f, AHORA);
    expect(r).toMatchObject({ estado: 'enviado', enviados: 2, pausados: 0 });
    expect(archivosPedidos).toEqual([{ userId: ANA, idioma: 'en' }, { userId: LUIS, idioma: 'es' }]);
    expect(correos.map((c) => c.clave)).toEqual([
      `reporte-programado:prog-1:${VENCE}:ana@example.com`,
      `reporte-programado:prog-1:${VENCE}:luis@example.com`,
    ]);
    expect(db.tablas.scheduled_reports[0]).toMatchObject({ last_status: 'enviado', last_error: null });
  });

  it('si quien lo programó ya no es miembro, se pausa el envío entero', async () => {
    guion.sesiones.delete(DUENO);
    const f = fila([miembro(ANA, 'ana@example.com')]);
    const db = montar(f);
    const r = await procesarEnvio(db as never, f, AHORA);
    expect(r.estado).toBe('omitido');
    expect(correos).toHaveLength(0);
    expect(db.tablas.scheduled_reports[0]).toMatchObject({ is_active: false, last_status: 'omitido', last_error: 'creador_sin_acceso' });
  });

  it('un miembro sin alcance se pausa para él, los demás reciben, y se avisa a quien lo programó', async () => {
    guion.fallaArchivosDe.set(ANA, new OrgContextError('Sin acceso a la sucursal', 403, 'BRANCH_FORBIDDEN'));
    const f = fila([miembro(ANA, 'ana@example.com'), miembro(LUIS, 'luis@example.com')]);
    const db = montar(f);
    const r = await procesarEnvio(db as never, f, AHORA);
    expect(r).toMatchObject({ estado: 'enviado', enviados: 1, pausados: 1, fallidos: 0 });
    expect(correos.map((c) => c.para)).toEqual(['luis@example.com']);
    const guardados = db.tablas.scheduled_reports[0].recipients as Array<Record<string, unknown>>;
    expect(guardados.find((d) => d.user_id === ANA)).toMatchObject({ estado: 'pausado', motivo: 'sin_alcance' });
    expect(db.llamadas).toEqual([
      expect.objectContaining({
        nombre: 'fn_create_org_notification',
        args: expect.objectContaining({ p_organization_id: ORG, p_recipient_user_id: DUENO, p_type: 'reporte_programado_pausado' }),
      }),
    ]);
  });

  it('un miembro que dejó la organización se pausa con sin_membresia', async () => {
    guion.sesiones.delete(ANA);
    const f = fila([miembro(ANA, 'ana@example.com')]);
    const db = montar(f);
    const r = await procesarEnvio(db as never, f, AHORA);
    expect(r).toMatchObject({ estado: 'omitido', pausados: 1 });
    expect((db.tablas.scheduled_reports[0].recipients as Array<Record<string, unknown>>)[0]).toMatchObject({ estado: 'pausado', motivo: 'sin_membresia' });
  });

  it('los pausados no vuelven a recibir hasta que se reanude', async () => {
    const f = fila([miembro(ANA, 'ana@example.com', 'pausado')]);
    const db = montar(f);
    const r = await procesarEnvio(db as never, f, AHORA);
    expect(r.enviados).toBe(0);
    expect(correos).toHaveLength(0);
  });

  it('un externo pendiente de aprobación no recibe nada', async () => {
    const f = fila([externo('contador@example.com', 'pendiente', null)]);
    const db = montar(f);
    await procesarEnvio(db as never, f, AHORA);
    expect(correos).toHaveLength(0);
  });

  it('un externo aprobado por un administrador vigente recibe lo que ve quien lo programó', async () => {
    const f = fila([externo('contador@example.com', 'activo', DUENO)]);
    const db = montar(f);
    const r = await procesarEnvio(db as never, f, AHORA);
    expect(r.enviados).toBe(1);
    expect(archivosPedidos).toEqual([{ userId: DUENO, idioma: 'es' }]);
    expect(correos).toEqual([expect.objectContaining({ para: 'contador@example.com', externo: true })]);
  });

  it('si quien aprobó al externo ya no es administrador, el externo se pausa', async () => {
    const f = fila([externo('contador@example.com', 'activo', EXADMIN)]);
    const db = montar(f, [
      { user_id: DUENO, role_id: 2 },
      { user_id: EXADMIN, role_id: 5 },
    ]);
    const r = await procesarEnvio(db as never, f, AHORA);
    expect(r).toMatchObject({ enviados: 0, pausados: 1 });
    expect(correos).toHaveLength(0);
    expect((db.tablas.scheduled_reports[0].recipients as Array<Record<string, unknown>>)[0]).toMatchObject({ estado: 'pausado', motivo: 'aprobador_sin_acceso' });
  });

  it('dos externos del mismo idioma comparten los archivos generados', async () => {
    const f = fila([externo('a@example.com', 'activo', DUENO), externo('b@example.com', 'activo', DUENO)]);
    const db = montar(f);
    await procesarEnvio(db as never, f, AHORA);
    expect(archivosPedidos).toHaveLength(1);
    expect(correos).toHaveLength(2);
  });

  it('un fallo técnico cuenta como fallido, no pausa, y deja el código en last_error', async () => {
    guion.fallaArchivosDe.set(ANA, new Error('timeout del PDF'));
    const f = fila([miembro(ANA, 'ana@example.com'), miembro(LUIS, 'luis@example.com')]);
    const db = montar(f);
    const r = await procesarEnvio(db as never, f, AHORA);
    expect(r).toMatchObject({ estado: 'parcial', enviados: 1, fallidos: 1, pausados: 0 });
    expect(db.tablas.scheduled_reports[0]).toMatchObject({ last_status: 'parcial', last_error: 'timeout del PDF' });
  });
});

describe('motivoDeError y resultadoDe', () => {
  it('traduce los errores de acceso a motivos de pausa y deja pasar los técnicos', () => {
    expect(motivoDeError(new OrgContextError('x', 403, 'PERMISSION_REQUIRED'))).toBe('sin_permiso');
    expect(motivoDeError(new OrgContextError('x', 403, 'BRANCH_SCOPE_REQUIRED'))).toBe('sin_alcance');
    expect(motivoDeError(new OrgContextError('x', 403, 'MODULO_NO_CONTRATADO'))).toBe('modulo_no_contratado');
    expect(motivoDeError(new OrgContextError('x', 403, 'ORG_FORBIDDEN'))).toBe('sin_membresia');
    expect(motivoDeError(new OrgContextError('x', 500, 'OTRO'))).toBeNull();
    expect(motivoDeError(new Error('red'))).toBeNull();
  });

  it('resume el resultado de la ejecución', () => {
    expect(resultadoDe(2, 0)).toBe('enviado');
    expect(resultadoDe(1, 1)).toBe('parcial');
    expect(resultadoDe(0, 1)).toBe('fallido');
    expect(resultadoDe(0, 0)).toBe('omitido');
  });
});
