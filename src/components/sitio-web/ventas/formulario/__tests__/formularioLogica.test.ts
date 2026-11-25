/**
 * Configurador «Formulario del checkout» (Parte F): lógica pura del diálogo.
 */
import { validarCambiosCheckout, filaDeCambios } from '../../estadoVentas';
import {
  contarCambiosFormulario,
  erroresConfigurador,
  etiquetaEnTienda,
  filasIniciales,
  formularioParaGuardar,
  moverCampo,
  ponerObligatorio,
  ponerTextos,
  ponerVisible,
  restablecer,
  textosDe,
} from '../formularioLogica';

const claves = (f: { clave: string }[]) => f.map((x) => x.clave);

describe('formularioLogica', () => {
  test('sin configuración: el recomendado, sin cambios y se guarda como null', () => {
    const f = filasIniciales(null);
    expect(claves(f)).toEqual(['email', 'celular', 'nombre', 'factura', 'direccion', 'complemento', 'ciudad', 'barrio', 'notas']);
    expect(contarCambiosFormulario(f, f)).toBe(0);
    expect(formularioParaGuardar(f)).toBeNull();
  });

  test('mover: dentro de su bloque; las indicaciones no se mueven ni se saltan', () => {
    const f = filasIniciales(null);
    expect(claves(moverCampo(f, 'celular', 0)).slice(0, 4)).toEqual(['celular', 'email', 'nombre', 'factura']);
    expect(claves(moverCampo(f, 'direccion', 99)).slice(4)).toEqual(['complemento', 'ciudad', 'barrio', 'direccion', 'notas']);
    expect(claves(moverCampo(f, 'notas', 0))).toEqual(claves(f));
  });

  test('candados: el correo no se oculta, el nombre no se vuelve opcional', () => {
    const f = filasIniciales(null);
    expect(ponerVisible(f, 'email', false).find((x) => x.clave === 'email')?.visible).toBe(true);
    expect(ponerObligatorio(f, 'nombre', false).find((x) => x.clave === 'nombre')?.obligatorio).toBe(true);
    expect(ponerVisible(f, 'celular', false).find((x) => x.clave === 'celular')?.visible).toBe(false);
  });

  test('cambios sin guardar (F2): subir el celular, ocultar factura y barrio obligatorio = 3', () => {
    const f = filasIniciales(null);
    let g = moverCampo(f, 'celular', 0);
    g = ponerVisible(g, 'factura', false);
    g = ponerObligatorio(g, 'barrio', true);
    expect(contarCambiosFormulario(f, g)).toBe(3);
    expect(contarCambiosFormulario(f, restablecer())).toBe(0);
  });

  test('textos: igual al de la tienda = sin texto propio; ayuda vacía = sin ayuda', () => {
    const f = filasIniciales(null);
    const g = ponerTextos(f, 'celular', { etiqueta: 'Celular o WhatsApp', ayuda: '', placeholder: '300 123 4567' });
    const c = g.find((x) => x.clave === 'celular');
    expect([c?.etiqueta, c?.ayuda, c?.placeholder]).toEqual(['Celular o WhatsApp', null, '300 123 4567']);
    const h = ponerTextos(g, 'celular', textosDe(f.find((x) => x.clave === 'celular')!));
    expect(contarCambiosFormulario(f, h)).toBe(0);
    // La casilla de factura no tiene ejemplo.
    expect(ponerTextos(f, 'factura', { etiqueta: 'Factura', ayuda: 'x', placeholder: 'no' }).find((x) => x.clave === 'factura')?.placeholder).toBeUndefined();
  });

  test('vista previa: «(opcional)» se agrega solo con configuración; sin ella, las etiquetas de hoy', () => {
    const f = filasIniciales(null);
    const barrio = f.find((x) => x.clave === 'barrio')!;
    const apto = f.find((x) => x.clave === 'complemento')!;
    expect([etiquetaEnTienda(barrio, false), etiquetaEnTienda(apto, false)]).toEqual(['Barrio', 'Apto, casa u oficina (opcional)']);
    expect(etiquetaEnTienda(barrio, true)).toBe('Barrio (opcional)');
    expect(etiquetaEnTienda({ ...apto, obligatorio: true }, true)).toBe('Apto, casa u oficina');
  });

  test('error F3 (sin correo ni celular): no se puede producir con el correo fijo, pero la regla existe', () => {
    const f = filasIniciales(null);
    expect(erroresConfigurador(ponerVisible(f, 'celular', false))).toEqual([]);
    const sinNinguno = f.map((x) => (x.clave === 'email' || x.clave === 'celular' ? { ...x, visible: false } : x));
    expect(erroresConfigurador(sinNinguno)).toEqual([{ codigo: 'contacto', claves: ['email', 'celular'], seccion: 'contacto' }]);
  });

  test('PUT del checkout: el formulario viaja validado, el recomendado se guarda como null y no es una columna', () => {
    const f = ponerObligatorio(filasIniciales(null), 'barrio', true);
    const cuerpo = { formulario: formularioParaGuardar(f) };
    const v = validarCambiosCheckout(JSON.parse(JSON.stringify(cuerpo)));
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.cambios.formulario?.campos.find((c) => c.clave === 'barrio')?.obligatorio).toBe(true);
      expect(filaDeCambios(v.cambios)).toEqual({});
    }
    const rec = validarCambiosCheckout({ formulario: { version: 1, campos: filasIniciales(null).map(({ clave, visible, obligatorio }) => ({ clave, visible, obligatorio })) } });
    expect(rec.ok && rec.cambios.formulario).toBeNull();
    const malo = validarCambiosCheckout({ formulario: { version: 1, campos: [{ clave: 'email', visible: false }] } });
    expect(malo).toEqual({ ok: false, campos: ['formulario'] });
  });
});
