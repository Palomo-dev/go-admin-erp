/**
 * Prompt de la IA de atencion al cliente final — nucleo compartido.
 *
 * Es el MISMO prompt con el que responde `ai-auto-response` (la Edge Function
 * que contesta a los clientes por WhatsApp, Instagram, Facebook y el widget).
 * Vive aqui para que el Laboratorio de IA (`/api/chat/ai/lab-test`, Next.js)
 * pruebe exactamente lo que vera el cliente, sin una segunda copia del prompt
 * que diverja en semanas (regla 7 de CLAUDE.md).
 *
 * Igual que el resto de `_shared/ai-chat`: sin dependencias de Deno ni de Next.
 * La Edge Function lo importa con `.ts`; Next y Jest, sin extension. Los
 * cargadores reciben el cliente de Supabase como parametro (la Edge Function
 * pasa el suyo, el laboratorio el del servidor) y filtran SIEMPRE por la
 * organizacion que reciben.
 *
 * El texto se extrajo literal de `ai-auto-response/index.ts` (2026-11-13);
 * `src/__tests__/services/promptAtencionIA.test.ts` lo fija.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Cliente de Supabase (supabase-js en Deno o en Node): solo se usa su API de consultas. */
// deno-lint-ignore no-explicit-any
export type ClienteDatos = any;

export interface ConfigCheckout {
  deliveryTypes: string[];
  shippingEnabled: boolean;
  shippingRate: number;
  shippingTitle: string;
  freeShippingThreshold: number;
  paymentMethods: Array<{ code: string; name: string }>;
  taxRate: number;
  taxName: string;
  taxIncluded: boolean;
}

export interface InfoOrganizacion {
  name: string;
  domain: string | null;
  subdomain: string | null;
}

/** Fila minima de conocimiento o respuesta rapida que entra en REFERENCIA. */
export interface EntradaReferencia {
  title: string;
  content: string;
}

export interface EntradaPromptEstable {
  /** `ai_settings.system_rules` de la organizacion. */
  systemRules?: string | null;
  /** `ai_vertical_efectivo.vertical` (ver `cargarVertical`). */
  vertical: string;
  orgInfo: Pick<InfoOrganizacion, 'name' | 'domain'>;
  checkoutConfig: ConfigCheckout;
  quickReplies: EntradaReferencia[] | null | undefined;
  knowledgeFragments: EntradaReferencia[] | null | undefined;
  /** `ai_settings.tone` (Configuración › Chat › IA). Sin valor: no se agrega bloque de tono. */
  tono?: string | null;
  /** `ai_settings.language`. Sin valor: no se agrega bloque de idioma. */
  idioma?: string | null;
}

/** Tonos que ofrece Configuración › Chat › IA (`TONE_OPTIONS` en aiSettingsService). */
const INSTRUCCION_TONO: Record<string, string> = {
  professional: 'Profesional y cordial: claro, respetuoso y directo, sin jerga ni exceso de emojis.',
  friendly: 'Amigable y cercano: cálido y natural, como un buen asesor de la tienda; puedes usar algún emoji con moderación.',
  formal: 'Formal: trata al cliente de "usted", con frases completas y sin emojis ni expresiones coloquiales.',
  casual: 'Casual y relajado: conversacional y sencillo, frases cortas; puedes usar emojis con moderación.',
  empathetic: 'Empático: reconoce primero cómo se siente el cliente o su problema, y luego ayuda con calma y paciencia.',
};

/** Idiomas que ofrece Configuración › Chat › IA (`LANGUAGE_OPTIONS`). */
const NOMBRE_IDIOMA: Record<string, string> = { es: 'español', en: 'inglés', pt: 'portugués', fr: 'francés' };

/**
 * Bloque de estilo con el tono y el idioma de la organización. Antes la IA los
 * ignoraba (se guardaban en `ai_settings` pero no entraban al prompt). El idioma
 * es el principal: si el cliente escribe en otro, se le responde en el suyo,
 * que es lo que la IA ya hacía.
 */
