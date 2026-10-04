/** @jest-environment jsdom */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma, simularAncho, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { toast } from '@/components/ui/use-toast';
import { MeetingEntry } from '../entries/MeetingEntry';
import type { TimelineEntry } from '@/lib/services/crm/timelineService';
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ timezone: jest.requireActual('@/lib/utils/dateCore').DEFAULT_TIMEZONE, getToday: () => '2026-10-02' }) }));
jest.mock('@/components/ui/use-toast', () => ({ toast: jest.fn() }));
const id = '11111111-1111-4111-8111-111111111111';
const entry: Extract<TimelineEntry, { kind: 'meeting' }> = { kind: 'meeting', id, occurred_at: '2026-09-01T02:00:00Z', user: null,
  activity: { id, activity_type: 'meeting', channel: 'meeting', duration_seconds: null,
    notes: 'Reunión de prueba', outcome: 'scheduled', metadata: { event_id: id } }, event: null,
};
const idiomas: IdiomaPrueba[] = ['es', 'en', 'fr', 'pt'];
let errores: jest.SpyInstance;
beforeEach(() => { jest.clearAllMocks(); errores = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => { const llamadas = errores.mock.calls; errores.mockRestore(); expect(llamadas).toEqual([]); });
test.each(idiomas)('reunión futura no permite completar y conserva cancelación en %s', idioma => {
  renderConIdioma(<MeetingEntry entry={{ ...entry, occurred_at: '2099-09-01T02:00:00Z' }} />, { idioma });
  const buttons = screen.getAllByRole('button');
  expect((buttons[0] as HTMLButtonElement).disabled).toBe(true);
  expect((buttons[1] as HTMLButtonElement).disabled).toBe(false);
  expect(buttons[0].getAttribute('title')).toBeTruthy();
});
test.each(idiomas)('estado cambia solo tras éxito del servidor en %s', async idioma => {
  const changed = jest.fn();
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, data: {} }) } as Response));
  renderConIdioma(<MeetingEntry entry={entry} onAction={changed} />, { idioma });
  fireEvent.click(screen.getAllByRole('button')[0]);
  await waitFor(() => expect(changed).toHaveBeenCalledWith('changed', entry));
  expect(fetch).toHaveBeenCalledWith(`/api/crm/meetings/${id}`, expect.objectContaining({ method: 'PATCH', body: '{"status":"done"}' }));
  expect(screen.queryByRole('button')).toBeNull();
});
test('403 no inventa éxito y ofrece diagnóstico traducido', async () => {
  const changed = jest.fn();
  global.fetch = jest.fn(async () => ({ ok: false, status: 403, json: async () => ({ success: false, code: 'sin_permiso' }) } as Response));
  renderConIdioma(<MeetingEntry entry={entry} onAction={changed} />);
  fireEvent.click(screen.getAllByRole('button')[0]);
  await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', description: 'No tienes permiso para esta acción.' })));
  expect(changed).not.toHaveBeenCalled();
  expect(screen.getAllByRole('button')).toHaveLength(2);
  expect(fetch).toHaveBeenCalledTimes(1);
});

