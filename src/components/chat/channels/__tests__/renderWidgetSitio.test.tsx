/**
 * @jest-environment jsdom
 *
 * Chat del sitio web: lo restaurado el 2026-11-14 se ve y guarda con el
 * formato que lee el widget público (márgenes en `position.offsetX/offsetY`,
 * logo en `logo_url`, estilo, vista inicial y botones con mensaje o enlace),
 * y la vista previa usa esos valores en px.
 */
import { act, fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { AlAbrirWidget, AparienciaWidget } from '../website/id/SeccionesWidget';
import { VistaPreviaWidget } from '../website/id/VistaPreviaWidget';
import { configuracionDelWidget } from '../website/id/widgetLogica';

const config = configuracionDelWidget(
  {
    position: { side: 'left', vertical: 'bottom', offsetX: 30, offsetY: 44 },
    style: { iconType: 'support', borderWidth: 2, borderColor: '#000000', buttonSize: 60, borderRadius: 12 },
    behavior: { title: 'Tienda', openDefaultView: 'faq', showQuickActions: true, quickActions: [{ label: 'Envíos', action: 'https://tienda.co/envios' }] },
  },
  'Hola',
);

describe('Apariencia', () => {
  test('márgenes horizontal y vertical: guardan en position conservando la esquina', () => {
    const onGuardarPosicion = jest.fn(async () => undefined);
    renderConIdioma(<AparienciaWidget config={config} onGuardarPosicion={onGuardarPosicion} onGuardarEstilo={jest.fn(async () => undefined)} onGuardarLogo={jest.fn(async () => undefined)} />);
    const horizontal = screen.getByLabelText('Margen horizontal');
    expect((horizontal as HTMLInputElement).value).toBe('30');
    expect(screen.getByText(/Distancia al borde izquierdo/)).toBeTruthy();
    fireEvent.focus(horizontal);
    fireEvent.change(horizontal, { target: { value: '80' } });
    fireEvent.blur(horizontal);
    expect(onGuardarPosicion).toHaveBeenCalledWith({ side: 'left', vertical: 'bottom', offsetX: 80, offsetY: 44 });
  });

  test('logo: solo guarda enlaces https', () => {
    const onGuardarLogo = jest.fn(async () => undefined);
    renderConIdioma(<AparienciaWidget config={config} onGuardarPosicion={jest.fn(async () => undefined)} onGuardarEstilo={jest.fn(async () => undefined)} onGuardarLogo={onGuardarLogo} />);
    const logo = screen.getByLabelText('Logo del chat');
    fireEvent.change(logo, { target: { value: 'http://inseguro.co/a.png' } });
    fireEvent.blur(logo);
    expect(onGuardarLogo).not.toHaveBeenCalled();
    expect(screen.getByText(/https:\/\//, { selector: 'p' })).toBeTruthy();
    fireEvent.change(logo, { target: { value: 'https://tienda.co/logo.png' } });
    fireEvent.blur(logo);
    expect(onGuardarLogo).toHaveBeenCalledWith('https://tienda.co/logo.png');
  });
});

describe('Al abrir el chat', () => {
  test('vista inicial, pedir datos fuera de línea y botón con mensaje propio', async () => {
    const onGuardar = jest.fn(async () => undefined);
    renderConIdioma(<AlAbrirWidget comportamiento={config.behavior} onGuardar={onGuardar} />);
    expect(screen.getByText('Lo primero que ve el visitante')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Texto del botón'), { target: { value: 'Horarios' } });
    fireEvent.change(screen.getByLabelText('Mensaje o enlace (opcional)'), { target: { value: '¿A qué hora abren?' } });
    fireEvent.click(screen.getByRole('button', { name: /Agregar/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /pedir sus datos de contacto/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    });
    expect(onGuardar).toHaveBeenCalledWith(
      expect.objectContaining({
        openDefaultView: 'faq',
        offlineCollectData: false,
        quickActions: [
          { label: 'Envíos', action: 'https://tienda.co/envios' },
          { label: 'Horarios', action: '¿A qué hora abren?' },
        ],
      }),
    );
  });
});

describe('Vista previa', () => {
  test('usa esquina, márgenes, tamaño, redondeo y borde guardados', () => {
    renderConIdioma(<VistaPreviaWidget config={config} datos={{ name: true, email: false, phone: false }} />);
    // El primero es la X de la ventana; el último, el botón flotante.
    const lanzador = screen.getAllByRole('button', { name: 'Cerrar el chat' }).at(-1)!;
    expect(lanzador.style.left).toBe('30px');
    expect(lanzador.style.bottom).toBe('44px');
    expect(lanzador.style.width).toBe('60px');
    expect(lanzador.style.borderRadius).toBe('12px');
    expect(lanzador.style.border).toContain('2px');
    expect(screen.getByText('Tienda')).toBeTruthy();
    expect(screen.getByLabelText('Abre un enlace')).toBeTruthy();
  });
});
