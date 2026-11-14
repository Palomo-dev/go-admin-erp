/**
 * Funciones del Chat que se perdieron en el rediseño y volvieron (auditoría
 * 2026-11-14, «Agente 1»): reglas puras, sin montar nada.
 */
import es from '../../../../messages/es.json';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import pt from '../../../../messages/pt.json';
import { entregaUltimoMensaje, esVista, estaEnLinea, filtrosDeVista } from '../inbox/bandejaLogica';
import { cambiaAutor, enlaceMapa, estadoEntrega } from '../conversations/hiloLogica';
import { aplicarNegrilla } from '../ui/composerLogica';
import { filtrarRespuestasRapidas } from '../conversations/panel/respuestasRapidasLogica';
import { duracionMs, idCorto, limitesDias, textoConfianza, textoDuracion, tonoConfianza } from '../ia/trabajos/trabajosLogica';
import {
  cambiosContacto,
  correoVisible,
  errorEdicion,
  esCorreoProvisional,
  historialConversaciones,
  type EdicionContacto,
} from '@/lib/services/chat/fichaClienteChat';

describe('Bandeja: todos los estados y la fila', () => {
  it('«Todas» no filtra por estado y conserva los filtros extra', () => {
    expect(esVista('todas')).toBe(true);
    expect(filtrosDeVista('todas', null)).toEqual({});
    expect(filtrosDeVista('todas', 3, { prioridad: 'high', canal: 'c1' })).toEqual({ priority: 'high', channel: 'c1' });
  });

  it('«en línea» es haberse visto hace menos de 2 minutos', () => {
    const ahora = new Date('2026-11-14T15:00:00Z');
    expect(estaEnLinea('2026-11-14T14:59:00Z', ahora)).toBe(true);
    expect(estaEnLinea('2026-11-14T14:58:00Z', ahora)).toBe(false);
    expect(estaEnLinea(null, ahora)).toBe(false);
    expect(estaEnLinea('no es fecha', ahora)).toBe(false);
  });

  it('✓/✓✓ solo para el último mensaje del equipo', () => {
    expect(entregaUltimoMensaje({ role: 'agent', direction: 'outbound', is_read: true })).toBe('leido');
    expect(entregaUltimoMensaje({ role: 'ai', direction: 'outbound', is_read: false })).toBe('enviado');
    expect(entregaUltimoMensaje({ role: 'customer', direction: 'inbound', is_read: true })).toBeNull();
    expect(entregaUltimoMensaje(null)).toBeNull();
  });
});

describe('Mensajes: entrega, autor y ubicación', () => {
  it('fallido manda; luego leído, entregado y enviado', () => {
    expect(estadoEntrega([], false)).toBe('enviado');
    expect(estadoEntrega([], true)).toBe('leido');
    expect(estadoEntrega([{ event_type: 'sent' }, { event_type: 'delivered' }], false)).toBe('entregado');
    expect(estadoEntrega([{ event_type: 'delivered' }, { event_type: 'read' }], false)).toBe('leido');
    expect(estadoEntrega([{ event_type: 'read' }, { event_type: 'failed' }], true)).toBe('fallido');
  });

  it('cambia el autor por rol y, entre agentes, por persona', () => {
    expect(cambiaAutor(null, { role: 'customer' })).toBe(true);
    expect(cambiaAutor({ role: 'customer' }, { role: 'customer' })).toBe(false);
    expect(cambiaAutor({ role: 'customer' }, { role: 'agent', sender_member_id: 1 })).toBe(true);
    expect(cambiaAutor({ role: 'agent', sender_member_id: 1 }, { role: 'agent', sender_member_id: 1 })).toBe(false);
    expect(cambiaAutor({ role: 'agent', sender_member_id: 1 }, { role: 'agent', sender_member_id: 2 })).toBe(true);
  });

  it('arma el enlace del mapa solo con coordenadas', () => {
    expect(enlaceMapa({ latitude: 6.2442, longitude: -75.5812 })).toBe('https://www.google.com/maps?q=6.2442,-75.5812');
    expect(enlaceMapa({ latitude: 'x', longitude: 1 })).toBeNull();
    expect(enlaceMapa({})).toBeNull();
    expect(enlaceMapa(null)).toBeNull();
  });
});

describe('Escritura: negrilla', () => {
  it('envuelve la selección y la deja seleccionada', () => {
    expect(aplicarNegrilla('hola mundo', 5, 10)).toEqual({ texto: 'hola **mundo**', inicio: 7, fin: 12 });
  });
  it('sin selección deja **** con el cursor en medio', () => {
    expect(aplicarNegrilla('hola ', 5, 5)).toEqual({ texto: 'hola ****', inicio: 7, fin: 7 });
  });
  it('acepta selección al revés o fuera de rango', () => {
    expect(aplicarNegrilla('abc', 3, 1).texto).toBe('a**bc**');
    expect(aplicarNegrilla('abc', -4, 99).texto).toBe('**abc**');
  });
});

describe('Respuestas rápidas', () => {
  const r = [
    { id: '1', title: 'Envíos', content: 'Enviamos a todo el país', shortcut: 'envio', tags: ['logística'] },
    { id: '2', title: 'Horario', content: 'Abrimos de 8 a 6', shortcut: null, tags: [] },
  ];
  it('busca en título, texto, atajo y etiquetas sin tildes', () => {
    expect(filtrarRespuestasRapidas(r, 'envios').map((x) => x.id)).toEqual(['1']);
    expect(filtrarRespuestasRapidas(r, '/envio').map((x) => x.id)).toEqual(['1']);
    expect(filtrarRespuestasRapidas(r, 'LOGISTICA').map((x) => x.id)).toEqual(['1']);
    expect(filtrarRespuestasRapidas(r, '8 a 6').map((x) => x.id)).toEqual(['2']);
    expect(filtrarRespuestasRapidas(r, '  ')).toHaveLength(2);
  });
});

