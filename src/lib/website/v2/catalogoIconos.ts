/**
 * Catálogo del selector de íconos (Figma «16 Sitio web» 2852:70962, propuesta 8 aprobada el
 * 2026-11-23): categorías, nombres y sinónimos en español de los más usados por una tienda y
 * los sugeridos por acción (Carrito → carrito, bolsa, canasta, tienda, caja, paquete).
 *
 * El nombre estable de cada ícono es el de Phosphor en PascalCase («ShoppingCart»): es lo que se
 * guarda (`{ set: 'phosphor', name }`, ver glifosTienda.ts). La lista completa (unos 1.500, con
 * sus etiquetas de búsqueda) la genera `scripts/generar-catalogo-phosphor.mjs` en el ERP a partir
 * de este archivo; la tienda no la necesita (solo descarga el dibujo que usa).
 *
 * Código puro y sin imports. goadmin-websites guarda una copia IDÉNTICA en
 * `lib/website/v2/catalogoIconos.ts` (`npm run verify:copias`).
 */

/** Categorías del selector (además de «Todos» y «Más…», que no son una categoría guardada). */
export const CATEGORIAS_ICONOS = [
  'comercio', 'navegacion', 'personas', 'comunicacion', 'pagos', 'envios', 'comida', 'hogar', 'moda', 'belleza', 'mascotas',
] as const;
export type CategoriaIcono = (typeof CATEGORIAS_ICONOS)[number];

/** Letra de cada categoría en la lista generada (una cadena corta por ícono). */
export const LETRA_CATEGORIA: Readonly<Record<CategoriaIcono, string>> = {
  comercio: 'c', navegacion: 'n', personas: 'p', comunicacion: 'm', pagos: 'g', envios: 'e', comida: 'f', hogar: 'h', moda: 'o', belleza: 'b', mascotas: 'a',
};

/**
 * Nombre en español y sinónimos de los íconos más usados («Etiqueta|sinónimo sinónimo»). La
 * etiqueta se ve bajo el ícono y al pasar el mouse; los sinónimos solo sirven para buscar.
 */
