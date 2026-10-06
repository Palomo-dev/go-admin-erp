/**
 * Fuentes de datos del ERP que llenan las secciones del sitio web
 * (Figma «16 Sitio web › 05 Editor»: «Faltan datos», AvisoConAccion y
 * SeccionVaciaLienzo).
 *
 * Una sección como «Habitaciones» no tiene contenido propio: lo saca de una
 * tabla del ERP. Si esa tabla está vacía para la organización, la sección se
 * puede añadir igual («Faltan datos» no bloquea), pero el editor lo avisa con
 * el enlace al módulo donde se crean los datos.
 *
 * Código puro: lo usan el diálogo, el lienzo y el endpoint
 * `/api/website/fuentes-datos`, que es quien cuenta los registros (solo
 * conteos, nunca los datos).
 *
 * Solo se declaran las secciones cuya fuente el sitio público realmente carga
 * (`app/[[...slug]]/page.tsx` de goadmin-websites). Desde 2026-10-06 el sitio
 * carga también `class_schedule` (gym_classes), `routes` (transport_routes),
 * `fleet_showcase` (vehicles) y `membership_plans` (membership_plans), con los
 * mismos filtros que se cuentan aquí (lib/website/datosSecciones.ts del sitio).
 * Entrenadores (`trainers`) sigue sin precarga: no se declara.
 */

export type FuenteDatos =
  | 'tipos_habitacion'
  | 'productos'
  | 'categorias'
  | 'ofertas'
  | 'zonas_parqueo'
  | 'tarifas_parqueo'
  | 'planes_parqueo'
  | 'mesas'
  | 'sedes'
  | 'clases'
  | 'rutas'
  | 'flota'
  | 'planes_membresia';

export interface DefinicionFuente {
  /** Lo que la sección necesita, tras «necesita» («habitaciones creadas en Hotel»). */
  necesita: string;
  /** Qué falta, en una frase («aún no tiene tipos de habitación»). */
  falta: string;
  /** Módulo del ERP donde se crean los datos («Hotel»). */
  modulo: string;
  /** Ruta del ERP donde se crean. */
  href: string;
}

export const FUENTES_DATOS: Readonly<Record<FuenteDatos, DefinicionFuente>> = {
  tipos_habitacion: {
    necesita: 'habitaciones creadas en Hotel',
    falta: 'aún no tiene tipos de habitación',
    modulo: 'Hotel',
    href: '/app/pms/tipos-espacio',
  },
  productos: {
    necesita: 'productos publicados',
    falta: 'aún no tiene productos activos',
    modulo: 'Inventario',
    href: '/app/inventario/productos',
  },
  categorias: {
    necesita: 'categorías en Inventario',
    falta: 'aún no tiene categorías activas',
    modulo: 'Inventario',
    href: '/app/inventario/categorias',
  },
  ofertas: {
    necesita: 'productos con precio de oferta',
    falta: 'aún no tiene productos con precio antes y después',
    modulo: 'Inventario',
    href: '/app/inventario/productos',
  },
  zonas_parqueo: {
    necesita: 'zonas creadas en Parqueadero',
    falta: 'aún no tiene zonas de parqueo activas',
    modulo: 'Parqueadero',
    href: '/app/parking/zonas',
  },
  tarifas_parqueo: {
    necesita: 'tarifas creadas en Parqueadero',
    falta: 'aún no tiene tarifas de parqueo activas',
    modulo: 'Parqueadero',
    href: '/app/parking/tarifas',
  },
  planes_parqueo: {
    necesita: 'planes creados en Parqueadero',
    falta: 'aún no tiene planes de parqueo activos',
    modulo: 'Parqueadero',
    href: '/app/parking/planes',
  },
  mesas: {
    necesita: 'mesas creadas en el POS',
    falta: 'aún no tiene mesas para recibir reservas',
    modulo: 'Mesas',
    href: '/app/pos/mesas',
  },
  sedes: {
    necesita: 'sedes activas',
    falta: 'aún no tiene sedes activas con dirección y horario',
    modulo: 'Sedes',
    href: '/app/organizacion/sucursales',
  },
  clases: {
    necesita: 'clases programadas en Membresías',
    falta: 'aún no tiene clases activas próximas o recurrentes',
    modulo: 'Clases',
    href: '/app/membresias/clases',
  },
  rutas: {
    necesita: 'rutas creadas en Transporte',
    falta: 'aún no tiene rutas activas',
    modulo: 'Rutas',
    href: '/app/transporte/rutas',
  },
  flota: {
    necesita: 'vehículos creados en Transporte',
    falta: 'aún no tiene vehículos activos',
    modulo: 'Vehículos',
    href: '/app/transporte/vehiculos',
  },
  planes_membresia: {
    necesita: 'planes creados en Membresías',
    falta: 'aún no tiene planes de membresía activos',
    modulo: 'Planes',
    href: '/app/membresias/planes',
  },
};

