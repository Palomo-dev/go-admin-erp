/**
 * Pendientes de la Bandeja (Figma 93-chat-pendientes-00, tarjeta 1): riel
 * angosto, «Bloquear contacto» y 👍/👎 de la IA. Reglas puras, sin montar nada.
 */
import es from '../../../../messages/es.json';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import pt from '../../../../messages/pt.json';
import { usaRielAngosto } from '../chatNavLogica';
import { hayRielSolicitado, solicitarRiel, suscribirRiel } from '@/components/shell/sidebar/rielSolicitado';
import { elementosHilo } from '../conversations/hiloLogica';
import { bloqueoVigente, entroBloqueado, eventosDeBloqueos, type BloqueoContacto } from '@/lib/services/chat/bloqueoContacto';
import { leerValoracion, resumenValoraciones, tipoFeedback, votoDeFeedback } from '@/lib/services/chat/valoracionIa';

describe('riel angosto en la Bandeja', () => {
  it('lo piden la Bandeja y todas las pantallas de la conversación', () => {
    expect(usaRielAngosto('/app/chat/bandeja')).toBe(true);
    expect(usaRielAngosto('/app/chat/conversaciones/abc')).toBe(true);
    expect(usaRielAngosto('/app/chat/conversaciones/abc/actividad')).toBe(true);
    expect(usaRielAngosto('/app/chat/conversaciones/nueva')).toBe(true);
  });

  it('el resto del Chat y las rutas parecidas no', () => {
    expect(usaRielAngosto('/app/chat/canales')).toBe(false);
    expect(usaRielAngosto('/app/chat/ia/trabajos')).toBe(false);
    expect(usaRielAngosto('/app/chat/bandejas')).toBe(false);
    expect(usaRielAngosto('/app/chat/conversations/abc')).toBe(false);
  });

  it('cuenta solicitudes, avisa a los oyentes y liberar dos veces no descuenta de más', () => {
    const avisos: boolean[] = [];
    const quitar = suscribirRiel(() => avisos.push(hayRielSolicitado()));
    expect(hayRielSolicitado()).toBe(false);
    const a = solicitarRiel();
    const b = solicitarRiel();
    expect(hayRielSolicitado()).toBe(true);
    a();
    a();
    expect(hayRielSolicitado()).toBe(true);
    b();
    expect(hayRielSolicitado()).toBe(false);
    quitar();
    solicitarRiel()();
    expect(avisos).toEqual([true, true, true, false]);
  });
});

const fila = (p: Partial<BloqueoContacto>): BloqueoContacto => ({
  id: 'b1',
  customer_id: 'c1',
  conversation_id: 'v1',
  bloqueado_por_member_id: 7,
  bloqueado_en: '2026-11-13T15:45:00Z',
  desbloqueado_por_member_id: null,
  desbloqueado_en: null,
  ...p,
});

describe('bloquear contacto', () => {
  it('el vigente es el que no tiene desbloqueo', () => {
    expect(bloqueoVigente([])).toBeNull();
    expect(bloqueoVigente([fila({ desbloqueado_en: '2026-11-13T16:00:00Z' })])).toBeNull();
    const vigente = fila({ id: 'b2', bloqueado_en: '2026-11-13T17:00:00Z' });
    expect(bloqueoVigente([fila({ desbloqueado_en: '2026-11-13T16:00:00Z' }), vigente])).toBe(vigente);
  });

  it('cada bloqueo da su evento y su desbloqueo otro, en orden de tiempo', () => {
    const ev = eventosDeBloqueos([
      fila({ id: 'b2', bloqueado_en: '2026-11-13T17:00:00Z', bloqueado_por_member_id: 9 }),
      fila({ desbloqueado_en: '2026-11-13T16:00:00Z', desbloqueado_por_member_id: 8 }),
    ]);
    expect(ev.map((e) => [e.tipo, e.memberId])).toEqual([
      ['bloqueo', 7],
      ['desbloqueo', 8],
      ['bloqueo', 9],
    ]);
    expect(new Set(ev.map((e) => e.id)).size).toBe(3);
  });

  it('reconoce el mensaje que marcó el trigger de la base', () => {
    expect(entroBloqueado({ contacto_bloqueado: true })).toBe(true);
    expect(entroBloqueado({ contacto_bloqueado: 'true' })).toBe(false);
    expect(entroBloqueado(null)).toBe(false);
    expect(entroBloqueado({})).toBe(false);
  });

  it('el evento queda intercalado en el hilo y respeta la historia aún sin cargar', () => {
    const mensajes = [
      { id: 'm1', created_at: '2026-11-13T15:40:00Z' },
      { id: 'm2', created_at: '2026-11-13T15:50:00Z' },
    ];
    const eventos = [
      { id: 'viejo', created_at: '2026-11-12T10:00:00Z' },
      { id: 'nuevo', created_at: '2026-11-13T15:45:00Z' },
    ];
    const conHistoria = elementosHilo(mensajes, [], 'America/Bogota', true, eventos);
    expect(conHistoria.map((e) => e.clave)).toEqual(['d-2026-11-13', 'm-m1', 'e-nuevo', 'm-m2']);
    const completa = elementosHilo(mensajes, [], 'America/Bogota', false, eventos);
    expect(completa.map((e) => e.clave)).toEqual(['d-2026-11-12', 'e-viejo', 'd-2026-11-13', 'm-m1', 'e-nuevo', 'm-m2']);
  });
});

