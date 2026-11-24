/**
 * Pedido que arma el chat de atención (botón «Completar pedido»): qué
 * productos y qué medio de pago viajan al checkout de la tienda.
 *
 * Módulo puro, sin base de datos ni Deno: lo importa `ai-auto-response` (con
 * `.ts`) y lo prueba Jest (sin extensión), igual que el resto de `_shared/ai-chat`.
 *
 * Por qué existe (2026-11-24, org 358): el chat resumió 3 productos (subtotal
 * $ 74.100, total $ 94.100) y el botón llevó 4 al checkout ($ 106.100). El
 * cuarto, «Juego de Ollas 7 piezas», no estaba en el pedido: su nombre es el
 * comienzo de «Juego de Ollas 7 Piezas Acero Inoxidable Línea Maestro», que sí
 * estaba, y el cruce buscaba cada nombre en TODO el texto de la respuesta. Ahora
 * el cruce va línea por línea del resumen y, dentro de cada línea, gana el
 * nombre más largo; el nombre que ya cubrió otro producto no vuelve a contar.
 */

export interface ProductoMostrado {
  id: number | string;
  name: string;
  price?: number | string | null;
  comparePrice?: number | string | null;
  imageUrl?: string | null;
  stock?: number | string | null;
}

export interface ItemCarritoChat {
  productId: number | string;
  name: string;
  price: number | string | null | undefined;
  comparePrice: number | string | null | undefined;
  imageUrl: string | null | undefined;
  quantity: number;
}

export interface MetodoPagoWeb {
  /** `organization_payment_methods.payment_method_code` (el que usa el checkout). */
  code: string;
  /** Nombre con el que se le ofreció al cliente. */
  name: string;
}

/** Minúsculas, sin tildes ni markdown, con un solo espacio entre palabras. */
export function normalizarTexto(valor: unknown): string {
  return String(valor ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Igual que `normalizarTexto`, pero todo lo que no es letra o número es un espacio. */
function soloPalabras(valor: unknown): string {
  return normalizarTexto(valor).replace(/[^a-z0-9]+/g, ' ').trim();
}

/** ¿`frase` aparece en `texto` como palabras completas? (ambos ya en `soloPalabras`). */
function contieneFrase(texto: string, frase: string): boolean {
  return frase.length > 0 && ` ${texto} `.includes(` ${frase} `);
}

/** Líneas del resumen que no son de producto (totales, entrega, pago). */
const LINEA_NO_PRODUCTO = /^(sub ?total|total|envio|domicilio|costo de envio|iva|inc|impuesto|descuento|cupon|propina|pago|metodo de pago|forma de pago|entrega|direccion|ciudad|nombre|telefono|correo|email)\b/;

const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'con', 'para', 'en', 'a', 'por', 'un', 'una']);

