import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const openaiKey = Deno.env.get('OPENAI_API_KEY')!;

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiKey });

async function classifyAndTagConversation(
  conversationId: string,
  organizationId: number,
  messageContent: string
) {
  try {
    const systemPrompt = `Eres un clasificador de intenciones de mensajes de clientes. Analiza el mensaje y determina:\n1. La intención principal (consulta, queja, solicitud, agradecimiento, saludo, despedida, urgente, venta, soporte, facturacion, otro)\n2. Un nivel de confianza (0-1)\n3. Tags sugeridos para la conversación (máximo 3)\n\nResponde SOLO en formato JSON:\n{"intent": "...", "confidence": 0.95, "suggestedTags": ["tag1"]}\n\nTags disponibles: Urgente, Queja, Venta, Soporte, Facturación, Consulta, Seguimiento, Devolución, Envío, Pedido`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: messageContent }
      ],
      temperature: 0.2,
      max_tokens: 200,
    });

    const responseContent = completion.choices[0]?.message?.content || '{}';
    const cleanedResponse = responseContent.replace(/```json\n?|```\n?/g, '').trim();
    const result = JSON.parse(cleanedResponse);

    if (result.suggestedTags && result.suggestedTags.length > 0 && result.confidence > 0.6) {
      const { data: existingTags } = await supabase
        .from('conversation_tags')
        .select('id, name')
        .eq('organization_id', organizationId);

      const tagMap = new Map(existingTags?.map(t => [t.name.toLowerCase(), t.id]) || []);

      for (const suggestedTag of result.suggestedTags) {
        const tagId = tagMap.get(suggestedTag.toLowerCase());
        if (tagId) {
          const { data: existingRelation } = await supabase
            .from('conversation_tag_relations')
            .select('id')
            .eq('conversation_id', conversationId)
            .eq('tag_id', tagId)
            .single();
          if (!existingRelation) {
            await supabase.from('conversation_tag_relations').insert({
              organization_id: organizationId,
              conversation_id: conversationId,
              tag_id: tagId,
            });
          }
        }
      }
    }
    return result;
  } catch (error) {
    console.error('Error clasificación:', error);
    return null;
  }
}

function correctTypos(word: string): string {
  const map: Record<string, string> = {
    'labadora': 'lavadora', 'labadoras': 'lavadoras',
    'nevara': 'nevera', 'nevaras': 'neveras',
    'refri': 'refrigerador', 'refrigeradora': 'refrigerador', 'refigeradora': 'refrigerador',
    'refrijeradora': 'refrigerador', 'refigerador': 'refrigerador',
    'tele': 'televisor', 'televicion': 'television', 'televisior': 'televisor',
    'micro': 'microondas', 'microhondas': 'microondas',
    'licuadra': 'licuadora', 'secadra': 'secadora',
    'conjelador': 'congelador', 'conjeladora': 'congeladora',
    'calentadro': 'calentador', 'ventiladro': 'ventilador',
    'celular': 'celular', 'celulares': 'celulares',
    'audifonos': 'audifonos', 'audifono': 'audifono',
    'computadro': 'computador', 'computadra': 'computadora',
    'portatil': 'portatil', 'laptos': 'laptop', 'lapto': 'laptop',
    'armarios': 'armario', 'closets': 'closet',
    'sarten': 'sarten', 'sartenes': 'sarten',
    'tvs': 'televisor', 'televisores': 'televisor',
    'tenis': 'tenis', 'zapatillas': 'tenis',
    'camisa': 'camiseta', 'camisas': 'camiseta',
    'parlantes': 'parlante', 'bocina': 'parlante', 'bocinas': 'parlante',
  };
  return map[word.toLowerCase()] || word;
}

function normalizeSpanish(word: string): string {
  return word.toLowerCase()
    .replace(/v/g, 'b')
    .replace(/z/g, 's')
    .replace(/c(?=[ei])/g, 's')
    .replace(/j/g, 'g')
    .replace(/h/g, '')
    .replace(/ll/g, 'y');
}

function stemSpanish(word: string): string[] {
  const variants = [word];
  if (word.endsWith('es') && word.length > 4) {
    variants.push(word.slice(0, -2));
    variants.push(word.slice(0, -1));
  } else if (word.endsWith('s') && word.length > 3) {
    variants.push(word.slice(0, -1));
  }
  if (!word.endsWith('s')) {
    variants.push(word + 's');
    variants.push(word + 'es');
  }
  return [...new Set(variants)];
}

function extractKeywords(message: string): string[] {
  const stopWords = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'a', 'en', 'con', 'por', 'para', 'que', 'es', 'son', 'tiene', 'tienen', 'tienes', 'hay', 'me', 'mi', 'te', 'tu', 'se', 'su', 'nos', 'les', 'lo', 'le', 'y', 'o', 'pero', 'como', 'hola', 'buenas', 'buenos', 'dias', 'tardes', 'noches', 'gracias', 'por', 'favor', 'quiero', 'necesito', 'busco', 'quisiera', 'cuanto', 'cuesta', 'precio', 'vale', 'disponible', 'stock', 'pedido', 'orden', 'estado', 'informacion', 'sobre', 'ver', 'mostrar', 'correo', 'email', 'mail', 'imagen', 'foto', 'este', 'esta', 'eso', 'ese', 'esa', 'producto', 'productos', 'cual', 'cuales', 'donde', 'cuando', 'como', 'quien', 'algo', 'mas', 'otro', 'otra', 'otros', 'otras', 'bien', 'bueno', 'buena', 'hoy', 'aqui', 'ahi', 'alla', 'todo', 'toda', 'todos', 'todas', 'nada', 'mucho', 'poco', 'muy', 'tan', 'solo', 'tambien', 'ya', 'aun', 'si', 'no', 'que', 'porque', 'pues', 'entonces', 'asi', 'ser', 'estar', 'tener', 'tenes', 'tengo', 'tenemos', 'muestrame', 'muestren', 'dame', 'venden', 'vendes', 'vende', 'ofrecen', 'manejan', 'hacer', 'poder', 'decir', 'dar', 'saber', 'poner', 'llegar', 'pasar', 'deber', 'ir', 'venir', 'valor', 'comprar', 'esos', 'esas']);
  const words = message.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !stopWords.has(w))
    .map(w => correctTypos(w));
  return [...new Set(words)].slice(0, 5);
}

