'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { CampoNumero, SearchInput, clasesBoton } from '@/components/kit';
import { supabase } from '@/lib/supabase/config';

export interface LineaSeleccionada {
  product_id: number;
  nombre: string;
  quantity: number;
  /** Solo al reconstruir: precio que se cobró. null = el vigente. */
  unit_price?: number | null;
}

interface Props {
  organizationId: number;
  lineas: LineaSeleccionada[];
  onCambiar: (lineas: LineaSeleccionada[]) => void;
  /** Reconstruir: se puede escribir el precio cobrado de cada línea. */
  conPrecio?: boolean;
}

/**
 * Buscador de productos de la organización (la RLS del usuario filtra) y lista con cantidades,
 * igual que «Cambiar productos» del pedido. El precio lo pone el servidor; al reconstruir se puede
 * escribir el que se cobró.
 */
export function SelectorProductosPedido({ organizationId, lineas, onCambiar, conPrecio = false }: Props) {
  const t = useTranslations('pedidosManuales.productos');
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<Array<{ id: number; name: string; sku: string | null }>>([]);

  useEffect(() => {
    const q = busqueda.trim();
    if (q.length < 2) {
      setResultados([]);
      return;
    }
    let vivo = true;
    const limpio = q.replace(/[%,()]/g, ' ');
    void supabase
      .from('products')
      .select('id, name, sku')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .or(`name.ilike.%${limpio}%,sku.ilike.%${limpio}%`)
      .limit(8)
      .then(({ data }) => vivo && setResultados((data as Array<{ id: number; name: string; sku: string | null }>) ?? []));
    return () => {
      vivo = false;
    };
  }, [busqueda, organizationId]);

  const cambiar = (pid: number, cambio: Partial<LineaSeleccionada>) => onCambiar(lineas.map((l) => (l.product_id === pid ? { ...l, ...cambio } : l)));
  const cantidad = (pid: number, qty: number | null) => cambiar(pid, { quantity: Math.max(1, Math.min(999, Math.round(qty ?? 1))) });
  const agregar = (p: { id: number; name: string }) => {
    onCambiar(lineas.some((l) => l.product_id === p.id) ? lineas.map((l) => (l.product_id === p.id ? { ...l, quantity: l.quantity + 1 } : l)) : [...lineas, { product_id: p.id, nombre: p.name, quantity: 1 }]);
    setBusqueda('');
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <SearchInput value={busqueda} onChange={setBusqueda} placeholder={t('buscar')} atajo={false} />
        {resultados.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
            {resultados.map((p) => (
              <li key={p.id}>
                <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-subtle" onClick={() => agregar(p)}>
                  <span className="text-fg">{p.name}</span>
                  <span className="text-xs text-fg-secondary">{p.sku}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {lineas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-sm text-fg-secondary">{t('vacio')}</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {lineas.map((l) => (
            <li key={l.product_id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <p className="min-w-0 flex-1 truncate text-sm text-fg">{l.nombre}</p>
              {conPrecio && (
                <div className="w-32" title={t('precioCobrado')}>
                  <CampoNumero
                    valor={l.unit_price ?? null}
                    onValorChange={(v) => cambiar(l.product_id, { unit_price: v })}
                    minimo={0}
                    decimales={0}
                    alinear="derecha"
                    tamano="sm"
                    placeholder={t('precioVigente')}
                    aria-label={t('precioCobrado')}
                  />
                </div>
              )}
              <button type="button" aria-label={t('menos')} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => cantidad(l.product_id, l.quantity - 1)}>
                <Minus className="size-4" aria-hidden="true" />
              </button>
              <div className="w-16">
                <CampoNumero valor={l.quantity} onValorChange={(v) => cantidad(l.product_id, v)} minimo={1} maximo={999} decimales={0} alinear="derecha" tamano="sm" aria-label={t('cantidad')} />
              </div>
              <button type="button" aria-label={t('mas')} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => cantidad(l.product_id, l.quantity + 1)}>
                <Plus className="size-4" aria-hidden="true" />
              </button>
              <button type="button" aria-label={t('quitar')} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => onCambiar(lineas.filter((x) => x.product_id !== l.product_id))}>
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
