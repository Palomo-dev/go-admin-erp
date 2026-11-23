/**
 * generar-catalogo-phosphor.mjs — lista completa del selector de íconos (Figma «16 Sitio web»
 * 2852:70962, propuesta 8 aprobada el 2026-11-23).
 *
 *   node --experimental-strip-types --no-warnings scripts/generar-catalogo-phosphor.mjs [ruta a @phosphor-icons/core]
 *
 * Lee el catálogo de `@phosphor-icons/core` (por defecto el que instala la tienda en
 * ../../goadmin-websites/node_modules) y escribe `src/lib/website/v2/catalogoPhosphor.generado.ts`:
 * por cada ícono, su nombre estable (PascalCase), sus categorías del selector, la etiqueta en
 * español (la de `NOMBRES_ES` o una traducción palabra por palabra) y el texto de búsqueda
 * (español + inglés, sin tildes). Nada de esto viaja a la tienda: solo lo carga el editor al
 * abrir el selector.
 *
 * Sin dependencias: el ERP no instala @phosphor-icons/core (el dibujo en el editor sale de
 * react-icons/pi, que trae los mismos 1.512 íconos de Phosphor 2.1).
 */
import { writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CORE = resolve(process.argv[2] || join(ROOT, '..', '..', 'goadmin-websites', 'node_modules', '@phosphor-icons', 'core'))
const entrada = join(CORE, 'dist', 'index.mjs')
if (!existsSync(entrada)) {
  console.error(`No encuentro @phosphor-icons/core en ${CORE}. Pasa la ruta como primer argumento.`)
  process.exit(1)
}
const { icons } = await import(pathToFileURL(entrada).href)
const version = JSON.parse(await (await import('node:fs/promises')).readFile(join(CORE, 'package.json'), 'utf8')).version
const C = await import(pathToFileURL(join(ROOT, 'src/lib/website/v2/catalogoIconos.ts')).href)

/** Inglés → español, para las palabras del nombre y las etiquetas de Phosphor. */
const ES = {
  shopping: 'compras', cart: 'carrito', bag: 'bolsa', basket: 'canasta', store: 'tienda', storefront: 'tienda', shop: 'tienda',
  market: 'mercado', groceries: 'mercado', buy: 'comprar', buying: 'comprar', checkout: 'pagar', sale: 'oferta', discount: 'descuento',
  price: 'precio', tag: 'etiqueta', gift: 'regalo', present: 'regalo', package: 'paquete', box: 'caja', cube: 'caja', receipt: 'recibo',
  invoice: 'factura', coupon: 'cupon', ticket: 'tiquete', percent: 'porcentaje', star: 'estrella', heart: 'corazon', love: 'amor',
  like: 'me gusta', favorite: 'favorito', favorites: 'favoritos', bookmark: 'marcador', crown: 'corona', sparkle: 'brillo', diamond: 'diamante',
  house: 'casa', home: 'inicio', list: 'lista', menu: 'menu', grid: 'rejilla', squares: 'cuadros', dots: 'puntos', three: 'tres',
  magnifying: 'lupa', glass: 'vidrio', search: 'buscar', find: 'buscar', compass: 'brujula', arrow: 'flecha', arrows: 'flechas',
  left: 'izquierda', right: 'derecha', up: 'arriba', down: 'abajo', back: 'atras', next: 'siguiente', caret: 'flecha', link: 'enlace',
  globe: 'mundo', world: 'mundo', language: 'idioma', translate: 'traducir', info: 'informacion', question: 'pregunta', help: 'ayuda',
  file: 'archivo', page: 'pagina', book: 'libro', open: 'abierto', user: 'usuario', users: 'usuarios', person: 'persona', people: 'personas',
  account: 'cuenta', profile: 'perfil', circle: 'circulo', check: 'verificado', sign: 'senal', in: 'entrar', out: 'salir', login: 'ingresar',
  phone: 'telefono', call: 'llamar', mobile: 'celular', device: 'dispositivo', chat: 'chat', chats: 'chats', message: 'mensaje',
  messages: 'mensajes', envelope: 'sobre', mail: 'correo', email: 'correo', send: 'enviar', paper: 'papel', plane: 'avion', bell: 'campana',
  notification: 'notificacion', megaphone: 'megafono', wallet: 'billetera', coins: 'monedas', coin: 'moneda', money: 'dinero',
  currency: 'moneda', dollar: 'dolar', credit: 'credito', card: 'tarjeta', bank: 'banco', piggy: 'alcancia', hand: 'mano', pay: 'pagar',
  payment: 'pago', truck: 'camion', delivery: 'domicilio', shipping: 'envio', moped: 'moto', van: 'furgoneta', map: 'mapa', pin: 'ubicacion',
  location: 'ubicacion', navigation: 'navegar', route: 'ruta', clock: 'reloj', time: 'hora', alarm: 'alarma', calendar: 'calendario',
  date: 'fecha', fork: 'tenedor', knife: 'cuchillo', food: 'comida', restaurant: 'restaurante', hamburger: 'hamburguesa', pizza: 'pizza',
  coffee: 'cafe', wine: 'vino', beer: 'cerveza', bottle: 'botella', cookie: 'galleta', cake: 'pastel', ice: 'hielo', cream: 'crema',
  carrot: 'zanahoria', orange: 'naranja', fruit: 'fruta', bowl: 'plato', chef: 'chef', hat: 'gorro', drink: 'bebida', couch: 'sofa',
  sofa: 'sofa', bed: 'cama', lamp: 'lampara', armchair: 'sillon', chair: 'silla', bathtub: 'banera', plant: 'planta', flower: 'flor',
  tree: 'arbol', key: 'llave', wrench: 'herramienta', hammer: 'martillo', tools: 'herramientas', shirt: 'camisa', t: 'camiseta',
  dress: 'vestido', pants: 'pantalon', sneaker: 'tenis', boot: 'bota', shoe: 'zapato', heel: 'tacon', high: 'alto', eyeglasses: 'gafas',
  sunglasses: 'gafas de sol', watch: 'reloj', backpack: 'morral', clothing: 'ropa', clothes: 'ropa', fashion: 'moda', drop: 'gota',
  scissors: 'tijeras', butterfly: 'mariposa', lotus: 'loto', smiley: 'carita', beauty: 'belleza', paw: 'huella', print: 'huella',
  dog: 'perro', cat: 'gato', bone: 'hueso', fish: 'pez', bird: 'pajaro', horse: 'caballo', pet: 'mascota', pets: 'mascotas',
  animal: 'animal', simple: 'simple', line: 'linea', plus: 'mas', minus: 'menos', x: 'cerrar', close: 'cerrar', trash: 'basura',
  camera: 'camara', image: 'imagen', video: 'video', play: 'reproducir', music: 'musica', car: 'carro', bus: 'bus', bicycle: 'bicicleta',
  airplane: 'avion', boat: 'barco', building: 'edificio', buildings: 'edificios', office: 'oficina', briefcase: 'maletin', lock: 'candado',
  shield: 'escudo', light: 'luz', lightbulb: 'bombillo', lightning: 'rayo', sun: 'sol', moon: 'luna', cloud: 'nube', fire: 'fuego',
  leaf: 'hoja', medal: 'medalla', trophy: 'trofeo', baseball: 'pelota', ball: 'pelota', game: 'juego', headset: 'audifonos', eye: 'ojo',
  warning: 'alerta', gear: 'ajustes', settings: 'ajustes', share: 'compartir', download: 'descargar', upload: 'subir', edit: 'editar',
  pencil: 'lapiz', note: 'nota', clipboard: 'portapapeles', text: 'texto', article: 'articulo', school: 'escuela', student: 'estudiante',
  baby: 'bebe', first: 'primeros', aid: 'auxilios', pill: 'pastilla', heartbeat: 'pulso', stethoscope: 'estetoscopio', tooth: 'diente',
  barbell: 'pesa', bandaids: 'curitas', ticket2: 'tiquete',
}

/** Palabras de etiquetas de Phosphor que llevan a cada categoría del selector. */
const POR_ETIQUETA = {
  envios: ['truck', 'package', 'shipping', 'delivery', 'van', 'moped', 'airplane', 'warehouse', 'scooter', 'motorcycle', 'courier', 'mailbox', 'route', 'gps', 'address'],
  comida: ['food', 'drink', 'drinks', 'restaurant', 'restaurants', 'meal', 'dining', 'beverage', 'beverages', 'fruit', 'vegetable', 'dessert', 'coffee', 'cooking', 'kitchen', 'eat', 'eating', 'snack', 'bakery', 'alcohol'],
  hogar: ['home', 'house', 'furniture', 'household', 'appliance', 'appliances', 'bedroom', 'bathroom', 'garden', 'decor', 'tools', 'construction', 'cleaning'],
  moda: ['clothing', 'clothes', 'apparel', 'fashion', 'shoe', 'shoes', 'accessories', 'jewelry', 'outfit', 'garment', 'wearable'],
  belleza: ['beauty', 'cosmetics', 'makeup', 'spa', 'salon', 'hair', 'skincare', 'perfume', 'nails', 'barber'],
  mascotas: ['pet', 'pets', 'animal', 'animals', 'dog', 'dogs', 'cat', 'cats', 'paw', 'veterinary', 'fish', 'bird', 'birds'],
}
const POR_CATEGORIA_PHOSPHOR = {
  commerce: 'comercio',
  arrows: 'navegacion',
  people: 'personas',
  communications: 'comunicacion',
  finances: 'pagos',
}
/** Los del catálogo con nombre en español que no caen solos en su categoría. */
const FORZADAS = {
  House: ['navegacion', 'hogar'], HouseSimple: ['navegacion', 'hogar'], HouseLine: ['navegacion', 'hogar'], SquaresFour: ['navegacion'], GridFour: ['navegacion'],
  List: ['navegacion'], ListBullets: ['navegacion'], ListDashes: ['navegacion'], DotsThree: ['navegacion'], DotsNine: ['navegacion'],
  MagnifyingGlass: ['navegacion'], MagnifyingGlassPlus: ['navegacion'], ListMagnifyingGlass: ['navegacion'], Binoculars: ['navegacion'], Compass: ['navegacion'],
  LinkSimpleHorizontal: ['navegacion'], Link: ['navegacion'], Globe: ['navegacion'], Translate: ['navegacion'], Info: ['navegacion'], Question: ['navegacion'],
  File: ['navegacion'], Article: ['navegacion'], BookOpen: ['navegacion'], SignIn: ['personas'], SignOut: ['personas'], IdentificationBadge: ['personas'],
  MapPin: ['envios'], MapPinLine: ['envios'], MapTrifold: ['envios'], NavigationArrow: ['envios', 'navegacion'], Signpost: ['envios'], Clock: ['envios'],
  CalendarDots: ['envios'], CalendarBlank: ['envios'], CalendarCheck: ['envios'], CalendarPlus: ['envios'], Alarm: ['envios'], Package: ['envios', 'comercio'],
  Cube: ['comercio', 'envios'], Heart: ['comercio'], HeartStraight: ['comercio'], Star: ['comercio'], Sparkle: ['comercio', 'belleza'], BookmarkSimple: ['comercio'],
  Bookmark: ['comercio'], Crown: ['comercio'], Lightning: ['comercio'], Medal: ['comercio'], Trophy: ['comercio'], ChefHat: ['comida'], Carrot: ['comida'],
  OrangeSlice: ['comida'], BowlFood: ['comida'], Plant: ['hogar'], Flower: ['hogar', 'belleza'], Key: ['hogar'], Wrench: ['hogar'], Hammer: ['hogar'],
  TShirt: ['moda'], Dress: ['moda'], Pants: ['moda'], Sneaker: ['moda'], Boot: ['moda'], HighHeel: ['moda'], Eyeglasses: ['moda'], Sunglasses: ['moda'],
  Watch: ['moda'], Diamond: ['moda', 'belleza'], Backpack: ['moda'], Handbag: ['moda', 'comercio'], Tote: ['moda', 'comercio'], Drop: ['belleza'],
  Scissors: ['belleza'], Butterfly: ['belleza'], FlowerLotus: ['belleza'], Smiley: ['belleza'], PawPrint: ['mascotas'], Dog: ['mascotas'], Cat: ['mascotas'],
  Bone: ['mascotas'], Fish: ['mascotas'], Bird: ['mascotas'], Horse: ['mascotas'], Baseball: ['moda'],
}

const palabras = (pascal) => pascal.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2').toLowerCase().split(' ')

function etiquetaDe(i) {
  const propia = C.nombreEspanol(i.pascal_name)
  if (propia) return propia
  const p = palabras(i.pascal_name)
  const traducidas = p.map((w) => ES[w])
  if (traducidas.every(Boolean)) {
    const t = traducidas.join(' ')
    return t.charAt(0).toUpperCase() + t.slice(1)
  }
  const ingles = p.join(' ')
  return ingles.charAt(0).toUpperCase() + ingles.slice(1)
}

function categoriasDe(i) {
  const cats = new Set(FORZADAS[i.pascal_name] ?? [])
  for (const c of i.categories) if (POR_CATEGORIA_PHOSPHOR[c]) cats.add(POR_CATEGORIA_PHOSPHOR[c])
  const tags = new Set([...i.tags.map((t) => String(t).toLowerCase()), ...palabras(i.pascal_name)])
  for (const [cat, lista] of Object.entries(POR_ETIQUETA)) if (lista.some((w) => tags.has(w))) cats.add(cat)
  return C.CATEGORIAS_ICONOS.filter((c) => cats.has(c)).map((c) => C.LETRA_CATEGORIA[c]).join('')
}

function busquedaDe(i, etiqueta) {
  const extra = C.NOMBRES_ES[i.pascal_name]?.split('|')[1] ?? ''
  const ingles = [...palabras(i.pascal_name), ...i.tags.filter((t) => !String(t).startsWith('*')).map(String)]
  const espanol = ingles.map((w) => ES[w.toLowerCase()]).filter(Boolean)
  const todo = C.normalizarBusqueda([etiqueta, extra, ...espanol, ...ingles].join(' '))
  return Array.from(new Set(todo.split(' '))).join(' ')
}

const curados = Object.keys(C.NOMBRES_ES)
const orden = [...icons].sort((a, b) => {
  const ia = curados.indexOf(a.pascal_name)
  const ib = curados.indexOf(b.pascal_name)
  if (ia >= 0 || ib >= 0) return (ia < 0 ? 1e6 : ia) - (ib < 0 ? 1e6 : ib)
  return a.pascal_name.localeCompare(b.pascal_name)
})

const filas = orden.map((i) => {
  const etiqueta = etiquetaDe(i)
  return [i.pascal_name, categoriasDe(i), etiqueta, busquedaDe(i, etiqueta)]
})

const salida = `/**
 * GENERADO por scripts/generar-catalogo-phosphor.mjs a partir de @phosphor-icons/core ${version}
 * (${filas.length} íconos). No editar a mano: cambia catalogoIconos.ts o el script y vuelve a generar.
 *
 * Cada fila: [nombre estable (PascalCase de Phosphor), letras de categoría (LETRA_CATEGORIA),
 * etiqueta en español, texto de búsqueda normalizado]. Solo lo carga el selector de íconos del
 * editor (import dinámico): no viaja a la tienda.
 */
export type FilaCatalogoPhosphor = readonly [nombre: string, categorias: string, etiqueta: string, busqueda: string];

export const VERSION_PHOSPHOR = '${version}';

export const CATALOGO_PHOSPHOR: readonly FilaCatalogoPhosphor[] = [
${filas.map((f) => `  ${JSON.stringify(f)},`).join('\n')}
];
`
const destino = join(ROOT, 'src/lib/website/v2/catalogoPhosphor.generado.ts')
writeFileSync(destino, salida, 'utf8')
const conteo = Object.fromEntries(C.CATEGORIAS_ICONOS.map((c) => [c, filas.filter((f) => f[1].includes(C.LETRA_CATEGORIA[c])).length]))
console.log(`✓ ${filas.length} íconos → ${destino}`)
console.log(conteo)
