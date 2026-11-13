import { duracionGrabacion, estadoComposer, puedeEnviar, puedeEscribir, respuestasParaTexto } from '../composerLogica';
import { canalDeTipo } from '../canal';

describe('Chat › estados del compositor', () => {
  test('cerrada gana a todo', () => {
    expect(estadoComposer({ estadoConversacion: 'closed', tipoCanal: 'whatsapp', ventana: { abierta: false, puedeContactar: false } })).toBe('cerrada');
    expect(estadoComposer({ estadoConversacion: 'archived', tipoCanal: 'website' })).toBe('cerrada');
  });

  test('WhatsApp: ventana vencida y baja del cliente', () => {
    expect(estadoComposer({ estadoConversacion: 'open', tipoCanal: 'whatsapp', ventana: { abierta: false, puedeContactar: true } })).toBe('ventanaVencida');
    expect(estadoComposer({ estadoConversacion: 'open', tipoCanal: 'whatsapp', ventana: { abierta: true, puedeContactar: false } })).toBe('sinConsentimiento');
    expect(estadoComposer({ estadoConversacion: 'pending', tipoCanal: 'whatsapp', ventana: { abierta: true, puedeContactar: true } })).toBe('normal');
  });

  test('sin dato de la ventana no se bloquea (el servidor valida al enviar)', () => {
    expect(estadoComposer({ estadoConversacion: 'open', tipoCanal: 'whatsapp', ventana: null })).toBe('normal');
  });

  test('la ventana solo aplica a WhatsApp', () => {
    expect(estadoComposer({ estadoConversacion: 'open', tipoCanal: 'instagram', ventana: { abierta: false, puedeContactar: false } })).toBe('normal');
  });

  test('las notas internas se escriben con la ventana vencida, no con la conversación cerrada', () => {
    expect(puedeEscribir('nota', 'ventanaVencida')).toBe(true);
    expect(puedeEscribir('nota', 'sinConsentimiento')).toBe(true);
    expect(puedeEscribir('nota', 'cerrada')).toBe(false);
    expect(puedeEscribir('responder', 'ventanaVencida')).toBe(false);
    expect(puedeEscribir('responder', 'normal')).toBe(true);
  });

  test('puedeEnviar: texto, estado y envío en curso', () => {
    expect(puedeEnviar('Hola', 'responder', 'normal')).toBe(true);
    expect(puedeEnviar('   ', 'responder', 'normal')).toBe(false);
    expect(puedeEnviar('Hola', 'responder', 'normal', true)).toBe(false);
    expect(puedeEnviar('Hola', 'responder', 'cerrada')).toBe(false);
    expect(puedeEnviar('Ojo', 'nota', 'ventanaVencida')).toBe(true);
  });

  test('respuestas rápidas con «/»', () => {
    const lista = [
      { id: '1', title: 'Envío gratis', content: 'El envío es gratis', shortcut: 'envio' },
      { id: '2', title: 'Horario', content: 'Abrimos de 8 a 6', shortcut: 'horario' },
    ];
    expect(respuestasParaTexto(lista, 'hola')).toBeNull();
    expect(respuestasParaTexto(lista, '/')?.map((r) => r.id)).toEqual(['1', '2']);
    expect(respuestasParaTexto(lista, '/envío')?.map((r) => r.id)).toEqual(['1']);
    expect(respuestasParaTexto(lista, '/HOR')?.map((r) => r.id)).toEqual(['2']);
    expect(respuestasParaTexto(lista, '/zzz')).toEqual([]);
    expect(respuestasParaTexto(lista, '/envio\nmás')).toBeNull();
  });

  test('duracionGrabacion', () => {
    expect(duracionGrabacion(0)).toBe('0:00');
    expect(duracionGrabacion(65)).toBe('1:05');
    expect(duracionGrabacion(-3)).toBe('0:00');
  });

  test('canalDeTipo traduce channels.type', () => {
    expect(canalDeTipo('website')).toBe('web');
    expect(canalDeTipo('whatsapp')).toBe('whatsapp');
    expect(canalDeTipo('messenger')).toBe('facebook');
    expect(canalDeTipo('email')).toBe('correo');
    expect(canalDeTipo(undefined)).toBe('web');
  });
});
