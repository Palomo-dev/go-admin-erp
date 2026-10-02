/** @jest-environment jsdom */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { EventModal } from '../EventModal';
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useOrgTimezone: () => ({ timezone: 'America/Bogota' }) }));
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/components/shared/RichTextEditor', () => ({ RichTextEditor: () => null }));
jest.mock('../RecurrenceSelector', () => ({ ...jest.requireActual('../RecurrenceSelector'), RecurrenceSelector: () => null }));
test('un guardado manual rechazado mantiene campos y diálogo; el reintento exitoso cierra una vez', async () => {
  const save = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true), close = jest.fn();
  renderConIdioma(<EventModal event={null} isOpen mode="create" defaultDate={new Date('2026-10-02T20:00:00Z')} onClose={close} onSave={save} />);
  fireEvent.change(screen.getByRole('textbox', { name: /Título/ }), { target: { value: 'Evento manual' } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(close).not.toHaveBeenCalled();
  expect((screen.getByRole('textbox', { name: /Título/ }) as HTMLInputElement).value).toBe('Evento manual');
  expect(save.mock.calls[0][0]).toMatchObject({ start_at: '2026-10-02T15:00:00.000-05:00', end_at: '2026-10-02T16:00:00.000-05:00' });
  fireEvent.click(screen.getByRole('button', { name: 'Crear' }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
});
