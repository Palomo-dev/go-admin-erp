/**
 * @jest-environment jsdom
 *
 * Kit del acceso v3 (docs/design/AUTH-ACCESO-V2.md §11 y §13): escena, tarjeta,
 * pasos, medidor y campo de contraseña, con nombres accesibles en el idioma activo.
 */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { EscenaAcceso, TarjetaAcceso, ProgresoPasos, MedidorFortaleza, CampoContrasena, AvisoAcceso } from '..';
import { evaluarContrasena } from '@/lib/auth/politicaContrasena';

describe('EscenaAcceso', () => {
  test('pinta la tarjeta, la marca, las preferencias y el pie con Términos, Privacidad y Ayuda', () => {
    renderConIdioma(
      <EscenaAcceso>
        <TarjetaAcceso titulo="Inicia sesión" descripcion="Entra con tu correo" />
      </EscenaAcceso>,
    );
    expect(screen.getByRole('region', { name: 'Inicia sesión' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Inicia sesión' })).toBeTruthy();
    expect(screen.getByText(/pequeño planeta/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Términos' }).getAttribute('href')).toBe('/terminos');
    expect(screen.getByRole('link', { name: 'Privacidad' }).getAttribute('href')).toBe('/privacy');
    expect(screen.getByRole('link', { name: 'Ayuda' }).getAttribute('href')).toMatch(/^mailto:/);
    expect(screen.getByRole('button', { name: /Idioma: Español/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /tema oscuro/i })).toBeTruthy();
  });

  test('en el paso de planes se ocultan la marca y el viajero', () => {
    const { container } = renderConIdioma(
      <EscenaAcceso mostrarMarca={false} mostrarViajero={false}>
        <TarjetaAcceso titulo="Plan" ancho="plan" />
      </EscenaAcceso>,
    );
    expect(screen.queryByText(/pequeño planeta/)).toBeNull();
    expect(container.querySelectorAll('svg[viewBox="0 0 320 360"]').length).toBe(0);
  });

  test('en inglés', () => {
    renderConIdioma(
      <EscenaAcceso>
        <div />
      </EscenaAcceso>,
      { idioma: 'en' },
    );
    expect(screen.getByRole('link', { name: 'Terms' })).toBeTruthy();
  });
});

describe('Piezas', () => {
  test('ProgresoPasos anuncia el paso', () => {
    renderConIdioma(<ProgresoPasos actual={2} total={6} etiqueta="Confirma tu correo" />);
    const barra = screen.getByRole('progressbar');
    expect(barra.getAttribute('aria-valuenow')).toBe('2');
    expect(barra.getAttribute('aria-valuetext')).toBe('Paso 2 de 6 · Confirma tu correo');
  });

  test('AvisoAcceso de error es una alerta', () => {
    renderConIdioma(<AvisoAcceso tono="error">Mal</AvisoAcceso>);
    expect(screen.getByRole('alert').textContent).toContain('Mal');
  });

  test('MedidorFortaleza muestra nivel y requisitos', () => {
    renderConIdioma(<MedidorFortaleza evaluacion={evaluarContrasena('corta', { correo: 'a@b.co' })} />);
    expect(screen.getByText('Seguridad: débil')).toBeTruthy();
    expect(screen.getByText('10 caracteres o más')).toBeTruthy();
    expect(screen.getByText('Distinta de tu correo')).toBeTruthy();
  });

  test('CampoContrasena: etiqueta, autocomplete y ojo con nombre accesible', () => {
    const onValor = jest.fn();
    renderConIdioma(<CampoContrasena etiqueta="Contraseña" valor="" onValor={onValor} modo="nueva" />);
    const campo = screen.getByLabelText('Contraseña') as HTMLInputElement;
    expect(campo.getAttribute('autocomplete')).toBe('new-password');
    expect(campo.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(campo.type).toBe('text');
    fireEvent.change(campo, { target: { value: 'x' } });
    expect(onValor).toHaveBeenCalledWith('x');
  });
});
