/** @jest-environment jsdom */
import { fireEvent, screen, within } from '@testing-library/react';
import { renderConIdioma as render } from '@/test-utils/renderConIdioma';
import { ControlEspaciado, EditorFondo, cambioMargen, textoHeredado } from '../EditorCascaron';
import { anchoEfectivo, aplicarAtajo, atajoActual, cambioAncho, cambioEspacio } from '../espacioUnico';
import { espacioSeccion } from '@/lib/website/espacioSeccion';

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() }, getProjectRef: jest.fn(() => 'test') }));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120 } }), getOrganizationId: () => 120, ORGANIZATION_CHANGED_EVENT: 'org-cambio' }));

const ET = { compacto: 'Compacto', normal: 'Normal', amplio: 'Amplio' };

describe('Cascarón › Fondo y espaciado: valor real visible, sin guardar nada', () => {
  test('placeholders con el relleno y el margen heredados', () => {
    const onCambiar = jest.fn();
    render(<ControlEspaciado etiquetasAtajo={ET} valor={undefined} onCambiar={onCambiar} espacio={espacioSeccion({ margin_top: 'sm' }, { tipo: 'faq' })} />);
    const sup = (screen.getByRole('group', { name: 'Relleno superior' })).querySelector('input')! as HTMLInputElement;
    expect(sup.value).toBe('');
    expect(sup.placeholder).toBe('64 (predeterminado)');
    expect(((within(screen.getByRole('group', { name: 'Relleno superior' })).getByRole('group', { name: 'Celular' })).querySelector('input') as HTMLInputElement).placeholder).toBe('48 (predeterminado)');
    // El atajo que coincide con lo que se ve hoy queda marcado (normal = 48/64).
    expect(screen.getByRole('radio', { name: 'Normal' }).getAttribute('aria-checked')).toBe('true');
    const margen = screen.getByRole('group', { name: 'Margen superior' });
    expect(((within(margen).getByRole('group', { name: 'Computador' })).querySelector('input')! as HTMLInputElement).placeholder).toBe('16 (actual)');
    expect(((within(margen).getByRole('group', { name: 'Celular' })).querySelector('input')! as HTMLInputElement).placeholder).toBe('16 (actual)');
    expect(onCambiar).not.toHaveBeenCalled();
  });
  test('editar el margen de computador fija el de celular con lo que se ve hoy', () => {
    const onCambiar = jest.fn();
    render(<ControlEspaciado etiquetasAtajo={ET} valor={{ padding_top: 0 }} onCambiar={onCambiar} espacio={espacioSeccion({ margin_top: 'sm' }, { tipo: 'hero' })} />);
    const comp = (within(screen.getByRole('group', { name: 'Margen superior' })).getByRole('group', { name: 'Computador' })).querySelector('input')!;
    fireEvent.change(comp, { target: { value: '0' } });
    expect(onCambiar).toHaveBeenLastCalledWith({ padding_top: 0, margin_top: 0, margin_top_mobile: 16 });
  });
  test('vaciar un dispositivo lo quita', () => {
    expect(cambioMargen({ margin_top: 4, margin_top_mobile: 8 }, 'top', 'celular', undefined, undefined)).toEqual({ margin_top: 4 });
    expect(textoHeredado({ celular: 24, computador: 24, propio: false })).toBe('24 (predeterminado)');
  });
  test('el atajo escribe los px de la escala (sin borrar lo de antes)', () => {
    const onCambiar = jest.fn();
    render(<ControlEspaciado etiquetasAtajo={ET} valor={{ image_fit: 'cover' }} onCambiar={onCambiar} espacio={espacioSeccion({}, { tipo: 'faq' })} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Compacto' }));
    expect(onCambiar).toHaveBeenLastCalledWith({ image_fit: 'cover', padding_top: 24, padding_top_mobile: 16, padding_bottom: 24, padding_bottom_mobile: 16 });
  });
  test('el relleno por dispositivo se refleja en el valor real', () => {
    const e = espacioSeccion({ section_background: { padding_top: 30, padding_top_mobile: 10 } }, { tipo: 'faq' });
    expect(e.rellenoArriba).toMatchObject({ computador: 30, celular: 10 });
    const sinMovil = espacioSeccion({ section_background: { padding_top: 30 } }, { tipo: 'faq' });
    expect(sinMovil.rellenoArriba).toMatchObject({ computador: 30, celular: 30 });
  });
  test('EditorFondo ya no repite relleno, margen ni ancho', () => {
    render(<EditorFondo valor={undefined} onCambiar={jest.fn()} />);
    expect(screen.queryByRole('group', { name: 'Relleno superior' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Margen superior' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Ancho' })).toBeNull();
  });
});

describe('Un solo Ancho (Estilo › Ancho + «Ancho completo» de la portada)', () => {
  test('lee lo que se ve hoy', () => {
    expect(anchoEfectivo({}, undefined, 'hero', 'slider')).toBe('completo');
    expect(anchoEfectivo({ full_width: false }, undefined, 'hero', 'slider')).toBe('contenedor');
    expect(anchoEfectivo({}, undefined, 'faq')).toBe('contenedor');
    expect(anchoEfectivo({}, 'completo', 'faq')).toBe('completo');
    expect(anchoEfectivo({ full_bleed: false }, 'completo', 'faq')).toBe('contenedor');
    expect(anchoEfectivo({ section_background: { width: 'full' } }, undefined, 'faq')).toBe('completo');
  });
  test('elegir lo que ya se ve no guarda nada', () => {
    const c = { full_width: false };
    const est = { v: 1 } as never;
    const r = cambioAncho(c, est, 'contenedor', 'hero', 'slider');
    expect(r.contenido).toBe(c);
    expect(r.estilo).toBe(est);
  });
  test('completo en la portada enciende full_width y Estilo › Ancho', () => {
    const r = cambioAncho({ full_width: false, title: 'x' }, { v: 1 } as never, 'completo', 'hero', 'slider');
    expect(r.contenido).toEqual({ full_width: true, title: 'x' });
    expect(r.estilo).toMatchObject({ ancho: 'completo' });
  });
  test('claves de antes que tapan el estilo se ajustan, no se borran', () => {
    const r = cambioAncho({ full_bleed: true, container_width: 'full' }, { v: 1 } as never, 'contenedor', 'faq');
    expect(r.contenido).toEqual({ full_bleed: false, container_width: 'lg' });
  });
});

describe('QA unificación: atajo con el hueco del header y celular igual a computador', () => {
  test('primera sección: el atajo no escribe relleno superior (como antes con la escala)', () => {
    const e = espacioSeccion({}, { tipo: 'faq', primera: true });
    expect(e.arribaFijo).toBe(true);
    expect(aplicarAtajo({}, 'amplio', e)).toEqual({ padding_bottom: 96, padding_bottom_mobile: 64 });
    expect(aplicarAtajo({}, 'amplio', espacioSeccion({}, { tipo: 'faq' }))).toMatchObject({ padding_top: 96, padding_top_mobile: 64 });
    expect(atajoActual(e)).toBe('normal');
  });
  test('celular igual a computador no se guarda aparte', () => {
    expect(cambioEspacio({}, 'margin', 'top', 'computador', 16, { celular: 16, computador: 16, propio: true })).toEqual({ margin_top: 16 });
    expect(cambioEspacio({ padding_top: 20 }, 'padding', 'top', 'celular', 20, undefined)).toEqual({ padding_top: 20 });
    expect(cambioEspacio({}, 'padding', 'top', 'computador', 30, { celular: 48, computador: 64, propio: false })).toEqual({ padding_top: 30, padding_top_mobile: 48 });
  });
});