export const NOMBRES_ES: Readonly<Record<string, string>> = {
  // Comercio
  ShoppingCart: 'Carrito|compras mercado supermercado',
  ShoppingCartSimple: 'Carrito simple|compras',
  ShoppingBag: 'Bolsa|compras paquete tienda',
  ShoppingBagOpen: 'Bolsa abierta|compras',
  Basket: 'Canasta|cesta mercado compras',
  Storefront: 'Tienda|local almacén negocio',
  Cube: 'Caja|cubo producto',
  Package: 'Paquete|caja envío pedido',
  Gift: 'Regalo|obsequio sorpresa',
  Tag: 'Etiqueta|precio oferta',
  TagSimple: 'Etiqueta simple|precio',
  Percent: 'Oferta|descuento porcentaje promoción',
  SealPercent: 'Descuento|oferta sello promoción',
  Ticket: 'Cupón|boleto entrada tiquete',
  Receipt: 'Recibo|factura pedido comprobante',
  Barcode: 'Código de barras|producto',
  Tote: 'Bolso|bolsa compras',
  Handbag: 'Cartera|bolso',
  Star: 'Estrella|favorito calificación destacado',
  BookmarkSimple: 'Guardar|marcador favorito',
  Bookmark: 'Marcador|guardar',
  Heart: 'Corazón|favoritos me gusta amor',
  HeartStraight: 'Corazón recto|favoritos',
  Crown: 'Corona|premium vip',
  Sparkle: 'Brillo|destello nuevo novedad',
  Lightning: 'Rayo|rápido oferta flash',
  Medal: 'Medalla|premio',
  Trophy: 'Trofeo|premio ganador',
  // Navegación
  House: 'Casa|inicio hogar home',
  HouseSimple: 'Casa simple|inicio',
  HouseLine: 'Casa línea|inicio',
  SquaresFour: 'Cuadrícula|categorías catálogo menú',
  GridFour: 'Rejilla|categorías',
  List: 'Menú|lista hamburguesa',
  ListBullets: 'Lista|viñetas categorías',
  ListDashes: 'Lista de guiones|menú',
  DotsThree: 'Más|tres puntos opciones',
  DotsNine: 'Aplicaciones|puntos menú',
  MagnifyingGlass: 'Lupa|buscar búsqueda',
  MagnifyingGlassPlus: 'Lupa con más|buscar acercar',
  ListMagnifyingGlass: 'Buscar en lista|búsqueda',
  Binoculars: 'Binoculares|buscar explorar',
  Compass: 'Brújula|explorar',
  ArrowLeft: 'Flecha izquierda|atrás volver',
  ArrowRight: 'Flecha derecha|siguiente',
  CaretRight: 'Siguiente|flecha',
  ArrowSquareOut: 'Abrir afuera|enlace externo',
  LinkSimpleHorizontal: 'Enlace|vínculo link',
  Link: 'Cadena|enlace vínculo',
  Globe: 'Mundo|idioma web país',
  Translate: 'Traducir|idioma',
  Info: 'Información|ayuda',
  Question: 'Pregunta|ayuda',
  File: 'Archivo|página documento',
  Article: 'Artículo|página blog',
  BookOpen: 'Libro|catálogo carta',
  // Personas
  User: 'Usuario|cuenta persona perfil',
  UserCircle: 'Usuario en círculo|cuenta perfil',
  UserCircleCheck: 'Usuario verificado|cuenta',
  Users: 'Usuarios|personas grupo',
  IdentificationBadge: 'Credencial|cuenta carné',
  SignIn: 'Ingresar|entrar iniciar sesión',
  SignOut: 'Salir|cerrar sesión',
  // Comunicación
  Phone: 'Teléfono|llamar celular',
  PhoneCall: 'Llamada|llamar teléfono',
  Headset: 'Soporte|audífonos ayuda',
  DeviceMobile: 'Celular|móvil teléfono',
  ChatCircle: 'Chat|mensaje conversación',
  ChatCircleDots: 'Chat con puntos|mensaje',
  ChatTeardrop: 'Mensaje|chat',
  ChatsCircle: 'Chats|conversación',
  WhatsappLogo: 'WhatsApp|chat mensaje',
  InstagramLogo: 'Instagram|red social',
  FacebookLogo: 'Facebook|red social',
  TiktokLogo: 'TikTok|red social',
  Envelope: 'Correo|email mensaje',
  PaperPlaneTilt: 'Enviar|avión de papel mensaje',
  Bell: 'Campana|notificación aviso',
  Megaphone: 'Megáfono|anuncio promoción',
  // Pagos
  Wallet: 'Billetera|pagos dinero',
  Coins: 'Monedas|dinero',
  Money: 'Billete|dinero efectivo',
  CurrencyDollar: 'Dólar|moneda precio dinero',
  CurrencyCircleDollar: 'Precio|moneda dinero',
  CreditCard: 'Tarjeta|pago crédito débito',
  Bank: 'Banco|pago',
  PiggyBank: 'Alcancía|ahorro',
  HandCoins: 'Pagar|dinero mano',
  // Envíos
  Truck: 'Camión|envío domicilio entrega',
  Moped: 'Moto|domicilio entrega',
  Van: 'Furgoneta|envío reparto',
  MapPin: 'Ubicación|mapa dirección cómo llegar',
  MapPinLine: 'Ruta|ubicación seguimiento',
  MapTrifold: 'Mapa|ubicación',
  NavigationArrow: 'Navegar|ubicación dirección',
  Signpost: 'Señal|dirección',
  Clock: 'Reloj|hora horario',
  Alarm: 'Alarma|recordatorio',
  CalendarDots: 'Calendario|fecha reserva',
  CalendarBlank: 'Calendario simple|fecha',
  CalendarCheck: 'Cita|agendar reserva calendario',
  CalendarPlus: 'Agendar|nueva cita calendario',
  // Comida
  ForkKnife: 'Cubiertos|restaurante comida',
  Hamburger: 'Hamburguesa|comida',
  Pizza: 'Pizza|comida',
  Coffee: 'Café|bebida cafetería',
  Wine: 'Vino|bebida licor',
  BeerBottle: 'Cerveza|bebida',
  Cookie: 'Galleta|postre',
  Cake: 'Pastel|torta postre cumpleaños',
  IceCream: 'Helado|postre',
  Carrot: 'Zanahoria|verdura mercado',
  OrangeSlice: 'Naranja|fruta',
  BowlFood: 'Plato|comida',
  ChefHat: 'Chef|cocina gorro',
  // Hogar
  Couch: 'Sofá|mueble sala',
  Bed: 'Cama|dormitorio hotel',
  Lamp: 'Lámpara|luz',
  Armchair: 'Sillón|mueble',
  Bathtub: 'Bañera|baño',
  Plant: 'Planta|jardín',
  Flower: 'Flor|floristería',
  Key: 'Llave|acceso',
  Wrench: 'Llave inglesa|herramienta servicio',
  Hammer: 'Martillo|herramienta',
  // Moda
  TShirt: 'Camisa|ropa camiseta',
  Dress: 'Vestido|ropa',
  Pants: 'Pantalón|ropa',
  Sneaker: 'Tenis|zapato calzado',
  Boot: 'Bota|zapato calzado',
  HighHeel: 'Tacón|zapato calzado',
  Eyeglasses: 'Gafas|anteojos lentes',
  Sunglasses: 'Gafas de sol|lentes',
  Watch: 'Reloj de pulsera|accesorio',
  Diamond: 'Diamante|joya',
  Backpack: 'Morral|mochila maleta',
  Baseball: 'Pelota|deporte',
  // Belleza
  Drop: 'Gota|crema aceite',
  Scissors: 'Tijeras|peluquería corte',
  Butterfly: 'Mariposa|belleza',
  FlowerLotus: 'Loto|spa bienestar',
  Smiley: 'Carita feliz|sonrisa',
  // Mascotas
  PawPrint: 'Huella|mascota animal',
  Dog: 'Perro|mascota',
  Cat: 'Gato|mascota',
  Bone: 'Hueso|perro mascota',
  Fish: 'Pez|mascota acuario',
  Bird: 'Pájaro|ave mascota',
  Horse: 'Caballo|animal',
};

