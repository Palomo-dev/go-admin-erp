/// <reference types="jest" />
/**
 * Lógica de las pestañas de la oportunidad (Figma CRM 820:66213, 822:235333,
 * 822:235945, 822:236526). Las fechas se calculan en la zona de la
 * organización: debe pasar igual con TZ=UTC y TZ=America/Bogota.
 */
import type { TimelineEntry } from '@/lib/services/crm/timelineService';
import { agruparPorDia, cuandoNota, duracionLlamada, entradaDeTimeline, haceCuanto, kindsDeChip, lineaTarea, lineaTareaDetalle, ordenarNotas, separarTareas, tamanoArchivo, textoPlano, type Traductor } from '../pestanasLogica';

const ZONA = 'America/Bogota';
// 2026-11-15 09:00 en Bogotá (14:00 UTC).
const AHORA = new Date('2026-11-15T14:00:00Z');
/** Traductor de prueba: clave + valores, para afirmar qué se pidió. */
const t: Traductor = (k, v) => (v ? `${k}(${Object.entries(v).map(([a, b]) => `${a}=${b}`).join(',')})` : k);

const base = { id: 'x', occurred_at: '2026-11-15T13:40:00Z', user: { id: 'u', name: 'Carlos Ruiz', avatar_url: null } };

describe('Actividad', () => {
  it('chips → kinds del servidor («Todo» no filtra; «Etapas» son las de sistema)', () => {
    expect(kindsDeChip('todo')).toBeUndefined();
    expect(kindsDeChip('llamadas')).toEqual(['call', 'call_live', 'ai_call']);
    expect(kindsDeChip('etapas')).toEqual(['system']);
  });

  it('duración «4 min 12 s» y «45 s»; sin duración, nada', () => {
    expect(duracionLlamada(252, t)).toBe('duracion(m=4,s=12)');
    expect(duracionLlamada(45, t)).toBe('duracionSeg(s=45)');
    expect(duracionLlamada(0, t)).toBeNull();
  });

  it('llamada saliente contestada con resumen IA', () => {
    const e = { ...base, kind: 'call', call: { id: 'c', direction: 'outbound', status: 'completed', mode: null, duration_seconds: 252, from_number: null, to_number: null, recording_enabled: false, cost_amount: null, consent_method: null, recording: null, transcript: null, analysis: { id: 'a', summary: 'pide 5 % de descuento', sentiment: null, quality_score: null, suggested_stage_id: null, next_steps: null } }, activity: null } as TimelineEntry;
    const r = entradaDeTimeline(e, t);
    expect(r).toMatchObject({ tipo: 'llamada', autor: 'Carlos Ruiz', estado: { etiqueta: 'estados.contestada', tono: 'exito' } });
    expect(r.titulo).toBe('titulos.conDuracion(titulo=titulos.llamadaSaliente,duracion=duracion(m=4,s=12))');
    expect(r.detalle).toBe('titulos.resumenIa(resumen=pide 5 % de descuento)');
  });

  it('correo abierto: «Abierto 2 veces · 1 clic» y estado Abierto', () => {
    const e = { ...base, kind: 'email', email: { id: 'm', subject: 'Propuesta septiembre', to_email: 'a@b.test', from_email: null, status: 'delivered', sent_at: null, open_count: 2, click_count: 1, body_html_snapshot: null }, events: [], activity: null } as TimelineEntry;
    const r = entradaDeTimeline(e, t);
    expect(r.titulo).toBe('titulos.correoEnviado(asunto=Propuesta septiembre)');
    expect(r.detalle).toBe('titulos.correoAperturas(n=2) · titulos.correoClics(n=1)');
    expect(r.estado?.etiqueta).toBe('estados.abierto');
  });

  it('cambio de etapa y nota fijada', () => {
    const etapa = { ...base, user: null, kind: 'system', activity: null, from_stage: { id: '1', name: 'Calificación', color: null }, to_stage: { id: '2', name: 'Propuesta', color: null } } as TimelineEntry;
    expect(entradaDeTimeline(etapa, t)).toMatchObject({ tipo: 'sistema', titulo: 'titulos.cambioEtapa(desde=Calificación,hacia=Propuesta)', autor: 'autorSistema' });
    const nota = { ...base, kind: 'note', note: { id: 'n', body: '<p>Prefiere factura&nbsp;electrónica</p>', is_pinned: true }, activity: null } as TimelineEntry;
    expect(entradaDeTimeline(nota, t)).toMatchObject({ tipo: 'nota', titulo: 'titulos.notaFijada', detalle: 'Prefiere factura electrónica', estado: { tono: 'advertencia' } });
  });

  it('agrupa por día de la zona: «Hoy», «Ayer» y fecha', () => {
    const xs = ['2026-11-15T13:40:00Z', '2026-11-15T05:30:00Z', '2026-11-14T04:59:00Z', '2026-11-10T20:00:00Z'];
    const g = agruparPorDia(xs, (x) => x, ZONA, AHORA, 'es');
    // 05:30Z del 15 son las 00:30 del 15 en Bogotá (hoy); 04:59Z del 14 son las 23:59 del 13.
    expect(g.map((x) => [x.clave, x.entradas.length])).toEqual([['hoy', 2], ['fecha', 1], ['fecha', 1]]);
    expect(g[1].dia).toBe('2026-11-13');
  });
});