const textos = {
  es: { editar: 'Editar reunión', guardar: 'Guardar cambios', titulo: 'Título', descripcion: 'Descripción', hora: 'Hora' },
  en: { editar: 'Edit meeting', guardar: 'Save changes', titulo: 'Title', descripcion: 'Description', hora: 'Time' },
  fr: { editar: 'Modifier la réunion', guardar: 'Enregistrer les modifications', titulo: 'Titre', descripcion: 'Description', hora: 'Heure' },
  pt: { editar: 'Editar reunião', guardar: 'Salvar alterações', titulo: 'Título', descripcion: 'Descrição', hora: 'Hora' },
};
const hidratada: typeof entry = { ...entry, activity: { ...entry.activity, notes: 'Título antiguo\nUbicación antigua\nNo reconstruir esta descripción' },
  event: { id, title: 'Título del calendario', description: 'Primera línea\nSegunda línea', location: 'https://example.com',
    start_at: '2026-09-01T02:00:37Z', end_at: '2026-09-01T02:37:49Z', status: 'confirmed' },
};
test.each(idiomas.flatMap(idioma => [390, 1440].map(ancho => ({ idioma, ancho }))))('edita datos canónicos sin truncar horario en $idioma a $ancho px', async ({ idioma, ancho }) => {
  simularAncho(ancho);
  const changed = jest.fn();
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, data: { ...hidratada.event, title: 'Título modificado' } }) } as Response));
  renderConIdioma(<MeetingEntry entry={hidratada} onAction={changed} />, { idioma });
  fireEvent.click(screen.getByRole('button', { name: textos[idioma].editar }));
  const dialog = screen.getByRole('dialog');
  expect((within(dialog).getByRole('textbox', { name: new RegExp(textos[idioma].descripcion) }) as HTMLTextAreaElement).value).toBe('Primera línea\nSegunda línea');
  expect(within(dialog).getAllByRole('combobox', { name: new RegExp('^' + textos[idioma].hora + ':') })[0].textContent).toMatch(/9:00|21:00/);
  fireEvent.change(within(dialog).getByRole('textbox', { name: new RegExp(textos[idioma].titulo) }), { target: { value: 'Título modificado' } });
  fireEvent.click(within(dialog).getByRole('button', { name: textos[idioma].guardar }));
  await waitFor(() => expect(changed).toHaveBeenCalledWith('changed', hidratada));
  expect(fetch).toHaveBeenCalledWith(`/api/crm/meetings/${id}`, expect.objectContaining({ method: 'PATCH', body: '{"title":"Título modificado"}' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByText('Título modificado')).toBeTruthy();
  simularAncho(1440);
});
test('error al editar mantiene el formulario y permite reintentar sin cambiar el historial', async () => {
  const changed = jest.fn();
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ success: false, code: 'sin_permiso' }) })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, data: { ...hidratada.event, description: 'Nueva descripción' } }) });
  renderConIdioma(<MeetingEntry entry={hidratada} onAction={changed} />);
  fireEvent.click(screen.getByRole('button', { name: textos.es.editar }));
  fireEvent.change(screen.getByRole('textbox', { name: /Descripción/ }), { target: { value: 'Nueva descripción' } });
  fireEvent.click(screen.getByRole('button', { name: textos.es.guardar }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('No tienes permiso para esta acción.'));
  expect(changed).not.toHaveBeenCalled();
  expect((screen.getByRole('textbox', { name: /Descripción/ }) as HTMLTextAreaElement).value).toBe('Nueva descripción');
  fireEvent.click(screen.getByRole('button', { name: textos.es.guardar }));
  await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect((fetch as jest.Mock).mock.calls.map(c => c[1].body)).toEqual(['{"description":"Nueva descripción"}', '{"description":"Nueva descripción"}']);
});

test('un rango inválido no se envía y corregirlo conserva el inicio exacto del calendario', async () => {
  const changed = jest.fn();
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, data: { ...hidratada.event, end_at: '2026-09-01T02:45:00Z' } }) } as Response));
  renderConIdioma(<MeetingEntry entry={hidratada} onAction={changed} />);
  fireEvent.click(screen.getByRole('button', { name: textos.es.editar }));
  const horas = () => within(screen.getByRole('dialog')).getAllByRole('combobox', { name: /^Hora:/ });
  fireEvent.click(horas()[1]);
  fireEvent.click(screen.getByRole('option', { name: /^9:00\s*p|^21:00/ }));
  fireEvent.click(screen.getByRole('button', { name: textos.es.guardar }));
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(horas()[1]);
  fireEvent.click(screen.getByRole('option', { name: /^9:45\s*p|^21:45/ }));
  fireEvent.click(screen.getByRole('button', { name: textos.es.guardar }));
  await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
  const cuerpo = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
  expect(Object.keys(cuerpo)).toEqual(['end_at']);
  expect(Date.parse(cuerpo.end_at)).toBe(Date.parse('2026-09-01T02:45:00Z'));
  expect(screen.queryByRole('dialog')).toBeNull();
});
