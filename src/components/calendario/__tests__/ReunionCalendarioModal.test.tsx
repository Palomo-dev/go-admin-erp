/** @jest-environment jsdom */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma, simularAncho, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { ReunionCalendarioModal } from '../ReunionCalendarioModal';
import { formatDateTimeInTz } from '@/lib/utils/dateDisplay';
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ timezone: 'America/Bogota', getToday: () => '2026-10-02', formatDateTime: (value: string) => jest.requireActual('@/lib/utils/dateDisplay').formatDateTimeInTz(value, 'America/Bogota') }) }));
const id = '11111111-1111-4111-8111-111111111111';
const event = { id, organization_id: 120, title: 'Título de reunión', description: 'Texto íntegro\nSegunda línea', location: 'Sala comercial', start_at: '2026-09-01T02:00:37Z', end_at: '2026-09-01T02:37:49Z', timezone: 'America/Bogota', assigned_to: null, customer_id: id, opportunity_id: null, event_type: 'meeting', status: 'confirmed', metadata: { source: 'crm', activity_id: id }, created_by: id };
const texts = {
  es: { edit: 'Editar reunión', save: 'Guardar cambios', title: 'Título', description: 'Descripción', done: 'Realizada', cancel: 'Cancelar', retry: 'Reintentar' },
  en: { edit: 'Edit meeting', save: 'Save changes', title: 'Title', description: 'Description', done: 'Done', cancel: 'Cancel', retry: 'Retry' },
  fr: { edit: 'Modifier la réunion', save: 'Enregistrer les modifications', title: 'Titre', description: 'Description', done: 'Effectuée', cancel: 'Annuler', retry: 'Réessayer' },
  pt: { edit: 'Editar reunião', save: 'Salvar alterações', title: 'Título', description: 'Descrição', done: 'Realizada', cancel: 'Cancelar', retry: 'Tentar novamente' },
};
const idioms: IdiomaPrueba[] = ['es', 'en', 'fr', 'pt'];
const response = (data: unknown, status = 200) => ({ ok: status === 200, status, json: async () => status === 200 ? { success: true, data } : { success: false, code: 'sin_permiso' } }) as Response;
let errors: jest.SpyInstance;
beforeEach(() => { errors = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => { const calls = errors.mock.calls; errors.mockRestore(); expect(calls).toEqual([]); simularAncho(1440); });
test.each(idioms.flatMap(idioma => [390, 1440].map(ancho => ({ idioma, ancho }))))('GET hidrata antes de editar, conserva estado realizado y campos completos en $idioma/$ancho', async ({ idioma, ancho }) => {
  simularAncho(ancho);
  const changed = jest.fn(async () => undefined), close = jest.fn();
  global.fetch = jest.fn().mockResolvedValueOnce(response({ event, can_edit: true, outcome: 'done' }))
    .mockResolvedValueOnce(response({ ...event, title: 'Modificado' }));
  renderConIdioma(<ReunionCalendarioModal id={id} mode="view" onClose={close} onChanged={changed} />, { idioma });
  await waitFor(() => expect(screen.getByText('Sala comercial')).toBeTruthy());
  expect(screen.getByText('Texto íntegro Segunda línea')).toBeTruthy();
  expect(screen.getByText(`${formatDateTimeInTz(event.start_at, 'America/Bogota')} – ${formatDateTimeInTz(event.end_at, 'America/Bogota')}`)).toBeTruthy();
  expect(screen.queryByRole('button', { name: texts[idioma].cancel })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: texts[idioma].edit }));
  const dialog = within(screen.getByRole('dialog'));
  expect((dialog.getByRole('textbox', { name: new RegExp(texts[idioma].description) }) as HTMLTextAreaElement).value).toBe(event.description);
  fireEvent.change(dialog.getByRole('textbox', { name: new RegExp(texts[idioma].title) }), { target: { value: 'Modificado' } });
  fireEvent.click(dialog.getByRole('button', { name: texts[idioma].save }));
  await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
  expect((fetch as jest.Mock).mock.calls[1][1]).toMatchObject({ method: 'PATCH', body: '{"title":"Modificado"}' });
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole('heading', { name: 'Modificado' })).toBeTruthy();
});
test('lector sin permiso no ofrece mutaciones ni montará formulario aunque solicitó editar', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce(response({ event, can_edit: false, outcome: 'scheduled' }));
  renderConIdioma(<ReunionCalendarioModal id={id} mode="edit" onClose={jest.fn()} onChanged={jest.fn()} />);
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('No tienes permiso'));
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Editar reunión' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Realizada' })).toBeNull();
});
test('cancelación fallida mantiene el diálogo y el estado; reintento usa únicamente PATCH canónico', async () => {
  const close = jest.fn(), changed = jest.fn();
  global.fetch = jest.fn().mockResolvedValueOnce(response({ event, can_edit: true, outcome: 'scheduled' }))
    .mockResolvedValueOnce(response(null, 403)).mockResolvedValueOnce(response({ ...event, status: 'cancelled' }));
  renderConIdioma(<ReunionCalendarioModal id={id} mode="view" onClose={close} onChanged={changed} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('No tienes permiso'));
  expect(screen.getByText('Programada')).toBeTruthy(); expect(close).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  await waitFor(() => expect(screen.getByText('Cancelada')).toBeTruthy());
  expect(changed).toHaveBeenCalledTimes(1);
  expect((fetch as jest.Mock).mock.calls.slice(1).map(call => call[1].body)).toEqual(['{"status":"canceled"}', '{"status":"canceled"}']);
});
test('409 de historial bloquea toda edición, muestra el resumen ya recibido y permite recargar', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ success: false, code: 'historial_incoherente' }) })
    .mockResolvedValueOnce(response({ event, can_edit: true, outcome: 'scheduled' }));
  renderConIdioma(<ReunionCalendarioModal id={id} mode="edit" initialEvent={{ ...event, source_type: 'calendar_event', source_id: id } as never} onClose={jest.fn()} onChanged={jest.fn()} />);
  await screen.findByRole('alert');
  expect(screen.getByRole('heading', { name: 'Título de reunión' })).toBeTruthy(); expect(screen.queryByRole('textbox')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await waitFor(() => expect(screen.getByRole('textbox', { name: /Título/ })).toBeTruthy());
  expect((fetch as jest.Mock).mock.calls.every(call => call[1].method === 'GET')).toBe(true);
});
