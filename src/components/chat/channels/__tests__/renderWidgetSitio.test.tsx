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

/* ── Diseños aprobados 94-chat-recuperado-canales (2026-11-14) ───────────── */

describe('Apariencia: subida, color libre y vista previa del botón', () => {
  const base = configuracionDelWidget({ style: { borderWidth: 2, borderColor: '#FFFFFF' } }, 'Hola');
  const props = {
    onGuardarPosicion: jest.fn(async () => undefined),
    onGuardarEstilo: jest.fn(async () => undefined),
    onGuardarLogo: jest.fn(async () => undefined),
    carpetaSubidas: '120/chat-widget/canal-1',
    organizacionId: 120,
  };
  const archivo = (nombre: string, tipo: string, bytes: number) => {
    const f = new File(['x'], nombre, { type: tipo });
    Object.defineProperty(f, 'size', { value: bytes });
    return f;
  };
  const entradaLogo = (c: HTMLElement) => c.querySelector('input[type="file"]') as HTMLInputElement;

  test('sin logo: zona para arrastrar o subir, y «o pega un enlace»', () => {
    renderConIdioma(<AparienciaWidget config={base} {...props} />);
    expect(screen.getByText('Arrastra una imagen aquí o súbela')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Subir imagen' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /o pega un enlace/ }).length).toBeGreaterThan(0);
  });

  test('error de formato y de tamaño, sin subir nada', () => {
    const { container } = renderConIdioma(<AparienciaWidget config={base} {...props} />);
    fireEvent.change(entradaLogo(container), { target: { files: [archivo('logo-tienda.gif', 'image/gif', 2000)] } });
    expect(screen.getByRole('alert').textContent).toContain('«logo-tienda.gif»: formato no válido. Usa PNG, JPG, SVG o WebP de hasta 2 MB.');
    fireEvent.change(entradaLogo(container), { target: { files: [archivo('logo-grande.png', 'image/png', 3.4 * 1024 * 1024)] } });
    expect(screen.getByRole('alert').textContent).toContain('«logo-grande.png» pesa 3,4 MB. El máximo es 2 MB: redúcela o elige otra.');
    expect(screen.getByRole('button', { name: 'Elegir otra imagen' })).toBeTruthy();
    expect(props.onGuardarLogo).not.toHaveBeenCalled();
  });

  test('los colores sugeridos viven solo dentro del selector de color', () => {
    renderConIdioma(<AparienciaWidget config={base} {...props} />);
    expect(screen.queryByText('Colores sugeridos')).toBeNull();
    expect(screen.queryByText('Sugeridos')).toBeNull();
    expect(screen.getByRole('button', { name: 'Elegir Color principal' })).toBeTruthy();
  });

  test('vista previa del botón en vivo: resume lo que se edita antes de guardar', () => {
    renderConIdioma(<AparienciaWidget config={base} {...props} />);
    expect(screen.getAllByText('56 px · redondeo 28 · borde 2 px blanco · sombra media').length).toBeGreaterThan(0);
    const radio = screen.getByLabelText('Redondeo');
    fireEvent.focus(radio);
    fireEvent.change(radio, { target: { value: '16' } });
    expect(screen.getAllByText('56 px · redondeo 16 · borde 2 px blanco · sombra media').length).toBeGreaterThan(0);
  });

  test('con «Imagen propia», color y estilo del ícono quedan deshabilitados', () => {
    const propia = configuracionDelWidget({ style: { iconType: 'custom', borderWidth: 2 } }, 'Hola');
    renderConIdioma(<AparienciaWidget config={propia} {...props} />);
    expect(screen.getByText('Imagen del botón')).toBeTruthy();
    expect((screen.getByLabelText('Color del ícono', { selector: 'input:not([type="color"])' }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getAllByText(/imagen propia · borde 2 px blanco/).length).toBeGreaterThan(0);
  });
});
