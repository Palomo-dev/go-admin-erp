/// <reference types="jest" />
/**
 * Lógica pura de la pantalla Partners (Figma «CRM · Red y gestión», fila 2):
 * KPI, filtros, acción de cada deal, camino al siguiente nivel, comisiones del
 * año por partner y año en la zona de la organización.
 */

import {
  accionDeal,
  anioEnZona,
  aniosConDeals,
  caminoSiguienteNivel,
  cifrasFicha,
  comisionesPorPartner,
  csvPartners,
  filtrarPartners,
  FILTROS_PARTNERS_INICIALES,
  fuenteTasa,
  hayFiltrosPartners,
  kpisPartners,
  monedaDeals,
  ordenarDeals,
  ordenarPartners,
  paginar,
  pestanaPartners,
  resumenComisionesAnio,
  siguienteOrden,
  SIN_NIVEL,
  tonoNivel,
  type DealFila,
  type PartnerFila,
} from '../redPartnersLogica';
import { claveErrorPartners } from '../redPartnersErrores';

const ZONA = 'America/Bogota';
const tiers = [
  { id: 'oro', name: 'Oro', min_deals: 10, min_revenue: 60000000, commission_rate: 15 },
  { id: 'bronce', name: 'Bronce', min_deals: 1, min_revenue: 0, commission_rate: 8 },
  { id: 'platino', name: 'Platino', min_deals: 15, min_revenue: 120000000, commission_rate: 18 },
  { id: 'plata', name: 'Plata', min_deals: 5, min_revenue: 20000000, commission_rate: 12 },
];

function partner(over: Partial<PartnerFila> & { id: string; name: string }): PartnerFila {
  return {
    company_name: null,
    email: `${over.id}@example.com`,
    tier_id: null,
    tier: null,
    commission_rate: 0,
    effective_rate: 0,
    is_active: true,
    deals_count: 0,
    revenue_attributed: 0,
    commissions: { outstanding: 0, paid: 0, pending: 0, approved: 0, rejected: 0, count: 0 },
    ...over,
  };
}

function deal(over: Partial<DealFila> & { id: string }): DealFila {
  return {
    partner_id: 'p1',
    deal_type: 'referral',
    commission_amount: 0,
    commission_status: 'pending',
    commission_paid_at: null,
    created_at: '2026-05-10T15:00:00.000Z',
    opportunity: { amount: 0, status: 'open', currency: 'COP' },
    ...over,
  };
}

describe('pestañas', () => {
  it('«Comisiones» solo con permiso de gestión; valor desconocido → partners', () => {
    expect(pestanaPartners('comisiones', true)).toBe('comisiones');
    expect(pestanaPartners('comisiones', false)).toBe('partners');
    expect(pestanaPartners('otra', true)).toBe('partners');
    expect(pestanaPartners(null, false)).toBe('partners');
    expect(pestanaPartners('niveles', false)).toBe('niveles');
  });
});

describe('año en la zona de la organización (nunca el día UTC)', () => {
  it('el 1 de enero a las 02:00 UTC sigue siendo 31 de diciembre en Bogotá', () => {
    expect(anioEnZona('2027-01-01T02:00:00.000Z', ZONA)).toBe(2026);
    expect(anioEnZona('2027-01-01T02:00:00.000Z', 'UTC')).toBe(2027);
    expect(anioEnZona(null, ZONA)).toBeNull();
    expect(anioEnZona('no-fecha', ZONA)).toBeNull();
  });
  it('años con deals más el actual, de más reciente a más antiguo', () => {
    expect(aniosConDeals([deal({ id: 'a', created_at: '2025-03-01T12:00:00Z' })], ZONA, 2026)).toEqual([2026, 2025]);
  });
});

