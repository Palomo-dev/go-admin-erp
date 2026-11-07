/**
 * @jest-environment jsdom
 *
 * Panel «Encabezado» con la píldora (P1), la vista «Botón principal» (P2) y el menú inferior
 * flotante (P4): qué se ve sin claves y qué sale por `onCambiar`. Datos ficticios (org 120).
 */
import { fireEvent, screen, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { shellPorDefecto } from '@/lib/website/v2/plantillaCompleta';
import { InspectorEncabezado } from '../inspector/InspectorEncabezado';
import { MenuInferiorPanel } from '../inspector/MenuInferiorPanel';

jest.mock('../inspector/useDestinosTienda', () => ({ useDestinosTienda: () => null }));
jest.mock('@/lib/hooks/useOrganization', () => ({
  useOrganization: () => ({ organization: { id: 120 } }),
  getOrganizationId: () => 120,
  ORGANIZATION_CHANGED_EVENT: 'org-cambio',
}));

const SLUGS = ['home', 'menu', 'reservas-mesa', 'contacto'];
const CAFE = shellPorDefecto('cafe_especialidad', 'restaurante', SLUGS);
const COLORES = { fondo: '#F3ECDF', texto: '#2E3328', acento: '#2E3328' };

function encabezado(ajustes: Record<string, unknown> = {}, extra: Partial<React.ComponentProps<typeof InspectorEncabezado>> = {}) {
  const onCambiar = jest.fn();
  renderConIdioma(
    <InspectorEncabezado
      ajustes={{ header_style: 'pill', header_menu_id: 'm1', ...ajustes }}
      onCambiar={onCambiar}
      menus={[{ id: 'm1', name: 'Principal', enlaces: 4 }]}
      paginas={SLUGS.map((s) => ({ slug: s, titulo: s }))}
      porDefecto={CAFE}
      enBorrador
      dispositivo="escritorio"
      coloresTema={COLORES}
      onEditarMenu={jest.fn()}
      onCerrar={jest.fn()}
      {...extra}
    />,
  );
  return onCambiar;
}

const grupo = (nombre: string) => screen.getByRole('radiogroup', { name: nombre });

describe('Diseño › Píldora (P1)', () => {
  test('solo con «Menú en píldora»', () => {
    encabezado({ header_style: 'default' });
    expect(screen.queryByText('Píldora')).toBeNull();
  });

  test('sin claves muestra lo de hoy y escribe cada clave; lo de hoy borra la clave', () => {
    const onCambiar = encabezado();
    expect(within(grupo('Estilo')).getByRole('radio', { name: 'Vidrio' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('10 %')).toBeTruthy();
    expect(screen.getByText('24 px')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Borde suave' }).getAttribute('aria-checked')).toBe('true');
    expect(within(grupo('Al bajar')).getByRole('radio', { name: 'Fondo del tema' }).getAttribute('aria-checked')).toBe('true');
    expect(within(grupo('Letras')).getByRole('radio', { name: 'Versalitas' }).getAttribute('aria-checked')).toBe('true');
    expect(within(grupo('Posición')).getByRole('radio', { name: 'Arriba' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Como hoy (≈ 20 px)')).toBeTruthy();

    fireEvent.click(within(grupo('Estilo')).getByRole('radio', { name: 'Sólido' }));
    expect(onCambiar).toHaveBeenLastCalledWith({ header_pill_style: 'solido' });
    fireEvent.change(screen.getByRole('slider', { name: 'Transparencia' }), { target: { value: '25' } });
    expect(onCambiar).toHaveBeenLastCalledWith({ header_pill_glass_opacity: 25 });
    fireEvent.change(screen.getByRole('slider', { name: 'Desenfoque' }), { target: { value: '8' } });
    expect(onCambiar).toHaveBeenLastCalledWith({ header_pill_blur: 8 });
    fireEvent.click(screen.getByRole('switch', { name: 'Borde suave' }));
    expect(onCambiar).toHaveBeenLastCalledWith({ header_pill_border: false });
    fireEvent.click(within(grupo('Al bajar')).getByRole('radio', { name: 'Igual' }));
    expect(onCambiar).toHaveBeenLastCalledWith({ header_pill_on_scroll: 'igual' });
    fireEvent.click(within(grupo('Letras')).getByRole('radio', { name: 'Normal' }));
    expect(onCambiar).toHaveBeenLastCalledWith({ header_pill_text_case: 'normal' });
    fireEvent.change(screen.getByRole('slider', { name: 'Separación del borde' }), { target: { value: '12' } });
    expect(onCambiar).toHaveBeenLastCalledWith({ header_float_offset: 12 });
    fireEvent.click(within(grupo('Posición')).getByRole('radio', { name: 'Abajo en el celular' }));
    expect(onCambiar).toHaveBeenLastCalledWith({ header_pill_position: 'abajo' });
  });

  test('con valores guardados: transparencia solo con vidrio y volver a lo de hoy', () => {
    const onCambiar = encabezado({ header_pill_style: 'contorno', header_float_offset: 8, header_pill_blur: 10 });
    expect(screen.queryByRole('slider', { name: 'Transparencia' })).toBeNull();
    fireEvent.click(within(grupo('Estilo')).getByRole('radio', { name: 'Vidrio' }));
    expect(onCambiar).toHaveBeenLastCalledWith({ header_pill_style: null });
    fireEvent.change(screen.getByRole('slider', { name: 'Desenfoque' }), { target: { value: '24' } });
    expect(onCambiar).toHaveBeenLastCalledWith({ header_pill_blur: null });
    fireEvent.click(screen.getByRole('button', { name: 'Volver a la de hoy' }));
    expect(onCambiar).toHaveBeenLastCalledWith({ header_float_offset: null });
  });
});

describe('vista «Botón principal» (P2)', () => {
  const abrir = () => fireEvent.click(screen.getByRole('button', { name: /Botón principal: Forma, tamaño, estilo y colores/ }));

  test('se abre desde Contenido y la flecha vuelve a la pestaña', () => {
    encabezado({ header_style: 'default', header_cta_text: 'Reservar' }, { pestanaInicial: 'contenido' });
    abrir();
    expect(screen.getByRole('heading', { name: 'Botón principal' })).toBeTruthy();
    expect(screen.queryByRole('tab')).toBeNull();
    expect((screen.getAllByRole('textbox')[0] as HTMLInputElement).value).toBe('Reservar');
    expect(screen.getByText(/El mismo control|este mismo control/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Volver al encabezado' }));
    expect(screen.getAllByRole('tab').length).toBe(4);
    expect(screen.getByRole('tab', { name: 'Contenido' }).getAttribute('aria-selected')).toBe('true');
  });

  test('Forma: cuatro tarjetas en cualquier composición; sin clave, «personalizada» con el radio guardado', () => {
    const onCambiar = encabezado({ header_style: 'default', cta_border_radius: 4 }, { pestanaInicial: 'contenido' });
    abrir();
    const formas = grupo('Forma');
    expect(within(formas).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Píldora', 'Redondeado', 'Cuadrado', 'Círculo']);
    expect(within(formas).getAllByRole('radio').every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
    expect(screen.getByText('Ahora: personalizada (radio 4)')).toBeTruthy();
    fireEvent.click(within(formas).getByRole('radio', { name: 'Círculo' }));
    expect(onCambiar).toHaveBeenLastCalledWith({ header_cta_shape: 'circle' });
  });

  test('cada control escribe su clave', () => {
    const onCambiar = encabezado({ header_cta_shape: 'pill', header_cta_icon: 'phone' }, { pestanaInicial: 'contenido' });
    abrir();
    expect(within(grupo('Forma')).getByRole('radio', { name: 'Píldora' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Volver a la personalizada (radio 8)' }));
    expect(onCambiar).toHaveBeenLastCalledWith({ header_cta_shape: null });
    fireEvent.click(within(grupo('Tamaño')).getByRole('radio', { name: 'L' }));
    expect(onCambiar).toHaveBeenLastCalledWith({ header_cta_size: 'lg' });
    expect((screen.getByRole('slider', { name: 'Ancho fijo' }) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(within(grupo('Ancho')).getByRole('radio', { name: 'Fijo' }));
    expect(onCambiar).toHaveBeenLastCalledWith({ header_cta_width: 120 });
    fireEvent.change(screen.getByRole('slider', { name: 'Alto' }), { target: { value: '60' } });
    expect(onCambiar).toHaveBeenLastCalledWith({ header_cta_height: 60 });
    fireEvent.change(screen.getByRole('slider', { name: 'Relleno horizontal' }), { target: { value: '20' } });
    expect(onCambiar).toHaveBeenLastCalledWith({ cta_padding_x: 20 });
    expect(within(grupo('Estilo')).getByRole('radio', { name: 'Sólido' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(grupo('Estilo')).getByRole('radio', { name: 'Vidrio' }));
    expect(onCambiar).toHaveBeenLastCalledWith({ header_cta_style: 'vidrio' });
    fireEvent.click(within(grupo('Lado del ícono')).getByRole('radio', { name: 'Derecha' }));
    expect(onCambiar).toHaveBeenLastCalledWith({ header_cta_icon_side: 'derecha' });
    fireEvent.click(within(grupo('Mayúsculas')).getByRole('radio', { name: 'Sí' }));
    expect(onCambiar).toHaveBeenLastCalledWith({ header_cta_uppercase: true });
    fireEvent.click(within(grupo('Sombra')).getByRole('radio', { name: 'Media' }));
    expect(onCambiar).toHaveBeenLastCalledWith({ cta_shadow: 'md' });
    fireEvent.click(within(grupo('Fondo del botón')).getByRole('radio', { name: 'Fijar color' }));
    expect(onCambiar).toHaveBeenLastCalledWith({ cta_bg_color: '#2E3328' });
  });

  test('sin ícono el lado queda deshabilitado; Estilo sigue con los colores del botón y abre la vista', () => {
    encabezado({ header_style: 'default' }, { pestanaInicial: 'estilo' });
    expect(within(grupo('Botón principal')).getByRole('radio', { name: 'Sigue el tema' })).toBeTruthy();
    abrir();
    const lado = grupo('Lado del ícono');
    expect(within(lado).getAllByRole('radio').every((r) => (r as HTMLButtonElement).disabled)).toBe(true);
  });

  test('desde Diseño con píldora también se abre', () => {
    encabezado();
    abrir();
    expect(screen.getByRole('heading', { name: 'Botón principal' })).toBeTruthy();
  });
});

describe('Celular › Menú inferior · Píldora flotante (P4)', () => {
  const guardado = (c: jest.Mock) => (c.mock.calls.at(-1)![0].mobile_header as { bottom_nav: Record<string, unknown> }).bottom_nav as {
    variant: string; items: unknown[]; style: Record<string, unknown>;
  };

  test('tarjeta junto a Pestañas y Acciones; al elegirla guarda floating con hasta 5 botones', () => {
    const cambiar = jest.fn();
    renderConIdioma(<MenuInferiorPanel ajustes={{ mobile_menu_style: 'tabs' }} cambiar={cambiar} />);
    const tipo = grupo('Tipo');
    expect(within(tipo).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Pestañas tipo app', 'Botones de acción', 'Píldora flotante']);
    fireEvent.click(within(tipo).getByRole('radio', { name: 'Píldora flotante' }));
    const g = guardado(cambiar);
    expect(g.variant).toBe('floating');
    expect(g.items).toHaveLength(5);
    expect(g.style).not.toHaveProperty('glass');
  });

  test('opciones de la píldora flotante y botón destacado con centerId', () => {
    const cambiar = jest.fn();
    const bottom_nav = {
      v: 2, enabled: true, variant: 'floating',
      items: [{ id: 'home', action: 'home', label: 'Inicio', icon: 'home', visible: true }, { id: 'booking', action: 'booking', label: 'Reservar', icon: 'calendar', visible: true }],
      style: { labels: 'always' },
    };
    renderConIdioma(<MenuInferiorPanel ajustes={{ mobile_header: { bottom_nav } }} cambiar={cambiar} />);
    expect(screen.getByRole('switch', { name: /Vidrio/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('16 px')).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: /Vidrio/ }));
    expect(guardado(cambiar).style).toMatchObject({ glass: false });
    fireEvent.change(screen.getByRole('slider', { name: 'Separación del borde' }), { target: { value: '24' } });
    expect(guardado(cambiar).style).toMatchObject({ offset: 24 });
    fireEvent.click(within(grupo('Ancho')).getByRole('radio', { name: 'Casi todo el ancho' }));
    expect(guardado(cambiar).style).toMatchObject({ width: 'full' });
    fireEvent.click(within(grupo('Indicador del activo')).getByRole('radio', { name: 'Punto' }));
    expect(guardado(cambiar).style).toMatchObject({ indicator: 'dot' });
    fireEvent.click(within(grupo('Botón central destacado')).getByRole('radio', { name: 'Reservar' }));
    expect(guardado(cambiar).style).toMatchObject({ centerId: 'booking' });
  });
});
