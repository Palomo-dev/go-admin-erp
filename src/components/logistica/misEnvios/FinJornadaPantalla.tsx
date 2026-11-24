'use client';

/**
 * Fin de jornada (Figma 2802:10481): entregados / no entregados / por devolver, lo que cobró por
 * medio, el efectivo que entrega en caja y lo pendiente (reprogramados y paquetes por devolver).
 *
 * El dinero ya está en la base (cada entrega guardó su cobro): Logística › Cuadres lo ve como «por
 * recibir». «Enviar resumen para el cuadre» cierra la jornada (fuera de turno) por el servidor.
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Banknote, CheckCircle2, Send } from 'lucide-react';
import { AvisoTonal, EmptyState, PageHeader, Skeleton, clasesBoton } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { toastError } from '@/components/ui/use-toast';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { resumenJornada } from '@/lib/logistica/misEnvios';
import { nombreDomiciliario } from '@/lib/logistica/domiciliarios';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { cerrarJornada } from '../logisticaApi';
import { useMiRuta } from './useMiRuta';
import { BarraInferior, Bloque } from './piezas';
import { RUTA_MIS_ENVIOS } from './rutas';

export function FinJornadaPantalla() {
  const t = useTranslations('logistica.misEnvios.finJornada');
  const tm = useTranslations('logistica.misEnvios');
  const locale = useLocaleIntl();
  const moneda = useMonedaOrganizacion();
  const { driver, envios, estado, recargar, hoy, zonaDe } = useMiRuta();
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const r = useMemo(() => resumenJornada(envios, hoy, zonaDe), [envios, hoy, zonaDe]);
  const fecha = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${hoy}T12:00:00Z`));
  const subtitulo = [fecha, driver ? nombreDomiciliario(driver) : null].filter(Boolean).join(' · ');

  if (estado === 'sin_domiciliario' || estado === 'error') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col px-4 pt-4 pb-28 sm:pt-6 gap-4">
        <PageHeader titulo={t('titulo')} variante="form" volverA={RUTA_MIS_ENVIOS} />
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
  if (estado === 'cargando') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col px-4 pt-4 pb-28 sm:pt-6 gap-3" aria-busy="true">
        <PageHeader titulo={t('titulo')} variante="form" volverA={RUTA_MIS_ENVIOS} cargando />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  const enviar = async () => {
    setEnviando(true);
    try {
      await cerrarJornada();
      setEnviado(true);
    } catch {
      toastError(tm('errores.titulo'), t('errorEnviar'));
    } finally {
      setEnviando(false);
    }
  };

  const textoPendiente = (e: (typeof r.reprogramados)[number]) =>
    e.expected_delivery_date && e.expected_delivery_date > hoy ? t('reprogramadoPara', { fecha: formatPlainDate(e.expected_delivery_date) }) : t('reprogramadoHoy');

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col px-4 pt-4 pb-28 sm:pt-6 gap-3">
      <PageHeader titulo={t('titulo')} subtitulo={subtitulo} variante="form" volverA={RUTA_MIS_ENVIOS} />

      <section aria-label={t('cifras')} className="grid grid-cols-3 gap-2 rounded-xl border border-line bg-surface p-4">
        <Cifra etiqueta={t('entregados')} valor={String(r.entregados)} clase="text-success-text" />
        <Cifra etiqueta={t('noEntregados')} valor={String(r.noEntregados)} clase={r.noEntregados > 0 ? 'text-warning-text' : undefined} />
        <Cifra etiqueta={t('porDevolver')} valor={t('paquetes', { n: r.porDevolver })} />
      </section>

      <Bloque titulo={t('cobraste')}>
        {r.cobros.length === 0 ? (
          <p className="text-sm text-fg-secondary">{t('sinCobros')}</p>
        ) : (
          <dl className="flex flex-col gap-2 text-sm">
            {r.cobros.map((c) => (
              <div key={c.medio} className="flex justify-between gap-3">
                <dt className="text-fg-secondary">{t(`medios.${c.medio}`, { n: c.envios })}</dt>
                <dd className="text-fg">{moneda.formatear(c.total)}</dd>
              </div>
            ))}
            <div className="mt-1 flex justify-between gap-3 border-t border-line pt-2">
              <dt className="text-fg-secondary">{t('totalCobrado')}</dt>
              <dd className="text-base font-semibold text-fg">{moneda.formatear(r.totalCobrado)}</dd>
            </div>
          </dl>
        )}
      </Bloque>

      <section className="flex flex-col gap-1 rounded-xl border border-line-warning bg-warning-subtle p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
            <Banknote aria-hidden="true" className="size-5" strokeWidth={1.5} />
            {t('entregaEnCaja')}
          </h2>
          <span className="text-xl font-semibold text-fg">{moneda.formatear(r.efectivoACaja)}</span>
        </div>
        <p className="text-sm text-fg-secondary">{t('entregaEnCajaAyuda')}</p>
      </section>

      {(r.reprogramados.length > 0 || r.devoluciones.length > 0) && (
        <Bloque titulo={t('pendientes')}>
          <ul className="flex flex-col gap-2 text-sm">
            {r.reprogramados.map((e) => (
              <li key={e.id} className="flex justify-between gap-3">
                <span className="text-fg-secondary">{e.shipment_number}</span>
                <span className="text-right text-fg">{textoPendiente(e)}</span>
              </li>
            ))}
            {r.devoluciones.map((e) => (
              <li key={e.id} className="flex justify-between gap-3">
                <span className="text-fg-secondary">{t('paqueteDevolver')}</span>
                <span className="text-right text-fg">{e.shipment_number}</span>
              </li>
            ))}
          </ul>
        </Bloque>
      )}

      {enviado ? (
        <AvisoTonal tono="exito" icono={CheckCircle2} titulo={t('enviado.titulo')} descripcion={t('enviado.descripcion')} rol="status" />
      ) : (
        <BarraInferior nota={t('notaCuadre')}>
          <button type="button" onClick={enviar} disabled={enviando} aria-busy={enviando} className={clasesBoton({ tamano: 'lg', anchoCompleto: true })}>
            <Send aria-hidden="true" className="size-5" strokeWidth={1.5} />
            {enviando ? tm('guardando') : t('enviar')}
          </button>
        </BarraInferior>
      )}
    </div>
  );
}

function Cifra({ etiqueta, valor, clase }: { etiqueta: string; valor: string; clase?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate text-xs text-fg-secondary">{etiqueta}</span>
      <span className={`truncate text-base font-semibold text-fg ${clase ?? ''}`}>{valor}</span>
    </div>
  );
}