function extractHistoryKeywords(messages: Array<{content: string, role: string, content_type?: string}>): string[] {
  const productKeywords: string[] = [];
  const recent = messages.slice(-6);
  for (const msg of recent) {
    if (!msg.content || msg.content_type === 'image') continue;
    const words = msg.content.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3)
      .map(w => correctTypos(w));
    const productPatterns = /^(lavador|nevera|refriger|televisor|television|cocina|horno|microonda|licuador|secador|congel|calentad|ventilad|estufa|plancha|aspira|samsung|lg|mabe|haceb|hisense|whirlpool|electrolux|tcl|bosch|frigidaire|laptop|comput|celular|tablet|audifono|parlante|aire|acondicion|armario|closet|ropero|mesa|silla|sofa|cama|colchon|mueble|estante|repisa|escritorio|cajonera|comoda|biblioteca|vitrina|organizador|rattan|baranda|gabinete|librer|archivador|aparador|tocador|modular|anaquel|percher|guarda|sarten|olla|cacerola|vajilla|plato|vaso|cubierto|licuador)/;
    for (const w of words) {
      if (productPatterns.test(w)) {
        productKeywords.push(w);
      }
    }
  }
  return [...new Set(productKeywords)].slice(0, 5);
}

function extractAssistantProductKeywords(messages: Array<{content: string, role: string, content_type?: string}>): string[] {
  const productKeywords: string[] = [];
  const assistantMsgs = messages.filter(m => m.role === 'ai' || m.role === 'assistant').slice(-3);
  for (const msg of assistantMsgs) {
    if (!msg.content) continue;
    const boldMatches = msg.content.match(/\*\*([^*]+)\*\*/g);
    if (boldMatches) {
      for (const match of boldMatches) {
        const productName = match.replace(/\*\*/g, '').toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const words = productName.split(/\s+/).filter(w => w.length > 3);
        if (words.length > 0) {
          productKeywords.push(words[0]);
        }
      }
    }
  }
  return [...new Set(productKeywords)].slice(0, 5);
}

function extractEmailFromMessages(messages: Array<{content: string, role: string}>): string | null {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const customerMsgs = messages.filter(m => m.role === 'customer').reverse();
  for (const msg of customerMsgs) {
    const matches = msg.content.match(emailRegex);
    if (matches) {
      const realEmail = matches.find(e => !e.includes('@widget.local'));
      if (realEmail) return realEmail.toLowerCase();
    }
  }
  return null;
}

async function searchProducts(organizationId: number, keywords: string[]): Promise<{text: string, products: any[]}> {
  if (keywords.length === 0) return { text: '', products: [] };

  try {
    const allVariants: string[] = [];
    for (const kw of keywords) {
      allVariants.push(...stemSpanish(kw));
      const normalized = normalizeSpanish(kw);
      if (normalized !== kw) allVariants.push(...stemSpanish(normalized));
    }
    const uniqueVariants = [...new Set(allVariants)];

    let allProducts: any[] = [];

    for (const variant of uniqueVariants.slice(0, 10)) {
      const { data } = await supabase
        .from('products')
        .select('id, name, sku, description, category_id, status')
        .eq('organization_id', organizationId)
        .eq('status', 'active')
        .ilike('name', `%${variant}%`)
        .limit(5);
      if (data) allProducts.push(...data);
    }

    if (allProducts.length === 0) {
      for (const kw of keywords.slice(0, 3)) {
        const { data } = await supabase
          .from('products')
          .select('id, name, sku, description, category_id, status')
          .eq('organization_id', organizationId)
          .eq('status', 'active')
          .ilike('name', `%${kw}%`)
          .limit(5);
        if (data) allProducts.push(...data);
      }
    }

    if (allProducts.length === 0) {
      for (const kw of keywords.slice(0, 2)) {
        const { data: categories } = await supabase
          .from('categories')
          .select('id')
          .eq('organization_id', organizationId)
          .ilike('name', `%${kw}%`)
          .limit(2);
        if (categories && categories.length > 0) {
          const catIds = categories.map(c => c.id);
          const { data } = await supabase
            .from('products')
            .select('id, name, sku, description, category_id, status')
            .eq('organization_id', organizationId)
            .eq('status', 'active')
            .in('category_id', catIds)
            .limit(6);
          if (data) allProducts.push(...data);
        }
      }
    }

    const seen = new Set();
    const dedupProducts = allProducts.filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
    // Sort by relevance: products matching original keywords rank higher
    dedupProducts.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aScore = keywords.filter(kw => aName.includes(kw)).length;
      const bScore = keywords.filter(kw => bName.includes(kw)).length;
      return bScore - aScore;
    });
    const unique = dedupProducts.slice(0, 6);

    if (unique.length === 0) return { text: '', products: [] };

    const productIds = unique.map(p => p.id);

    const [pricesRes, imagesRes, stockRes] = await Promise.all([
      supabase.from('product_prices').select('product_id, price, compare_price').in('product_id', productIds).is('effective_to', null),
      supabase.from('product_images').select('product_id, storage_path').in('product_id', productIds).eq('is_primary', true),
      supabase.from('stock_levels').select('product_id, qty_on_hand').in('product_id', productIds),
    ]);

    const priceMap = new Map((pricesRes.data || []).map(p => [p.product_id, p]));
    const imageMap = new Map((imagesRes.data || []).map(i => [i.product_id, i.storage_path]));
    const stockMap = new Map((stockRes.data || []).map(s => [s.product_id, s.qty_on_hand]));

    const enrichedProducts = unique.map(p => {
      const priceData = priceMap.get(p.id);
      const storagePath = imageMap.get(p.id);
      const stock = stockMap.get(p.id);
      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        price: priceData?.price ? Number(priceData.price) : 0,
        comparePrice: priceData?.compare_price ? Number(priceData.compare_price) : null,
        imageUrl: storagePath ? `${supabaseUrl}/storage/v1/object/public/product-images/${storagePath}` : null,
        stock: stock !== undefined ? Number(stock) : null,
      };
    });

    let text = '';
    for (const p of enrichedProducts) {
      const price = p.price ? `$${p.price.toLocaleString('es-CO')}` : 'Precio no disponible';
      const comparePrice = p.comparePrice && p.comparePrice > p.price ? ` (precio anterior tachado: $${p.comparePrice.toLocaleString('es-CO')}, NO usar este valor)` : '';
      const stockText = p.stock !== null ? ` | Stock: ${p.stock}` : '';
      text += `- **${p.name}** | PRECIO DE VENTA: ${price}${comparePrice}${stockText}`;
      if (p.imageUrl) text += ` | Imagen: ${p.imageUrl}`;
      text += `\n`;
    }

    return { text, products: enrichedProducts };
  } catch (error) {
    console.error('Error buscando productos:', error);
    return { text: '', products: [] };
  }
}

