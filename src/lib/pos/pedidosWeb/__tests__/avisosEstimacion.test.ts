/// <reference types="jest" />
/**
 * Avisos de estado con la FECHA de la promesa, no solo la hora.
 *
 * Bug que impide reincidir (org 333, 2026-11-08): un pedido confirmado a las
 * 14:26 con promesa de listo el 11-nov y entrega el 26-nov avisaba
 * «Hora estimada 14:26» y «alrededor de las 14:26»; la clienta preguntó
 * «¿y entonces hasta cuándo?». Todo en America/Bogota.
 */
jest.mock('@/lib/services/crm/email/resendClient', () => ({
  getMasterResend: jest.fn(),
  getMasterResendKey: jest.fn(() => null),
}));
jest.mock('@/lib/services/organizationTimezoneService', () => ({
  getOrganizationTimezone: jest.fn(async () => 'America/Bogota'),
}));

import { estimacionEnZona, formatEstimateInTz } from '@/lib/utils/dateDisplay';
import { rubroDeTipoOrg, textoAviso, type DatosAviso } from '@/lib/pos/pedidosWeb/avisosCliente';
import { armarCorreoEstado } from '@/lib/services/orderStatusEmailService';

const TZ = 'America/Bogota';
/** 8-nov-2026 14:26 en Bogotá: el momento en que se confirmó el pedido real. */
const AHORA = new Date('2026-11-08T19:26:56Z');

const CASOS = [
  { nombre: 'mismo día', instante: '2026-11-08T23:30:00Z', corto: 'hoy, 18:30', frase: 'hoy alrededor de las 18:30' },
  // 22:00 en Bogotá ya es 9-nov en UTC: sigue siendo «hoy» en la zona de la org.
  { nombre: 'mismo día, ya mañana en UTC', instante: '2026-11-09T03:00:00Z', corto: 'hoy, 22:00', frase: 'hoy alrededor de las 22:00' },
  { nombre: 'mañana', instante: '2026-11-09T19:26:56Z', corto: 'mañana, 14:26', frase: 'mañana alrededor de las 14:26' },
  { nombre: '+3 días', instante: '2026-11-11T19:26:56Z', corto: 'mié 11 nov, 14:26', frase: 'alrededor del mié 11 nov a las 14:26' },
  { nombre: '+18 días', instante: '2026-11-26T19:26:56Z', corto: 'jue 26 nov, 14:26', frase: 'alrededor del jue 26 nov a las 14:26' },
];

describe('formatEstimateInTz', () => {
  it.each(CASOS)('$nombre → $corto', ({ instante, corto }) => {
    expect(formatEstimateInTz(instante, TZ, AHORA)).toBe(corto);
  });

  it('sin valor o inválido devuelve vacío', () => {
    expect(formatEstimateInTz(null, TZ, AHORA)).toBe('');
    expect(formatEstimateInTz('no-es-fecha', TZ, AHORA)).toBe('');
    expect(estimacionEnZona(undefined, TZ, AHORA)).toBeNull();
  });
});

describe('textoAviso (WhatsApp y texto del correo)', () => {
  const base = (listo: string, entrega: string): DatosAviso => ({
    cliente: 'Ana Gómez',
    numero: 'WO-333-1',
    negocio: 'Una tienda de hogar',
    listoAprox: estimacionEnZona(listo, TZ, AHORA),
    entregaAprox: estimacionEnZona(entrega, TZ, AHORA),
    zonaHoraria: 'hora de Bogota',
    rubro: 'tienda',
  });

  it.each(CASOS)('confirmado, $nombre: la promesa lleva el día', ({ instante, frase }) => {
    const t = textoAviso('confirmado', base(instante, instante));
    expect(t).toContain(`Estará listo ${frase} y llegará a tu dirección ${frase} (hora de Bogota).`);
  });

  it('el caso real: listo el 11-nov y entrega el 26-nov, nunca solo «14:26»', () => {
    const t = textoAviso('confirmado', base('2026-11-11T19:26:56Z', '2026-11-26T19:26:56Z'));
    expect(t).toContain(
      'Estará listo alrededor del mié 11 nov a las 14:26 y llegará a tu dirección alrededor del jue 26 nov a las 14:26 (hora de Bogota).',
    );
    expect(t).not.toMatch(/alrededor de las 14:26/);
    expect(t).toContain('Ya estamos alistando tu pedido WO-333-1.');
  });

  it('en camino también lleva el día', () => {
    const t = textoAviso('en_camino', base('2026-11-11T19:26:56Z', '2026-11-26T19:26:56Z'));
    expect(t).toContain('Llega alrededor del jue 26 nov a las 14:26 (hora de Bogota).');
  });

  it('un restaurante sigue «preparando»', () => {
    const t = textoAviso('confirmado', { ...base(CASOS[0].instante, CASOS[0].instante), rubro: 'restaurante' });
    expect(t).toContain('Ya estamos preparando tu pedido WO-333-1.');
  });

  it('rubro según organization_types', () => {
    expect(rubroDeTipoOrg('restaurant')).toBe('restaurante');
    expect(rubroDeTipoOrg('retail')).toBe('tienda');
    expect(rubroDeTipoOrg(null)).toBeNull();
  });
});

describe('correo de estado (HTML y texto)', () => {
  const correo = (
    estado: 'confirmed' | 'in_delivery',
    listo: string | null,
    entrega: string | null,
    extra: { rubro?: 'restaurante' | 'tienda'; conEnvio?: boolean } = {},
  ) =>
    armarCorreoEstado({
      estado,
      numeroPedido: 'WO-333-1',
      nombreCliente: 'Ana',
      nombreNegocio: 'Una tienda de hogar',
      urlSeguimiento: null,
      listoAprox: listo ? formatEstimateInTz(listo, TZ, AHORA) : null,
      entregaAprox: entrega ? formatEstimateInTz(entrega, TZ, AHORA) : null,
      ...extra,
    });

  it.each(CASOS)('$nombre: filas «Listo aprox.» y «Entrega aprox.» con el día', ({ instante, corto }) => {
    const c = correo('confirmed', instante, instante);
    expect(c.html).toContain('Listo aprox.');
    expect(c.html).toContain('Entrega aprox.');
    expect(c.html).toContain(corto);
    expect(c.html).not.toContain('Hora estimada');
    expect(c.text).toContain(`Listo aprox.: ${corto}`);
    expect(c.text).toContain(`Entrega aprox.: ${corto}`);
  });

  it('sin estimated_delivery_at no hay fila de entrega', () => {
    const c = correo('confirmed', CASOS[3].instante, null);
    expect(c.html).toContain('mié 11 nov, 14:26');
    expect(c.html).not.toContain('Entrega aprox.');
  });

  it('en camino: solo la entrega', () => {
    const c = correo('in_delivery', null, CASOS[4].instante);
    expect(c.html).not.toContain('Listo aprox.');
    expect(c.html).toContain('jue 26 nov, 14:26');
  });

  it('una tienda con envío «alista para el envío»; un restaurante sigue preparando', () => {
    expect(correo('confirmed', null, null, { rubro: 'tienda', conEnvio: true }).html).toContain('pronto lo alistaremos para el envío');
    expect(correo('confirmed', null, null, { rubro: 'tienda', conEnvio: false }).html).toContain('pronto lo alistaremos para que lo recojas');
    expect(correo('confirmed', null, null, { rubro: 'restaurante', conEnvio: true }).html).toContain('pronto comenzaremos a prepararlo');
    expect(correo('confirmed', null, null).html).toContain('pronto comenzaremos a prepararlo');
  });
});
