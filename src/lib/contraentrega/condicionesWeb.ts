/**
 * Diálogo «Pago contra entrega» de Sitio web › Ventas en línea (Figma «05 POS y ventas» 01–03,
 * aprobado 2026-11-24). Puro: resumen en una línea, resumen de reglas, validación del formulario
 * y el ejemplo de «Así lo ve tu cliente». La regla de negocio vive en `reglaContraentrega.ts`
 * (copia byte a byte en la tienda); aquí solo se presenta y se valida lo que el dueño guarda.
 *
 * Los textos salen como claves (`contraentregaCondiciones.*`) con sus valores: quien pinta traduce.
 */
import {
  CONDICIONES_POR_DEFECTO,
  MAX_TEXTO_CLIENTE,
  evaluarContraentrega,
  montoAnticipo,
  normalizarCondiciones,
  type CondicionesContraentrega,
  type ResultadoContraentrega,
} from './reglaContraentrega';

/** Una pieza de texto traducible: clave dentro de `contraentregaCondiciones` y sus valores. */
export interface PiezaTexto {
  clave: string;
  valores?: Record<string, string | number>;
}

/** Nombres que el resumen necesita (zonas, categorías, productos, pasarelas). */
export interface NombresCatalogo {
  zonas: Record<string, string>;
  categorias: Record<number, string>;
  productos: Record<number, string>;
  pasarelas: Record<string, string>;
}

export const NOMBRES_VACIOS: NombresCatalogo = { zonas: {}, categorias: {}, productos: {}, pasarelas: {} };

type Formato = (monto: number) => string;

/** «Licores», «Licores y 2 productos», «3 productos». */
export function piezaProductos(c: CondicionesContraentrega, nombres: NombresCatalogo): PiezaTexto | null {
  if (c.productos.modo === 'todos') return null;
  const etiquetas = [
    ...c.productos.categorias.map((id) => nombres.categorias[id]).filter((x): x is string => !!x),
    ...c.productos.productos.map((id) => nombres.productos[id]).filter((x): x is string => !!x),
  ];
  const total = c.productos.categorias.length + c.productos.productos.length;
  const primero = etiquetas[0];
  const lista: PiezaTexto = !primero
    ? { clave: 'resumen.nElementos', valores: { n: total } }
    : total > 1
      ? { clave: 'resumen.primeroYMas', valores: { primero, n: total - 1 } }
      : { clave: 'resumen.uno', valores: { primero } };
  return { clave: c.productos.modo === 'solo' ? 'resumen.soloProductos' : 'resumen.todoMenos', valores: { lista: `@${lista.clave}`, ...lista.valores } };
}

function piezaMonto(c: CondicionesContraentrega, f: Formato): PiezaTexto | null {
  if (c.montoMinimo !== null && c.montoMaximo !== null) {
    return { clave: 'resumen.montoEntre', valores: { minimo: f(c.montoMinimo), maximo: f(c.montoMaximo) } };
  }
  if (c.montoMinimo !== null) return { clave: 'resumen.montoDesde', valores: { minimo: f(c.montoMinimo) } };
  if (c.montoMaximo !== null) return { clave: 'resumen.montoHasta', valores: { maximo: f(c.montoMaximo) } };
  return null;
}

function piezaAnticipo(c: CondicionesContraentrega, f: Formato): PiezaTexto | null {
  const a = c.anticipo;
  if (a.tipo === 'envio') return { clave: 'resumen.anticipoEnvio' };
  if (a.tipo === 'porcentaje' && a.porcentaje) return { clave: 'resumen.anticipoPorcentaje', valores: { porcentaje: a.porcentaje } };
  if (a.tipo === 'fijo' && a.valorFijo) return { clave: 'resumen.anticipoFijo', valores: { valor: f(a.valorFijo) } };
  return null;
}

/** ¿Las condiciones dejan la contraentrega exactamente como hoy? */
export function sinRestricciones(c: CondicionesContraentrega): boolean {
  return (
    c.ofrecer &&
    c.montoMinimo === null &&
    c.montoMaximo === null &&
    c.zonas.modo === 'todas' &&
    c.transportadora &&
    c.productos.modo === 'todos' &&
    c.anticipo.tipo === 'ninguno' &&
    !c.soloClientesConEntregas &&
    !c.noOfrecerARechazados
  );
}

