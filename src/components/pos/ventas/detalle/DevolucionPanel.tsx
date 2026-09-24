'use client';

/**
 * «Crear devolución» desde la venta (V4 de CAJAS-VENTAS-PLAN): abre el
 * formulario del agente de devoluciones (`ReturnForm`, que llama a
 * `procesar_devolucion` en una transacción) con la venta ya cargada por
 * `DevolucionesService.obtenerDetalleVenta`. Antes el botón navegaba a
 * `/app/pos/devoluciones/nuevo?sale_id=…`, ruta que no existe.
 * Aquí no se calcula ni se escribe nada de la devolución.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Undo2 } from 'lucide-react';
import { EmptyState, PanelAdaptable } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { toastSuccess } from '@/components/ui/use-toast';
import { DevolucionesService } from '@/components/pos/devoluciones/devolucionesService';
import { ReturnForm } from '@/components/pos/devoluciones/ReturnForm';
import type { SaleForReturn } from '@/components/pos/devoluciones/types';

export interface DevolucionPanelProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  ventaId: string;
  numero: string | null;
  onDevuelta: () => void;
}

export function DevolucionPanel({ abierto, onAbiertoChange, ventaId, numero, onDevuelta }: DevolucionPanelProps) {
  const t = useTranslations('posVentas.devolucion');
  const [venta, setVenta] = useState<SaleForReturn | null>(null);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    setVenta(null);
    setError(false);
    DevolucionesService.obtenerDetalleVenta(ventaId)
      .then((v) => vigente && setVenta(v))
      .catch(() => vigente && setError(true));
    return () => {
      vigente = false;
    };
  }, [abierto, ventaId, intento]);

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={numero ? t('tituloNumero', { numero }) : t('titulo')}
      descripcion={t('descripcion')}
      icono={Undo2}
      ancho={1120}
    >
      {error ? (
        <EmptyState variante="error" titulo={t('errorCarga')} onReintentar={() => setIntento((n) => n + 1)} />
      ) : !venta ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : (
        <ReturnForm
          sale={venta}
          onBack={() => onAbiertoChange(false)}
          onSuccess={() => {
            toastSuccess(t('hecha'));
            onAbiertoChange(false);
            onDevuelta();
          }}
        />
      )}
    </PanelAdaptable>
  );
}
