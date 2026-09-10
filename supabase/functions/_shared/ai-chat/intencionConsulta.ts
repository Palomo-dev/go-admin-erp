/**
 * ¿El cliente esta preguntando por productos? — logica pura.
 *
 * Origen (auditoria 2026-09-09 sobre 15.016 respuestas reales): el bot lanzaba
 * una busqueda de catalogo con casi cualquier palabra. Las que mas veces
 * buscaron sin encontrar nada no eran productos:
 *
 *   pago (353) · entrega (270) · contra (223) · pagar (149) · envio (109) ·
 *   llega (107) · contraentrega (106) · wompi (88) · demora (77) · dinero (61) ·
 *   nequi (58) · estafa (49) · reembolso (39) · estafadores (39)
 *
 * Ademas se usaban como termino de busqueda un correo electronico (132 veces) y
 * un numero de telefono (78 veces). El 45% de las busquedas no encontro nada, y
 * en 342 respuestas se mostraron tarjetas de producto sobre mensajes de reclamo.
 *
 * Este modulo decide ANTES de consultar. La decision final —"¿esta palabra
 * nombra algo del catalogo DE ESTA tienda?"— no se toma aqui con una lista
 * cableada, sino en `palabras_de_catalogo()`, contra el catalogo real.
 */

/** Palabras que nunca nombran un producto: gramatica y muletillas. */
const VACIAS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'lo', 'le', 'les',
  'de', 'del', 'al', 'a', 'en', 'con', 'por', 'para', 'sin', 'sobre', 'desde',
  'que', 'quien', 'cual', 'cuales', 'donde', 'cuando', 'como', 'porque', 'pues',
  'es', 'son', 'era', 'fue', 'ser', 'estar', 'estan', 'esta', 'este', 'esto',
  'estos', 'estas', 'ese', 'esa', 'eso', 'esos', 'esas', 'aqui', 'ahi', 'alla',
  'yo', 'tu', 'usted', 'ustedes', 'nosotros', 'me', 'mi', 'te', 'se', 'su',
  'sus', 'nos', 'y', 'o', 'pero', 'si', 'no', 'ya', 'aun', 'tambien', 'muy',
  'mas', 'menos', 'tan', 'solo', 'todo', 'toda', 'todos', 'todas', 'nada',
  'algo', 'mucho', 'poco', 'muchas', 'muchos', 'otro', 'otra', 'otros', 'otras',
  'bien', 'mal', 'bueno', 'buena', 'hoy', 'ayer', 'manana', 'ahora', 'siempre',
  'nunca', 'entonces', 'asi', 'mismo', 'verdad', 'favor', 'gracias', 'hola',
  'buenas', 'buenos', 'dias', 'tardes', 'noches', 'ok', 'okey', 'listo', 'dale',
  'vale', 'claro', 'perfecto', 'entendido', 'acuerdo', 'espero', 'quiero',
  'necesito', 'busco', 'quisiera', 'puedo', 'puede', 'puedes', 'pueden',
  'tengo', 'tiene', 'tienen', 'tienes', 'hay', 'hacer', 'hacen', 'hace',
  'dar', 'dame', 'ver', 'mostrar', 'muestrame', 'decir', 'saber', 'ir', 'voy',
  'venir', 'llegar', 'pasar', 'poner', 'deber', 'poder', 'estoy', 'estamos',
]);

/**
 * Vocabulario de atencion al cliente: pagos, envios, reclamos.
 *
 * NO se usa para borrar palabras (una tienda podria vender algo llamado asi),
 * sino para detectar que el mensaje va de servicio y no de catalogo.
 */
const SOPORTE = [
  'pago', 'pagar', 'pague', 'pagos', 'pagaron', 'cobro', 'cobraron',
  'entrega', 'entregar', 'entregaron', 'contraentrega', 'contra entrega',
  'envio', 'envios', 'enviar', 'enviaron', 'envian', 'despacho', 'guia',
  'llega', 'llego', 'llegue', 'llegara', 'llegado', 'demora', 'demorado',
  'retraso', 'retrasado', 'esperando', 'espera',
  'pedido', 'orden', 'compra', 'compre', 'factura', 'recibo',
  'devolucion', 'devolver', 'reembolso', 'garantia', 'cambio', 'cambiar',
  'reclamo', 'queja', 'estafa', 'estafadores', 'estafaron', 'fraude',
  'cancelar', 'cancele', 'cancelacion', 'dinero', 'plata', 'saldo',
  'wompi', 'nequi', 'daviplata', 'bancolombia', 'efectivo', 'transferencia',
  'seguimiento', 'rastreo', 'transportadora', 'domicilio',
  'horario', 'ubicados', 'ubicacion', 'direccion', 'telefono', 'whatsapp',
];

