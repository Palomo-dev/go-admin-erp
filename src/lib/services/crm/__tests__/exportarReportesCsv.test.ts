/** @jest-environment jsdom */
import { createReportesService } from '@/components/crm/reportes/ReportesService';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/services/organizationTimezoneService', () => ({ getOrganizationTimezone: jest.fn() }));

const timezone = getOrganizationTimezone as jest.Mock;
let csv: string;
let download: string;
let click: jest.SpyInstance;
const createUrl = jest.fn(() => 'blob:reporte-de-prueba');
const revokeUrl = jest.fn();
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-02T00:30:00Z'));
  csv = ''; download = '';
  createUrl.mockClear(); revokeUrl.mockClear();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createUrl });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeUrl });
  const OriginalBlob = Blob;
  jest.spyOn(globalThis, 'Blob').mockImplementation((parts, options) => {
    csv = String(parts?.[0] ?? '');
    return new OriginalBlob(parts, options);
  });
  click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function(this: HTMLAnchorElement) { download = this.download; });
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

test.each([['America/Bogota', '2026-10-01'], ['Europe/Madrid', '2026-10-02']])(
  'CSV usa el día de %s y neutraliza fórmulas, comillas y saltos', async (zone, day) => {
    timezone.mockResolvedValue(zone);
    await createReportesService(120).exportToCSV([{ Nombre: '=HYPERLINK("x")', Nota: 'Texto; "citado"\nOtra línea', Valor: -20 }], 'reporte');
    expect(timezone).toHaveBeenCalledWith(120);
    expect(download).toBe(`reporte_${day}.csv`);
    expect(csv).toContain('"\'=HYPERLINK(""x"")"');
    expect(csv).toContain('"Texto; ""citado""\nOtra línea"');
    expect(csv).toContain(';\"Texto');
    expect(csv).toContain(';-20');
    expect(revokeUrl).toHaveBeenCalledWith('blob:reporte-de-prueba');
  },
);
test('libera la URL incluso si el navegador rechaza la descarga', async () => {
  timezone.mockResolvedValue('America/Bogota');
  click.mockImplementation(() => { throw new Error('Descarga rechazada'); });
  await expect(createReportesService(120).exportToCSV([{ Valor: 1 }], 'reporte')).rejects.toThrow('Descarga rechazada');
  expect(revokeUrl).toHaveBeenCalledWith('blob:reporte-de-prueba');
});