describe('👍/👎 de la IA', () => {
  it('👍 no lleva motivo ni comentario', () => {
    expect(leerValoracion({ voto: 'util', motivo: 'tono', comentario: 'x' })).toEqual({ voto: 'util', motivo: null, comentario: null });
  });

  it('👎 exige un motivo válido y limpia el comentario', () => {
    expect(leerValoracion({ voto: 'no_util' })).toBeNull();
    expect(leerValoracion({ voto: 'no_util', motivo: 'feo' })).toBeNull();
    expect(leerValoracion({ voto: 'no_util', motivo: 'tono', comentario: 3 })).toBeNull();
    expect(leerValoracion({ voto: 'no_util', motivo: 'muy_larga', comentario: '   ' })).toEqual({ voto: 'no_util', motivo: 'muy_larga', comentario: null });
    expect(leerValoracion({ voto: 'no_util', motivo: 'otro', comentario: ' esperaba el precio ' })).toEqual({ voto: 'no_util', motivo: 'otro', comentario: 'esperaba el precio' });
    expect(leerValoracion({ voto: 'no_util', motivo: 'otro', comentario: 'a'.repeat(2000) })?.comentario).toHaveLength(1000);
  });

  it('rechaza cuerpos que no son voto', () => {
    expect(leerValoracion(null)).toBeNull();
    expect(leerValoracion('util')).toBeNull();
    expect(leerValoracion({ voto: 'si' })).toBeNull();
  });

  it('usa los valores del CHECK de ai_training_feedback y resume para Trabajos', () => {
    expect(tipoFeedback('util')).toBe('correct');
    expect(tipoFeedback('no_util')).toBe('incorrect');
    expect(votoDeFeedback('correct')).toBe('util');
    expect(votoDeFeedback('off_topic')).toBe('no_util');
    expect(votoDeFeedback('raro')).toBeNull();
    expect(resumenValoraciones([{ feedback_type: 'correct' }, { feedback_type: 'incorrect' }, { feedback_type: 'correct' }])).toEqual({ util: 2, noUtil: 1 });
    expect(resumenValoraciones(null)).toEqual({ util: 0, noUtil: 0 });
  });
});

type Arbol = { [k: string]: string | Arbol };
const hojas = (o: Arbol, pre = ''): [string, string][] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[pre + k, v] as [string, string]] : hojas(v, `${pre}${k}.`)));

describe('chatBandejaPendientes en 4 idiomas', () => {
  const base = hojas((es as unknown as { chatBandejaPendientes: Arbol }).chatBandejaPendientes);
  it.each([
    ['en', en],
    ['fr', fr],
    ['pt', pt],
  ])('%s tiene las mismas claves que es y ninguna vacía', (_l, m) => {
    const otras = hojas((m as unknown as { chatBandejaPendientes: Arbol }).chatBandejaPendientes);
    expect(otras.map(([k]) => k).sort()).toEqual(base.map(([k]) => k).sort());
    expect(otras.filter(([, v]) => !v.trim())).toEqual([]);
  });
});
