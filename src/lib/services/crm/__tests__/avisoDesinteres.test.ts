/**
 * Aviso al vendedor cuando el agente de voz marca perdida o le deja la tarea:
 * contenido (motivo, resumen, enlace a la oportunidad con la llamada), a quién
 * va y que sale EN EL MOMENTO (despacho inmediato, sin esperar al cron).
 */

jest.mock('@/lib/services/avisos/despachoAvisos', () => ({ despacharAvisosPendientes: jest.fn() }));

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  avisarVendedorDesinteres,
  contenidoAvisoDesinteres,
  duracionLegible,
  resumenBreveLlamada,
} from '@/lib/services/crm/voiceAgent/avisoDesinteres';
import { despacharAvisosPendientes } from '@/lib/services/avisos/despachoAvisos';

const OPP = { id: '00000000-0000-4000-8000-000000000001', name: 'Renovación licencias' };
const CALL = '00000000-0000-4000-8000-000000000070';

describe('contenido', () => {
  test('perdida: motivo, resumen y enlace a la oportunidad con la llamada', () => {
    const c = contenidoAvisoDesinteres({ tipo: 'perdida', oportunidad: OPP, motivo: 'Sin interés: ya tiene software', resumen: 'Llamada de 1 min 42 s.', callId: CALL });
    expect(c.titulo).toBe('El agente de voz marcó perdida «Renovación licencias»');
    expect(c.cuerpo).toBe('Motivo: Sin interés: ya tiene software. Llamada de 1 min 42 s. Abre la oportunidad para escuchar la llamada o reabrirla.');
    expect(c.href).toBe(`/app/crm/oportunidades/${OPP.id}?llamada=${CALL}`);
  });

  test('tarea por valor alto: dice por qué no se cerró, con montos en su moneda', () => {
    const c = contenidoAvisoDesinteres({
      tipo: 'tarea', oportunidad: OPP, motivo: 'Sin interés: x', resumen: null, callId: null,
      razones: ['modo_perdida', 'excepcion_valor'], valor: { monto: 25_000_000, moneda: 'COP' }, umbral: { monto: 20_000_000, moneda: 'COP' },
    });
    expect(c.titulo).toBe('Decide sobre «Renovación licencias»: el cliente no tiene interés');
    expect(c.cuerpo).toMatch(/^No se cerró porque vale .*25\.000\.000.* \(igual o más que .*20\.000\.000.*\)\. Motivo: Sin interés: x\./);
    expect(c.href).toBe(`/app/crm/oportunidades/${OPP.id}`);
  });

  test.each([
    [['excepcion_etapa'], 'etapa avanzada'],
    [['politica_etapa'], '«Sugerir»'],
    [['modo_tarea'], 'Tu organización pidió'],
    [['excepcion_valor_sin_tasa'], 'no hay tasa de cambio'],
  ] as const)('tarea por %j', (razones, texto) => {
    expect(contenidoAvisoDesinteres({ tipo: 'tarea', oportunidad: OPP, motivo: 'm', resumen: null, callId: null, razones: [...razones] }).cuerpo).toContain(texto);
  });
});

describe('resumen breve de la llamada', () => {
  test('duración y la última respuesta del cliente', () => {
    const inicio = new Date('2026-10-07T15:00:00Z');
    const r = resumenBreveLlamada(
      [
        { role: 'assistant', content: 'Hola' },
        { role: 'user', content: 'No, todo funciona perfecto' },
        { role: 'assistant', content: '¿Y la facturación?' },
        { role: 'user', content: '  No me interesa,   gracias ' },
        { role: 'tool', content: '{}' },
      ],
      inicio,
      new Date('2026-10-07T15:01:42Z'),
    );
    expect(r).toBe('Llamada de 1 min 42 s; el cliente dijo: «No me interesa, gracias».');
  });

  test('recorta lo que dijo el cliente y aguanta llamadas sin turnos', () => {
    const largo = 'a'.repeat(300);
    expect(resumenBreveLlamada([{ role: 'user', content: largo }], null)).toMatch(/^El cliente dijo: «a{139}…»\.$/);
    expect(resumenBreveLlamada([], null)).toBeNull();
    expect(duracionLegible(35)).toBe('35 s');
    expect(duracionLegible(120)).toBe('2 min');
  });
});

describe('envío', () => {
  function cliente(error: { message: string } | null = null) {
    const rpc = jest.fn(async () => ({ data: error ? null : 'aviso-1', error }));
    return { sb: { rpc } as unknown as SupabaseClient, rpc };
  }
  const datos = { tipo: 'perdida' as const, oportunidad: OPP, motivo: 'm', resumen: null, callId: null };

  beforeEach(() => {
    (despacharAvisosPendientes as jest.Mock).mockReset();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  test('usa la función de avisos de los triggers y despacha en el momento', async () => {
    const { sb, rpc } = cliente();
    const r = await avisarVendedorDesinteres({ orgId: 120, supabase: sb, llaveLlamada: 'vac-1', responsable: 'u-1', creador: 'u-2' }, datos);
    expect(r).toEqual({ enviado: true, avisoId: 'aviso-1', destinatario: 'u-1' });
    expect(rpc).toHaveBeenCalledWith('fn_avisos_miembro_poner', expect.objectContaining({ p_org: 120, p_recipient: 'u-1', p_actor: null, p_event: 'oportunidad.perdida', p_key: `120:voz.desinteres.perdida:${OPP.id}:vac-1` }));
    expect(despacharAvisosPendientes).toHaveBeenCalledWith(120, sb);
  });

  test('sin responsable ni creador: no hay aviso', async () => {
    const { sb, rpc } = cliente();
    expect(await avisarVendedorDesinteres({ orgId: 120, supabase: sb, llaveLlamada: 'k', responsable: null, creador: null }, datos)).toEqual({ enviado: false, motivo: 'sin_destinatario' });
    expect(rpc).not.toHaveBeenCalled();
  });

  test('tarea sin id de tarea: no hay entidad a la que enlazar', async () => {
    const { sb } = cliente();
    expect(await avisarVendedorDesinteres({ orgId: 120, supabase: sb, llaveLlamada: 'k', responsable: 'u', creador: null }, { ...datos, tipo: 'tarea' })).toEqual({ enviado: false, motivo: 'sin_entidad' });
  });

  test('error de la base: se registra y no se despacha', async () => {
    const { sb } = cliente({ message: 'boom' });
    expect(await avisarVendedorDesinteres({ orgId: 120, supabase: sb, llaveLlamada: 'k', responsable: 'u', creador: null }, datos)).toEqual({ enviado: false, motivo: 'error', detalle: 'boom' });
    expect(despacharAvisosPendientes).not.toHaveBeenCalled();
  });
});
