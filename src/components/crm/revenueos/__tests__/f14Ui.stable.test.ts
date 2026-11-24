/// <reference types="jest" />
/**
 * F14 — textos y formato del panel (puro, sin jsdom): moneda desde la
 * organización (nunca «COP» cableado), plural correcto, hints honestos del
 * cobrado/ARPA/CAC, y reglas de fuente que un refactor rompería en silencio.
 * Origen: builder de F14 ronda 2 (`f14Round2Ui`); consolidado el 2026-09-21.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fmtMoney, plural, SIN_DATOS, SIN_MONEDA } from '../formatters';
import { arpaHint, collectedHint, winRateHint, wonHint } from '../kpiHints';

const ROOT = path.resolve(__dirname, '../../../../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('fmtMoney: la moneda viene de la organización', () => {
  it('con moneda base pinta su símbolo (MXN y COP distintos), redondeando a enteros', () => {
    const cop = fmtMoney(3537885, 'COP');
    const mxn = fmtMoney(3537885, 'MXN');
    expect(cop).toMatch(/3\.537\.885/);
    expect(mxn).toMatch(/3\.537\.885/);
    expect(cop).not.toBe(mxn);
    expect(fmtMoney(90737.5, 'COP')).toMatch(/90\.738/);
  });
  it('sin moneda base: número sin símbolo, sin «$» ni «COP» inventados', () => {
    const s = fmtMoney(16970600, null);
    expect(s).toBe('16.970.600');
    expect(s).not.toMatch(/\$|COP/);
    expect(SIN_MONEDA).toMatch(/moneda base/);
  });
  it('null → «Sin datos»; código desconocido → número + código', () => {
    expect(fmtMoney(null, 'COP')).toBe(SIN_DATOS);
    expect(fmtMoney(undefined, null)).toBe(SIN_DATOS);
    expect(fmtMoney(1500, 'ZZZZ')).toBe('1.500 ZZZZ');
  });
});

describe('plural', () => {
  it('1 oportunidad ganada / 2 oportunidades ganadas / 0 oportunidades ganadas', () => {
    expect(plural(1, 'oportunidad ganada', 'oportunidades ganadas')).toBe('1 oportunidad ganada');
    expect(plural(2, 'oportunidad ganada', 'oportunidades ganadas')).toBe('2 oportunidades ganadas');
    expect(plural(0, 'oportunidad ganada', 'oportunidades ganadas')).toBe('0 oportunidades ganadas');
    expect(plural(1234, 'factura', 'facturas')).toBe('1.234 facturas');
  });
});

describe('hints honestos de las tarjetas', () => {
  it('org 135: cobrado 16 970 600 sin ninguna factura enlazada a oportunidad → lo dice', () => {
    expect(collectedHint({ revenue_collected: 16970600, revenue_collected_linked: 0 }, 'COP')).toBe(
      'Ninguna factura enlazada a una oportunidad; cobrado total de la organización',
    );
  });
  it('parte enlazada: la cifra enlazada aparece en la moneda; todo enlazado o nada cobrado tienen su texto', () => {
    expect(collectedHint({ revenue_collected: 1000, revenue_collected_linked: 400 }, null)).toBe('Cobrado total de la organización; 400 de facturas enlazadas a oportunidades');
    expect(collectedHint({ revenue_collected: 1000, revenue_collected_linked: 1000 }, null)).toMatch(/enlazadas a oportunidades$/);
    expect(collectedHint({ revenue_collected: 0, revenue_collected_linked: 0 }, null)).toMatch(/Sin pagos/);
  });
  it('org 2: «1 oportunidad ganada» y «1 ganada de 3 cerradas»', () => {
    expect(wonHint({ deals_won: 1 })).toBe('1 oportunidad ganada');
    expect(wonHint({ deals_won: 0 })).toBe('Sin oportunidades ganadas en el periodo');
    expect(winRateHint({ deals_won: 1, deals_lost: 2 })).toBe('1 ganada de 3 cerradas');
    expect(winRateHint({ deals_won: 0, deals_lost: 0 })).toBe('Sin cierres en el periodo');
  });
  it('ARPA: «ticket medio por factura pagada (21 facturas)»; sin facturas lo dice', () => {
    expect(arpaHint({ arpa: 90737.5, invoices_paid: 21 })).toBe('Ticket medio por factura pagada (21 facturas)');
    expect(arpaHint({ arpa: 61136.4, invoices_paid: 1 })).toBe('Ticket medio por factura pagada (1 factura)');
    expect(arpaHint({ arpa: null, invoices_paid: 0 })).toBe('Sin facturas pagadas en el periodo');
  });
});

// El tablero (RevenueOsPage y sus paneles, ForecastDashboard) se retiró el
// 2026-11-24: sus secciones son reportes de /app/reportes
// (`reportes/modulos/crmIngresosReports.ts`). Las reglas de fuente pasan a ese módulo.
describe('contrato de fuente (r2)', () => {
  const UI = 'src/components/crm/revenueos';
  const REPORTES = 'src/lib/services/reportes/modulos/crmIngresosReports.ts';
  it('ni los formatos ni los reportes usan formatCurrency (COP por defecto) ni la cadena "COP"', () => {
    const files = [`${UI}/formatters.ts`, `${UI}/kpiHints.ts`, REPORTES, 'src/lib/services/crm/revenueOsService.ts'];
    const bad = files.filter((f) => /formatCurrency|['"]COP['"]/.test(read(f)));
    expect(bad).toEqual([]);
  });
  it('el dashboard expone currency (organization_currencies.is_base vía getOrgBaseCurrency) y pipeline_names', () => {
    const svc = read('src/lib/services/crm/revenueOsService.ts');
    expect(svc).toMatch(/getOrgBaseCurrency/);
    expect(svc).toMatch(/currency: string \| null/);
    expect(svc).toMatch(/pipeline_names/);
    expect(read('src/lib/services/crm/revenueOs/rpc.ts')).toMatch(/select\('id, name'\)/);
  });
  it('los reportes toman la moneda de la organización (getRevenueCurrency) para el texto del cobrado y los nombres de pipeline de fetchPipelines', () => {
    const r = read(REPORTES);
    expect(r).toMatch(/getRevenueCurrency\(orgId, db\)/);
    expect(r).toMatch(/collectedHint\(r, moneda\)/);
    expect(r).toMatch(/fetchPipelines\(orgId, db\)/);
  });
  it('el embudo avisa de etapas posteriores a la ganada y declara la base «última etapa»', () => {
    const f = read(REPORTES);
    expect(f).toMatch(/ignoredAfterWon/);
    expect(f).toMatch(/overallBasis === 'last'/);
  });
  it('la matemática comercial explica CAC como gasto ÷ oportunidades ganadas en el periodo y ARPA como ticket por factura pagada', () => {
    const m = read(REPORTES);
    expect(m).toMatch(/Gasto de adquisición del periodo ÷ oportunidades ganadas en el periodo/);
    expect(m).toMatch(/Ticket medio por factura pagada/);
  });
});
