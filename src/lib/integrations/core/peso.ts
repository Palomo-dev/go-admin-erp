/**
 * Peso de un envío para generar la guía.
 *
 * Por ítem, en este orden: el peso del producto (o el del proveedor de dropshipping), el peso por
 * defecto de su categoría y el peso por defecto de la organización. Si a algún ítem no le llega
 * ninguno, no hay peso: la guía no se genera y la UI pide completarlo (nunca se inventa 1 kg).
 */
import { ValidationError } from './errores';
import type { Paquete } from './tipos';

export interface ItemPeso {
  productoId?: number | string | null;
  nombre?: string;
  cantidad: number;
  pesoKg?: number | null;
  pesoCategoriaKg?: number | null;
}

export type FuentePeso = 'producto' | 'categoria' | 'organizacion';

export interface ResultadoPeso {
  /** Peso total en kg, o null si falta el de algún ítem. */
  pesoKg: number | null;
  faltantes: ItemPeso[];
  detalle: { item: ItemPeso; pesoUnitarioKg: number; fuente: FuentePeso }[];
}

const valido = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

export function resolverPesoEnvio(items: readonly ItemPeso[], pesoOrganizacionKg?: number | null): ResultadoPeso {
  const faltantes: ItemPeso[] = [];
  const detalle: ResultadoPeso['detalle'] = [];
  let total = 0;
  for (const item of items) {
    const cantidad = valido(item.cantidad) ? item.cantidad : 0;
    if (cantidad === 0) continue;
    const fuente: [number | null | undefined, FuentePeso][] = [
      [item.pesoKg, 'producto'],
      [item.pesoCategoriaKg, 'categoria'],
      [pesoOrganizacionKg, 'organizacion'],
    ];
    const elegido = fuente.find(([p]) => valido(p));
    if (!elegido) { faltantes.push(item); continue; }
    const unitario = elegido[0] as number;
    total += unitario * cantidad;
    detalle.push({ item, pesoUnitarioKg: unitario, fuente: elegido[1] });
  }
  return {
    pesoKg: faltantes.length > 0 || detalle.length === 0 ? null : Math.round(total * 1000) / 1000,
    faltantes,
    detalle,
  };
}

export interface DimensionesPorDefecto {
  pesoKg?: number | null;
  largoCm?: number | null;
  anchoCm?: number | null;
  altoCm?: number | null;
}

/**
 * Paquete para generar la guía. Sin peso de algún ítem lanza ValidationError: el peso es
 * obligatorio para generar una guía (nunca se manda un peso inventado a la transportadora).
 */
export function paqueteParaGuia(
  proveedor: string,
  items: readonly ItemPeso[],
  porDefecto: DimensionesPorDefecto = {},
  unidades = 1,
): Paquete {
  const r = resolverPesoEnvio(items, porDefecto.pesoKg);
  if (r.pesoKg === null) {
    const nombres = r.faltantes.map((i) => i.nombre ?? String(i.productoId ?? '')).filter(Boolean);
    throw new ValidationError(
      proveedor,
      nombres.length > 0
        ? `Falta el peso de: ${nombres.join(', ')}. Complétalo en el producto, en su categoría o en el peso por defecto de la organización.`
        : 'El envío no tiene ítems con peso. Completa el peso antes de generar la guía.',
      ['peso'],
    );
  }
  return {
    pesoKg: r.pesoKg,
    unidades: valido(unidades) ? Math.floor(unidades) : 1,
    ...(valido(porDefecto.largoCm) ? { largoCm: porDefecto.largoCm } : {}),
    ...(valido(porDefecto.anchoCm) ? { anchoCm: porDefecto.anchoCm } : {}),
    ...(valido(porDefecto.altoCm) ? { altoCm: porDefecto.altoCm } : {}),
  };
}
