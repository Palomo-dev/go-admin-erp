/**
 * @jest-environment jsdom
 *
 * Vistas «Encabezado › Íconos / Selector de moneda / Carrito» (Figma 2754:59674, 2757:60344,
 * 2754:60110): leen lo que ya tiene el sitio (sin escribir al abrir) y cada control arma el cambio
 * del documento (`header_iconos`, `header_moneda`, `header_carrito`).
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { VistaCarrito, VistaIconos, VistaMoneda } from '../CabeceraTiendaVistas';

jest.mock('next-intl', () => ({
  useLocale: () => 'es',
  useTranslations: () => Object.assign((key: string) => key, { has: () => false }),
}));

// Monedas de la tienda sin red: COP base, USD y EUR.
jest.mock('@/lib/services/monedaOrganizacion', () => ({ resolveOrgCurrency: async () => ({ code: 'COP' }) }));
jest.mock('@/lib/supabase/config', () => {
  const respuesta = (data: unknown) => ({
    eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { currency_code: 'COP' } }) }), then: (r: (v: unknown) => void) => r({ data }) }),
  });
  return {
    supabase: {
      from: (tabla: string) => ({
        select: () =>
          tabla === 'countries'
            ? respuesta([{ default_currency_code: 'COP' }, { default_currency_code: 'USD' }, { default_currency_code: 'EUR' }])
            : respuesta(null),
      }),
    },
  };
});

describe('Encabezado › Íconos', () => {
  test('abrir no escribe nada; elegir «Píldora» guarda el estilo nuevo', () => {
    const cambiar = jest.fn();
    render(<VistaIconos ajustes={{}} cambiar={cambiar} onAbrir={jest.fn()} />);
    expect(cambiar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: 'iconos.estiloOpcion.pildora' }));
    expect(cambiar).toHaveBeenLastCalledWith({ header_iconos: { estilo: 'pildora' } });
  });

  test('un sitio con el círculo de acento aparece en «Círculo»', () => {
    render(<VistaIconos ajustes={{ header_icons_circle: true }} cambiar={jest.fn()} onAbrir={jest.fn()} />);
    expect(screen.getByRole('radio', { name: 'iconos.estiloOpcion.circulo' }).getAttribute('aria-checked')).toBe('true');
  });

  test('«Cambiar cómo se ve el selector» abre la vista de la moneda (Figma 2830:75542)', () => {
    const onAbrir = jest.fn();
    render(<VistaIconos ajustes={{}} cambiar={jest.fn()} onAbrir={onAbrir} />);
    fireEvent.click(screen.getByText('iconos.monedaCambiar'));
    expect(onAbrir).toHaveBeenCalledWith('moneda');
  });
});

describe('Encabezado › Selector de moneda', () => {
  test('elegir «Bandera + código» guarda el estilo; la base no se puede desmarcar', async () => {
    const cambiar = jest.fn();
    render(<VistaMoneda ajustes={{}} cambiar={cambiar} organizationId={1} />);
    fireEvent.click(screen.getByRole('radio', { name: 'moneda.estiloOpcion.bandera' }));
    expect(cambiar).toHaveBeenLastCalledWith({ header_moneda: { estilo: 'bandera' } });
    const base = await screen.findByRole('checkbox', { name: /COP/ });
    expect(base.hasAttribute('disabled')).toBe(true);
    fireEvent.click(await screen.findByRole('checkbox', { name: /EUR/ }));
    expect(cambiar).toHaveBeenLastCalledWith({ header_moneda: { visibles: ['COP', 'USD'] } });
  });

  // Queja del dueño 2026-11-23: con «Solo ícono» la vista de la moneda no ofrecía el dibujo.
  test('«Solo ícono» muestra el dibujo de la moneda: el mismo dato que la tarjeta Moneda de «Íconos»', async () => {
    const cambiar = jest.fn();
    render(<VistaMoneda ajustes={{ header_moneda: { estilo: 'icono' }, currency_icon: 'coins' }} cambiar={cambiar} organizationId={1} />);
    await screen.findByRole('checkbox', { name: /COP/ });
    const dibujo = screen.getByRole('radiogroup', { name: 'Ícono de moneda' });
    expect(within(dibujo).getByRole('radio', { name: 'Monedas' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(dibujo).getByRole('radio', { name: 'Billetera' }));
    expect(cambiar).toHaveBeenLastCalledWith({ currency_icon: 'wallet' });
    expect(screen.getByText('moneda.dibujoAyuda')).toBeTruthy();
  });

  test('sin estilo (lo de hoy) también se ofrece el dibujo; con «Bandera + código», no', async () => {
    render(<VistaMoneda ajustes={{}} cambiar={jest.fn()} organizationId={1} />);
    await screen.findByRole('checkbox', { name: /COP/ });
    expect(screen.getByRole('radiogroup', { name: 'Ícono de moneda' })).toBeTruthy();
    document.body.innerHTML = '';
    render(<VistaMoneda ajustes={{ header_moneda: { estilo: 'bandera' } }} cambiar={jest.fn()} organizationId={1} />);
    await screen.findByRole('checkbox', { name: /COP/ });
    expect(screen.queryByRole('radiogroup', { name: 'Ícono de moneda' })).toBeNull();
  });

  test('lo elegido en la vista de la moneda se ve marcado en la tarjeta Moneda de «Íconos»', () => {
    render(<VistaIconos ajustes={{ currency_icon: 'wallet' }} cambiar={jest.fn()} onAbrir={jest.fn()} />);
    const dibujo = screen.getByRole('radiogroup', { name: 'Ícono de moneda' });
    expect(within(dibujo).getByRole('radio', { name: 'Billetera' }).getAttribute('aria-checked')).toBe('true');
  });
});

describe('Encabezado › Carrito', () => {
  test('sin documento muestra el botón de la fila legacy (texto fijo) y no escribe al abrir', () => {
    const cambiar = jest.fn();
    render(<VistaCarrito ajustes={{ cart_button_mode: 'fixed', cart_button_texts: ['Pagar ya'] }} cambiar={cambiar} enBorrador />);
    expect(cambiar).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: 'carrito.modos.fijo.titulo' }).getAttribute('aria-checked')).toBe('true');
  });

  test('pasar a «Dinámico» guarda la forma extensible en el documento', () => {
    const cambiar = jest.fn();
    render(<VistaCarrito ajustes={{ cart_button_mode: 'fixed', cart_button_texts: ['Pagar ya', 'Otro'] }} cambiar={cambiar} enBorrador />);
    fireEvent.click(screen.getByRole('radio', { name: 'carrito.modos.al_abrir.titulo' }));
    expect(cambiar).toHaveBeenLastCalledWith({ header_carrito: { boton: { modo: 'al_abrir', textos: ['Pagar ya', 'Otro'], orden: 'azar' } } });
  });

  test('sin borrador también escribe las columnas de siempre', () => {
    const cambiar = jest.fn();
    render(<VistaCarrito ajustes={{}} cambiar={cambiar} enBorrador={false} />);
    fireEvent.click(screen.getByRole('radio', { name: 'carrito.modos.fijo.titulo' }));
    expect(cambiar.mock.calls[0][0]).toMatchObject({ cart_button_mode: 'fixed' });
  });
});
