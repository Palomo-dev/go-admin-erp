'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Calendar, CircleCheck, CircleOff, Copy, Edit, Plus, Tag, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DataTable, type ColumnaTabla } from '@/components/kit/DataTable';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { ConfirmDialog } from '@/components/kit/ConfirmDialog';
import { RowActionsMenu } from '@/components/kit/RowActionsMenu';
import type { AccionFila } from '@/components/kit/acciones';
import { localeIntl } from '@/components/kit/idioma';
import { Promotion, type WeekDay } from './types';
import { diasDelIdioma } from './diasPromocion';
import { PromotionsService } from './promotionsService';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { toast } from 'sonner';

interface PromotionsListProps {
  promotions: Promotion[];
  loading: boolean;
  filtrado?: boolean;
  onLimpiarFiltros?: () => void;
  onRefresh: () => void;
}

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

export function PromotionsList({ promotions, loading, filtrado, onLimpiarFiltros, onRefresh }: PromotionsListProps) {
  const router = useRouter();
  const { formatear } = useMonedaOrganizacion();
  const t = useTranslations('posPromociones');
  const locale = useLocale();
  const diasSemana = diasDelIdioma(locale);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!deleteId) return;
    setEliminando(true);
    try {
      await PromotionsService.delete(deleteId);
      toast.success(t('lista.eliminada'));
      onRefresh();
    } catch (error: unknown) {
      toast.error((error as { message?: string } | null)?.message || t('lista.errorEliminar'));
    } finally {
      setEliminando(false);
      setDeleteId(null);
    }
  };

  const handleDuplicate = async (promo: Promotion) => {
    try {
      await PromotionsService.duplicate(promo.id);
      toast.success(t('lista.duplicada'));
      onRefresh();
    } catch (error: unknown) {
      toast.error((error as { message?: string } | null)?.message || t('lista.errorDuplicar'));
    }
  };

  const handleToggleActive = async (promo: Promotion) => {
    setTogglingId(promo.id);
    try {
      await PromotionsService.toggleActive(promo.id);
      toast.success(promo.is_active ? t('lista.desactivada') : t('lista.activada'));
      onRefresh();
    } catch (error: unknown) {
      toast.error((error as { message?: string } | null)?.message || t('lista.errorEstado'));
    } finally {
      setTogglingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(localeIntl(locale), {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
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
      case 'buy_x_get_y': {
        const x = promo.buy_quantity ?? 0;
        const y = promo.get_quantity ?? 0;
        if (x > 0 && y > 0 && y < x) return `${x}x${y}`;
        if (x > 0 && y > 0) return t('lista.compraGratis', { x, y });
        return '-';
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

  const diasDeVigencia = (dias: WeekDay[] | null | undefined): string | null => {
    if (!dias || dias.length === 0) return null;
    const cortos = diasSemana.filter((d) => dias.includes(d.value)).map((d) => d.corto);
    return cortos.length > 0 ? cortos.join(', ') : null;
  };

  const horaCorta = (valor: string | null | undefined): string => {
    if (!valor) return '';
    return String(valor).slice(0, 5);
  };

  const accionesDe = (promo: Promotion): AccionFila[] => [
    {
      id: 'editar',
      etiqueta: t('lista.editar'),
      icono: Edit,
      onSelect: () => router.push(`/app/pos/promociones/${promo.id}?edit=true`),
    },
    {
      id: 'duplicar',
      etiqueta: t('lista.duplicar'),
      icono: Copy,
      onSelect: () => void handleDuplicate(promo),
    },
    {
      id: 'estado',
      etiqueta: promo.is_active ? t('lista.desactivar') : t('lista.activar'),
      icono: promo.is_active ? CircleOff : CircleCheck,
      onSelect: () => void handleToggleActive(promo),
      deshabilitada: togglingId === promo.id,
      separadorAntes: true,
    },
    {
      id: 'eliminar',
      etiqueta: t('lista.eliminar'),
      icono: Trash2,
      destructiva: true,
      onSelect: () => setDeleteId(promo.id),
    },
  ];

  const columnas: ColumnaTabla<Promotion>[] = [
    {
      id: 'promocion',
      encabezado: t('lista.promocion'),
      celda: (promo) => (
        <div className="min-w-0">
          <div className="font-medium text-fg">{promo.name}</div>
          {textoPlano(promo.description || '') && (
            <div className="line-clamp-2 whitespace-normal break-words text-[13px] leading-[18px] text-fg-secondary">
              {textoPlano(promo.description || '')}
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'tipo',
      encabezado: t('lista.tipo'),
      celda: (promo) => (
        <Badge tono="neutro" apariencia="contorno" tamano="sm">
          {t(`tipos.${promo.promotion_type}`)}
        </Badge>
      ),
    },
    {
      id: 'descuento',
      encabezado: t('lista.descuento'),
      celda: (promo) => (
        <span className="font-medium tabular-nums text-brand-deep">{getDiscountDisplay(promo)}</span>
      ),
    },
    {
      id: 'vigencia',
      encabezado: t('lista.vigencia'),
      ocultarDebajo: 'md',
      celda: (promo) => (
        <div className="text-[13px] leading-[18px] text-fg-secondary">
          <div className="flex items-center gap-1">
            <Calendar className="size-3" aria-hidden="true" />
            <span>
              {formatDate(promo.start_date)}
              {promo.end_date ? ` – ${formatDate(promo.end_date)}` : ''}
            </span>
          </div>
          {diasDeVigencia(promo.applicable_days) && <div>{diasDeVigencia(promo.applicable_days)}</div>}
          {(promo.start_time || promo.end_time) && (
            <div className="tabular-nums">
              {horaCorta(promo.start_time) || '00:00'}–{horaCorta(promo.end_time) || '24:00'}
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'usos',
      encabezado: t('lista.usos'),
      alinear: 'centro',
      celda: (promo) => (
        <span className="tabular-nums text-fg-secondary">
          {promo.usage_count}
          {promo.usage_limit != null && <span className="text-fg-muted">/{promo.usage_limit}</span>}
        </span>
      ),
    },
    {
      id: 'prioridad',
      encabezado: t('lista.prioridad'),
      alinear: 'centro',
      celda: (promo) => <span className="tabular-nums text-fg">{promo.priority}</span>,
    },
    {
      id: 'estado',
      encabezado: t('lista.estado'),
      alinear: 'centro',
      celda: (promo) => <StatusBadge estado={estadoPromo(promo)} />,
    },
  ];

  const vacio = promotions.length === 0;
  const estado = loading ? 'cargando' : vacio ? (filtrado ? 'sinResultados' : 'vacio') : 'listo';

  return (
    <>
      <DataTable
        columnas={columnas}
        filas={promotions}
        obtenerId={(promo) => promo.id}
        etiqueta={t('pantalla.titulo')}
        estado={estado}
        onFilaClick={(promo) => router.push(`/app/pos/promociones/${promo.id}`)}
        etiquetaFila={(promo) => promo.name}
        acciones={accionesDe}
        onLimpiarFiltros={onLimpiarFiltros}
        vacio={{
          titulo: t('lista.vacioTitulo'),
          descripcion: t('lista.vacioDescripcion'),
          icono: Tag,
          accion: { etiqueta: t('pantalla.nueva'), href: '/app/pos/promociones/nuevo', icono: Plus },
        }}
        tarjetaMovil={(promo) => (
          <article className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4">
            <button
              type="button"
              onClick={() => router.push(`/app/pos/promociones/${promo.id}`)}
              className="min-w-0 flex-1 text-left"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-fg">{promo.name}</span>
                <StatusBadge estado={estadoPromo(promo)} />
              </div>
              <p className="mt-1 text-[13px] leading-[18px] text-fg-secondary">{t(`tipos.${promo.promotion_type}`)}</p>
              <p className="mt-1 text-sm font-medium tabular-nums text-brand-deep">{getDiscountDisplay(promo)}</p>
            </button>
            <RowActionsMenu acciones={accionesDe(promo)} titulo={promo.name} />
          </article>
        )}
      />

      <ConfirmDialog
        abierto={deleteId !== null}
        onAbiertoChange={(abierto) => {
          if (!abierto && !eliminando) setDeleteId(null);
        }}
        titulo={t('lista.eliminarTitulo')}
        descripcion={t('lista.eliminarDescripcion')}
        textoConfirmar={t('lista.eliminar')}
        textoCancelar={t('lista.cancelar')}
        onConfirmar={handleDelete}
        tono="peligro"
        cargando={eliminando}
      />
    </>
  );
}