export function bloqueEstilo(tono?: string | null, idioma?: string | null): string {
  const lineas: string[] = [];
  const t = tono ? INSTRUCCION_TONO[tono] : undefined;
  if (t) lineas.push(`- Tono: ${t}`);
  const i = idioma ? NOMBRE_IDIOMA[idioma] : undefined;
  if (i) lineas.push(`- Idioma: responde en ${i}. Si el cliente te escribe en otro idioma, respóndele en el idioma del cliente.`);
  return lineas.length ? `ESTILO DE RESPUESTA:\n${lineas.join('\n')}\n\n` : '';
}

export interface EntradaContextoDinamico {
  emailFromChat?: string | null;
  imageAnalysis?: string;
  customerName: string;
  /** `channels.type` del canal de la conversacion. */
  canal?: string | null;
  categoriesText?: string;
  productsResult: { text: string; hayTallas?: boolean };
  /** `GUIA_TALLAS` de `variantesCatalogo.ts` (se pasa para no encadenar imports `.ts`). */
  guiaTallas?: string;
  ordersText?: string;
  /** El cliente probo varios correos: ya no se busca por correo. */
  sondeoCorreo?: boolean;
}

/**
 * Vertical de la organizacion. `ai_vertical_efectivo` usa `ai_settings.vertical`
 * si esta puesto y, si no, lo deduce del tipo de organizacion.
 *
 * Importa porque hoy TODAS reciben un prompt de tienda: 16 de las 38 no son
 * retail (8 hoteles, 5 restaurantes, 2 de servicios, 1 de transporte), y
 * la org 2 genero 111.745 mensajes con instrucciones sobre "tarjetas de
 * producto" y "finalizar el pedido".
 */
export async function cargarVertical(supabase: ClienteDatos, organizationId: number): Promise<string> {

    let vertical = 'retail';
    try {
      const { data: filaVertical } = await supabase
        .from('ai_vertical_efectivo')
        .select('vertical')
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (filaVertical?.vertical) vertical = filaVertical.vertical;
    } catch (e) {
      console.error('No se pudo leer el vertical; se usa retail:', e);
    }
    return vertical;
}

export async function cargarCheckoutConfig(supabase: ClienteDatos, organizationId: number): Promise<ConfigCheckout> {
  try {
    const [wsResult, pmResult] = await Promise.all([
      supabase.from('website_settings').select('enable_shipping, available_delivery_types, shipping_flat_rate, shipping_flat_rate_title, free_shipping_threshold, tax_rate, tax_name, tax_included').eq('organization_id', organizationId).single(),
      // Mismos medios y mismo nombre que muestra el checkout de la tienda
      // (`getWebsitePaymentMethods` en goadmin-websites): nombre web, si no el del
      // catálogo y, al final, el código. Antes caía directo al código y el chat
      // ofrecía «cash» o «transfer» (2026-11-24: 40 tiendas sin nombre web).
      supabase.from('organization_payment_methods').select('payment_method_code, website_display_name, payment_methods (name)').eq('organization_id', organizationId).eq('is_active', true).eq('show_on_website', true),
    ]);
    const ws = wsResult.data as any || {};
    const methods = (pmResult.data || []).map((m: any) => ({ code: m.payment_method_code, name: m.website_display_name || m.payment_methods?.name || m.payment_method_code }));
    let taxRate = Number(ws.tax_rate || 0);
    if (taxRate === 0) {
      const { data: defaultTax } = await supabase.from('organization_taxes').select('rate, name').eq('organization_id', organizationId).eq('is_active', true).eq('is_default', true).maybeSingle();
      if (defaultTax) taxRate = Number(defaultTax.rate);
    }
    return {
      deliveryTypes: ws.available_delivery_types || ['delivery_own'],
      shippingEnabled: ws.enable_shipping !== false,
      shippingRate: Number(ws.shipping_flat_rate || 0),
      shippingTitle: ws.shipping_flat_rate_title || 'Envío',
      freeShippingThreshold: Number(ws.free_shipping_threshold || 0),
      paymentMethods: methods.length > 0 ? methods : [{ code: 'cash', name: 'Efectivo' }],
      taxRate,
      taxName: ws.tax_name || 'IVA',
      taxIncluded: ws.tax_included === true,
    };
  } catch (e) {
    console.error('Error getCheckoutConfig:', e);
    return { deliveryTypes: ['delivery_own'], shippingEnabled: false, shippingRate: 0, shippingTitle: 'Envío', freeShippingThreshold: 0, paymentMethods: [{ code: 'cash', name: 'Efectivo' }], taxRate: 0, taxName: 'IVA', taxIncluded: false };
  }
}