async function getCategories(organizationId: number): Promise<string> {
  try {
    const { data } = await supabase
      .from('categories')
      .select('name')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .limit(15);
    if (!data || data.length === 0) return '';
    return data.map(c => c.name).join(', ');
  } catch {
    return '';
  }
}

async function getCustomerOrders(organizationId: number, email: string | null, customerId: string | null, emailFromChat: string | null): Promise<string> {
  try {
    const searchEmail = email || emailFromChat;
    if (!searchEmail && !customerId) return '';
    
    let customerIdToSearch = customerId;
    if (!customerIdToSearch && searchEmail) {
      const { data: cust } = await supabase
        .from('customers')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('email', searchEmail)
        .maybeSingle();
      if (cust) customerIdToSearch = cust.id;
    }
    if (!customerIdToSearch) return '';
    
    const { data: orders } = await supabase
      .from('invoice_sales')
      .select('invoice_number, total, status, created_at')
      .eq('organization_id', organizationId)
      .eq('customer_id', customerIdToSearch)
      .order('created_at', { ascending: false })
      .limit(3);
    
    if (!orders || orders.length === 0) return '';
    
    let text = '';
    for (const o of orders) {
      const date = new Date(o.created_at).toLocaleDateString('es-CO');
      text += `- Pedido #${o.invoice_number} | $${Number(o.total).toLocaleString('es-CO')} | Estado: ${o.status} | Fecha: ${date}\n`;
    }
    return text;
  } catch {
    return '';
  }
}

