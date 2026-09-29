'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Scale } from 'lucide-react';
import { StatusBadge, type ColumnaTabla } from '@/components/kit';
import { TablaSubseccion } from '@/components/kit/TablaSubseccion';
import type { ResumenProduccionProducto } from '@/lib/services/productionOrderService';
import { useFormatoCantidad } from '../../../produccion/piezas';

type Conversion = ResumenProduccionProducto['conversiones'][number];

/**
 * Producción › Unidades (Figma D6 968:180119): la unidad base del producto y
 * las conversiones que le aplican (de la organización o globales), las mismas
 * que usa el cálculo de la receta. Crear y editar conversiones —y el alcance
 * «Solo este producto»— es de Unidades y conversiones (B6a): aquí se enlaza.
 */
export function SubUnidadesProducto({ resumen }: { resumen: ResumenProduccionProducto }) {
  const t = useTranslations('subseccion.unidades');
  const router = useRouter();
  const cantidad = useFormatoCantidad();

  const columnas = useMemo<ColumnaTabla<Conversion>[]>(
    () => [
      { id: 'de', encabezado: t('col.de'), celda: (c) => `1 ${c.de}` },
      { id: 'a', encabezado: t('col.a'), celda: (c) => cantidad(c.factor, c.a) },
      { id: 'inversa', encabezado: t('col.inversa'), ocultarDebajo: 'md', celda: (c) => (c.factor > 0 ? `1 ${c.a} = ${cantidad(1 / c.factor, c.de)}` : '—') },
      {
        id: 'alcance',
        encabezado: t('col.alcance'),
        celda: (c) => <StatusBadge estado={c.alcance} tono={c.alcance === 'global' ? 'neutro' : 'marca'} apariencia="contorno" etiqueta={t(`alcance.${c.alcance}`)} />,
      },
    ],
    [cantidad, t],
  );

  return (
    <TablaSubseccion
      titulo={t('titulo')}
      contador={resumen.conversiones.length}
      descripcion={t('descripcion', { unidad: resumen.producto.unidad })}
      accionNueva={{ etiqueta: t('gestionar'), icono: Scale, onClick: () => router.push('/app/inventario/conversiones') }}
      columnas={columnas}
      filas={resumen.conversiones}
      obtenerId={(c) => String(c.id)}
      estado="listo"
      densidad="compacta"
      vacio={{ titulo: t('vacioTitulo'), descripcion: t('vacioDescripcion', { unidad: resumen.producto.unidad }), icono: Scale }}
    />
  );
}