/** Pesos escritos en el texto («$ 74.100», «$74,100»): valores enteros. */
function preciosDeLaLinea(linea: string): number[] {
  const hallados = linea.match(/\$\s*[\d.,]+/g) || [];
  return hallados
    .map((p) => Number(p.replace(/[^\d]/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function cantidadDeLaLinea(resto: string, precioUnitario: number): number {
  const explicita =
    resto.match(/(?:^|[\s(])(?:x|×)\s*(\d{1,3})(?!\d)/) ||
    resto.match(/(?:^|\s)(\d{1,3})\s*(?:x|×)(?:\s|$)/) ||
    resto.match(/(?:^|\s)(\d{1,3})\s*(?:unidades|unidad|und|uds|ud)\b/) ||
    resto.match(/cantidad\s*:?\s*(\d{1,3})(?!\d)/);
  if (explicita) {
    const n = Number(explicita[1]);
    if (n >= 1 && n <= 999) return n;
  }
  // Sin cantidad escrita: si la línea trae un importe que es un múltiplo exacto
  // del precio unitario («…: $ 19.200» con precio $ 9.600), ese es el número.
  if (precioUnitario > 0) {
    for (const importe of preciosDeLaLinea(resto)) {
      const veces = importe / precioUnitario;
      if (Number.isInteger(veces) && veces >= 2 && veces <= 99) return veces;
    }
  }
  return 1;
}

/**
 * Productos del pedido a partir de la respuesta con `[PEDIDO_LISTO]` y de los
 * productos que el chat le mostró al cliente (tarjetas de la conversación).
 *
 * - Línea por línea: los totales, el envío, el pago y la entrega no cuentan.
 * - En cada línea gana el nombre completo más largo; su tramo se tacha, así un
 *   nombre que es prefijo de otro no se cuela como producto aparte.
 * - Sin nombre completo, la regla de antes por palabras (≥ 90 % de las palabras
 *   de más de 3 letras), ahora dentro de la línea y quedándose con la mejor.
 * - Producto sin stock o que la línea marca «no disponible»/«agotado»: fuera.
 * - Un producto repetido en el texto (resumen + confirmación) cuenta una vez.
 * - Respaldo de siempre: si ningún nombre coincide, por precio mencionado.
 */
export function armarCarritoDelResumen(respuesta: string, productos: ProductoMostrado[]): ItemCarritoChat[] {
  const vistos = new Set<string>();
  const candidatos = productos.filter((p) => {
    if (!p || p.id === null || p.id === undefined || !p.name) return false;
    const clave = String(p.id);
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  }).map((p) => ({
    p,
    nombre: soloPalabras(p.name),
    // Sin stock: se reconoce en la línea (para que no la reclame otro) pero no entra.
    agotado: p.stock !== null && p.stock !== undefined && Number(p.stock) <= 0,
  }))
    .filter((c) => c.nombre.length > 0)
    // El nombre más largo primero: es el que gana dentro de una línea.
    .sort((a, b) => b.nombre.length - a.nombre.length);

  const cantidades = new Map<string, { p: ProductoMostrado; cantidad: number; orden: number }>();
  let orden = 0;
  const agregar = (p: ProductoMostrado, cantidad: number) => {
    const clave = String(p.id);
    const previo = cantidades.get(clave);
    if (previo) {
      previo.cantidad = Math.max(previo.cantidad, cantidad);
    } else {
      cantidades.set(clave, { p, cantidad, orden: orden++ });
    }
  };

  for (const lineaCruda of respuesta.split('\n')) {
    const textoLinea = normalizarTexto(lineaCruda);
    const sinVineta = textoLinea.replace(/^[-•·>\d.)\s]*(?=[a-z$])/, '');
    if (!sinVineta || LINEA_NO_PRODUCTO.test(sinVineta)) continue;
    let linea = soloPalabras(lineaCruda);

    let encontrado = false;
    for (const c of candidatos) {
      if (!contieneFrase(linea, c.nombre)) continue;
      // Lo que rodea al nombre en la línea (si la puntuación difiere, la línea entera).
      const nombreTexto = normalizarTexto(c.p.name);
      const desde = textoLinea.indexOf(nombreTexto);
      const tras = desde >= 0 ? textoLinea.slice(desde + nombreTexto.length) : textoLinea;
      // Se tacha el tramo: lo que queda de la línea ya no puede nombrar otro producto con él.
      linea = ` ${linea} `.replace(` ${c.nombre} `, ' | ').trim();
      encontrado = true;
      if (c.agotado || /^.{0,50}(no disponible|agotad)/.test(tras)) continue;
      const resto = desde >= 0 ? textoLinea.slice(0, desde) + ' ' + tras : textoLinea;
      agregar(c.p, cantidadDeLaLinea(resto, Number(c.p.price) || 0));
    }
    if (encontrado) continue;

    // Sin nombre completo (la IA lo escribió un poco distinto): por palabras, el
    // mejor de la línea. Cuentan todas las palabras salvo artículos y
    // preposiciones, y los números son obligatorios: «Juego de Ollas 5 piezas» no
    // es «Juego de Ollas 7 piezas» aunque compartan las palabras largas.
    let mejor: { c: (typeof candidatos)[number]; razon: number } | null = null;
    for (const c of candidatos) {
      if (c.agotado) continue;
      const palabras = c.nombre.split(' ').filter((w) => w && !PALABRAS_VACIAS.has(w));
      if (palabras.length < 2) continue;
      if (palabras.some((w) => /\d/.test(w) && !contieneFrase(linea, w))) continue;
      const razon = palabras.filter((w) => contieneFrase(linea, w)).length / palabras.length;
      if (razon >= 0.9 && (!mejor || razon > mejor.razon)) mejor = { c, razon };
    }
    if (mejor) agregar(mejor.c.p, cantidadDeLaLinea(textoLinea, Number(mejor.c.p.price) || 0));
  }

  let items = [...cantidades.values()].sort((a, b) => a.orden - b.orden);

  if (items.length === 0) {
    const mencionados = preciosDeLaLinea(respuesta);
    items = candidatos
      .filter((c) => !c.agotado && c.p.price && mencionados.includes(Number(c.p.price)))
      .map((c) => ({ p: c.p, cantidad: 1, orden: 0 }));
  }

  return items.map(({ p, cantidad }) => ({
    productId: p.id,
    name: p.name,
    price: p.price,
    comparePrice: p.comparePrice,
    imageUrl: p.imageUrl,
    quantity: cantidad,
  }));
}

/** «Subtotal: $ 74.100» del resumen, o null si no lo escribió. */
export function subtotalDelResumen(respuesta: string): number | null {
  for (const linea of respuesta.split('\n')) {
    const n = normalizarTexto(linea).replace(/^[-•·>\s]*/, '');
    if (!/^sub ?total\b/.test(n)) continue;
    const precios = preciosDeLaLinea(linea);
    if (precios.length > 0) return precios[0];
  }
  return null;
}

/** Suma del carrito (precio × cantidad). */
export function subtotalDelCarrito(items: ItemCarritoChat[]): number {
  return items.reduce((s, i) => s + (Number(i.price) || 0) * i.quantity, 0);
}

// ---------------------------------------------------------------------------
// Medio de pago
// ---------------------------------------------------------------------------

/** Código válido para viajar en la URL (`metodo=`). */
export function codigoMetodoValido(valor: unknown): valor is string {
  return typeof valor === 'string' && /^[a-z0-9_]{1,40}$/.test(valor);
}

/**
 * Cómo puede nombrar el cliente (o la IA) cada medio, según su código. Solo se
 * usa para los códigos que la organización tiene activos en la tienda: nunca
 * produce un código que no esté en esa lista.
 */
function aliasDelCodigo(code: string): string[] {
  const c = code.toLowerCase();
  if (c === 'cash') return ['contra entrega', 'contraentrega', 'efectivo', 'pago al recibir', 'pagar al recibir', 'pago contra entrega', 'cash'];
  if (c === 'transfer') return ['transferencia', 'transferencia bancaria', 'consignacion'];
  if (c === 'card') return ['tarjeta', 'tarjeta de credito', 'tarjeta debito', 'tarjeta de debito'];
  if (c.startsWith('bold')) return ['bold'];
  if (c === 'mp' || c.startsWith('mp_') || c.includes('mercadopago') || c.includes('mercado_pago')) return ['mercado pago', 'mercadopago'];
  if (c.startsWith('wompi')) return ['wompi'];
  if (c.startsWith('payu')) return ['payu'];
  if (c.startsWith('stripe')) return ['stripe'];
  if (c.startsWith('paypal')) return ['paypal'];
  if (c.startsWith('nequi')) return ['nequi'];
  if (c.startsWith('daviplata')) return ['daviplata'];
  if (c.startsWith('addi')) return ['addi'];
  if (c.startsWith('sistecredito')) return ['sistecredito'];
  return [];
}

function codigosNombrados(texto: string, metodos: MetodoPagoWeb[]): Set<string> {
  const t = soloPalabras(texto);
  const codigos = new Set<string>();
  if (!t) return codigos;
  for (const m of metodos) {
    const frases = [soloPalabras(m.name), ...aliasDelCodigo(m.code).map(soloPalabras)];
    // El código mismo solo si es una palabra con sentido (no «mp»).
    if (m.code.length > 3) frases.push(soloPalabras(m.code));
    if (frases.some((f) => f.length > 2 && contieneFrase(t, f))) codigos.add(m.code);
  }
  return codigos;
}

function unico(codigos: Set<string>): string | null {
  return codigos.size === 1 ? [...codigos][0] : null;
}

/** La primera línea que habla de pago y nombra exactamente un medio. */
function metodoEnLineasDePago(texto: string, metodos: MetodoPagoWeb[]): string | null {
  for (const linea of texto.split('\n')) {
    if (!/\b(pago|pagar|paga|metodo|medio)\b/.test(normalizarTexto(linea))) continue;
    const codigo = unico(codigosNombrados(linea, metodos));
    if (codigo) return codigo;
  }
  return null;
}

export interface MensajeAnterior {
  autor: 'cliente' | 'ia';
  texto: string;
}

/**
 * Código del medio de pago que se eligió en la conversación, entre los medios
 * activos de la organización en la tienda (`metodos`). null si no hay uno claro.
 *
 * 1. La respuesta que cierra el pedido: la línea «Pago: …» y, si no, el texto entero.
 * 2. Los mensajes anteriores, del más reciente al más viejo: de la IA solo
 *    cuentan las líneas de pago (cuando PREGUNTA, lista todos y es ambiguo); del
 *    cliente, el mensaje entero.
 * Siempre exige que se nombre UN solo medio: «tarjeta o contraentrega» no decide.
 */
export function metodoPagoDelChat(
  respuesta: string,
  anteriores: MensajeAnterior[],
  metodos: MetodoPagoWeb[],
): string | null {
  const validos = metodos.filter((m) => m && codigoMetodoValido(m.code));
  if (validos.length === 0) return null;

  const enRespuesta = metodoEnLineasDePago(respuesta, validos) ?? unico(codigosNombrados(respuesta, validos));
  if (enRespuesta) return enRespuesta;

  for (const m of anteriores) {
    const codigo = m.autor === 'ia'
      ? metodoEnLineasDePago(m.texto, validos)
      : unico(codigosNombrados(m.texto, validos));
    if (codigo) return codigo;
  }
  return null;
}
