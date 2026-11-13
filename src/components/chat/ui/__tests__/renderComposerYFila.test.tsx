/**
 * @jest-environment jsdom
 *
 * Chat · render de las piezas propias (Figma 91-chat-00): estados del
 * compositor, envío vs. nota, respuestas rápidas con «/», fila de la lista y
 * burbujas. Los textos salen de messages/*.json (es y en).
 */
import { act, fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { ComposerChat, type ComposerChatProps } from '../ComposerChat';
import { ConversacionFila } from '../ConversacionFila';
import { Burbuja } from '../Burbuja';
import { CanalIcono } from '../CanalIcono';

function composer(p: Partial<ComposerChatProps> = {}) {
  const props: ComposerChatProps = {
    modo: 'responder',
    onModoChange: jest.fn(),
    estado: 'normal',
    onEnviar: jest.fn(async () => undefined),
    onGuardarNota: jest.fn(async () => undefined),
    ...p,
  };
  renderConIdioma(<ComposerChat {...props} />);
  return props;
}

describe('ComposerChat', () => {
  test('conversación cerrada: aviso y «Reabrir conversación»', () => {
    const onReabrir = jest.fn();
    composer({ estado: 'cerrada', onReabrir });
    expect(screen.getByText(/Esta conversación está cerrada/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir conversación' }));
    expect(onReabrir).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Enviar/ })).toBeNull();
  });

  test('ventana de 24 h vencida: aviso y «Elegir plantilla», sin caja para responder', () => {
    const onElegirPlantilla = jest.fn();
    composer({ estado: 'ventanaVencida', onElegirPlantilla });
    expect(screen.getByText(/Pasaron más de 24 h/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Elegir plantilla' }));
    expect(onElegirPlantilla).toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  test('ventana vencida en modo nota: se puede escribir la nota', async () => {
    const p = composer({ estado: 'ventanaVencida', modo: 'nota' });
    const caja = screen.getByRole('textbox');
    fireEvent.change(caja, { target: { value: 'Llamar mañana' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Guardar nota/ }));
    });
    expect(p.onGuardarNota).toHaveBeenCalledWith('Llamar mañana');
    expect(p.onEnviar).not.toHaveBeenCalled();
  });

  test('Enter envía la respuesta y limpia la caja', async () => {
    const p = composer();
    const caja = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(caja, { target: { value: ' Hola ' } });
    await act(async () => {
      fireEvent.keyDown(caja, { key: 'Enter' });
    });
    expect(p.onEnviar).toHaveBeenCalledWith({ texto: 'Hola' });
    expect(caja.value).toBe('');
  });

  test('si el envío falla, el texto se conserva', async () => {
    const p = composer({ onEnviar: jest.fn(async () => Promise.reject(new Error('x'))) });
    const caja = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(caja, { target: { value: 'Hola' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Enviar$/ }));
    });
    expect(p.onEnviar).toHaveBeenCalled();
    expect(caja.value).toBe('Hola');
  });

  test('«/» muestra las respuestas rápidas y elegir una la pone en la caja', () => {
    const onUsar = jest.fn();
    composer({ respuestasRapidas: [{ id: 'r1', title: 'Horario', content: 'Abrimos de 8 a 6', shortcut: 'horario' }], onUsarRespuestaRapida: onUsar });
    const caja = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(caja, { target: { value: '/hor' } });
    fireEvent.click(screen.getByRole('option', { name: /Horario/ }));
    expect(caja.value).toBe('Abrimos de 8 a 6');
    expect(onUsar).toHaveBeenCalledWith('r1');
  });

  test('cambiar a «Nota interna» avisa el modo', () => {
    const p = composer();
    fireEvent.click(screen.getByRole('radio', { name: /Nota interna/ }));
    expect(p.onModoChange).toHaveBeenCalledWith('nota');
  });
});

describe('ConversacionFila y Burbuja', () => {
  test('fila: canal, no leídos, prioridad y agente', () => {
    const onClick = jest.fn();
    renderConIdioma(<ConversacionFila nombre="María Fernanda Ruiz" canal="whatsapp" vistaPrevia="¿Tienen la talla 38?" cuando="10:42" noLeidos={3} prioridad="high" atencion="Laura R." onClick={onClick} />);
    expect(screen.getByRole('img', { name: 'WhatsApp' })).toBeTruthy();
    expect(screen.getByLabelText('3 mensajes sin leer')).toBeTruthy();
    expect(screen.getByText('Alta')).toBeTruthy();
    expect(screen.getByText('Laura R.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalled();
  });

  test('fila sin asignar y con la IA en automático', () => {
    renderConIdioma(<ConversacionFila nombre="Visitante" canal="web" vistaPrevia="Hola" atencion={null} />);
    expect(screen.getByText('Sin asignar')).toBeTruthy();
    renderConIdioma(<ConversacionFila nombre="Juliana" canal="instagram" vistaPrevia="Hola" atencion="ia" />, { idioma: 'en' });
    expect(screen.getByText('AI · automatic')).toBeTruthy();
  });

  test('burbujas de IA y nota interna con su encabezado', () => {
    renderConIdioma(
      <>
        <Burbuja autor="ia" detalle="Laura la revisó" hora="10:32" entrega="leido">
          Hola
        </Burbuja>
        <Burbuja autor="nota" hora="10:41">
          Ojo
        </Burbuja>
      </>,
    );
    expect(screen.getByText('Respuesta de IA · Laura la revisó')).toBeTruthy();
    expect(screen.getByText('Nota interna · solo la ve tu equipo')).toBeTruthy();
    expect(screen.getByLabelText('Leído')).toBeTruthy();
  });

  test('CanalIcono traduce el nombre del canal', () => {
    renderConIdioma(<CanalIcono canal="correo" size={24} />, { idioma: 'en' });
    expect(screen.getByRole('img', { name: 'Email' })).toBeTruthy();
  });
});
