// ============================================================================
// Fase B, tanda 1 — contabilidad y períodos contables/fiscales
// ============================================================================
// Lo que fija este archivo:
//
//   1. Los límites de un período (`fiscal_periods.start_date`/`.end_date`, tipo
//      **date**) se construyen con aritmética de día calendario. Antes salían
//      de `new Date(year, i, 1).toISOString().split('T')[0]`, que es medianoche
//      LOCAL leída en UTC: con offset positivo (Madrid) el período de enero
//      empezaba el **31 de diciembre**.
//   2. «Hoy» es el día de la organización, no el de UTC ni el del navegador.
//   3. `journal_entries.entry_date` es **timestamptz** (verificado en
//      `information_schema.columns`): se escribe como instante con offset y se
//      lee con `formatDateInTz`. Los dos lados, en el mismo commit: arreglar
//      solo uno corre la fecha un día en producción.
//   4. Los filtros de los informes contables comparan la columna contra
//      INSTANTES, no contra `'YYYY-MM-DD'`.
//
// Todo con zonas de los dos signos y con DST, para que nada acierte por
// coincidir con `America/Bogota`.
// ============================================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  diasDelMes,
  primerDiaDelAnioDe,
  primerDiaDelMesDe,
  rangoDelAnio,
  rangoDelMes,
} from '@/lib/services/fiscalCalendar';
import { formatDateInTz } from '@/lib/utils/dateDisplay';
import { plainDateToInstant, todayInTz } from '@/lib/utils/dateCore';

const RAIZ = join(__dirname, '..', '..', '..');
const leer = (ruta: string): string => readFileSync(join(RAIZ, ruta), 'utf8');

// ---------------------------------------------------------------------------
// 1. Límites de período: aritmética de día, no `Date` local
// ---------------------------------------------------------------------------

/**
 * Lo que hacía el código viejo, visto desde un navegador con ese offset:
 * `new Date(year, month - 1, 1).toISOString().split('T')[0]`.
 */
function primerDiaAlaVieja(year: number, month: number, offsetMinutos: number): string {
  const instante = Date.UTC(year, month - 1, 1) - offsetMinutos * 60_000;
  return new Date(instante).toISOString().split('T')[0];
}

describe('límites de un período contable', () => {
  it('primer y último día de cada mes de un año bisiesto', () => {
    expect(rangoDelMes(2028, 1)).toEqual({ start: '2028-01-01', end: '2028-01-31' });
    expect(rangoDelMes(2028, 2)).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    expect(rangoDelMes(2026, 2)).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(rangoDelMes(2026, 4)).toEqual({ start: '2026-04-01', end: '2026-04-30' });
    expect(rangoDelMes(2026, 12)).toEqual({ start: '2026-12-01', end: '2026-12-31' });
  });

  it('febrero en los siglos: 2000 bisiesto, 2100 no', () => {
    expect(diasDelMes(2000, 2)).toBe(29);
    expect(diasDelMes(2100, 2)).toBe(28);
  });

  it('el año entero', () => {
    expect(rangoDelAnio(2026)).toEqual({ start: '2026-01-01', end: '2026-12-31' });
  });

  it('el resultado NO depende del navegador; el código viejo sí', () => {
    // Madrid en invierno (+60) y Kiritimati (+840): ahí se rompía.
    for (const offset of [60, 120, 330, 345, 840]) {
      expect(primerDiaAlaVieja(2026, 1, offset)).toBe('2025-12-31');
    }
    // Bogotá (-300) y Ciudad de México (-360): ahí acertaba por casualidad, y
    // por eso el fallo llevaba años invisible.
    for (const offset of [0, -300, -360]) {
      expect(primerDiaAlaVieja(2026, 1, offset)).toBe('2026-01-01');
    }
    // La implementación nueva da lo mismo en todos los casos: no hay `Date`
    // local de por medio.
    expect(rangoDelMes(2026, 1).start).toBe('2026-01-01');
  });

  it('primer día del mes y del año de un día dado', () => {
    expect(primerDiaDelMesDe('2026-09-23')).toBe('2026-09-01');
    expect(primerDiaDelAnioDe('2026-09-23')).toBe('2026-01-01');
    expect(primerDiaDelMesDe('2026-01-01')).toBe('2026-01-01');
  });
});

