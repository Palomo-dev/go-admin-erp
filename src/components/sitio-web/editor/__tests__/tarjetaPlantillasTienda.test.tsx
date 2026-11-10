/**
 * @jest-environment jsdom
 *
 * Tarjeta de producto › opciones de las plantillas de tienda (Figma B1, PLANO §2 ítems 1-9): qué
 * clave escribe cada control y que la opción «como hoy» la borra (el sitio pinta la tarjeta de hoy).
 * Datos ficticios.
 */
import { fireEvent, screen, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { InspectorTarjetaProducto } from '../inspector/InspectorTarjetaProducto';
import {
  HOY_TARJETA_TIENDA,
  OPCION_HOY,
  opcionVisibleTarjeta,
  textoElegirAlGuardar,
  valorAlElegirTarjeta,
} from '../inspector/tarjetaTiendaLogica';
import { normalizarTarjeta, vistaEditorTarjeta } from '@/lib/website/tarjetaProducto';

const CLAVES_NUEVAS = ['card_subtitle', 'price_prefix', 'title_font', 'card_grid_lines', 'wishlist_style', 'wishlist_position', 'hover_image_transition', 'choose_label'];

type Pestana = 'Botones' | 'Texto y precio' | 'Contenedor';

const abrir = (pestana: Pestana, guardado: unknown = null, heredado: unknown = null) => {
  const onCambiar = jest.fn();
  renderConIdioma(<InspectorTarjetaProducto guardado={guardado} heredado={heredado} onCambiar={onCambiar} />);
  fireEvent.click(screen.getByRole('tab', { name: pestana }));
  return onCambiar;
};
const ultimo = (f: jest.Mock) => f.mock.calls.at(-1)![0];
const grupo = (nombre: string) => screen.getByRole('group', { name: nombre });
const elegir = (nombreGrupo: string, opcion: string) => fireEvent.click(within(grupo(nombreGrupo)).getByRole('radio', { name: opcion }));
const elegido = (nombreGrupo: string) => within(grupo(nombreGrupo)).getByRole('radio', { checked: true }).textContent;

describe('tarjetaTiendaLogica', () => {
  test('«como hoy» borra la clave', () => {
    for (const clave of ['card_subtitle', 'price_prefix', 'title_font', 'wishlist_position', 'hover_image_transition', 'wishlist_style'] as const) {
      expect(valorAlElegirTarjeta(clave, OPCION_HOY, null)).toBeNull();
      expect(valorAlElegirTarjeta(clave, OPCION_HOY, { card_radius: 4 })).toBeNull();
    }
  });
  test('una sección que hereda otro valor del sitio escribe el de hoy explícito para pisarlo', () => {
    expect(valorAlElegirTarjeta('card_subtitle', OPCION_HOY, { card_subtitle: 'brand' })).toBe('none');
    expect(valorAlElegirTarjeta('title_font', OPCION_HOY, { title_font: 'heading' })).toBe('body');
    expect(valorAlElegirTarjeta('wishlist_position', OPCION_HOY, { wishlist_position: 'top_left' })).toBe('top_right');
    expect(valorAlElegirTarjeta('hover_image_transition', OPCION_HOY, { hover_image_transition: 'slide' })).toBe('fade');
    expect(valorAlElegirTarjeta('price_prefix', OPCION_HOY, { price_prefix: 'desde' })).toBe('none');
    // Heredar ya el de hoy (o un valor inválido) no obliga a escribir nada.
    expect(valorAlElegirTarjeta('card_subtitle', OPCION_HOY, { card_subtitle: 'none' })).toBeNull();
    expect(valorAlElegirTarjeta('card_subtitle', OPCION_HOY, { card_subtitle: 'material' })).toBeNull();
    // El corazón no tiene un «de hoy» explícito: lo decide la sección.
    expect(valorAlElegirTarjeta('wishlist_style', OPCION_HOY, { wishlist_style: 'circle' })).toBeNull();
  });
  test('un valor del contrato se escribe tal cual', () => {
    expect(valorAlElegirTarjeta('card_subtitle', 'dimensions', null)).toBe('dimensions');
    expect(valorAlElegirTarjeta('wishlist_style', 'ghost', null)).toBe('ghost');
  });
  test('la lista marca «como hoy» sin clave o con el valor de hoy guardado', () => {
    for (const [clave, hoy] of Object.entries(HOY_TARJETA_TIENDA)) {
      expect(opcionVisibleTarjeta(clave as keyof typeof HOY_TARJETA_TIENDA, {})).toBe(OPCION_HOY);
      expect(opcionVisibleTarjeta(clave as keyof typeof HOY_TARJETA_TIENDA, { [clave]: hoy })).toBe(OPCION_HOY);
    }
    expect(opcionVisibleTarjeta('wishlist_style', { wishlist_style: 'none' })).toBe('none');
    expect(opcionVisibleTarjeta('card_subtitle', { card_subtitle: 'reference' })).toBe('reference');
  });
  test('texto de «Elegir»: espacios colapsados, máximo y vacío = null', () => {
    expect(textoElegirAlGuardar('  Elige   un acabado ', 24)).toBe('Elige un acabado');
    expect(textoElegirAlGuardar('   ', 24)).toBeNull();
    expect(textoElegirAlGuardar('x'.repeat(30), 24)).toHaveLength(24);
  });
  test('sin tocar nada, la vista del inspector no trae ninguna clave nueva (la tarjeta de hoy)', () => {
    const vista = vistaEditorTarjeta(null, null);
    for (const k of CLAVES_NUEVAS) expect(vista).not.toHaveProperty(k);
  });
});

describe('Texto y precio', () => {
  test('precio junto al nombre escribe price_position: beside_title', () => {
    const f = abrir('Texto y precio');
    elegir('Precio', 'Junto al nombre (nuevo)');
    expect(ultimo(f)).toEqual({ price_position: 'beside_title' });
  });

  test('línea bajo el nombre: cada opción y «Ninguna (hoy)» borra', () => {
    const f = abrir('Texto y precio', { card_radius: 8 });
    expect(elegido('Línea bajo el nombre')).toBe('Ninguna (hoy)');
    for (const [opcion, valor] of [
      ['Marca', 'brand'],
      ['Medidas (largo × ancho × alto)', 'dimensions'],
      ['Referencia', 'reference'],
      ['1.ª línea de la descripción', 'description'],
    ] as const) {
      elegir('Línea bajo el nombre', opcion);
      expect(ultimo(f)).toEqual({ card_radius: 8, card_subtitle: valor });
    }
  });

  test('con valor guardado, «como hoy» lo borra', () => {
    const f = abrir('Texto y precio', { card_subtitle: 'brand', price_prefix: 'desde', title_font: 'heading', card_radius: 8 });
    expect(elegido('Línea bajo el nombre')).toBe('Marca');
    elegir('Línea bajo el nombre', 'Ninguna (hoy)');
    expect(ultimo(f)).toEqual({ price_prefix: 'desde', title_font: 'heading', card_radius: 8 });
    elegir('Prefijo del precio', 'Ninguno (hoy)');
    expect(ultimo(f)).toEqual({ card_subtitle: 'brand', title_font: 'heading', card_radius: 8 });
    elegir('Fuente del nombre', 'La del cuerpo (hoy)');
    expect(ultimo(f)).toEqual({ card_subtitle: 'brand', price_prefix: 'desde', card_radius: 8 });
  });

  test('prefijo «Desde» y fuente de títulos', () => {
    const f = abrir('Texto y precio');
    elegir('Prefijo del precio', '«Desde»');
    expect(ultimo(f)).toEqual({ price_prefix: 'desde' });
    elegir('Fuente del nombre', 'La de títulos del tema');
    expect(ultimo(f)).toEqual({ title_font: 'heading' });
  });

  test('una sección ve lo del sitio y puede volver a lo de hoy', () => {
    const f = abrir('Texto y precio', null, { card_subtitle: 'dimensions' });
    expect(elegido('Línea bajo el nombre')).toBe('Medidas (largo × ancho × alto)');
    elegir('Línea bajo el nombre', 'Ninguna (hoy)');
    expect(ultimo(f)).toEqual({ card_subtitle: 'none' });
  });

  test('las opciones nuevas llevan la insignia «Nuevo»', () => {
    abrir('Texto y precio');
    for (const nombre of ['Línea bajo el nombre', 'Prefijo del precio', 'Fuente del nombre']) {
      expect(within(grupo(nombre)).getByText('Nuevo')).toBeTruthy();
    }
  });
});

describe('Botones', () => {
  test('estilo «Suave» en los tres botones', () => {
    const f = abrir('Botones');
    elegir('Estilo', 'Suave (nuevo)');
    expect(ultimo(f)).toEqual({ add: { button_style: 'soft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Elegir' }));
    elegir('Estilo', 'Suave (nuevo)');
    expect(ultimo(f)).toEqual({ choose: { button_style: 'soft' } });
  });

  test('texto del botón «Elegir»: se guarda al salir del campo; vacío lo borra', () => {
    const f = abrir('Botones', { card_radius: 8 });
    expect(screen.queryByLabelText('Texto del botón «Elegir»')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Elegir' }));
    const campo = screen.getByLabelText('Texto del botón «Elegir»');
    fireEvent.change(campo, { target: { value: 'Elige un ' } });
    expect(f).not.toHaveBeenCalled();
    fireEvent.change(campo, { target: { value: 'Elige un acabado ' } });
    fireEvent.blur(campo);
    expect(ultimo(f)).toEqual({ card_radius: 8, choose_label: 'Elige un acabado' });
  });

  test('texto del botón «Elegir» guardado: vaciarlo vuelve al de hoy', () => {
    const f = abrir('Botones', { choose_label: 'Elige un acabado', card_radius: 8 });
    fireEvent.click(screen.getByRole('button', { name: 'Elegir' }));
    const campo = screen.getByLabelText('Texto del botón «Elegir»') as HTMLInputElement;
    expect(campo.value).toBe('Elige un acabado');
    fireEvent.change(campo, { target: { value: '' } });
    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(ultimo(f)).toEqual({ card_radius: 8 });
  });

  test('corazón: estilo y esquina; «como hoy» borra cada clave', () => {
    const f = abrir('Botones');
    expect(elegido('Estilo del corazón')).toBe('Como lo decida la sección (hoy)');
    for (const [opcion, valor] of [['Ninguno', 'none'], ['En círculo', 'circle'], ['Fantasma', 'ghost']] as const) {
      elegir('Estilo del corazón', opcion);
      expect(ultimo(f)).toEqual({ wishlist_style: valor });
    }
    elegir('Posición del corazón', 'Arriba a la izquierda');
    expect(ultimo(f)).toEqual({ wishlist_position: 'top_left' });
  });

  test('corazón guardado: «como hoy» borra', () => {
    const f = abrir('Botones', { wishlist_style: 'circle', wishlist_position: 'top_left' });
    elegir('Estilo del corazón', 'Como lo decida la sección (hoy)');
    expect(ultimo(f)).toEqual({ wishlist_position: 'top_left' });
    elegir('Posición del corazón', 'Arriba a la derecha (hoy)');
    expect(ultimo(f)).toEqual({ wishlist_style: 'circle' });
  });
});

describe('Contenedor', () => {
  test('tarjetas con borde compartido: encender guarda true; apagar borra', () => {
    const f = abrir('Contenedor', { card_radius: 0 });
    const sw = screen.getByRole('switch', { name: /Tarjetas con borde compartido/ });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    expect(ultimo(f)).toEqual({ card_radius: 0, card_grid_lines: true });
  });

  test('tarjetas con borde compartido encendido: apagarlo borra la clave', () => {
    const f = abrir('Contenedor', { card_grid_lines: true, card_radius: 0 });
    const sw = screen.getByRole('switch', { name: /Tarjetas con borde compartido/ });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sw);
    expect(ultimo(f)).toEqual({ card_radius: 0 });
  });

  test('cómo entra la segunda foto: sin «Segunda imagen» no se ofrece', () => {
    abrir('Contenedor', { hover_image: 'zoom' });
    expect(screen.queryByRole('group', { name: 'Cómo entra la segunda foto' })).toBeNull();
  });

  test('cómo entra la segunda foto con «Segunda imagen»', () => {
    const f = abrir('Contenedor', { hover_image: 'second' });
    expect(elegido('Cómo entra la segunda foto')).toBe('Fundido (hoy)');
    elegir('Cómo entra la segunda foto', 'Se desliza');
    expect(ultimo(f)).toEqual({ hover_image: 'second', hover_image_transition: 'slide' });
  });

  test('cómo entra la segunda foto guardada: «Fundido (hoy)» borra', () => {
    const f = abrir('Contenedor', { hover_image: 'second', hover_image_transition: 'slide' });
    elegir('Cómo entra la segunda foto', 'Fundido (hoy)');
    expect(ultimo(f)).toEqual({ hover_image: 'second' });
  });
});

describe('lo escrito pasa el normalizador del contrato', () => {
  test('cada valor de los controles sobrevive a normalizarTarjeta', () => {
    const escrito = {
      price_position: 'beside_title',
      card_subtitle: 'dimensions',
      price_prefix: 'desde',
      title_font: 'heading',
      card_grid_lines: true,
      wishlist_style: 'ghost',
      wishlist_position: 'top_left',
      hover_image_transition: 'slide',
      choose_label: 'Elige un acabado',
      choose: { button_style: 'soft' },
    };
    expect(normalizarTarjeta(escrito)).toEqual(escrito);
  });
});
