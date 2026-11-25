'use client';

/**
 * No se pudo entregar como página (`/mis-envios/[id]/no-entregado`): el enlace directo de siempre.
 * Desde la parada se abre el MISMO formulario en una hoja (`HojaNovedad`).
 */
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { EmptyState, PageHeader, Skeleton } from '@/components/kit';
import { puedeReportarNovedad } from '@/lib/logistica/misEnvios';
import { useParada } from './useMiRuta';
import { FormularioNovedad } from './FormularioNovedad';
import { RUTA_MIS_ENVIOS, rutaParada } from './rutas';

export function NovedadPantalla({ shipmentId }: { shipmentId: string }) {
  const t = useTranslations('logistica.misEnvios.novedad');
  const tm = useTranslations('logistica.misEnvios');
  const router = useRouter();
  const { orgId, envio, estado } = useParada(shipmentId);
  const migas = [{ etiqueta: tm('titulo'), href: RUTA_MIS_ENVIOS }];

  if (estado === 'cargando') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col px-4 pt-4 pb-28 sm:pt-6 gap-3" aria-busy="true">
        <PageHeader titulo={t('titulo')} variante="form" migas={migas} volverA={RUTA_MIS_ENVIOS} cargando />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }
  if (!envio || !orgId || !puedeReportarNovedad(String(envio.status))) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col px-4 pt-4 pb-28 sm:pt-6 gap-4">
        <PageHeader titulo={t('titulo')} variante="form" migas={migas} volverA={RUTA_MIS_ENVIOS} />
        <EmptyState
          variante="empty"
          compacto
          titulo={envio ? t('noAplica.titulo') : tm('parada.noEncontrada.titulo')}
          descripcion={envio ? t('noAplica.descripcion') : tm('parada.noEncontrada.descripcion')}
          accion={{ etiqueta: tm('volver'), onClick: () => router.push(envio ? rutaParada(envio.id) : RUTA_MIS_ENVIOS) }}
        />
      </div>
    );
  }

  const nombre = envio.delivery_contact_name || envio.customer?.full_name || tm('cliente');
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col px-4 pt-4 pb-28 sm:pt-6 gap-4">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={`${envio.shipment_number} · ${nombre}`}
        variante="form"
        migas={[...migas, { etiqueta: tm('parada.titulo', { numero: envio.shipment_number }), href: rutaParada(envio.id) }]}
        volverA={rutaParada(envio.id)}
      />
      <FormularioNovedad envio={envio} orgId={orgId} onHecho={() => router.push(RUTA_MIS_ENVIOS)} />
    </div>
  );
}