describe('Tareas', () => {
  const tarea = (p: Partial<{ id: string; status: string; priority: string | null; due_date: string | null; completed_at: string | null; completada_por: string | null }>) => ({ id: 'a', title: 'T', status: 'open', priority: 'high', due_date: null, completed_at: null, completada_por: null, ...p });

  it('separa pendientes (por vencimiento) y hechas (la última primero); oculta canceladas', () => {
    const r = separarTareas([
      tarea({ id: '1', due_date: '2026-11-20T15:00:00Z' }),
      tarea({ id: '2', due_date: '2026-11-16T15:00:00Z' }),
      tarea({ id: '3', status: 'done', completed_at: '2026-09-18T15:00:00Z' }),
      tarea({ id: '4', status: 'done', completed_at: '2026-10-01T15:00:00Z' }),
      tarea({ id: '5', status: 'canceled' }),
      tarea({ id: '6' }),
    ]);
    expect(r.pendientes.map((x) => x.id)).toEqual(['2', '1', '6']);
    expect(r.hechas.map((x) => x.id)).toEqual(['4', '3']);
  });

  it('«Vence mañana 10:00 · Alta» en la zona de la organización', () => {
    const r = lineaTarea(tarea({ due_date: '2026-11-16T15:00:00Z' }), AHORA, ZONA, 'es', t);
    expect(r).toEqual({ texto: 'vence.manana(hora=10:00) · prioridad.high', vencida: false });
  });

  it('«Vencida hace 2 d · Media» en rojo', () => {
    const r = lineaTarea(tarea({ priority: 'med', due_date: '2026-11-13T15:00:00Z' }), AHORA, ZONA, 'es', t);
    expect(r).toEqual({ texto: 'vence.vencidaDias(n=2) · prioridad.med', vencida: true });
  });

  it('«Hecha el 18 sep. · Carlos Ruiz»', () => {
    const r = lineaTarea(tarea({ status: 'done', completed_at: '2026-09-18T15:00:00Z', completada_por: 'Carlos Ruiz' }), AHORA, ZONA, 'es', t);
    expect(r.texto).toMatch(/^hecha\(fecha=18 (de )?sept?\.?\) · Carlos Ruiz$/);
    expect(r.vencida).toBe(false);
  });
});

describe('Tareas en el detalle (Figma 775:473990)', () => {
  const x = { id: 'a', title: 'T', status: 'open', priority: 'high', due_date: null as string | null, completed_at: null as string | null, completada_por: null as string | null, responsable: 'Carlos Ruiz' };
  it('«mañana 10:00 · Carlos Ruiz» pendiente; «Vencida · ayer 16:00 · …» vencida; completada con fecha y quién', () => {
    expect(lineaTareaDetalle({ ...x, due_date: '2026-11-16T15:00:00Z' }, AHORA, ZONA, 'es', t)).toEqual({ texto: 'manana(hora=10:00) · Carlos Ruiz', estado: 'pendiente' });
    expect(lineaTareaDetalle({ ...x, due_date: '2026-11-14T21:00:00Z' }, AHORA, ZONA, 'es', t)).toEqual({ texto: 'vencida · ayer(hora=16:00) · Carlos Ruiz', estado: 'vencida' });
    const hecha = lineaTareaDetalle({ ...x, status: 'done', completed_at: '2026-09-18T15:00:00Z', completada_por: 'Laura Pérez' }, AHORA, ZONA, 'es', t);
    expect(hecha.estado).toBe('completada');
    expect(hecha.texto).toMatch(/Laura Pérez$/);
  });
});

describe('Notas, documentos e IA', () => {
  it('fijadas primero y luego la más reciente', () => {
    const r = ordenarNotas([
      { id: 'a', fijada: false, ocurrio_en: '2026-11-15T10:00:00Z' },
      { id: 'b', fijada: true, ocurrio_en: '2026-09-01T10:00:00Z' },
      { id: 'c', fijada: false, ocurrio_en: '2026-11-14T10:00:00Z' },
    ]);
    expect(r.map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });

  it('cuándo de una nota: «Hoy 08:40»', () => {
    expect(cuandoNota('2026-11-15T13:40:00Z', AHORA, ZONA, 'es', t)).toBe('hoy(hora=08:40)');
    expect(cuandoNota(null, AHORA, ZONA, 'es', t)).toBe('');
  });

  it('texto plano sin etiquetas', () => {
    expect(textoPlano('<p>Hola&nbsp;<b>equipo</b></p>')).toBe('Hola equipo');
  });

  it('tamaño «1,2 MB» y «860 KB» con el separador del idioma', () => {
    expect(tamanoArchivo(1.2 * 1024 * 1024, 'es')).toBe('1,2 MB');
    expect(tamanoArchivo(860 * 1024, 'es')).toBe('860 KB');
    expect(tamanoArchivo(1.2 * 1024 * 1024, 'en')).toBe('1.2 MB');
    expect(tamanoArchivo(null, 'es')).toBe('');
  });

  it('«Generada hace 2 min»', () => {
    expect(haceCuanto(0, 30_000, t)).toBe('ahora');
    expect(haceCuanto(0, 125_000, t)).toBe('haceMin(n=2)');
    expect(haceCuanto(0, 3 * 3_600_000, t)).toBe('haceHoras(n=3)');
  });
});
