'use client';

/**
 * Listas de precios en cotizaciones y facturas manuales (Figma «05 POS y ventas» 08, 3023:201005).
 *
 * Con cliente, cada línea de producto toma el precio de SU lista (`resolve_customer_prices`, canal
 * `documents`) y el precio normal queda para tacharlo. Reglas de la lámina:
 *   - Si cambias de cliente o eliges «Precio normal», los precios se recalculan; los escritos a mano
 *     se respetan («A mano»).
 *   - Un documento guardado conserva sus precios al abrirlo: solo se recalcula lo que cambia
 *     (cliente, cantidad que cruza un escalón, línea nueva).
 *   - En la factura el unitario ES el de la lista (a la DIAN va ese); la promoción sale aparte como
 *     descuento de la línea.
 * El precio no se calcula aquí: se lee de la base. La marca `price_list_id` de las líneas guardadas
 * la pone el servidor (trigger) cuando el unitario coincide con la lista.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { resolverPreciosCliente } from '@/lib/services/listasPreciosService';
import { precioListaPorCantidad, type PrecioClienteFila, type PrecioListaLinea } from '@/lib/listasPrecios/precioLista';

interface LineaMinima {
  clave: string;
  product_id: number | null;
  cantidad: number;
  precio: number;
}

interface Estado {
  /** Último precio que puso la lista (o el normal). Si la línea tiene otro, se escribió a mano. */
  auto: number;
  /** Cliente · normal · cantidad con que se calculó: solo se recalcula si cambia. */
  contexto: string;
}

export interface InfoLineaLista {
  lista: PrecioListaLinea | null;
  normal: number | null;
  aMano: boolean;
}

export function useListaPreciosDocumento<L extends LineaMinima>({
  clienteId,
  sucursal,
  lineas,
  setLineas,
  listo,
}: {
  clienteId: string | null;
  sucursal: number | null;
  lineas: readonly L[];
  setLineas: (f: (prev: L[]) => L[]) => void;
  /** El documento terminó de cargar (las líneas que hay ahora son las guardadas). */
  listo: boolean;
}) {
  const [usarNormal, setUsarNormal] = useState(false);
  const [filas, setFilas] = useState<Map<number, PrecioClienteFila>>(new Map());
  const cacheDe = useRef<string>('');
  const estados = useRef<Map<string, Estado>>(new Map());
  const iniciales = useRef<Set<string> | null>(null);

  // Las líneas que ya estaban al terminar de cargar conservan su precio.
  if (listo && iniciales.current === null) iniciales.current = new Set(lineas.map((l) => l.clave));

  const ids = useMemo(
    () => Array.from(new Set(lineas.map((l) => l.product_id).filter((x): x is number => !!x && x > 0))).sort((a, b) => a - b),
    [lineas],
  );
  const claveIds = ids.join(',');

  useEffect(() => {
    const clave = `${clienteId ?? ''}|${sucursal ?? ''}`;
    if (cacheDe.current !== clave) {
      cacheDe.current = clave;
      setFilas(new Map());
    }
    // Sin cliente también: el precio normal hace falta para devolverlo al quitar el cliente.
    if (ids.length === 0) return;
    let vivo = true;
    resolverPreciosCliente({ organizationId: getOrganizationId(), customerId: clienteId, productIds: ids, canal: 'documents', branchId: sucursal })
      .then((r) => {
        if (!vivo || cacheDe.current !== clave) return;
        setFilas(new Map(r.map((f) => [f.product_id, f])));
      })
      .catch(() => vivo && setFilas(new Map()));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, sucursal, claveIds]);

  // Aplica la lista a las líneas que no se escribieron a mano.
  useEffect(() => {
    if (!listo) return;
    const cambios = new Map<string, number>();
    for (const l of lineas) {
      if (!l.product_id) continue;
      const fila = filas.get(l.product_id);
      if (!fila) continue; // aún no llega el precio
      const lista = clienteId && !usarNormal ? precioListaPorCantidad(fila, l.cantidad) : null;
      const contexto = `${clienteId ?? ''}|${usarNormal}|${lista ? `${lista.precio}` : 'n'}`;
      const previo = estados.current.get(l.clave);
      if (!previo) {
        if (iniciales.current?.has(l.clave)) {
          estados.current.set(l.clave, { auto: l.precio, contexto });
          continue;
        }
      } else if (l.precio !== previo.auto || previo.contexto === contexto) {
        continue; // escrita a mano, o nada cambió
      }
      const objetivo = lista ? lista.precio : (fila?.normal_price ?? previo?.auto ?? l.precio);
      estados.current.set(l.clave, { auto: objetivo, contexto });
      if (objetivo !== l.precio) cambios.set(l.clave, objetivo);
    }
    if (cambios.size > 0) setLineas((prev) => prev.map((l) => (cambios.has(l.clave) ? { ...l, precio: cambios.get(l.clave) as number } : l)));
  }, [lineas, filas, clienteId, usarNormal, listo, setLineas]);

  const info = (l: LineaMinima): InfoLineaLista => {
    const fila = l.product_id ? filas.get(l.product_id) : undefined;
    const lista = clienteId && !usarNormal ? precioListaPorCantidad(fila, l.cantidad) : null;
    const previo = estados.current.get(l.clave);
    const aMano = !!previo && l.precio !== previo.auto;
    return { lista: lista && !aMano && Math.abs(lista.precio - l.precio) < 0.005 ? lista : null, normal: fila?.normal_price ?? null, aMano };
  };

  const listaNombre = Array.from(filas.values()).find((f) => f.price_list_name)?.price_list_name ?? null;
  const listaId = Array.from(filas.values()).find((f) => f.price_list_id)?.price_list_id ?? null;

  return { info, listaNombre, listaId, usarNormal, setUsarNormal };
}