describe('Ficha del cliente', () => {
  const base: EdicionContacto = { nombres: ' Ana ', apellidos: '', email: '', telefono: '', direccion: ' Cra 1 ', ciudad: '' };

  it('nunca muestra el correo provisional del widget', () => {
    expect(esCorreoProvisional('v-123@widget.local')).toBe(true);
    expect(correoVisible('v-123@widget.local', {})).toBeNull();
    expect(correoVisible('v-123@widget.local', { real_email: 'ana@correo.com' })).toBe('ana@correo.com');
    expect(correoVisible('ana@correo.com', null)).toBe('ana@correo.com');
  });

  it('valida nombre y correo', () => {
    expect(errorEdicion({ ...base, nombres: ' ' })).toBe('nombre');
    expect(errorEdicion({ ...base, email: 'ana@' })).toBe('correo');
    expect(errorEdicion({ ...base, email: 'x@widget.local' })).toBe('correo');
    expect(errorEdicion(base)).toBeNull();
  });

  it('el correo real del visitante va a metadata; el de un cliente normal, a email', () => {
    const visitante = cambiosContacto({ correoProvisional: true, metadata: { linked_customer_id: 'c9' } }, { ...base, email: 'ana@correo.com' });
    expect(visitante).toEqual({
      first_name: 'Ana',
      last_name: null,
      phone: null,
      address: 'Cra 1',
      city: null,
      metadata: { linked_customer_id: 'c9', real_email: 'ana@correo.com' },
    });
    expect(visitante).not.toHaveProperty('email');
    const normal = cambiosContacto({ correoProvisional: false, metadata: {} }, { ...base, email: 'ana@correo.com' });
    expect(normal.email).toBe('ana@correo.com');
    expect(normal).not.toHaveProperty('metadata');
    const sinCorreo = cambiosContacto({ correoProvisional: true, metadata: { real_email: 'viejo@correo.com' } }, base);
    expect(sinCorreo.metadata).toEqual({});
  });

  it('suma el historial y deja las 5 más recientes', () => {
    const filas = Array.from({ length: 7 }, (_, i) => ({
      id: `c${i}`,
      status: 'open',
      created_at: `2026-11-0${i + 1}T10:00:00Z`,
      last_message_at: `2026-11-0${i + 1}T12:00:00Z`,
      message_count: i + 1,
    })).reverse();
    const h = historialConversaciones(filas);
    expect(h.mensajes).toBe(28);
    expect(h.primerContacto).toBe('2026-11-01T10:00:00Z');
    expect(h.ultimoContacto).toBe('2026-11-07T12:00:00Z');
    expect(h.recientes.map((r) => r.id)).toEqual(['c6', 'c5', 'c4', 'c3', 'c2']);
    expect(historialConversaciones([])).toEqual({ mensajes: 0, primerContacto: null, ultimoContacto: null, recientes: [] });
  });
});

describe('IA › Trabajos', () => {
  it('Desde/Hasta: hasta es el día completo y se ordenan', () => {
    expect(limitesDias('2026-11-01', '2026-11-14')).toEqual({ desde: '2026-11-01', hastaExclusivo: '2026-11-15' });
    expect(limitesDias('2026-11-14', '2026-11-01')).toEqual({ desde: '2026-11-01', hastaExclusivo: '2026-11-15' });
    expect(limitesDias('2026-12-31', '')).toEqual({ desde: '2026-12-31', hastaExclusivo: null });
    expect(limitesDias('', '2026-12-31')).toEqual({ desde: null, hastaExclusivo: '2027-01-01' });
  });

  it('duración, confianza e id corto', () => {
    expect(duracionMs({ started_at: '2026-11-14T10:00:00Z', completed_at: '2026-11-14T10:00:02.400Z' })).toBe(2400);
    expect(duracionMs({ started_at: null, completed_at: null })).toBeNull();
    expect(textoDuracion(850, 'es')).toBe('850 ms');
    expect(textoDuracion(2400, 'es')).toBe('2,4 s');
    expect(textoDuracion(90_000, 'en')).toBe('1.5 min');
    expect(textoDuracion(null, 'es')).toBe('—');
    expect(textoConfianza(0.85, 'en')).toBe('85%');
    expect(textoConfianza(null, 'es')).toBe('—');
    expect([tonoConfianza(0.9), tonoConfianza(0.5), tonoConfianza(0.1), tonoConfianza(null)]).toEqual(['exito', 'advertencia', 'peligro', 'neutro']);
    expect(idCorto('0123456789abcdef')).toBe('01234567');
  });
});

type Arbol = { [k: string]: string | Arbol };
const hojas = (o: Arbol, pre = ''): [string, string][] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[pre + k, v] as [string, string]] : hojas(v, `${pre}${k}.`)));

describe('chatBandeja y chatUi en 4 idiomas', () => {
  for (const ns of ['chatBandeja', 'chatUi'] as const) {
    const base = hojas((es as unknown as Record<string, Arbol>)[ns]);
    it.each([
      ['en', en],
      ['fr', fr],
      ['pt', pt],
    ])(`${ns}: %s tiene las mismas claves que es y ninguna vacía`, (_l, m) => {
      const otras = hojas((m as unknown as Record<string, Arbol>)[ns]);
      expect(otras.map(([k]) => k).sort()).toEqual(base.map(([k]) => k).sort());
      expect(otras.filter(([, v]) => !v.trim())).toEqual([]);
    });
  }
});
