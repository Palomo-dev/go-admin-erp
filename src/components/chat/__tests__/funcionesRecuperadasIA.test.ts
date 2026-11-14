/**
 * Diseños aprobados 94-chat-recuperado-ia (2026-11-14): reglas puras de
 * Importar, Visitantes (también los bloqueados) y Auditoría, y el body de la prueba del Laboratorio con
 * tono e idioma (decisión del dueño).
 */
jest.mock('@/lib/supabase/config', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));

import { columnasCsv, revisarFilasImportacion } from '@/components/chat/conocimiento/conocimientoLogica';
import { estadoVisitante, filtrarVisitantes, origenCorto, partesSubtitulo, rutaDePagina } from '@/components/chat/widget/visitantesLogica';
import { bloqueosVigentes, estaBloqueado } from '@/lib/services/chat/bloqueoContacto';
import { jsonEnLinea } from '@/components/chat/audit/auditoriaLogica';
import { nombreCorto } from '@/lib/services/widgetSessionsService';
import KnowledgeService from '@/lib/services/knowledgeService';
import AILabService, { type LabSettings } from '@/lib/services/aiLabService';

describe('Importar', () => {
  test('columnas del encabezado del CSV, sin comillas', () => {
    expect(columnasCsv('titulo,contenido,"etiquetas"\nA,B,c')).toEqual(['titulo', 'contenido', 'etiquetas']);
    expect(columnasCsv('\n\n')).toEqual([]);
  });

  test('una fila sin título llega a la vista previa marcada, con su número del archivo', () => {
    const filas = new KnowledgeService(1).parseCSV('titulo,contenido,etiquetas\nHorario,Lunes a sábado,horarios\n,Aceptamos Nequi,pagos\nGarantía,6 meses,garantia;calzado');
    expect(filas).toHaveLength(3);
    const revisadas = revisarFilasImportacion(filas);
    expect(revisadas.map((r) => r.estado)).toEqual(['lista', 'faltaTitulo', 'lista']);
    expect(revisadas[1].fila).toBe(2);
    expect(revisadas[2].fragmento.tags).toEqual(['garantia', 'calzado']);
  });
});

describe('Visitantes', () => {
  const base = { is_active: false, customer_id: null, customer: undefined, channel: undefined, channel_id: 'c1', location_data: null } as const;

  test('ruta de la página y origen corto', () => {
    expect(rutaDePagina('https://www.mitienda.co/calzado/urban-run?utm=1')).toBe('/calzado/urban-run');
    expect(rutaDePagina('https://www.mitienda.co')).toBe('/');
    expect(origenCorto('https://www.google.com/')).toBe('Google');
    expect(origenCorto('https://l.instagram.com/?u=x')).toBe('Instagram');
    expect(origenCorto('no es url')).toBeNull();
  });

  test('subtítulo: cliente y ciudad, o ciudad y origen del anónimo', () => {
    expect(partesSubtitulo({ ...base, customer_id: 'x', customer: { id: 'x', full_name: 'N', email: null, city: 'Medellín' }, referrer: 'https://google.com' })).toEqual({ esCliente: true, ciudad: 'Medellín', origen: null });
    expect(partesSubtitulo({ ...base, location_data: { city: 'Pereira' }, referrer: 'https://www.google.com/' })).toEqual({ esCliente: false, ciudad: 'Pereira', origen: 'Google' });
  });

  test('busca por página, ciudad o nombre (sin tildes)', () => {
    const filas = [
      { ...base, current_page: 'https://t.co/envios', customer: undefined },
      { ...base, customer_id: 'x', customer: { id: 'x', full_name: 'Natalia Restrepo', email: null, city: 'Medellín' }, current_page: '/calzado' },
    ];
    expect(filtrarVisitantes(filas, { busqueda: 'envios', estado: 'todos', cliente: 'todos' })).toHaveLength(1);
    expect(filtrarVisitantes(filas, { busqueda: 'medellin', estado: 'todos', cliente: 'todos' })).toHaveLength(1);
    expect(filtrarVisitantes(filas, { busqueda: '', estado: 'todos', cliente: 'anonimos' })).toHaveLength(1);
  });

  test('nombre corto de quien atiende', () => {
    expect(nombreCorto('Laura', 'Restrepo')).toBe('Laura R.');
    expect(nombreCorto('Laura', null)).toBe('Laura');
    expect(nombreCorto(null, null)).toBeNull();
  });
});

