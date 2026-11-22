/**
 * @jest-environment jsdom
 *
 * Editor: «Encabezado › Carrito» con los cuatro modos del botón (Figma 2773:62797 · 2774:63297 ·
 * 2774:64169 · 2775:64409 · 2777:64932) y «Encabezado › Favoritos» (2772:62317). Abrir no
 * escribe; cada control arma el cambio de `header_carrito` / `header_favoritos`.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { VistaCarrito, VistaFavoritos } from '../CabeceraTiendaVistas';
import {
  botonEnModo,
  botonGuardable,
  cambioBotonCarrito,
  cambioInterruptorFavoritos,
  cambioSugerenciasFavoritos,
  cambioTextoFavoritos,
  cambioUsarEnPagina,
  columnasLegacyBoton,
  modoDisponible,
} from '../cabeceraTiendaLogica';
import { opcionesCarrito, opcionesFavoritos, TEXTOS_REGLAS_BOTON_CARRITO } from '@/lib/website/v2/cabeceraTienda';

jest.mock('next-intl', () => ({
  useLocale: () => 'es',
  useTranslations: () => Object.assign((key: string) => key, { has: () => false }),
}));
jest.mock('@/lib/services/monedaOrganizacion', () => ({ resolveOrgCurrency: async () => ({ code: 'COP' }) }));
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }) }) } }));

describe('lógica · botón del carrito', () => {
  test('la forma guardada conserva lo viejo y agrega solo los campos nuevos que hay', () => {
    expect(botonGuardable({ modo: 'al_abrir', textos: ['A', 'B'], orden: 'azar' })).toEqual({ modo: 'al_abrir', textos: ['A', 'B'], orden: 'azar' });
    expect(botonGuardable({ modo: 'mientras_abierto', textos: ['A'], segundos: 12, transicion: 'deslizar', pausar: false })).toEqual({
      modo: 'mientras_abierto',
      textos: ['A'],
      segundos: 10,
      transicion: 'deslizar',
      pausar: false,
    });
  });

  test('pasar a «según el carrito» escribe los textos de las reglas; los ya escritos (o vacíos) se conservan', () => {
    const b = botonEnModo({ modo: 'fijo', textos: ['A'], reglas: { oferta: '' } }, 'segun_carrito');
    expect(b.reglas).toEqual({ ...TEXTOS_REGLAS_BOTON_CARRITO, oferta: '' });
    expect(cambioBotonCarrito({}, b, true)).toEqual({ header_carrito: { boton: { modo: 'segun_carrito', textos: ['A'], reglas: { ...TEXTOS_REGLAS_BOTON_CARRITO, oferta: '' } } } });
  });

  test('sin borrador solo hay fijo y al abrir; la fila legacy no sabe de modos nuevos', () => {
    expect(modoDisponible('mientras_abierto', false)).toBe(false);
    expect(modoDisponible('segun_carrito', false)).toBe(false);
    expect(modoDisponible('al_abrir', false)).toBe(true);
    expect(modoDisponible('segun_carrito', true)).toBe(true);
    expect(columnasLegacyBoton({ modo: 'mientras_abierto', textos: ['A'] }).cart_button_mode).toBe('dynamic');
  });

  test('«Usar lo mismo» apagado copia el botón del cajón a /carrito; encendido borra la marca', () => {
    const cajon = { modo: 'mientras_abierto' as const, textos: ['A', 'B'], segundos: 3 };
    const apagado = cambioUsarEnPagina({ header_carrito: { boton: cajon } }, false, cajon);
    expect(apagado).toEqual({ header_carrito: { boton: cajon, usarEnPagina: false, botonPagina: cajon } });
    expect(opcionesCarrito(apagado).botonPagina).toEqual(cajon);
    expect(cambioUsarEnPagina(apagado, true, cajon)).toEqual({ header_carrito: { boton: cajon, botonPagina: cajon } });
  });
});

describe('lógica · favoritos', () => {
  test('los valores por defecto no se guardan (null = el del diseño)', () => {
    expect(cambioInterruptorFavoritos({}, 'contador', false)).toEqual({ header_favoritos: { contador: false } });
    expect(cambioInterruptorFavoritos({ header_favoritos: { contador: false } }, 'contador', true)).toEqual({ header_favoritos: null });
    expect(cambioSugerenciasFavoritos({}, { fuente: 'mas_vendidos' })).toEqual({ header_favoritos: { sugerencias: { fuente: 'mas_vendidos' } } });
    expect(cambioSugerenciasFavoritos({ header_favoritos: { sugerencias: { fuente: 'mas_vendidos' } } }, { fuente: 'categorias' })).toEqual({ header_favoritos: null });
  });

  test('texto vacío = el por defecto; el propio se recorta al largo del campo', () => {
    expect(cambioTextoFavoritos({}, 'tituloPanel', 'Mi lista')).toEqual({ header_favoritos: { textos: { tituloPanel: 'Mi lista' } } });
    expect(cambioTextoFavoritos({ header_favoritos: { textos: { tituloPanel: 'Mi lista' } } }, 'tituloPanel', '  ')).toEqual({ header_favoritos: null });
    const largo = cambioTextoFavoritos({}, 'tituloPagina', 'x'.repeat(100)) as { header_favoritos: { textos: { tituloPagina: string } } };
    expect(largo.header_favoritos.textos.tituloPagina).toHaveLength(40);
  });
});

describe('Encabezado › Carrito · cuatro modos', () => {
  test('pinta las 4 tarjetas, abrir no escribe; un sitio sin borrador no puede elegir los nuevos', () => {
    const cambiar = jest.fn();
    render(<VistaCarrito ajustes={{}} cambiar={cambiar} enBorrador={false} />);
    expect(cambiar).not.toHaveBeenCalled();
    expect(screen.getAllByRole('radio', { name: /carrito\.modos\./ })).toHaveLength(4);
    expect(screen.getByRole('radio', { name: 'carrito.modos.mientras_abierto.titulo' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('radio', { name: 'carrito.modos.al_abrir.titulo' }).getAttribute('aria-checked')).toBe('true');
  });

  test('elegir «mientras está abierto» guarda el modo y muestra segundos, transición y pausar', () => {
    const cambiar = jest.fn();
    const { rerender } = render(<VistaCarrito ajustes={{}} cambiar={cambiar} enBorrador />);
    fireEvent.click(screen.getByRole('radio', { name: 'carrito.modos.mientras_abierto.titulo' }));
    const cambio = cambiar.mock.calls[0][0];
    expect(cambio.header_carrito.boton.modo).toBe('mientras_abierto');
    rerender(<VistaCarrito ajustes={cambio} cambiar={cambiar} enBorrador />);
    fireEvent.change(screen.getByLabelText('carrito.segundos'), { target: { value: '7' } });
    expect(cambiar.mock.calls.at(-1)[0].header_carrito.boton.segundos).toBe(7);
    expect(screen.getByText('carrito.pausar')).toBeTruthy();
  });

  test('«según el carrito»: vaciar una regla la guarda vacía (salta a la siguiente)', () => {
    const cambiar = jest.fn();
    const ajustes = { header_carrito: { boton: { modo: 'segun_carrito', textos: ['A'], reglas: { ...TEXTOS_REGLAS_BOTON_CARRITO } } } };
    render(<VistaCarrito ajustes={ajustes} cambiar={cambiar} enBorrador />);
    fireEvent.change(screen.getByLabelText('carrito.reglas.oferta'), { target: { value: '' } });
    expect(cambiar.mock.calls.at(-1)[0].header_carrito.boton.reglas.oferta).toBe('');
  });

  test('apagar «Usar lo mismo» muestra el bloque propio de /carrito', () => {
    const cambiar = jest.fn();
    const base = { header_carrito: { boton: { modo: 'fijo', textos: ['A'], texto: 'Pagar' } } };
    const { rerender } = render(<VistaCarrito ajustes={base} cambiar={cambiar} enBorrador />);
    fireEvent.click(screen.getByRole('switch', { name: 'carrito.usarEnPagina' }));
    const cambio = cambiar.mock.calls.at(-1)[0];
    expect(cambio.header_carrito.usarEnPagina).toBe(false);
    rerender(<VistaCarrito ajustes={cambio} cambiar={cambiar} enBorrador />);
    expect(screen.getByText('carrito.botonPagina')).toBeTruthy();
    expect(screen.getAllByRole('radio', { name: /carrito\.modos\./ })).toHaveLength(8);
  });
});

describe('Encabezado › Favoritos', () => {
  test('abrir no escribe; «Ir a la página» guarda alTocar y «Mostrar el corazón» usa header_iconos', () => {
    const cambiar = jest.fn();
    render(<VistaFavoritos ajustes={{}} cambiar={cambiar} />);
    expect(cambiar).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: 'favoritos.alTocarOpcion.panel.titulo' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'favoritos.alTocarOpcion.pagina.titulo' }));
    expect(cambiar).toHaveBeenLastCalledWith({ header_favoritos: { alTocar: 'pagina' } });
    fireEvent.click(screen.getByRole('switch', { name: 'favoritos.mostrar' }));
    expect(cambiar).toHaveBeenLastCalledWith({ header_iconos: { favoritos: true } });
  });

  test('los textos muestran el por defecto en gris y guardan el propio', () => {
    const cambiar = jest.fn();
    render(<VistaFavoritos ajustes={{}} cambiar={cambiar} />);
    const campo = screen.getByLabelText('favoritos.texto.tituloPanel') as HTMLInputElement;
    expect(campo.placeholder).toBe(opcionesFavoritos({}).textos.tituloPanel);
    fireEvent.change(campo, { target: { value: 'Guardados' } });
    expect(cambiar).toHaveBeenLastCalledWith({ header_favoritos: { textos: { tituloPanel: 'Guardados' } } });
  });
});
