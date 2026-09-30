/**
 * Envíos programados, piezas puras:
 * - próximo envío por frecuencia, en hora de pared de la zona (también con
 *   cambio de horario);
 * - periodo que cubre cada envío (el anterior completo, con franja);
 * - lectura defensiva de destinatarios y filtros guardados;
 * - contrato del diálogo;
 * - JWT del destinatario: solo los claims permitidos, HS256 y 5 minutos;
 * - Excel y CSV del reporte congelado.
 */
import { createHmac } from 'node:crypto';
import * as XLSX from 'xlsx';
import {
  diaSemana,
  leerDestinatarios,
  leerFiltros,
  periodoDelEnvio,
  proximoEnvio,
  type Programacion,
} from '../programados/programacion';
import { accionProgramadoSchema, programadoSchema } from '../contrato';
import { CLAIMS_SESION_ENVIO, TTL_SESION_ENVIO_SEGUNDOS, firmarJwtMiembro } from '../programados/sesionMiembro.server';
import { reporteACsv, reporteAExcel } from '../exportarTabla';
import type { ReporteCongelado } from '../cierres/snapshot';

const BOGOTA = 'America/Bogota';
const prog = (p: Partial<Programacion>): Programacion => ({ frequency: 'daily', hora: '07:00', dia: null, dias_semana: null, zona: BOGOTA, ...p });
const iso = (d: Date | null) => d?.toISOString() ?? null;

describe('proximoEnvio', () => {
  // Miércoles 30 de septiembre de 2026, 10:00 en Bogotá (15:00 UTC).
  const desde = new Date('2026-09-30T15:00:00Z');

  test('diario: si ya pasó la hora de hoy, mañana a la misma hora local', () => {
    expect(iso(proximoEnvio(prog({ hora: '07:00' }), desde))).toBe('2026-10-01T12:00:00.000Z');
    expect(iso(proximoEnvio(prog({ hora: '23:30:00' }), desde))).toBe('2026-10-01T04:30:00.000Z');
  });

  test('semanal: el día ISO elegido (1 = lunes)', () => {
    expect(iso(proximoEnvio(prog({ frequency: 'weekly', dia: 1 }), desde))).toBe('2026-10-05T12:00:00.000Z');
    expect(iso(proximoEnvio(prog({ frequency: 'weekly', dia: 3, hora: '11:00' }), desde))).toBe('2026-09-30T16:00:00.000Z');
  });

  test('quincenal: días 1 y 16', () => {
    expect(iso(proximoEnvio(prog({ frequency: 'biweekly' }), desde))).toBe('2026-10-01T12:00:00.000Z');
    expect(iso(proximoEnvio(prog({ frequency: 'biweekly' }), new Date('2026-10-02T00:00:00Z')))).toBe('2026-10-16T12:00:00.000Z');
  });

  test('mensual y trimestral: el día del mes; el trimestral solo en ene, abr, jul y oct', () => {
    expect(iso(proximoEnvio(prog({ frequency: 'monthly', dia: 5, hora: '08:00' }), desde))).toBe('2026-10-05T13:00:00.000Z');
    expect(iso(proximoEnvio(prog({ frequency: 'quarterly', dia: 2 }), desde))).toBe('2026-10-02T12:00:00.000Z');
    expect(iso(proximoEnvio(prog({ frequency: 'quarterly', dia: 2 }), new Date('2026-10-03T00:00:00Z')))).toBe('2027-01-02T12:00:00.000Z');
  });

  test('personalizado: los días de la semana elegidos', () => {
    // Lunes, miércoles y viernes; el miércoles 30 ya pasó las 07:00 → viernes 2.
    expect(iso(proximoEnvio(prog({ frequency: 'custom', dias_semana: [1, 3, 5] }), desde))).toBe('2026-10-02T12:00:00.000Z');
  });

  test('programación incoherente → null', () => {
    expect(proximoEnvio(prog({ frequency: 'weekly', dia: null }), desde)).toBeNull();
    expect(proximoEnvio(prog({ frequency: 'monthly', dia: 31 }), desde)).toBeNull();
    expect(proximoEnvio(prog({ frequency: 'custom', dias_semana: [] }), desde)).toBeNull();
    expect(proximoEnvio(prog({ hora: '25:00' }), desde)).toBeNull();
  });

  test('con horario de verano la hora de pared se respeta', () => {
    // Santiago pasa a -03 el 6 de septiembre de 2026: las 07:00 son 11:00 UTC antes y 10:00 UTC después.
    const santiago = prog({ zona: 'America/Santiago' });
    expect(iso(proximoEnvio(santiago, new Date('2026-09-04T12:00:00Z')))).toBe('2026-09-05T11:00:00.000Z');
    expect(iso(proximoEnvio(santiago, new Date('2026-09-06T12:00:00Z')))).toBe('2026-09-07T10:00:00.000Z');
  });

  test('diaSemana ISO', () => {
    expect(diaSemana('2026-10-05')).toBe(1);
    expect(diaSemana('2026-10-04')).toBe(7);
  });
});