// ---------------------------------------------------------------------------
// 2. «Hoy» es el día de la organización
// ---------------------------------------------------------------------------

describe('«hoy» sale de la zona de la organización, no de UTC', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  function conReloj(iso: string, fn: () => void): void {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(iso));
    fn();
  }

  it('Madrid a las 00:30: el día ya cambió, UTC todavía no', () => {
    // 2026-12-31T23:30Z = 2027-01-01 00:30 en Madrid (CET, +01:00).
    conReloj('2026-12-31T23:30:00.000Z', () => {
      expect(todayInTz('Europe/Madrid')).toBe('2027-01-01');
      expect(new Date().toISOString().split('T')[0]).toBe('2026-12-31');
      // Un período fiscal abierto «hoy» en Madrid pertenece a 2027.
      expect(primerDiaDelAnioDe(todayInTz('Europe/Madrid'))).toBe('2027-01-01');
    });
  });

  it('Bogotá a las 23:30: UTC ya es el día siguiente', () => {
    // 2026-09-24T04:30Z = 2026-09-23 23:30 en Bogotá.
    conReloj('2026-09-24T04:30:00.000Z', () => {
      expect(todayInTz('America/Bogota')).toBe('2026-09-23');
      expect(new Date().toISOString().split('T')[0]).toBe('2026-09-24');
    });
  });

  it('el mismo instante da tres días distintos en tres zonas', () => {
    conReloj('2026-09-23T22:30:00.000Z', () => {
      expect(todayInTz('America/Mexico_City')).toBe('2026-09-23');
      expect(todayInTz('Europe/Madrid')).toBe('2026-09-24');
      expect(todayInTz('Pacific/Kiritimati')).toBe('2026-09-24');
    });
  });
});

// ---------------------------------------------------------------------------
// 3. `journal_entries.entry_date` es timestamptz: ida y vuelta
// ---------------------------------------------------------------------------

const ZONAS = ['America/Bogota', 'America/Mexico_City', 'Europe/Madrid', 'Pacific/Kiritimati'];

describe('entry_date (timestamptz): lo que se guarda es lo que se lee', () => {
  it.each(ZONAS)('%s devuelve el mismo día calendario', (zona) => {
    for (const dia of ['2026-01-01', '2026-06-15', '2026-12-31']) {
      const instante = plainDateToInstant(dia, zona);
      const [d, m, a] = formatDateInTz(instante, zona).split('/');
      expect(`${a}-${m}-${d}`).toBe(dia);
    }
  });

  it('cruza el cambio de horario sin perder el día', () => {
    // Madrid: 29 de marzo de 2026 el reloj salta de 02:00 a 03:00.
    for (const dia of ['2026-03-28', '2026-03-29', '2026-03-30']) {
      const instante = plainDateToInstant(dia, 'Europe/Madrid');
      const [d, m, a] = formatDateInTz(instante, 'Europe/Madrid').split('/');
      expect(`${a}-${m}-${d}`).toBe(dia);
    }
  });

  it('mandar «YYYY-MM-DD» a un timestamptz corre el día: por eso no se hace', () => {
    // Esto es lo que ocurria antes: Postgres lee '2026-09-23' como medianoche
    // UTC, y al formatearlo en Bogota sale el 22.
    const comoLoGuardabaAntes = '2026-09-23T00:00:00.000Z';
    expect(formatDateInTz(comoLoGuardabaAntes, 'America/Bogota')).toBe('22/09/2026');
    // Con el instante correcto, sale el 23.
    expect(formatDateInTz(plainDateToInstant('2026-09-23', 'America/Bogota'), 'America/Bogota'))
      .toBe('23/09/2026');
  });
});

// ---------------------------------------------------------------------------
// 4. Guardas estáticas sobre los archivos de la tanda
// ---------------------------------------------------------------------------

const PROHIBIDO = /toISOString\(\)\.(split\('T'\)|slice\(0, *10\))/;

