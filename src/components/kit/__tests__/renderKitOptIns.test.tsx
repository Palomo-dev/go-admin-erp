/** @jest-environment jsdom */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { useCabeceraMovil } from '@/components/shell/header/cabeceraMovil';
import { AvatarIniciales } from '../AvatarIniciales';
import { BadgeTono } from '../BadgeTono';
import { StatusBadge } from '../StatusBadge';
import { StatCard } from '../StatCard';
import { Pagination } from '../Pagination';
import { PageHeader } from '../PageHeader';
import { FormSection } from '../FormSection';
import { EmptyState } from '../EmptyState';

jest.mock('@/components/shell/header/cabeceraMovil', () => ({ useCabeceraMovil: jest.fn() }));

describe('variantes compartidas de Figma sin cambiar defaults', () => {
  test('categorías y estados usan la receta nativa con texto12 sin mezclar su semántica', () => {
    renderConIdioma(<>
      <BadgeTono tono="advertencia" tamano="sm">Precio</BadgeTono>
      <StatusBadge estado="paid" etiqueta="Pagada" tipografia="figma" />
      <StatusBadge estado="paid" etiqueta="Original" />
    </>);
    const categoria = screen.getByText('Precio').parentElement!;
    expect(categoria.className).toContain('bg-warning-subtle');
    expect(categoria.className).toContain('h-[22px]');
    expect(categoria.className).toContain('text-xs');
    expect(categoria.className).not.toContain('text-[11px]');
    expect(screen.getByText('Pagada').parentElement!.className).toContain('bg-success-subtle');
    expect(screen.getByText('Original').parentElement!.className).toContain('text-[11px]');
  });

  test('el KPI móvil conserva cifra, detalle y acción; el default mantiene Display28', () => {
    const onClick = jest.fn();
    const vista = renderConIdioma(<StatCard etiqueta="Llamadas" valor="312" tamano="sm" onClick={onClick} />);
    const tarjeta = screen.getByRole('button', { name: 'Llamadas 312' });
    expect(tarjeta.className).toContain('gap-0.5 p-3');
    expect(screen.getByText('312').className).toContain('text-base leading-[22px]');
    fireEvent.click(tarjeta);
    expect(onClick).toHaveBeenCalledTimes(1);
    vista.rerender(<StatCard etiqueta="Llamadas" valor="312" detalle="Detalle existente" />);
    expect(screen.getByText('312').className).toContain('text-[28px]');
    expect(screen.getByText('Detalle existente')).not.toBeNull();
  });

  test('los avatares pequeños conservan fallback a iniciales y el tono anterior', () => {
    const vista = renderConIdioma(<AvatarIniciales nombre="Ana Pérez" src="/foto-fixture.png" tamano="xs" tono="marcaSuave" />);
    const imagen = vista.container.querySelector('img')!;
    expect(imagen.parentElement!.className).toContain('size-7');
    expect(imagen.parentElement!.className).toContain('bg-brand-tint');
    fireEvent.error(imagen);
    expect(screen.getByText('AP').className).toContain('text-brand-deep');
    vista.rerender(<AvatarIniciales nombre="Ana Pérez" tono="neutro" />);
    expect(screen.getByText('AP').className).toContain('bg-subtle');
    vista.rerender(<AvatarIniciales nombre="Ana Pérez" />);
    expect(screen.getByText('AP').className).toContain('size-8');
    expect(screen.getByText('AP').className).toContain('bg-brand-action');
  });

  test('la paginación compacta de escritorio conserva rango, navegación y carga', () => {
    const onPaginaChange = jest.fn();
    const props = { pagina: 2, tamano: 10, total: 25, onPaginaChange, onTamanoChange: jest.fn() };
    const vista = renderConIdioma(<Pagination {...props} layout="full" densidad="compacta" />);
    expect(screen.getByRole('combobox').className).toContain('h-8');
    expect(vista.container.querySelector('[aria-live="polite"]')!.className).toContain('text-[13px]');
    expect(vista.container.textContent).toContain('11');
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    expect(onPaginaChange).toHaveBeenLastCalledWith(3);
    vista.rerender(<Pagination {...props} layout="full" densidad="compacta" cargando />);
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    expect(onPaginaChange).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('combobox') as HTMLButtonElement).disabled).toBe(true);
    vista.rerender(<Pagination {...props} layout="full" />);
    expect(screen.getByRole('combobox').className).toContain('h-10');
    expect(vista.container.querySelector('[aria-live="polite"]')!.className).toContain('text-sm');
  });

  test('la densidad del escritorio no modifica la composición móvil compacta', () => {
    const props = { pagina: 2, tamano: 10, total: 25, onPaginaChange: jest.fn(), layout: 'compact' as const };
    const vista = renderConIdioma(<Pagination {...props} />);
    const contenido = vista.container.innerHTML;
    vista.rerender(<Pagination {...props} densidad="compacta" />);
    expect(vista.container.innerHTML).toBe(contenido);
  });

  test('PageHeader publica el mismo callback de salida guardada al shell móvil', () => {
    const onVolver = jest.fn();
    renderConIdioma(<PageHeader titulo="Constructor" variante="form" volverA="/fixture" onVolver={onVolver} />);
    expect(jest.mocked(useCabeceraMovil)).toHaveBeenLastCalledWith(expect.objectContaining({ volverA: '/fixture', onVolver }));
    fireEvent.click(screen.getByRole('link', { name: /volver/i }));
    expect(onVolver).toHaveBeenCalledTimes(1);
  });

  test('FormSection móvil conserva un único contenido y el nombre accesible con tarjeta de escritorio', () => {
    renderConIdioma(<FormSection id="grabacion" titulo="Grabación" densidad="compacta" formatoMovil="contenido"><audio data-testid="audio-fixture" /></FormSection>);
    const seccion = screen.getByRole('region', { name: 'Grabación' });
    expect(seccion.getAttribute('aria-labelledby')).toBe('grabacion-titulo');
    expect(seccion.className).toContain('bg-transparent p-0');
    expect(seccion.className).toContain('lg:border lg:bg-surface lg:p-4');
    expect(seccion.firstElementChild!.className).toContain('hidden lg:flex');
    expect(screen.getAllByTestId('audio-fixture')).toHaveLength(1);
  });

  test('una cabecera plegada sólo en escritorio no deja el contenido móvil inaccesible', () => {
    renderConIdioma(<FormSection titulo="Grabación" formatoMovil="contenido" colapsable abiertaPorDefecto={false}><input aria-label="Nota móvil" defaultValue="contenido" /></FormSection>);
    const cuerpo = screen.getByRole('textbox', { name: 'Nota móvil' }).parentElement!;
    expect(cuerpo.className).toContain('grid');
    expect(cuerpo.className).toContain('lg:hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Grabación' }));
    expect(cuerpo.className).not.toContain('lg:hidden');
    expect((screen.getByRole('textbox', { name: 'Nota móvil' }) as HTMLInputElement).value).toBe('contenido');
  });

  test('Reintentar primario mantiene la acción y conserva defaults y acción secundaria', () => {
    const onReintentar = jest.fn();
    const vista = renderConIdioma(<EmptyState variante="error" onReintentar={onReintentar} />);
    expect(screen.getByRole('button', { name: 'Reintentar' }).className).toContain('border-line-strong');
    vista.rerender(<EmptyState variante="error" accionPrimaria onReintentar={onReintentar} accionSecundaria={{ etiqueta: 'Volver', onClick: jest.fn() }} />);
    const retry = screen.getByRole('button', { name: 'Reintentar' });
    expect(retry.className).toContain('bg-brand-action');
    expect(screen.getByRole('button', { name: 'Volver' }).className).toContain('border-line-strong');
    fireEvent.click(retry);
    expect(onReintentar).toHaveBeenCalledTimes(1);
    vista.rerender(<EmptyState accion={{ etiqueta: 'Crear', onClick: jest.fn() }} />);
    expect(screen.getByRole('button', { name: 'Crear' }).className).toContain('bg-brand-action');
  });
});