describe('periodoDelEnvio', () => {
  test('el lunes manda la semana que terminó, con la franja', () => {
    const p = periodoDelEnvio({ periodo: 'semanal', horaInicio: '16:00', horaFin: '02:00', comparar: null, vista: null }, '2026-10-05');
    expect(p).toMatchObject({ tipo: 'semanal', fechaInicio: '2026-09-28', fechaFin: '2026-10-04', horaInicio: '16:00', horaFin: '02:00' });
  });

  test('diario = ayer; mensual el día 5 = el mes anterior', () => {
    expect(periodoDelEnvio(leerFiltros({ periodo: 'diario' }), '2026-10-01')).toMatchObject({ fechaInicio: '2026-09-30', fechaFin: '2026-09-30', horaInicio: null });
    expect(periodoDelEnvio(leerFiltros({ periodo: 'mensual' }), '2026-10-05')).toMatchObject({ fechaInicio: '2026-09-01', fechaFin: '2026-09-30' });
  });
});

describe('lectura de lo guardado', () => {
  const U = '11111111-2222-4333-8444-555555555555';

  test('destinatarios mal formados se descartan; un externo «activo» sin aprobador queda pendiente', () => {
    const d = leerDestinatarios([
      { tipo: 'miembro', user_id: U, email: 'ana@example.com', nombre: 'Ana', estado: 'pausado', motivo: 'sin_alcance' },
      { tipo: 'miembro', user_id: 'no-uuid', email: 'x@example.com' },
      { tipo: 'externo', email: 'Revisor@Example.com', estado: 'activo' },
      { tipo: 'externo', email: 'no es correo' },
      { tipo: 'otro', email: 'y@example.com' },
      null,
    ]);
    expect(d).toEqual([
      { tipo: 'miembro', user_id: U, email: 'ana@example.com', nombre: 'Ana', estado: 'pausado', motivo: 'sin_alcance' },
      { tipo: 'externo', email: 'revisor@example.com', estado: 'pendiente', aprobado_por: null, motivo: null },
    ]);
    expect(leerDestinatarios('nada')).toEqual([]);
  });

  test('filtros: franja solo completa, comparativo y vista validados, periodo por frecuencia', () => {
    expect(leerFiltros({ horaInicio: '08:00', comparar: 'otro', vista: '<x>' }, 'weekly')).toEqual({
      periodo: 'semanal',
      horaInicio: null,
      horaFin: null,
      comparar: null,
      vista: null,
    });
  });
});

