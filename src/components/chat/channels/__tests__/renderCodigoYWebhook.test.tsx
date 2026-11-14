/**
 * @jest-environment jsdom
 *
 * Diseños aprobados 94-chat-recuperado-canales 11 a 13:
 * - El diálogo «Instalar el chat en tu sitio web» muestra el código REAL, el
 *   mismo del detalle del canal (un solo generador, `codigoDelWidget`).
 * - Webhook de Meta: sin token no hay «Copiar token» ni «Ver token» y el
 *   campo explica por qué está vacío; con token, «Copiar token» lo copia sin
 *   mostrarlo.
 */
import { act, fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { codigoDelWidget } from '@/lib/chat/codigoWidget';
import type { ChatChannel } from '@/lib/services/chatChannelsService';
import WidgetCodeDialog from '../WidgetCodeDialog';
import { WebhookCanal } from '../detalle/WebhookCanal';

const CLAVE = 'pk_7f3c2b9e81d4a91c5e20';

describe('Código de instalación', () => {
  test('el diálogo de la lista muestra el código real del canal y la clave', () => {
    const canal = { id: 'c1', name: 'Chat del sitio web', type: 'website', public_key: CLAVE } as unknown as ChatChannel;
    renderConIdioma(<WidgetCodeDialog open onOpenChange={() => undefined} channel={canal} />);
    expect(screen.getByText('Instalar el chat en tu sitio web')).toBeTruthy();
    const codigo = codigoDelWidget(CLAVE);
    expect(codigo).toContain(CLAVE);
    expect(screen.getByText((_, el) => el?.tagName === 'CODE' && el.textContent === codigo)).toBeTruthy();
    expect(screen.getByText('Clave pública del canal')).toBeTruthy();
    expect(screen.getByText(/basta con activar «Mostrar en el sitio»/)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Instrucciones' }));
    expect(screen.getByText(/Pega el código justo antes de la etiqueta <\/body>/)).toBeTruthy();
  });
});

describe('Webhook de Meta', () => {
  test('sin token guardado: ni copiar ni ver, y el campo dice por qué', () => {
    renderConIdioma(<WebhookCanal ruta="/api/webhooks/facebook/c1" tokenVerificacion={null} />);
    expect(screen.getByText('Aún no hay token de verificación guardado.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Copiar token/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Ver token/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Abrir Meta for Developers/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Abrir Meta Business/ })).toBeTruthy();
  });

  test('«Copiar token» copia sin mostrarlo y pasa a «Token copiado»', async () => {
    const writeText = jest.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderConIdioma(<WebhookCanal ruta="/api/webhooks/instagram/c1" tokenVerificacion="go_ig_secreto_8c1d" />);
    expect(screen.queryByDisplayValue('go_ig_secreto_8c1d')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Copiar token/ }));
    });
    expect(writeText).toHaveBeenCalledWith('go_ig_secreto_8c1d');
    expect(screen.getByRole('button', { name: /Token copiado/ })).toBeTruthy();
    expect(screen.queryByDisplayValue('go_ig_secreto_8c1d')).toBeNull();
  });
});