const ARCHIVOS_TANDA_1 = [
  'src/components/finanzas/contabilidad/periodos-fiscales/PeriodosFiscalesService.ts',
  'src/components/finanzas/periodos-contables/PeriodosContablesService.ts',
  'src/components/finanzas/periodos-contables/PeriodosContablesPage.tsx',
  'src/components/finanzas/contabilidad/asientos/AsientosPage.tsx',
  'src/components/finanzas/contabilidad/asientos/AsientoDetailPage.tsx',
  'src/components/finanzas/contabilidad/ContabilidadService.ts',
  'src/components/finanzas/contabilidad/balance-comprobacion/BalanceComprobacionPage.tsx',
  'src/components/finanzas/contabilidad/balance-general/BalanceGeneralPage.tsx',
  'src/components/finanzas/contabilidad/estado-resultados/EstadoResultadosPage.tsx',
  'src/components/finanzas/contabilidad/mayor-contable/MayorContablePage.tsx',
  'src/components/finanzas/activos-fijos/ActivosFijosPage.tsx',
];

describe('los archivos de la tanda 1 no vuelven al día UTC', () => {
  it.each(ARCHIVOS_TANDA_1)('%s', (ruta) => {
    expect(leer(ruta)).not.toMatch(PROHIBIDO);
  });

  it('los informes convierten los extremos del filtro a instantes', () => {
    const servicio = leer('src/components/finanzas/contabilidad/ReportesContablesService.ts');
    // Cuatro métodos, cuatro resoluciones de zona.
    expect(servicio.match(/await resolveTimezone\(organizationId\)/g)).toHaveLength(4);
    expect(servicio).toContain('getDateRange(startDate, endDate, timezone)');
    expect(servicio).toContain('getDayRange(asOfDate, timezone)');
    // Y ningún filtro compara ya la columna contra el día suelto.
    expect(servicio).not.toContain("entry_date', startDate");
    expect(servicio).not.toContain("entry_date', endDate");
    expect(servicio).not.toContain("entry_date', asOfDate");
  });

  it('el asiento se guarda como instante y se lee con la zona de su sucursal', () => {
    const pagina = leer('src/components/finanzas/contabilidad/asientos/AsientosPage.tsx');
    expect(pagina).toContain('entry_date: toInstant(formData.entry_date)');
    expect(pagina).toContain('{formatDate(asiento.entry_date)}');
    expect(pagina).not.toContain("toLocaleDateString('es-CO')");

    const detalle = leer('src/components/finanzas/contabilidad/asientos/AsientoDetailPage.tsx');
    expect(detalle).toContain('useFormatDateFor(asiento?.branch_id)');
    expect(detalle).not.toContain('toLocaleDateString');

    const servicio = leer('src/components/finanzas/contabilidad/ContabilidadService.ts');
    // La tasa del día sale del día del asiento EN SU ZONA, no de `.split('T')`.
    expect(servicio).toContain('toPlainDate(new Date(asiento.entry_date), timezone)');
    expect(servicio).not.toContain("entry_date.split('T')[0]");
  });

  it('los días por defecto esperan a que se conozca la zona', () => {
    for (const ruta of [
      'src/components/finanzas/contabilidad/balance-comprobacion/BalanceComprobacionPage.tsx',
      'src/components/finanzas/contabilidad/balance-general/BalanceGeneralPage.tsx',
      'src/components/finanzas/contabilidad/estado-resultados/EstadoResultadosPage.tsx',
      'src/components/finanzas/contabilidad/mayor-contable/MayorContablePage.tsx',
      'src/components/finanzas/activos-fijos/ActivosFijosPage.tsx',
    ]) {
      const fuente = leer(ruta);
      expect(fuente).toContain('getToday()');
      // La guarda, no solo la dependencia: calcular el dia en el primer render
      // daria `America/Bogota` para todas las organizaciones, porque el
      // contexto arranca en el fallback y solo despues resuelve la zona real.
      expect(fuente).toContain('if (tzLoading');
    }
  });

  it('los períodos se construyen con aritmética de día calendario', () => {
    for (const ruta of [
      'src/components/finanzas/contabilidad/periodos-fiscales/PeriodosFiscalesService.ts',
      'src/components/finanzas/periodos-contables/PeriodosContablesService.ts',
      'src/components/finanzas/periodos-contables/PeriodosContablesPage.tsx',
    ]) {
      const fuente = leer(ruta);
      expect(fuente).toContain('rangoDelMes(');
      // Sin el comentario que explica el fallo viejo, que si nombra `new Date`.
      const codigo = fuente
        .split(/\r?\n/)
        .filter((l) => !l.trimStart().startsWith('//'))
        .join('\n');
      expect(codigo).not.toMatch(/new Date\(\s*(year|newPeriodo\.year)/);
    }
  });
});
