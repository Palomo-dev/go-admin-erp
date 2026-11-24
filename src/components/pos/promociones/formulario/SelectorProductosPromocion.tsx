'use client';

import { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { PromotionsService } from '../promotionsService';

/** Fila de `PromotionsService.getProducts`. */
export interface ProductoPromocion {
  id: number;
  name: string;
  sku: string | null;
  parent_name?: string | null;
  variant_data?: Record<string, unknown> | null;
}

export function etiquetaProducto(p: ProductoPromocion): string {
  const variante = p.variant_data
    ? Object.entries(p.variant_data)
        .filter(([, v]) => v && String(v).trim() !== '')
        .map(([k, v]) => `${k}: ${v}`)
        .join(' · ')
    : '';
  return p.parent_name && variante ? `${p.parent_name} · ${variante}` : p.name;
}

interface Props {
  seleccionados: readonly number[];
  onCambio: (ids: number[]) => void;
  /** Se llama con cada producto que se carga, para que quien usa guarde su nombre. */
  onConocer?: (productos: ProductoPromocion[]) => void;
  placeholder: string;
  textoVacio: string;
  /** Contenido extra a la derecha de un producto marcado (unidades del combo, grupo). */
  extra?: (id: number) => React.ReactNode;
}

/** Buscador de productos con variantes agrupadas por su padre (mismo patrón del asistente anterior). */
export function SelectorProductosPromocion({ seleccionados, onCambio, onConocer, placeholder, textoVacio, extra }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [productos, setProductos] = useState<ProductoPromocion[]>([]);

  useEffect(() => {
    let vivo = true;
    const timer = setTimeout(() => {
      PromotionsService.getProducts(busqueda.trim() || undefined)
        .then((data: ProductoPromocion[]) => {
          if (!vivo) return;
          setProductos(data);
          onConocer?.(data);
        })
        .catch(() => {
          if (vivo) setProductos([]);
        });
    }, 200);
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
    // onConocer es estable para quien lo usa; no recargar por él.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda]);

  const grupos = Object.entries(
    productos.reduce((acc: Record<string, ProductoPromocion[]>, p) => {
      const clave = p.parent_name || p.name;
      (acc[clave] ??= []).push(p);
      return acc;
    }, {}),
  );
  const alternar = (id: number) =>
    onCambio(seleccionados.includes(id) ? seleccionados.filter((x) => x !== id) : [...seleccionados, id]);

  return (
    <div className="flex flex-col gap-2">
      <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      <div className="max-h-60 overflow-y-auto rounded-lg border border-line p-2">
        {grupos.length === 0 ? (
          <div className="p-4 text-center text-fg-secondary">
            <Package className="mx-auto mb-2 h-6 w-6 opacity-50" aria-hidden="true" />
            <p className="text-sm">{textoVacio}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {grupos.map(([nombre, lista]) => {
              const conVariantes = lista.length > 1 || !!lista[0].parent_name;
              return (
                <div key={nombre}>
                  {conVariantes && (
                    <div className="sticky top-0 z-10 border-b border-line bg-subtle px-3 py-1.5">
                      <span className="text-xs font-semibold text-fg-secondary">{nombre}</span>
                    </div>
                  )}
                  {lista.map((p) => {
                    const marcado = seleccionados.includes(p.id);
                    return (
                      <div key={p.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-hover">
                        <Checkbox checked={marcado} onCheckedChange={() => alternar(p.id)} aria-label={etiquetaProducto(p)} />
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => alternar(p.id)}>
                          <span className="block whitespace-normal break-words text-fg">{conVariantes ? etiquetaProducto(p) : p.name}</span>
                          {p.sku && <span className="font-mono text-xs text-brand-deep">{p.sku}</span>}
                        </button>
                        {marcado && extra?.(p.id)}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