export async function cargarInfoOrganizacion(supabase: ClienteDatos, organizationId: number): Promise<InfoOrganizacion> {
  try {
    const [{ data }, { data: url, error }] = await Promise.all([
      supabase.from('organizations').select('name, subdomain').eq('id', organizationId).single(),
      supabase.rpc('fn_url_publica_org', { p_org: organizationId }),
    ]);
    if (!data) return { name: '', domain: null, subdomain: null };
    let domain: string | null = null;
    if (!error && typeof url === 'string' && url.startsWith('https://')) {
      domain = url.slice('https://'.length).replace(/\/$/, '') || null;
    } else if (error) {
      console.error('No se pudo leer la URL pública de la tienda:', error.message);
    }
    return {
      name: data.name,
      domain,
      subdomain: data.subdomain || null,
    };
  } catch {
    return { name: '', domain: null, subdomain: null };
  }
}

/**
 * Parte estable del prompt: lo que no cambia de un mensaje a otro dentro de la
 * organizacion. Es el prefijo que el proveedor puede cachear.
 */
export function construirPromptEstable(entrada: EntradaPromptEstable): string {
    const { systemRules, vertical, orgInfo, checkoutConfig, quickReplies, knowledgeFragments, tono, idioma } = entrada;
    const esRetail = vertical === 'retail';

    let systemPrompt = '';

    if (systemRules) {
      systemPrompt = `INSTRUCCIONES PRINCIPALES:\n${systemRules}\n\nIMPORTANTE: \"Dar solución\" significa ayudar con información REAL del catálogo o redirigir al cliente. NUNCA inventes estados de pedidos, números de seguimiento, tiempos de entrega ni información que no tengas. Si no tienes datos reales, pregunta al cliente o sugiere contactar por otro medio.\n\n`;
    }

    // Tono e idioma de Configuración › Chat › IA (antes se guardaban y no se usaban).
    systemPrompt += bloqueEstilo(tono, idioma);

    if (!esRetail) {
      // Los verticales que no venden catalogo no reciben instrucciones de
      // tarjetas, checkout ni [PEDIDO_LISTO]. Reciben su propio encargo.
      const encargo: Record<string, string> = {
        hotel: 'Eres el asistente de un hotel. Atiendes consultas sobre disponibilidad, tipos de habitación, tarifas, servicios y políticas de reserva y cancelación. Si te piden reservar, recoge fechas, número de huéspedes y datos de contacto, y confirma que un agente cerrará la reserva.',
        restaurante: 'Eres el asistente de un restaurante. Atiendes consultas sobre la carta, precios, horarios, domicilios y reservas de mesa. Si te piden reservar, recoge fecha, hora, número de personas y datos de contacto.',
        gimnasio: 'Eres el asistente de un gimnasio. Atiendes consultas sobre planes y precios de membresía, horarios, clases y servicios. Si quieren inscribirse, recoge sus datos y confirma que un asesor los contactará.',
        parqueadero: 'Eres el asistente de un parqueadero. Atiendes consultas sobre tarifas, disponibilidad, horarios y abonos mensuales.',
        transporte: 'Eres el asistente de una empresa de transporte. Atiendes consultas sobre rutas, horarios, tarifas y estado de envíos. Para consultar un envío, pide el número de guía.',
        servicios: 'Eres el asistente de una empresa de servicios. Atiendes consultas sobre los servicios que se ofrecen, precios y disponibilidad. Si quieren contratar, recoge sus datos y confirma que un asesor los contactará.',
      };
      systemPrompt += `TU ROL: ${encargo[vertical] || encargo.servicios}

`;
      systemPrompt += `FORMATO DE RESPUESTA:
- Usa saltos de línea (\n) para separar ideas.
- Usa **negritas** solo para datos importantes.
- Sé conciso y conversacional.
- NO hables de "carrito", "checkout" ni "finalizar el pedido": aquí no se vende un catálogo por chat.

`;
      systemPrompt += `TIENDA:
- Nombre: ${orgInfo.name || 'Nuestro negocio'}
`;
      if (orgInfo.domain) systemPrompt += `- Web: https://${orgInfo.domain}
`;
      systemPrompt += `Usa solo la URL de la sección TIENDA; nunca inventes otra.
`;
      systemPrompt += `
`;
    }

    if (esRetail) systemPrompt += `FORMATO DE RESPUESTA:\n- Usa saltos de línea (\\n) para separar ideas.\n- IMPORTANTE: Los productos se muestran AUTOMÁTICAMENTE como tarjetas visuales con imagen, nombre y precio. NO listes los productos como texto. Solo escribe un mensaje introductorio breve como "Aquí te muestro las opciones:" o "Tenemos estos disponibles:" y las tarjetas se mostrarán solas.\n- NO uses formato [IMG:url]. Las imágenes se muestran automáticamente en las tarjetas.\n- Usa **negritas** solo para datos importantes que NO sean productos.\n- Sé conciso y conversacional.\n- Máximo 3-4 productos por respuesta.\n\n`;
    
    if (esRetail) systemPrompt += `TIENDA:\n- Nombre: ${orgInfo.name || 'Tienda'}\n`;
    if (esRetail && orgInfo.domain) {
      systemPrompt += `- Web: https://${orgInfo.domain}\n- Productos: https://${orgInfo.domain}/productos\n- Ofertas: https://${orgInfo.domain}/ofertas\n- Checkout: https://${orgInfo.domain}/checkout\n`;
    }
    if (esRetail) systemPrompt += `Usa solo la URL de la sección TIENDA; nunca inventes otra.\n`;
    if (esRetail) systemPrompt += `\nTU ROL: Eres un asistente de ventas. Toma el pedido del cliente de forma conversacional. Cuando el cliente quiera un producto, muéstralo. Cuando confirme qué quiere, recopila sus datos y confirma el pedido.\n\nPRECIOS: SIEMPRE usa el "PRECIO DE VENTA" indicado en el catálogo. NUNCA uses el "precio anterior tachado" como precio real. Si el cliente pregunta por el precio, responde SOLO con el precio de venta. No te contradigas ni corrijas el precio a menos que haya cambiado en el catálogo.\n\n`;
    // Add checkout config context
    const deliveryLabels: Record<string, string> = { pickup: 'Recoger en tienda', delivery_own: 'Domicilio (delivery propio)', delivery_third_party: 'Envío por transportadora' };
    const availableDeliveries = checkoutConfig.deliveryTypes.map(d => deliveryLabels[d] || d).join(', ');
    const payMethodNames = checkoutConfig.paymentMethods.map(m => m.name).join(', ');
    const onlyPickup = checkoutConfig.deliveryTypes.length === 1 && checkoutConfig.deliveryTypes[0] === 'pickup';
    const hasPickup = checkoutConfig.deliveryTypes.includes('pickup');
    const hasDelivery = checkoutConfig.deliveryTypes.some(d => d === 'delivery_own' || d === 'delivery_third_party');
    const onlyDelivery = hasDelivery && !hasPickup;
    if (esRetail) systemPrompt += `CONFIGURACIÓN DE PEDIDOS:\n- Tipos de entrega: ${availableDeliveries}\n`;
    if (esRetail && checkoutConfig.shippingEnabled && hasDelivery) {
      systemPrompt += `- Costo de envío: $${checkoutConfig.shippingRate.toLocaleString()}\n- Envío gratis en compras desde: $${checkoutConfig.freeShippingThreshold.toLocaleString()}\n`;
    }
    if (esRetail && checkoutConfig.taxRate > 0) {
      systemPrompt += `- Impuesto: ${checkoutConfig.taxName} ${checkoutConfig.taxRate}%${checkoutConfig.taxIncluded ? ' (incluido en precio)' : ' (se suma al subtotal)'}\n`;
    }
    if (esRetail) systemPrompt += `- Métodos de pago: ${payMethodNames}\n\n`;
    // Build dynamic order flow
    let flowSteps = `FLUJO DE PEDIDO:\n1. El cliente pregunta por productos → Muestra las opciones (las tarjetas se muestran automáticamente)\n2. El cliente elige → Confirma el producto y pregunta: "¿Deseas agregar algo más?"\n`;
    if (onlyPickup) {
      flowSteps += `3. Cuando el cliente confirme que no quiere más → Pregunta SOLO: nombre completo, teléfono y correo electrónico. La entrega es SIEMPRE recoger en tienda, NO preguntes tipo de entrega ni dirección.\n`;
      flowSteps += `4. Pregunta método de pago (${payMethodNames})\n`;
      flowSteps += `5. Calcula y muestra resumen con los PRECIOS REALES de los productos (usa los precios de la lista de productos):\n`;
    } else if (onlyDelivery) {
      flowSteps += `3. Cuando el cliente confirme que no quiere más → Pregunta: nombre completo, teléfono, correo electrónico, dirección y ciudad. NO preguntes tipo de entrega porque SOLO hay envío (no hay opción de recoger en tienda).\n`;
      flowSteps += `4. Pregunta método de pago (${payMethodNames})\n`;
      flowSteps += `5. Calcula y muestra resumen con los PRECIOS REALES:\n`;
    } else {
      flowSteps += `3. Cuando el cliente confirme que no quiere más → Pregunta: nombre completo, teléfono, correo electrónico y tipo de entrega (${availableDeliveries})\n`;
      flowSteps += `4. Si elige domicilio o transportadora → Pide dirección y ciudad\n`;
      flowSteps += `5. Pregunta método de pago (${payMethodNames})\n`;
      flowSteps += `6. Calcula y muestra resumen con los PRECIOS REALES:\n`;
    }
    flowSteps += `   - Producto(s): SIEMPRE lista el NOMBRE COMPLETO de cada producto seleccionado con su precio (ej: "Nevera HACEB 404 Lt: $289,000")\n`;
    flowSteps += `   - Subtotal: suma los precios REALES × cantidad de cada producto seleccionado (NUNCA escribas texto como "(suma de precios)", calcula el número)\n`;
    if (checkoutConfig.taxRate > 0) {
      flowSteps += `   - ${checkoutConfig.taxName} ${checkoutConfig.taxRate}%${checkoutConfig.taxIncluded ? ' (incluido)' : ''}\n`;
    }
    if (esRetail && checkoutConfig.shippingEnabled && hasDelivery) {
      flowSteps += `   - Envío: $${checkoutConfig.shippingRate.toLocaleString()} (gratis si subtotal >= $${checkoutConfig.freeShippingThreshold.toLocaleString()})\n`;
    }
    flowSteps += `   - **Total**: la suma final en pesos\n`;
    const confirmStep = onlyPickup ? '6' : onlyDelivery ? '6' : '7';
    flowSteps += `${confirmStep}. Cuando el cliente confirme el resumen, incluye AL FINAL de tu respuesta estas etiquetas EXACTAS en líneas separadas:\n[DATOS_CLIENTE:nombre_completo|telefono|email|direccion|ciudad]\n[PEDIDO_LISTO]\nEjemplo: [DATOS_CLIENTE:Juan Pérez|3001234567|juan@email.com|Calle 123 #45-67|Bogotá]\nUSA LOS DATOS REALES que el cliente proporcionó durante la conversación. Si algún dato no se proporcionó, deja el campo vacío entre los pipes.\n\n`;
    flowSteps += `REGLAS IMPORTANTES:\n- [PEDIDO_LISTO] es OBLIGATORIA cuando el cliente confirma. Sin ella no se crea el pedido.\n- NO uses formularios. TODO es por conversación natural.\n- SIEMPRE calcula los totales con NÚMEROS REALES, nunca con texto placeholder.\n- Una vez el cliente confirme sus productos, NO vuelvas a listar ni sugerir otros productos.\n- Enfócate ÚNICAMENTE en recopilar datos del pedido después de elegir productos.\n- MÉTODOS DE PAGO: Solo ofrece EXACTAMENTE estos: ${payMethodNames}. NO inventes ni menciones otros métodos de pago que no estén en esta lista.\n- STOCK: Si un producto aparece en la lista de PRODUCTOS abajo con stock > 0, ESTÁ DISPONIBLE para la venta. Solo di que NO está disponible si el stock es 0. NUNCA inventes que un producto no está disponible si tiene stock.\n- En la respuesta de confirmación (cuando incluyes [PEDIDO_LISTO]), REPITE el nombre completo y precio de cada producto del pedido.\n\n`;
    if (esRetail) systemPrompt += flowSteps;
    
    systemPrompt += `PEDIDOS: SÍ puedes consultar el estado de los pedidos. Si el cliente pregunta por su pedido, pídele el número de pedido (formato WO-...) o el correo con el que compró. Si ya dio uno de los dos, el bloque CONTEXTO ACTUAL traerá sus pedidos: usa esos datos y responde con el estado tal como aparece (confirmado, en preparación, en camino, entregado, cancelado, expirado o pendiente de pago). Si un pedido aparece como EXPIRADO, explica que el pago no se completó y que puede volver a hacerlo. NUNCA digas que no puedes consultar pedidos: si el bloque no trae ninguno con ese correo o número, di que no encuentras pedidos con esos datos y pide que verifique el correo o el número.\n\n`;

    // Un solo juego de reglas, valido con y sin resultados. Antes eran dos
    // ramas que dependian de si la busqueda encontro algo: al vivir dentro de
    // `instructions`, el prefijo cambiaba segun el mensaje y el cache fallaba.
    systemPrompt += `REGLAS CRÍTICAS:
- Los productos disponibles llegan en el bloque CONTEXTO ACTUAL. Si uno aparece ahí, SÍ lo tenemos: confirma disponibilidad y precio.
- Si el bloque no trae ningún producto, di honestamente que no lo tenemos y ofrece alternativas si las hay. NUNCA inventes productos, existencias ni precios.
- SALUDO: si el cliente saluda, responde el saludo y pregunta en qué puedes ayudar. NO menciones pedidos, envíos ni productos sin que te pregunten.
- CAMBIO DE TEMA: si pregunta por un producto DIFERENTE al que se venía hablando, responde sobre el NUEVO. No sigas con el anterior.
- Si se refiere al MISMO producto que ya mostraste, confirma que sigue disponible.
- STOCK: si un producto viene con stock > 0, ESTÁ DISPONIBLE. Solo di que no lo está si el stock es 0.
- NO INVENTAR: nunca inventes estados de pedidos, números de guía, tiempos de entrega ni información que no tengas.
- Usa [IMG:url] para mostrar imágenes de productos del catálogo.

`;


    if ((quickReplies && quickReplies.length > 0) || (knowledgeFragments && knowledgeFragments.length > 0)) {
      systemPrompt += `REFERENCIA:\n`;
      if (quickReplies) for (const qr of quickReplies) systemPrompt += `- ${qr.title}: ${qr.content}\n`;
      if (knowledgeFragments) for (const kf of knowledgeFragments) systemPrompt += `- ${kf.title}: ${kf.content}\n`;
      systemPrompt += '\n';
    }
    
    systemPrompt += `RECORDATORIO FINAL: Responde SIEMPRE sobre lo que el cliente pregunta AHORA. Si pregunta por un producto nuevo, enfócate en ese. Si no lo encontramos, dilo honestamente. Si se refiere a uno ya mostrado, confirma disponibilidad. Si saluda, responde el saludo. Formato legible. Usa [IMG:url] para mostrar productos.`;

    return systemPrompt;
}

