'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { Copy, Edit, Tag, Trash2 } from 'lucide-react';
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
import { PromotionWizard } from '@/components/pos/promociones/nuevo';
import { Promotion } from '@/components/pos/promociones/types';
import { cantidadMinimaEfectiva } from '@/lib/promotions/cantidadMinima';
import { diasDelIdioma } from '@/components/pos/promociones/diasPromocion';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { toast } from 'sonner';

type EstadoPromo = 'inactiva' | 'programada' | 'expirada' | 'activa';

function textoPlano(valor: string): string {
  return valor.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function estadoPromo(promo: Promotion): EstadoPromo {
  if (!promo.is_active) return 'inactiva';
  const now = new Date();
  if (new Date(promo.start_date) > now) return 'programada';
  if (promo.end_date && new Date(promo.end_date) < now) return 'expirada';
  return 'activa';
}

export default function PromocionDetallePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoading: orgLoading } = useOrganization();
  const { formatear } = useMonedaOrganizacion();
  const t = useTranslations('posPromociones');
  const locale = useLocale();
  const diasSemana = diasDelIdioma(locale);

  const promotionId = params?.id as string;
  const isEditMode = searchParams?.get('edit') === 'true';

  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [toggling, setToggling] = useState(false);

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

  // Para fechas de vigencia: el asistente guarda "10 de septiembre" como
  // 2026-09-10 00:00 UTC. Mostrarlo en hora de Colombia (UTC-5) lo retrocedía
  // a las 19:00 del día 9 y salía "09 de septiembre". Se pinta en UTC para
  // que se lea la fecha que el usuario eligió.
  const formatFechaVigencia = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(localeIntl(locale), {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  };

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
        <div className="mx-auto w-full max-w-4xl rounded-xl border border-line bg-surface">
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

  if (isEditMode) {
    return (
      <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 sm:p-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
          <PageHeader
            variante="form"
            titulo={promotion.name}
            subtitulo={t('detalle.editar')}
            volverA={`/app/pos/promociones/${promotionId}`}
            migas={[
              { etiqueta: t('pantalla.migasPos'), href: '/app/pos' },
              { etiqueta: t('pantalla.titulo'), href: '/app/pos/promociones' },
              { etiqueta: promotion.name, href: `/app/pos/promociones/${promotionId}` },
              { etiqueta: t('detalle.editar') },
            ]}
          />
          <PromotionWizard
            promotionId={promotionId}
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
              bundle_price: promotion.bundle_price ?? null,
              applies_to: promotion.applies_to,
              start_date: promotion.start_date,
              end_date: promotion.end_date,
              is_active: promotion.is_active,
              usage_limit: promotion.usage_limit,
              is_combinable: promotion.is_combinable,
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
              rules: (promotion.rules || []).map((r) => ({
                rule_type: r.rule_type,
                product_id: r.product_id ?? undefined,
                category_id: r.category_id ?? undefined,
                quantity: r.quantity ?? null,
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
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <PageHeader
          variante="detail"
          titulo={promotion.name}
          subtitulo={t(`tipos.${promotion.promotion_type}`)}
          icono={Tag}
          badge={<StatusBadge estado={estadoPromo(promotion)} tamano="md" />}
          volverA="/app/pos/promociones"
          migas={[
            { etiqueta: t('pantalla.migasPos'), href: '/app/pos' },
            { etiqueta: t('pantalla.titulo'), href: '/app/pos/promociones' },
            { etiqueta: promotion.name },
          ]}
          acciones={
            <>
              <Link
                href={`/app/pos/promociones/${promotionId}?edit=true`}
                className={clasesBoton({ variante: 'primario', tamano: 'sm' })}
              >
                <Edit className="size-4" aria-hidden="true" />
                {t('detalle.editar')}
              </Link>
              <button type="button" onClick={handleDuplicate} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                <Copy className="size-4" aria-hidden="true" />
                {t('detalle.duplicar')}
              </button>
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
          movil={{ accion: <RowActionsMenu acciones={accionesMenu} titulo={promotion.name} tamano="md" orientacion="horizontal" /> }}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Tarjeta titulo={t('detalle.titulo')} icono={Tag} className="lg:col-span-2">
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

              <div>
                <h3 className="text-xs font-medium leading-4 text-fg-secondary">{t('detalle.dias')}</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {promotion.applicable_days && promotion.applicable_days.length > 0 ? (
                    diasSemana.map((d) => {
                      const activo = promotion.applicable_days!.includes(d.value);
                      return (
                        <Badge key={d.value} tono={activo ? 'marca' : 'neutro'} apariencia={activo ? 'suave' : 'contorno'} tamano="sm">
                          {d.corto}
                        </Badge>
                      );
                    })
                  ) : (
                    <span className="text-sm text-fg">{t('detalle.todosLosDias')}</span>
                  )}
                </div>
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

          <div className="flex flex-col gap-4">
            <Tarjeta titulo={t('detalle.estado')}>
              <SettingGroup>
                <SettingRow titulo={t('detalle.estado')} descripcion={<StatusBadge estado={estadoPromo(promotion)} />}>
                  <Switch checked={promotion.is_active} onCheckedChange={handleToggleActive} disabled={toggling} />
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
                <FilaDato etiqueta={t('detalle.prioridad')} valor={<span className="tabular-nums">{promotion.priority}</span>} />
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
