'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Calendar, CalendarClock, CircleCheck, CircleOff, Copy, Edit, Lock, Plus, Search, Tag, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DataTable, type ColumnaTabla } from '@/components/kit/DataTable';
import { BulkActionBar } from '@/components/kit/BulkActionBar';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { ConfirmDialog } from '@/components/kit/ConfirmDialog';
import { RowActionsMenu } from '@/components/kit/RowActionsMenu';
import type { AccionFila } from '@/components/kit/acciones';
import { localeIntl } from '@/components/kit/idioma';
import { Pagination } from '@/components/kit/Pagination';
import { formatDateInTz } from '@/lib/utils/dateDisplay';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { Promotion } from './types';
import { diasDelIdioma } from './diasPromocion';
import { estadoDePromocion } from './estadoPromocion';
import { lineasHorario } from './horario/textoHorario';
import { PromotionsService } from './promotionsService';
import { EdicionMasivaHorario } from './EdicionMasivaHorario';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { normalizarEscalones } from '@/lib/promotions/precioVolumen';
import { toast } from 'sonner';

interface PromotionsListProps {
  promotions: Promotion[];
  /** Estado de la carga: la tabla pinta esqueleto, error con «Reintentar» o «sin permiso». */
  estadoCarga: 'cargando' | 'listo' | 'error' | 'sinPermiso';
  filtrado?: boolean;
  /** Texto buscado, para el estado «sin resultados». */
  termino?: string;
  onLimpiarFiltros?: () => void;
  onRefresh: () => void;
  /** `pos.promociones.gestionar`: sin él, solo ver (sin menú de gestión, selección ni «Nueva»). */
  puedeGestionar?: boolean;
}

const TAMANO_PAGINA = 20;

function textoPlano(valor: string): string {
  return valor.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}

