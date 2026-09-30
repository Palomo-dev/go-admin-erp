// ============================================================================
// Reportes — el rango de un periodo sale de la zona de la organización
// ============================================================================
// Hasta el 2026-09-29, 13 de los 19 archivos de reportes (contabilidad
// incluida) filtraban con `${fecha}T00:00:00Z`: el día UTC. En Colombia eso
// corre al día siguiente todo lo que pasa después de las 7 p. m., y además
// ignora la franja horaria del periodo. Ahora todos pasan por
// `rangoDelPeriodo`, y este archivo impide que vuelva a aparecer el patrón.
// ============================================================================

import fs from 'fs';
import path from 'path';
import { getDateRange } from '@/lib/utils/dateRanges';
import { franjaDelPeriodo } from '../rangoPeriodo';
import type { PeriodoCierre } from '../types';

const DIR_REPORTES = path.join(__dirname, '..');

function archivosTs(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : archivosTs(ruta);
    return e.name.endsWith('.ts') ? [ruta] : [];
  });
}

const periodoBase: PeriodoCierre = {
  tipo: 'diario',
  fechaInicio: '2026-09-29',
  fechaFin: '2026-09-29',
  etiqueta: 'Cierre diario',
};

describe('rango de periodo de los reportes', () => {
  it.each(archivosTs(DIR_REPORTES).map((f) => [path.relative(DIR_REPORTES, f), f]))(
    '%s no arma instantes con el día UTC',
    (_nombre, ruta) => {
      const src = fs.readFileSync(ruta, 'utf8');
      expect(src).not.toMatch(/T00:00:00Z|T23:59:59Z/);
    },
  );

  it('la franja solo aplica con las dos puntas', () => {
    expect(franjaDelPeriodo(periodoBase)).toBeNull();
    expect(franjaDelPeriodo({ ...periodoBase, horaInicio: '16:00', horaFin: null })).toBeNull();
    expect(franjaDelPeriodo({ ...periodoBase, horaInicio: '16:00', horaFin: '02:00' })).toEqual({
      start_time: '16:00',
      end_time: '02:00',
    });
  });

  it('una franja de 4 p. m. a 2 a. m. termina al día siguiente, en la hora de Bogotá', () => {
    const franja = franjaDelPeriodo({ ...periodoBase, horaInicio: '16:00', horaFin: '02:00' });
    const { start, end } = getDateRange('2026-09-29', '2026-09-29', 'America/Bogota', franja);
    expect(start).toBe('2026-09-29T16:00:00.000-05:00');
    expect(end).toBe('2026-09-30T02:00:00.000-05:00');
  });
});
