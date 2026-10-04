/**
 * @jest-environment jsdom
 *
 * Kit · render de los botones del POS (Testing Library, POS-PLAN D9): el
 * `BotonImporte` en sus estados y el `ViewToggle` que alterna en el celular.
 */
import { fireEvent, screen } from '@testing-library/react';
import { BotonImporte } from '../BotonImporte';
import { ViewToggle } from '../ViewToggle';
import { KbdButton } from '../KbdButton';
import { FormField } from '../FormField';
import { FormSection } from '../FormSection';
import { StatCard } from '../StatCard';
import { clasesBoton } from '../botonClases';
import { renderConIdioma } from '@/test-utils/renderConIdioma';

describe('BotonImporte (render)', () => {
  test('listo: etiqueta, importe y atajo anunciado; el clic llega', () => {
    const onClick = jest.fn();
    renderConIdioma(<BotonImporte etiqueta="Cobrar" importe="$ 12.000" atajo="F4" onClick={onClick} />);
    const boton = screen.getByRole('button', { name: /Cobrar/ });
    expect(boton.getAttribute('aria-keyshortcuts')).toBe('F4');
    expect(boton.textContent).toContain('$ 12.000');
    fireEvent.click(boton);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('falta: deshabilitado y con el motivo visible y asociado', () => {
    renderConIdioma(<BotonImporte etiqueta="Completar venta" estado="falta" motivo="Falta $ 2.000" />);
    const boton = screen.getByRole('button', { name: /Completar venta/ }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    const motivo = screen.getByText('Falta $ 2.000');
    expect(boton.getAttribute('aria-describedby')).toBe(motivo.id);
  });

  test('procesando: ocupado con el texto del kit en el idioma activo', () => {
    renderConIdioma(<BotonImporte etiqueta="Completar venta" estado="procesando" />, { idioma: 'en' });
    const boton = screen.getByRole('button');
    expect(boton.getAttribute('aria-busy')).toBe('true');
    expect((boton as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('ViewToggle (render)', () => {
  test('el botón del celular propone la otra vista y la elige', () => {
    const onCambio = jest.fn();
    renderConIdioma(<ViewToggle valor="tarjetas" onValorChange={onCambio} />);
    const alternar = screen.getByRole('button', { name: /lista/i });
    fireEvent.click(alternar);
    expect(onCambio).toHaveBeenCalledWith('lista');
  });
});

describe('escalas opt-in de Figma', () => {
  test('mantiene la escala anterior cuando no se elige un patrón', () => {
    expect(clasesBoton({ tamano: 'sm' })).toContain('text-[13px]');
    expect(clasesBoton({ tamano: 'lg' })).toContain('text-base');
    renderConIdioma(<FormField etiqueta="Nombre"><input /></FormField>);
    expect(screen.getByText('Nombre').className).toContain('text-sm');
  });

  test('distingue Button normal y botón con atajo según sus muestras de Figma', () => {
    expect(clasesBoton({ patron: 'button', tamano: 'sm' })).toContain('text-xs leading-4');
    expect(clasesBoton({ patron: 'button', tamano: 'lg' })).toContain('text-sm leading-5');
    expect(clasesBoton({ patron: 'kbd', tamano: 'sm' })).toContain('text-sm leading-5');
    expect(clasesBoton({ patron: 'kbd', tamano: 'lg' })).toContain('text-base leading-[22px]');
  });

  test('el botón regular conserva el bloqueo y anuncio de carga del componente compartido', () => {
    const onClick = jest.fn();
    renderConIdioma(<KbdButton patron="button" cargando onClick={onClick}>Guardar</KbdButton>);
    const boton = screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement;
    expect(boton.getAttribute('aria-busy')).toBe('true');
    expect(boton.disabled).toBe(true);
    expect(boton.getAttribute('aria-keyshortcuts')).toBeNull();
    fireEvent.click(boton);
    expect(onClick).not.toHaveBeenCalled();
  });

  test('la etiqueta compacta conserva el enlace del campo, ayuda y error accesibles', () => {
    renderConIdioma(<FormField etiqueta="Nombre" tamanoEtiqueta="sm" obligatorio ayuda="Ayuda" error="Completa el nombre"><input /></FormField>);
    const campo = screen.getByLabelText(/Nombre/) as HTMLInputElement;
    const etiqueta = screen.getByText('Nombre');
    expect(etiqueta.className).toContain('text-xs leading-4');
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(campo.getAttribute('aria-required')).toBe('true');
    expect(campo.getAttribute('aria-describedby')).toContain(screen.getByRole('alert').id);
    expect(campo.getAttribute('aria-describedby')).toContain(screen.getByText('Ayuda').id);
  });

  test('la carga compacta conserva su anuncio y al completar recupera la cifra', () => {
    const vista = renderConIdioma(<StatCard etiqueta="Intentos" valor="18" cargando varianteCarga="compacta" />);
    expect(screen.getByText(/Intentos/).closest('div')?.className).toContain('h-[72px]');
    expect(screen.queryByText('18')).toBeNull();
    vista.rerender(<StatCard etiqueta="Intentos" valor="18" varianteCarga="compacta" />);
    expect(screen.getByText('18').className).toContain('text-[28px]');
    expect(screen.getByText('18').closest('div')?.parentElement?.className ?? '').not.toContain('h-[72px]');
  });

  test('la sección compacta conserva la acción y puede plegar sin perder sus campos', () => {
    renderConIdioma(<FormSection titulo="Resumen" densidad="compacta" colapsable><input aria-label="Nota" defaultValue="texto" /></FormSection>);
    const cabecera = screen.getByRole('button', { name: 'Resumen' });
    const campo = screen.getByRole('textbox', { name: 'Nota' });
    expect(screen.getByRole('heading', { name: 'Resumen' }).className).toContain('leading-[22px]');
    fireEvent.click(cabecera);
    expect(cabecera.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(cabecera);
    expect((campo as HTMLInputElement).value).toBe('texto');
  });
});
