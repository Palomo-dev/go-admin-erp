/**
 * @jest-environment jsdom
 *
 * Chat › detalles en celular (390 px): una sola «←», la del MobileHeader del
 * shell. La cabecera propia conserva título, estado y acciones; solo su «←»
 * pasa a existir desde lg. Arnés: `@/test-utils/dobleAtrasMovil`.
 */
import { screen } from '@testing-library/react';
import { simularAncho } from '@/test-utils/renderConIdioma';
import { cabeceraPublicada, comprobarDetalleMovil as comprobar, renderEnCelular } from '@/test-utils/dobleAtrasMovil';

// Un solo router, como en Next: un objeto nuevo por render dispara los efectos que dependen de él.
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() };
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/app/chat',
  useSearchParams: () => new URLSearchParams(),
}));

import FacebookSettingsHeader from '@/components/chat/channels/facebook/id/FacebookSettingsHeader';
import InstagramSettingsHeader from '@/components/chat/channels/instagram/id/InstagramSettingsHeader';
import WhatsAppSettingsHeader from '@/components/chat/channels/whatsapp/id/WhatsAppSettingsHeader';
import WebsiteSettingsHeader from '@/components/chat/channels/website/id/WebsiteSettingsHeader';
import FragmentDetailHeader from '@/components/chat/conocimiento/fragmentos/id/FragmentDetailHeader';
import SourceDetailHeader from '@/components/chat/conocimiento/fuentes/id/SourceDetailHeader';
import ActivityHeader from '@/components/chat/conversations/id/activity/ActivityHeader';
import FilesHeader from '@/components/chat/conversations/id/files/FilesHeader';
import ConversationHeader from '@/components/chat/conversations/id/ConversationHeader';
import type { FacebookChannel } from '@/lib/services/facebookChannelService';
import type { InstagramChannel } from '@/lib/services/instagramChannelService';
import type { WhatsAppChannel } from '@/lib/services/whatsappChannelService';
import type { ChatChannel } from '@/lib/services/chatChannelsService';
import type { ConversationDetail } from '@/lib/services/conversationDetailService';

const nada = () => undefined;
const canal = { id: 'c1', name: 'Canal principal', status: 'active' };

afterEach(() => simularAncho(1440));

describe('Chat › detalles en celular (390 px): una sola «←»', () => {
  test.each([
    ['Facebook', FacebookSettingsHeader, 'Configuración del canal Facebook Messenger'],
    ['Instagram', InstagramSettingsHeader, 'Configuración del canal Instagram Direct'],
    ['WhatsApp', WhatsAppSettingsHeader, 'Configuración del canal WhatsApp Business'],
  ] as const)('canal %s: título, estado y acciones a la vista', (_n, Cabecera, subtitulo) => {
    const props = { channel: canal as unknown as FacebookChannel & InstagramChannel & WhatsAppChannel, onRefresh: nada, onToggleStatus: nada, isLoading: false };
    renderEnCelular(<Cabecera {...props} />);
    comprobar('Canal principal', ['Activo', subtitulo, 'Actualizar', 'Desactivar']);
    expect(cabeceraPublicada()?.volverA).toBe('/app/chat/canales');
  });

  test('canal sitio web', () => {
    renderEnCelular(
      <WebsiteSettingsHeader channel={canal as unknown as ChatChannel} widgetStats={null} onToggleStatus={async () => undefined} isUpdating={false} />,
    );
    comprobar('Canal principal', ['Activo', 'Configuración del widget de chat para sitio web']);
    expect(screen.getByRole('switch')).toBeTruthy();
  });

  test('fragmento de conocimiento', () => {
    renderEnCelular(
      <FragmentDetailHeader
        title="Horario de atención"
        isActive
        hasEmbedding
        version={3}
        contentHash={null}
        updatedAt="2026-10-01T15:00:00Z"
        hasChanges={false}
        saving={false}
        reindexing={false}
        onBack={nada}
        onSave={nada}
        onToggle={nada}
        onReindex={nada}
      />,
    );
    comprobar('Horario de atención', ['Activo', 'Indexado', 'Guardar', 'Versión 3']);
  });

  test('fuente de conocimiento', () => {
    renderEnCelular(
      <SourceDetailHeader
        name="Preguntas frecuentes"
        description="Lo que más preguntan"
        isActive={false}
        stats={{ totalFragments: 4, indexedFragments: 2, activeFragments: 3 }}
        onBack={nada}
        onRefresh={nada}
        onReindex={nada}
        onSettings={nada}
      />,
    );
    comprobar('Preguntas frecuentes', ['Inactiva', 'Lo que más preguntan', 'Reindexar', '50%']);
  });

  test('bitácora y archivos de la conversación', () => {
    renderEnCelular(<ActivityHeader conversationId="v1" stats={null} canExport onExport={nada} />);
    comprobar('Bitácora de Actividad', ['Exportar CSV']);
    expect(cabeceraPublicada()?.volverA).toBe('/app/chat/conversaciones/v1');
  });

  test('archivos de la conversación', () => {
    renderEnCelular(<FilesHeader conversationId="v1" stats={null} />);
    comprobar('Archivos de la conversación', ['Todos los archivos compartidos en esta conversación']);
  });

  test('conversación: cliente, canal, estado y prioridad a la vista', () => {
    const conversacion = {
      id: 'v1',
      status: 'open',
      priority: 'high',
      customer: { full_name: 'Cliente de prueba', email: 'cliente@ejemplo.test' },
      channel: { name: 'WhatsApp ventas', type: 'whatsapp', ai_mode: 'off' },
    } as unknown as ConversationDetail;
    renderEnCelular(<ConversationHeader conversation={conversacion} onStatusChange={nada} onPriorityChange={nada} />);
    comprobar('Cliente de prueba', ['Abierta', 'Alta', 'cliente@ejemplo.test']);
    expect(cabeceraPublicada()?.subtitulo).toBe('WhatsApp ventas');
    expect(cabeceraPublicada()?.volverA).toBe('/app/chat/bandeja');
  });
});
