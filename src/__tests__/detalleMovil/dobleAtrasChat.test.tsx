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

import { CabeceraDetalleChat } from '@/components/chat/CabeceraDetalleChat';
import WebsiteSettingsHeader from '@/components/chat/channels/website/id/WebsiteSettingsHeader';
import FragmentDetailHeader from '@/components/chat/conocimiento/fragmentos/id/FragmentDetailHeader';
import SourceDetailHeader from '@/components/chat/conocimiento/fuentes/id/SourceDetailHeader';
import { CabeceraConversacion } from '@/components/chat/conversations/CabeceraConversacion';
import type { ConversacionControl } from '@/components/chat/conversations/useConversacion';
import type { ChatChannel } from '@/lib/services/chatChannelsService';

const nada = () => undefined;
const canal = { id: 'c1', name: 'Canal principal', status: 'active' };

afterEach(() => simularAncho(1440));

describe('Chat › detalles en celular (390 px): una sola «←»', () => {
  // Detalle de canal (WhatsApp, Instagram, Messenger, sitio web; Figma 91-chat-22/24):
  // la cabecera común del Chat con estado y acciones a la vista.
  test('canal: título, estado y acciones a la vista', () => {
    renderEnCelular(
      <CabeceraDetalleChat
        titulo="Canal principal"
        volverA="/app/chat/canales"
        migas={['Chat', 'Canales']}
        subtituloMovil="WhatsApp"
        badge={<span>Conectado</span>}
        acciones={<button type="button">Actualizar</button>}
      />,
    );
    comprobar('Canal principal', ['Conectado', 'Actualizar']);
    expect(cabeceraPublicada()?.volverA).toBe('/app/chat/canales');
    expect(cabeceraPublicada()?.subtitulo).toBe('WhatsApp');
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

  // Vista completa de una conversación (Figma 91-chat-10/11/12): la misma
  // CabeceraConversacion en Conversación, Actividad y Archivos.
  const conversacion = {
    detalle: {
      id: 'v1',
      status: 'open',
      priority: 'high',
      assigned_member_id: null,
      customer_id: 'k1',
      customer: { full_name: 'Cliente de prueba', email: 'cliente@ejemplo.test', phone: '+57 300 000 0000' },
      channel: { name: 'WhatsApp ventas', type: 'whatsapp', ai_mode: 'hybrid' },
    },
    agentes: [],
    asignar: nada,
    cambiarEstado: nada,
  } as unknown as ConversacionControl;

  test('conversación: cliente, canal, estado y prioridad a la vista', () => {
    renderEnCelular(<CabeceraConversacion c={conversacion} seccion="conversacion" conversationId="v1" />);
    comprobar('Cliente de prueba', ['Abierta', 'Prioridad alta', 'Sin asignar']);
    expect(cabeceraPublicada()?.subtitulo).toBe('WhatsApp ventas · +57 300 000 0000');
    expect(cabeceraPublicada()?.volverA).toBe('/app/chat/bandeja?c=v1');
  });

  test('actividad y archivos: «←» vuelve a la conversación', () => {
    renderEnCelular(<CabeceraConversacion c={conversacion} seccion="actividad" conversationId="v1" contadores={{ actividad: 14 }} />);
    comprobar('Cliente de prueba', ['Abierta', 'Actividad']);
    expect(cabeceraPublicada()?.subtitulo).toBe('Actividad');
    expect(cabeceraPublicada()?.volverA).toBe('/app/chat/conversaciones/v1');
  });
});
