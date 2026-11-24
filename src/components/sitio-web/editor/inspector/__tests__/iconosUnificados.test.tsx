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

  // Queja del dueño 2026-11-23: «cambié el ícono del buscador y no cambió». La tienda pinta el
  // dibujo en todos los buscadores, así que se ofrece con cualquiera, y con más opciones.
  test.each(['icon', 'bar', 'mini', 'mega', 'pill_floating', 'icon_overlay'])('Buscar con buscador «%s»: el dibujo siempre, con 6 opciones', (estilo) => {
    // En conjunto: el celular usa el mismo buscador que el computador.
    const { cambiar } = vista({ search_style: estilo, mobile_search_same_as_desktop: true });
    const buscar = screen.getByRole('radiogroup', { name: 'Ícono de buscar' });
    expect(within(buscar).getAllByRole('radio').map((r) => r.textContent)).toEqual([
      'Lupa',
      'Lupa con marco',
      'Lupa con líneas',
      'Lupa con visto bueno',
      'Lupa con más',
      'Binoculares',
    ]);
    expect(screen.queryByText('iconos.buscarEsBarra')).toBeNull();
    fireEvent.click(within(buscar).getByRole('radio', { name: 'Binoculares' }));
    expect(cambiar).toHaveBeenLastCalledWith({ search_icon: 'binoculars' });
    // La forma de la lupa solo cambia algo con el buscador ícono: con barra, una nota lo dice.
    const nota = screen.queryByText('iconos.buscarFormaBarra');
    expect(nota === null).toBe(estilo === 'icon' || estilo === 'icon_overlay');
  });

  test('Forma: tarjetas con miniatura; «Como los demás» primero y marcada sin forma propia', () => {
    const { cambiar } = vista({});
    const carrito = document.querySelector('[data-tarjeta-icono="carrito"]') as HTMLElement;
    const forma = within(carrito).getByRole('radiogroup', { name: 'iconos.forma' });
    const tarjetas = within(forma).getAllByRole('radio');
    // La miniatura es decorativa: el nombre accesible es solo la etiqueta, en este orden.
    const nombres = ['demas', 'icono', 'circulo', 'texto', 'pildora', 'relleno'];
    expect(tarjetas).toHaveLength(nombres.length);
    nombres.forEach((n, i) => expect(within(forma).getByRole('radio', { name: `iconos.formaOpcion.${n}` })).toBe(tarjetas[i]));
    expect(tarjetas[0].getAttribute('aria-checked')).toBe('true');
    // Píldora y Relleno siguen con «Solo computador»; ya no hay desplegable de texto.
    expect(within(forma).getAllByText('iconos.soloComputador')).toHaveLength(2);
    expect(within(carrito).queryByRole('combobox')).toBeNull();
    // «Como los demás» ya marcada: tocarla no escribe nada.
    fireEvent.click(tarjetas[0]);
    expect(cambiar).not.toHaveBeenCalled();
    fireEvent.click(within(forma).getByRole('radio', { name: 'iconos.formaOpcion.pildora' }));
    expect(cambiar).toHaveBeenLastCalledWith({ header_iconos: { por_icono: { carrito: { estilo: 'pildora' } } } });
  });

  test('Forma: con forma propia se marca esa tarjeta y «Como los demás» la quita', () => {
    const { cambiar } = vista({ header_iconos: { por_icono: { cuenta: { estilo: 'circulo' } } } });
    const cuenta = document.querySelector('[data-tarjeta-icono="cuenta"]') as HTMLElement;
    const forma = within(cuenta).getByRole('radiogroup', { name: 'iconos.forma' });
    expect(within(forma).getByRole('radio', { name: 'iconos.formaOpcion.circulo' }).getAttribute('aria-checked')).toBe('true');
    expect(within(forma).getByRole('radio', { name: 'iconos.formaOpcion.demas' }).getAttribute('aria-checked')).toBe('false');
    fireEvent.click(within(forma).getByRole('radio', { name: 'iconos.formaOpcion.demas' }));
    expect(cambiar).toHaveBeenLastCalledWith({ header_iconos: null });
  });

  test('Forma de Buscar: solo las que su componente soporta (Como los demás, Solo ícono y Círculo)', () => {
    vista({});
    const buscar = document.querySelector('[data-tarjeta-icono="buscar"]') as HTMLElement;
    const forma = within(buscar).getByRole('radiogroup', { name: 'iconos.forma' });
    const tarjetas = within(forma).getAllByRole('radio');
    expect(tarjetas).toHaveLength(3);
    ['demas', 'icono', 'circulo'].forEach((n, i) => expect(within(forma).getByRole('radio', { name: `iconos.formaOpcion.${n}` })).toBe(tarjetas[i]));
  });

  test('Moneda en la vista Íconos: dibujo con «Solo ícono» o sin estilo; nota y enlace con los demás estilos', () => {
    vista({ header_moneda: { estilo: 'icono' } });
    expect(screen.getByRole('radiogroup', { name: 'Ícono de moneda' })).toBeTruthy();
    document.body.innerHTML = '';
    vista({ header_moneda: { estilo: 'codigo' } });
    expect(screen.queryByRole('radiogroup', { name: 'Ícono de moneda' })).toBeNull();
    expect(screen.getByText('iconos.monedaSinDibujo')).toBeTruthy();
    expect(screen.getByRole('button', { name: /iconos.monedaCambiar/ })).toBeTruthy();
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

  test('Fondo de los íconos: plegado; abierto cambia la forma de la caja', () => {
    const { cambiar } = vista({ header_icons_box: { shape: 'circle', icon: 22 } });
    expect(document.querySelector('[data-fondo-iconos]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /iconos.fondo.titulo/ }));
    expect(document.querySelector('[data-fondo-iconos]')).not.toBeNull();
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'iconos.fondo.caja' })).getAllByRole('radio')[2]);
    expect(cambiar.mock.calls.at(-1)?.[0]).toMatchObject({ header_icons_box: { shape: 'square', icon: 22 } });
  });

  // Punto 4 (2026-11-23): el tamaño de la caja (Normal, 20, 22, 28 px) existía en Estilo › Íconos y
  // se había perdido en la vista unificada. Vuelve dentro de «Fondo de los íconos».
  test('Fondo de los íconos: el tamaño de la caja de siempre (Normal, 20, 22, 28 px) se ve y se cambia', () => {
    const { cambiar } = vista({ header_icons_box: { shape: 'circle', icon: 22 } });
    fireEvent.click(screen.getByRole('button', { name: /iconos.fondo.titulo/ }));
    const tamano = screen.getByRole('radiogroup', { name: 'iconos.fondo.tamanoCaja' });
    const chips = within(tamano).getAllByRole('radio');
    expect(chips).toHaveLength(4);
    expect(chips[2].getAttribute('aria-checked')).toBe('true');
    fireEvent.click(chips[3]);
    expect(cambiar).toHaveBeenLastCalledWith({ header_icons_box: { shape: 'circle', icon: 28 } });
    fireEvent.click(within(tamano).getByRole('radio', { name: 'iconos.fondo.tamanoNormal' }));
    expect(cambiar).toHaveBeenLastCalledWith({ header_icons_box: { shape: 'circle' } });
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

  test('beneficios editables (Figma E-A1): título y tres líneas con el texto de siempre de guía; vacío borra', () => {
    const { cambiar } = vista({ header_cuenta: { modo: 'panel', beneficio2: 'Lista de deseos' } });
    const titulo = screen.getByRole('textbox', { name: 'cuenta.beneficiosTitulo' }) as HTMLInputElement;
    expect(titulo.placeholder).toBe('Con tu cuenta puedes');
    expect(titulo.maxLength).toBe(40);
    const lineas = screen.getAllByRole('textbox', { name: 'cuenta.beneficioLinea' }) as HTMLInputElement[];
    expect(lineas).toHaveLength(3);
    expect(lineas.map((l) => l.value)).toEqual(['', 'Lista de deseos', '']);
    expect(lineas[0].placeholder).toBe('Ver tus pedidos y en qué va cada uno');
    expect(lineas[0].maxLength).toBe(80);
    expect(cambiar).not.toHaveBeenCalled();
    fireEvent.change(titulo, { target: { value: 'Ventajas' } });
    expect(cambiar).toHaveBeenLastCalledWith({ header_cuenta: { modo: 'panel', beneficio2: 'Lista de deseos', beneficiosTitulo: 'Ventajas' } });
    fireEvent.change(lineas[1], { target: { value: '' } });
    expect(cambiar).toHaveBeenLastCalledWith({ header_cuenta: { modo: 'panel' } });
  });

  test('beneficios apagados o ventana: sin campos de texto de los beneficios', () => {
    vista({ header_cuenta: { modo: 'panel', beneficios: false } });
    expect(screen.queryByRole('textbox', { name: 'cuenta.beneficiosTitulo' })).toBeNull();
  });

  test('«Texto con sesión»: solo con un estilo con texto; vacío = «Hola, {nombre}»', () => {
    vista({});
    expect(screen.queryByRole('textbox', { name: 'cuenta.textoSesion' })).toBeNull();
    document.body.innerHTML = '';
    const { cambiar } = vista({ header_iconos: { estilo: 'texto' } });
    const sesion = screen.getByRole('textbox', { name: 'cuenta.textoSesion' }) as HTMLInputElement;
    expect(sesion.placeholder).toBe('Hola, {nombre}');
    expect(sesion.maxLength).toBe(24);
    fireEvent.change(sesion, { target: { value: 'Bienvenida, {nombre}' } });
    expect(cambiar).toHaveBeenLastCalledWith({ header_cuenta: { textoSesion: 'Bienvenida, {nombre}' } });
    expect(screen.getByText('cuenta.textoAyuda')).toBeTruthy();
  });
});
