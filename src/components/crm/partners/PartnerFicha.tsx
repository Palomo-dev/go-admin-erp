'use client';

/**
 * Ficha del partner (Figma 1316:776081, anotación 1316:776994; móvil
 * 1438:1908). Nivel actual con sus beneficios, camino al siguiente con los DOS
 * umbrales de la promoción, cifras, y pestañas Deals · Comisiones · Datos del
 * partner. Las acciones de comisión siguen la máquina
 * `pending → approved → paid | rejected` y el servidor exige admin/manager.
 * Datos: GET /api/crm/partners, /tiers y /[id]/deals.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Briefcase, CircleCheck, Crown, Pencil, Plus } from 'lucide-react';
import { PageHeader } from '@/components/kit/PageHeader';
import { TabBar } from '@/components/kit/TabBar';
import { EmptyState } from '@/components/kit/EmptyState';
import { BarraProgreso } from '@/components/kit/BarraProgreso';
import { KpiCompacto } from '@/components/kit/KpiCompacto';
import { FilaDato, ListaDatos } from '@/components/kit/FilaDato';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { clasesBoton } from '@/components/kit/botonClases';
import { useOpcionUrl } from '@/components/kit/useParametroUrl';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoney, formatRate } from '@/lib/services/crm/partnerModel';
import { DealsTabla } from './DealsTabla';
import { RegisterDealDialog } from './RegisterDealDialog';
import { PartnerEditor } from './PartnerEditor';
import { usePartners } from './usePartners';
import { beneficiosNivel, caminoSiguienteNivel, cifrasFicha, fuenteTasa, monedaDeals, montoCompacto, PESTANAS_FICHA, tonoNivel, type DealFila, type PestanaFicha } from './redPartnersLogica';

const RUTA = '/app/crm/partners';

export function PartnerFicha({ partnerId }: { partnerId: string }) {
  const t = useTranslations('crm.redPartners');
  const idioma = useLocale();
  const { formatDate } = useFormatDate();
  const monedaOrg = useMonedaOrganizacion();
  const d = usePartners({ dealsDe: partnerId });
  const [pestanaUrl, setPestana] = useOpcionUrl<PestanaFicha>('pestana', PESTANAS_FICHA, 'deals');
  const [registrar, setRegistrar] = useState(false);
  const [editar, setEditar] = useState(false);

  const partner = d.partners.find((p) => p.id === partnerId) ?? null;
  const tier = partner?.tier_id ? d.tiers.find((x) => x.id === partner.tier_id) ?? null : null;
  const deals = d.deals as unknown as DealFila[];
  const cifras = useMemo(() => cifrasFicha(deals), [deals]);
  const camino = useMemo(() => caminoSiguienteNivel(deals, d.tiers, partner?.tier_id), [deals, d.tiers, partner?.tier_id]);
  const { moneda } = monedaDeals(deals, monedaOrg.code);
  const pestana: PestanaFicha = pestanaUrl === 'comisiones' && !d.canManage ? 'deals' : pestanaUrl;
  const conComision = useMemo(() => deals.filter((x) => x.commission_status !== 'rejected'), [deals]);

  const migas = [{ etiqueta: t('migas.crm'), href: '/app/crm' }, { etiqueta: t('titulo'), href: RUTA }, { etiqueta: partner?.name ?? t('ficha.cargando') }];

  if (d.error && !d.cargado) {
    return (
      <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:p-6">
        <PageHeader titulo={t('titulo')} migas={migas} variante="detail" volverA={RUTA} />
        <div className="rounded-xl border border-line bg-surface">
          {d.error.status === 403 ? (
            <EmptyState variante="forbidden" titulo={t('estados.sinPermiso.titulo')} descripcion={t('estados.sinPermiso.descripcion')} accion={{ etiqueta: t('ficha.volver'), href: RUTA }} />
          ) : (
            <EmptyState variante="error" titulo={t('ficha.error')} descripcion={t('estados.error.descripcion')} onReintentar={() => void d.recargar()} />
          )}
        </div>
      </div>
    );
  }

  if (!d.cargando && d.cargado && !partner) {
    return (
      <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:p-6">
        <PageHeader titulo={t('titulo')} migas={migas} variante="detail" volverA={RUTA} />
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState variante="search" titulo={t('ficha.noEncontrado')} descripcion={t('ficha.noEncontradoDescripcion')} accion={{ etiqueta: t('ficha.volver'), href: RUTA }} />
        </div>
      </div>
    );
  }

  const subtitulo = partner ? [partner.company_name, partner.email, partner.phone].filter(Boolean).join(' · ') : undefined;
  const fuente = partner ? fuenteTasa(partner) : 'sinNivel';
  const dinero = (v: number) => formatMoney(v, moneda);
  const entero = (n: number) => new Intl.NumberFormat(idioma).format(n);
  const estadoTabla = d.cargando && !d.cargado ? 'cargando' : 'listo';

  return (
    <div className="flex min-h-full flex-col gap-5 bg-canvas p-4 lg:p-6">
      <PageHeader
        titulo={partner?.name ?? t('ficha.cargando')}
        subtitulo={subtitulo}
        migas={migas}
        variante="detail"
        volverA={RUTA}
        cargando={d.cargando}
        acciones={
          partner && (
            <>
              {d.canManage && (
                <button type="button" onClick={() => setEditar(true)} className={clasesBoton({ variante: 'secundario' })}>
                  <Pencil aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('ficha.editar')}
                </button>
              )}
              {partner.is_active && (
                <button type="button" onClick={() => setRegistrar(true)} className={clasesBoton()}>
                  <Briefcase aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('acciones.registrarDeal')}
                </button>
              )}
            </>
          )
        }
        movil={{
          titulo: partner?.name ?? t('titulo'),
          subtitulo: partner ? [partner.company_name, partner.tier?.name ?? t('nivel.sinNivel')].filter(Boolean).join(' · ') : undefined,
          accion:
            partner?.is_active ? (
              <button type="button" onClick={() => setRegistrar(true)} aria-label={t('acciones.registrarDeal')} className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover">
                <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
              </button>
            ) : undefined,
        }}
      />

      {/* Nivel y camino (escritorio) */}
      <div className="hidden gap-4 lg:grid lg:grid-cols-2">
        <section aria-labelledby="ficha-nivel" className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
          {d.cargando && !partner ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <div className="flex items-center gap-4">
                <div aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-full bg-warning-subtle text-warning-text">
                  <Crown className="size-7" strokeWidth={1.5} />
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <h2 id="ficha-nivel" className="text-base font-semibold text-fg">
                    {tier ? t('ficha.nivel', { nivel: tier.name }) : t('nivel.sinNivel')}
                  </h2>
                  <p className="text-[13px] text-fg-secondary">
                    {tier
                      ? t('ficha.nivelDetalle', { tasa: formatRate(partner?.effective_rate), deals: entero(Number(tier.min_deals)), monto: dinero(Number(tier.min_revenue)) })
                      : t('ficha.sinNivelDetalle', { tasa: formatRate(partner?.effective_rate) })}
                    {fuente === 'propia' && ` · ${t('tasa.propia')}`}
                  </p>
                </div>
              </div>
              {tier && beneficiosNivel(tier.benefits).length > 0 && (
                <ul className="flex flex-col gap-2" aria-label={t('ficha.beneficios')}>
                  {beneficiosNivel(tier.benefits).map((b) => (
                    <li key={b} className="flex items-center gap-2 text-[13px] text-fg">
                      <CircleCheck aria-hidden="true" className="size-4 shrink-0 text-success-text" strokeWidth={1.5} />
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <section aria-labelledby="ficha-camino" className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
          {d.cargando && !partner ? (
            <Skeleton className="h-24 w-full" />
          ) : camino ? (
            <>
              <h2 id="ficha-camino" className="text-base font-semibold text-fg">
                {t('ficha.camino', { nivel: camino.siguiente.name, tasa: formatRate(camino.siguiente.commission_rate) })}
              </h2>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-fg-secondary">{t('ficha.dealsNoRechazados')}</span>
                  <span className="tabular-nums text-fg">{t('ficha.deDe', { actual: entero(camino.deals.actual), meta: entero(camino.deals.meta) })}</span>
                </div>
                <BarraProgreso valor={Math.min(camino.deals.actual, camino.deals.meta)} max={Math.max(camino.deals.meta, 1)} etiqueta={t('ficha.dealsNoRechazados')} tamano="sm" />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-fg-secondary">{t('ficha.revenueAtribuido')}</span>
                  <span className="tabular-nums text-fg">{t('ficha.deDe', { actual: dinero(camino.revenue.actual), meta: dinero(camino.revenue.meta) })}</span>
                </div>
                <BarraProgreso valor={Math.min(camino.revenue.actual, camino.revenue.meta)} max={Math.max(camino.revenue.meta, 1)} etiqueta={t('ficha.revenueAtribuido')} tono="advertencia" tamano="sm" />
              </div>
              <p className="text-xs text-fg-secondary">{t('ficha.caminoNota')}</p>
            </>
          ) : (
            <>
              <h2 id="ficha-camino" className="text-base font-semibold text-fg">{t('ficha.nivelMaximo')}</h2>
              <p className="text-[13px] text-fg-secondary">{d.tiers.length ? t('ficha.nivelMaximoDetalle') : t('ficha.sinNiveles')}</p>
            </>
          )}
        </section>
      </div>

      {/* Cifras */}
      <dl className="hidden gap-4 lg:grid lg:grid-cols-4">
        <Cifra etiqueta={t('ficha.cifras.deals')} valor={entero(cifras.deals)} />
        <Cifra etiqueta={t('ficha.cifras.revenue')} valor={dinero(cifras.revenue)} />
        {d.canManage && <Cifra etiqueta={t('ficha.cifras.porPagar')} valor={dinero(cifras.porPagar)} tono="text-warning-text" />}
        {d.canManage && <Cifra etiqueta={t('ficha.cifras.pagada')} valor={dinero(cifras.pagada)} tono="text-success-text" />}
      </dl>
      <KpiCompacto
        className="lg:hidden"
        etiqueta={t('ficha.cifras.grupo')}
        cargando={d.cargando && !d.cargado}
        cifras={[
          { id: 'deals', etiqueta: t('ficha.cifras.dealsCorto'), valor: entero(cifras.deals) },
          { id: 'revenue', etiqueta: t('ficha.cifras.atribuido'), valor: montoCompacto(cifras.revenue, moneda, idioma) },
          ...(d.canManage ? [{ id: 'porPagar', etiqueta: t('ficha.cifras.porPagarCorto'), valor: montoCompacto(cifras.porPagar, moneda, idioma) }] : []),
        ]}
      />

      <TabBar<PestanaFicha>
        id="ficha-partner"
        className="hidden lg:flex"
        etiqueta={t('ficha.pestanas')}
        valor={pestana}
        onValorChange={setPestana}
        pestanas={[
          { valor: 'deals', etiqueta: t('ficha.tabs.deals'), contador: deals.length },
          ...(d.canManage ? [{ valor: 'comisiones' as const, etiqueta: t('ficha.tabs.comisiones'), contador: cifras.comisiones }] : []),
          { valor: 'datos', etiqueta: t('ficha.tabs.datos') },
        ]}
      />
      <h2 className="text-sm font-semibold text-fg lg:hidden">{t('movil.dealsRegistrados')}</h2>

      {pestana === 'datos' && partner ? (
        <section className="rounded-xl border border-line bg-surface p-5">
          <ListaDatos etiqueta={t('ficha.tabs.datos')} divisores>
            <FilaDato etiqueta={t('datos.nombre')} valor={partner.name} />
            <FilaDato etiqueta={t('datos.empresa')} valor={partner.company_name || '—'} />
            <FilaDato etiqueta={t('datos.correo')} valor={partner.email} />
            <FilaDato etiqueta={t('datos.telefono')} valor={partner.phone || '—'} />
            <FilaDato
              etiqueta={t('datos.nivel')}
              valor={<Badge tono={tonoNivel(partner.tier_id, d.tiers)} tamano="sm">{partner.tier?.name ?? t('nivel.sinNivel')}</Badge>}
            />
            <FilaDato etiqueta={t('datos.comision')} valor={`${formatRate(partner.effective_rate)} · ${t(`tasa.${fuente}`)}`} />
            <FilaDato etiqueta={t('datos.estado')} valor={<Badge tono={partner.is_active ? 'exito' : 'neutro'} tamano="sm">{partner.is_active ? t('estado.activo') : t('estado.inactivo')}</Badge>} />
            <FilaDato etiqueta={t('datos.registrado')} valor={formatDate(partner.created_at)} />
          </ListaDatos>
        </section>
      ) : (
        <DealsTabla
          deals={pestana === 'comisiones' ? conComision : deals}
          estado={estadoTabla}
          puedeGestionar={d.canManage}
          onTransicion={d.transitionDeal}
          onReintentar={() => void d.recargar()}
          vacio={{ titulo: t('ficha.sinDeals'), descripcion: t('ficha.sinDealsDescripcion') }}
        />
      )}

      {!partner?.is_active && partner && (
        <p className="text-[13px] text-fg-secondary">
          {t('ficha.inactivo')} <Link href={RUTA} className="text-brand underline-offset-2 hover:underline">{t('ficha.volver')}</Link>
        </p>
      )}

      <RegisterDealDialog abierto={registrar} partner={partner} puedeAjustar={d.canManage} onAbiertoChange={setRegistrar} onRegistrar={d.registerDeal} />
      <PartnerEditor abierto={editar} partner={partner} tiers={d.tiers} onAbiertoChange={setEditar} onGuardar={d.savePartner} />
    </div>
  );
}

function Cifra({ etiqueta, valor, tono }: { etiqueta: string; valor: string; tono?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-fg-secondary">{etiqueta}</dt>
      <dd className={`text-base tabular-nums ${tono ?? 'text-fg'}`}>{valor}</dd>
    </div>
  );
}