async function getCheckoutConfig(organizationId: number): Promise<{deliveryTypes: string[], shippingEnabled: boolean, shippingRate: number, shippingTitle: string, freeShippingThreshold: number, paymentMethods: Array<{code: string, name: string}>, taxRate: number, taxName: string, taxIncluded: boolean}> {
  try {
    const [wsResult, pmResult] = await Promise.all([
      supabase.from('website_settings').select('enable_shipping, available_delivery_types, shipping_flat_rate, shipping_flat_rate_title, free_shipping_threshold, tax_rate, tax_name, tax_included').eq('organization_id', organizationId).single(),
      supabase.from('organization_payment_methods').select('payment_method_code, website_display_name').eq('organization_id', organizationId).eq('is_active', true).eq('show_on_website', true),
    ]);
    const ws = wsResult.data as any || {};
    const methods = (pmResult.data || []).map((m: any) => ({ code: m.payment_method_code, name: m.website_display_name || m.payment_method_code }));
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

async function getOrganizationInfo(organizationId: number): Promise<{name: string, domain: string | null, subdomain: string | null}> {
  try {
    const { data } = await supabase
      .from('organizations')
      .select('name, custom_domain, subdomain')
      .eq('id', organizationId)
      .single();
    if (!data) return { name: '', domain: null, subdomain: null };
    return { 
      name: data.name, 
      domain: data.custom_domain || (data.subdomain ? `${data.subdomain}.goadmin.io` : null),
      subdomain: data.subdomain || null
    };
  } catch {
    return { name: '', domain: null, subdomain: null };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const { conversationId, messageId, organizationId } = await req.json();
    if (!conversationId || !organizationId) {
      return new Response(JSON.stringify({ error: 'Missing params' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: conv } = await supabase
      .from('conversations')
      .select('id, channel_id, customer_id, organization_id, customer:customers(id, first_name, last_name, full_name, email, metadata)')
      .eq('id', conversationId)
      .single();
    if (!conv) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: channelData } = await supabase
      .from('channels')
      .select('id, type, name, ai_mode, organization_id')
      .eq('id', conv.channel_id)
      .single();
    if (!channelData || channelData.ai_mode === 'disabled') {
      return new Response(JSON.stringify({ skipped: true, reason: 'AI disabled' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    conv.channel = channelData;

    const { data: messages } = await supabase
      .from('messages')
      .select('id, content, content_type, direction, role, created_at, metadata')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(20);
    const recentMessages = (messages || []).reverse();
    if (recentMessages.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: 'No messages' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const lastCustomerMessage = [...recentMessages].reverse().find(m => m.role === 'customer');
    const lastAiMsg = [...recentMessages].reverse().find(m => m.direction === 'outbound');
    const lastAiContent = (lastAiMsg?.content || '').toLowerCase();

    const { data: aiSettings } = await supabase
      .from('ai_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .maybeSingle();
    const settings = aiSettings || { model: 'gpt-4o-mini', temperature: '0.7', max_tokens: 600, system_rules: '', fallback_message: '' };

    if (lastCustomerMessage?.content) {
      classifyAndTagConversation(conversationId, organizationId, lastCustomerMessage.content);

      // Detect and update customer data from message (email, phone, name, address)
      if (conv.customer_id) {
        const msg = lastCustomerMessage.content;
        const msgNorm = msg.replace(/(\d)\s+(\d)/g, '$1$2'); // join split numbers: "57320 2381311" → "573202381311"
        const emailMatch = msg.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
        const phoneMatch = msgNorm.match(/\b(?:57)?3\d{9}\b/) || msgNorm.match(/\b\d{7,10}\b/);
        if (emailMatch || phoneMatch) {
          const parts = msg.split(/[,\n]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 0);
          const updateData: any = {};
          let nameCandidate = '';
          let detectedEmail = '';
          for (const part of parts) {
            const emailInPart = part.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
            if (emailInPart) {
              detectedEmail = emailInPart[0];
            } else if (/^\d{7,12}$/.test(part.replace(/\s/g, ''))) {
              let ph = part.replace(/\s/g, '');
              if (ph.length === 12 && ph.startsWith('57')) ph = ph.slice(2); // 573001234567 → 3001234567
              updateData.phone = ph;
            } else if (!nameCandidate && /^[A-ZÁÉÍÓÚÑa-záéíóúñ\s]{3,}$/.test(part) && !/(calle|carrera|avenida|cra|cl|av|#|\d{2,})/i.test(part)) {
              nameCandidate = part;
            } else if (/(calle|carrera|cra|cl|av|#|diagonal|transversal|\d+\s*#)/i.test(part)) {
              updateData.address = part;
            } else if (/^[A-ZÁÉÍÓÚÑa-záéíóúñ\s]{3,}$/.test(part) && nameCandidate && !updateData.city) {
              updateData.city = part;
            }
          }
          if (!updateData.phone && phoneMatch) {
            let ph = phoneMatch[0];
            if (ph.length === 12 && ph.startsWith('57')) ph = ph.slice(2);
            updateData.phone = ph;
          }
          if (!detectedEmail && emailMatch) detectedEmail = emailMatch[0];
          if (nameCandidate) {
            const nameParts = nameCandidate.split(' ');
            updateData.first_name = nameParts[0];
            updateData.last_name = nameParts.slice(1).join(' ') || '';
          }
          // Merge: find existing real customer by email and link
          if (detectedEmail && !detectedEmail.includes('@widget.local')) {
            const { data: realCustomer } = await supabase
              .from('customers').select('id, first_name, phone, address')
              .eq('organization_id', organizationId)
              .eq('email', detectedEmail)
              .maybeSingle();
            if (realCustomer && realCustomer.id !== conv.customer_id) {
              updateData.metadata = { ...(conv.customer?.metadata || {}), real_email: detectedEmail, linked_customer_id: realCustomer.id };
              // Sync data to real customer
              const realUpd: any = { last_seen_at: new Date().toISOString() };
              if (updateData.first_name) { realUpd.first_name = updateData.first_name; realUpd.last_name = updateData.last_name || ''; }
              if (updateData.phone) realUpd.phone = updateData.phone;
              if (updateData.address) realUpd.address = updateData.address;
              if (updateData.city) realUpd.city = updateData.city;
              await supabase.from('customers').update(realUpd).eq('id', realCustomer.id);
            } else {
              updateData.metadata = { ...(conv.customer?.metadata || {}), real_email: detectedEmail };
            }
          }
          // Update visitor customer fields (name, phone, address - never email)
          if (Object.keys(updateData).length > 0) {
            await supabase.from('customers').update(updateData).eq('id', conv.customer_id);
          }
        }
      }
    }

    let imageAnalysis = '';
    let imageKeywords: string[] = [];
    if (lastCustomerMessage?.content_type === 'image' || lastCustomerMessage?.metadata?.imageUrl) {
      const imgUrl = lastCustomerMessage?.metadata?.imageUrl || lastCustomerMessage?.content;
      if (imgUrl && imgUrl.startsWith('http')) {
        try {
          const visionCompletion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'Describe este producto/imagen en español. Si es un electrodoméstico o producto, identifica: marca, modelo, tipo de producto y color. Sé breve y específico. Incluye palabras clave para buscar este producto en un catálogo.' },
                  { type: 'image_url', image_url: { url: imgUrl, detail: 'low' } }
                ]
              }
            ],
            max_tokens: 200,
          });
          imageAnalysis = visionCompletion.choices[0]?.message?.content || '';
          if (imageAnalysis) {
            const imgWords = imageAnalysis.toLowerCase()
              .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
              .replace(/[^a-z0-9\s]/g, '')
              .split(/\s+/)
              .filter(w => w.length > 3);
            const brandPatterns = /^(samsung|lg|mabe|haceb|hisense|whirlpool|electrolux|tcl|bosch|frigidaire|sony|panasonic|oster|imusa|universal)/;
            const productPatterns = /^(lavador|nevera|refriger|televisor|television|cocina|horno|microonda|licuador|secador|congel|calentad|ventilad|estufa|plancha|aspira|laptop|comput|celular|tablet|audifono|parlante|aire)/;
            for (const w of imgWords) {
              if (brandPatterns.test(w) || productPatterns.test(w)) {
                imageKeywords.push(w);
              }
            }
            imageKeywords = [...new Set(imageKeywords)].slice(0, 5);
          }
        } catch (e) {
          console.error('Error vision:', e);
        }
      }
    }

    const emailFromChat = extractEmailFromMessages(recentMessages);

    const { data: quickReplies } = await supabase
      .from('quick_replies')
      .select('title, content')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .limit(20);

    const { data: knowledgeFragments } = await supabase
      .from('knowledge_fragments')
      .select('title, content, tags')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .limit(10);

    const customerName = conv.customer?.full_name || 
      `${conv.customer?.first_name || ''} ${conv.customer?.last_name || ''}`.trim() || 'Cliente';
    const customerEmail = conv.customer?.email || null;
    const customerId = conv.customer?.id || null;
    
    // Detect if conversation is in order-taking phase (collecting customer data)
    const lastUserMsg = (lastCustomerMessage?.content || '').toLowerCase().trim();
    const last4 = recentMessages.slice(-4);

    // Detect product selection: user sends a product name from previously shown cards
    const userSelectingProduct = (() => {
      if (!lastUserMsg || lastUserMsg.length < 4) return false;
      const aiWithProducts = last4.filter(m => m.direction === 'outbound' && m.metadata?.products?.length > 0);
      if (aiWithProducts.length === 0) return false;
      for (const aiMsg of aiWithProducts) {
        const productNames = aiMsg.metadata.products.map((p: any) => (p.name || '').toLowerCase());
        if (productNames.some((name: string) => lastUserMsg.includes(name) || name.includes(lastUserMsg))) return true;
      }
      if (lastUserMsg.includes(',')) {
        const parts = lastUserMsg.split(',').map(s => s.trim()).filter(s => s.length > 5);
        for (const aiMsg of aiWithProducts) {
          const productNames = aiMsg.metadata.products.map((p: any) => (p.name || '').toLowerCase());
          if (parts.some(part => productNames.some((name: string) => name.includes(part) || part.includes(name)))) return true;
        }
      }
      // Decision phrases + word overlap with previously shown products (e.g. "solo quiero la nevera", "me llevo esa", "la primera")
      const decisionPhrase = /\b(solo quiero|me llevo|me quedo con|quiero (la|el|ese|esa|esta|este)|deseo (la|el)|voy a llevar|dame (la|el)|esa esta bien|esa está bien|la primera|la segunda|la tercera|el primero|el segundo|el tercero|opci[oó]n \d)\b/i.test(lastUserMsg);
      if (decisionPhrase) {
        const userWords = lastUserMsg.normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+/).filter(w => w.length > 3);
        for (const aiMsg of aiWithProducts) {
          const productNames = aiMsg.metadata.products.map((p: any) => (p.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
          if (userWords.some(w => productNames.some((name: string) => name.includes(w)))) return true;
        }
        // Ordinal selection ("la primera", "opción 2") without product words also counts
        if (/\b(la primera|la segunda|la tercera|el primero|el segundo|el tercero|opci[oó]n \d)\b/i.test(lastUserMsg)) return true;
      }
      return false;
    })();

    // isOrderPhase: blocks product search entirely (AI is collecting customer data)
    const isOrderPhase = (() => {
      const productInquiry = /\b(tienes|tienen|hay|busco|quiero|necesito|muestr|ver|enseñ|catalog|product|ofert|promo|nevera|lavador|refriger|televisor|cocina|horno|microonda|licuador|sarten|sartenes|olla|vajilla|aire|ventilad|estufa|plancha|aspira|laptop|comput|celular|tablet|parlante|mueble|sofa|cama|colchon|mesa|silla)/i.test(lastUserMsg);
      if (productInquiry || userSelectingProduct) return false;

      const orderPhrases = ['nombre completo', 'teléfono', 'dirección', 'tipo de entrega', 'método de pago', 'domicilio', 'datos para', 'confirmar pedido', 'resumen del pedido', 'deseas agregar algo más', 'algo más a tu pedido', 'todo está correcto', 'todo esta correcto', 'resumen de tu pedido', 'finalizar el pedido', 'procesar tu pedido', 'procesado con éxito', 'pedido ha sido', 'correo electrónico'];
      const lastAiAskedForData = orderPhrases.some(p => lastAiContent.includes(p));
      const userMsgs = last4.filter(m => m.direction === 'inbound').map(m => (m.content || '').toLowerCase().trim());
      const doneExact = ['no', 'listo', 'confirmo', 'confirmar', 'correcto'];
      const doneContains = ['no mas', 'no más', 'eso es todo', 'solo eso', 'no gracias', 'con eso', 'eso nada mas', 'eso nada más', 'no quiero más', 'no quiero mas', 'ya no', 'nada mas', 'nada más', 'esta bien', 'está bien'];
      const userConfirmedDone = userMsgs.some(msg => {
        if (msg.length > 50) return false; // Product names are long, skip them
        if (doneExact.includes(msg)) return true;
        return doneContains.some(p => msg.includes(p));
      });
      return lastAiAskedForData || userConfirmedDone;
    })();

    // Detect support/tracking intent - should NOT show product cards
    const isSupportQuery = (() => {
      if (!lastCustomerMessage?.content) return false;
      const msg = lastCustomerMessage.content.toLowerCase();
      return /no.+(lleg|recibi|mand|envi)|d(o|ó)nde.+(pedido|orden|paquete)|estado.+(pedido|orden)|gu(i|í)a.+(env|ped)|reclam|quej|devoluci|devolv|reembolso|problema|hice.+pedido|ya.+pagu|ya.+compr|todav(i|í)a.+esper|llevo.+esper|mi.+compra.+(que|ya|hace)|mes.+(esper|ped|compr)|cuándo.+(lleg|envi)|cuando.+(lleg|envi)|garantía|garantia|dañad|danad|defectuos|no funciona|no sirve|no prende|no enciende|cancelar.+(pedido|orden|compra)|cambiar.+(pedido|producto)|error|falla|mal estado|roto|incompleto|equivocad|frustra|lament|molest|insatisf|inconform|pésim|pesim|demora|demorad|retras/.test(msg);
    })();

    // Detect simple messages (greetings, closings, acknowledgements) - no product cards
    const isSimpleMessage = (() => {
      if (!lastUserMsg || lastUserMsg.length > 40) return false;
      return /^(ok|listo|dale|bueno|vale|gracias|ok gracias|muchas gracias|hola|buenas|buenos d[ií]as|buenas tardes|buenas noches|buenas? tarde|si|sí|no|claro|perfecto|entendido|de acuerdo|ya)(\s|$)/i.test(lastUserMsg.trim());
    })();

    // skipProductCards: search products for AI context but don't show visual cards
    const skipProductCards = userSelectingProduct || isOrderPhase || isSupportQuery || isSimpleMessage;

    let keywords: string[] = [];
    if (!isOrderPhase) {
      keywords = lastCustomerMessage?.content && lastCustomerMessage.content_type !== 'image'
        ? extractKeywords(lastCustomerMessage.content)
        : [];
      if (imageKeywords.length > 0) {
        keywords = [...new Set([...keywords, ...imageKeywords])].slice(0, 8);
      }
      
      if (keywords.length === 0) {
        const historyKw = extractHistoryKeywords(recentMessages);
        if (historyKw.length > 0) {
          keywords = [...new Set([...keywords, ...historyKw])].slice(0, 8);
        }
        if (keywords.length === 0) {
          const assistantKw = extractAssistantProductKeywords(recentMessages);
          if (assistantKw.length > 0) {
            keywords = [...new Set([...keywords, ...assistantKw])].slice(0, 8);
          }
        }
      }
    }
    
    // When user is selecting a product, reuse products from previous AI message metadata
    let productsFromPreviousCards: {text: string, products: any[]} | null = null;
    if (userSelectingProduct) {
      const aiWithProducts = recentMessages.filter(m => m.direction === 'outbound' && m.metadata?.products?.length > 0);
      const lastAiWithProducts = aiWithProducts[aiWithProducts.length - 1];
      if (lastAiWithProducts?.metadata?.products) {
        const prods = lastAiWithProducts.metadata.products;
        let text = '';
        for (const p of prods) {
          const price = p.price ? `$${Number(p.price).toLocaleString('es-CO')}` : 'Precio no disponible';
          const comparePrice = p.comparePrice && Number(p.comparePrice) > Number(p.price) ? ` (precio anterior tachado: $${Number(p.comparePrice).toLocaleString('es-CO')}, NO usar)` : '';
          const stockText = p.stock !== null && p.stock !== undefined ? ` | Stock: ${p.stock}` : ' | Stock: disponible';
          text += `- **${p.name}** | PRECIO DE VENTA: ${price}${comparePrice}${stockText}\n`;
        }
        productsFromPreviousCards = { text, products: prods };
      }
    }

    const [categoriesText, productsResult, ordersText, orgInfo, checkoutConfig] = await Promise.all([
      getCategories(organizationId),
      productsFromPreviousCards ? Promise.resolve(productsFromPreviousCards) : searchProducts(organizationId, keywords),
      getCustomerOrders(organizationId, customerEmail, customerId, emailFromChat),
      getOrganizationInfo(organizationId),
      getCheckoutConfig(organizationId),
    ]);

    let systemPrompt = '';
    
    if (settings.system_rules) {
      systemPrompt = `INSTRUCCIONES PRINCIPALES:\n${settings.system_rules}\n\nIMPORTANTE: \"Dar solución\" significa ayudar con información REAL del catálogo o redirigir al cliente. NUNCA inventes estados de pedidos, números de seguimiento, tiempos de entrega ni información que no tengas. Si no tienes datos reales, pregunta al cliente o sugiere contactar por otro medio.\n\n`;
    }
    
    systemPrompt += `FORMATO DE RESPUESTA:\n- Usa saltos de línea (\\n) para separar ideas.\n- IMPORTANTE: Los productos se muestran AUTOMÁTICAMENTE como tarjetas visuales con imagen, nombre y precio. NO listes los productos como texto. Solo escribe un mensaje introductorio breve como "Aquí te muestro las opciones:" o "Tenemos estos disponibles:" y las tarjetas se mostrarán solas.\n- NO uses formato [IMG:url]. Las imágenes se muestran automáticamente en las tarjetas.\n- Usa **negritas** solo para datos importantes que NO sean productos.\n- Sé conciso y conversacional.\n- Máximo 3-4 productos por respuesta.\n\n`;
    
    systemPrompt += `TIENDA:\n- Nombre: ${orgInfo.name || 'Tienda'}\n`;
    if (orgInfo.domain) {
      systemPrompt += `- Web: https://${orgInfo.domain}\n- Productos: https://${orgInfo.domain}/productos\n- Ofertas: https://${orgInfo.domain}/ofertas\n- Checkout: https://${orgInfo.domain}/checkout\n`;
    }
    systemPrompt += `\nTU ROL: Eres un asistente de ventas. Toma el pedido del cliente de forma conversacional. Cuando el cliente quiera un producto, muéstralo. Cuando confirme qué quiere, recopila sus datos y confirma el pedido.\n\nPRECIOS: SIEMPRE usa el "PRECIO DE VENTA" indicado en el catálogo. NUNCA uses el "precio anterior tachado" como precio real. Si el cliente pregunta por el precio, responde SOLO con el precio de venta. No te contradigas ni corrijas el precio a menos que haya cambiado en el catálogo.\n\n`;
    // Add checkout config context
    const deliveryLabels: Record<string, string> = { pickup: 'Recoger en tienda', delivery_own: 'Domicilio (delivery propio)', delivery_third_party: 'Envío por transportadora' };
    const availableDeliveries = checkoutConfig.deliveryTypes.map(d => deliveryLabels[d] || d).join(', ');
    const payMethodNames = checkoutConfig.paymentMethods.map(m => m.name).join(', ');
    const onlyPickup = checkoutConfig.deliveryTypes.length === 1 && checkoutConfig.deliveryTypes[0] === 'pickup';
    const hasPickup = checkoutConfig.deliveryTypes.includes('pickup');
    const hasDelivery = checkoutConfig.deliveryTypes.some(d => d === 'delivery_own' || d === 'delivery_third_party');
    const onlyDelivery = hasDelivery && !hasPickup;
    systemPrompt += `CONFIGURACIÓN DE PEDIDOS:\n- Tipos de entrega: ${availableDeliveries}\n`;
    if (checkoutConfig.shippingEnabled && hasDelivery) {
      systemPrompt += `- Costo de envío: $${checkoutConfig.shippingRate.toLocaleString()}\n- Envío gratis en compras desde: $${checkoutConfig.freeShippingThreshold.toLocaleString()}\n`;
    }
    if (checkoutConfig.taxRate > 0) {
      systemPrompt += `- Impuesto: ${checkoutConfig.taxName} ${checkoutConfig.taxRate}%${checkoutConfig.taxIncluded ? ' (incluido en precio)' : ' (se suma al subtotal)'}\n`;
    }
    systemPrompt += `- Métodos de pago: ${payMethodNames}\n\n`;
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
    if (checkoutConfig.shippingEnabled && hasDelivery) {
      flowSteps += `   - Envío: $${checkoutConfig.shippingRate.toLocaleString()} (gratis si subtotal >= $${checkoutConfig.freeShippingThreshold.toLocaleString()})\n`;
    }
    flowSteps += `   - **Total**: la suma final en pesos\n`;
    const confirmStep = onlyPickup ? '6' : onlyDelivery ? '6' : '7';
    flowSteps += `${confirmStep}. Cuando el cliente confirme el resumen, incluye AL FINAL de tu respuesta estas etiquetas EXACTAS en líneas separadas:\n[DATOS_CLIENTE:nombre_completo|telefono|email|direccion|ciudad]\n[PEDIDO_LISTO]\nEjemplo: [DATOS_CLIENTE:Juan Pérez|3001234567|juan@email.com|Calle 123 #45-67|Bogotá]\nUSA LOS DATOS REALES que el cliente proporcionó durante la conversación. Si algún dato no se proporcionó, deja el campo vacío entre los pipes.\n\n`;
    flowSteps += `REGLAS IMPORTANTES:\n- [PEDIDO_LISTO] es OBLIGATORIA cuando el cliente confirma. Sin ella no se crea el pedido.\n- NO uses formularios. TODO es por conversación natural.\n- SIEMPRE calcula los totales con NÚMEROS REALES, nunca con texto placeholder.\n- Una vez el cliente confirme sus productos, NO vuelvas a listar ni sugerir otros productos.\n- Enfócate ÚNICAMENTE en recopilar datos del pedido después de elegir productos.\n- MÉTODOS DE PAGO: Solo ofrece EXACTAMENTE estos: ${payMethodNames}. NO inventes ni menciones otros métodos de pago que no estén en esta lista.\n- STOCK: Si un producto aparece en la lista de PRODUCTOS abajo con stock > 0, ESTÁ DISPONIBLE para la venta. Solo di que NO está disponible si el stock es 0. NUNCA inventes que un producto no está disponible si tiene stock.\n- En la respuesta de confirmación (cuando incluyes [PEDIDO_LISTO]), REPITE el nombre completo y precio de cada producto del pedido.\n\n`;
    systemPrompt += flowSteps;
    
    systemPrompt += `PEDIDOS: Si preguntan por su pedido, pide el correo. Si ya dieron email, usa los datos de abajo.\n`;
    if (emailFromChat) systemPrompt += `Email detectado: ${emailFromChat}\n`;
    systemPrompt += `\n`;
    
    if (imageAnalysis) {
      systemPrompt += `IMAGEN RECIBIDA DEL CLIENTE:\nAnálisis: ${imageAnalysis}\n\nINSTRUCCIÓN IMPORTANTE: Verifica si este producto EXISTE en la lista de PRODUCTOS de abajo. Si encuentras el mismo producto o modelo en la lista, confirma que SÍ lo tenemos disponible, muestra su precio e imagen con [IMG:url]. Si NO existe en la lista, ofrece alternativas similares del catálogo.\n\n`;
    }
    
    systemPrompt += `Cliente: ${customerName} | Canal: ${conv.channel?.type || 'chat'}\n\n`;

    if (categoriesText || productsResult.text || ordersText) {
      systemPrompt += `DATOS DEL INVENTARIO REAL Y DISPONIBLE:\n\n`;
      if (categoriesText) systemPrompt += `CATEGORÍAS: ${categoriesText}\n\n`;
      if (productsResult.text) systemPrompt += `PRODUCTOS ENCONTRADOS EN BÚSQUEDA ACTUAL:\n${productsResult.text}\n`;
      if (ordersText) systemPrompt += `PEDIDOS DEL CLIENTE:\n${ordersText}\n`;
      systemPrompt += `\nREGLAS CRÍTICAS:\n- Si un producto aparece en la lista de arriba, SÍ lo tenemos disponible. Confirma su disponibilidad y precio.\n- CAMBIO DE TEMA: Si el cliente pregunta por un producto DIFERENTE al que se venía hablando, responde sobre el NUEVO producto. No sigas hablando del producto anterior.\n- Si buscamos un producto nuevo y NO aparece en la lista de arriba, di honestamente que no lo tenemos disponible actualmente y ofrece alternativas si hay.\n- Si el cliente se refiere al MISMO producto que ya mostraste antes, confirma que sigue disponible.\n- Usa [IMG:url] para mostrar imágenes de productos del catálogo.\n- NO inventes productos que no estén en la lista.\n\n`;
    } else {
      systemPrompt += `\nREGLAS CRÍTICAS (SIN RESULTADOS EN BÚSQUEDA):\n- SALUDO: Si el cliente dice \"Hola\", \"Buenos días\", \"Buenas\" o cualquier saludo, responde con un saludo amable y pregunta en qué puedes ayudar. NO menciones pedidos, envíos ni productos sin que te pregunten.\n- CAMBIO DE TEMA: Si el cliente pregunta por un producto NUEVO y no hay resultados, informa honestamente que no lo tenemos.\n- NO INVENTAR: Nunca inventes estados de pedidos, envíos ni información ficticia.\n- Si el cliente se refiere al MISMO producto que ya mostraste antes, confirma que sigue disponible.\n\n`;
    }

    if ((quickReplies && quickReplies.length > 0) || (knowledgeFragments && knowledgeFragments.length > 0)) {
      systemPrompt += `REFERENCIA:\n`;
      if (quickReplies) for (const qr of quickReplies) systemPrompt += `- ${qr.title}: ${qr.content}\n`;
      if (knowledgeFragments) for (const kf of knowledgeFragments) systemPrompt += `- ${kf.title}: ${kf.content}\n`;
      systemPrompt += '\n';
    }
    
    systemPrompt += `RECORDATORIO FINAL: Responde SIEMPRE sobre lo que el cliente pregunta AHORA. Si pregunta por un producto nuevo, enfócate en ese. Si no lo encontramos, dilo honestamente. Si se refiere a uno ya mostrado, confirma disponibilidad. Si saluda, responde el saludo. Formato legible. Usa [IMG:url] para mostrar productos.`;

    const chatMessages: Array<any> = [
      { role: 'system', content: systemPrompt }
    ];
    
    for (const msg of recentMessages) {
      const role = msg.role === 'customer' ? 'user' : 'assistant';
      if (msg.content_type === 'image' || msg.metadata?.imageUrl) {
        const imgUrl = msg.metadata?.imageUrl || msg.content;
        if (role === 'user' && imgUrl && imgUrl.startsWith('http')) {
          chatMessages.push({
            role: 'user',
            content: [
              { type: 'text', text: msg.metadata?.caption || msg.content || 'El cliente envió esta imagen:' },
              { type: 'image_url', image_url: { url: imgUrl, detail: 'low' } }
            ]
          });
        } else {
          chatMessages.push({ role, content: msg.content || '' });
        }
      } else {
        chatMessages.push({ role, content: msg.content || '' });
      }
    }

    const hasImage = recentMessages.some(m => m.content_type === 'image' || m.metadata?.imageUrl);
    const model = hasImage ? 'gpt-4o' : (settings.model || 'gpt-4o-mini');

    const completion = await openai.chat.completions.create({
      model,
      messages: chatMessages,
      temperature: parseFloat(settings.temperature) || 0.7,
      max_tokens: settings.max_tokens || 600,
    });

    let responseContent = completion.choices[0]?.message?.content || settings.fallback_message || 'Lo siento, no puedo responder en este momento.';
    const usage = completion.usage;

    // Detect [PEDIDO_LISTO] marker and build checkout redirect
    let orderAction: any = undefined;
    if (responseContent.includes('[PEDIDO_LISTO]')) {
      responseContent = responseContent.replace('[PEDIDO_LISTO]', '').trim();

      // Parse [DATOS_CLIENTE:nombre|telefono|email|direccion|ciudad]
      let customerInfo: any = {};
      const clienteMatch = responseContent.match(/\[DATOS_CLIENTE:([^\]]*)\]/);
      if (clienteMatch) {
        const parts = clienteMatch[1].split('|');
        const fullName = (parts[0] || '').trim();
        const nameParts = fullName.split(' ');
        customerInfo = {
          firstName: nameParts[0] || '',
          lastName: nameParts.slice(1).join(' ') || '',
          phone: (parts[1] || '').trim(),
          email: (parts[2] || '').trim(),
          address: (parts[3] || '').trim(),
          city: (parts[4] || '').trim(),
        };
        responseContent = responseContent.replace(clienteMatch[0], '').trim();
      }

      // Only match against the CURRENT response (the one with PEDIDO_LISTO that has the order summary)
      // Do NOT include previous AI messages as they contain full product listings that cause false matches
      const responseLower = responseContent.toLowerCase();
      const cartItems: any[] = [];
      const seenIds = new Set();
      const allProducts: any[] = [];
      for (const msg of recentMessages) {
        if (msg.direction === 'outbound' && msg.metadata?.products?.length > 0) {
          for (const p of msg.metadata.products) {
            if (p.id && !seenIds.has(p.id)) {
              seenIds.add(p.id);
              allProducts.push(p);
            }
          }
        }
      }
      // Match by word overlap: require 60%+ of significant words from product name in response
      for (const p of allProducts) {
        // Skip products with no stock
        if (p.stock !== null && p.stock !== undefined && Number(p.stock) <= 0) continue;
        // Skip if product is mentioned as "no disponible" in context
        const pNameLower = p.name.toLowerCase();
        const nameIdx = responseLower.indexOf(pNameLower);
        if (nameIdx >= 0) {
          const afterName = responseLower.substring(nameIdx + pNameLower.length, nameIdx + pNameLower.length + 50);
          if (afterName.includes('no disponible') || afterName.includes('agotad')) continue;
        }
        // Use words > 3 chars to avoid generic short words like "256", "GB", "5G" shared across similar products
        const nameWords = pNameLower.split(/[\s\-\/\(\)\+]+/).filter((w: string) => w.length > 3);
        const matchCount = nameWords.filter((w: string) => responseLower.includes(w)).length;
        const matchRatio = nameWords.length > 0 ? matchCount / nameWords.length : 0;
        if (responseLower.includes(pNameLower) || matchRatio >= 0.9) {
          cartItems.push({ productId: p.id, name: p.name, price: p.price, comparePrice: p.comparePrice, imageUrl: p.imageUrl, quantity: 1 });
        }
      }
      // Fallback: if no products matched by name, match by price mentioned in response
      if (cartItems.length === 0) {
        const priceMatches = responseLower.match(/\$[\d.,]+/g) || [];
        const mentionedPrices = priceMatches.map(p => Number(p.replace(/[$.,]/g, ''))).filter(n => n > 0);
        for (const p of allProducts) {
          if (p.price && mentionedPrices.includes(Number(p.price))) {
            cartItems.push({ productId: p.id, name: p.name, price: p.price, comparePrice: p.comparePrice, imageUrl: p.imageUrl, quantity: 1 });
          }
        }
      }
      // Update customer + merge with real customer if email matches
      if (conv.customer_id && (customerInfo.firstName || customerInfo.phone || customerInfo.address)) {
        const upd: any = {};
        if (customerInfo.firstName) { upd.first_name = customerInfo.firstName; upd.last_name = customerInfo.lastName || ''; }
        if (customerInfo.phone) upd.phone = customerInfo.phone;
        if (customerInfo.address) upd.address = customerInfo.address;
        if (customerInfo.city) upd.city = customerInfo.city;
        if (customerInfo.email && !customerInfo.email.includes('@widget.local')) {
          const { data: realCust } = await supabase
            .from('customers').select('id').eq('organization_id', organizationId)
            .eq('email', customerInfo.email).maybeSingle();
          if (realCust && realCust.id !== conv.customer_id) {
            upd.metadata = { ...(conv.customer?.metadata || {}), real_email: customerInfo.email, linked_customer_id: realCust.id };
            const rUpd: any = { last_seen_at: new Date().toISOString() };
            if (customerInfo.firstName) { rUpd.first_name = customerInfo.firstName; rUpd.last_name = customerInfo.lastName || ''; }
            if (customerInfo.phone) rUpd.phone = customerInfo.phone;
            if (customerInfo.address) rUpd.address = customerInfo.address;
            if (customerInfo.city) rUpd.city = customerInfo.city;
            await supabase.from('customers').update(rUpd).eq('id', realCust.id);
          } else {
            upd.metadata = { ...(conv.customer?.metadata || {}), real_email: customerInfo.email };
          }
        }
        if (Object.keys(upd).length > 0) {
          await supabase.from('customers').update(upd).eq('id', conv.customer_id);
        }
      }

      const checkoutDomain = orgInfo.domain ? `https://${orgInfo.domain}` : null;
      orderAction = {
        type: 'checkout_redirect',
        checkoutUrl: checkoutDomain ? `${checkoutDomain}/checkout` : null,
        cartItems,
        customerData: customerInfo,
        subdomain: orgInfo.subdomain || '',
        label: 'Completar Pedido',
      };
    }

    const { data: aiMessage } = await supabase
      .from('messages')
      .insert({
        organization_id: organizationId,
        conversation_id: conversationId,
        channel_id: conv.channel_id,
        direction: 'outbound',
        role: 'ai',
        content_type: 'text',
        content: responseContent,
        is_read: true,
        metadata: { 
          source: 'auto_response_v20', 
          model: completion.model, 
          tokens: usage?.total_tokens,
          products: (!skipProductCards && !orderAction && productsResult.products.length > 0) ? productsResult.products.slice(0, 6) : undefined,
          order_action: orderAction,
          context_used: {
            categories: !!categoriesText,
            products: !!productsResult.text,
            orders: !!ordersText,
            imageAnalysis: !!imageAnalysis,
            keywords,
            emailFromChat,
            domain: orgInfo.domain
          }
        }
      })
      .select()
      .single();

    await supabase.from('ai_jobs').insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      trigger_message_id: messageId,
      result_message_id: aiMessage?.id,
      job_type: 'auto_response',
      status: 'completed',
      response_text: responseContent,
      prompt_tokens: usage?.prompt_tokens || 0,
      completion_tokens: usage?.completion_tokens || 0,
      completed_at: new Date().toISOString(),
    });

    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString(), last_agent_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    return new Response(JSON.stringify({ success: true, messageId: aiMessage?.id, version: 20 }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