export function PromotionsList({ promotions, estadoCarga, filtrado, termino, onLimpiarFiltros, onRefresh, puedeGestionar = true }: PromotionsListProps) {
  const { timezone } = useOrgTimezone();
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(TAMANO_PAGINA);
  // Otra búsqueda o filtro vuelve a la primera página.
  useEffect(() => { setPagina(1); }, [promotions]);
  const ahora = new Date();
  const estadoPromo = (promo: Promotion) => estadoDePromocion(promo, ahora, timezone);
  const router = useRouter();
  const { formatear } = useMonedaOrganizacion();
  const t = useTranslations('posPromociones');
  const locale = useLocale();
  const diasSemana = diasDelIdioma(locale);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set());
  const [edicionMasiva, setEdicionMasiva] = useState(false);
  // Solo cuentan las seleccionadas que siguen en la lista (filtros, recarga).
  const idsSeleccionados = promotions.filter((p) => seleccion.has(p.id)).map((p) => p.id);

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

  // Fechas de vigencia en la zona de la organización (el fin es 23:59:59 de ese día allí).
  const formatDate = (dateString: string) =>
    formatDateInTz(dateString, timezone, { locale: localeIntl(locale), day: 'numeric', month: 'short', year: 'numeric' });

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

  /** Días y franja diaria, o franjas que cruzan días («Sáb 16:00 → Dom 14:00»). Nunca un «00:00» de relleno. */
  const horarioDe = (promo: Promotion): string[] => lineasHorario(promo, t, diasSemana);

  const canalesDe = (promo: Promotion): string => {
    const canales: string[] = [];
    if (promo.applies_to_pos !== false) canales.push(t('lista.canalPos'));
    if (promo.applies_to_web !== false) canales.push(t('lista.canalWeb'));
    if (promo.applies_to_finances === true) canales.push(t('lista.canalFinanzas'));
    return canales.length > 0 ? canales.join(' · ') : '—';
  };

  const accionesDe = (promo: Promotion): AccionFila[] => !puedeGestionar ? [] : [
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
              {promo.end_date ? ` – ${formatDate(promo.end_date)}` : ` · ${t('lista.sinFechaFin')}`}
            </span>
          </div>
          {horarioDe(promo).map((linea) => (
            <div key={linea} className="tabular-nums">{linea}</div>
          ))}
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
      id: 'canales',
      encabezado: t('lista.canales'),
      ocultarDebajo: 'lg',
      celda: (promo) => <span className="whitespace-nowrap text-fg-secondary">{canalesDe(promo)}</span>,
    },
    {
      id: 'estado',
      encabezado: t('lista.estado'),
      alinear: 'centro',
      celda: (promo) => <StatusBadge estado={estadoPromo(promo)} />,
    },
  ];

  const vacio = promotions.length === 0;
  const estado =
    estadoCarga === 'listo' ? (vacio ? (filtrado ? 'sinResultados' : 'vacio') : 'listo') : estadoCarga;
  const totalPaginas = Math.max(1, Math.ceil(promotions.length / tamano));
  const paginaVisible = Math.min(pagina, totalPaginas);
  const filasPagina = promotions.slice((paginaVisible - 1) * tamano, paginaVisible * tamano);

  return (
    <>
      <DataTable
        columnas={columnas}
        filas={filasPagina}
        obtenerId={(promo) => promo.id}
        etiqueta={t('pantalla.titulo')}
        estado={estado}
        onFilaClick={(promo) => router.push(`/app/pos/promociones/${promo.id}`)}
        etiquetaFila={(promo) => promo.name}
        acciones={puedeGestionar ? accionesDe : undefined}
        seleccion={puedeGestionar ? seleccion : undefined}
        onSeleccionChange={puedeGestionar ? setSeleccion : undefined}
        onLimpiarFiltros={onLimpiarFiltros}
        onReintentar={onRefresh}
        termino={termino}
        sinResultados={{
          titulo: t('lista.sinResultadosTitulo'),
          descripcion: termino ? t('lista.sinResultadosConTermino', { termino }) : t('lista.sinResultadosDescripcion'),
          icono: Search,
        }}
        error={{
          titulo: t('lista.errorTitulo'),
          descripcion: t('lista.errorDescripcion'),
        }}
        sinPermiso={{
          titulo: t('lista.sinPermisoTitulo'),
          descripcion: t('lista.sinPermisoDescripcion'),
          icono: Lock,
          accion: { etiqueta: t('lista.volverPos'), href: '/app/pos' },
        }}
        pie={
          promotions.length > 0 ? (
            <Pagination
              pagina={paginaVisible}
              tamano={tamano}
              total={promotions.length}
              onPaginaChange={setPagina}
              onTamanoChange={(n) => { setTamano(n); setPagina(1); }}
              sustantivo={{ singular: t('lista.sustantivoSingular'), plural: t('lista.sustantivoPlural') }}
              cargando={estadoCarga === 'cargando'}
            />
          ) : undefined
        }
        vacio={{
          titulo: t('lista.vacioTitulo'),
          descripcion: t('lista.vacioDescripcion'),
          icono: Tag,
          accion: puedeGestionar ? { etiqueta: t('pantalla.nueva'), href: '/app/pos/promociones/nuevo', icono: Plus } : undefined,
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
              <p className="mt-1 text-[13px] tabular-nums leading-[18px] text-fg-secondary">{horarioDe(promo).join(' · ')}</p>
            </button>
            {puedeGestionar && <RowActionsMenu acciones={accionesDe(promo)} titulo={promo.name} />}
          </article>
        )}
      />

      <BulkActionBar
        seleccionados={idsSeleccionados.length}
        acciones={[
          {
            id: 'horario',
            etiqueta: t('masivo.accion'),
            icono: CalendarClock,
            onClick: () => setEdicionMasiva(true),
          },
        ]}
        onLimpiar={() => setSeleccion(new Set())}
      />

      <EdicionMasivaHorario
        abierto={edicionMasiva}
        onAbiertoChange={setEdicionMasiva}
        ids={idsSeleccionados}
        onAplicado={() => {
          setSeleccion(new Set());
          onRefresh();
        }}
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
