/**
 * Voz (Figma CRM 1804:905009): «Qué sabe el agente» y chips «por qué no marca»
 * de las campañas en marcha.
 *
 *  - El editor y el runtime de la llamada usan el MISMO criterio
 *    (`seleccionarConocimientoVoz`): prioridad, tope de caracteres, `solo-chat`
 *    fuera, y al primero que no cabe se corta.
 *  - Los chips no evalúan reglas: traducen el diagnóstico del servidor
 *    (compuerta real `crm_voice_campana_bloqueos` + diagnóstico TS).
 *  - «Llama sola cada N min» sale del cron declarado, no de un 5 cableado.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ETIQUETA_SOLO_CHAT,
  MAX_CONOCIMIENTO_VOZ,
  seleccionarConocimientoVoz,
  type FilaFragmentoVoz,
} from '@/lib/services/crm/voiceAgent/agentRuntime';
import { conocimientoParaEditor, primeraLinea, LARGO_RESUMEN_FRAGMENTO } from '@/lib/services/crm/voiceAgent/conocimientoEditor';
import { estadoQueSabe, listaExcluidos, porcentajeTope, type ConocimientoVozApi } from '../editor/queSabeLogica';
import { campanaBloqueada, chipsDeCampana } from '../campanas/chipsBloqueo';
import { intervaloMinutosDe, proximaPasada } from '@/lib/jobs/schedule';
import type { DiagnosticoCampana } from '@/lib/services/crm/voiceCampaignDiagnostics';

const fila = (p: Partial<FilaFragmentoVoz> & { content: string }): FilaFragmentoVoz => ({ title: 'T', tags: null, priority: 1, ...p });

describe('seleccionarConocimientoVoz (criterio único runtime/editor)', () => {
  test('salta solo-chat (sin distinguir mayúsculas) y los vacíos', () => {
    const sel = seleccionarConocimientoVoz([
      fila({ id: 'a', title: 'Precios', content: 'Lista de precios' }),
      fila({ id: 'b', title: 'Interno', content: 'x', tags: ['Solo-Chat'] }),
      fila({ id: 'c', title: 'Vacío', content: '   ' }),
    ]);
    expect(ETIQUETA_SOLO_CHAT).toBe('solo-chat');
    expect(sel.incluidos.map((f) => f.id)).toEqual(['a']);
    expect(sel.soloChat).toEqual([{ id: 'b', title: 'Interno' }]);
    expect(sel.caracteres).toBe('Lista de precios'.length);
  });

  test('al primero que no cabe en el tope se corta: los siguientes tampoco entran aunque quepan', () => {
    const grande = 'x'.repeat(MAX_CONOCIMIENTO_VOZ - 10);
    const sel = seleccionarConocimientoVoz([
      fila({ id: 'a', content: grande, priority: 3 }),
      fila({ id: 'b', content: 'y'.repeat(20), priority: 2, title: 'Casos' }),
      fila({ id: 'c', content: 'z', priority: 1, title: 'Glosario' }),
    ]);
    expect(sel.incluidos.map((f) => f.id)).toEqual(['a']);
    expect(sel.fueraDelTope).toEqual([
      { id: 'b', title: 'Casos', priority: 2 },
      { id: 'c', title: 'Glosario', priority: 1 },
    ]);
  });

  test('el runtime arma el prompt con la misma selección (sin lógica repetida)', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/services/crm/voiceAgent/agentRuntime.ts'), 'utf8');
    const cuerpo = src.slice(src.indexOf('export async function cargarConocimientoVoz'));
    expect(cuerpo).toMatch(/seleccionarConocimientoVoz\(filas\)/);
    expect(cuerpo).not.toMatch(/solo-chat|MAX_CONOCIMIENTO_VOZ/);
  });
});

describe('GET /api/crm/voice-agents/conocimiento', () => {
  test('organización de la sesión, cliente del usuario (RLS) y el criterio del runtime', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/crm/voice-agents/conocimiento/route.ts'), 'utf8');
    expect(src).toMatch(/export const GET = withOrg\(/);
    expect(src).toMatch(/leerFragmentosVoz\(ctx\.supabase, ctx\.organizationId\)/);
    expect(src).toMatch(/conocimientoParaEditor\(filas\)/);
    expect(src).not.toMatch(/getServiceClient|searchParams|organization_id/);
  });
});

describe('conocimientoParaEditor', () => {
  test('primera línea no vacía, recortada con «…»', () => {
    expect(primeraLinea('\n  \nHola mundo\nsegunda')).toBe('Hola mundo');
    const largo = primeraLinea('a'.repeat(500));
    expect(largo.length).toBe(LARGO_RESUMEN_FRAGMENTO);
    expect(largo.endsWith('…')).toBe(true);
  });

  test('devuelve incluidos, solo-chat, fuera del tope y el tope', () => {
    const r = conocimientoParaEditor([
      fila({ id: 'a', title: 'Horario', content: 'Abrimos 8 a 6\nDetalle', priority: 5 }),
      fila({ id: 'b', title: 'Chat', content: 'x', tags: ['solo-chat'] }),
    ]);
    expect(r.fragmentos).toEqual([{ id: 'a', titulo: 'Horario', resumen: 'Abrimos 8 a 6', prioridad: 5, caracteres: 'Abrimos 8 a 6\nDetalle'.length }]);
    expect(r.solo_chat).toEqual([{ id: 'b', titulo: 'Chat' }]);
    expect(r.fuera_del_tope).toEqual([]);
    expect(r.tope).toBe(MAX_CONOCIMIENTO_VOZ);
  });
});

describe('«Qué sabe el agente»: estados', () => {
  const base: ConocimientoVozApi = {
    fragmentos: [{ id: 'a', titulo: 'A', resumen: '', prioridad: 1, caracteres: 3000 }],
    solo_chat: [],
    fuera_del_tope: [],
    caracteres: 3000,
    tope: 6000,
    silencio: { aviso_s: 10, cierre_s: 20, frase: '¿Sigue ahí?' },
  };
  test('error · cargando · vacío · tope · listo', () => {
    expect(estadoQueSabe(null, true)).toBe('error');
    expect(estadoQueSabe(null, false)).toBe('cargando');
    expect(estadoQueSabe({ ...base, fragmentos: [] }, false)).toBe('vacio');
    expect(estadoQueSabe({ ...base, fuera_del_tope: [{ id: 'b', titulo: 'B', prioridad: 1 }] }, false)).toBe('tope');
    expect(estadoQueSabe(base, false)).toBe('listo');
  });
  test('porcentaje del tope acotado 0–100', () => {
    expect(porcentajeTope(base)).toBe(50);
    expect(porcentajeTope({ caracteres: 9000, tope: 6000 })).toBe(100);
    expect(porcentajeTope({ caracteres: 10, tope: 0 })).toBe(0);
  });
  test('lista de excluidos con prioridad y conjunción', () => {
    const con = (t: string, p: number) => `${t} (${p})`;
    const sin = (t: string) => t;
    expect(listaExcluidos([], con, sin, 'y')).toBe('');
    expect(listaExcluidos([{ id: null, titulo: 'A', prioridad: 2 }], con, sin, 'y')).toBe('A (2)');
    expect(
      listaExcluidos(
        [
          { id: null, titulo: 'A', prioridad: 2 },
          { id: null, titulo: 'B', prioridad: null },
          { id: null, titulo: 'C', prioridad: 1 },
        ],
        con,
        sin,
        'y',
      ),
    ).toBe('A (2), B y C (1)');
  });
});

describe('chips «por qué no marca»', () => {
  const campana = (p: Partial<DiagnosticoCampana>): DiagnosticoCampana => ({ id: 'c1', nombre: 'Reactivar', estado: 'running', motivos: [], ...p });

  test('solo campañas en marcha', () => {
    expect(chipsDeCampana(undefined, [])).toEqual([]);
    expect(chipsDeCampana(campana({ estado: 'paused', motivos: [{ codigo: 'tope_diario', bloquea: true }] }), [])).toEqual([]);
  });

  test('orden de fuentes: organización → compuerta real → diagnóstico TS, sin repetir familia', () => {
    const chips = chipsDeCampana(
      campana({
        compuerta: [
          { motivo: 'sin_consentimiento', cantidad: 4, proximo: null },
          { motivo: 'ley2300_reprogramada', cantidad: 2, proximo: '2026-10-07T13:00:00Z' },
          { motivo: 'no_reclamable', cantidad: 9, proximo: null },
        ],
        motivos: [
          { codigo: 'objetivos_sin_consentimiento', bloquea: true, datos: { n: 99 } },
          { codigo: 'objetivos_sin_telefono', bloquea: false, datos: { sinTelefono: 3 } },
        ],
      }),
      [{ codigo: 'sin_minutos', bloquea: true }, { codigo: 'twilio_no_verificable', bloquea: false }],
    );
    expect(chips.map((c) => c.clave)).toEqual(['sin_minutos', 'sin_consentimiento', 'ley2300']);
    // El conteo de la compuerta gana al del diagnóstico TS.
    expect(chips.find((c) => c.clave === 'sin_consentimiento')?.datos.n).toBe(4);
    expect(chips.find((c) => c.clave === 'ley2300')?.datos).toMatchObject({ n: 2, proxima: '2026-10-07T13:00:00Z' });
    expect(campanaBloqueada(chips)).toBe(true);
  });

  test('sin la RPC (compuerta null): las reprogramadas por la Ley 2300 son aviso, no bloqueo', () => {
    const chips = chipsDeCampana(
      campana({ compuerta: null, motivos: [{ codigo: 'ley2300_reprogramadas', bloquea: false, datos: { n: 3, proxima: '2026-10-07T13:00:00Z' } }] }),
      [],
    );
    expect(chips).toEqual([expect.objectContaining({ clave: 'ley2300', tono: 'informacion', motivo: 'ley2300_reprogramadas' })]);
    expect(campanaBloqueada(chips)).toBe(false);
  });

  test('cada familia tiene texto en los 4 idiomas', () => {
    const familias = ['fuera_de_horario', 'fuera_de_horario_legal', 'ley2300', 'sin_minutos', 'tope_diario', 'tope_hora', 'tope_cliente_dia', 'concurrencia', 'sin_consentimiento', 'sin_telefono', 'sin_objetivos', 'sin_politica_datos', 'agente_voz_apagado', 'canal_inactivo', 'sin_comm_settings', 'sin_numero_propio', 'agente_inactivo', 'agente_no_encontrado', 'campana_no_activa', 'reserva_pendiente', 'programada'];
    for (const l of ['es', 'en', 'fr', 'pt']) {
      const m = JSON.parse(readFileSync(join(process.cwd(), `messages/${l}.json`), 'utf8'));
      for (const f of familias) expect([l, f, typeof m.vozCampanasDisparo.chips[f]]).toEqual([l, f, 'string']);
    }
  });
});

describe('pasadas del planificador', () => {
  test('el intervalo sale del cron declarado de voice_campaigns', () => {
    expect(intervaloMinutosDe('voice_campaigns')).toBe(5);
    // Una tarea diaria no es de intervalo.
    expect(intervaloMinutosDe('recording_cleanup')).toBeNull();
  });
  test('próxima pasada = siguiente múltiplo del intervalo', () => {
    expect(proximaPasada(5, new Date('2026-10-06T15:02:30Z')).toISOString()).toBe('2026-10-06T15:05:00.000Z');
    expect(proximaPasada(5, new Date('2026-10-06T15:05:00Z')).toISOString()).toBe('2026-10-06T15:10:00.000Z');
  });
});
