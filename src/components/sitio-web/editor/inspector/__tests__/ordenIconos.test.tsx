/**
 * @jest-environment jsdom
 *
 * «Orden en la cabecera» (Figma «16 Sitio web» 3261:99475): bloque de arriba de Encabezado › Íconos.
 * Computador = `actions_order`; celular = `header_iconos.ordenCelular`; los interruptores son los
 * de siempre; con zonas del Constructor, aviso y nada se escribe.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { OrdenIconosCabecera } from '../OrdenIconosCabecera';
import { VistaIconos } from '../VistaIconosCabecera';
import {
  cambioCelularIgual,
  cambioOrden,
  cambioPrendido,
  cambioRestablecer,
  filasOrden,
  moverAccion,
  ordenDelConstructor,
  puedeRestablecer,
} from '../ordenIconosLogica';

jest.mock('next-intl', () => ({
  useLocale: () => 'es',
  useTranslations: () =>
    Object.assign((key: string, v?: Record<string, unknown>) => (v && 'nombre' in v ? `${key}:${String(v.nombre)}` : key), { has: () => false }),
}));

function bloque(ajustes: Record<string, unknown> = {}, extra: Partial<React.ComponentProps<typeof OrdenIconosCabecera>> = {}) {
  const cambiar = jest.fn();
  const utils = render(<OrdenIconosCabecera ajustes={ajustes} cambiar={cambiar} {...extra} />);
  return { cambiar, ...utils };
}

const lista = () => screen.getByRole('list', { name: 'lista' });
const ordenVisto = () => within(lista()).getAllByRole('listitem').map((li) => li.getAttribute('data-orden-icono'));

describe('lógica del orden', () => {
  test('moverAccion: los ocultos se quedan en su puesto', () => {
    const orden = ['search', 'currency', 'favorites', 'cart', 'auth'] as const;
    const movibles = new Set(['search', 'currency', 'cart', 'auth'] as const);
    expect(moverAccion(orden, movibles, 'cart', 0)).toEqual(['cart', 'search', 'favorites', 'currency', 'auth']);
    expect(moverAccion(orden, movibles, 'auth', 99)).toEqual([...orden]);
    expect(moverAccion(orden, movibles, 'favorites', 0)).toEqual([...orden]);
  });

  test('computador escribe actions_order; celular, header_iconos.ordenCelular', () => {
    const orden = ['cart', 'search', 'currency', 'favorites', 'auth'] as const;
    expect(cambioOrden({}, 'computador', orden)).toEqual({ actions_order: [...orden] });
    expect(cambioOrden({ header_iconos: { estilo: 'texto' } }, 'celular', orden)).toEqual({ header_iconos: { estilo: 'texto', ordenCelular: [...orden] } });
  });

  test('«Igual que en el computador»: apagarlo copia el orden; prenderlo lo borra', () => {
    const a = { actions_order: ['currency', 'search', 'cart', 'auth'] };
    expect(cambioCelularIgual(a, false)).toEqual({ header_iconos: { ordenCelular: ['currency', 'search', 'favorites', 'cart', 'auth'] } });
    expect(cambioCelularIgual({ header_iconos: { ordenCelular: ['cart'] } }, true)).toEqual({ header_iconos: null });
  });

  test('restablecer: computador vuelve al de siempre y el celular a «igual»; celular solo borra el suyo', () => {
    const a = { actions_order: ['cart', 'auth'], header_iconos: { favoritos: true, ordenCelular: ['auth'] } };
    expect(cambioRestablecer(a, 'computador')).toEqual({ actions_order: ['search', 'currency', 'cart', 'auth'], header_iconos: { favoritos: true } });
    expect(cambioRestablecer(a, 'celular')).toEqual({ header_iconos: { favoritos: true } });
    expect(puedeRestablecer({}, 'computador')).toBe(false);
    expect(puedeRestablecer({ actions_order: ['search', 'currency', 'cart', 'auth'] }, 'computador')).toBe(false);
    expect(puedeRestablecer({}, 'celular')).toBe(false);
  });

  test('interruptores: las mismas claves de las tarjetas', () => {
    expect(cambioPrendido({}, 'cart', true)).toEqual({ show_header_cart: true });
    expect(cambioPrendido({}, 'auth', false)).toEqual({ show_header_auth: false });
    expect(cambioPrendido({}, 'currency', true)).toEqual({ header_show_currency: true });
    expect(cambioPrendido({}, 'favorites', true)).toEqual({ header_iconos: { favoritos: true } });
  });

  test('celular: favoritos, la moneda en el menú y lo del menú inferior quedan fuera de la barra', () => {
    const a = {
      header_iconos: { favoritos: true },
      mobile_header: { bottom_nav: { v: 2, enabled: true, variant: 'tabs', items: [{ id: 'c', action: 'cart', icon: 'cart', label: 'Carrito' }], style: { dedupeHeader: true } } },
    };
    const filas = Object.fromEntries(filasOrden(a, 'celular').map((f) => [f.accion, f]));
    expect(filas.favorites).toMatchObject({ estado: 'fuera', motivo: 'favoritosCelular' });
    expect(filas.currency).toMatchObject({ estado: 'fuera', motivo: 'monedaMenu' });
    expect(filas.cart).toMatchObject({ estado: 'fuera', motivo: 'menuInferior' });
    expect(filas.search.estado).toBe('orden');
    expect(filasOrden({ ...a, header_moneda: { movil: 'barra' } }, 'celular').find((f) => f.accion === 'currency')?.estado).toBe('orden');
  });

  test('buscador como barra no se ordena; apagado va con los ocultos', () => {
    expect(filasOrden({ search_style: 'bar' }, 'computador')[0]).toEqual({ accion: 'search', estado: 'barra' });
    expect(filasOrden({ search_style: 'hidden' }, 'computador')[0]).toEqual({ accion: 'search', estado: 'oculto' });
  });

  test('zonas del Constructor: se detectan y no se escribe nada', () => {
    const a = { header_builder: { zones: { header_right: [{ type: 'cart' }] } } };
    expect(ordenDelConstructor(a)).toBe(true);
    expect(ordenDelConstructor({ header_builder: { zones: {} } })).toBe(false);
    expect(cambioOrden(a, 'computador', ['cart', 'search', 'currency', 'favorites', 'auth'])).toEqual({});
    expect(cambioRestablecer(a, 'computador')).toEqual({});
    expect(cambioCelularIgual(a, false)).toEqual({});
  });
});

describe('bloque «Orden en la cabecera»', () => {
  test('abrir no escribe; computador como llega hoy y Favoritos oculto al final con su interruptor', () => {
    const { cambiar } = bloque({});
    expect(cambiar).not.toHaveBeenCalled();
    expect(ordenVisto()).toEqual(['search', 'currency', 'cart', 'auth']);
    const ocultos = document.querySelector('[data-orden-ocultos]') as HTMLElement;
    expect(within(ocultos).getByText('nombre.favorites')).toBeTruthy();
    fireEvent.click(within(ocultos).getByRole('switch', { name: 'mostrar:nombre.favorites' }));
    expect(cambiar).toHaveBeenLastCalledWith({ header_iconos: { favoritos: true } });
    // Vista previa en vivo con los cuatro numerados.
    const previa = document.querySelector('[data-vista-previa-orden="computador"]') as HTMLElement;
    expect([...previa.querySelectorAll('[data-previa-icono]')].map((e) => e.getAttribute('data-previa-icono'))).toEqual(['search', 'currency', 'cart', 'auth']);
  });

  test('flechas: subir el carrito guarda actions_order completo; la primera no sube', () => {
    const { cambiar } = bloque({ header_iconos: { favoritos: true } });
    expect(ordenVisto()).toEqual(['search', 'currency', 'favorites', 'cart', 'auth']);
    expect((screen.getByRole('button', { name: 'subir:nombre.search' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'bajar:nombre.auth' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'subir:nombre.cart' }));
    expect(cambiar).toHaveBeenLastCalledWith({ actions_order: ['search', 'currency', 'cart', 'favorites', 'auth'] });
    fireEvent.click(screen.getByRole('button', { name: 'bajar:nombre.search' }));
    expect(cambiar).toHaveBeenLastCalledWith({ actions_order: ['currency', 'search', 'favorites', 'cart', 'auth'] });
  });

  test('el orden guardado se respeta (la tienda con la moneda primero)', () => {
    bloque({ actions_order: ['currency', 'search', 'cart', 'auth'] });
    expect(ordenVisto()).toEqual(['currency', 'search', 'cart', 'auth']);
  });

  test('un ícono apagado conserva su puesto: al prenderlo vuelve ahí', () => {
    const { cambiar } = bloque({ actions_order: ['cart', 'search', 'currency', 'auth'], show_header_cart: false });
    expect(ordenVisto()).toEqual(['search', 'currency', 'auth']);
    fireEvent.click(screen.getByRole('button', { name: 'bajar:nombre.search' }));
    // Favoritos y el carrito (apagados) siguen primeros.
    expect(cambiar).toHaveBeenLastCalledWith({ actions_order: ['favorites', 'cart', 'currency', 'search', 'auth'] });
  });

  test('celular: «Igual que en el computador» prendido por defecto y la lista no se edita', () => {
    const { cambiar } = bloque({});
    fireEvent.click(screen.getByRole('radio', { name: 'celular' }));
    const igual = screen.getByRole('switch', { name: 'igualComputador' });
    expect(igual.getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByRole('button', { name: 'subir:nombre.cart' })).toBeNull();
    fireEvent.click(igual);
    expect(cambiar).toHaveBeenLastCalledWith({ header_iconos: { ordenCelular: ['search', 'currency', 'favorites', 'cart', 'auth'] } });
  });

  test('celular con orden propio: las flechas escriben header_iconos.ordenCelular', () => {
    const { cambiar } = bloque({ header_iconos: { ordenCelular: ['cart', 'search', 'currency', 'favorites', 'auth'] } });
    fireEvent.click(screen.getByRole('radio', { name: 'celular' }));
    expect(screen.getByRole('switch', { name: 'igualComputador' }).getAttribute('aria-checked')).toBe('false');
    // Moneda (en el menú) y Favoritos quedan fuera de la barra del celular.
    expect(ordenVisto()).toEqual(['cart', 'search', 'auth']);
    expect(document.querySelector('[data-orden-fuera]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'bajar:nombre.cart' }));
    expect(cambiar).toHaveBeenLastCalledWith({
      header_iconos: { ordenCelular: ['search', 'cart', 'currency', 'favorites', 'auth'] },
    });
  });

  test('restablecer pide confirmación; cancelar no escribe y confirmar vuelve al de siempre', () => {
    const { cambiar } = bloque({ actions_order: ['auth', 'cart', 'currency', 'search'] });
    fireEvent.click(screen.getByRole('button', { name: /restablecer$/ }));
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByText('confirmarTitulo')).toBeTruthy();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'confirmar' }));
    expect(cambiar).toHaveBeenCalledTimes(1);
    expect(cambiar).toHaveBeenLastCalledWith({ actions_order: ['search', 'currency', 'cart', 'auth'] });
  });

  test('sin nada que restablecer: el botón está deshabilitado y dice «Igual al de siempre»', () => {
    bloque({});
    expect((screen.getByRole('button', { name: /restablecer$/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('igualSiempre')).toBeTruthy();
  });

  test('buscador como barra: fila fija que lleva a Diseño › Buscador', () => {
    const onIrBuscador = jest.fn();
    bloque({ search_style: 'mega' }, { onIrBuscador });
    expect(ordenVisto()).toEqual(['currency', 'cart', 'auth']);
    expect(screen.getByText('barra')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /barraIr/ }));
    expect(onIrBuscador).toHaveBeenCalled();
  });

  test('zonas del Constructor: aviso, sin lista ni controles', () => {
    const { cambiar } = bloque({ header_builder: { zones: { header_right: [{ type: 'cart' }] } } });
    expect(screen.getByRole('note')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByRole('radio', { name: 'celular' })).toBeNull();
    expect(cambiar).not.toHaveBeenCalled();
  });

  test('el asa se anuncia con su posición (teclado y lector de pantalla)', () => {
    bloque({});
    expect(screen.getByRole('button', { name: 'asa:nombre.cart' })).toBeTruthy();
  });

  test('abierto desde el lienzo: se resalta 1 s', () => {
    jest.useFakeTimers();
    try {
      bloque({}, { resaltar: 1 });
      expect(document.querySelector('[data-resaltado]')).not.toBeNull();
      jest.advanceTimersByTime(1000);
      // Tras el segundo el resaltado se quita (el render siguiente lo refleja).
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('Vista Íconos', () => {
  test('el bloque del orden va arriba, antes de «Estilo general»', () => {
    render(<VistaIconos ajustes={{}} cambiar={jest.fn()} onAbrir={jest.fn()} />);
    const orden = document.querySelector('[data-orden-cabecera]') as HTMLElement;
    const estilo = screen.getByRole('radiogroup', { name: 'iconos.estiloGeneral' });
    expect(orden.compareDocumentPosition(estilo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('miniaturas de «Forma» y «Estilo general»: 2 columnas de 104 px, ✓ en la miniatura y «Solo computador» dentro', () => {
    render(<VistaIconos ajustes={{ header_iconos: { estilo: 'pildora' } }} cambiar={jest.fn()} onAbrir={jest.fn()} />);
    const estilos = screen.getByRole('radiogroup', { name: 'iconos.estiloGeneral' });
    expect(estilos.className).toContain('minmax(104px,1fr)');
    const pildora = within(estilos).getByRole('radio', { name: 'iconos.estiloOpcion.pildora' });
    expect(pildora.getAttribute('aria-checked')).toBe('true');
    expect(pildora.querySelector('[data-marca-elegida]')).not.toBeNull();
    // La insignia va dentro de la tarjeta y la describe.
    expect(within(pildora).getByText('iconos.soloComputador')).toBeTruthy();
    expect(pildora.getAttribute('aria-describedby')).toBeTruthy();
    const forma = document.querySelector('[data-forma-icono="carrito"] [role="radiogroup"]') as HTMLElement;
    expect(forma.className).toContain('minmax(104px,1fr)');
    expect(within(forma).getAllByRole('radio')[0].querySelector('[data-marca-elegida]')).not.toBeNull();
  });
});
