/**
 * Widget de chat del sitio web — reglas puras de la Edge Function `chat-widget`.
 *
 * Se importa SIN extensión (Jest) lo que Deno importa CON extensión: un solo
 * archivo de lógica, dos runtimes (igual que `_shared/ai-chat`).
 */
import {
  clavePublicaValida,
  hostsDeLaOrganizacion,
  limpiarTexto,
  mensajeParaVisitante,
  normalizarConfiguracion,
  normalizarDominio,
  origenPermitido,
  relojDeLaZona,
  tokenValido,
  urlSegura,
  validarDatosVisitante,
  type FilaMensaje,
} from '../../../supabase/functions/_shared/chat-widget/reglas';
import { dentroDeHorarioLaboral } from '../../../supabase/functions/_shared/ai-chat/politicaRespuesta';

describe('chat-widget · texto y URL', () => {
  it('quita caracteres de control y direccionales, conserva saltos y recorta', () => {
    expect(limpiarTexto('  hola\u0000‮mundo\r\nadiós  ', 100)).toBe('holamundo\nadiós');
    expect(limpiarTexto('a\n\n\n\n\n\nb', 100)).toBe('a\n\n\nb');
    expect(limpiarTexto('😀😀😀', 2)).toBe('😀😀');
    expect(limpiarTexto(42, 10)).toBe('');
  });

  it('no escapa HTML: se guarda tal cual y el cliente lo pinta como texto', () => {
    expect(limpiarTexto('<img src=x onerror=alert(1)>', 100)).toBe('<img src=x onerror=alert(1)>');
  });

  it('solo acepta URL http(s) sin credenciales', () => {
    expect(urlSegura('https://tienda.com/a?b=1')).toBe('https://tienda.com/a?b=1');
    expect(urlSegura('javascript:alert(1)')).toBeNull();
    expect(urlSegura('data:text/html,hola')).toBeNull();
    expect(urlSegura('http://x.com', true)).toBeNull();
    expect(urlSegura('https://user:pass@x.com')).toBeNull();
  });

  it('valida la forma de clave pública y token', () => {
    expect(clavePublicaValida('pk_' + 'a'.repeat(32))).toBe(true);
    expect(clavePublicaValida("pk_abc'); alert(1);//")).toBe(false);
    expect(tokenValido('x'.repeat(43))).toBe(true);
    expect(tokenValido('corto')).toBe(false);
  });
});

describe('chat-widget · origen permitido', () => {
  const propios = hostsDeLaOrganizacion('demo', ['Tienda-Propia.com', 'https://otra.co/']);

  it('normaliza lo que escribe la organización', () => {
    expect(normalizarDominio('https://www.Tienda.com/ruta')).toBe('www.tienda.com');
    expect(normalizarDominio('*.tienda.com')).toBe('tienda.com');
    expect(normalizarDominio('tienda.com:8443')).toBe('tienda.com');
    expect(normalizarDominio('no es dominio')).toBeNull();
  });

  it('sin dominios configurados acepta cualquier página (código pegado en cualquier sitio)', () => {
    expect(origenPermitido('https://cualquiera.net', [], propios)).toBe(true);
    expect(origenPermitido(null, [], propios)).toBe(true);
  });

  it('con dominios: esos, sus subdominios y los sitios GO Admin de la organización', () => {
    const dominios = ['mitienda.com'];
    expect(origenPermitido('https://mitienda.com', dominios, propios)).toBe(true);
    expect(origenPermitido('https://www.mitienda.com', dominios, propios)).toBe(true);
    expect(origenPermitido('https://demo.goadmin.io', dominios, propios)).toBe(true);
    expect(origenPermitido('https://sede.demo.goadmin.io', dominios, propios)).toBe(true);
    expect(origenPermitido('https://tienda-propia.com', dominios, propios)).toBe(true);
  });

  it('rechaza imitaciones y peticiones sin Origin', () => {
    const dominios = ['mitienda.com'];
    expect(origenPermitido('https://mitienda.com.evil.io', dominios, propios)).toBe(false);
    expect(origenPermitido('https://evilmitienda.com', dominios, propios)).toBe(false);
    expect(origenPermitido('https://demo.evil.io', dominios, propios)).toBe(false);
    expect(origenPermitido('https://otrodemo.goadmin.io', dominios, propios)).toBe(false);
    expect(origenPermitido(null, dominios, propios)).toBe(false);
    expect(origenPermitido('null', dominios, propios)).toBe(false);
  });
});

