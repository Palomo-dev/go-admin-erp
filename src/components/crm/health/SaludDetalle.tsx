'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { CircleCheck, ExternalLink, GitBranch, Phone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/kit/PageHeader';
import { EmptyState } from '@/components/kit/EmptyState';
import { clasesBoton } from '@/components/kit/botonClases';
import { nombreUsuario } from '@/components/crm/acciones/catalogosCrmLogica';
import { useCatalogosCrm } from '@/components/crm/acciones/useCatalogosCrm';
import { rutaSeccion } from '@/components/configuracion/config/configSectionsRegistry';
import { abrirConfiguracion } from '@/components/configuracion/dialogo/abrirConfiguracion';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateInTz, toPlainDate } from '@/lib/utils/dateDisplay';
import { logError } from '@/lib/utils/errorMessage';
import { DEFAULT_BANDS, bandForScore, type HealthBandsJson } from '@/lib/services/crm/healthBands';
import { healthScoreService, type HealthScoreResult, type HealthSnapshot, type ScoreHace, type SenalesCliente } from '@/lib/services/crm/healthScoreService';
import { cn } from '@/utils/Utils';
import { AnilloPuntaje } from './AnilloPuntaje';
import { BAND_STYLES } from './healthBandStyles';
import { BarrasSemanas } from './SaludResumen';
import { AccionSaludAbierta, type AccionSaludPendiente } from './AccionSaludAbierta';
import {
  cambiosDeBanda,
  factoresDetalle,
  lunesDe,
  motivosSalud,
  nombreVisible,
  resumenTendencia,
  semanasDeSnapshots,
  senalesRecientes,
  TONO_BANDA,
  tonoFactor,
  unidadDeClave,
  type AccionSalud,
  type FactorDetalle,
} from './saludLogica';
import { useTextosSalud } from './useTextosSalud';

/**
 * /app/crm/salud/[customerId] — «Detalle — factores, tendencia y acciones»
 * (Figma 1424:17, anotación 1424:931). Datos: `fn_customer_health` del
 * cliente + config (el reparto de puntos sale de `scoreFromConfig`, la misma
 * función que da el puntaje: la UI no recalcula), snapshots (serie de 12
 * semanas y «hace 30 días») y las señales de facturas y cartera. Las
 * acciones son las acciones rápidas existentes del CRM.
 */
const TARJETA = 'rounded-xl border border-line bg-surface p-4';

interface DatosDetalle {
  resultado: HealthScoreResult | null;
  historial: HealthSnapshot[];
  hace: ScoreHace | null;
  senales: SenalesCliente | null;
  bandas: HealthBandsJson;
}