describe('tasa y nivel', () => {
  it('fuente de la tasa: propia > 0, si no del nivel, si no sin nivel', () => {
    expect(fuenteTasa({ commission_rate: 14, tier: { id: 'plata', name: 'Plata', commission_rate: 12 } })).toBe('propia');
    expect(fuenteTasa({ commission_rate: 0, tier: { id: 'plata', name: 'Plata', commission_rate: 12 } })).toBe('nivel');
    expect(fuenteTasa({ commission_rate: '0', tier: null })).toBe('sinNivel');
  });
  it('tono por posición en el ranking: Bronce azul, Plata gris, Oro ámbar, Platino marca', () => {
    expect(tonoNivel('bronce', tiers)).toBe('informacion');
    expect(tonoNivel('plata', tiers)).toBe('neutro');
    expect(tonoNivel('oro', tiers)).toBe('advertencia');
    expect(tonoNivel('platino', tiers)).toBe('marca');
    expect(tonoNivel(null, tiers)).toBe('neutro');
    expect(tonoNivel('huerfano', tiers)).toBe('neutro');
  });
});

describe('filtros, orden y paginación del directorio', () => {
  const lista = [
    partner({ id: 'a', name: 'Sergio Arango', company_name: 'Arango Consultores', tier_id: 'oro', tier: { id: 'oro', name: 'Oro', commission_rate: 15 }, deals_count: 12, revenue_attributed: 86400000 }),
    partner({ id: 'b', name: 'Natalia Rey', tier_id: 'plata', tier: { id: 'plata', name: 'Plata', commission_rate: 12 }, deals_count: 7, revenue_attributed: 38000000 }),
    partner({ id: 'c', name: 'Ricardo León', is_active: false }),
  ];
  it('por defecto solo activos; los filtros iniciales no cuentan como filtro', () => {
    expect(filtrarPartners(lista, FILTROS_PARTNERS_INICIALES).map((p) => p.id)).toEqual(['a', 'b']);
    expect(hayFiltrosPartners(FILTROS_PARTNERS_INICIALES)).toBe(false);
  });
  it('nivel, «sin nivel», inactivos y búsqueda sin tildes', () => {
    expect(filtrarPartners(lista, { q: '', nivel: 'oro', estado: 'todos' }).map((p) => p.id)).toEqual(['a']);
    expect(filtrarPartners(lista, { q: '', nivel: SIN_NIVEL, estado: 'todos' }).map((p) => p.id)).toEqual(['c']);
    expect(filtrarPartners(lista, { q: '', nivel: '', estado: 'inactivos' }).map((p) => p.id)).toEqual(['c']);
    expect(filtrarPartners(lista, { q: 'leon', nivel: '', estado: 'todos' }).map((p) => p.id)).toEqual(['c']);
    expect(filtrarPartners(lista, { q: 'consultores', nivel: '', estado: 'activos' }).map((p) => p.id)).toEqual(['a']);
  });
  it('orden por deals y revenue; asc → desc → sin orden', () => {
    expect(ordenarPartners(lista, { campo: 'deals', direccion: 'asc' }).map((p) => p.id)).toEqual(['c', 'b', 'a']);
    expect(ordenarPartners(lista, { campo: 'revenue', direccion: 'desc' }).map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(siguienteOrden(null, 'deals')).toEqual({ campo: 'deals', direccion: 'asc' });
    expect(siguienteOrden({ campo: 'deals', direccion: 'asc' }, 'deals')).toEqual({ campo: 'deals', direccion: 'desc' });
    expect(siguienteOrden({ campo: 'deals', direccion: 'desc' }, 'deals')).toBeNull();
    expect(paginar([1, 2, 3, 4, 5], 2, 2)).toEqual([3, 4]);
  });
  it('deals por monto de la oportunidad', () => {
    const ds = [deal({ id: 'x', opportunity: { amount: 5, status: 'open' } }), deal({ id: 'y', opportunity: { amount: 1, status: 'open' } })];
    expect(ordenarDeals(ds, { campo: 'monto', direccion: 'asc' }).map((d) => d.id)).toEqual(['y', 'x']);
  });
});

describe('KPI del directorio', () => {
  it('cuenta activos, deals del año (ganados/abiertos), por pagar (todas las fechas) y pagadas del año por fecha de pago', () => {
    const partners = [partner({ id: 'a', name: 'A' }), partner({ id: 'b', name: 'B', is_active: false })];
    const deals = [
      deal({ id: '1', commission_status: 'pending', commission_amount: 900000, opportunity: { amount: 6000000, status: 'won' } }),
      deal({ id: '2', commission_status: 'approved', commission_amount: '1920000', opportunity: { amount: 12800000, status: 'open' } }),
      deal({ id: '3', commission_status: 'paid', commission_amount: 1440000, commission_paid_at: '2026-09-15T15:00:00Z', opportunity: { amount: 9600000, status: 'won' } }),
      deal({ id: '4', commission_status: 'rejected', commission_amount: 0, opportunity: { amount: 15000000, status: 'lost' } }),
      deal({ id: '5', commission_status: 'paid', commission_amount: 500, created_at: '2025-06-01T15:00:00Z', commission_paid_at: '2025-07-01T15:00:00Z', opportunity: { amount: 1, status: 'won' } }),
    ];
    expect(kpisPartners(partners, deals, 2026, ZONA)).toEqual({
      activos: 1,
      inactivos: 1,
      dealsAnio: 4,
      ganadosAnio: 2,
      abiertosAnio: 1,
      porPagar: 2820000,
      porPagarCantidad: 2,
      pagadoAnio: 1440000,
      pagadasAnio: 1,
    });
  });
});

describe('acción de cada deal (máquina pending → approved → paid | rejected)', () => {
  const opp = (status: string) => ({ amount: 1, status });
  it('pendiente: ganado → aprobar/rechazar; abierto → espera; perdido → rechazar', () => {
    expect(accionDeal({ commission_status: 'pending', opportunity: opp('won') }, true)).toBe('aprobarRechazar');
    expect(accionDeal({ commission_status: 'pending', opportunity: opp('open') }, true)).toBe('esperaGanar');
    expect(accionDeal({ commission_status: 'pending', opportunity: opp('lost') }, true)).toBe('rechazar');
  });
  it('aprobada → registrar pago; pagada y rechazada son finales', () => {
    expect(accionDeal({ commission_status: 'approved', opportunity: opp('won') }, true)).toBe('registrarPago');
    expect(accionDeal({ commission_status: 'paid', opportunity: opp('won') }, true)).toBe('pagada');
    expect(accionDeal({ commission_status: 'rejected', opportunity: opp('lost') }, true)).toBe('noCuenta');
  });
  it('sin permiso de gestión no se ofrece ningún botón de transición', () => {
    expect(accionDeal({ commission_status: 'pending', opportunity: opp('won') }, false)).toBe('ninguna');
    expect(accionDeal({ commission_status: 'approved', opportunity: opp('won') }, false)).toBe('ninguna');
    expect(accionDeal({ commission_status: 'pending', opportunity: opp('open') }, false)).toBe('esperaGanar');
  });
});

describe('ficha: cifras y camino al siguiente nivel', () => {
  const deals = [
    deal({ id: '1', commission_status: 'paid', commission_amount: 1440000, opportunity: { amount: 9600000, status: 'won' } }),
    deal({ id: '2', commission_status: 'approved', commission_amount: 1920000, opportunity: { amount: 12800000, status: 'won' } }),
    deal({ id: '3', commission_status: 'pending', commission_amount: 900000, opportunity: { amount: 6000000, status: 'open' } }),
    deal({ id: '4', commission_status: 'rejected', commission_amount: 0, opportunity: { amount: 15000000, status: 'lost' } }),
  ];
  it('cifras excluyen los rechazados; revenue solo de ganadas', () => {
    expect(cifrasFicha(deals)).toEqual({ deals: 3, revenue: 22400000, porPagar: 2820000, pagada: 1440000, comisiones: 3 });
  });
  it('camino al nivel inmediatamente superior con los dos umbrales de la promoción', () => {
    const c = caminoSiguienteNivel(deals, tiers, 'plata');
    expect(c?.siguiente.id).toBe('oro');
    expect(c?.deals).toEqual({ actual: 3, meta: 10 });
    expect(c?.revenue).toEqual({ actual: 28400000, meta: 60000000 });
    expect(caminoSiguienteNivel(deals, tiers, null)?.siguiente.id).toBe('bronce');
    expect(caminoSiguienteNivel(deals, tiers, 'platino')).toBeNull();
    expect(caminoSiguienteNivel(deals, [], null)).toBeNull();
  });
});

describe('comisiones del año', () => {
  const partners = [
    partner({ id: 'p1', name: 'Sergio', tier: { id: 'oro', name: 'Oro', commission_rate: 15 }, effective_rate: 15 }),
    partner({ id: 'p2', name: 'Valentina', commission_rate: 14, effective_rate: 14 }),
    partner({ id: 'p3', name: 'Sin movimiento' }),
  ];
  const deals = [
    deal({ id: '1', partner_id: 'p1', commission_status: 'pending', commission_amount: 900000 }),
    deal({ id: '2', partner_id: 'p1', commission_status: 'paid', commission_amount: 7460000 }),
    deal({ id: '3', partner_id: 'p2', commission_status: 'paid', commission_amount: 1590000 }),
    deal({ id: '4', partner_id: 'p2', commission_status: 'rejected', commission_amount: 3640000 }),
    deal({ id: '5', partner_id: 'p3', commission_status: 'paid', commission_amount: 10, created_at: '2025-01-15T12:00:00Z' }),
  ];
  it('resumen por estado con porcentaje sobre el total del año', () => {
    const r = resumenComisionesAnio(deals, 2026, ZONA);
    expect(r.total).toBe(13590000);
    expect(r.tramos.map((x) => x.estado)).toEqual(['paid', 'approved', 'pending', 'rejected']);
    expect(r.tramos.find((x) => x.estado === 'paid')).toEqual({ estado: 'paid', monto: 9050000, pct: 67 });
  });
  it('una fila por partner con movimiento; el total excluye rechazadas y otros años', () => {
    const tabla = comisionesPorPartner(partners, deals, 2026, ZONA);
    expect(tabla.filas.map((f) => f.partnerId)).toEqual(['p1', 'p2']);
    expect(tabla.filas[1]).toMatchObject({ propia: true, pagada: 1590000, total: 1590000 });
    expect(tabla.total).toEqual({ pendiente: 900000, aprobada: 0, pagada: 9050000, total: 9950000 });
  });
});

describe('moneda, CSV y errores', () => {
  it('moneda única de los deals; si se mezclan o no hay, la de la organización', () => {
    expect(monedaDeals([deal({ id: '1', opportunity: { amount: 1, status: 'won', currency: 'usd' } })], 'COP')).toEqual({ moneda: 'USD', mezcladas: false });
    expect(monedaDeals([deal({ id: '1', opportunity: { amount: 1, status: 'won', currency: 'USD' } }), deal({ id: '2' })], 'COP')).toEqual({ moneda: 'COP', mezcladas: true });
    expect(monedaDeals([], 'MXN')).toEqual({ moneda: 'MXN', mezcladas: false });
  });
  it('CSV con comillas cuando hace falta y montos sin formato', () => {
    const csv = csvPartners([partner({ id: 'a', name: 'Rey, Natalia', is_active: false })], ['Nombre', 'Empresa', 'Correo', 'Tel', 'Nivel', 'Tasa', 'Deals', 'Revenue', 'Por pagar', 'Estado'], { activo: 'Activo', inactivo: 'Inactivo', sinNivel: 'Sin nivel' });
    expect(csv.split('\r\n')[1]).toBe('"Rey, Natalia",,a@example.com,,Sin nivel,0,0,0,0,Inactivo');
  });
  it('clave de error por `code` del servidor; red y 403 sin código', () => {
    expect(claveErrorPartners({ status: 409, code: 'DUPLICATE_DEAL' })).toBe('errores.codigos.DUPLICATE_DEAL');
    expect(claveErrorPartners({ status: 0, code: 'RED' })).toBe('errores.red');
    expect(claveErrorPartners({ status: 403, code: null })).toBe('errores.codigos.MANAGER_REQUIRED');
    expect(claveErrorPartners(new Error('x'))).toBe('errores.generico');
  });
});
