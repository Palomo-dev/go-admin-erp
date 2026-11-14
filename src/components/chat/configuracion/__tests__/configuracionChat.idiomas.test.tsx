/**
 * @jest-environment jsdom
 */
/**
 * Configuración del Chat en los cuatro idiomas (namespace `chatConfig`): los
 * diálogos y tarjetas de etiquetas, respuestas rápidas y llaves de API, y las
 * piezas de Chat › IA, ya no quedan en español fijo. Mismas claves en es/en/fr/pt.
 */
import { screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import TagDialog from '../etiquetas/TagDialog';
import QuickReplyDialog from '../respuestas-rapidas/QuickReplyDialog';
import ApiKeyDialog from '../llaves-api/ApiKeyDialog';
import ApiKeyCard from '../llaves-api/ApiKeyCard';
import ChannelAIModeTable from '@/components/chat/ia/configuracion/ChannelAIModeTable';
import BehaviorSettings from '@/components/chat/ia/configuracion/BehaviorSettings';
import es from '../../../../../messages/es.json';
import en from '../../../../../messages/en.json';
import fr from '../../../../../messages/fr.json';
import pt from '../../../../../messages/pt.json';

jest.mock('@/components/shared/RichTextEditor', () => ({ RichTextEditor: () => null }));
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

function claves(o: unknown, p = ''): string[] {
  if (!o || typeof o !== 'object') return [p];
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => claves(v, p ? `${p}.${k}` : k));
}

test('las mismas claves de chatConfig en los cuatro idiomas', () => {
  const base = claves((es as Record<string, unknown>).chatConfig).sort();
  expect(base.length).toBeGreaterThan(150);
  for (const m of [en, fr, pt]) expect(claves((m as Record<string, unknown>).chatConfig).sort()).toEqual(base);
});

test('etiquetas en inglés', () => {
  renderConIdioma(<TagDialog open onOpenChange={() => undefined} tag={null} onSave={async () => undefined} />, { idioma: 'en' });
  expect(screen.getByRole('heading', { name: 'New tag' })).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Blue' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Create tag' })).toBeTruthy();
});

test('respuestas rápidas en francés', () => {
  renderConIdioma(<QuickReplyDialog open onOpenChange={() => undefined} reply={null} onSave={async () => undefined} />, { idioma: 'fr' });
  expect(screen.getByRole('heading', { name: 'Nouvelle réponse rapide' })).toBeTruthy();
  expect(screen.getByText('Tapez /raccourci pour l’utiliser')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Créer la réponse' })).toBeTruthy();
});

test('llaves de API en portugués', () => {
  renderConIdioma(<ApiKeyDialog open onOpenChange={() => undefined} channels={[]} onSave={async () => undefined} />, { idioma: 'pt' });
  expect(screen.getByRole('heading', { name: 'Nova chave de API' })).toBeTruthy();
  expect(screen.getByText('Ler mensagens')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Criar chave' })).toBeTruthy();
});

test('tarjeta de llave: estado y fechas relativas en el idioma', () => {
  const hace = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  renderConIdioma(
    <ApiKeyCard
      apiKey={{ id: 'k1', name: 'Widget', key_prefix: 'gk_ab', is_active: true, scopes: ['messages:read'], created_at: hace } as never}
      onRevoke={() => undefined}
      onRotate={() => undefined}
    />,
    { idioma: 'en' },
  );
  expect(screen.getByText('Active')).toBeTruthy();
  expect(screen.getByText(/Created 3 days ago/)).toBeTruthy();
});

test('Chat › IA: canales y comportamiento en inglés', () => {
  renderConIdioma(
    <ChannelAIModeTable
      channels={[{ id: 'c1', name: 'Tienda', type: 'whatsapp', status: 'active', ai_mode: 'hybrid' } as never]}
      loading={false}
      onModeChange={() => undefined}
      onApplyToAll={() => undefined}
    />,
    { idioma: 'en' },
  );
  expect(screen.getByText('AI mode by channel')).toBeTruthy();
  expect(screen.getAllByText('Hybrid').length).toBeGreaterThan(0);

  renderConIdioma(
    <BehaviorSettings
      tone="friendly"
      language="es"
      systemRules=""
      fallbackMessage=""
      autoResponseEnabled
      autoResponseDelay={5}
      confidenceThreshold={0.7}
      onToneChange={() => undefined}
      onLanguageChange={() => undefined}
      onSystemRulesChange={() => undefined}
      onFallbackChange={() => undefined}
      onAutoResponseChange={() => undefined}
      onDelayChange={() => undefined}
      onConfidenceChange={() => undefined}
    />,
    { idioma: 'en' },
  );
  expect(screen.getByText('Confidence threshold')).toBeTruthy();
  expect(screen.getByLabelText('Fallback message')).toBeTruthy();
});