describe('chat-widget · horario en la zona de la organización', () => {
  const horario = { lunes: { open: '08:00', close: '18:00' }, domingo: { closed: true } };

  it('reutiliza dentroDeHorarioLaboral con la hora de pared de la zona', () => {
    // Lunes 2026-11-02 12:30 UTC = 07:30 en Bogotá: antes de abrir.
    const ahora = new Date('2026-11-02T12:30:00Z');
    expect(dentroDeHorarioLaboral(horario, ahora)).toBe(true); // en UTC parecería abierto
    expect(dentroDeHorarioLaboral(horario, relojDeLaZona(ahora, 'America/Bogota'))).toBe(false);
    // 14:00 en Bogotá: abierto.
    expect(dentroDeHorarioLaboral(horario, relojDeLaZona(new Date('2026-11-02T19:00:00Z'), 'America/Bogota'))).toBe(true);
  });

  it('el día también es el de la zona (lunes 01:00 UTC es domingo en Bogotá)', () => {
    const reloj = relojDeLaZona(new Date('2026-11-02T01:00:00Z'), 'America/Bogota');
    expect(reloj.getUTCDay()).toBe(0);
    expect(dentroDeHorarioLaboral(horario, reloj)).toBe(false);
  });

  it('sin horario no decide (null): el widget se muestra «en línea»', () => {
    expect(dentroDeHorarioLaboral({}, relojDeLaZona(new Date(), 'America/Bogota'))).toBeNull();
  });

  it('una zona inválida cae en America/Bogota', () => {
    const a = relojDeLaZona(new Date('2026-11-02T19:00:00Z'), 'Zona/Inventada');
    expect(a.getUTCHours()).toBe(14);
  });
});

describe('chat-widget · configuración pública del canal', () => {
  it('lee la forma actual del ERP (position/style/behavior)', () => {
    const c = normalizarConfiguracion(
      {
        position: { side: 'left', vertical: 'top', offsetX: 30, offsetY: 999 },
        style: { primaryColor: '#10B981', iconType: 'support', iconStyle: 'filled', buttonSize: 64, borderRadius: 12, shadowEnabled: false },
        behavior: {
          title: 'Soporte', welcomeMessage: 'Hola', openDefaultView: 'faq', showQuickActions: true,
          quickActions: [{ label: 'Ver catálogo', action: 'https://tienda.com/catalogo' }, { label: 'Pedido', action: 'Mi pedido' }, { label: '', action: 'x' }],
          offlineMessage: 'Cerrado', offlineCollectData: false,
        },
      },
      'ignorado',
      { name: true, email: true, phone: false, required: { email: true, phone: true } },
    );
    expect(c.posicion).toEqual({ lado: 'left', vertical: 'top', x: 30, y: 200 });
    expect(c.estilo).toMatchObject({ colorPrincipal: '#10B981', icono: 'support', iconoRelleno: true, tamano: 64, radio: 12, sombra: 'none' });
    expect(c.titulo).toBe('Soporte');
    expect(c.bienvenida).toBe('Hola');
    expect(c.vistaInicial).toBe('faq');
    expect(c.acciones).toEqual([
      { etiqueta: 'Ver catálogo', accion: 'https://tienda.com/catalogo', url: 'https://tienda.com/catalogo' },
      { etiqueta: 'Pedido', accion: 'Mi pedido', url: null },
    ]);
    expect(c.fueraDeHorario).toEqual({ mensaje: 'Cerrado', pedirDatos: false });
    // Un campo no pedido nunca es obligatorio.
    expect(c.campos.telefono).toEqual({ pedir: false, obligatorio: false });
    expect(c.campos.correo).toEqual({ pedir: true, obligatorio: true });
  });

  it('lee la forma antigua (primary_color, position cadena, logo_url) y welcome_message', () => {
    const c = normalizarConfiguracion({ primary_color: '#8B5CF6', position: 'bottom-left', logo_url: 'https://cdn.x.com/logo.png' }, '¡Bienvenido!', null);
    expect(c.estilo.colorPrincipal).toBe('#8B5CF6');
    expect(c.posicion.lado).toBe('left');
    expect(c.avatar).toBe('https://cdn.x.com/logo.png');
    expect(c.bienvenida).toBe('¡Bienvenido!');
    expect(c.acciones).toEqual([]);
  });

  it('descarta valores peligrosos: color con CSS, icono javascript:, acciones ocultas', () => {
    const c = normalizarConfiguracion(
      { style: { primaryColor: 'red;}</style><script>', iconType: 'custom', iconUrl: 'javascript:alert(1)' }, behavior: { quickActions: [{ label: 'a', action: 'b' }] } },
      null,
      null,
      'http://inseguro.com/logo.png',
    );
    expect(c.estilo.colorPrincipal).toBe('#3B82F6');
    expect(c.estilo.icono).toBe('chat');
    expect(c.estilo.iconoUrl).toBeNull();
    expect(c.avatar).toBeNull();
    expect(c.acciones).toEqual([]); // showQuickActions no está en true
  });
});