/**
 * Todo lo que cambia en CADA mensaje (cliente, canal, catalogo, pedidos).
 *
 * Por que va aparte: el prompt caching de OpenAI cachea el PREFIJO de la
 * peticion. Con el nombre del cliente y los productos dentro de
 * `instructions`, cada conversacion generaba un prefijo distinto y el cache
 * fallaba. Medido en produccion sobre 6 respuestas: 3 cachearon (hasta 98,9%)
 * y 3 no cachearon nada.
 */
export function construirContextoDinamico(entrada: EntradaContextoDinamico): string {
    const {
      emailFromChat, imageAnalysis, customerName, canal, categoriesText,
      productsResult, guiaTallas = '', ordersText, sondeoCorreo,
    } = entrada;

    let contextoDinamico = '';
    if (emailFromChat) contextoDinamico += `Email detectado: ${emailFromChat}\n`;

    if (imageAnalysis) {
      contextoDinamico += `IMAGEN RECIBIDA DEL CLIENTE:\nAnálisis: ${imageAnalysis}\n\nINSTRUCCIÓN IMPORTANTE: Verifica si este producto EXISTE en la lista de PRODUCTOS de abajo. Si encuentras el mismo producto o modelo en la lista, confirma que SÍ lo tenemos disponible, muestra su precio e imagen con [IMG:url]. Si NO existe en la lista, ofrece alternativas similares del catálogo.\n\n`;
    }

    contextoDinamico += `Cliente: ${customerName} | Canal: ${canal || 'chat'}\n\n`;

    if (categoriesText || productsResult.text) {
      contextoDinamico += `DATOS DEL INVENTARIO REAL Y DISPONIBLE:\n\n`;
      if (categoriesText) contextoDinamico += `CATEGORÍAS: ${categoriesText}\n\n`;
      if (productsResult.text) contextoDinamico += `PRODUCTOS ENCONTRADOS EN BÚSQUEDA ACTUAL:\n${productsResult.text}\n`;
      if (productsResult.hayTallas) contextoDinamico += guiaTallas;
    }
    if (ordersText) contextoDinamico += `PEDIDOS DEL CLIENTE:\n${ordersText}\n`;
    if (sondeoCorreo) {
      contextoDinamico += `PEDIDOS DEL CLIENTE: el cliente ha dado varios correos distintos en esta conversación. Por seguridad no se busca más por correo: pídele el número de pedido (WO-...).\n\n`;
    }
    return contextoDinamico;
}

/**
 * Mensajes de sistema con los que empieza la peticion: el prefijo estable y,
 * si hay, el contexto del mensaje como un turno aparte DESPUES del prefijo,
 * para no romperlo.
 */
export function mensajesDeSistema(systemPrompt: string, contextoDinamico: string): Array<{ role: 'system'; content: string }> {
    const chatMessages: Array<{ role: 'system'; content: string }> = [
      { role: 'system', content: systemPrompt }
    ];
    if (contextoDinamico.trim()) {
      chatMessages.push({
        role: 'system',
        content: `CONTEXTO ACTUAL (datos de este mensaje, no son reglas):\n\n${contextoDinamico}`,
      });
    }
    return chatMessages;
}