/** Etiqueta en español (`null` si el ícono no tiene nombre en español). */
export function nombreEspanol(nombre: string): string | null {
  const v = NOMBRES_ES[nombre];
  return v ? v.split('|')[0] : null;
}

/**
 * Sugeridos por acción (los primeros que ve el selector y la tarjeta «Ícono»). Las claves son
 * las acciones del menú inferior (`ACCIONES_MENU`) y las de la cabecera (`currency`). Un sugerido
 * puede llevar un peso propio («Heart:fill» = el corazón relleno).
 */
export const SUGERIDOS_POR_ACCION: Readonly<Record<string, readonly string[]>> = {
  home: ['House', 'HouseSimple', 'HouseLine', 'Storefront', 'SquaresFour', 'Star'],
  categories_modal: ['SquaresFour', 'GridFour', 'ListBullets', 'List', 'Tag', 'Storefront'],
  categories_page: ['SquaresFour', 'GridFour', 'ListBullets', 'List', 'Tag', 'Storefront'],
  search: ['MagnifyingGlass', 'MagnifyingGlassPlus', 'ListMagnifyingGlass', 'Binoculars', 'Compass', 'Sparkle'],
  cart: ['ShoppingCart', 'ShoppingBag', 'Basket', 'Storefront', 'Cube', 'Package'],
  favorites: ['Heart', 'Heart:fill', 'Star', 'BookmarkSimple', 'Gift', 'Sparkle'],
  account: ['User', 'UserCircle', 'UserCircleCheck', 'IdentificationBadge', 'SignIn', 'Users'],
  menu: ['List', 'DotsThree', 'DotsNine', 'ListDashes', 'SquaresFour', 'ListBullets'],
  call: ['Phone', 'PhoneCall', 'Headset', 'DeviceMobile', 'ChatCircle', 'Envelope'],
  whatsapp: ['WhatsappLogo', 'ChatCircle', 'ChatCircleDots', 'ChatTeardrop', 'ChatsCircle', 'PaperPlaneTilt'],
  location: ['MapPin', 'MapTrifold', 'NavigationArrow', 'Compass', 'MapPinLine', 'Signpost'],
  booking: ['CalendarDots', 'CalendarBlank', 'CalendarCheck', 'CalendarPlus', 'Clock', 'Ticket'],
  appointment: ['CalendarCheck', 'CalendarPlus', 'Clock', 'Alarm', 'CalendarDots', 'Scissors'],
  order: ['ShoppingBag', 'ForkKnife', 'Hamburger', 'Pizza', 'Coffee', 'Package'],
  track_order: ['Truck', 'Package', 'MapPinLine', 'Moped', 'Receipt', 'Clock'],
  trial: ['Sparkle', 'Gift', 'Crown', 'Star', 'Lightning', 'Trophy'],
  page: ['LinkSimpleHorizontal', 'Tag', 'Percent', 'Receipt', 'Info', 'BookOpen'],
  url: ['LinkSimpleHorizontal', 'Link', 'Globe', 'ArrowSquareOut', 'InstagramLogo', 'WhatsappLogo'],
  currency: ['Globe', 'CurrencyDollar', 'Coins', 'Money', 'Wallet', 'Translate'],
  /** Ofertas y pedidos: sugeridos de los botones «Página» que llevan a esas páginas. */
  offers: ['Tag', 'Percent', 'SealPercent', 'Ticket', 'Lightning', 'Gift'],
  orders: ['Receipt', 'Package', 'Truck', 'ClipboardText', 'ShoppingBag', 'Clock'],
};

/** Un sugerido leído: nombre y, si lo trae, su peso propio («Heart:fill»). */
export function leerSugerido(s: string): { name: string; weight?: string } {
  const [name, weight] = s.split(':');
  return weight ? { name, weight } : { name };
}

/** Sugeridos de una acción (sin acción conocida, los del carrito: la acción más común). */
export function sugeridosDe(accion: string): readonly string[] {
  return SUGERIDOS_POR_ACCION[accion] ?? [];
}

/** Texto de búsqueda sin tildes, en minúsculas y con espacios simples. */
export function normalizarBusqueda(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * ¿La entrada (sus etiquetas ya normalizadas) responde a la búsqueda? Cada palabra buscada debe
 * empezar alguna palabra de las etiquetas: «carr» encuentra «carrito»; «bolsa compras», la bolsa.
 */
export function coincideBusqueda(etiquetas: string, consulta: string): boolean {
  const q = normalizarBusqueda(consulta);
  if (!q) return true;
  const palabras = ` ${etiquetas}`;
  return q.split(' ').every((p) => palabras.includes(` ${p}`));
}