/**
 * Resumen en una línea de la fila «Pago contra entrega» (Figma 01): «Desde $ 80.000 hasta
 * $ 600.000 · 3 zonas · todo menos Licores · anticipo: el envío».
 */
export function resumenUnaLinea(c: CondicionesContraentrega, nombres: NombresCatalogo, f: Formato): PiezaTexto[] {
  if (!c.ofrecer) return [{ clave: 'resumen.apagada' }];
  if (sinRestricciones(c)) return [{ clave: 'resumen.sinCondiciones' }];
  const piezas: PiezaTexto[] = [];
  const monto = piezaMonto(c, f);
  if (monto) piezas.push(monto);
  if (c.zonas.modo === 'algunas') piezas.push({ clave: 'resumen.nZonas', valores: { n: c.zonas.ids.length } });
  if (!c.transportadora) piezas.push({ clave: 'resumen.sinTransportadora' });
  const productos = piezaProductos(c, nombres);
  if (productos) piezas.push(productos);
  const anticipo = piezaAnticipo(c, f);
  if (anticipo) piezas.push(anticipo);
  if (c.soloClientesConEntregas) piezas.push({ clave: 'resumen.soloConEntregas' });
  if (c.noOfrecerARechazados) piezas.push({ clave: 'resumen.sinRechazos' });
  return piezas;
}

/** «Resumen de las reglas» (columna derecha del diálogo): una pieza por línea. */
export function resumenReglas(c: CondicionesContraentrega, nombres: NombresCatalogo, f: Formato): PiezaTexto[] {
  if (!c.ofrecer) return [{ clave: 'reglas.apagada' }];
  const lineas: PiezaTexto[] = [];
  const monto = piezaMonto(c, f);
  lineas.push(monto ? { ...monto, clave: monto.clave.replace('resumen.', 'reglas.') } : { clave: 'reglas.cualquierMonto' });
  if (c.zonas.modo === 'algunas') {
    const zonas = c.zonas.ids.map((id) => nombres.zonas[id]).filter((x): x is string => !!x);
    lineas.push(zonas.length > 0 ? { clave: 'reglas.zonas', valores: { zonas: zonas.join(', ') } } : { clave: 'reglas.nZonas', valores: { n: c.zonas.ids.length } });
  } else {
    lineas.push({ clave: 'reglas.todasLasZonas' });
  }
  lineas.push({ clave: c.transportadora ? 'reglas.conTransportadora' : 'reglas.sinTransportadora' });
  const productos = piezaProductos(c, nombres);
  lineas.push(productos ?? { clave: 'reglas.todosLosProductos' });
  const anticipo = piezaAnticipo(c, f);
  if (anticipo) {
    const pasarela = c.anticipo.pasarela ? nombres.pasarelas[c.anticipo.pasarela] ?? c.anticipo.pasarela : null;
    lineas.push({
      clave: pasarela ? 'reglas.anticipoCon' : 'reglas.anticipoCualquiera',
      valores: { anticipo: `@${anticipo.clave.replace('resumen.anticipo', 'reglas.base')}`, ...(anticipo.valores ?? {}), pasarela: pasarela ?? '', minutos: c.anticipo.plazoMinutos },
    });
  } else {
    lineas.push({ clave: 'reglas.sinAnticipo' });
  }
  if (c.soloClientesConEntregas) lineas.push({ clave: 'reglas.soloConEntregas' });
  if (c.noOfrecerARechazados) lineas.push({ clave: 'reglas.sinRechazos' });
  return lineas;
}

// ─── Validación ──────────────────────────────────────────────────────────────────────────────

export type ErrorCondiciones =
  | 'monto_rango'
  | 'zonas_vacias'
  | 'productos_vacios'
  | 'medios_vacios'
  | 'porcentaje_invalido'
  | 'valor_fijo_invalido'
  | 'valor_envio_gratis_invalido'
  | 'texto_largo';

