/**
 * Conversación › Actividad, Archivos y buscador del hilo (Figma 91-chat-11 y
 * 91-chat-12): reglas puras y textos en los cuatro idiomas.
 */
import es from '../../../../../../messages/es.json';
import en from '../../../../../../messages/en.json';
import fr from '../../../../../../messages/fr.json';
import pt from '../../../../../../messages/pt.json';
import type { ActivityItem } from '@/lib/services/conversationActivityService';
import type { ConversationFile } from '@/lib/services/conversationFilesService';
import { categoriaArchivo } from '@/lib/services/chat/categoriaArchivo';
import { coincideBusqueda, escaparLike, indiceCiclico, momentoCorto, normalizarTexto, tramosResaltados } from '../comunLogica';
import { coincideFiltroActividad, describirActividad, type ContextoActividad } from '../activity/actividadLogica';
import { filtrarArchivos, remitenteArchivo, resumenArchivos, tamanoLegible } from '../files/archivosLogica';

/** `t` falso: devuelve la clave y los valores, para comprobar qué se pidió. */
const ctx: ContextoActividad = {
  t: (clave, valores) => (valores ? `${clave}${JSON.stringify(valores)}` : clave),
  nombreMiembro: (id) => (id === 7 ? 'Laura Restrepo' : id === 9 ? 'Diana Castaño' : null),
  nombreUsuario: (id) => (id === 'u-9' ? 'Diana Castaño' : null),
  estado: (c) => ({ open: 'Abierta', pending: 'Pendiente', closed: 'Cerrada' })[c] ?? c,
  tipoTrabajo: (c) => (c === 'respond' ? 'Respuesta sugerida' : c),
  estadoTrabajo: (c) => (c === 'failed' ? 'Fallido' : c),
  accion: (c) => (c === 'assign_conversation' ? 'Asignó una conversación' : c),
  decimal: (n) => String(n).replace('.', ','),
  entero: (n) => String(n),
};

const item = (p: Partial<ActivityItem> & Pick<ActivityItem, 'type' | 'data'>): ActivityItem => ({
  id: 'a1',
  timestamp: '2026-11-13T15:41:00Z',
  description: 'texto viejo del servicio',
  ...p,
});