export const LISTA_FUENTES = Object.keys(FUENTES_DATOS) as FuenteDatos[];

/** Fuente de la que se llena cada tipo de sección (las demás no dependen del ERP). */
export const FUENTE_DE_SECCION: Readonly<Record<string, FuenteDatos>> = {
  room_types: 'tipos_habitacion',
  products_grid: 'productos',
  featured_products: 'productos',
  menu_preview: 'productos',
  menu_full: 'productos',
  specialties: 'productos',
  signature_dishes: 'productos',
  reservation: 'mesas',
  hours_location: 'sedes',
  categories_grid: 'categorias',
  offers: 'ofertas',
  parking_zones: 'zonas_parqueo',
  parking_availability: 'zonas_parqueo',
  parking_pricing: 'tarifas_parqueo',
  parking_pass_plans: 'planes_parqueo',
  class_schedule: 'clases',
  routes: 'rutas',
  fleet_showcase: 'flota',
  membership_plans: 'planes_membresia',
};

/** Registros por fuente. Una fuente ausente = no se pudo contar (no se avisa). */
export type ConteoFuentes = Partial<Record<FuenteDatos, number>>;

export interface AvisoFaltanDatos {
  fuente: FuenteDatos;
  /** «Habitaciones necesita habitaciones creadas en Hotel». */
  titulo: string;
  /** Explicación para el diálogo («Puedes añadirla de todas formas…»). */
  detalle: string;
  /** Explicación para el lienzo del editor (SeccionVaciaLienzo). */
  detalleLienzo: string;
  accion: { texto: string; href: string };
}

/**
 * Aviso «Faltan datos» de una sección, o `null` si la sección no depende del
 * ERP, si su fuente tiene registros o si no se pudo contar.
 *
 * @param sujeto quién no tiene los datos: «Tu organización» o el nombre de la sede.
 */
export function avisoFaltanDatos(
  sectionType: string,
  etiqueta: string,
  conteos: ConteoFuentes | null | undefined,
  sujeto = 'Tu organización',
): AvisoFaltanDatos | null {
  const fuente = FUENTE_DE_SECCION[sectionType];
  if (!fuente || !conteos) return null;
  const n = conteos[fuente];
  if (typeof n !== 'number' || n > 0) return null;
  const def = FUENTES_DATOS[fuente];
  return {
    fuente,
    titulo: `${etiqueta} necesita ${def.necesita}`,
    detalle: `${sujeto} ${def.falta}. Puedes añadirla de todas formas: en el editor verás un aviso con este mismo enlace y se llena sola cuando existan los datos.`,
    detalleLienzo: `Esta sección necesita ${def.necesita}. Mientras no haya ninguno, en el editor la ves así; cuando los crees se llena sola.`,
    accion: { texto: `Ir a ${def.modulo}`, href: def.href },
  };
}

/** Normaliza la respuesta del endpoint: solo fuentes conocidas con enteros ≥ 0. */
export function conteoDesdeRespuesta(cuerpo: unknown): ConteoFuentes {
  const fuentes = (cuerpo && typeof cuerpo === 'object' ? (cuerpo as { fuentes?: unknown }).fuentes : null) ?? null;
  if (!fuentes || typeof fuentes !== 'object') return {};
  const resultado: ConteoFuentes = {};
  for (const f of LISTA_FUENTES) {
    const v = (fuentes as Record<string, unknown>)[f];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0) resultado[f] = v;
  }
  return resultado;
}
