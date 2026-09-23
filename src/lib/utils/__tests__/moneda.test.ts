/**
 * Moneda de los documentos: nunca pesos fijos.
 *
 * Regla del dueño (2026-09-23): los PDF, tickets y exportaciones usan la moneda
 * del documento o, en su defecto, la moneda base de la organización, con el
 * locale de su país. Estos tests fijan el formateador puro
 * (`src/lib/utils/moneda.ts`), la fuente única de la moneda base
 * (`src/lib/services/monedaOrganizacion.ts`) y un par de generadores.
 */

import {
  contextoMoneda,
  crearFormateadorMoneda,
  decimalesDeMoneda,
  formatMoneda,
  localeDeOrganizacion,
  monedaDelDocumento,
  normalizarCodigoMoneda,
} from '@/lib/utils/moneda';
import {
  monedaDelPais,
  resetOrgCurrencyCache,
  resolveOrgCurrency,
  resolverContextoMoneda,
} from '@/lib/services/monedaOrganizacion';
import { formatMoney } from '@/lib/ai/assistant/orgCurrency';
import { formatCurrency } from '@/utils/Utils';
import { PDFService, type InvoiceDataForPDF } from '@/lib/services/pdfService';
import { buildSaleTicketHTML, getPaperSpec, moneyFormatter } from '@printing';
import { renderProposalHtml, formatMoney as formatMoneyPropuesta } from '@/lib/services/crm/proposalNarrative';
import { dinero, dineroConSigno } from '@/components/pos/cajas/historialCajas';

/** `Intl` separa con espacio duro (U+00A0) o fino (U+202F): se normaliza. */
const limpio = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');

describe('formatMoneda — moneda, decimales y locale', () => {
  it('COP sin decimales con el locale colombiano', () => {
    expect(limpio(formatMoneda(1234567.5, contextoMoneda('COP', { locale: 'es-CO' })))).toBe('$ 1.234.568');
  });

  it('USD con dos decimales', () => {
    expect(limpio(formatMoneda(1234567.5, contextoMoneda('USD', { locale: 'es-US' })))).toBe('$1,234,567.50');
    expect(limpio(formatMoneda(19.9, contextoMoneda('USD', { locale: 'es-CO' })))).toBe('US$ 19,90');
  });

  it('MXN con los separadores de México', () => {
    expect(limpio(formatMoneda(1234567.5, contextoMoneda('MXN', { locale: 'es-MX' })))).toBe('$1,234,567.50');
  });

  it('EUR con el símbolo detrás, como en España', () => {
    expect(limpio(formatMoneda(1234567.5, contextoMoneda('EUR', { locale: 'es-ES' })))).toBe('1.234.567,50 €');
  });

  it('un código suelto usa el locale de respaldo es-CO', () => {
    expect(limpio(formatMoneda(1000, 'USD'))).toBe('US$ 1.000,00');
  });

  it('los decimales del catálogo mandan sobre la convención', () => {
    expect(limpio(formatMoneda(10.5, contextoMoneda('USD', { decimals: 0, locale: 'es-CO' })))).toBe('US$ 11');
  });

  it('un código que Intl no conoce no rompe el documento', () => {
    expect(() => formatMoneda(100, 'NOEXISTE')).not.toThrow();
    expect(formatMoneda(100, 'NOEXISTE')).toContain('NOEXISTE');
  });

  it('null, undefined y texto no numérico se pintan como cero', () => {
    expect(limpio(formatMoneda(null, contextoMoneda('COP', { locale: 'es-CO' })))).toBe('$ 0');
    expect(limpio(formatMoneda('abc', contextoMoneda('COP', { locale: 'es-CO' })))).toBe('$ 0');
  });

  it('crearFormateadorMoneda da el mismo resultado que formatMoneda', () => {
    const ctx = contextoMoneda('MXN', { locale: 'es-MX' });
    expect(crearFormateadorMoneda(ctx)(99.5)).toBe(formatMoneda(99.5, ctx));
  });
});

describe('decimalesDeMoneda', () => {
  it('COP y CLP sin decimales (como currencies.decimals en la base)', () => {
    expect(decimalesDeMoneda('COP')).toBe(0);
    expect(decimalesDeMoneda('CLP')).toBe(0);
  });
  it('USD, EUR y MXN con dos', () => {
    expect(decimalesDeMoneda('USD')).toBe(2);
    expect(decimalesDeMoneda('EUR')).toBe(2);
    expect(decimalesDeMoneda('mxn')).toBe(2);
  });
  it('el catálogo manda si viene', () => {
    expect(decimalesDeMoneda('USD', 0)).toBe(0);
  });
});