describe('Auditoría', () => {
  test('JSON en una línea', () => {
    expect(jsonEnLinea({ channel_id: 'e9', ai_mode: 'hybrid' })).toBe('{ "channel_id": "e9", "ai_mode": "hybrid" }');
    expect(jsonEnLinea({ texto: 'a\nb' })).toBe('{ "texto": "a\\nb" }');
  });
});

describe('Laboratorio: tono e idioma viajan a la ruta de prueba', () => {
  const ajustes: LabSettings = { model: '', temperature: 0.3, maxTokens: 500, maxFragments: 5, systemRules: 'r', tone: 'friendly', language: 'en', simulatedChannel: 'whatsapp' };
  const respuestaOk = {
    ok: true,
    json: async () => ({ success: true, data: { respuesta: 'hola', modelo: 'm', tiempoMs: 1, tokens: { entrada: 1, salida: 1, total: 2 }, fragmentos: 0, creditosCobrados: 1, saldoRestante: 9, costoUsd: null } }),
  };

  test('los envía cuando son válidos', async () => {
    const fetchMock = jest.fn(async () => respuestaOk);
    global.fetch = fetchMock as unknown as typeof fetch;
    await new AILabService(1).runTest('q', ajustes, []);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body).toMatchObject({ tono: 'friendly', idioma: 'en', temperatura: 0.3 });
  });

  test('no los envía si no son de la lista (el servidor usa los de la configuración)', async () => {
    const fetchMock = jest.fn(async () => respuestaOk);
    global.fetch = fetchMock as unknown as typeof fetch;
    await new AILabService(1).runTest('q', { ...ajustes, tone: 'gracioso', language: 'de' }, []);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body).not.toHaveProperty('tono');
    expect(body).not.toHaveProperty('idioma');
  });
});

describe('Visitantes bloqueados (chat_contactos_bloqueados)', () => {
  const filas = [
    { customer_id: 'c1', conversation_id: 'v1', desbloqueado_en: null },
    { customer_id: 'c2', conversation_id: 'v2', desbloqueado_en: '2026-11-14T10:00:00Z' },
    { customer_id: 'c3', conversation_id: null, desbloqueado_en: null },
  ];

  test('vigente = sin desbloqueado_en; bloqueado por cliente o por conversación', () => {
    const b = bloqueosVigentes(filas);
    expect(estaBloqueado(b, 'c1', null)).toBe(true);
    expect(estaBloqueado(b, null, 'v1')).toBe(true);
    expect(estaBloqueado(b, 'c2', 'v2')).toBe(false);
    expect(estaBloqueado(b, 'c3', 'otra')).toBe(true);
    expect(estaBloqueado(b, null, null)).toBe(false);
  });

  test('«Bloqueado» manda sobre «En línea» y se puede filtrar', () => {
    expect(estadoVisitante({ is_active: true, blocked: true })).toBe('bloqueado');
    expect(estadoVisitante({ is_active: true, blocked: false })).toBe('enLinea');
    const sesiones = [
      { is_active: true, blocked: true, customer_id: 'c1', customer: undefined, channel: undefined },
      { is_active: true, blocked: false, customer_id: null, customer: undefined, channel: undefined },
    ];
    expect(filtrarVisitantes(sesiones, { busqueda: '', estado: 'bloqueado', cliente: 'todos' })).toHaveLength(1);
    expect(filtrarVisitantes(sesiones, { busqueda: '', estado: 'enLinea', cliente: 'todos' })).toHaveLength(1);
  });
});