describe('Actividad: qué dice cada fila', () => {
  test('cambio de estado con quién lo hizo y el estado anterior', () => {
    const f = describirActividad(
      item({ type: 'status_change', actor: { type: 'member', id: 7 }, data: { from_status: 'pending', to_status: 'open', reason: null } }),
      ctx,
    );
    expect(f.titulo).toBe('estado.conActor{"actor":"Laura Restrepo","estado":"Abierta"}');
    expect(f.detalle).toBe('estado.antes{"estado":"Pendiente"}');
    expect(f.icono).toBe('estado');
    expect(f.tono).toBe('exito');
  });

  test('cambio de estado del sistema: no inventa un nombre', () => {
    const f = describirActividad(item({ type: 'status_change', actor: { type: 'system' }, data: { to_status: 'closed' } }), ctx);
    expect(f.titulo).toBe('estado.sinActor{"estado":"Cerrada"}');
    expect(f.detalle).toBeNull();
    expect(f.actor).toBe('actorSistema');
  });

  test('asignación con persona conocida y motivo; quitar asignación', () => {
    const f = describirActividad(
      item({ type: 'assignment', actor: { type: 'member', id: 9 }, data: { assigned_member_id: 7, reason: 'Turno de la tarde' } }),
      ctx,
    );
    expect(f.titulo).toBe('asignacion.conActor{"actor":"Diana Castaño","persona":"Laura Restrepo"}');
    expect(f.detalle).toBe('motivo{"motivo":"Turno de la tarde"}');
    const q = describirActividad(item({ type: 'assignment', actor: { type: 'system' }, data: { assigned_member_id: null } }), ctx);
    expect(q.titulo).toBe('asignacion.quitadaSinActor');
  });

  test('miembro desconocido: «alguien del equipo», nunca «#id»', () => {
    const f = describirActividad(item({ type: 'tag_added', actor: { type: 'member', id: 55 }, data: { tag: { name: 'Calzado' } } }), ctx);
    expect(f.titulo).toBe('etiqueta.agregadaConActor{"actor":"alguien","etiqueta":"Calzado"}');
    expect(f.titulo).not.toContain('55');
  });

  test('IA: respuesta automática con confianza, fragmentos y tokens', () => {
    const f = describirActividad(
      item({
        type: 'ai_job',
        actor: { type: 'ai' },
        data: { job_type: 'auto_response', status: 'completed', confidence_score: 0.86, fragments_used: ['f1', 'f2', 'f3'], prompt_tokens: 300, completion_tokens: 112 },
      }),
      ctx,
    );
    expect(f.titulo).toBe('ia.auto');
    expect(f.detalle).toBe('ia.confianza{"valor":"0,86"} · ia.fragmentos{"n":3} · ia.tokens{"n":"412"}');
    expect(f.tono).toBe('marca');
  });

  test('IA fallida: tono de peligro y el error', () => {
    const f = describirActividad(
      item({ type: 'ai_job', actor: { type: 'ai' }, data: { job_type: 'respond', status: 'failed', error_message: 'sin créditos' } }),
      ctx,
    );
    expect(f.titulo).toBe('ia.trabajo{"tipo":"Respuesta sugerida","estado":"Fallido"}');
    expect(f.detalle).toBe('ia.error{"mensaje":"sin créditos"}');
    expect(f.tono).toBe('peligro');
  });

  test('auditoría: acción traducida y actor por uuid', () => {
    const f = describirActividad(item({ type: 'audit', actor: { type: 'member', id: 'u-9' }, data: { action: 'assign_conversation' } }), ctx);
    expect(f.titulo).toBe('Asignó una conversación');
    expect(f.detalle).toBe('auditoria.por{"actor":"Diana Castaño"}');
  });

  test('bloquear y desbloquear el contacto tienen icono y tono propios', () => {
    const b = describirActividad(item({ type: 'audit', actor: { type: 'member', id: 'u-9' }, data: { action: 'block_contact' } }), ctx);
    expect(b.titulo).toBe('block_contact');
    expect([b.icono, b.tono]).toEqual(['bloqueo', 'peligro']);
    const u = describirActividad(item({ type: 'audit', actor: { type: 'member', id: 'u-9' }, data: { action: 'unblock_contact' } }), ctx);
    expect([u.icono, u.tono]).toEqual(['desbloqueo', 'neutro']);
  });

  test('las acciones de bloqueo tienen texto propio en los 4 idiomas', () => {
    for (const m of [es, en, fr, pt]) {
      const acciones = (m as unknown as { chatModulo: { auditoria: { acciones: Record<string, string> } } }).chatModulo.auditoria.acciones;
      expect(acciones.block_contact).toBeTruthy();
      expect(acciones.unblock_contact).toBeTruthy();
    }
  });

  test('filtros por tipo', () => {
    expect(coincideFiltroActividad('tag_removed', 'etiquetas')).toBe(true);
    expect(coincideFiltroActividad('ai_job', 'estados')).toBe(false);
    expect(coincideFiltroActividad('audit', 'todas')).toBe(true);
  });
});