describe('localeDeOrganizacion — del país de la organización', () => {
  it('alfa-3 (así está en organizations.country_code)', () => {
    expect(localeDeOrganizacion('COL')).toBe('es-CO');
    expect(localeDeOrganizacion('MEX')).toBe('es-MX');
    expect(localeDeOrganizacion('ESP')).toBe('es-ES');
    expect(localeDeOrganizacion('USA')).toBe('es-US');
  });
  it('alfa-2 y nombre del país también sirven', () => {
    expect(localeDeOrganizacion('CL')).toBe('es-CL');
    expect(localeDeOrganizacion(null, 'México')).toBe('es-MX');
  });
  it('sin país reconocible, respaldo es-CO', () => {
    expect(localeDeOrganizacion(null)).toBe('es-CO');
    expect(localeDeOrganizacion('ZZZ')).toBe('es-CO');
  });
});

describe('monedaDelDocumento', () => {
  it('la del documento si es un ISO válido', () => {
    expect(monedaDelDocumento('usd ', 'COP')).toBe('USD');
  });
  it('la base si el documento no trae moneda o trae basura', () => {
    expect(monedaDelDocumento(null, 'MXN')).toBe('MXN');
    expect(monedaDelDocumento('', 'MXN')).toBe('MXN');
    expect(monedaDelDocumento('pesos', 'MXN')).toBe('MXN');
  });
  it('normalizarCodigoMoneda recorta el relleno de character(3)', () => {
    expect(normalizarCodigoMoneda('COP ')).toBe('COP');
    expect(normalizarCodigoMoneda('CO')).toBeNull();
  });
});

// ─── Fuente única ────────────────────────────────────────────────────────────

interface Tablas {
  organization_currencies?: Array<{ currency_code: string; is_base: boolean }>;
  organization_preferences?: { settings: unknown } | null;
  organizations?: { country_code: string | null; country: string | null } | null;
  currencies?: Array<{ code: string; symbol: string; decimals: number }>;
}

/** Cliente falso: solo lo que usan `resolveOrgCurrency` y `resolveOrgLocale`. */
function clienteFalso(t: Tablas) {
  return {
    from(tabla: string) {
      const filtros: Record<string, unknown> = {};
      const q = {
        select: () => q,
        eq: (col: string, v: unknown) => {
          filtros[col] = v;
          return q;
        },
        order: () => q,
        limit: () => q,
        maybeSingle: async () => {
          if (tabla === 'organization_currencies') {
            const filas = (t.organization_currencies ?? []).filter(
              (f) =>
                (filtros.is_base === undefined || f.is_base === filtros.is_base) &&
                (filtros.currency_code === undefined || f.currency_code === filtros.currency_code)
            );
            return { data: filas[0] ?? null };
          }
          if (tabla === 'organization_preferences') return { data: t.organization_preferences ?? null };
          if (tabla === 'organizations') return { data: t.organizations ?? null };
          if (tabla === 'currencies') {
            return { data: (t.currencies ?? []).find((c) => c.code === filtros.code) ?? null };
          }
          return { data: null };
        },
        then: (resolve: (v: { data: unknown }) => unknown) =>
          resolve({ data: tabla === 'organization_currencies' ? t.organization_currencies ?? [] : [] }),
      };
      return q;
    },
  } as never;
}

const CATALOGO = [
  { code: 'COP', symbol: '$', decimals: 0 },
  { code: 'USD', symbol: '$', decimals: 2 },
  { code: 'MXN', symbol: '$', decimals: 2 },
];

