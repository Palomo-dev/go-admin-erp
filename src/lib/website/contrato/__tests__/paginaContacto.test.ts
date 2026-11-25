/**
 * Contrato de «Contacto v2 editable» (Figma 3104:84056). La tienda copia este archivo tal cual
 * (`npm run verify:copias`) y su script `verify-contacto.mjs` prueba lo mismo del lado del sitio.
 */
import {
  CAMPOS_CONTACTO_POR_DEFECTO,
  ID_FORMULARIO_RESPALDO,
  VARIANTE_FORMULARIO_TARJETA,
  camposDeSeccion,
  camposFaltantes,
  camposVisibles,
  datosContactoDe,
  enlaceCanalPropio,
  leerCamposContacto,
  leerCanales,
  origenCrm,
  redesDeSeccion,
  redesDelSitio,
  seccionesContactoPorDefecto,
  textoConDatos,
  valorDeCanal,
} from '../paginaContacto';

describe('canales de contacto', () => {
  it('sin `channels` salen los cuatro canales por defecto, con el dato de la organización', () => {
    const canales = leerCanales(undefined);
    expect(canales.map((c) => c.type)).toEqual(['whatsapp', 'phone', 'email', 'address']);
    expect(canales.every((c) => c.visible && c.source === 'org')).toBe(true);
    expect(canales[0].message).toBe('Hola, vengo de la página de contacto');
  });

  it('lo del sitio gana sobre lo de la organización y la ciudad se suma a la dirección', () => {
    const datos = datosContactoDe(
      { phone: '601 111', email: 'org@x.co', address: 'Cra. 15 # 93-60', city: 'Bogotá' },
      { whatsapp_number: '3001234567', contact_phone: '601 745 0000', contact_email: '' },
    );
    expect(datos).toEqual({ whatsapp: '3001234567', telefono: '601 745 0000', correo: 'org@x.co', direccion: 'Cra. 15 # 93-60, Bogotá' });
  });

  it('texto propio solo cambia esta sección; un canal sin dato no sale', () => {
    const [w, p] = leerCanales([{ type: 'whatsapp', visible: true }, { type: 'phone', source: 'own', value: '(601) 745 0000 · ext. 2' }]);
    expect(valorDeCanal(w, {})).toBeNull();
    expect(valorDeCanal(p, { telefono: '1' })).toBe('(601) 745 0000 · ext. 2');
  });

  it('canal propio: solo enlaces seguros', () => {
    expect(enlaceCanalPropio('https://ig.me/m/tienda')).toBe('https://ig.me/m/tienda');
    expect(enlaceCanalPropio('tel:018000')).toBe('tel:018000');
    expect(enlaceCanalPropio('/sedes')).toBe('/sedes');
    expect(enlaceCanalPropio('javascript:alert(1)')).toBeNull();
    expect(enlaceCanalPropio('//otro.com')).toBeNull();
  });

  it('tipos desconocidos se descartan y los ids no se repiten', () => {
    const canales = leerCanales([{ type: 'fax' }, { type: 'custom', id: 'a' }, { type: 'custom', id: 'a' }]);
    expect(canales).toHaveLength(2);
    expect(new Set(canales.map((c) => c.id)).size).toBe(2);
  });
});

describe('redes sociales', () => {
  it('lee URL completas y usuarios; twitter es X; lo que no sirve se descarta', () => {
    const redes = redesDelSitio({ instagram: '@tienda', facebook: 'https://facebook.com/tienda', twitter: 'https://twitter.com/tienda', tiktok: 'no vale con espacios', whatsapp: '+573001234567' });
    expect(redes.map((r) => r.id)).toEqual(['instagram', 'facebook', 'x']);
    expect(redes[0]).toEqual({ id: 'instagram', nombre: 'Instagram', href: 'https://instagram.com/tienda', usuario: '@tienda' });
    expect(redes[1].usuario).toBe('/tienda');
  });

  it('`networks` elige y ordena; sin la clave, todas', () => {
    const links = { instagram: '@a', youtube: '@b' };
    expect(redesDeSeccion(links, undefined).map((r) => r.id)).toEqual(['instagram', 'youtube']);
    expect(redesDeSeccion(links, ['youtube']).map((r) => r.id)).toEqual(['youtube']);
    expect(redesDeSeccion(links, ['x'])).toEqual([]);
    expect(redesDelSitio(null)).toEqual([]);
  });
});