export function SaludDetalle({ customerId }: { customerId: string }) {
  const { t, formatear } = useTextosSalud();
  const idioma = useLocale();
  const router = useRouter();
  const { organization } = useOrganization();
  const orgId = organization?.id ?? 0;
  const { timezone } = useFormatDate();
  const cat = useCatalogosCrm();
  const [datos, setDatos] = useState<DatosDetalle | null>(null);
  const [pendiente, setPendiente] = useState<AccionSaludPendiente | null>(null);

  const cargar = useCallback(async () => {
    if (!orgId) return;
    const [resultado, historial, hace, senales, config] = await Promise.allSettled([
      healthScoreService.getCustomerHealthScore(customerId, orgId),
      healthScoreService.getHistorialReciente(customerId, 3, orgId),
      healthScoreService.getScoresHace(30, customerId, orgId),
      healthScoreService.getSenalesCliente(customerId, orgId),
      healthScoreService.getConfigSalud(),
    ]);
    for (const r of [historial, hace, senales, config]) if (r.status === 'rejected') logError('[Salud] detalle', r.reason);
    setDatos({
      resultado: resultado.status === 'fulfilled' ? resultado.value : null,
      historial: historial.status === 'fulfilled' ? historial.value : [],
      hace: hace.status === 'fulfilled' ? hace.value.get(customerId) ?? null : null,
      senales: senales.status === 'fulfilled' ? senales.value : null,
      // Sin config guardada, la banda la da la RPC (umbrales por defecto).
      bandas: config.status === 'fulfilled' && config.value.guardada ? config.value.config.bands : DEFAULT_BANDS,
    });
  }, [customerId, orgId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const r = datos?.resultado ?? null;
  const historial = datos?.historial;
  const tendencia = useMemo(
    () => resumenTendencia(semanasDeSnapshots(historial ?? [], (iso) => lunesDe(toPlainDate(new Date(iso), timezone)))),
    [historial, timezone],
  );
  const senales = useMemo(() => senalesRecientes(historial ?? [], datos?.senales ?? null), [historial, datos?.senales]);
  const fechaCorta = (iso: string) => formatDateInTz(iso, timezone, { locale: idioma, day: '2-digit', month: '2-digit' });
  const n = (x: number) => new Intl.NumberFormat(idioma).format(x);
  const migas = [{ etiqueta: t('migas.crm'), href: '/app/crm' }, { etiqueta: t('migas.salud'), href: '/app/crm/salud' }];

  if (!datos) {
    return (
      <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:p-6">
        <PageHeader titulo={t('detalle.titulo')} icono={CircleCheck} migas={migas} volverA="/app/crm/salud" variante="detail" cargando />
        <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)_300px]" aria-busy="true">
          <Skeleton className="h-[408px] rounded-xl" />
          <Skeleton className="h-[456px] rounded-xl" />
          <Skeleton className="h-[530px] rounded-xl" />
        </div>
      </div>
    );
  }

  if (!r) {
    return (
      <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:p-6">
        <PageHeader titulo={t('detalle.titulo')} icono={CircleCheck} migas={migas} volverA="/app/crm/salud" variante="detail" />
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            variante="empty"
            icono={CircleCheck}
            titulo={t('detalle.noEncontrado.titulo')}
            descripcion={t('detalle.noEncontrado.descripcion')}
            accion={{ etiqueta: t('detalle.abrirFicha'), href: `/app/clientes/${customerId}`, icono: ExternalLink }}
            accionSecundaria={{ etiqueta: t('detalle.volver'), href: '/app/crm/salud' }}
          />
        </div>
      </div>
    );
  }

  const { nombre } = nombreVisible(r);
  const responsable = nombreUsuario(cat.usuarios, r.cliente?.owner_id);
  const factores = factoresDetalle(r);
  const desde = cambiosDeBanda(historial ?? []).find((c) => c.banda === r.band) ?? null;
  const bandaMin = t(`bandaLarga.${r.band}`).toLowerCase();
  const subtitulo = [
    t('detalle.subtituloSalud', { score: r.score }),
    desde ? t('detalle.subtituloDesde', { banda: bandaMin, fecha: fechaCorta(desde.fecha) }) : bandaMin,
    responsable ? t('detalle.subtituloResponsable', { nombre: responsable }) : t('tabla.sinResponsable').toLowerCase(),
  ].join(' · ');
  const motivos = motivosSalud(r);
  const dominante = motivos[0]?.factor;
  const hayCartera = (Number(r.raw?.overdue_balance) || 0) > 0;
  const abrir = (accion: AccionSalud) => setPendiente({ accion, clienteId: customerId, nombre, cliente: r.cliente, clave: Date.now() });

  const valorFactor = (f: Pick<FactorDetalle, 'key' | 'factor' | 'valor'>): string => {
    if (f.valor < 0) return t('detalle.factores.sinDatos');
    const unidad = unidadDeClave(f.key);
    if (f.factor === 'cartera' && r.raw) return t('detalle.valor.cartera', { importe: formatear(r.raw.overdue_balance), pct: n(Math.round((r.raw.overdue_ratio || 0) * 100)) });
    if (unidad === 'dias') return t('detalle.valor.dias', { n: Math.round(f.valor) });
    if (unidad === 'dinero') return formatear(f.valor);
    if (unidad === 'porcentaje') return t('detalle.valor.porcentaje', { pct: n(Math.round(f.valor * 100)) });
    return f.factor === 'frecuencia' ? t('detalle.valor.facturas', { n: f.valor }) : n(f.valor);
  };
  const etiquetaFactor = (key: string, etiqueta: string) => (t.has(`factor.${key}`) ? t(`factor.${key}`) : etiqueta);

  const acciones: { id: AccionSalud; titulo: string; detalle: string }[] = [
    {
      id: 'tarea',
      titulo: dominante === 'compras' ? t('detalle.acciones.tareaPausa') : dominante === 'actividad' ? t('detalle.acciones.tareaRetomar') : t('detalle.acciones.tareaSeguimiento'),
      detalle: t('detalle.acciones.tareaHoy'),
    },
    ...(hayCartera ? [{ id: 'cobro' as const, titulo: t('detalle.acciones.cobroTitulo'), detalle: t('detalle.acciones.cobroDetalle') }] : []),
    { id: 'secuencia', titulo: t('detalle.acciones.secuenciaTitulo'), detalle: t('detalle.acciones.secuenciaDetalle') },
  ];

  return (
    <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:p-6">
      <PageHeader
        titulo={nombre}
        subtitulo={subtitulo}
        icono={CircleCheck}
        migas={migas}
        volverA="/app/crm/salud"
        variante="detail"
        acciones={
          <>
            <Link href={`/app/clientes/${customerId}`} className={clasesBoton({ variante: 'secundario' })}>
              <ExternalLink aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('detalle.abrirFicha')}
            </Link>
            <button type="button" onClick={() => abrir('llamar')} className={clasesBoton()}>
              <Phone aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('accionCorta.llamar')}
            </button>
            <button type="button" onClick={() => abrir('secuencia')} aria-label={t('accion.secuencia')} title={t('accion.secuencia')} className={clasesBoton({ variante: 'secundario', className: 'size-10 px-0' })}>
              <GitBranch aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
          </>
        }
        movil={{
          menu: [
            { id: 'llamar', etiqueta: t('accionCorta.llamar'), icono: Phone, onSelect: () => abrir('llamar') },
            { id: 'secuencia', etiqueta: t('accion.secuencia'), icono: GitBranch, onSelect: () => abrir('secuencia') },
            { id: 'ficha', etiqueta: t('detalle.abrirFicha'), icono: ExternalLink, onSelect: () => router.push(`/app/clientes/${customerId}`) },
          ],
        }}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[360px_minmax(0,1fr)_300px]">
        {/* Puntaje (1424:806) */}
        <section className={cn(TARJETA, 'flex flex-col items-center gap-2 pt-5 text-center')} aria-label={t('tabla.puntaje')}>
          <AnilloPuntaje score={r.score} band={r.band} tamano={140} />
          <p className="mt-2 text-[28px] font-semibold leading-9 tabular-nums text-fg">{t('detalle.puntaje', { score: r.score })}</p>
          <Badge tono={TONO_BANDA[r.band]} tamano="sm">{t(`bandaLarga.${r.band}`)}</Badge>
          <p className="text-xs text-fg-secondary">
            {datos.hace ? t('detalle.hace30', { score: datos.hace.score, banda: t(`bandaMin.${bandForScore(datos.hace.score, datos.bandas)}`) }) : t('detalle.hace30Sin')}{' '}
            {t('detalle.umbrales', { org: organization?.name ?? '', verde: datos.bandas.green, rojo: datos.bandas.yellow })}
          </p>
          <figure className="mt-2 flex w-full flex-col items-center gap-2">
            {tendencia ? (
              <BarrasSemanas barras={tendencia.barras} bandas={datos.bandas} color="banda" alto={60} ancho={20} etiqueta={t('detalle.ultimas')} />
            ) : (
              <p className="text-xs text-fg-muted">{t('detalle.sinTendencia')}</p>
            )}
            <figcaption className="text-xs text-fg-secondary">{t('detalle.ultimas')}</figcaption>
          </figure>
        </section>

        {/* Qué explica el puntaje (1424:837) */}
        <section className={cn(TARJETA, 'flex flex-col gap-3')} aria-labelledby="salud-factores">
          <h2 id="salud-factores" className="text-base font-semibold text-fg">{t('detalle.factores.titulo')}</h2>
          {factores ? (
            <ul className="flex flex-col gap-3">
              {factores.map((f) => {
                const etiqueta = etiquetaFactor(f.key, f.etiqueta);
                return (
                  <li key={f.key} className="flex flex-col gap-1.5 rounded-lg border border-line p-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium text-fg">{etiqueta}</span>
                      <span className="shrink-0 text-[13px] tabular-nums text-fg-secondary">{valorFactor(f)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div role="progressbar" aria-label={etiqueta} aria-valuemin={0} aria-valuemax={f.maximo} aria-valuenow={f.puntos} className="h-2 flex-1 overflow-hidden rounded-full bg-subtle">
                        <div className={cn('h-full rounded-full', BAND_STYLES[tonoFactor(f.puntos, f.maximo)].bar)} style={{ width: `${f.maximo > 0 ? Math.max(1, (f.puntos * 100) / f.maximo) : 0}%` }} />
                      </div>
                      <span className="w-[130px] shrink-0 text-xs tabular-nums text-fg-secondary">{t('detalle.factores.puntos', { puntos: f.puntos, maximo: f.maximo, peso: f.peso })}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <>
              <ul className="flex flex-col gap-3">
                {r.indicators.map((i) => (
                  <li key={i.key} className="flex items-baseline justify-between gap-3 rounded-lg border border-line p-3 text-sm">
                    <span className="font-medium text-fg">{etiquetaFactor(i.key, i.label)}</span>
                    <span className="text-[13px] tabular-nums text-fg-secondary">{valorFactor({ key: i.key, factor: null, valor: i.value })}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-fg-secondary">
                {t('detalle.factores.sinConfig')}{' '}
                <Link
                  href={rutaSeccion('crm.salud')}
                  onClick={(e) => {
                    // Como `AtajoConfigurar`: abre el diálogo sobre el detalle; con modificadores, el enlace estable.
                    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                    e.preventDefault();
                    abrirConfiguracion({ seccionId: 'crm.salud' });
                  }}
                  className="font-medium text-link hover:underline"
                >
                  {t('factores')}
                </Link>
              </p>
            </>
          )}
        </section>

        <div className="flex flex-col gap-4">
          {/* Qué hacer (1424:880) */}
          <section className={cn(TARJETA, 'flex flex-col gap-3')} aria-labelledby="salud-acciones">
            <h2 id="salud-acciones" className="text-base font-semibold text-fg">{t('detalle.acciones.titulo')}</h2>
            {acciones.map((a) => (
              <div key={a.id} className="flex flex-col items-start gap-1 rounded-lg bg-subtle p-3">
                <p className="text-sm font-medium text-fg">{a.titulo}</p>
                <p className="text-xs text-fg-secondary">{a.detalle}</p>
                <button type="button" onClick={() => abrir(a.id)} aria-label={`${t('detalle.acciones.hacerlo')}: ${a.titulo}`} className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'mt-2' })}>
                  {t('detalle.acciones.hacerlo')}
                </button>
              </div>
            ))}
          </section>

          {/* Señales recientes (1424:926) */}
          <section className={cn(TARJETA, 'flex flex-col gap-2')} aria-labelledby="salud-senales">
            <h2 id="salud-senales" className="text-base font-semibold text-fg">{t('detalle.senales.titulo')}</h2>
            {senales.length === 0 ? (
              <p className="text-xs text-fg-secondary">{t('detalle.senales.ninguna')}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {senales.map((s, i) => {
                  const fecha = fechaCorta(s.fecha);
                  const texto =
                    s.tipo === 'banda'
                      ? t('detalle.senales.banda', { fecha, banda: t(`bandaColor.${s.banda}`) })
                      : s.tipo === 'vencida'
                        ? s.dias !== null
                          ? t('detalle.senales.vencida', { fecha, dias: s.dias })
                          : t('detalle.senales.vencidaImporte', { fecha, importe: formatear(s.saldo) })
                        : t('detalle.senales.compra', { fecha, importe: formatear(s.total) });
                  return <li key={`${s.tipo}-${i}`} className="text-xs text-fg-secondary">{texto}</li>;
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      <AccionSaludAbierta pendiente={pendiente} onCerrado={() => setPendiente(null)} />
    </div>
  );
}
