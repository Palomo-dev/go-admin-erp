/** @jest-environment jsdom */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { toast } from '@/components/ui/use-toast';
import { MeetingEntry } from '../entries/MeetingEntry';
import type { TimelineEntry } from '@/lib/services/crm/timelineService';
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ timezone: jest.requireActual('@/lib/utils/dateCore').DEFAULT_TIMEZONE }) }));
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
