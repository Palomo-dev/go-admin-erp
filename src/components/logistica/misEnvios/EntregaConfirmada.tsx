'use client';

/**
 * Entrega confirmada (Figma «08 Entrega confirmada»): a quién y a qué hora, el dinero de esta
 * entrega (cobrado, recibido, cambio y lo que lleva en mano ahora) y la siguiente parada con
 * «Iniciar ruta a la parada N». Ahorra dos toques por parada (decisión del dueño, 2026-11-25).
 *
 * «Iniciar ruta» es la misma RPC de la parada (`logistica_cambiar_estado` → out_for_delivery, que
 * avisa al cliente y le manda su código). Si la siguiente aún no se recoge, se abre la parada.
 * El efectivo en mano sale de la ruta recién leída (la base ya guardó este cobro).
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Navigation, Route } from 'lucide-react';
import { PageHeader, Skeleton, clasesBoton } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { deliveryIntegrationService, EnvioError } from '@/lib/services/deliveryIntegrationService';
import type { EnvioApp } from '@/lib/services/logistica/misEnviosService';
import {
  accionSiguienteParada,
  agruparMisEnvios,
  numeroParada,
  resumenRuta,
  siguienteParada,
  type MedioCobroApp,
} from '@/lib/logistica/misEnvios';
import { avisarCliente } from '../logisticaApi';
import { useMiRuta } from './useMiRuta';
import { useEnLinea } from './useEnLinea';
import { ubicacionActual } from './ubicacion';
import { TarjetaParada } from './TarjetaParada';
import { AvisoPausaSinConexion, BarraInferior, Bloque } from './piezas';
import { RUTA_MIS_ENVIOS, rutaParada } from './rutas';

export interface DatosEntrega {
  envio: EnvioApp;
  receptor: string;
  relacion: string;
  codigoVerificado: boolean;
  entregadoEn: Date;
  total: number;
  medio: MedioCobroApp | null;
  recibidoEfectivo: number | null;
  cambio: number | null;
}

export function EntregaConfirmada({ datos }: { datos: DatosEntrega }) {
  const t = useTranslations('logistica.misEnvios.confirmada');
  const tm = useTranslations('logistica.misEnvios');
  const router = useRouter();
  const locale = useLocaleIntl();
  const moneda = useMonedaOrganizacion();
  const enLinea = useEnLinea();
  const { envios, estado, hoy, zonaDe } = useMiRuta();
  const [ocupado, setOcupado] = useState(false);
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const grupos = useMemo(() => agruparMisEnvios(envios, hoy, zonaDe), [envios, hoy, zonaDe]);
  const resumen = useMemo(() => resumenRuta(grupos, envios), [grupos, envios]);
  const siguiente = siguienteParada(grupos.pendientes, datos.envio.id);
  const accion = accionSiguienteParada(siguiente);
  const numeroSiguiente = siguiente ? numeroParada(grupos.pendientes.indexOf(siguiente), resumen.entregados) : null;
  const zona = zonaDe(datos.envio);
  const hora = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: zona }).format(datos.entregadoEn);
  const detalle = [hora, datos.codigoVerificado ? t('codigoVerificado') : null, datos.relacion].filter(Boolean).join(' · ');

  const iniciarRuta = async () => {
    if (!siguiente) return;
    setOcupado(true);
    try {
      const ubicacion = await ubicacionActual(3000);
      const r = await deliveryIntegrationService.changeStatus(siguiente.id, 'out_for_delivery', ubicacion ?? {});
      void avisarCliente(siguiente, r.aviso);
      toastSuccess(tm('pasos.hecho.out_for_delivery'));
      router.push(rutaParada(siguiente.id));
    } catch (err) {
      const codigo = err instanceof EnvioError ? err.codigo : 'ERROR';
      toastError(tm('errores.titulo'), tm.has(`errores.${codigo}`) ? tm(`errores.${codigo}`) : tm('errores.ERROR'));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col px-4 pt-4 pb-28 sm:pt-6 gap-4">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={
          resumen.totalParadas > 0
            ? t('subtitulo', { numero: datos.envio.shipment_number, n: resumen.entregados, total: resumen.totalParadas })
            : datos.envio.shipment_number
        }
        variante="form"
        migas={[{ etiqueta: tm('titulo'), href: RUTA_MIS_ENVIOS }]}
        volverA={RUTA_MIS_ENVIOS}
      />

      <section aria-live="polite" className="flex flex-col items-center gap-2 py-4 text-center">
        <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-full bg-success-subtle text-success-text">
          <CheckCircle2 className="size-7" strokeWidth={1.5} />
        </span>
        <h2 className="text-xl font-semibold text-fg">{t('entregadoA', { nombre: datos.receptor })}</h2>
        <p className="text-sm text-fg-secondary">{detalle}</p>
      </section>

      {datos.total > 0 && datos.medio && (
        <Bloque titulo={t('dinero.titulo')}>
          <dl className="flex flex-col gap-2 text-[15px]">
            <div className="flex justify-between gap-3">
              <dt className="text-fg-secondary">{t(`dinero.cobrado.${datos.medio}`)}</dt>
              <dd className="text-fg">{moneda.formatear(datos.total)}</dd>
            </div>
            {datos.medio === 'cash' && datos.recibidoEfectivo != null && (
              <>
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-secondary">{t('dinero.recibido')}</dt>
                  <dd className="text-fg">{moneda.formatear(datos.recibidoEfectivo)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-secondary">{t('dinero.cambio')}</dt>
                  <dd className="text-fg">{moneda.formatear(datos.cambio ?? 0)}</dd>
                </div>
              </>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-fg-secondary">{t('dinero.enMano')}</dt>
              <dd className="text-lg font-semibold text-fg">{estado === 'listo' ? moneda.formatear(resumen.enMano) : '—'}</dd>
            </div>
          </dl>
        </Bloque>
      )}

      {estado === 'cargando' ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : siguiente ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-fg">{t('siguiente')}</h2>
          <TarjetaParada como="div" envio={siguiente} numero={numeroSiguiente} zona={zonaDe(siguiente)} ahora={ahora} onAbrir={() => router.push(rutaParada(siguiente.id))} />
        </section>
      ) : estado === 'listo' ? (
        <p className="rounded-xl border border-line bg-surface p-4 text-sm text-fg-secondary">{t('sinMas')}</p>
      ) : null}

      {!enLinea && accion === 'iniciar_ruta' && <AvisoPausaSinConexion />}

      <BarraInferior>
        {siguiente && accion === 'iniciar_ruta' && (
          <button
            type="button"
            onClick={iniciarRuta}
            disabled={ocupado || !enLinea}
            aria-busy={ocupado}
            className={clasesBoton({ tamano: 'lg', anchoCompleto: true })}
          >
            <Navigation aria-hidden="true" className="size-5" strokeWidth={1.5} />
            {ocupado ? tm('guardando') : t('iniciarRuta', { n: numeroSiguiente ?? 0 })}
          </button>
        )}
        {siguiente && accion === 'abrir' && (
          <button type="button" onClick={() => router.push(rutaParada(siguiente.id))} className={clasesBoton({ tamano: 'lg', anchoCompleto: true })}>
            {t('irAParada', { n: numeroSiguiente ?? 0 })}
          </button>
        )}
        <button
          type="button"
          onClick={() => router.push(RUTA_MIS_ENVIOS)}
          className={clasesBoton({ variante: siguiente ? 'secundario' : 'primario', tamano: 'lg', anchoCompleto: true })}
        >
          <Route aria-hidden="true" className="size-5" strokeWidth={1.5} />
          {t('volverRuta')}
        </button>
      </BarraInferior>
    </div>
  );
}
