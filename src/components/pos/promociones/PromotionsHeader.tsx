'use client';

import Link from 'next/link';
import { Plus, RefreshCw, Tag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/kit/PageHeader';
import { KpiStrip } from '@/components/kit/KpiStrip';
import { StatCard } from '@/components/kit/StatCard';
import { SearchInput } from '@/components/kit/SearchInput';
import { ListToolbar } from '@/components/kit/ListToolbar';
import { FilterPanel } from '@/components/kit/FilterPanel';
import { FilterChips, type ChipFiltro } from '@/components/kit/FilterChips';
import { clasesBoton } from '@/components/kit/botonClases';
import { cn } from '@/utils/Utils';
import { PromotionFilters, PROMOTION_TYPE_LABELS, type PromotionType } from './types';
import { useMigaVentas } from '@/components/pos/useMigaVentas';

interface PromotionsHeaderProps {
  filters: PromotionFilters;
  onFiltersChange: (filters: PromotionFilters) => void;
  onRefresh: () => void;
  totalPromotions: number;
  /** Vigentes en este instante con el mismo criterio del motor (incluye el horario). */
  activePromotions: number;
  /** Activas que empiezan más adelante. */
  scheduledPromotions?: number;
  loading: boolean;
  /** Sin permiso: solo la cabecera, sin cifras ni filtros (Figma 97-pos-promociones-05). */
  sinPermiso?: boolean;
  /** `pos.promociones.gestionar`: sin él no se ofrece «Nueva promoción». */
  puedeGestionar?: boolean;
}

export function PromotionsHeader({
  filters,
  onFiltersChange,
  onRefresh,
  totalPromotions,
  activePromotions,
  scheduledPromotions = 0,
  loading,
  sinPermiso = false,
  puedeGestionar = true,
}: PromotionsHeaderProps) {
  const t = useTranslations('posPromociones');
  const migaVentas = useMigaVentas();

  const handleSearchChange = (value: string) => {
    onFiltersChange({ ...filters, search: value });
  };

  const handleStatusChange = (value: string) => {
    const newFilter = value === 'all'
      ? { ...filters, is_active: undefined }
      : { ...filters, is_active: value === 'active' };
    onFiltersChange(newFilter);
  };

  const handleTypeChange = (value: string) => {
    const newFilter = value === 'all'
      ? { ...filters, promotion_type: undefined }
      : { ...filters, promotion_type: value as PromotionFilters['promotion_type'] };
    onFiltersChange(newFilter);
  };

  // Mismo patrón de las demás listas (Pedidos online, Ventas): buscador a lo
  // ancho + «Filtros» con su panel y los chips debajo, sin marco alrededor.
  const estadoValor = filters.is_active === undefined ? 'all' : filters.is_active ? 'active' : 'inactive';
  const tipoValor = filters.promotion_type || 'all';
  const chips: ChipFiltro[] = [
    ...(filters.is_active === undefined
      ? []
      : [{ clave: 'estado', etiqueta: `${t('pantalla.estado')}: ${filters.is_active ? t('pantalla.activas') : t('pantalla.inactivas')}` }]),
    ...(filters.promotion_type ? [{ clave: 'tipo', etiqueta: `${t('pantalla.tipo')}: ${t(`tipos.${filters.promotion_type}`)}` }] : []),
  ];
  const quitarFiltro = (clave: string) => {
    if (clave === 'estado') handleStatusChange('all');
    if (clave === 'tipo') handleTypeChange('all');
  };
  const limpiarFiltros = () => onFiltersChange({ ...filters, is_active: undefined, promotion_type: undefined });

  const nueva = (
    <Link href="/app/pos/promociones/nuevo" className={clasesBoton({ variante: 'primario', tamano: 'sm' })}>
      <Plus className="size-4" aria-hidden="true" />
      {t('pantalla.nueva')}
    </Link>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        titulo={t('pantalla.titulo')}
        subtitulo={
          sinPermiso || loading
            ? t('pantalla.subtitulo')
            : t('pantalla.subtituloConteo', { n: totalPromotions, activas: activePromotions })
        }
        icono={Tag}
        migas={[
          migaVentas,
          { etiqueta: t('pantalla.titulo') },
        ]}
        acciones={
          sinPermiso ? undefined : (
            <>
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                aria-label={t('pantalla.actualizar')}
                className={cn(clasesBoton({ variante: 'secundario', tamano: 'sm' }), 'w-9 px-0')}
              >
                <RefreshCw className={cn('size-4', loading && 'animate-spin')} aria-hidden="true" />
              </button>
              <Link href="/app/pos/cupones" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                {t('pantalla.cupones')}
              </Link>
              {puedeGestionar && nueva}
            </>
          )
        }
        movil={sinPermiso ? false : {
          accion: !puedeGestionar ? undefined : (
            <Link
              href="/app/pos/promociones/nuevo"
              aria-label={t('pantalla.nueva')}
              className={clasesBoton({ variante: 'primario', tamano: 'sm' })}
            >
              <Plus className="size-4" aria-hidden="true" />
            </Link>
          ),
        }}
      />

      {!sinPermiso && (
      <>
      <KpiStrip columnas={3} etiqueta={t('pantalla.titulo')}>
        <StatCard etiqueta={t('pantalla.total')} valor={totalPromotions} detalle={t('pantalla.totalDetalle')} tono="marca" icono={Tag} cargando={loading} />
        <StatCard etiqueta={t('pantalla.activasAhora')} valor={activePromotions} detalle={t('pantalla.activasAhoraDetalle')} tono="exito" cargando={loading} />
        <StatCard etiqueta={t('pantalla.programadas')} valor={scheduledPromotions} detalle={t('pantalla.programadasDetalle')} cargando={loading} />
      </KpiStrip>

      <div className="flex gap-2 lg:hidden">
        <Link href="/app/pos/cupones" className={cn(clasesBoton({ variante: 'secundario', tamano: 'sm' }), 'flex-1')}>
          {t('pantalla.cupones')}
        </Link>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label={t('pantalla.actualizar')}
          className={cn(clasesBoton({ variante: 'secundario', tamano: 'sm' }), 'w-9 px-0')}
        >
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} aria-hidden="true" />
        </button>
      </div>

      <ListToolbar
        busqueda={
          <SearchInput
            value={filters.search || ''}
            onChange={handleSearchChange}
            placeholder={t('pantalla.buscar')}
            etiqueta={t('pantalla.buscar')}
          />
        }
        filtros={
          <FilterPanel conteo={chips.length} onLimpiar={limpiarFiltros}>
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-fg-secondary">
                {t('pantalla.estado')}
                <Select value={estadoValor} onValueChange={handleStatusChange}>
                  <SelectTrigger className="w-full" aria-label={t('pantalla.estado')}>
                    <SelectValue placeholder={t('pantalla.estado')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('pantalla.todos')}</SelectItem>
                    <SelectItem value="active">{t('pantalla.activas')}</SelectItem>
                    <SelectItem value="inactive">{t('pantalla.inactivas')}</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-fg-secondary">
                {t('pantalla.tipo')}
                <Select value={tipoValor} onValueChange={handleTypeChange}>
                  <SelectTrigger className="w-full" aria-label={t('pantalla.tipo')}>
                    <SelectValue placeholder={t('pantalla.tipo')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('pantalla.todos')}</SelectItem>
                    {(Object.keys(PROMOTION_TYPE_LABELS) as PromotionType[]).map((key) => (
                      <SelectItem key={key} value={key}>{t(`tipos.${key}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>
          </FilterPanel>
        }
        chips={<FilterChips chips={chips} onQuitar={quitarFiltro} onLimpiarTodo={limpiarFiltros} />}
      />
      </>
      )}
    </div>
  );
}