const RE_CORREO = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const RE_URL = /https?:\/\/\S+|www\.\S+/gi;
/** Candidato a telefono; se confirma contando digitos, no por la forma. */
const RE_POSIBLE_TELEFONO = /\+?\d[\d\s().-]{5,}\d/g;

/**
 * Quita correos, enlaces y telefonos: nunca son consultas de catalogo.
 *
 * El telefono se confirma contando digitos (7 o mas). Con solo la forma, una
 * consulta legitima como "talla 42 43 44" se perderia por parecer un numero.
 */
export function quitarDatosDeContacto(texto: string): string {
  return texto
    .replace(RE_CORREO, ' ')
    .replace(RE_URL, ' ')
    .replace(RE_POSIBLE_TELEFONO, (coincidencia) =>
      coincidencia.replace(/\D/g, '').length >= 7 ? ' ' : coincidencia
    );
}

/** Normaliza igual que `normalizar_busqueda()` en Postgres. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    // Marcas diacriticas combinantes, escritas como escapes para que sean
    // visibles: si se dejan como caracteres literales, no se ven al leer.
    .replace(/[̀-ͯ]/g, '')
    // Apostrofo recto y tipografico: "Men's" -> "mens", como en el catalogo.
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Palabras candidatas a nombrar un producto. Quita contacto, normaliza y
 * descarta gramatica. NO descarta el vocabulario de soporte: de eso se encarga
 * `pareceSoporte`, porque una tienda podria vender algo con ese nombre.
 */
export function extraerTokens(texto: string, maximo = 6): string[] {
  const limpio = normalizar(quitarDatosDeContacto(texto));
  const palabras = limpio
    .split(' ')
    .filter((w) => w.length >= 2 && !VACIAS.has(w) && !/^\d+$/.test(w));
  return [...new Set(palabras)].slice(0, maximo);
}

/** El mensaje habla de pagos, envios o reclamos, no de catalogo. */
export function pareceSoporte(texto: string): boolean {
  const n = normalizar(texto);
  if (!n) return false;
  const conBordes = ` ${n} `;
  return SOPORTE.some((p) => conBordes.includes(` ${p} `));
}

/** Palabras que, solas o entre ellas, no piden nada: saludos y acuses de recibo. */
const CORTESIA = new Set([
  'hola', 'holi', 'ola', 'holaa', 'buenas', 'buenos', 'buen', 'dia', 'dias',
  'tardes', 'noches', 'saludos', 'hey', 'gracias', 'muchas', 'mil', 'ok',
  'okey', 'oki', 'listo', 'dale', 'bueno', 'buena', 'vale', 'si', 'no',
  'claro', 'perfecto', 'entendido', 'de', 'acuerdo', 'ya', 'adios', 'chao',
  'hasta', 'luego', 'bien', 'todo', 'gracia', 'excelente', 'genial',
]);

/**
 * Saludo o acuse de recibo, y NADA mas.
 *
 * Antes esto era `^(hola|...)( .*)?$`, que daba por cortesia cualquier mensaje
 * que EMPEZARA por un saludo. En un chat la mayoria empieza asi: "Hola, tienen
 * armarios?" se clasificaba como cortesia, no se consultaba el catalogo y el
 * modelo respondia que no habia armarios teniendo decenas. Ahora tienen que
 * serlo todas las palabras.
 */
export function pareceCortesia(texto: string): boolean {
  const n = normalizar(texto);
  if (!n) return false;
  const palabras = n.split(' ').filter(Boolean);
  if (palabras.length === 0 || palabras.length > 6) return false;
  return palabras.every((w) => CORTESIA.has(w));
}

export interface DecisionBusqueda {
  buscar: boolean;
  motivo: 'consulta_de_producto' | 'cortesia' | 'soporte' | 'sin_palabras_utiles';
  tokens: string[];
}

/**
 * ¿Vale la pena consultar el catalogo?
 *
 * Devuelve los tokens para que quien llame los valide contra el vocabulario real
 * de la organizacion (`palabras_de_catalogo`) antes de buscar de verdad.
 */
export function decidirBusquedaCatalogo(texto: string): DecisionBusqueda {
  const tokens = extraerTokens(texto);

  if (pareceCortesia(texto)) {
    return { buscar: false, motivo: 'cortesia', tokens: [] };
  }
  if (tokens.length === 0) {
    return { buscar: false, motivo: 'sin_palabras_utiles', tokens: [] };
  }
  if (pareceSoporte(texto)) {
    return { buscar: false, motivo: 'soporte', tokens };
  }
  return { buscar: true, motivo: 'consulta_de_producto', tokens };
}
