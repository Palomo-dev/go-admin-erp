/**
 * @jest-environment jsdom
 *
 * Vista «Íconos» unificada (Figma 2830:73206) y «Al tocar el ícono de cuenta» (Figma 2839:69662):
 * se renderiza con lo que el sitio ya tiene (sin escribir al abrir) y cada control arma el cambio
 * de siempre (columnas de cada acción, header_iconos, header_icons_weight, header_cuenta).
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { VistaIconos } from '../VistaIconosCabecera';

jest.mock('next-intl', () => ({
  useLocale: () => 'es',
  useTranslations: () => Object.assign((key: string) => key, { has: () => false }),
}));

function vista(ajustes: Record<string, unknown> = {}, extra: Partial<React.ComponentProps<typeof VistaIconos>> = {}) {
  const cambiar = jest.fn();
  const onAbrir = jest.fn();
  render(<VistaIconos ajustes={ajustes} cambiar={cambiar} onAbrir={onAbrir} {...extra} />);
  return { cambiar, onAbrir };
}

describe('Vista «Íconos» unificada', () => {
  test('abrir no escribe nada; cinco estilos generales y Píldora y Relleno con «Solo computador»', () => {
    const { cambiar } = vista({});
    expect(cambiar).not.toHaveBeenCalled();
    const estilos = screen.getByRole('radiogroup', { name: 'iconos.estiloGeneral' });
    expect(within(estilos).getAllByRole('radio')).toHaveLength(5);
    expect(within(estilos).getAllByText('iconos.soloComputador')).toHaveLength(2);
    fireEvent.click(within(estilos).getByRole('radio', { name: 'iconos.estiloOpcion.pildora' }));
    expect(cambiar).toHaveBeenLastCalledWith({ header_iconos: { estilo: 'pildora' } });
  });

  test('En el celular: Automático marcado sin valor; elegir Círculo lo guarda', () => {
    const { cambiar } = vista({ header_iconos: { estilo: 'pildora' } });
    const celular = screen.getByRole('radiogroup', { name: 'iconos.celular' });
    expect(within(celular).getByRole('radio', { name: 'iconos.celularOpcion.auto' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(celular).getByRole('radio', { name: 'iconos.celularOpcion.circulo' }));
    expect(cambiar).toHaveBeenLastCalledWith({ header_iconos: { estilo: 'pildora', movil: 'circulo' } });
  });

  test('Trazo único: el relleno guardado se ve marcado; Fino deja contorno', () => {
    const { cambiar } = vista({ header_icons_weight: 'relleno', header_iconos: { trazo: 'fino' } });
    const relleno = screen.getByRole('radio', { name: 'iconos.trazoOpcion.relleno' });
    expect(relleno.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'iconos.trazoOpcion.fino' }));
    expect(cambiar).toHaveBeenLastCalledWith({ header_iconos: { trazo: 'fino' }, header_icons_weight: 'contorno' });
  });

  test('sin trazo guardado se ve «Normal» (lo de hoy)', () => {
    vista({});
    expect(screen.getByRole('radio', { name: 'iconos.trazoOpcion.normal' }).getAttribute('aria-checked')).toBe('true');
  });

  test('Dibujo de cada ícono: lo que hoy pinta la tienda y la columna de siempre', () => {
    const { cambiar } = vista({ cart_icon: 'gift', header_cart_glyph: null });
    const carrito = screen.getByRole('radiogroup', { name: 'Ícono del carrito' });
    expect(within(carrito).getByRole('radio', { name: 'Regalo' }).getAttribute('aria-checked')).toBe('true');
    expect(within(carrito).getAllByRole('radio')).toHaveLength(6);
    fireEvent.click(within(carrito).getByRole('radio', { name: 'Canasta' }));
    expect(cambiar).toHaveBeenLastCalledWith({ cart_icon: 'shopping-basket' });
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Ícono de buscar' })).getByRole('radio', { name: 'Lupa con marco' }));
    expect(cambiar).toHaveBeenLastCalledWith({ search_icon: 'scan-search' });
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Ícono de cuenta' })).getByRole('radio', { name: 'Entrar' }));
    expect(cambiar).toHaveBeenLastCalledWith({ auth_icon: 'log-in' });
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Ícono de moneda' })).getByRole('radio', { name: 'Pesos en círculo' }));
    expect(cambiar).toHaveBeenLastCalledWith({ currency_icon: 'circle-dollar-sign' });
  });

  test('el glifo carrito/bolsa guardado se respeta y elegir un dibujo lo limpia', () => {
    const { cambiar } = vista({ header_cart_glyph: 'carrito' });
    expect(screen.queryByText('iconos.glifo')).toBeNull();
    const carrito = screen.getByRole('radiogroup', { name: 'Ícono del carrito' });
    expect(within(carrito).getByRole('radio', { name: 'Carrito' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(carrito).getByRole('radio', { name: 'Bolsa' }));
    expect(cambiar).toHaveBeenLastCalledWith({ cart_icon: 'shopping-bag', header_cart_glyph: null });
  });

  test('forma propia: insignia en la tarjeta y «Volver a como los demás»', () => {
    const { cambiar } = vista({ header_iconos: { por_icono: { carrito: { estilo: 'relleno' } } } });
    const tarjeta = document.querySelector('[data-tarjeta-icono="carrito"]') as HTMLElement;
    expect(within(tarjeta).getAllByText('iconos.formaOpcion.relleno').length).toBeGreaterThan(0);
    // Con forma propia con texto, la tarjeta pide el texto y avisa del celular.
    expect(within(tarjeta).getByText('iconos.texto')).toBeTruthy();
    expect(within(tarjeta).getByText('iconos.notaFormaCelular')).toBeTruthy();
    fireEvent.click(within(tarjeta).getByRole('button', { name: /iconos.volverDemas/ }));
    expect(cambiar).toHaveBeenLastCalledWith({ header_iconos: null });
  });

  test('interruptores de siempre y enlaces a Diseño › Buscador, Favoritos y Moneda', () => {
    const onIrBuscador = jest.fn();
    const { cambiar, onAbrir } = vista({ header_iconos: { favoritos: true } }, { onIrBuscador });
    fireEvent.click(screen.getByRole('switch', { name: 'iconos.carrito' }));
    expect(cambiar).toHaveBeenLastCalledWith({ show_header_cart: false });
    fireEvent.click(screen.getByRole('switch', { name: 'iconos.cuenta' }));
    expect(cambiar).toHaveBeenLastCalledWith({ show_header_auth: false });
    fireEvent.click(screen.getByRole('switch', { name: 'iconos.moneda' }));
    expect(cambiar).toHaveBeenLastCalledWith({ header_show_currency: false });
    // Buscar no tiene interruptor: se prende en Diseño › Buscador.
    expect(screen.queryByRole('switch', { name: 'iconos.buscar' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /iconos.buscarIr/ }));
    expect(onIrBuscador).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /iconos.favoritosVerPanel/ }));
    expect(onAbrir).toHaveBeenCalledWith('favoritos');
    fireEvent.click(screen.getByRole('button', { name: /iconos.monedaCambiar/ }));
    expect(onAbrir).toHaveBeenCalledWith('moneda');
  });

  test('Fondo de los íconos: plegado, sin tamaño propio; abierto cambia la forma de la caja', () => {
    const { cambiar } = vista({ header_icons_box: { shape: 'circle', icon: 22 } });
    expect(document.querySelector('[data-fondo-iconos]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /iconos.fondo.titulo/ }));
    expect(document.querySelector('[data-fondo-iconos]')).not.toBeNull();
    // Sin chips de tamaño en px: el tamaño guardado se respeta y se explica.
    expect(screen.queryByRole('radio', { name: /22 px/ })).toBeNull();
    expect(screen.getByText('iconos.fondo.tamanoGuardado')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'iconos.fondo.caja' })).getAllByRole('radio')[2]);
    expect(cambiar.mock.calls.at(-1)?.[0]).toMatchObject({ header_icons_box: { shape: 'square', icon: 22 } });
  });
});

describe('Al tocar el ícono de cuenta', () => {
  test('sin valor: «Página» marcada y sin campos extra', () => {
    vista({});
    const grupo = screen.getByRole('radiogroup', { name: 'cuenta.alTocar' });
    expect(within(grupo).getByRole('radio', { name: 'cuenta.modo.pagina' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByText('cuenta.titulo')).toBeNull();
    expect(screen.getByText('cuenta.notaPagina')).toBeTruthy();
  });

  test('elegir «Panel lateral» guarda header_cuenta.modo', () => {
    const { cambiar } = vista({});
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'cuenta.alTocar' })).getByRole('radio', { name: 'cuenta.modo.panel' }));
    expect(cambiar).toHaveBeenLastCalledWith({ header_cuenta: { modo: 'panel' } });
  });

  test('ventana: destino de «Crear cuenta», sin beneficios; guardar título y «Ir a Mi cuenta»', () => {
    const { cambiar } = vista({ header_cuenta: { modo: 'ventana' } });
    expect(screen.queryByText('cuenta.beneficios')).toBeNull();
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'cuenta.destino' })).getByRole('radio', { name: 'cuenta.destinoOpcion.pagina' }));
    expect(cambiar).toHaveBeenLastCalledWith({ header_cuenta: { modo: 'ventana', ventanaDestino: 'pagina' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'cuenta.titulo' }), { target: { value: 'Bienvenido' } });
    expect(cambiar).toHaveBeenLastCalledWith({ header_cuenta: { modo: 'ventana', titulo: 'Bienvenido' } });
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'cuenta.despues' })).getByRole('radio', { name: 'cuenta.despuesOpcion.cuenta' }));
    expect(cambiar).toHaveBeenLastCalledWith({ header_cuenta: { modo: 'ventana', despues: 'cuenta' } });
  });

  test('panel: «Mostrar beneficios» apagado se guarda', () => {
    const { cambiar } = vista({ header_cuenta: { modo: 'panel' } });
    fireEvent.click(screen.getByRole('switch', { name: 'cuenta.beneficios' }));
    expect(cambiar).toHaveBeenLastCalledWith({ header_cuenta: { modo: 'panel', beneficios: false } });
  });
});
