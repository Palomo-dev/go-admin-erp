'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { Copy, Edit, Pause, Play, Tag, Trash2 } from 'lucide-react';
import { PageHeaderSkeleton, DetailSkeleton } from '@/components/common/PageSkeletons';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { PageHeader } from '@/components/kit/PageHeader';
import { Tarjeta } from '@/components/kit/Tarjeta';
import { FilaDato, ListaDatos } from '@/components/kit/FilaDato';
import { SettingGroup, SettingRow } from '@/components/kit/SettingRow';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { EmptyState } from '@/components/kit/EmptyState';
import { ConfirmDialog } from '@/components/kit/ConfirmDialog';
import { clasesBoton } from '@/components/kit/botonClases';
import type { AccionFila } from '@/components/kit/acciones';
import { RowActionsMenu } from '@/components/kit/RowActionsMenu';
import { localeIntl } from '@/components/kit/idioma';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { PromotionsService } from '@/components/pos/promociones/promotionsService';
import { usePuedeGestionarPromociones } from '@/components/pos/promociones/usePuedeGestionarPromociones';
import { PromocionFormulario } from '@/components/pos/promociones/formulario/PromocionFormulario';
import { VistaPreviaCliente } from '@/components/pos/promociones/formulario/VistaPreviaCliente';
import { diaEnPalabras, textoEnPalabras } from '@/components/pos/promociones/formulario/textoEnPalabras';
import { KpiStrip } from '@/components/kit/KpiStrip';
import { StatCard } from '@/components/kit/StatCard';
import { normalizarEscalones } from '@/lib/promotions/precioVolumen';
import { Promotion } from '@/components/pos/promociones/types';
import { cantidadMinimaEfectiva } from '@/lib/promotions/cantidadMinima';
import { diasDelIdioma } from '@/components/pos/promociones/diasPromocion';
import { estadoDePromocion } from '@/components/pos/promociones/estadoPromocion';
import { lineasHorario, textoDesfase } from '@/components/pos/promociones/horario/textoHorario';
import { VistaSemanaPromocion } from '@/components/pos/promociones/horario/VistaSemanaPromocion';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateInTz } from '@/lib/utils/dateDisplay';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { toast } from 'sonner';
import { useMigaVentas } from '@/components/pos/useMigaVentas';
import { plainDayOfInstant } from '@/lib/services/businessInstant';
import {
  cargarEstadisticasPromocion,
  limitesMesActual,
  type EstadisticasPromocion,
  type VentaRecientePromocion,
} from '@/components/pos/promociones/estadisticasPromociones';

/** Día de la organización de un timestamptz (o el día tal cual si ya viene así). */
function plainDayOfInstantSeguro(valor: string, timezone: string): string {
  return valor.length <= 10 ? valor : plainDayOfInstant(valor, timezone);
}

function textoPlano(valor: string): string {
  return valor.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}

