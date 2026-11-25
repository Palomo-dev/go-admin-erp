/// <reference types="jest" />
/**
 * Lógica pura de la pantalla Referidos (Figma 1298:768716 y hermanos):
 * siguiente paso único por estado, KPI (mes en la zona de la organización,
 * conversión, recompensas pendientes y pagadas), filtros, orden, páginas y
 * filas de «Recompensas».
 */

import type { ReferralView } from '@/lib/services/crm/referralsService';
import { toPlainDate } from '@/lib/utils/dateDisplay';
import {
  alternarOrden,
  beneficiarios,
  contarPorEstado,
  csvRecompensas,
  enlaceLead,
  esMonetaria,
  filasRecompensas,
  filtrar,
  FILTROS_VACIOS,
  hayFiltros,
  montoAdeudado,
  ordenar,
  paginar,
  puedeRechazar,
  referidosPorPrograma,
  resumenReferidos,
  siguientePaso,
} from '../referidosLogica';

const programa = (over: Partial<NonNullable<ReferralView['program']>> = {}) => ({ id: 'p1', name: 'Recomienda y gana', reward_type: 'credit', reward_amount: 50000, reward_to: 'both', is_active: true, ...over });

function ref(over: Partial<ReferralView> = {}): ReferralView {
  return {
    id: over.id ?? 'r1',
    organization_id: 1,
    program_id: 'p1',
    referrer_customer_id: 'c1',
    referred_customer_id: null,
    referred_name: 'Camila',
    referred_email: null,
    referred_phone: null,
    opportunity_id: null,
    status: 'pending',
    reward_paid: false,
    reward_paid_at: null,
    created_at: '2026-11-10T15:00:00Z',
    referrer: { id: 'c1', full_name: 'Laura' },
    referred: null,
    program: programa(),
    opportunity: null,
    ...over,
  };
}

// Día en la zona de la organización, sin depender de la zona del proceso.
const diaBogota = (iso: string) => toPlainDate(new Date(iso), 'America/Bogota');

describe('siguientePaso: la ÚNICA transición válida desde cada estado', () => {
  it('pending → contactar, contacted → calificar, qualified → convertir', () => {
    expect(siguientePaso(ref({ status: 'pending' }))).toBe('contactar');
    expect(siguientePaso(ref({ status: 'contacted' }))).toBe('calificar');
    expect(siguientePaso(ref({ status: 'qualified' }))).toBe('convertir');
  });
  it('converted con programa y sin pagar → registrar pago; pagado o sin programa → ver lead', () => {
    expect(siguientePaso(ref({ status: 'converted', referred_customer_id: 'c9' }))).toBe('registrarPago');
    expect(siguientePaso(ref({ status: 'converted', referred_customer_id: 'c9', reward_paid: true }))).toBe('verLead');
    expect(siguientePaso(ref({ status: 'converted', referred_customer_id: 'c9', program_id: null, program: null }))).toBe('verLead');
  });
  it('rechazado (o convertido sin enlace ni recompensa) → estado final', () => {
    expect(siguientePaso(ref({ status: 'rejected' }))).toBe('final');
    expect(siguientePaso(ref({ status: 'converted', reward_paid: true }))).toBe('final');
  });
  it('«Rechazar» solo mientras la máquina lo permite', () => {
    expect(puedeRechazar(ref({ status: 'qualified' }))).toBe(true);
    expect(puedeRechazar(ref({ status: 'converted' }))).toBe(false);
    expect(puedeRechazar(ref({ status: 'rejected' }))).toBe(false);
  });
  it('enlace del lead: oportunidad si la hay; si no, la ficha del cliente', () => {
    expect(enlaceLead({ opportunity_id: 'o1', referred_customer_id: 'c9' })).toBe('/app/crm/oportunidades/o1');
    expect(enlaceLead({ opportunity_id: null, referred_customer_id: 'c9' })).toBe('/app/crm/clientes/c9');
    expect(enlaceLead({ opportunity_id: null, referred_customer_id: null })).toBeNull();
  });
});

describe('recompensa: dinero solo si es crédito, efectivo o regalo con valor', () => {
  it('descuento nunca es dinero; «ambos» son dos personas', () => {
    expect(esMonetaria(programa({ reward_type: 'discount', reward_amount: 10 }))).toBe(false);
    expect(esMonetaria(programa({ reward_type: 'gift', reward_amount: 0 }))).toBe(false);
    expect(esMonetaria(programa({ reward_type: 'gift', reward_amount: 20000 }))).toBe(true);
    expect(beneficiarios(programa({ reward_to: 'both' }))).toBe(2);
    expect(montoAdeudado(programa({ reward_to: 'both', reward_amount: 50000 }))).toBe(100000);
    expect(montoAdeudado(programa({ reward_to: 'referrer', reward_amount: 0.1 }))).toBe(0.1);
    expect(montoAdeudado(programa({ reward_type: 'discount' }))).toBe(0);
    expect(montoAdeudado(null)).toBe(0);
  });
});

