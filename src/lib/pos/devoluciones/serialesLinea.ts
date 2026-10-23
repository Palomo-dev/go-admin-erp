/**
 * Seriales de una línea de venta y validación de la pantalla de devolución.
 * Sin React ni Supabase: la pantalla y el servicio lo usan, y el test fija
 * el caso en que `sale_items.serial_ids` llega vacío o el id del producto
 * no coincide por tipo.
 */

export type DisposicionSerial = 'in_stock' | 'damaged';

export interface SerialDeLinea {
  id: number;
  serial: string;
  status: string;
  product_id: number;
  sale_id: string | null;
}

export function mismoId(a: unknown, b: unknown): boolean {
  const na = Number(a);
  const nb = Number(b);
  return Number.isFinite(na) && Number.isFinite(nb) && na === nb;
}

/** `integer[]` de Postgres, o un id suelto. Ignora lo que no sea un id. */
export function idsSerialesLinea(serialIds: unknown): number[] {
  if (Array.isArray(serialIds)) {
    return serialIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
  }
  return [];
}

/**
 * Seriales que se pueden devolver de la línea. Ganan `sale_items.serial_ids`.
 * Si la línea no los guardó, se usan los vendidos de esa venta y ese producto.
 * Solo entran los que siguen `sold`: uno ya devuelto o reembolsado no se ofrece.
 */
export function serialesVendidosDeLinea(args: {
  serialIds: unknown;
  productId: unknown;
  saleId: string;
  vendidos: readonly SerialDeLinea[];
}): SerialDeLinea[] {
  const vendidos = args.vendidos.filter((s) => s.status === 'sold');
  const ids = idsSerialesLinea(args.serialIds);
  if (ids.length > 0) {
    const porId = new Map(vendidos.map((s) => [s.id, s]));
    return ids
      .map((id) => porId.get(id))
      .filter((s): s is SerialDeLinea => !!s && mismoId(s.product_id, args.productId));
  }
  return vendidos.filter(
    (s) => mismoId(s.product_id, args.productId) && String(s.sale_id ?? '') === String(args.saleId),
  );
}

/**
 * Seriales que se muestran en el detalle de la venta, vendidos o ya devueltos.
 * Misma prioridad: los de la línea, y si no hay, los de la venta y el producto.
 */
export function serialesVisiblesDeLinea(args: {
  serialIds: unknown;
  productId: unknown;
  saleId: string;
  catalogo: readonly { id: number; codigo: string; product_id: number; sale_id: string | null }[];
}): { id: number; codigo: string }[] {
  const ids = idsSerialesLinea(args.serialIds);
  if (ids.length > 0) {
    const porId = new Map(args.catalogo.map((s) => [s.id, s]));
    return ids
      .map((id) => porId.get(id))
      .filter((s): s is (typeof args.catalogo)[number] => !!s && mismoId(s.product_id, args.productId))
      .map((s) => ({ id: s.id, codigo: s.codigo }));
  }
  return args.catalogo
    .filter((s) => mismoId(s.product_id, args.productId) && String(s.sale_id ?? '') === String(args.saleId))
    .map((s) => ({ id: s.id, codigo: s.codigo }));
}

/** Radio por serial: vuelve a stock si el motivo repone; si no, queda dañado. */
export function disposicionPorDefecto(motivoRepone: boolean): DisposicionSerial {
  return motivoRepone ? 'in_stock' : 'damaged';
}

/**
 * Lo que la pantalla manda de una línea. El serializado lleva la disposición
 * de cada serial (el defecto si el cajero no la tocó). El que no lleva serial
 * —incluido el de peso— manda `restock`: en peso el defecto es no; en el resto
 * la casilla arranca con el motivo.
 */
export function camposEnvioLinea(linea: {
  track_serial: boolean;
  selected_serial_ids: readonly number[];
  serial_dispositions: Readonly<Record<string, DisposicionSerial | undefined>>;
  afectaInventario: boolean;
  restock: boolean;
}): {
  serial_number_ids?: number[];
  serial_dispositions?: Record<string, DisposicionSerial>;
  restock?: boolean;
} {
  if (linea.track_serial) {
    const defecto = disposicionPorDefecto(linea.afectaInventario);
    const disposiciones: Record<string, DisposicionSerial> = {};
    for (const id of linea.selected_serial_ids) {
      const actual = linea.serial_dispositions[String(id)];
      disposiciones[String(id)] = actual === 'in_stock' || actual === 'damaged' ? actual : defecto;
    }
    return {
      serial_number_ids: [...linea.selected_serial_ids],
      serial_dispositions: disposiciones,
    };
  }
  return { restock: linea.restock };
}

export type ClaveErrorPantalla =
  | 'sinItems'
  | 'sinMotivoGeneral'
  | 'itemsSinMotivo'
  | 'serializadosSinSerial'
  | 'serialesNoCoinciden'
  | 'sinSerialesEnLinea';

export interface LineaValidable {
  id: string;
  selected: boolean;
  return_quantity: number;
  reason: string;
  track_serial: boolean;
  serialesDisponibles: number;
  serialesElegidos: number;
}

/**
 * Errores de la pantalla, para pintarlos en la línea. No sustituye a la RPC:
 * el servidor vuelve a rechazar un serial que ya no está vendido.
 */
export function erroresDevolucionPantalla(args: {
  motivoGeneral: string;
  lineas: readonly LineaValidable[];
}): { generales: ClaveErrorPantalla[]; porLinea: Record<string, ClaveErrorPantalla> } {
  const generales: ClaveErrorPantalla[] = [];
  const porLinea: Record<string, ClaveErrorPantalla> = {};
  const elegidas = args.lineas.filter((l) => l.selected);
  const conCantidad = elegidas.filter((l) => l.return_quantity > 0);
  const sinSeriales = elegidas.filter((l) => l.track_serial && l.serialesDisponibles === 0);

  if (elegidas.length === 0) generales.push('sinItems');
  else if (conCantidad.length === 0) generales.push(sinSeriales.length > 0 ? 'sinSerialesEnLinea' : 'sinItems');

  if (!args.motivoGeneral.trim()) generales.push('sinMotivoGeneral');
  if (conCantidad.some((l) => !l.reason.trim())) generales.push('itemsSinMotivo');
  if (conCantidad.some((l) => l.track_serial && l.serialesElegidos === 0)) generales.push('serializadosSinSerial');
  if (conCantidad.some((l) => l.track_serial && l.serialesElegidos > 0 && l.serialesElegidos !== l.return_quantity)) {
    generales.push('serialesNoCoinciden');
  }
  if (sinSeriales.length > 0 && !generales.includes('sinSerialesEnLinea')) generales.push('sinSerialesEnLinea');

  for (const linea of elegidas) {
    if (linea.track_serial && linea.serialesDisponibles === 0) porLinea[linea.id] = 'sinSerialesEnLinea';
    else if (linea.track_serial && linea.return_quantity > 0 && linea.serialesElegidos === 0) porLinea[linea.id] = 'serializadosSinSerial';
    else if (linea.track_serial && linea.serialesElegidos > 0 && linea.serialesElegidos !== linea.return_quantity) {
      porLinea[linea.id] = 'serialesNoCoinciden';
    } else if (linea.return_quantity > 0 && !linea.reason.trim()) porLinea[linea.id] = 'itemsSinMotivo';
  }
  return { generales, porLinea };
}
