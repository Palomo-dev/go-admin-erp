/**
 * @jest-environment jsdom
 *
 * «Barra de pago en celular: A · B · C» del diálogo del checkout (Figma «16 Sitio web» 3059:80757):
 * tres tarjetas con miniatura, C por defecto, y los textos en los 4 idiomas.
 */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { SelectorBarraPago } from '../SelectorBarraPago';
import { diferenciasCheckout } from '../DialogoCheckout';
import type { AjustesCheckout } from '@/lib/website/ventasSitio.server';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

describe('SelectorBarraPago', () => {
  test('sin estilo guardado, C (botón partido) va elegida y marcada «por defecto»', () => {
    renderConIdioma(<SelectorBarraPago valor={null} onValorChange={jest.fn()} />);
    const opciones = screen.getAllByRole('radio');
    expect(opciones).toHaveLength(3);
    expect(opciones.map((o) => o.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true']);
    expect(opciones[2].textContent).toContain('C · Botón partido (por defecto)');
    expect(document.querySelectorAll('[data-miniatura-barra]')).toHaveLength(3);
  });

  test('elegir A avisa `dos_filas`', () => {
    const onValorChange = jest.fn();
    renderConIdioma(<SelectorBarraPago valor="partido" onValorChange={onValorChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /^A · Dos filas/ }));
    expect(onValorChange).toHaveBeenCalledWith('dos_filas');
  });

  test.each<IdiomaPrueba>(['en', 'fr', 'pt'])('textos en %s (ninguna clave cruda)', (idioma) => {
    renderConIdioma(<SelectorBarraPago valor="dos_lineas" onValorChange={jest.fn()} />, { idioma });
    const texto = document.body.textContent ?? '';
    expect(texto).not.toMatch(/barraPagoMovil|estilos\./);
    expect(screen.getAllByRole('radio')[1].getAttribute('aria-checked')).toBe('true');
  });

  test('el diálogo solo manda el estilo si cambió', () => {
    const base: AjustesCheckout = {
      modo: 'one_page', tiposEntrega: ['delivery_own'], invitado: true, pedidoMinimo: null, sellos: true, listaSellos: [],
      logosPago: true, ventaEnLinea: true, envioActivo: true, tarifaPlana: null, envioGratisDesde: null, barraPago: 'partido', pendienteMigracion: false,
    };
    expect(diferenciasCheckout(base, { ...base })).toEqual({});
    expect(diferenciasCheckout(base, { ...base, barraPago: 'dos_filas' })).toEqual({ barraPago: 'dos_filas' });
  });
});