describe('resolveOrgCurrency — fuente única de la moneda base', () => {
  beforeEach(() => resetOrgCurrencyCache());

  it('1. la moneda marcada is_base, con los decimales del catálogo', async () => {
    const r = await resolveOrgCurrency(
      clienteFalso({ organization_currencies: [{ currency_code: 'MXN', is_base: true }], currencies: CATALOGO }),
      1
    );
    expect(r).toMatchObject({ code: 'MXN', decimals: 2, source: 'base' });
  });

  it('5. sin monedas configuradas, la del país (una organización colombiana factura en COP, no en USD)', async () => {
    const r = await resolveOrgCurrency(
      clienteFalso({ organizations: { country_code: 'COL', country: 'Colombia' }, currencies: CATALOGO }),
      2
    );
    expect(r).toMatchObject({ code: 'COP', decimals: 0, source: 'country' });
  });

  it('sin moneda ni país, USD como último recurso (y se registra)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const r = await resolveOrgCurrency(clienteFalso({}), 3);
    expect(r).toMatchObject({ code: 'USD', source: 'fallback' });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('monedaDelPais cubre los países del catálogo telefónico', () => {
    expect(monedaDelPais('MEX')).toBe('MXN');
    expect(monedaDelPais('ESP')).toBe('EUR');
    expect(monedaDelPais('ECU')).toBe('USD');
    expect(monedaDelPais(null)).toBeNull();
  });
});

describe('resolverContextoMoneda — documento o base, con el locale del país', () => {
  beforeEach(() => resetOrgCurrencyCache());
  const org = {
    organization_currencies: [{ currency_code: 'MXN', is_base: true }],
    organizations: { country_code: 'MEX', country: 'México' },
    currencies: CATALOGO,
  };

  it('sin moneda de documento: la base de la organización', async () => {
    expect(await resolverContextoMoneda(clienteFalso(org), 10)).toEqual({ code: 'MXN', decimals: 2, locale: 'es-MX' });
  });

  it('con moneda de documento: la del documento, locale de la organización', async () => {
    expect(await resolverContextoMoneda(clienteFalso(org), 10, 'COP')).toEqual({ code: 'COP', decimals: 0, locale: 'es-MX' });
  });
});

// ─── Delegaciones ────────────────────────────────────────────────────────────

describe('los formateadores antiguos delegan en formatMoneda', () => {
  it('formatMoney del asistente respeta los decimales de la moneda', () => {
    expect(limpio(formatMoney(19900, { code: 'COP', symbol: '$', decimals: 0, source: 'base' }))).toBe('$ 19.900');
  });
  it('formatCurrency de Utils conserva su contrato (dos decimales, es-CO)', () => {
    expect(limpio(formatCurrency(1500, 'USD'))).toBe('US$ 1.500,00');
  });
  it('dinero de cajas usa la moneda que se le pasa', () => {
    expect(limpio(dinero(1500, contextoMoneda('MXN', { locale: 'es-MX' })))).toBe('$1,500');
    expect(limpio(dineroConSigno(-1500, contextoMoneda('EUR', { locale: 'es-ES' })))).toBe('−1500 €');
  });
});

// ─── Generadores ─────────────────────────────────────────────────────────────

describe('generadores de documentos', () => {
  const factura: InvoiceDataForPDF = {
    id: 'f-1',
    number: 'FV-1',
    issue_date: '2026-09-01',
    due_date: '2026-09-30',
    status: 'issued',
    currency: 'MXN',
    subtotal: 1000,
    tax_total: 160,
    total: 1160,
    balance: 1160,
    items: [{ description: 'Servicio', qty: 1, unit_price: 1000, total_line: 1000 }],
  };

  it('factura (pdfService): la moneda del documento y el locale de la organización, sin COP', () => {
    const html = limpio(
      PDFService.generateInvoiceHTML({ ...factura, moneda: contextoMoneda('MXN', { locale: 'es-MX' }) })
    );
    expect(html).toContain('$1,160.00');
    expect(html).toContain('<span>MXN</span>');
    expect(html).not.toContain('COP');
  });

  it('factura sin contexto: formatea en la moneda del documento, nunca en pesos', () => {
    const html = limpio(PDFService.generateInvoiceHTML({ ...factura, currency: 'USD' }));
    expect(html).toContain('US$ 1.160,00');
    expect(html).not.toContain('COP');
  });

  it('ticket de venta (plantilla compartida): moneda del payload', () => {
    const html = limpio(
      buildSaleTicketHTML(
        { saleId: 's-1', createdAt: '2026-09-01T12:00:00Z', items: [], total: 250.5, currency: 'USD', locale: 'es-US' },
        getPaperSpec('80mm')
      )
    );
    expect(html).toContain('$250.50');
  });

  it('ticket sin moneda (trabajo viejo): número sin símbolo, no pesos', () => {
    expect(moneyFormatter({}, { symbol: true })(36480)).toBe('36.480');
    expect(moneyFormatter({ currency: 'COP', locale: 'es-CO' }, { symbol: true })(36480)).toBe('$ 36.480');
  });

  it('propuesta: USD con centavos y locale del país', () => {
    const html = renderProposalHtml(
      {
        situacion: { title: 'S', content: 'x' },
        problemas: { title: 'P', content: 'x' },
        solucion: { title: 'So', content: 'x' },
        roi: { title: 'R', content: 'x' },
        pricing: { title: 'Precio', content: 'x', lines: [{ description: 'Plan', qty: 1, unit_price: 1200.5, total: 1200.5 }], total: 1200.5, currency: 'USD' },
      } as never,
      { number: 'COT-1', customerName: 'C', organizationName: 'O', validUntil: null, currency: 'USD', locale: 'es-MX' }
    );
    expect(limpio(html)).toContain('USD 1,200.50');
    expect(limpio(formatMoneyPropuesta(1000, ''))).toBe('1.000');
  });
});
