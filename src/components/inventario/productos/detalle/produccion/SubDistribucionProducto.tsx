'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Send } from 'lucide-react';
import { StatusBadge, type ColumnaTabla } from '@/components/kit';
import { TablaSubseccion } from '@/components/kit/TablaSubseccion';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { puede } from '@/lib/inventario/permisos';
import { distribucionProducto, type ResumenProduccionProducto, type TrasladoProducto } from '@/lib/services/productionOrderService';
import { rutaOrdenProduccion, rutaTraslado } from '../../../produccion/logica';
import { useFormatoCantidad } from '../../../produccion/piezas';
import type { ProductoPestanaProduccion } from './PestanaProduccion';

/**
 * Producción › Distribución (Figma D5 968:179187): traslados que llevan este
 * producto (origen → destino, enviado y recibido, estado y la orden de la que
 * salió). Crear, despachar y recibir son de Traslados y Distribución (B3): la
 * fila abre el detalle del traslado y «Nueva distribución» abre el asistente.
 */
export function SubDistribucionProducto({ producto, resumen }: { producto: ProductoPestanaProduccion; resumen: ResumenProduccionProducto }) {
  const t = useTranslations('subseccion.distribucion');
  const router = useRouter();
  const cantidad = useFormatoCantidad();
  const { formatDate } = useFormatDate();
  const [filas, setFilas] = useState<TrasladoProducto[]>([]);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    const control = new AbortController();
    setEstado('cargando');
    distribucionProducto(getOrganizationId(), producto.id, control.signal)
      .then((r) => {
        setFilas(r);
        setEstado('listo');
      })
      .catch(() => !control.signal.aborted && setEstado('error'));
    return () => control.abort();
  }, [producto.id, recarga]);

  const columnas = useMemo<ColumnaTabla<TrasladoProducto>[]>(
    () => [
      {
        id: 'traslado',
        encabezado: t('col.traslado'),
        celda: (f) => (
          <div className="flex min-w-0 flex-col">
            <span className="font-medium text-brand">{f.codigo}</span>
            <span className="truncate text-xs text-fg-secondary">{f.creado_en ? formatDate(f.creado_en) : ''}</span>
          </div>
        ),
      },
      { id: 'ruta', encabezado: t('col.ruta'), celda: (f) => `${f.origen.nombre} → ${f.destino.nombre}` },
      { id: 'enviado', encabezado: t('col.enviado'), variante: 'importe', celda: (f) => cantidad(f.enviado, resumen.producto.unidad) },
      { id: 'recibido', encabezado: t('col.recibido'), variante: 'importe', ocultarDebajo: 'md', celda: (f) => (f.estado === 'received' ? cantidad(f.recibido, resumen.producto.unidad) : '—') },
      {
        id: 'orden',
        encabezado: t('col.orden'),
        ocultarDebajo: 'lg',
        celda: (f) =>
          f.orden_produccion ? (
            <button
              type="button"
              className="text-sm text-brand hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                router.push(rutaOrdenProduccion(f.orden_produccion!.id));
              }}
            >
              {f.orden_produccion.numero}
            </button>
          ) : (
            '—'
          ),
      },
      { id: 'estado', encabezado: t('col.estado'), celda: (f) => <StatusBadge estado={f.estado === 'in_transit' ? 'in progress' : f.estado} etiqueta={t(`estados.${f.estado}`)} /> },
    ],
    [cantidad, formatDate, resumen.producto.unidad, router, t],
  );

  return (
    <TablaSubseccion
      titulo={t('titulo')}
      contador={filas.length}
      descripcion={t('descripcion')}
      accionNueva={puede(resumen.permisos, 'trasladar') ? { etiqueta: t('nueva'), icono: Send, onClick: () => router.push('/app/inventario/distribucion') } : undefined}
      columnas={columnas}
      filas={filas}
      obtenerId={(f) => String(f.id)}
      estado={estado === 'cargando' ? 'cargando' : estado === 'error' ? 'error' : 'listo'}
      onFilaClick={(f) => router.push(rutaTraslado(f.id))}
      etiquetaFila={(f) => t('etiquetaFila', { codigo: f.codigo })}
      onReintentar={() => setRecarga((n) => n + 1)}
      vacio={{ titulo: t('vacioTitulo'), descripcion: t('vacioDescripcion', { producto: producto.name }), icono: Send }}
    />
  );
}
