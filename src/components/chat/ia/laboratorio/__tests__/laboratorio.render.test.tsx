/**
 * @jest-environment jsdom
 */
/**
 * Laboratorio de IA — funciones que vuelven (auditoría 2026-11-14, Agente 3):
 * ajustes de la prueba (modelo, creatividad y largo libres, máximo de
 * fragmentos, reglas), panel de fragmentos (buscador, Todos/Ninguno, contador,
 * prioridad, etiquetas, ver más) y respuesta con «Copiar», la pregunta, el
 * costo (créditos cobrados + costo del proveedor, sin inventar) y el pie.
 */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { LabSettings, LabTestResult, RetrievedFragment } from '@/lib/services/aiLabService';

jest.mock('@/lib/services/aiSettingsService', () => ({
  fetchCatalogoModelos: async () => ({ proveedores: [], modelos: [{ provider: 'openai', value: 'gpt-4o-mini', label: 'GPT-4o mini' }, { provider: 'openai', value: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' }] }),
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ formatDateTime: () => '14 nov 2026, 10:00' }) }));
const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

import { AjustesPrueba } from '../AjustesPrueba';
import { FragmentosPrueba } from '../FragmentosPrueba';
import { RespuestaPrueba } from '../RespuestaPrueba';

const AJUSTES: LabSettings = { model: '', temperature: 0.7, maxTokens: 500, maxFragments: 5, systemRules: 'Sé breve.', tone: 'professional', language: 'es', simulatedChannel: 'whatsapp' };
const FRAGMENTOS: RetrievedFragment[] = [
  { id: 'a', title: 'Envíos', content: 'Gratis desde 150.000', similarity: 1, tags: ['envio', 'logistica', 'costos', 'ciudades'], priority: 8 },
  { id: 'b', title: 'Horarios', content: 'Lunes a sábado de 8 a 6', similarity: 0.9, tags: [], priority: 5 },
];

test('ajustes: modelo de la configuración por defecto, reglas que se pueden restaurar, aviso de tono/idioma', async () => {
  const onChange = jest.fn();
  renderConIdioma(
    <AjustesPrueba ajustes={{ ...AJUSTES, systemRules: 'Otra cosa' }} onChange={onChange} canales={[{ valor: 'whatsapp', etiqueta: 'WhatsApp' }]} modeloConfig="gpt-5.6-luna" reglasConfig="Sé breve." />,
    { idioma: 'es' },
  );
  expect(await screen.findByText('El de la configuración (GPT-5.6 Luna)')).toBeTruthy();
  expect(screen.getByText(/no usa el tono ni el idioma/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Volver a las de la configuración/ }));
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ systemRules: 'Sé breve.' }));
  fireEvent.change(screen.getByLabelText('Máximo de fragmentos'), { target: { value: '50' } });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ maxFragments: 20 }));
});

test('fragmentos: resumen, búsqueda, contador, Todos/Ninguno, prioridad, etiquetas y ver más (en inglés)', () => {
  const onElegidos = jest.fn();
  renderConIdioma(
    <FragmentosPrueba fragmentos={FRAGMENTOS} elegidos={['a']} onElegidos={onElegidos} cargando={false} resumen={{ total: 3, active: 2, inactive: 1, avgPriority: 6.5 }} onActualizar={() => undefined} />,
    { idioma: 'en' },
  );
  expect(screen.getByText('1 of 2 selected')).toBeTruthy();
  expect(screen.getByText('Priority 8')).toBeTruthy();
  expect(screen.getByText('+1')).toBeTruthy();
  expect(screen.queryByText(/%/)).toBeNull();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search snippets…' }), { target: { value: 'sábado' } });
  expect(screen.queryByText('Envíos')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'All' }));
  expect(onElegidos).toHaveBeenLastCalledWith(['a', 'b']);
  fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
  expect(screen.getByRole('button', { name: 'Show less' })).toBeTruthy();
});

test('respuesta: pregunta, copiar, costo en créditos y del proveedor, pie', async () => {
  const writeText = jest.fn(async () => undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  const resultado: LabTestResult = {
    query: '¿Cuánto vale el envío?',
    fragments: [],
    response: 'Es gratis desde $150.000.',
    metrics: { retrievedFragments: 2, processingTimeMs: 1400, promptTokens: 400, completionTokens: 112, totalTokens: 512, creditsCharged: 1, providerCostUsd: 0.0004, model: 'gpt-5.6-luna' },
    timestamp: '2026-11-14T15:00:00Z',
    settings: AJUSTES,
  };
  renderConIdioma(<RespuestaPrueba resultado={resultado} />, { idioma: 'es' });
  expect(screen.getByText('¿Cuánto vale el envío?')).toBeTruthy();
  expect(screen.getByText('1 crédito')).toBeTruthy();
  expect(screen.getByText(/del proveedor/)).toBeTruthy();
  expect(screen.getByText(/gpt-5\.6-luna · creatividad 0,7 · 14 nov 2026/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Copiar respuesta' }));
  await screen.findByText('1 crédito');
  expect(writeText).toHaveBeenCalledWith('Es gratis desde $150.000.');
});

test('respuesta sin tarifa del modelo: no se inventa el costo del proveedor', () => {
  renderConIdioma(
    <RespuestaPrueba
      resultado={{
        query: 'q',
        fragments: [],
        response: 'r',
        metrics: { retrievedFragments: 0, processingTimeMs: 900, promptTokens: 1, completionTokens: 1, totalTokens: 2, creditsCharged: 1, providerCostUsd: null, model: 'gpt-4o-mini' },
        timestamp: '2026-11-14T15:00:00Z',
        settings: AJUSTES,
      }}
    />,
    { idioma: 'pt' },
  );
  expect(screen.getByText('Sem tarifa para este modelo')).toBeTruthy();
  expect(screen.getByText('1 crédito')).toBeTruthy();
});
