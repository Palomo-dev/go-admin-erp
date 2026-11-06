/**
 * Lo que devuelve `fn_cuentas_efectivas` y lo que la pantalla decide con eso.
 * Aquí no se resuelve ninguna cuenta: la decisión es de la base, la misma que
 * usa el asiento. Este archivo solo traduce la respuesta y arma los cambios.
 */

export const ROLES_CUENTA = ['ingreso', 'costo', 'inventario', 'devolucion'] as const;
export type RolCuenta = (typeof ROLES_CUENTA)[number];

export type EstadoCuenta = 'automatica' | 'categoria' | 'propia' | 'titulo' | 'sin_cuenta';
export type OrigenCuenta = 'linea' | 'producto' | 'categoria' | 'sede' | 'empresa' | 'sector' | 'regla' | 'ninguno';
export type DocumentoCuenta = 'venta' | 'compra' | 'documento_soporte' | 'nota_credito' | 'catalogo';

export interface CuentaEfectiva {
  clave: string | null;
  rol: RolCuenta;
  cuenta: string | null;
  nombre: string | null;
  origen: OrigenCuenta;
  estado: EstadoCuenta;
  /** Clave de configuración que aplica, si hay una. */
  claveContable: string | null;
  /** Lo que se eligió. Con una cuenta de título, difiere de `cuenta`. */
  configurada: string | null;
  fallo: string | null;
  asentable: boolean;
  /** La crea el motor al confirmar: aún no está en el plan. */
  prevista: boolean;
  categoriaId: number | null;
  categoriaNombre: string | null;
  /** La categoría de la que viene, que puede ser un padre de la del producto. */
  categoriaOrigen: string | null;
}

export interface ConsultaCuenta {
  clave: string;
  rol?: RolCuenta;
  product_id?: number | null;
  category_id?: number | null;
  cuenta_contable?: string | null;
}

export interface SugerenciaCuenta {
  cuenta: string;
  nombre: string;
  veces: number;
  compras: number;
}

const ESTADOS = new Set<string>(['automatica', 'categoria', 'propia', 'titulo', 'sin_cuenta']);
const ORIGENES = new Set<string>(['linea', 'producto', 'categoria', 'sede', 'empresa', 'sector', 'regla', 'ninguno']);

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor !== '' ? valor : null;
}

/** Un estado que la pantalla no conoce no se pinta como automático: se revisa. */
export function aCuentaEfectiva(fila: Record<string, unknown>): CuentaEfectiva {
  const estado = String(fila.estado ?? '');
  const origen = String(fila.origen ?? '');
  return {
    clave: texto(fila.clave),
    rol: (texto(fila.rol) ?? 'ingreso') as RolCuenta,
    cuenta: texto(fila.cuenta),
    nombre: texto(fila.nombre),
    origen: (ORIGENES.has(origen) ? origen : 'ninguno') as OrigenCuenta,
    estado: (ESTADOS.has(estado) ? estado : 'sin_cuenta') as EstadoCuenta,
    claveContable: texto(fila.clave_contable),
    configurada: texto(fila.configurada),
    fallo: texto(fila.fallo),
    asentable: fila.asentable === true,
    prevista: fila.prevista === true,
    categoriaId: typeof fila.categoria_id === 'number' ? fila.categoria_id : null,
    categoriaNombre: texto(fila.categoria_nombre),
    categoriaOrigen: texto(fila.categoria_origen),
  };
}

/** Línea, producto o categoría: alguien la eligió. */
export function esCuentaElegida(c: Pick<CuentaEfectiva, 'origen'>): boolean {
  return c.origen === 'linea' || c.origen === 'producto' || c.origen === 'categoria';
}

export type ResumenDeCuentas =
  | { tipo: 'automatica' }
  | { tipo: 'propias'; n: number; cuentas: string[]; automaticas: number }
  | { tipo: 'revisar'; n: number; rol: RolCuenta | null };

/** La frase de `ResumenCuentas`: lo que falta manda sobre lo que está bien. */
export function resumirCuentas(cuentas: readonly CuentaEfectiva[]): ResumenDeCuentas {
  const malas = cuentas.filter((c) => c.estado === 'titulo' || c.estado === 'sin_cuenta');
  if (malas.length > 0) return { tipo: 'revisar', n: malas.length, rol: malas[0].rol };
  const propias = cuentas.filter(esCuentaElegida);
  if (propias.length === 0) return { tipo: 'automatica' };
  return {
    tipo: 'propias',
    n: propias.length,
    cuentas: propias.flatMap((c) => (c.cuenta ? [c.cuenta] : [])),
    automaticas: cuentas.length - propias.length,
  };
}

export type AlcanceCuenta = 'documento' | 'producto' | 'categoria';

export interface CambioCuentaLinea {
  /** Lo que queda escrito en la línea del documento. */
  cuentaLinea: string | null;
  /** Lo que se guarda en el catálogo, si el alcance lo pide. */
  catalogo: { tipo: 'producto' | 'categoria'; id: number; rol: RolCuenta; cuenta: string | null } | null;
}

/**
 * Qué hace «Aplicar» en el diálogo. Con alcance de catálogo la línea se limpia:
 * si no, su cuenta seguiría ganando y el cambio no tendría efecto. `cuenta` null
 * es «Volver a automática» en ese mismo alcance.
 */
export function cambioDeCuentaLinea(opciones: {
  alcance: AlcanceCuenta;
  cuenta: string | null;
  rol: RolCuenta;
  productoId: number | null;
  categoriaId: number | null;
}): CambioCuentaLinea {
  const cuenta = opciones.cuenta?.trim() || null;
  if (opciones.alcance === 'producto' && opciones.productoId != null) {
    return { cuentaLinea: null, catalogo: { tipo: 'producto', id: opciones.productoId, rol: opciones.rol, cuenta } };
  }
  if (opciones.alcance === 'categoria' && opciones.categoriaId != null) {
    return { cuentaLinea: null, catalogo: { tipo: 'categoria', id: opciones.categoriaId, rol: opciones.rol, cuenta } };
  }
  return { cuentaLinea: cuenta, catalogo: null };
}

/** Solo una línea manual sin cuenta recibe la sugerencia por proveedor. */
export function lineaAceptaSugerencia(linea: { product_id: number | null; cuenta_contable?: string | null }): boolean {
  return linea.product_id == null && !(linea.cuenta_contable ?? '').trim();
}

/** Las consultas a la base. Cambian si cambia lo que se pregunta, no el importe. */
export function firmaConsultas(consultas: readonly ConsultaCuenta[]): string {
  return JSON.stringify(consultas.map((c) => [c.clave, c.rol ?? null, c.product_id ?? null, c.category_id ?? null, c.cuenta_contable?.trim() || null]));
}
