'use client';

/**
 * Fin de jornada (Figma 2802:10481): entregados / no entregados / por devolver, lo que cobró por
 * medio, el efectivo que entrega en caja y lo pendiente (reprogramados y paquetes por devolver).
 *
 * El dinero ya está en la base (cada entrega guardó su cobro): Logística › Cuadres lo ve como «por
 * recibir». «Enviar resumen para el cuadre» cierra la jornada (fuera de turno) por el servidor.
 *
 * Después de enviarlo (o si la jornada de hoy ya se cerró) se ve «Resumen enviado» (Figma «14»):
 * lo que entrega en caja y el estado de SU cuadre de hoy, leído de `courier_settlements` (RLS: el
 * domiciliario ve los suyos). Sin señal no se envía.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Banknote, CheckCircle2, Circle, Clock, Info, Send } from 'lucide-react';
import { EmptyState, PageHeader, Skeleton, StatusBadge, clasesBoton } from '@/components/kit';
import { supabase } from '@/lib/supabase/config';
import { useBranch } from '@/lib/context/BranchContext';
import { estadoCuadreJornada, type PasoCuadre } from '@/lib/logistica/misEnvios';
import { cuadresDesde, type CuadreJornada } from '@/lib/services/logistica/misEnviosService';
import { startOfDayInstant, toPlainDate } from '@/lib/utils/dateCore';
import { useEnLinea } from './useEnLinea';
import { AvisoPausaSinConexion } from './piezas';
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
  const { orgId, driver, envios, estado, recargar, hoy, timezone, zonaDe } = useMiRuta();
  const { branches } = useBranch();
  const enLinea = useEnLinea();
  const [enviando, setEnviando] = useState(false);
  const [enviadoEn, setEnviadoEn] = useState<Date | null>(null);
  const [cuadres, setCuadres] = useState<CuadreJornada[] | null>(null);

  // Jornada ya cerrada hoy (`driver_credentials.metadata.fin_jornada_at`, la que escribe la RPC).
  const finGuardado = (driver as { metadata?: Record<string, unknown> | null } | null)?.metadata?.fin_jornada_at;
  const finHoy = typeof finGuardado === 'string' && !isNaN(Date.parse(finGuardado)) && toPlainDate(new Date(finGuardado), timezone) === hoy ? new Date(finGuardado) : null;
  const cerradaEn = enviadoEn ?? finHoy;
  const claveCerrada = cerradaEn ? cerradaEn.getTime() : null;

  useEffect(() => {
    if (!orgId || !driver || claveCerrada == null) return;
    let cancelado = false;
    cuadresDesde(supabase, orgId, driver.id, startOfDayInstant(hoy, timezone).toISOString())
      .then((c) => !cancelado && setCuadres(c))
      .catch(() => !cancelado && setCuadres([]));
    return () => {
      cancelado = true;
    };
  }, [orgId, driver, claveCerrada, hoy, timezone]);

  const r = useMemo(() => resumenJornada(envios, hoy, zonaDe), [envios, hoy, zonaDe]);
  const fecha = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${hoy}T12:00:00Z`));
  const subtitulo = [fecha, driver ? nombreDomiciliario(driver) : null].filter(Boolean).join(' · ');

  if (estado === 'sin_domiciliario' || estado === 'error') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col px-4 pt-4 pb-28 sm:pt-6 gap-4">
        <PageHeader titulo={t('titulo')} variante="form" migas={[{ etiqueta: tm('titulo'), href: RUTA_MIS_ENVIOS }]} volverA={RUTA_MIS_ENVIOS} />
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
        <PageHeader titulo={t('titulo')} variante="form" migas={[{ etiqueta: tm('titulo'), href: RUTA_MIS_ENVIOS }]} volverA={RUTA_MIS_ENVIOS} cargando />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  const enviar = async () => {
    if (!enLinea) return;
    setEnviando(true);
    try {
      const respuesta = await cerrarJornada();
      const instante = respuesta?.finJornadaAt && !isNaN(Date.parse(respuesta.finJornadaAt)) ? new Date(respuesta.finJornadaAt) : new Date();
      setEnviadoEn(instante);
    } catch {
      toastError(tm('errores.titulo'), t('errorEnviar'));
    } finally {
      setEnviando(false);
    }
  };

  const textoPendiente = (e: (typeof r.reprogramados)[number]) =>
    e.expected_delivery_date && e.expected_delivery_date > hoy ? t('reprogramadoPara', { fecha: formatPlainDate(e.expected_delivery_date) }) : t('reprogramadoHoy');

  const sede = driver ? branches.find((b) => b.id === (driver as { branch_id?: number | null }).branch_id)?.name ?? null : null;

  if (cerradaEn) {
    const cuadre = (cuadres ?? []).find((c) => c.status !== 'cancelled') ?? null;
    return (
      <ResumenEnviado
        enviadoEn={cerradaEn}
        zona={timezone}
        subtitulo={[subtitulo, sede].filter(Boolean).join(' · ')}
        efectivo={r.efectivoACaja}
        sede={sede}
        paso={cuadres === null ? null : estadoCuadreJornada(cuadre)}
        cuadre={cuadre}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col px-4 pt-4 pb-28 sm:pt-6 gap-3">
      <PageHeader titulo={t('titulo')} subtitulo={subtitulo} variante="form" migas={[{ etiqueta: tm('titulo'), href: RUTA_MIS_ENVIOS }]} volverA={RUTA_MIS_ENVIOS} />

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

      {!enLinea && <AvisoPausaSinConexion />}

      <BarraInferior nota={t('notaCuadre')}>
        <button type="button" onClick={enviar} disabled={enviando || !enLinea} aria-busy={enviando} className={clasesBoton({ tamano: 'lg', anchoCompleto: true })}>
          <Send aria-hidden="true" className="size-5" strokeWidth={1.5} />
          {enviando ? tm('guardando') : t('enviar')}
        </button>
      </BarraInferior>
    </div>
  );
}

const TONO_CUADRE: Record<PasoCuadre, 'advertencia' | 'informacion' | 'exito' | 'peligro'> = {
  por_recibir: 'advertencia',
  recibiendo: 'informacion',
  cuadrado: 'exito',
  con_diferencia: 'peligro',
};

/** «Resumen enviado» (Figma «14»): lo que va a la caja y el estado de su cuadre de hoy. */
function ResumenEnviado({
  enviadoEn,
  zona,
  subtitulo,
  efectivo,
  sede,
  paso,
  cuadre,
}: {
  enviadoEn: Date;
  zona: string;
  subtitulo: string;
  efectivo: number;
  sede: string | null;
  paso: PasoCuadre | null;
  cuadre: CuadreJornada | null;
}) {
  const t = useTranslations('logistica.misEnvios.finJornada');
  const tm = useTranslations('logistica.misEnvios');
  const locale = useLocaleIntl();
  const moneda = useMonedaOrganizacion();
  const hora = (d: Date) => new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: zona }).format(d);
  const cerrado = paso === 'cuadrado' || paso === 'con_diferencia';
  const pasos: Array<{ clave: 'enviado' | 'recibido' | 'cerrado'; hecho: boolean; hora: string | null }> = [
    { clave: 'enviado', hecho: true, hora: hora(enviadoEn) },
    { clave: 'recibido', hecho: cerrado, hora: cerrado && cuadre?.closed_at ? hora(new Date(cuadre.closed_at)) : null },
    { clave: 'cerrado', hecho: cerrado, hora: cerrado && cuadre?.closed_at ? hora(new Date(cuadre.closed_at)) : null },
  ];
  const actual = pasos.findIndex((p) => !p.hecho);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col px-4 pt-4 pb-28 sm:pt-6 gap-4">
      <PageHeader
        titulo={t('enviado.cabecera')}
        subtitulo={subtitulo}
        variante="form"
        migas={[{ etiqueta: tm('titulo'), href: RUTA_MIS_ENVIOS }]}
        volverA={RUTA_MIS_ENVIOS}
      />

      <section role="status" className="flex flex-col items-center gap-2 py-4 text-center">
        <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-full bg-success-subtle text-success-text">
          <CheckCircle2 className="size-7" strokeWidth={1.5} />
        </span>
        <h2 className="text-xl font-semibold text-fg">{t('enviado.tituloHora', { hora: hora(enviadoEn) })}</h2>
        <p className="text-sm text-fg-secondary">{t('enviado.fueraDeTurno')}</p>
      </section>

      <section className="flex flex-col gap-1 rounded-xl border border-line-warning bg-warning-subtle p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
            <Banknote aria-hidden="true" className="size-5" strokeWidth={1.5} />
            {t('entregaEnCaja')}
          </h2>
          <span className="text-xl font-semibold text-fg">{moneda.formatear(efectivo)}</span>
        </div>
        <p className="text-sm text-fg-secondary">{sede ? t('enviado.entregaloEn', { sede }) : t('enviado.entregalo')}</p>
      </section>

      <Bloque
        titulo={t('enviado.tuCuadre')}
        accion={paso ? <StatusBadge estado={paso} etiqueta={t(`enviado.estadosCuadre.${paso}`)} tono={TONO_CUADRE[paso]} apariencia="contorno" /> : null}
      >
        <ol className="flex flex-col gap-3">
          {pasos.map((p, i) => (
            <li key={p.clave} className="flex items-center gap-3 text-sm">
              {p.hecho ? (
                <CheckCircle2 aria-hidden="true" className="size-6 text-success" strokeWidth={1.5} />
              ) : i === actual ? (
                <Clock aria-hidden="true" className="size-6 text-brand" strokeWidth={1.5} />
              ) : (
                <Circle aria-hidden="true" className="size-6 text-fg-muted" strokeWidth={1.5} />
              )}
              <span className={i === actual ? 'font-medium text-brand' : p.hecho ? 'text-fg' : 'text-fg-muted'}>{t(`enviado.pasos.${p.clave}`)}</span>
              <span className="text-fg-muted">{p.hora ?? '—'}</span>
            </li>
          ))}
        </ol>
      </Bloque>

      <p className="flex items-start gap-3 rounded-xl border border-line bg-subtle p-4 text-sm text-fg-secondary">
        <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} />
        {t('enviado.descripcion')}
      </p>

      <BarraInferior>
        <Link href={RUTA_MIS_ENVIOS} className={clasesBoton({ variante: 'secundario', tamano: 'lg', anchoCompleto: true })}>
          {t('enviado.volver')}
        </Link>
      </BarraInferior>
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