describe('chat-widget · datos del visitante', () => {
  const campos = normalizarConfiguracion({}, null, { name: true, email: true, phone: true, required: { name: true } }).campos;

  it('exige los obligatorios y valida formato', () => {
    expect(validarDatosVisitante({ correo: 'no-es-correo', telefono: '12' }, campos)).toEqual({ ok: false, errores: ['correo', 'telefono', 'nombre'] });
  });

  it('limpia y devuelve solo lo que el canal pide', () => {
    const r = validarDatosVisitante({ nombre: '  Ana   María ', correo: 'ANA@Correo.co', telefono: '300 123 4567', empresa: 'X' }, campos);
    expect(r).toEqual({ ok: true, datos: { nombre: 'Ana María', correo: 'ana@correo.co', telefono: '3001234567', empresa: null } });
  });

  it('el correo ficticio del widget nunca cuenta como correo real', () => {
    expect(validarDatosVisitante({ nombre: 'A', correo: 'visitor_1@widget.local' }, campos)).toEqual({ ok: false, errores: ['correo'] });
  });
});

describe('chat-widget · mensajes que ve el visitante', () => {
  const base: FilaMensaje = { id: 'm1', role: 'agent', direction: 'outbound', content_type: 'text', content: 'Hola', created_at: '2026-11-03T10:00:00+00:00', metadata: {} };

  it('traduce autor y conserva el texto tal cual', () => {
    expect(mensajeParaVisitante(base)).toMatchObject({ id: 'm1', autor: 'agente', tipo: 'text', texto: 'Hola' });
    expect(mensajeParaVisitante({ ...base, role: 'ai' })?.autor).toBe('ia');
    expect(mensajeParaVisitante({ ...base, role: 'customer', direction: 'inbound', metadata: { client_id: 'abc123' } })).toMatchObject({ autor: 'visitante', idCliente: 'abc123' });
  });

  it('oculta mensajes de sistema, notas internas y direcciones incoherentes', () => {
    expect(mensajeParaVisitante({ ...base, role: 'system' })).toBeNull();
    expect(mensajeParaVisitante({ ...base, metadata: { internal: true } })).toBeNull();
    expect(mensajeParaVisitante({ ...base, direction: 'inbound' })).toBeNull();
    expect(mensajeParaVisitante({ ...base, role: 'customer', direction: 'outbound' })).toBeNull();
  });

  it('adjuntos solo con URL https', () => {
    expect(mensajeParaVisitante({ ...base, content_type: 'image', content: 'javascript:alert(1)' })).toBeNull();
    expect(mensajeParaVisitante({ ...base, content_type: 'file', content: 'https://cdn.x/f.pdf', metadata: { file_name: 'f.pdf' } })).toMatchObject({ tipo: 'file', url: 'https://cdn.x/f.pdf', nombreArchivo: 'f.pdf', texto: '' });
  });

  it('expone tarjetas de producto y arma el enlace de checkout con ?cart=&customer=', () => {
    const m = mensajeParaVisitante({
      ...base,
      role: 'ai',
      metadata: {
        model: 'secreto', tokens: 99, context_used: { emailFromChat: 'x@y.com' },
        products: [{ id: 7, name: 'Tenis', price: 120000, comparePrice: 150000, imageUrl: 'https://img/x.jpg', stock: 3 }],
        order_action: {
          type: 'checkout_redirect', checkoutUrl: 'https://demo.goadmin.io/checkout', label: 'Completar Pedido',
          cartItems: [{ productId: 7, name: 'Tenis', price: 120000, quantity: 2, imageUrl: 'javascript:x' }],
          customerData: { firstName: 'Ana', email: 'ana@x.co', otra: 'no' },
        },
      },
    });
    expect(m?.productos).toEqual([{ id: '7', nombre: 'Tenis', precio: 120000, precioAntes: 150000, imagen: 'https://img/x.jpg' }]);
    const u = new URL(m!.pedido!.url);
    expect(u.origin + u.pathname).toBe('https://demo.goadmin.io/checkout');
    expect(JSON.parse(u.searchParams.get('cart')!)).toEqual([{ productId: 7, name: 'Tenis', price: 120000, comparePrice: null, imageUrl: null, quantity: 2 }]);
    expect(JSON.parse(u.searchParams.get('customer')!)).toEqual({ firstName: 'Ana', email: 'ana@x.co' });
    // Nada interno de la IA (modelo, tokens, contexto) llega al navegador.
    expect(JSON.stringify(m)).not.toMatch(/secreto|context_used|emailFromChat|stock/);
  });

  it('un checkout que no es https no genera botón', () => {
    const m = mensajeParaVisitante({ ...base, role: 'ai', metadata: { order_action: { type: 'checkout_redirect', checkoutUrl: 'javascript:alert(1)' } } });
    expect(m?.pedido).toBeNull();
  });
});