describe('contrato de programados', () => {
  const U = '11111111-2222-4333-8444-555555555555';
  const base = {
    nombre: 'Ventas por hora',
    reportId: 'ventas-por-hora',
    frecuencia: 'weekly',
    hora: '07:00',
    dia: 1,
    periodo: 'semanal',
    sucursalId: null,
    formato: 'pdf_excel',
    miembros: [U],
    externos: [],
  };

  test('válido; correos externos en minúsculas', () => {
    const r = programadoSchema.parse({ ...base, externos: ['Revisor@Example.com'] });
    expect(r.externos).toEqual(['revisor@example.com']);
  });

  test.each([
    ['semanal sin día', { dia: null }],
    ['mensual con día 30', { frecuencia: 'monthly', dia: 30 }],
    ['personalizado sin días', { frecuencia: 'custom', dia: null }],
    ['franja incompleta', { horaInicio: '16:00' }],
    ['sin destinatarios', { miembros: [] }],
    ['formato desconocido', { formato: 'docx' }],
    ['hora inválida', { hora: '7:00' }],
    ['externo que no es correo', { externos: ['revisor'] }],
  ])('%s → inválido', (_n, extra) => {
    expect(programadoSchema.safeParse({ ...base, ...extra }).success).toBe(false);
  });

  test('acciones', () => {
    expect(accionProgramadoSchema.safeParse({ accion: 'pausar' }).success).toBe(true);
    expect(accionProgramadoSchema.safeParse({ accion: 'aprobar', correos: [] }).success).toBe(false);
    expect(accionProgramadoSchema.safeParse({ accion: 'borrar' }).success).toBe(false);
  });
});

describe('JWT del destinatario', () => {
  const SECRETO = 'x'.repeat(40);
  const U = '11111111-2222-4333-8444-555555555555';

  test('HS256 con exactamente role, aud, sub, iat y exp; vida de 5 minutos', () => {
    const token = firmarJwtMiembro(SECRETO, U, 1_790_000_000_000);
    const [h, p, firma] = token.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'HS256', typ: 'JWT' });
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
    expect(Object.keys(claims).sort()).toEqual([...CLAIMS_SESION_ENVIO].sort());
    expect(claims).toMatchObject({ role: 'authenticated', aud: 'authenticated', sub: U });
    expect(claims.exp - claims.iat).toBe(TTL_SESION_ENVIO_SEGUNDOS);
    expect(firma).toBe(createHmac('sha256', SECRETO).update(`${h}.${p}`).digest('base64url'));
  });

  test('sin secreto no firma', () => {
    expect(() => firmarJwtMiembro('', U)).toThrow('jwt_no_configurado');
  });
});

describe('Excel y CSV', () => {
  const reporte: ReporteCongelado = {
    id: 'ventas',
    titulo: 'Ventas: por día',
    modulo: 'pos',
    grupo: 'ventas',
    kpis: [{ titulo: 'Total', valor: 1500, formato: 'moneda' }],
    principal: {
      id: 'principal',
      titulo: null,
      columnas: [
        { key: 'dia', titulo: 'Día', tipo: 'fecha' },
        { key: 'total', titulo: 'Total', tipo: 'moneda' },
      ],
      filas: [{ dia: '2026-09-01', total: 1000 }, { dia: '2026-09-02', total: 500 }],
      totales: { dia: 'Total', total: 1500 },
      filasTotales: 3,
    },
    vistas: [{ id: 'por-sucursal', titulo: 'Por sucursal', columnas: [{ key: 's', titulo: 'Sucursal', tipo: 'texto' }], filas: [{ s: 'Norte' }], totales: null, filasTotales: 1 }],
    lectura: [{ tono: 'info', texto: 'Sube 20 %' }],
    sinFranja: false,
  };
  const textos = { resumen: 'Resumen', indicador: 'Indicador', valor: 'Valor', truncado: (m: number, t: number) => `${m} de ${t}` };

  test('Excel: hoja de resumen y una por tabla, números como números, aviso de truncado', () => {
    const libro = XLSX.read(reporteAExcel(reporte, { lineas: ['Periodo: 01/09/2026'], textos }), { type: 'array' });
    expect(libro.SheetNames).toEqual(['Resumen', 'Ventas  por día', 'Por sucursal']);
    const filas = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets['Ventas  por día'], { header: 1 });
    expect(filas).toEqual([['Día', 'Total'], ['2026-09-01', 1000], ['2026-09-02', 500], ['Total', 1500], ['2 de 3']]);
  });

  test('CSV: solo la vista pedida, con BOM', () => {
    const csv = reporteACsv(reporte, { textos }, 'por-sucursal');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.slice(1).split(/\r?\n/)).toEqual(['Sucursal', 'Norte']);
  });
});
