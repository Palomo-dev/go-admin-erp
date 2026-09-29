'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Info, SlidersHorizontal } from 'lucide-react';
import { CampoNumero, Dialogo, FormField } from '@/components/kit';
import { useToast } from '@/components/ui/use-toast';
import { guardarMinimos, listarStock, type StockFila } from '@/lib/services/stockService';
import { useAlcanceSucursales, useCantidadStock, useMensajeErrorInventario } from './useInventarioB1';

/**
 * «Definir stock mínimo» (Figma 586:73911): un mínimo por sucursal a la que
 * pertenece el usuario. Cuando lo disponible baja de ese número, el producto
 * sale en «Bajo el mínimo». Un mínimo en 0 apaga el aviso. Guarda con
 * `update_product_min_stock` (permiso `ajustar` o `editar_catalogo`).
 */
export interface DialogoStockMinimoProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  organizacionId: number;
  producto: StockFila | null;
  onGuardado?: () => void;
}

export function DialogoStockMinimo(props: DialogoStockMinimoProps) {
  if (!props.abierto || !props.producto) return null;
  return <Formulario {...props} producto={props.producto} />;
}

function Formulario({ abierto, onAbiertoChange, organizacionId, producto: productoInicial, onGuardado }: DialogoStockMinimoProps & { producto: StockFila }) {
  const t = useTranslations('inventarioStock.minimo');
  const { toast } = useToast();
  const cantidad = useCantidadStock();
  const mensajeError = useMensajeErrorInventario();
  const { branches } = useAlcanceSucursales();
  const [producto, setProducto] = useState<StockFila>(productoInicial);
  const [valores, setValores] = useState<Record<number, number | null>>(() =>
    Object.fromEntries(branches.map((b) => [b.id, productoInicial.por_sucursal.find((s) => s.branch_id === b.id)?.minimo ?? 0])),
  );

  // La fila del listado puede venir filtrada por una sucursal: se leen todas las del usuario.
  useEffect(() => {
    let vivo = true;
    listarStock(organizacionId, { producto: productoInicial.product_id, agrupar: false, sucursales: branches.map((b) => b.id) }, 0, 5)
      .then((r) => {
        const fila = r.filas.find((f) => f.product_id === productoInicial.product_id);
        if (!vivo || !fila) return;
        setProducto(fila);
        setValores(Object.fromEntries(branches.map((b) => [b.id, fila.por_sucursal.find((s) => s.branch_id === b.id)?.minimo ?? 0])));
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [organizacionId, productoInicial.product_id, branches]);
  const [guardando, setGuardando] = useState(false);
  const invalido = Object.values(valores).some((v) => v !== null && v < 0);

  const guardar = async () => {
    setGuardando(true);
    try {
      const items = branches
        .map((b) => ({ product_id: producto.product_id, branch_id: b.id, min_level: valores[b.id] ?? 0 }))
        .filter((i) => i.min_level !== (producto.por_sucursal.find((s) => s.branch_id === i.branch_id)?.minimo ?? 0));
      await guardarMinimos(items);
      toast({ title: t('listo') });
      onGuardado?.();
      onAbiertoChange(false);
    } catch (e) {
      toast({ variant: 'destructive', title: t('error'), description: mensajeError(e) });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo', { nombre: producto.nombre })}
      descripcion={t('descripcion')}
      icono={SlidersHorizontal}
      ancho={560}
      primario={{ etiqueta: t('guardar'), onClick: () => void guardar(), cargando: guardando, deshabilitada: invalido }}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {branches.map((b) => {
            const hoy = producto.por_sucursal.find((s) => s.branch_id === b.id)?.existencia ?? 0;
            return (
              <FormField key={b.id} etiqueta={b.name} ayuda={t('hoyHay', { n: cantidad(hoy) })}>
                <CampoNumero
                  valor={valores[b.id] ?? null}
                  onValorChange={(v) => setValores((prev) => ({ ...prev, [b.id]: v }))}
                  decimales={3}
                  minimo={0}
                  sufijo={producto.unidad ?? t('uds')}
                />
              </FormField>
            );
          })}
        </div>
        <p className="flex items-start gap-2 rounded-lg bg-subtle px-3 py-2.5 text-xs text-fg-secondary">
          <Info aria-hidden="true" className="mt-px size-4 shrink-0" strokeWidth={1.5} />
          {t('aviso')}
        </p>
      </div>
    </Dialogo>
  );
}