describe('resumenReferidos (KPI)', () => {
  const lista = [
    ref({ id: 'a', created_at: '2026-11-01T04:00:00Z' }), // 31 oct. en Bogotá: mes anterior
    ref({ id: 'b', created_at: '2026-11-01T06:00:00Z' }),
    ref({ id: 'c', status: 'converted', referred_customer_id: 'x', created_at: '2026-10-05T12:00:00Z' }),
    ref({ id: 'd', status: 'converted', referred_customer_id: 'y', reward_paid: true, reward_paid_at: '2026-03-01T12:00:00Z', program: programa({ reward_to: 'referrer' }) }),
    ref({ id: 'e', status: 'converted', referred_customer_id: 'z', program: programa({ reward_type: 'discount', reward_amount: 10 }) }),
    ref({ id: 'f', status: 'converted', referred_customer_id: 'w', reward_paid: true, reward_paid_at: '2025-12-31T12:00:00Z' }),
  ];
  const r = resumenReferidos(lista, '2026-11-15', diaBogota);
  it('este mes y mes anterior por día de la organización', () => {
    expect(r.esteMes).toBe(4);
    expect(r.mesAnterior).toBe(2);
  });
  it('tasa = convertidos / total, entera', () => {
    expect(r.convertidos).toBe(4);
    expect(r.tasa).toBe(67);
  });
  it('pendientes: cuenta todas las convertidas con programa sin pagar; el monto solo suma dinero', () => {
    expect(r.pendientesN).toBe(2);
    expect(r.pendientesMonto).toBe(100000);
    expect(r.noMonetariasPendientes).toBe(1);
  });
  it('pagadas: solo las de este año', () => {
    expect(r.pagadasN).toBe(1);
    expect(r.pagadasMonto).toBe(50000);
  });
  it('lista vacía: todo en cero, sin dividir por cero', () => {
    expect(resumenReferidos([], '2026-01-10', diaBogota)).toMatchObject({ total: 0, tasa: 0, mesAnterior: 0 });
  });
});

describe('filtros, conteos, orden y páginas', () => {
  const lista = [
    ref({ id: '1', referred_name: 'Bruno', status: 'pending', program_id: 'p1' }),
    ref({ id: '2', referred_name: 'álvaro', status: 'qualified', program_id: 'p2', program: programa({ id: 'p2', name: 'Aliados' }), created_at: '2026-11-12T00:00:00Z' }),
    ref({ id: '3', referred_name: 'Carla', status: 'qualified', program_id: null, program: null, created_at: '2026-11-01T00:00:00Z' }),
  ];
  it('estado, programa («sin» = sin programa) y texto sin tildes', () => {
    expect(filtrar(lista, { ...FILTROS_VACIOS, estado: 'qualified' }).map((r) => r.id)).toEqual(['2', '3']);
    expect(filtrar(lista, { ...FILTROS_VACIOS, programa: 'sin' }).map((r) => r.id)).toEqual(['3']);
    expect(filtrar(lista, { ...FILTROS_VACIOS, programa: 'p2' }).map((r) => r.id)).toEqual(['2']);
    expect(filtrar(lista, { ...FILTROS_VACIOS, q: 'alvaro' }).map((r) => r.id)).toEqual(['2']);
    expect(hayFiltros(FILTROS_VACIOS)).toBe(false);
    expect(hayFiltros({ ...FILTROS_VACIOS, q: ' x ' })).toBe(true);
  });
  it('conteos por estado con «todos»', () => {
    expect(contarPorEstado(lista)).toMatchObject({ todos: 3, pending: 1, qualified: 2, converted: 0 });
  });
  it('orden por nombre (sin distinguir tildes ni mayúsculas) y por fecha', () => {
    expect(ordenar(lista, { campo: 'referido', dir: 'asc' }).map((r) => r.id)).toEqual(['2', '1', '3']);
    expect(ordenar(lista, { campo: 'registrado', dir: 'desc' }).map((r) => r.id)).toEqual(['2', '1', '3']);
    expect(alternarOrden({ campo: 'registrado', dir: 'desc' }, 'registrado')).toEqual({ campo: 'registrado', dir: 'asc' });
    expect(alternarOrden({ campo: 'registrado', dir: 'desc' }, 'referido')).toEqual({ campo: 'referido', dir: 'asc' });
  });
  it('paginar acota la página al rango', () => {
    expect(paginar([1, 2, 3, 4, 5], 2, 2)).toEqual([3, 4]);
    expect(paginar([1, 2, 3], 9, 2)).toEqual([3]);
    expect(paginar([], 1, 25)).toEqual([]);
  });
  it('referidos por programa', () => {
    expect(referidosPorPrograma(lista)).toEqual({ p1: 1, p2: 1 });
  });
});

describe('Recompensas', () => {
  const lista = [
    ref({ id: 'p', status: 'converted', referred_customer_id: 'x' }),
    ref({ id: 'q', status: 'converted', referred_customer_id: 'y', reward_paid: true, reward_paid_at: '2026-10-01T00:00:00Z' }),
    ref({ id: 's', status: 'converted', referred_customer_id: 'z', program_id: null, program: null }),
    ref({ id: 't', status: 'qualified' }),
  ];
  it('pendientes = las que el servidor dejaría pagar; pagadas = con programa y pagadas', () => {
    expect(filasRecompensas(lista, 'pendientes').map((r) => r.id)).toEqual(['p']);
    expect(filasRecompensas(lista, 'pagadas').map((r) => r.id)).toEqual(['q']);
  });
  it('CSV escapa comas y comillas', () => {
    const csv = csvRecompensas([lista[0]], ['A', 'B'], () => ['x, y', 'di "hola"']);
    expect(csv).toBe('A,B\n"x, y","di ""hola"""');
  });
});
