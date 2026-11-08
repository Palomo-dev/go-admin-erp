'use client';

/**
 * Pestaña «Por aceptar»: lo que llegó de otra organización vinculada y espera tu
 * decisión — notas de consignación (Figma R2) y liquidaciones o devoluciones de
 * tus consignatarios (Figma R8). Son COPIAS que armó el emisor; aceptarlas crea
 * tus propias filas con tus funciones.
 */
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FileInput, Inbox } from 'lucide-react';
import { DataTable, ListCard, StatusBadge, type ColumnaTabla } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { rutaPorAceptar, type DocumentoPorAceptar } from '@/lib/inventario/consignaciones/recibidas';

const NS = 'consignacionesR4';

export function ListadoPorAceptar({ documentos, cargando, estadoError, onReintentar }: { documentos: readonly DocumentoPorAceptar[]; cargando: boolean; estadoError: 'sinPermiso' | 'error' | null; onReintentar: () => void }) {
  const t = useTranslations(NS);
  const router = useRouter();
  const { formatDate } = useFormatDate();
  const abrir = (d: DocumentoPorAceptar) => router.push(rutaPorAceptar(d.id));
  const tipo = (d: DocumentoPorAceptar) => <StatusBadge estado="pendiente" etiqueta={t(`porAceptar.tipos.${d.tipo}`)} />;
  const columnas: ColumnaTabla<DocumentoPorAceptar>[] = [
    { id: 'tipo', encabezado: t('columnas.tipo'), celda: tipo },
    { id: 'numero', encabezado: t('columnas.nota'), celda: (d) => <span className="font-medium text-fg">{d.numero ?? '—'}</span> },
    { id: 'de', encabezado: t('columnas.de'), celda: (d) => d.de.nombre ?? '—' },
    { id: 'fecha', encabezado: t('columnas.fecha'), ocultarDebajo: 'lg', celda: (d) => <span className="whitespace-nowrap tabular-nums">{formatDate(d.fecha)}</span> },
  ];
  const estado = estadoError === 'sinPermiso' ? 'sinPermiso' : cargando && documentos.length === 0 ? 'cargando' : estadoError ? 'error' : documentos.length === 0 ? 'vacio' : 'listo';
  return (
    <DataTable
      etiqueta={t('pestanas.porAceptar')}
      columnas={columnas}
      filas={documentos}
      obtenerId={(d) => d.id}
      estado={estado}
      onFilaClick={abrir}
      etiquetaFila={(d) => t('etiquetaFila', { numero: d.numero ?? '—', tercero: d.de.nombre ?? '—' })}
      tarjetaMovil={(d) => (
        <ListCard icono={FileInput} titulo={`${d.numero ?? '—'} · ${d.de.nombre ?? '—'}`} subtitulo={formatDate(d.fecha)} estado={tipo(d)} onClick={() => abrir(d)} />
      )}
      vacio={{ titulo: t('vacio.porAceptarTitulo'), descripcion: t('vacio.porAceptarDescripcion'), icono: Inbox }}
      error={{ titulo: t('errorCarga') }}
      sinPermiso={{ titulo: t('sinPermiso.titulo'), descripcion: t('sinPermiso.descripcion') }}
      onReintentar={onReintentar}
    />
  );
}