describe('campos del formulario', () => {
  it('lo guardado antes (sin `visible`) se lee igual: todos visibles, nombre y correo obligatorios', () => {
    const campos = leerCamposContacto([{ name: 'phone', label: 'Teléfono', type: 'tel' }, { label: 'Ciudad', required: true }])!;
    expect(campos.map((c) => c.name)).toEqual(['name', 'email', 'phone', 'ciudad']);
    expect(campos.every((c) => c.visible)).toBe(true);
    expect(campos.filter((c) => c.required).map((c) => c.name)).toEqual(['name', 'email', 'ciudad']);
  });

  it('nombre y correo no se ocultan; la casilla de datos visible siempre es obligatoria', () => {
    const campos = leerCamposContacto([
      { name: 'name', visible: false, required: false },
      { name: 'email', visible: false },
      { name: 'consent', type: 'consent', visible: true, required: false },
      { name: 'company', visible: false },
    ])!;
    expect(campos.find((c) => c.name === 'name')).toMatchObject({ visible: true, required: true });
    expect(campos.find((c) => c.name === 'consent')).toMatchObject({ required: true, estandar: null });
    expect(camposVisibles(campos).map((c) => c.name)).toEqual(['name', 'email', 'consent']);
  });

  it('sin `form_fields`: la tarjeta con horario usa los de la página Contacto; las variantes viejas, los de siempre', () => {
    expect(camposDeSeccion({}, 'split')).toBeNull();
    const tarjeta = camposDeSeccion({}, VARIANTE_FORMULARIO_TARJETA)!;
    expect(tarjeta.map((c) => c.name)).toEqual(CAMPOS_CONTACTO_POR_DEFECTO.map((c) => c.name));
    expect(tarjeta.find((c) => c.name === 'subject')).toMatchObject({ type: 'select', options: ['Un pedido', 'Garantía', 'Ventas al por mayor', 'Otro'] });
  });

  it('misma regla de obligatorios en el navegador y en el servidor', () => {
    const campos = camposDeSeccion({}, VARIANTE_FORMULARIO_TARJETA)!;
    expect(camposFaltantes(campos, { name: 'Laura', email: 'l@x.co' })).toEqual(['message', 'consent']);
    expect(camposFaltantes(campos, { name: 'Laura', email: 'l@x.co', message: 'Hola', consent: true })).toEqual([]);
    // Un campo oculto nunca se exige.
    const sinMensaje = leerCamposContacto([{ name: 'message', required: true, visible: false }])!;
    expect(camposFaltantes(sinMensaje, { name: 'a', email: 'b@c.co' })).toEqual([]);
    // Campos propios obligatorios: por su nombre en `extra`.
    const propio = leerCamposContacto([{ label: 'Ciudad', required: true }])!;
    expect(camposFaltantes(propio, { name: 'a', email: 'b@c.co', extra: { ciudad: 'Cali' } })).toEqual([]);
    expect(camposFaltantes(propio, { name: 'a', email: 'b@c.co', extra: {} })).toEqual(['ciudad']);
  });
});

describe('mensaje de enviado y origen', () => {
  it('{nombre} es el primer nombre y {correo} el correo', () => {
    expect(textoConDatos('Gracias, {nombre}. Te respondemos a {correo}.', { nombre: 'Laura Pérez', correo: 'laura@correo.com' })).toBe(
      'Gracias, Laura. Te respondemos a laura@correo.com.',
    );
  });

  it('origen en el CRM: texto corto, sin caracteres de control', () => {
    expect(origenCrm('  Página Contacto ')).toBe('Página Contacto');
    expect(origenCrm('')).toBeNull();
    expect(origenCrm(5)).toBeNull();
  });
});

describe('página Contacto por defecto', () => {
  it('mismo orden que el diseño; las preguntas solo en el editor', () => {
    expect(seccionesContactoPorDefecto().map((s) => `${s.section_type}:${s.section_variant}`)).toEqual([
      'hero:page_header',
      'contact_channels:cards',
      'contact_form:card_hours',
      'hours_location:hours_map',
      'social_networks:row',
    ]);
    expect(seccionesContactoPorDefecto({ conPreguntas: true }).map((s) => s.section_type)).toContain('faq');
  });

  it('el id del formulario de respaldo no puede chocar con un uuid de sección', () => {
    expect(/^[0-9a-f-]{1,64}$/i.test(ID_FORMULARIO_RESPALDO)).toBe(false);
  });
});
