/**
 * @jest-environment jsdom
 *
 * «Formulario del checkout» dentro de «Opciones del checkout» (Figma «16 Sitio web» › Checkout v2,
 * Parte F 3141-93709): lista por bloque, candados de los indispensables, cambios sin guardar,
 * diálogo de edición, vista previa y textos en los 4 idiomas.
 */
import { fireEvent, screen, within } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { DialogoCheckout } from '../../DialogoCheckout';
import type { AjustesCheckout } from '@/lib/website/ventasSitio.server';
import type { CambiosCheckout } from '../../estadoVentas';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

const base: AjustesCheckout = {
  modo: 'steps', tiposEntrega: ['pickup', 'delivery_own'], invitado: true, pedidoMinimo: null, sellos: true, listaSellos: [{ icono: '', texto: 'Compra segura' }],
  logosPago: true, ventaEnLinea: true, envioActivo: true, tarifaPlana: 8000, envioGratisDesde: 200000, barraPago: 'partido', pendienteMigracion: false,
};

function abrir(ajustes: AjustesCheckout = base, idioma: IdiomaPrueba = 'es') {
  const onGuardar = jest.fn<Promise<void>, [CambiosCheckout]>(async () => {});
  renderConIdioma(<DialogoCheckout abierto onAbiertoChange={jest.fn()} ajustes={ajustes} simboloMoneda="$" onGuardar={onGuardar} />, { idioma });
  return { dialogo: screen.getByRole('dialog'), onGuardar };
}

const fila = (clave: string) => document.querySelector(`[data-campo-formulario="${clave}"]`) as HTMLElement;

describe('Formulario del checkout (configurador)', () => {
  test('sin configuración: los 9 campos por bloque, «Sin cambios» y Guardar apagado', () => {
    const { dialogo } = abrir();
    expect(within(dialogo).getByText('Formulario del checkout')).toBeTruthy();
    const contacto = document.querySelector('[data-seccion-formulario="contacto"]') as HTMLElement;
    const entrega = document.querySelector('[data-seccion-formulario="entrega"]') as HTMLElement;
    expect([...contacto.querySelectorAll('[data-campo-formulario]')].map((e) => e.getAttribute('data-campo-formulario'))).toEqual(['email', 'celular', 'nombre', 'factura']);
    expect([...entrega.querySelectorAll('[data-campo-formulario]')].map((e) => e.getAttribute('data-campo-formulario'))).toEqual(['direccion', 'complemento', 'ciudad', 'barrio', 'notas']);
    expect(within(contacto).getByText('4 campos · 4 visibles')).toBeTruthy();
    expect(document.querySelector('[data-pie-checkout]')?.getAttribute('data-pie-checkout')).toBe('sin-cambios');
    expect((within(dialogo).getByRole('button', { name: 'Guardar cambios' }) as HTMLButtonElement).disabled).toBe(true);
  });

  test('indispensables con candado: el correo y el nombre no se apagan; el celular sí', () => {
    abrir();
    expect((within(fila('email')).getByRole('switch') as HTMLButtonElement).disabled).toBe(true);
    expect(within(fila('nombre')).queryByRole('combobox')).toBeNull();
    expect(fila('nombre').querySelector('[data-requisito-fijo]')).toBeTruthy();
    expect((within(fila('celular')).getByRole('switch') as HTMLButtonElement).disabled).toBe(false);
    expect(within(fila('email')).getByText(/confirmación, ficha del cliente y pasarelas/)).toBeTruthy();
  });

  test('ocultar el celular y volver opcional el apto: «2 cambios sin guardar», «Descartar» y guarda el formulario', async () => {
    const { dialogo, onGuardar } = abrir();
    fireEvent.click(within(fila('celular')).getByRole('switch'));
    fireEvent.change(within(fila('complemento')).getByRole('combobox'), { target: { value: 'obligatorio' } });
    expect(fila('celular').getAttribute('data-visible')).toBe('no');
    expect(within(fila('celular')).getAllByText(/Oculto en la tienda/).length).toBeGreaterThan(0);
    expect(document.querySelector('[data-pie-checkout]')?.textContent).toContain('2 cambios sin guardar');
    expect(within(dialogo).getByRole('button', { name: 'Descartar' })).toBeTruthy();
    // La vista previa ya no pinta el celular y el apto sale sin «(opcional)».
    const previa = document.querySelector('[data-vista-previa-formulario]') as HTMLElement;
    expect(previa.querySelector('[data-previa-campo="celular"]')).toBeNull();
    expect(within(previa).getByText('Apto, casa u oficina')).toBeTruthy();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));
    await Promise.resolve();
    expect(onGuardar).toHaveBeenCalledTimes(1);
    const enviado = onGuardar.mock.calls[0][0];
    expect(Object.keys(enviado)).toEqual(['formulario']);
    expect(enviado.formulario?.campos.find((c) => c.clave === 'celular')).toEqual({ clave: 'celular', visible: false, obligatorio: true });
    expect(enviado.formulario?.campos.find((c) => c.clave === 'complemento')?.obligatorio).toBe(true);
  });

  test('editar la etiqueta del celular (F4) y volver al texto recomendado', () => {
    abrir();
    fireEvent.click(within(fila('celular')).getAllByRole('button', { name: 'Editar «Celular con indicativo»' })[1]);
    const editar = document.querySelector('[data-dialogo-campo="celular"]') as HTMLElement;
    const etiqueta = within(editar).getByLabelText('Etiqueta') as HTMLInputElement;
    expect(etiqueta.value).toBe('Celular');
    fireEvent.change(etiqueta, { target: { value: 'Celular o WhatsApp' } });
    // renderConIdioma simula el ancho de computador: el diálogo (F4) guarda con «Guardar».
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    const previa = document.querySelector('[data-vista-previa-formulario]') as HTMLElement;
    expect(within(previa).getByText('Celular o WhatsApp')).toBeTruthy();
    expect(document.querySelector('[data-pie-checkout]')?.textContent).toContain('1 cambio sin guardar');
  });

  test('con una configuración guardada la lista sale en su orden y «Restablecer recomendado» pide confirmación', () => {
    const conConfig: AjustesCheckout = {
      ...base,
      formulario: [{ clave: 'nombre' }, { clave: 'email' }, { clave: 'celular', visible: false }],
    };
    abrir(conConfig);
    const contacto = document.querySelector('[data-seccion-formulario="contacto"]') as HTMLElement;
    expect([...contacto.querySelectorAll('[data-campo-formulario]')].map((e) => e.getAttribute('data-campo-formulario')).slice(0, 3)).toEqual(['nombre', 'email', 'celular']);
    fireEvent.click(screen.getByRole('button', { name: /Restablecer recomendado/ }));
    expect(screen.getByText('¿Volver al formulario recomendado?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer' }));
    expect([...contacto.querySelectorAll('[data-campo-formulario]')].map((e) => e.getAttribute('data-campo-formulario'))).toEqual(['email', 'celular', 'nombre', 'factura']);
    // Volver al recomendado es un cambio respecto a lo guardado.
    expect(document.querySelector('[data-pie-checkout]')?.getAttribute('data-pie-checkout')).toBe('cambios');
  });

  test.each<IdiomaPrueba>(['en', 'fr', 'pt'])('textos en %s (ninguna clave cruda)', (idioma) => {
    abrir(base, idioma);
    const texto = document.body.textContent ?? '';
    expect(texto).not.toMatch(/formularioCheckout|campos\.|motivos\.|vistaPrevia\./);
  });
});
