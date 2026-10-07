/**
 * Formulario «Cuando el cliente no tiene interés» (Agentes IA › Ajustes):
 * borrador, validación (la misma que el servidor), cuerpo sin organización y
 * errores que devuelve la ruta. Más la franja del agente en la oportunidad.
 */
import { CONFIG_DESINTERES_POR_DEFECTO } from '@/lib/services/crm/voiceAgent/desinteresConfig';
import {
  borradorDesde,
  cuerpoDesde,
  erroresDesdeServidor,
  hayErrores,
  mismoBorrador,
  validarBorrador,
} from '../desinteresVozLogica';
import { enlaceLlamada, etapaParaReabrir, franjaAgenteVoz } from '@/components/crm/oportunidad/perdidaPorAgenteLogica';

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('borrador', () => {
  test('sin configuración: marcar perdida, sin excepciones y la moneda de la organización', () => {
    expect(borradorDesde(CONFIG_DESINTERES_POR_DEFECTO, 'COP')).toEqual({ modo: 'mark_lost', valorActiva: false, monto: null, moneda: 'COP', etapaActiva: false, etapaId: null });
  });

  test('el cuerpo no lleva organización', () => {
    const c = cuerpoDesde(borradorDesde(CONFIG_DESINTERES_POR_DEFECTO, 'COP'));
    expect(Object.keys(c).sort()).toEqual(['excepcionEtapa', 'excepcionValor', 'modo']);
    expect(JSON.stringify(c)).not.toMatch(/organiz/i);
  });

  test('detecta cambios', () => {
    const a = borradorDesde(CONFIG_DESINTERES_POR_DEFECTO, 'COP');
    expect(mismoBorrador(a, { ...a })).toBe(true);
    expect(mismoBorrador(a, { ...a, modo: 'log_only' })).toBe(false);
  });
});

describe('validación', () => {
  const base = { ...borradorDesde(CONFIG_DESINTERES_POR_DEFECTO, 'COP'), valorActiva: true };
  test.each([
    [{ monto: null }, { monto: 'monto_requerido' }],
    [{ monto: -5 }, { monto: 'monto_negativo' }],
    [{ monto: 0 }, {}],
    [{ monto: 10, moneda: null }, { moneda: 'moneda_requerida' }],
    [{ monto: 10, moneda: 'EUR' }, { moneda: 'moneda_invalida' }],
    [{ monto: 10, etapaActiva: true, etapaId: null }, { etapa: 'etapa_requerida' }],
  ])('%j → %j', (cambio, esperado) => {
    const e = validarBorrador({ ...base, ...cambio }, ['COP', 'USD']);
    expect(e).toEqual(esperado);
    expect(hayErrores(e)).toBe(Object.keys(esperado).length > 0);
  });

  test('con la excepción apagada no se valida el monto', () => {
    expect(validarBorrador({ ...base, valorActiva: false, monto: -1 }, ['COP'])).toEqual({});
  });

  test('errores del servidor (zod y de negocio) a sus campos', () => {
    expect(erroresDesdeServidor({ details: { fieldErrors: { excepcionValor: ['monto_negativo'] } } })).toEqual({ monto: 'monto_negativo' });
    expect(erroresDesdeServidor({ code: 'etapa_invalida' })).toEqual({ etapa: 'etapa_invalida' });
    expect(erroresDesdeServidor({ code: 'CRM_FORBIDDEN' })).toEqual({});
    expect(erroresDesdeServidor(null)).toEqual({});
  });
});

describe('franja del agente en la oportunidad', () => {
  const marca = { at: '2026-10-07T15:00:00Z', motivo: 'Sin interés: x', resumen: 'Llamada de 1 min.', call_id: U(70), etapa_anterior_id: U(42) };

  test('perdida por el agente: motivo, resumen, llamada y etapa a la que reabrir', () => {
    expect(franjaAgenteVoz({ status: 'lost', metadata: { cierre_agente_voz: marca } }, null)).toEqual({
      tipo: 'perdida', en: marca.at, motivo: marca.motivo, resumen: marca.resumen, callId: U(70), etapaAnteriorId: U(42),
    });
  });

  test('perdida a mano (sin marca) o reabierta: no hay franja', () => {
    expect(franjaAgenteVoz({ status: 'lost', metadata: {} }, null)).toBeNull();
    expect(franjaAgenteVoz({ status: 'open', metadata: { cierre_agente_voz: marca } }, null)).toBeNull();
  });

  test('desde el aviso de tarea (?llamada=) con la oportunidad abierta: «decide tú»', () => {
    expect(franjaAgenteVoz({ status: 'open', metadata: null }, U(70))).toEqual({ tipo: 'decidir', callId: U(70) });
    // Un parámetro que no es uuid no se pinta (no se arma un enlace con texto arbitrario).
    expect(franjaAgenteVoz({ status: 'open', metadata: null }, 'javascript:alert(1)')).toBeNull();
    expect(franjaAgenteVoz({ status: 'lost', metadata: { cierre_agente_voz: { ...marca, call_id: '<x>' } } }, null)).toMatchObject({ callId: null });
  });

  test('enlace a Llamadas y etapa para reabrir', () => {
    expect(enlaceLlamada(U(70))).toBe(`/app/crm/llamadas?call=${U(70)}`);
    const etapas = [
      { id: U(41), position: 1 },
      { id: U(42), position: 2 },
      { id: U(49), position: 9, is_lost: true },
    ];
    expect(etapaParaReabrir(etapas, U(42))).toBe(U(42));
    expect(etapaParaReabrir(etapas, U(49))).toBe(U(41));
    expect(etapaParaReabrir(etapas, null)).toBe(U(41));
    expect(etapaParaReabrir([], null)).toBeNull();
  });
});
