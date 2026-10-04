/** @jest-environment jsdom */
import { useState } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { ScheduleStep } from '../nuevo/ScheduleStep';
import { evaluarProgramacion, type ModoProgramacion } from '../nuevo/programacionCampanaLogica';
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ timezone: 'America/Bogota', getToday: () => '2026-10-01' }) }));
const texts = {
  es: ['Programar', 'Selecciona el día y la hora de inicio.', 'Horario legal siempre activo'],
  en: ['Schedule', 'Select the start date and time.', 'Legal contact hours are always enforced'],
  fr: ['Programmer', 'Sélectionnez la date et l’heure de début.', 'Les horaires légaux restent toujours actifs'],
  pt: ['Agendar', 'Selecione o dia e a hora de início.', 'Horário legal sempre ativo'],
};
function Formulario() {
  const [mode, onMode] = useState<ModoProgramacion>('now');
  const [local, onLocal] = useState('');
  const result = evaluarProgramacion(mode, local, 'America/Bogota', new Date());
  return <><ScheduleStep mode={mode} onMode={onMode} local={local} onLocal={onLocal} error={result.error} throttle={10} onThrottle={() => undefined} />
    <button disabled={!!result.error}>continuar prueba</button></>;
}
describe.each<IdiomaPrueba>(['es', 'en', 'fr', 'pt'])('programación en %s', idioma => {
  test('exige una fecha completa, muestra la zona y no permite quitar el horario legal', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    renderConIdioma(<Formulario />, { idioma });
    const avanzar = screen.getByRole('button', { name: 'continuar prueba' });
    expect((avanzar as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(texts[idioma][2])).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: texts[idioma][0] }));
    expect(screen.getByRole('alert').textContent).toContain(texts[idioma][1]);
    expect((avanzar as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.textContent).toContain('America/Bogota');
    expect(document.querySelector('input[type="datetime-local"]')).toBeNull();
    expect(spy.mock.calls.filter(c => /MISSING_MESSAGE|FORMATTING_ERROR|INVALID_MESSAGE/.test(String(c[0])))).toEqual([]);
    spy.mockRestore();
  });
});
