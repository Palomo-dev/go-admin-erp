/**
 * Prompt de la IA de atención al cliente final — núcleo compartido entre la
 * Edge Function `ai-auto-response` y el Laboratorio de IA. Un solo archivo,
 * dos runtimes (igual que el resto de `_shared/ai-chat`).
 *
 * Al extraerlo (2026-11-13) se comprobó, con el código original de la función
 * al lado, que el texto es idéntico carácter a carácter en 384 combinaciones
 * (8 verticales × 2 reglas × 2 tiendas × 3 checkouts × 4 referencias). Aquí quedan
 * fijadas las piezas que deciden el comportamiento.
 */
import {
  bloqueEstilo,
  construirContextoDinamico,
  construirPromptEstable,
  mensajesDeSistema,
  type ConfigCheckout,
} from '../../../supabase/functions/_shared/ai-chat/promptAtencion';

const CHECKOUT: ConfigCheckout = {
  deliveryTypes: ['pickup'],
  shippingEnabled: false,
  shippingRate: 0,
  shippingTitle: 'Envío',
  freeShippingThreshold: 0,
  paymentMethods: [{ code: 'cash', name: 'Efectivo' }],
  taxRate: 0,
  taxName: 'IVA',
  taxIncluded: false,
};
const base = { vertical: 'retail', orgInfo: { name: 'Tienda', domain: 'tienda.example.com' }, checkoutConfig: CHECKOUT, quickReplies: null, knowledgeFragments: null };

describe('bloqueEstilo: tono e idioma de Configuración › Chat › IA', () => {
  test('sin tono ni idioma no agrega nada (el prompt queda como antes)', () => {
    expect(bloqueEstilo()).toBe('');
    expect(bloqueEstilo(null, null)).toBe('');
    expect(construirPromptEstable(base)).toBe(construirPromptEstable({ ...base, tono: null, idioma: null }));
  });

  test('valores desconocidos se ignoran en vez de inventar una instrucción', () => {
    expect(bloqueEstilo('gritón', 'klingon')).toBe('');
  });

  test('cada tono de la configuración tiene su instrucción', () => {
    for (const tono of ['professional', 'friendly', 'formal', 'casual', 'empathetic']) {
      expect(bloqueEstilo(tono)).toMatch(/^ESTILO DE RESPUESTA:\n- Tono: .+\n\n$/);
    }
    expect(bloqueEstilo('formal')).toContain('"usted"');
  });

  test('el idioma es el principal, pero al cliente se le responde en el suyo', () => {
    const b = bloqueEstilo(undefined, 'en');
    expect(b).toContain('responde en inglés');
    expect(b).toContain('respóndele en el idioma del cliente');
  });

  test('va después de las reglas de la organización y antes del rol', () => {
    const p = construirPromptEstable({ ...base, systemRules: 'No prometas descuentos.', tono: 'friendly', idioma: 'es' });
    const iReglas = p.indexOf('INSTRUCCIONES PRINCIPALES');
    const iEstilo = p.indexOf('ESTILO DE RESPUESTA:');
    const iRol = p.indexOf('TU ROL:');
    expect(iReglas).toBe(0);
    expect(iEstilo).toBeGreaterThan(iReglas);
    expect(iRol).toBeGreaterThan(iEstilo);
  });
});

describe('construirPromptEstable', () => {
  test('las reglas de la organización van primero', () => {
    const p = construirPromptEstable({ ...base, systemRules: 'No prometas descuentos.' });
    expect(p.startsWith('INSTRUCCIONES PRINCIPALES:\nNo prometas descuentos.\n\n')).toBe(true);
    expect(construirPromptEstable({ ...base, systemRules: '' }).startsWith('INSTRUCCIONES')).toBe(false);
  });

  test('retail: tarjetas, tienda, flujo de pedido; solo recoger en tienda no pregunta dirección', () => {
    const p = construirPromptEstable(base);
    expect(p).toContain('TU ROL: Eres un asistente de ventas.');
    expect(p).toContain('- Web: https://tienda.example.com\n- Productos: https://tienda.example.com/productos');
    expect(p).toContain('FLUJO DE PEDIDO:');
    expect(p).toContain('La entrega es SIEMPRE recoger en tienda');
    expect(p).toContain('[PEDIDO_LISTO]');
  });

  test('un hotel recibe su encargo y nada de carrito ni checkout', () => {
    const p = construirPromptEstable({ ...base, vertical: 'hotel' });
    expect(p).toContain('TU ROL: Eres el asistente de un hotel.');
    expect(p).not.toContain('FLUJO DE PEDIDO');
    expect(p).not.toContain('/checkout');
    // Vertical desconocido: el encargo de servicios.
    expect(construirPromptEstable({ ...base, vertical: 'otro' })).toContain('TU ROL: Eres el asistente de una empresa de servicios.');
  });

  test('REFERENCIA lleva respuestas rápidas y conocimiento; sin ninguno no aparece', () => {
    const p = construirPromptEstable({
      ...base,
      quickReplies: [{ title: 'Horario', content: '8 a 6' }],
      knowledgeFragments: [{ title: 'Envíos', content: 'Gratis desde 150.000' }],
    });
    expect(p).toContain('REFERENCIA:\n- Horario: 8 a 6\n- Envíos: Gratis desde 150.000\n\n');
    expect(construirPromptEstable({ ...base, quickReplies: [], knowledgeFragments: [] })).not.toContain('REFERENCIA:');
    expect(p.endsWith('Usa [IMG:url] para mostrar productos.')).toBe(true);
  });
});

describe('construirContextoDinamico y mensajesDeSistema', () => {
  test('el contexto lleva cliente y canal; sin canal, «chat»', () => {
    expect(construirContextoDinamico({ customerName: 'Ana', canal: 'whatsapp', productsResult: { text: '' } })).toBe('Cliente: Ana | Canal: whatsapp\n\n');
    expect(construirContextoDinamico({ customerName: 'Ana', canal: null, productsResult: { text: '' } })).toBe('Cliente: Ana | Canal: chat\n\n');
  });

  test('productos, guía de tallas, pedidos y sondeo de correos', () => {
    const c = construirContextoDinamico({
      customerName: 'Ana',
      canal: 'webchat',
      categoriesText: 'Calzado',
      productsResult: { text: '- **Tenis**\n', hayTallas: true },
      guiaTallas: '[GUIA]',
      ordersText: 'WO-1',
      sondeoCorreo: true,
    });
    expect(c).toContain('CATEGORÍAS: Calzado');
    expect(c).toContain('PRODUCTOS ENCONTRADOS EN BÚSQUEDA ACTUAL:\n- **Tenis**\n\n[GUIA]');
    expect(c).toContain('PEDIDOS DEL CLIENTE:\nWO-1');
    expect(c).toContain('Por seguridad no se busca más por correo');
  });

  test('el contexto va como segundo mensaje de sistema, después del prefijo cacheable', () => {
    expect(mensajesDeSistema('P', 'X')).toEqual([
      { role: 'system', content: 'P' },
      { role: 'system', content: 'CONTEXTO ACTUAL (datos de este mensaje, no son reglas):\n\nX' },
    ]);
    expect(mensajesDeSistema('P', '  ')).toEqual([{ role: 'system', content: 'P' }]);
  });
});
