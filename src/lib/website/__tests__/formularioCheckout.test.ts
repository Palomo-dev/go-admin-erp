/**
 * Formulario del checkout (Parte F): la regla COMPARTIDA con la tienda
 * (src/lib/website/formularioCheckout.ts, copia byte a byte en goadmin-websites; allá la prueba
 * scripts/verify-formulario-checkout.mjs con el checkout real).
 */
import {
  CAMPOS_FORMULARIO,
  esFormularioRecomendado,
  faltantesPedido,
  formularioRecomendado,
  leerFormularioCheckout,
  ordenFormulario,
  resolverFormulario,
  validarFormularioCheckout,
  type AjusteCampoFormulario,
  type ClaveCampoFormulario,
} from '../formularioCheckout';

const completo = (cambios: Partial<Record<ClaveCampoFormulario, Partial<AjusteCampoFormulario>>> = {}, orden?: ClaveCampoFormulario[]): AjusteCampoFormulario[] => {
  const base = formularioRecomendado().map((c) => ({ clave: c.clave, visible: c.visible, obligatorio: c.obligatorio, ...(cambios[c.clave] ?? {}) }));
  return orden ? orden.map((k) => base.find((c) => c.clave === k) as AjusteCampoFormulario) : base;
};

describe('formularioCheckout (regla compartida con la tienda)', () => {
  test('sin configuración: null (la tienda usa su formulario de siempre)', () => {
    expect(resolverFormulario(null)).toBeNull();
    expect(resolverFormulario([])).toBeNull();
    expect(leerFormularioCheckout(null)).toBeNull();
    expect(leerFormularioCheckout({ campos: 'x' })).toBeNull();
    expect(faltantesPedido(null, {})).toEqual([]);
  });

  test('el recomendado es el de hoy, en el orden en que la tienda lo pinta', () => {
    expect(CAMPOS_FORMULARIO.map((c) => c.clave)).toEqual(['email', 'celular', 'nombre', 'factura', 'direccion', 'complemento', 'ciudad', 'barrio', 'notas']);
    expect(esFormularioRecomendado(resolverFormulario(completo()))).toBe(true);
  });

  test('indispensables: correo, nombre, dirección y municipio no se ocultan ni se vuelven opcionales', () => {
    const r = resolverFormulario((['email', 'nombre', 'direccion', 'ciudad'] as const).map((clave) => ({ clave, visible: false, obligatorio: false }))) ?? [];
    for (const k of ['email', 'nombre', 'direccion', 'ciudad']) {
      const c = r.find((x) => x.clave === k);
      expect([c?.visible, c?.obligatorio]).toEqual([true, true]);
    }
    expect(resolverFormulario([{ clave: 'barrio', visible: false }])?.find((c) => c.clave === 'barrio')?.visible).toBe(true);
    expect(resolverFormulario([{ clave: 'factura', obligatorio: true }])?.find((c) => c.clave === 'factura')?.obligatorio).toBe(false);
  });

  test('orden: una lista parcial solo permuta lo que nombra; las indicaciones no se mueven', () => {
    expect(ordenFormulario([{ clave: 'ciudad' }, { clave: 'direccion' }])).toEqual(['email', 'celular', 'nombre', 'factura', 'ciudad', 'complemento', 'direccion', 'barrio', 'notas']);
    expect(ordenFormulario([{ clave: 'notas' }, { clave: 'barrio' }, { clave: 'direccion' }]).at(-1)).toBe('notas');
  });

  test('PUT: rechaza candados rotos, claves y propiedades desconocidas y textos largos', () => {
    const errores = (raw: unknown) => {
      const v = validarFormularioCheckout(raw);
      return v.ok ? [] : v.errores.map((e) => `${e.codigo}:${e.clave ?? ''}:${e.propiedad ?? ''}`);
    };
    expect(errores({ version: 1, campos: completo({ email: { visible: false } }) })).toEqual(['fijo:email:visible']);
    expect(errores({ version: 1, campos: completo({ nombre: { obligatorio: false } }) })).toEqual(['fijo:nombre:obligatorio']);
    expect(errores({ version: 1, campos: [{ clave: 'hackeo' }] })).toEqual(['clave::']);
    expect(errores({ version: 1, campos: [{ clave: 'email', organization_id: 9 }] })).toEqual(['propiedad:email:organization_id']);
    expect(errores({ version: 1, campos: [{ clave: 'barrio', etiqueta: 'x'.repeat(61) }] })).toEqual(['largo:barrio:etiqueta']);
    expect(errores({ version: 1, campos: [{ clave: 'email' }], otra: 1 })).toEqual(['propiedad::otra']);
    expect(errores('x')).toEqual(['forma::']);
  });

  test('PUT válido: los 9 campos en su orden y los textos limpios; null = volver al de siempre', () => {
    const v = validarFormularioCheckout({ version: 1, campos: completo({ celular: { obligatorio: false, etiqueta: '  Celular  o WhatsApp ' } }, ['celular', 'email', 'nombre', 'factura', 'direccion', 'complemento', 'ciudad', 'barrio', 'notas']) });
    expect(v.ok).toBe(true);
    if (v.ok && v.formulario) {
      expect(v.formulario.campos.map((c) => c.clave)).toEqual(['celular', 'email', 'nombre', 'factura', 'direccion', 'complemento', 'ciudad', 'barrio', 'notas']);
      expect(v.formulario.campos[0]).toEqual({ clave: 'celular', visible: true, obligatorio: false, etiqueta: 'Celular o WhatsApp' });
    }
    expect(validarFormularioCheckout(null)).toEqual({ ok: true, formulario: null });
  });

  test('servidor: con configuración, los indispensables siempre y lo que el ERP volvió obligatorio', () => {
    const pedido = { email: 'a@b.co', phone: '+57 3001234567', firstName: 'Ana', address: 'Cra 7', city: 'Bogotá', notes: '', entrega: 'delivery' };
    expect(faltantesPedido(completo(), pedido)).toEqual([]);
    expect(faltantesPedido(completo(), { ...pedido, email: '', firstName: '', address: '', city: '' })).toEqual(['email', 'nombre', 'direccion', 'ciudad']);
    expect(faltantesPedido(completo(), { ...pedido, entrega: 'pickup', address: '', city: '' })).toEqual([]);
    expect(faltantesPedido(completo(), { ...pedido, phone: '+57' })).toEqual(['celular']);
    expect(faltantesPedido(completo({ celular: { visible: false } }), { ...pedido, phone: '' })).toEqual([]);
    expect(faltantesPedido(completo({ notas: { obligatorio: true } }), { ...pedido, notes: '[Factura electrónica] NIT 1' })).toEqual(['notas']);
  });
});
