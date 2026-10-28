/** @jest-environment jsdom */
import { fireEvent, screen, within } from '@testing-library/react';
import { renderConIdioma as render } from '@/test-utils/renderConIdioma';
import { EditorFondo, cambioMargen, textoHeredado } from '../EditorCascaron';
import { espacioSeccion } from '@/lib/website/espacioSeccion';

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() }, getProjectRef: jest.fn(() => 'test') }));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120 } }), getOrganizationId: () => 120, ORGANIZATION_CHANGED_EVENT: 'org-cambio' }));

describe('Cascarón › Fondo y espaciado: valor real visible, sin guardar nada', () => {
  test('placeholders con el relleno y el margen heredados', () => {
    const onCambiar = jest.fn();
    render(<EditorFondo valor={undefined} onCambiar={onCambiar} espacio={espacioSeccion({ margin_top: 'sm' }, { tipo: 'faq' })} />);
    const sup = (screen.getByRole('group', { name: 'Relleno superior' })).querySelector('input')! as HTMLInputElement;
    expect(sup.value).toBe('');
    expect(sup.placeholder).toBe('48 celular · 64 computador (predeterminado)');
    const margen = screen.getByRole('group', { name: 'Margen superior' });
    expect(((within(margen).getByRole('group', { name: 'Computador' })).querySelector('input')! as HTMLInputElement).placeholder).toBe('16 (actual)');
    expect(((within(margen).getByRole('group', { name: 'Celular' })).querySelector('input')! as HTMLInputElement).placeholder).toBe('16 (actual)');
    expect(onCambiar).not.toHaveBeenCalled();
  });
  test('editar el margen de computador fija el de celular con lo que se ve hoy', () => {
    const onCambiar = jest.fn();
    render(<EditorFondo valor={{ padding_top: 0 }} onCambiar={onCambiar} espacio={espacioSeccion({ margin_top: 'sm' }, { tipo: 'hero' })} />);
    const comp = (within(screen.getByRole('group', { name: 'Margen superior' })).getByRole('group', { name: 'Computador' })).querySelector('input')!;
    fireEvent.change(comp, { target: { value: '0' } });
    expect(onCambiar).toHaveBeenLastCalledWith({ padding_top: 0, margin_top: 0, margin_top_mobile: 16 });
  });
  test('vaciar un dispositivo lo quita', () => {
    expect(cambioMargen({ margin_top: 4, margin_top_mobile: 8 }, 'top', 'celular', undefined, undefined)).toEqual({ margin_top: 4 });
    expect(textoHeredado({ celular: 24, computador: 24, propio: false })).toBe('24 (predeterminado)');
  });
});