describe('Archivos', () => {
  const archivo = (p: Partial<ConversationFile>): ConversationFile =>
    ({ id: 'f', organization_id: 1, message_id: 'm', storage_bucket: 'b', storage_path: 'p', file_name: 'x', mime_type: 'image/jpeg', size_bytes: 1024, metadata: {}, created_at: '2026-11-13T15:31:00Z', ...p }) as ConversationFile;

  test('categoría: el Excel moderno es hoja de cálculo, no documento', () => {
    expect(categoriaArchivo('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('spreadsheet');
    expect(categoriaArchivo('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('document');
    expect(categoriaArchivo('audio/ogg')).toBe('audio');
    expect(categoriaArchivo(null)).toBe('other');
  });

  test('las cinco cifras del Figma', () => {
    const r = resumenArchivos([
      archivo({ mime_type: 'image/jpeg', size_bytes: 100 }),
      archivo({ mime_type: 'image/png', size_bytes: 100 }),
      archivo({ mime_type: 'application/pdf', size_bytes: 100 }),
      archivo({ mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size_bytes: 100 }),
      archivo({ mime_type: 'audio/ogg', size_bytes: 100 }),
      archivo({ mime_type: 'application/zip', size_bytes: 100 }),
    ]);
    expect(r).toEqual({ total: 6, tamano: 600, imagenes: 2, documentos: 2, audios: 1 });
  });

  test('filtros: nombre sin tildes, tipo y quién lo envió', () => {
    const lista = [
      archivo({ id: '1', file_name: 'catálogo-sandalias.pdf', mime_type: 'application/pdf', message: { id: 'm', role: 'agent', direction: 'outbound', created_at: '' } }),
      archivo({ id: '2', file_name: 'foto.jpg', message: { id: 'm', role: 'customer', direction: 'inbound', created_at: '' } }),
    ];
    expect(filtrarArchivos(lista, { busqueda: 'catalogo', tipo: 'todos', remitente: 'todos' }).map((f) => f.id)).toEqual(['1']);
    expect(filtrarArchivos(lista, { busqueda: '', tipo: 'image', remitente: 'todos' }).map((f) => f.id)).toEqual(['2']);
    expect(filtrarArchivos(lista, { busqueda: '', tipo: 'todos', remitente: 'agent' }).map((f) => f.id)).toEqual(['1']);
    expect(remitenteArchivo(archivo({ message: undefined }))).toBe('system');
  });

  test('tamaño con la coma del idioma', () => {
    expect(tamanoLegible(8.4 * 1024 * 1024, 'es-CO')).toBe('8,4 MB');
    expect(tamanoLegible(8.4 * 1024 * 1024, 'en-US')).toBe('8.4 MB');
    expect(tamanoLegible(0)).toBe('0 B');
  });
});

describe('Buscador del hilo y comunes', () => {
  test('resalta sin HTML: el texto del cliente nunca se interpreta', () => {
    expect(tramosResaltados('<img src=x onerror=alert(1)> Talla 38', 'talla')).toEqual([
      { texto: '<img src=x onerror=alert(1)> ', marcado: false },
      { texto: 'Talla', marcado: true },
      { texto: ' 38', marcado: false },
    ]);
    expect(tramosResaltados('sin coincidencia', 'zz')).toEqual([{ texto: 'sin coincidencia', marcado: false }]);
  });

  test('comodines de ILIKE escapados', () => {
    expect(escaparLike('100%_a\\b')).toBe('100\\%\\_a\\\\b');
  });

  test('↑/↓ dan la vuelta', () => {
    expect(indiceCiclico(0, 3, -1)).toBe(2);
    expect(indiceCiclico(2, 3, 1)).toBe(0);
    expect(indiceCiclico(0, 0, 1)).toBe(0);
  });

  test('búsqueda sin tildes ni mayúsculas', () => {
    expect(normalizarTexto('  Envío ')).toBe('envio');
    expect(coincideBusqueda(['Laura agregó la etiqueta «Calzado»'], 'agrego')).toBe(true);
    expect(coincideBusqueda([null, undefined], '')).toBe(true);
  });

  test('hoy/ayer en la zona de la organización (23:30 en Bogotá ya es mañana en UTC)', () => {
    expect(momentoCorto('2026-11-14T04:30:00Z', 'America/Bogota', '2026-11-13')?.tipo).toBe('hoy');
    expect(momentoCorto('2026-11-12T15:00:00Z', 'America/Bogota', '2026-11-13')?.tipo).toBe('ayer');
    expect(momentoCorto('2026-10-28T15:00:00Z', 'America/Bogota', '2026-11-13')?.tipo).toBe('fecha');
    expect(momentoCorto('no es fecha', 'America/Bogota', '2026-11-13')).toBeNull();
  });
});

type Arbol = { [k: string]: string | Arbol };
const hojas = (o: Arbol, pre = ''): [string, string][] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[pre + k, v] as [string, string]] : hojas(v, `${pre}${k}.`)));

describe.each(['chatHilo', 'chatDialogos'])('%s en 4 idiomas', (ns) => {
  const base = hojas((es as unknown as Record<string, Arbol>)[ns]);
  it('existe y tiene textos', () => {
    expect(base.length).toBeGreaterThan(30);
  });
  it.each([
    ['en', en],
    ['fr', fr],
    ['pt', pt],
  ])('%s tiene las mismas claves que es y ninguna vacía', (_l, m) => {
    const otras = hojas((m as unknown as Record<string, Arbol>)[ns]);
    expect(otras.map(([k]) => k).sort()).toEqual(base.map(([k]) => k).sort());
    expect(otras.filter(([, v]) => !v.trim())).toEqual([]);
  });
  it('ningún texto parece una etiqueta HTML (next-intl lo tomaría como rich text)', () => {
    for (const m of [es, en, fr, pt]) {
      expect(hojas((m as unknown as Record<string, Arbol>)[ns]).filter(([, v]) => /<\/?[a-z]/i.test(v))).toEqual([]);
    }
  });
});
