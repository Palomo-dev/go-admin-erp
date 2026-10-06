/**
 * Llamadas en la zona de la ORGANIZACIÓN (docs/reglas-fechas-timezone.md) y
 * columna «Sentimiento» (Figma 1351:18).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { sentimientoReciente } from '@/lib/services/crm/callManagementService';
import { normalizarFechasLlamadas } from '@/lib/services/crm/callFiltersLogica';

// Los días del filtro viajan como `YYYY-MM-DD` y el SERVIDOR los convierte con
// la zona de la organización (`normalizarFechasLlamadas`); «hasta» es
// exclusivo al inicio del día siguiente.
describe('normalizarFechasLlamadas (zona de la organización)', () => {
  test('Bogotá: el día empieza a las 05:00 UTC y «hasta» es exclusivo', () => {
    const r = normalizarFechasLlamadas({ from_date: '2026-10-06', to_date: '2026-10-06' }, 'America/Bogota');
    expect(r.from_date).toBe('2026-10-06T05:00:00.000Z');
    expect(r.to_date).toBe('2026-10-07T05:00:00.000Z');
    expect(r.to_date_exclusive).toBe(true);
  });
  test('otra zona, otro instante', () => {
    const r = normalizarFechasLlamadas({ from_date: '2026-10-07' }, 'Europe/Madrid');
    expect(r.from_date).toBe('2026-10-06T22:00:00.000Z');
    expect(r.to_date).toBeUndefined();
  });
  test('un instante con offset se respeta tal cual', () => {
    const r = normalizarFechasLlamadas({ from_date: '2026-10-06T10:00:00-05:00' }, 'America/Bogota');
    expect(r.from_date).toBe('2026-10-06T10:00:00-05:00');
  });
});

describe('filtros Desde/Hasta de la tabla de llamadas', () => {
  test('no se construyen como días UTC en el navegador', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/voice/CallsTable.tsx'), 'utf8');
    expect(src).not.toMatch(/T00:00:00\.000Z|T23:59:59\.999Z|toISOString\(\)\.split/);
    // El rango por defecto sale del «hoy» de la organización.
    expect(src).toMatch(/getToday\(\)/);
  });
  test('la fecha de la fila sale del hook de la organización, no de toLocaleString', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/voice/CallRow.tsx'), 'utf8');
    expect(src).not.toMatch(/toLocaleString/);
    expect(src).toMatch(/useFormatDate\(\)/);
  });
});

describe('sentimientoReciente', () => {
  test('el análisis más reciente con sentimiento manda', () => {
    expect(
      sentimientoReciente([
        { sentiment: 'negative', created_at: '2026-10-01T10:00:00Z' },
        { sentiment: 'positive', created_at: '2026-10-02T10:00:00Z' },
        { sentiment: null, created_at: '2026-10-03T10:00:00Z' },
      ]),
    ).toBe('positive');
  });
  test('sin análisis o valor fuera del CHECK → null', () => {
    expect(sentimientoReciente(null)).toBeNull();
    expect(sentimientoReciente([])).toBeNull();
    expect(sentimientoReciente([{ sentiment: 'feliz', created_at: null }])).toBeNull();
  });
});
