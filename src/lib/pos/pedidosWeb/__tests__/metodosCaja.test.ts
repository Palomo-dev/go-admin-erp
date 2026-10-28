/// <reference types="jest" />
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CONFIRMAR_CANCELADOS_ANTIGUOS,
  debeCobrarseEnCaja,
  diasCanceladoQuePidenConfirmacion,
  METODOS_NO_PASARELA,
  pedidoEsDePasarela,
  esMetodoCobroEnCaja,
  esMetodoDePasarela,
  marcaPagadoPorPasarela,
  metodoDeCobroEnCaja,
  pedidoPagadoPorPasarela,
} from '../metodosCaja';

describe('metodoDeCobroEnCaja', () => {
  it.each(['cash', 'transfer', 'qr'])('%s se cobra tal cual', (m) => {
    expect(metodoDeCobroEnCaja(m)).toBe(m);
  });
  it('nequi, daviplata y card del pedido web son Wompi (webhook wompi_co): pasarela, nunca caja', () => {
    for (const m of ['nequi', ' DaviPlata ', 'card', 'NEQUI']) {
      expect(esMetodoDePasarela(m)).toBe(true);
      expect(metodoDeCobroEnCaja(m)).toBeNull();
    }
  });
  it('en el diálogo de caja, card (datáfono) sí es un método de caja', () => {
    expect(esMetodoCobroEnCaja('card')).toBe(true);
    expect(esMetodoCobroEnCaja('wompi')).toBe(false);
    expect(esMetodoCobroEnCaja(null)).toBe(false);
  });
  it('QR del banco (bancolombia_qr, breb_qr, redeban_qr) y 001/002/SQS no se tocan: no son pasarela', () => {
    for (const m of ['bancolombia_qr', 'breb_qr', 'redeban_qr', '001', '002', 'SQS']) {
      expect(esMetodoDePasarela(m)).toBe(false);
    }
  });
  it.each([
    'wompi', 'wompi_co', 'WOMPI', 'epayco', 'mercadopago', 'mp', 'payu', 'stripe', 'paypal',
    'bold', 'bold_link', 'bold_card', 'addi', 'pse', 'bancolombia_bnpl', 'bancolombia_collect', 'su_plus',
  ])('la pasarela %s NO cae en efectivo', (m) => {
    expect(esMetodoDePasarela(m)).toBe(true);
    expect(metodoDeCobroEnCaja(m)).toBeNull();
  });
  it('sin método o desconocido sigue siendo efectivo', () => {
    expect(metodoDeCobroEnCaja(null)).toBe('cash');
    expect(metodoDeCobroEnCaja('')).toBe('cash');
    expect(metodoDeCobroEnCaja('mesa')).toBe('cash');
  });
});

describe('regla de pasarela pagada', () => {
  it('pagado por Wompi: ya cobrado, no se cobra en caja', () => {
    const o = { payment_status: 'paid', payment_method: 'wompi' };
    expect(pedidoPagadoPorPasarela(o)).toBe(true);
    expect(debeCobrarseEnCaja(o)).toBe(false);
  });
  it('pendiente de Wompi: «Marcar como pagado» no lo cobra en caja (se marca por la pasarela)', () => {
    const o = { payment_status: 'pending', payment_method: 'wompi' };
    expect(pedidoPagadoPorPasarela(o)).toBe(false);
    expect(debeCobrarseEnCaja(o)).toBe(false);
  });
  it('pagado en efectivo no es pasarela; pendiente en efectivo sí se cobra en caja', () => {
    expect(pedidoPagadoPorPasarela({ payment_status: 'paid', payment_method: 'cash' })).toBe(false);
    expect(debeCobrarseEnCaja({ payment_status: 'pending', payment_method: 'cash' })).toBe(true);
    expect(debeCobrarseEnCaja({ payment_status: 'paid', payment_method: 'cash' })).toBe(false);
  });
});

describe('marcaPagadoPorPasarela', () => {
  it('pasarela sin pagar (incluye vencido): sí', () => {
    expect(marcaPagadoPorPasarela({ status: 'confirmed', payment_status: 'pending', payment_method: 'wompi' })).toBe(true);
    expect(marcaPagadoPorPasarela({ status: 'expired', payment_status: 'pending', payment_method: 'nequi' })).toBe(true);
  });
  it('pagado, anulado, de mesa o no pasarela: no', () => {
    expect(marcaPagadoPorPasarela({ status: 'confirmed', payment_status: 'paid', payment_method: 'wompi' })).toBe(false);
    expect(marcaPagadoPorPasarela({ status: 'rejected', payment_status: 'pending', payment_method: 'wompi' })).toBe(false);
    expect(marcaPagadoPorPasarela({ status: 'confirmed', payment_status: 'pending', payment_method: 'wompi', table_session_id: 'ts' })).toBe(false);
    expect(marcaPagadoPorPasarela({ status: 'confirmed', payment_status: 'pending', payment_method: 'cash' })).toBe(false);
  });
});

describe('METODOS_NO_PASARELA (caja) = lista de fn_pedido_web_es_pasarela', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20261027241500_fn_cobrar_pedido_web_pasarela.sql'),
    'utf8',
  );
  const m = sql.match(/-- METODOS_NO_PASARELA[^\n]*\n\s*and lower\(btrim\(coalesce\(p_metodo, ''\)\)\) not in \(([\s\S]*?)\)\);/);
  const enSql = new Set([...(m?.[1] ?? '').matchAll(/'([^']*)'/g)].map((x) => x[1]));

  it('SQL y TS tienen exactamente los mismos métodos', () => {
    expect(m).not.toBeNull();
    expect([...enSql].sort()).toEqual([...METODOS_NO_PASARELA].sort());
  });

  it.each([
    'pos', 'tarjeta', 'tarjeta_credito', 'tarjeta_debito', 'datafono', 'datáfono', 'contra_entrega',
    'contraentrega', 'efectivo', 'consignacion', 'transferencia_bancaria', 'credito', 'fiado', 'cheque',
  ])('%s con referencia NO es de pasarela', (metodo) => {
    expect(METODOS_NO_PASARELA.has(metodo)).toBe(true);
    expect(pedidoEsDePasarela({ payment_method: metodo, payment_reference: 'REF-123' } as never)).toBe(false);
  });

  it('un submétodo desconocido con referencia sigue siendo de pasarela', () => {
    expect(pedidoEsDePasarela({ payment_method: 'pse', payment_reference: 'REF-1' } as never)).toBe(true);
  });
});

describe('confirmación de cancelados antiguos (opción apagada)', () => {
  const viejo = {
    status: 'cancelled', payment_status: 'failed', payment_method: 'wompi', payment_reference: null,
    cancelled_at: '2026-08-01T00:00:00Z',
  } as never;
  const ahora = new Date('2026-10-27T12:00:00Z');

  it('hoy está apagada: clic directo', () => {
    expect(CONFIRMAR_CANCELADOS_ANTIGUOS).toBe(false);
    expect(diasCanceladoQuePidenConfirmacion(viejo, ahora)).toBeNull();
  });

  it('encendida: pide confirmar solo si pasan de 30 días', () => {
    expect(diasCanceladoQuePidenConfirmacion(viejo, ahora, true)).toBe(87);
    const reciente = { ...(viejo as object), cancelled_at: '2026-10-10T00:00:00Z' } as never;
    expect(diasCanceladoQuePidenConfirmacion(reciente, ahora, true)).toBeNull();
  });
});