export default function PromocionDetallePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { organization, isLoading: orgLoading } = useOrganization();
  const puedeGestionar = usePuedeGestionarPromociones(organization?.id);
  const { formatear } = useMonedaOrganizacion();
  const t = useTranslations('posPromociones');
  const migaVentas = useMigaVentas();
  const locale = useLocale();
  const diasSemana = diasDelIdioma(locale);
  const { timezone } = useOrgTimezone();

  const promotionId = params?.id as string;
  const isEditMode = searchParams?.get('edit') === 'true';

  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [segmentoNombre, setSegmentoNombre] = useState<string | null>(null);
  // Cifras de sale_promotions (Figma 3003:193974). null = cargando o sin datos: el resto de la página no espera.
  const [estadisticas, setEstadisticas] = useState<EstadisticasPromocion | null>(null);

  useEffect(() => {
    const id = promotion?.customer_segment_id;
    if (!id) {
      setSegmentoNombre(null);
      return;
    }
    PromotionsService.getSegmentos()
      .then((lista) => setSegmentoNombre(lista.find((s) => s.id === id)?.name ?? null))
      .catch(() => setSegmentoNombre(null));
  }, [promotion?.customer_segment_id]);

  useEffect(() => {
    if (!promotionId || !timezone) return;
    let vigente = true;
    cargarEstadisticasPromocion(promotionId, timezone)
      .then((e) => { if (vigente) setEstadisticas(e); })
      .catch((error: unknown) => {
        console.warn('[promociones] No se pudieron cargar las cifras de la promoción:', error);
        if (vigente) setEstadisticas(null);
      });
    return () => { vigente = false; };
  }, [promotionId, timezone]);

  const loadPromotion = useCallback(async () => {
    if (!promotionId) return;

    setLoading(true);
    try {
      const data = await PromotionsService.getById(promotionId);
      setPromotion(data);
    } catch (error: unknown) {
      console.error('Error loading promotion:', error);
      toast.error(t('detalle.errorCargar'));
    } finally {
      setLoading(false);
    }
  }, [promotionId, t]);

  useEffect(() => {
    loadPromotion();
  }, [loadPromotion]);

  const handleDelete = async () => {
    setEliminando(true);
    try {
      await PromotionsService.delete(promotionId);
      toast.success(t('detalle.eliminada'));
      router.push('/app/pos/promociones');
    } catch (error: unknown) {
      toast.error((error as { message?: string } | null)?.message || t('detalle.errorEliminar'));
      setEliminando(false);
    }
  };

  const handleDuplicate = async () => {
    try {
      await PromotionsService.duplicate(promotionId);
      toast.success(t('detalle.duplicada'));
      router.push('/app/pos/promociones');
    } catch (error: unknown) {
      toast.error((error as { message?: string } | null)?.message || t('detalle.errorDuplicar'));
    }
  };

  const handleToggleActive = async () => {
    if (!promotion) return;
    setToggling(true);
    try {
      await PromotionsService.toggleActive(promotionId);
      toast.success(promotion.is_active ? t('detalle.desactivada') : t('detalle.activada'));
      loadPromotion();
    } catch (error: unknown) {
      toast.error((error as { message?: string } | null)?.message || t('detalle.errorEstado'));
    } finally {
      setToggling(false);
    }
  };

  const getDiscountDisplay = (promo: Promotion) => {
    switch (promo.promotion_type) {
      case 'percentage':
        return promo.repeat_every_quantity
          ? t('lista.cada', { valor: `${promo.discount_value}%`, n: promo.repeat_every_quantity })
          : `${promo.discount_value}%`;
      case 'fixed_amount':
        return promo.repeat_every_quantity
          ? t('lista.cada', { valor: formatear(promo.discount_value || 0), n: promo.repeat_every_quantity })
          : formatear(promo.discount_value || 0);
      case 'buy_x_get_y':
        return t('detalle.compraLleva', { x: promo.buy_quantity ?? 0, y: promo.get_quantity ?? 0 });
      case 'volume_tiers': {
        const primero = normalizarEscalones(promo.tiers ?? [])[0];
        if (!primero) return '-';
        return primero.precioUnidad !== null
          ? t('v2.lista.volumenPrecio', { n: primero.desde, precio: formatear(primero.precioUnidad) })
          : t('v2.lista.volumenPorcentaje', { n: primero.desde, pct: primero.porcentaje ?? 0 });
      }
      case 'bundle': {
        const base = (promo.bundle_price ?? 0) > 0
          ? formatear(promo.bundle_price || 0)
          : (promo.discount_value ?? 0) > 0
            ? `${promo.discount_value}%`
            : '-';
        return promo.repeat_every_quantity && base !== '-'
          ? t('lista.cada', { valor: base, n: promo.repeat_every_quantity })
          : base;
      }
      default:
        return '-';
    }
  };

  // Para timestamps reales (creada, actualizada): hora local del usuario.
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(localeIntl(locale), {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  // Fechas de vigencia: el servicio guarda el inicio a las 00:00 y el fin a las
  // 23:59:59.999 de la ZONA DE LA ORGANIZACIÓN. Pintarlas en UTC corría el fin
  // al día siguiente («hasta el 31» salía «1 de enero»). Se pintan en esa zona.
  const formatFechaVigencia = (dateString: string) =>
    formatDateInTz(dateString, timezone, { locale: localeIntl(locale), day: '2-digit', month: 'long', year: 'numeric' });

  if (orgLoading || loading) {
    return (
      <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 sm:p-6">
        <PageHeaderSkeleton />
        <DetailSkeleton />
      </div>
    );
  }

  if (!promotion) {
    return (
      <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 sm:p-6">
        <div className="w-full rounded-xl border border-line bg-surface">
          <EmptyState
            titulo={t('detalle.noEncontrada')}
            descripcion={t('detalle.noEncontradaAyuda')}
            icono={Tag}
            accion={{ etiqueta: t('detalle.volver'), href: '/app/pos/promociones' }}
          />
        </div>
      </div>
    );
  }

  const minimoUnidades = cantidadMinimaEfectiva(promotion);
  // Escalones con su rango (fila «precio normal» primero) y precio de ejemplo de la vista previa.
  const escalones = normalizarEscalones(promotion.tiers ?? []);
  const precioEjemplo = 10000;
  const nombreSegmento = segmentoNombre;
  // Cifras del mes (zona de la organización) desde sale_promotions.
  const mesActual = formatDateInTz(limitesMesActual(timezone).desde, timezone, { locale: localeIntl(locale), month: 'long' });
  const esVolumen = promotion.promotion_type === 'volume_tiers';
  const rangoEscalon = (desde: number): string => {
    const i = escalones.findIndex((e) => e.desde === desde);
    const siguiente = i >= 0 ? escalones[i + 1] : undefined;
    return siguiente
      ? t('v2.vista.rango', { desde, hasta: siguiente.desde - 1 })
      : t('v2.vista.oMasCorto', { n: desde });
  };
  const unidadesPorEscalon = estadisticas
    ? escalones
        .filter((e) => (estadisticas.porEscalon[String(e.desde)]?.unidades ?? 0) > 0)
        .map((e) => t('v2.estadisticas.enEscalon', {
          n: estadisticas.porEscalon[String(e.desde)].unidades,
          rango: rangoEscalon(e.desde),
        }))
        .join(' · ')
    : '';
  const unidadesEnEscalon = estadisticas
    ? Object.values(estadisticas.porEscalon).reduce((suma, x) => suma + x.unidades, 0)
    : null;
  const canalVenta = (v: VentaRecientePromocion): string =>
    v.canal === 'web'
      ? t('v2.estadisticas.canalWeb')
      : v.canal === 'mesa'
        ? t('v2.estadisticas.canalMesa', { sucursal: v.sucursal ?? '' }).trim()
        : t('v2.estadisticas.canalPos', { sucursal: v.sucursal ?? '' }).trim();
  const enPalabras = textoEnPalabras(
    {
      ...promotion,
      start_date: plainDayOfInstantSeguro(promotion.start_date, timezone),
      end_date: promotion.end_date ? plainDayOfInstantSeguro(promotion.end_date, timezone) : undefined,
    },
    promotion.tiers ?? [],
    {
      t,
      formatear,
      fecha: (dia) => diaEnPalabras(dia, localeIntl(locale)),
      nombresAlcance: (promotion.rules || [])
        .filter((r) => r.rule_type.startsWith('include'))
        .map((r) => r.product?.name ?? r.category?.name ?? r.brand ?? '')
        .filter(Boolean),
      sucursales: [],
      segmento: nombreSegmento,
      unir: (xs) => new Intl.ListFormat(localeIntl(locale), { style: 'long', type: 'conjunction' }).format([...xs]),
    },
  );

  if (isEditMode) {
    return (
      <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 sm:p-6">
        <div className="flex w-full flex-col gap-4">
          <PageHeader
            variante="form"
            titulo={promotion.name}
            subtitulo={t('detalle.editar')}
            volverA={`/app/pos/promociones/${promotionId}`}
            migas={[
              migaVentas,
              { etiqueta: t('pantalla.titulo'), href: '/app/pos/promociones' },
              { etiqueta: promotion.name, href: `/app/pos/promociones/${promotionId}` },
              { etiqueta: t('detalle.editar') },
            ]}
          />
          <PromocionFormulario
            promotionId={promotionId}
            nombresProductos={Object.fromEntries(
              (promotion.rules || []).filter((r) => r.product_id != null && r.product?.name).map((r) => [r.product_id as number, r.product!.name]),
            )}
            initialData={{
              name: promotion.name,
              description: promotion.description,
              promotion_type: promotion.promotion_type,
              discount_value: promotion.discount_value,
              buy_quantity: promotion.buy_quantity,
              get_quantity: promotion.get_quantity,
              min_purchase_amount: promotion.min_purchase_amount,
              min_purchase_scope: promotion.min_purchase_scope ?? null,
              min_quantity: promotion.min_quantity ?? null,
              repeat_every_quantity: promotion.repeat_every_quantity ?? null,
              max_discount_amount: promotion.max_discount_amount,
              start_time: promotion.start_time ?? null,
              end_time: promotion.end_time ?? null,
              // Franjas que cruzan días (20261120180000) y métodos de pago: sin
              // pasarlos, el asistente abría «Todo el día» / «Cualquier método».
              schedule_windows: promotion.schedule_windows ?? null,
              payment_method_codes: promotion.payment_method_codes ?? null,
              bundle_price: promotion.bundle_price ?? null,
              applies_to: promotion.applies_to,
              start_date: promotion.start_date,
              end_date: promotion.end_date,
              is_active: promotion.is_active,
              usage_limit: promotion.usage_limit,
              is_combinable: promotion.is_combinable,
              // Listas de precios (20261124213000): «No aplica a clientes con lista de precios».
              applies_with_price_lists: promotion.applies_with_price_lists !== false,
              priority: promotion.priority,
              // Estos campos NO se pasaban. Al editar, el formulario arrancaba sin
              // días, sin canales, sin sucursales y sin reglas; y al guardar,
              // `update()` borraba las reglas existentes y no insertaba ninguna.
              // Editar cualquier promoción la dejaba sin productos y sin días.
              applicable_days: promotion.applicable_days,
              branches: promotion.branches,
              applies_to_pos: promotion.applies_to_pos,
              applies_to_web: promotion.applies_to_web,
              applies_to_finances: promotion.applies_to_finances,
              // Promociones V2 (20261124200000): escalones, modo de conteo, grupo de clientes y usos por cliente.
              tiers: promotion.tiers ?? [],
              tiers_count_mode: promotion.tiers_count_mode ?? 'promotion_mix',
              customer_segment_id: promotion.customer_segment_id ?? null,
              usage_limit_per_customer: promotion.usage_limit_per_customer ?? null,
              rules: (promotion.rules || []).map((r) => ({
                rule_type: r.rule_type,
                product_id: r.product_id ?? undefined,
                category_id: r.category_id ?? undefined,
                quantity: r.quantity ?? null,
                brand: r.brand ?? null,
                tier_group: r.tier_group ?? null,
              })),
            }}
          />
        </div>
      </div>
    );
  }

  const accionesMenu: AccionFila[] = [
    {
      id: 'editar',
      etiqueta: t('detalle.editar'),
      icono: Edit,
      onSelect: () => router.push(`/app/pos/promociones/${promotionId}?edit=true`),
    },
    {
      id: 'duplicar',
      etiqueta: t('detalle.duplicar'),
      icono: Copy,
      onSelect: () => void handleDuplicate(),
    },
    {
      id: 'eliminar',
      etiqueta: t('detalle.eliminar'),
      icono: Trash2,
      destructiva: true,
      onSelect: () => setShowDeleteDialog(true),
    },
  ];

  return (
    <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 sm:p-6">
      <div className="flex w-full flex-col gap-4">
        <PageHeader
          variante="detail"
          titulo={promotion.name}
          subtitulo={t(`tipos.${promotion.promotion_type}`)}
          icono={Tag}
          badge={<StatusBadge estado={estadoDePromocion(promotion, new Date(), timezone)} tamano="md" />}
          volverA="/app/pos/promociones"
          migas={[
            migaVentas,
            { etiqueta: t('pantalla.titulo'), href: '/app/pos/promociones' },
            { etiqueta: promotion.name },
          ]}
          acciones={
            !puedeGestionar ? undefined : <>
              <button
                type="button"
                onClick={handleToggleActive}
                disabled={toggling}
                className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
              >
                {promotion.is_active ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
                {promotion.is_active ? t('v2.detalle.pausar') : t('v2.detalle.reanudar')}
              </button>
              <button type="button" onClick={handleDuplicate} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                <Copy className="size-4" aria-hidden="true" />
                {t('detalle.duplicar')}
              </button>
              <Link
                href={`/app/pos/promociones/${promotionId}?edit=true`}
                className={clasesBoton({ variante: 'primario', tamano: 'sm' })}
              >
                <Edit className="size-4" aria-hidden="true" />
                {t('detalle.editar')}
              </Link>
              <button
                type="button"
                onClick={() => setShowDeleteDialog(true)}
                className={clasesBoton({ variante: 'destructivo', tamano: 'sm' })}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                {t('detalle.eliminar')}
              </button>
            </>
          }
          movil={{ accion: puedeGestionar ? <RowActionsMenu acciones={accionesMenu} titulo={promotion.name} tamano="md" orientacion="horizontal" /> : undefined }}
        />

        <div className="flex flex-wrap gap-2">
          {promotion.applies_to_web !== false && <Badge tono="neutro" apariencia="contorno" tamano="sm">{t('v2.donde.web')}</Badge>}
          {promotion.applies_to_pos !== false && <Badge tono="neutro" apariencia="contorno" tamano="sm">{t('v2.donde.pos')}</Badge>}
          {promotion.applies_to_finances === true && <Badge tono="neutro" apariencia="contorno" tamano="sm">{t('v2.donde.facturas')}</Badge>}
          {promotion.customer_segment_id && (
            <Badge tono="marca" apariencia="suave" tamano="sm">
              {nombreSegmento ? t('v2.detalle.soloGrupo', { grupo: nombreSegmento }) : t('v2.detalle.soloUnGrupo')}
            </Badge>
          )}
        </div>

        <KpiStrip columnas={4} etiqueta={t('detalle.estadisticas')}>
          <StatCard
            etiqueta={t('v2.estadisticas.ventasCon')}
            valor={estadisticas ? estadisticas.ventas : '—'}
            detalle={t('v2.estadisticas.enMes', { mes: mesActual })}
          />
          <StatCard
            etiqueta={t('v2.estadisticas.ahorroDado')}
            valor={estadisticas ? formatear(estadisticas.ahorro) : '—'}
            detalle={t('v2.estadisticas.ahorroDadoDetalle')}
          />
          <StatCard
            etiqueta={esVolumen ? t('v2.estadisticas.unidadesEscalon') : t('v2.estadisticas.unidadesDescuento')}
            valor={estadisticas ? (esVolumen ? unidadesEnEscalon ?? 0 : estadisticas.unidades) : '—'}
            detalle={esVolumen && unidadesPorEscalon ? unidadesPorEscalon : t('v2.estadisticas.enMes', { mes: mesActual })}
          />
          <StatCard
            etiqueta={t('detalle.usos')}
            valor={promotion.usage_count}
            detalle={[
              promotion.usage_limit != null ? t('v2.detalle.deLimite', { n: promotion.usage_limit }) : t('v2.detalle.sinLimite'),
              promotion.usage_limit_per_customer ? t('v2.detalle.porCliente', { n: promotion.usage_limit_per_customer }) : null,
            ].filter(Boolean).join(' · ')}
          />
        </KpiStrip>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
          <Tarjeta titulo={t('v2.palabras.titulo')}>
            <p className="text-sm text-fg" data-testid="promo-en-palabras">{enPalabras}</p>
          </Tarjeta>

          {escalones.length > 0 && (
            <Tarjeta titulo={t('v2.escalones.titulo')} sinRelleno>
              <table className="w-full text-sm">
                <thead className="bg-subtle text-left text-xs font-medium text-fg-secondary">
                  <tr>
                    <th className="px-4 py-2">{t('v2.detalle.cantidad')}</th>
                    <th className="px-4 py-2">{t('v2.escalones.precioUnidad')}</th>
                    <th className="px-4 py-2">{t('v2.escalones.ahorro')}</th>
                    <th className="px-4 py-2 text-right">{t('v2.estadisticas.ventasColumna')}</th>
                  </tr>
                </thead>
                <tbody>
                  {escalones.map((e, i) => {
                    const siguiente = escalones[i + 1];
                    const rango = siguiente
                      ? t('v2.vista.rango', { desde: e.desde, hasta: siguiente.desde - 1 })
                      : t('v2.vista.oMasCorto', { n: e.desde });
                    return (
                      <tr key={e.desde} className="border-t border-line">
                        <td className="px-4 py-2 text-fg">{rango}</td>
                        <td className="px-4 py-2 tabular-nums text-fg">
                          {e.precioUnidad !== null ? formatear(e.precioUnidad) : `−${e.porcentaje} %`}
                        </td>
                        <td className="px-4 py-2 tabular-nums text-fg-secondary">
                          {e.porcentaje !== null ? `${e.porcentaje} %` : t('v2.detalle.segunPrecio')}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-fg">
                          {estadisticas?.porEscalon[String(e.desde)]?.ventas || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Tarjeta>
          )}

          <Tarjeta titulo={t('detalle.titulo')} icono={Tag}>
            <div className="flex flex-col gap-4">
              {textoPlano(promotion.description || '') && (
                <div>
                  <h3 className="text-xs font-medium leading-4 text-fg-secondary">{t('detalle.descripcion')}</h3>
                  <p className="mt-1 text-sm text-fg">{textoPlano(promotion.description || '')}</p>
                </div>
              )}

              <ListaDatos divisores>
                <FilaDato
                  etiqueta={t('detalle.descuento')}
                  valor={<span className="text-lg font-semibold text-brand">{getDiscountDisplay(promotion)}</span>}
                  tamano="lg"
                />
                <FilaDato etiqueta={t('detalle.aplicaA')} valor={t(`aplicaA.${promotion.applies_to}`)} />
                <FilaDato etiqueta={t('detalle.fechaInicio')} valor={formatFechaVigencia(promotion.start_date)} />
                <FilaDato
                  etiqueta={t('detalle.fechaFin')}
                  valor={promotion.end_date ? formatFechaVigencia(promotion.end_date) : t('detalle.sinFechaFin')}
                />
              </ListaDatos>

              <div className="flex flex-col gap-3">
                <div>
                  <h3 className="text-xs font-medium leading-4 text-fg-secondary">{t('horario.titulo')}</h3>
                  <ul className="mt-1 flex flex-col gap-0.5 text-sm tabular-nums text-fg">
                    {lineasHorario(promotion, t, diasSemana).map((linea) => (
                      <li key={linea}>{linea}</li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[13px] leading-[18px] text-fg-secondary">
                    {t('detalle.horaOrganizacion', { zona: timezone, desfase: textoDesfase(timezone) })}
                  </p>
                </div>
                <VistaSemanaPromocion horario={promotion} madrugadaAparte={!promotion.schedule_windows} />
              </div>

              {(promotion.min_purchase_amount || minimoUnidades || promotion.repeat_every_quantity) && (
                <ListaDatos divisores>
                  {minimoUnidades != null && (
                    <FilaDato etiqueta={t('detalle.cantidadMinima')} valor={t('detalle.unidades', { n: minimoUnidades })} />
                  )}
                  {promotion.repeat_every_quantity != null && promotion.repeat_every_quantity > 0 && (
                    <FilaDato etiqueta={t('detalle.seRepite')} valor={t('detalle.unidades', { n: promotion.repeat_every_quantity })} />
                  )}
                  {promotion.min_purchase_amount != null && promotion.min_purchase_amount > 0 && (
                    <FilaDato
                      etiqueta={t('detalle.compraMinima')}
                      valor={formatear(promotion.min_purchase_amount)}
                      descripcion={
                        promotion.applies_to === 'all' || promotion.min_purchase_scope === 'cart'
                          ? t('detalle.sobreCuenta')
                          : t('detalle.sobreProductos')
                      }
                    />
                  )}
                </ListaDatos>
              )}

              {promotion.max_discount_amount ? (
                <ListaDatos>
                  <FilaDato etiqueta={t('detalle.descuentoMaximo')} valor={formatear(promotion.max_discount_amount)} />
                </ListaDatos>
              ) : null}

              {promotion.rules && promotion.rules.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-medium leading-4 text-fg-secondary">{t('detalle.reglas')}</h3>
                  <ul className="flex flex-col gap-2">
                    {promotion.rules.map((rule) => (
                      <li key={rule.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-subtle px-3 py-2">
                        <Badge
                          tono={rule.rule_type.startsWith('include') ? 'marca' : 'peligro'}
                          apariencia="suave"
                          tamano="sm"
                        >
                          {rule.rule_type.startsWith('include') ? t('detalle.incluye') : t('detalle.excluye')}
                        </Badge>
                        {rule.product && <span className="text-sm text-fg">{rule.product.name}</span>}
                        {rule.category && <span className="text-sm text-fg">{rule.category.name}</span>}
                        {promotion.promotion_type === 'bundle' && rule.rule_type === 'include_product' && (
                          <span className="text-[13px] text-fg-secondary">
                            {t('detalle.porPaquete', {
                              n: rule.quantity != null && rule.quantity > 0 ? rule.quantity : 1,
                            })}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Tarjeta>
          </div>

          <div className="flex flex-col gap-4">
            <Tarjeta titulo={t('v2.vista.titulo')}>
              <VistaPreviaCliente
                datos={{ ...promotion, start_date: promotion.start_date }}
                tiers={promotion.tiers ?? []}
                producto={{ nombre: t('v2.vista.productoEjemplo'), precio: precioEjemplo }}
                t={t}
                formatear={formatear}
              />
            </Tarjeta>

            <Tarjeta titulo={t('v2.estadisticas.recientesTitulo')}>
              {estadisticas && estadisticas.recientes.length > 0 ? (
                <ul className="flex flex-col gap-3" data-testid="promo-ventas-recientes">
                  {estadisticas.recientes.map((v) => (
                    <li key={v.saleId} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/app/pos/ventas/${v.saleId}`} className="text-sm font-medium text-fg hover:underline">
                          {(v.numero ?? t('v2.estadisticas.sinNumero')) + ' · ' + canalVenta(v)}
                        </Link>
                        {v.resumen && <p className="truncate text-xs text-fg-secondary">{v.resumen}</p>}
                      </div>
                      <span className="shrink-0 text-sm tabular-nums text-fg">− {formatear(v.descuento)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-fg-secondary">{t('v2.estadisticas.recientesVacio')}</p>
              )}
              <Link href="/app/pos/ventas" className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'mt-3' })}>
                {t('v2.estadisticas.verTodas')}
              </Link>
            </Tarjeta>

            <Tarjeta titulo={t('detalle.estado')}>
              <SettingGroup>
                <SettingRow titulo={t('detalle.estado')} descripcion={<StatusBadge estado={estadoDePromocion(promotion, new Date(), timezone)} />}>
                  <Switch checked={promotion.is_active} onCheckedChange={handleToggleActive} disabled={toggling || !puedeGestionar} />
                </SettingRow>
              </SettingGroup>
            </Tarjeta>

            <Tarjeta titulo={t('detalle.estadisticas')}>
              <ListaDatos divisores>
                <FilaDato
                  etiqueta={t('detalle.usos')}
                  valor={
                    <span className="tabular-nums">
                      {promotion.usage_count}
                      {promotion.usage_limit != null && <span className="text-fg-muted">/{promotion.usage_limit}</span>}
                    </span>
                  }
                />
                <FilaDato etiqueta={t('detalle.combinable')} valor={promotion.is_combinable ? t('detalle.si') : t('detalle.no')} />
              </ListaDatos>
            </Tarjeta>

            <p className="px-1 text-xs leading-4 text-fg-muted">
              {t('detalle.creada', { fecha: formatDate(promotion.created_at) })}
              <br />
              {t('detalle.actualizada', { fecha: formatDate(promotion.updated_at) })}
            </p>
          </div>
        </div>
      </div>

      <ConfirmDialog
        abierto={showDeleteDialog}
        onAbiertoChange={(abierto) => {
          if (!eliminando) setShowDeleteDialog(abierto);
        }}
        titulo={t('detalle.eliminarTitulo')}
        descripcion={t('detalle.eliminarDescripcion')}
        textoConfirmar={t('detalle.eliminar')}
        textoCancelar={t('detalle.cancelar')}
        onConfirmar={handleDelete}
        tono="peligro"
        cargando={eliminando}
      />
    </div>
  );
}