export function erroresCondiciones(c: CondicionesContraentrega): ErrorCondiciones[] {
  const e: ErrorCondiciones[] = [];
  if (c.montoMinimo !== null && c.montoMaximo !== null && c.montoMinimo > c.montoMaximo) e.push('monto_rango');
  if (c.zonas.modo === 'algunas' && c.zonas.ids.length === 0) e.push('zonas_vacias');
  if (c.productos.modo !== 'todos' && c.productos.categorias.length + c.productos.productos.length === 0) e.push('productos_vacios');
  if (c.medios.length === 0) e.push('medios_vacios');
  // 1–100 (decisión del dueño): 0,5 % no es un anticipo que confirme nada.
  if (c.anticipo.tipo === 'porcentaje' && !(c.anticipo.porcentaje && c.anticipo.porcentaje >= 1 && c.anticipo.porcentaje <= 100)) e.push('porcentaje_invalido');
  if (c.anticipo.tipo === 'fijo' && !(c.anticipo.valorFijo && c.anticipo.valorFijo > 0)) e.push('valor_fijo_invalido');
  if (c.anticipo.tipo === 'envio' && c.anticipo.siEnvioGratis === 'valor_fijo' && !(c.anticipo.valorEnvioGratis && c.anticipo.valorEnvioGratis > 0)) {
    e.push('valor_envio_gratis_invalido');
  }
  if ((c.texto ?? '').length > MAX_TEXTO_CLIENTE) e.push('texto_largo');
  return e;
}

/**
 * Cuerpo del PUT: `{ branchId, condiciones }` (`condiciones: null` quita las de la sede = como
 * hoy). Lista blanca: cualquier otra clave → inválido. La organización NO viaja aquí.
 */
export function leerCuerpoCondiciones(
  crudo: unknown,
): { ok: true; branchId: number; condiciones: CondicionesContraentrega | null } | { ok: false; campos: string[] } {
  if (typeof crudo !== 'object' || crudo === null || Array.isArray(crudo)) return { ok: false, campos: ['cuerpo'] };
  const obj = crudo as Record<string, unknown>;
  const ajenas = Object.keys(obj).filter((k) => k !== 'branchId' && k !== 'condiciones');
  if (ajenas.length > 0) return { ok: false, campos: ajenas };
  const branchId = Number(obj.branchId);
  if (!Number.isInteger(branchId) || branchId <= 0) return { ok: false, campos: ['branchId'] };
  if (obj.condiciones === null) return { ok: true, branchId, condiciones: null };
  if (typeof obj.condiciones !== 'object' || Array.isArray(obj.condiciones)) return { ok: false, campos: ['condiciones'] };
  const condiciones = normalizarCondiciones(obj.condiciones);
  const errores = erroresCondiciones(condiciones);
  if (errores.length > 0) return { ok: false, campos: errores };
  return { ok: true, branchId, condiciones };
}

/** Quita de las condiciones las zonas, categorías y productos que no son de la organización. */
export function soloDeLaOrganizacion(
  c: CondicionesContraentrega,
  validos: { zonas: ReadonlySet<string>; categorias: ReadonlySet<number>; productos: ReadonlySet<number> },
): CondicionesContraentrega {
  return {
    ...c,
    zonas: c.zonas.modo === 'algunas' ? { modo: 'algunas', ids: c.zonas.ids.filter((id) => validos.zonas.has(id)) } : c.zonas,
    productos: {
      ...c.productos,
      categorias: c.productos.categorias.filter((id) => validos.categorias.has(id)),
      productos: c.productos.productos.filter((id) => validos.productos.has(id)),
    },
  };
}

// ─── «Así lo ve tu cliente» ──────────────────────────────────────────────────────────────────

/** Pedido de ejemplo del Figma: WO-000415 = productos $ 142.000 + envío $ 9.000. */
export const EJEMPLO = { subtotal: 142000, envio: 9000 } as const;

