'use client';

/**
 * Mi vehículo y documentos (Figma «11» y «12»): el vehículo de hoy, SOAT y tecnomecánica, la
 * licencia y, si hoy lo asignaron con excepción, quién la autorizó. El domiciliario no escribe el
 * PIN ni cambia nada aquí: lo actualiza quien despacha en Logística › Domiciliarios.
 */
import { useTranslations } from 'next-intl';
import { Info } from 'lucide-react';
import { AvisoTonal, EmptyState, PageHeader, Skeleton } from '@/components/kit';
import { useBranch } from '@/lib/context/BranchContext';
import { nombreDomiciliario } from '@/lib/logistica/domiciliarios';
import { useMiRuta } from './useMiRuta';
import { useMiVehiculo } from './useMiVehiculo';
import { BloqueExcepcion, CabeceraVehiculo, FilaDocumento, useFechaCorta } from './PiezasVehiculo';
import { Bloque } from './piezas';
import { RUTA_MIS_ENVIOS } from './rutas';

export function MiVehiculoPantalla() {
  const t = useTranslations('logistica.misEnvios.vehiculo');
  const tm = useTranslations('logistica.misEnvios');
  const fecha = useFechaCorta();
  const { branches } = useBranch();
  const { orgId, driver, envios, estado, recargar, hoy, timezone, zonaDe } = useMiRuta();
  const v = useMiVehiculo({ orgId, driver, envios, hoy, zonaDe });
  const migas = [{ etiqueta: tm('titulo'), href: RUTA_MIS_ENVIOS }];
  const sede = driver ? branches.find((b) => b.id === (driver as { branch_id?: number | null }).branch_id)?.name ?? null : null;
  const subtitulo = [driver ? nombreDomiciliario(driver) : null, sede].filter(Boolean).join(' · ');

  if (estado === 'sin_domiciliario' || estado === 'error') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pt-4 pb-28 sm:pt-6">
        <PageHeader titulo={t('titulo')} variante="form" migas={migas} volverA={RUTA_MIS_ENVIOS} />
        <EmptyState
          variante={estado === 'error' ? 'error' : 'forbidden'}
          compacto
          titulo={estado === 'error' ? tm('error.titulo') : tm('sinDomiciliario.titulo')}
          descripcion={estado === 'error' ? tm('error.descripcion') : tm('sinDomiciliario.descripcion')}
          onReintentar={estado === 'error' ? recargar : undefined}
        />
      </div>
    );
  }

  const cargando = estado === 'cargando' || v.estado === 'cargando';
  const vencido = v.documentosVehiculo.find((d) => d.vigencia.estado === 'vencido') ?? (v.licencia?.vigencia.estado === 'vencido' ? v.licencia : null);
  const porVencer = !vencido ? v.documentosVehiculo.find((d) => d.vigencia.estado === 'por_vencer') ?? (v.licencia?.vigencia.estado === 'por_vencer' ? v.licencia : null) : null;
  const nombreDoc = (clave: string) => t(`documentos.${clave}`);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pt-4 pb-28 sm:pt-6">
      <PageHeader titulo={t('titulo')} subtitulo={subtitulo} variante="form" migas={migas} volverA={RUTA_MIS_ENVIOS} cargando={cargando} />

      {cargando ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : (
        <>
          {v.vehiculo ? (
            <Bloque>
              <CabeceraVehiculo v={v} />
              {v.enviosConPlaca > 0 && <p className="text-sm text-fg-secondary">{t('placaCongelada', { n: v.enviosConPlaca })}</p>}
            </Bloque>
          ) : (
            <EmptyState variante="empty" compacto titulo={t('sinVehiculo.titulo')} descripcion={t('sinVehiculo.descripcion')} />
          )}

          {v.documentosVehiculo.length > 0 && (
            <Bloque titulo={t('documentosDelVehiculo')}>
              <ul className="flex flex-col gap-4">
                {v.documentosVehiculo.map((d) => (
                  <FilaDocumento key={d.clave} doc={d} />
                ))}
              </ul>
            </Bloque>
          )}

          {v.licencia && (
            <Bloque titulo={t('tusDocumentos')}>
              <ul className="flex flex-col gap-4">
                <FilaDocumento doc={v.licencia} />
              </ul>
            </Bloque>
          )}

          <BloqueExcepcion v={v} zona={timezone} />

          {vencido && !v.excepcion && <AvisoTonal tono="peligro" titulo={t('avisoVencido', { documento: nombreDoc(vencido.clave), fecha: fecha(vencido.vence) })} />}
          {porVencer && <AvisoTonal tono="advertencia" titulo={t('avisoPorVencer', { documento: nombreDoc(porVencer.clave), fecha: fecha(porVencer.vence) })} />}
          {v.excepcion && <AvisoTonal tono="informacion" titulo={t('noEscribesPin')} />}

          <p className="flex items-start gap-3 rounded-xl border border-line bg-subtle p-4 text-sm text-fg-secondary">
            <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} />
            {t('cambiaste')}
          </p>
        </>
      )}
    </div>
  );
}