export interface VistaPrevia {
  /** La opción disponible con el pedido de ejemplo (ajustado al mínimo y al máximo). */
  ejemplo: ResultadoContraentrega & { subtotal: number; envio: number; total: number };
  /** Cómo se ve apagada, motivo por motivo (solo los que aplican a estas condiciones). */
  motivos: PiezaTexto[];
  /** Con «el envío» y envío gratis: el anticipo que quedaría (`null` = no se pide). */
  anticipoEnvioGratis: number | null;
}

export function vistaPrevia(
  condiciones: CondicionesContraentrega,
  pasarelasActivas: string[],
  nombres: NombresCatalogo,
  f: Formato,
): VistaPrevia {
  const c = condiciones;
  let subtotal: number = EJEMPLO.subtotal;
  if (c.montoMinimo !== null && subtotal < c.montoMinimo) subtotal = c.montoMinimo;
  if (c.montoMaximo !== null && subtotal > c.montoMaximo) subtotal = c.montoMaximo;
  const envio = EJEMPLO.envio;
  const total = subtotal + envio;
  const zonaId = c.zonas.modo === 'algunas' ? c.zonas.ids[0] ?? null : null;
  const r = evaluarContraentrega({
    condiciones: { ...c, ofrecer: true, soloClientesConEntregas: false, noOfrecerARechazados: false },
    tipoEntrega: 'delivery_own',
    subtotalProductos: subtotal,
    envio,
    total,
    zonaId,
    lineas: [],
    cliente: null,
    pasarelasActivas,
  });
  const motivos: PiezaTexto[] = [];
  if (c.montoMinimo !== null && c.montoMinimo > 0) {
    const faltan = Math.min(12000, c.montoMinimo);
    motivos.push({ clave: 'cliente.motivoMinimo', valores: { minimo: f(c.montoMinimo), faltan: f(faltan) } });
  }
  if (c.montoMaximo !== null) motivos.push({ clave: 'cliente.motivoMaximo', valores: { maximo: f(c.montoMaximo) } });
  if (c.productos.modo !== 'todos') motivos.push({ clave: 'cliente.motivoProductos', valores: { n: 2 } });
  if (c.zonas.modo === 'algunas') {
    const zonas = c.zonas.ids.map((id) => nombres.zonas[id]).filter((x): x is string => !!x);
    motivos.push({ clave: 'cliente.motivoZona', valores: { zonas: zonas.join(', ') || '—' } });
  }
  if (!c.transportadora) motivos.push({ clave: 'cliente.motivoTransportadora' });
  if (c.soloClientesConEntregas) motivos.push({ clave: 'cliente.motivoPrimeraCompra' });
  if (c.noOfrecerARechazados) motivos.push({ clave: 'cliente.motivoRechazo' });
  const gratis = c.anticipo.tipo === 'envio' ? montoAnticipo(c, 0, total) : null;
  return { ejemplo: { ...r, subtotal, envio, total }, motivos, anticipoEnvioGratis: gratis?.monto ?? null };
}

/** Condiciones de partida del formulario: las guardadas de la sede o el defecto (= como hoy). */
export function condicionesIniciales(guardadas: CondicionesContraentrega | null): CondicionesContraentrega {
  return soloDevolverAnticipo(normalizarCondiciones(guardadas ?? CONDICIONES_POR_DEFECTO));
}

/**
 * Criterio del Contador (2026-11-25): si el cliente no recibe el pedido, el anticipo SOLO se
 * devuelve. «La tienda se lo queda» (`retener`) está apagado: no hay concepto DIAN para llevar el
 * anticipo a 4255 sin IVA y hay riesgo de consumidor (retracto, art. 47 Ley 1480 de 2011; queja
 * ante la SIC). Si una tienda lo necesita algún día: primero Legal y después el Contador.
 * `reglaContraentrega.ts` (copia byte a byte en la tienda) conserva el tipo para leer lo guardado;
 * el ERP nunca lo ofrece ni lo guarda.
 */
export function soloDevolverAnticipo(c: CondicionesContraentrega): CondicionesContraentrega {
  return c.siNoRecibe === 'devolver' ? c : { ...c, siNoRecibe: 'devolver' };
}
