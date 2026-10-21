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
import { clasesBoton } from '@/components/kit/botonClases';
import { cn } from '@/utils/Utils';
import { PromotionFilters, PROMOTION_TYPE_LABELS, type PromotionType } from './types';

interface PromotionsHeaderProps {
  filters: PromotionFilters;
  onFiltersChange: (filters: PromotionFilters) => void;
  onRefresh: () => void;
  totalPromotions: number;
  activePromotions: number;
  loading: boolean;
}

export function PromotionsHeader({
  filters,
  onFiltersChange,
  onRefresh,
  totalPromotions,
  activePromotions,
  loading,
}: PromotionsHeaderProps) {
  const t = useTranslations('posPromociones');

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
        subtitulo={t('pantalla.subtitulo')}
        icono={Tag}
        migas={[
          { etiqueta: t('pantalla.migasPos'), href: '/app/pos' },
          { etiqueta: t('pantalla.titulo') },
        ]}
        acciones={
          <>
            <Link href="/app/pos/cupones" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
              {t('pantalla.cupones')}
            </Link>
            {nueva}
          </>
        }
        movil={{
          accion: (
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

      <KpiStrip columnas={2} etiqueta={t('pantalla.titulo')}>
        <StatCard etiqueta={t('pantalla.total')} valor={totalPromotions} tono="marca" icono={Tag} cargando={loading} />
        <StatCard etiqueta={t('pantalla.activas')} valor={activePromotions} tono="exito" cargando={loading} />
      </KpiStrip>

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-surface p-4 sm:flex sm:flex-wrap sm:items-center">
        <Link
          href="/app/pos/cupones"
          className={cn(clasesBoton({ variante: 'secundario', tamano: 'sm' }), 'col-span-2 lg:hidden')}
        >
          {t('pantalla.cupones')}
        </Link>
        <SearchInput
          value={filters.search || ''}
          onChange={handleSearchChange}
          placeholder={t('pantalla.buscar')}
          etiqueta={t('pantalla.buscar')}
          className="col-span-2 min-w-0 sm:flex-1 sm:min-w-[180px]"
        />
        <Select
          value={filters.is_active === undefined ? 'all' : filters.is_active ? 'active' : 'inactive'}
          onValueChange={handleStatusChange}
        >
          <SelectTrigger className="w-full sm:w-[140px]" aria-label={t('pantalla.estado')}>
            <SelectValue placeholder={t('pantalla.estado')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('pantalla.todos')}</SelectItem>
            <SelectItem value="active">{t('pantalla.activas')}</SelectItem>
            <SelectItem value="inactive">{t('pantalla.inactivas')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.promotion_type || 'all'} onValueChange={handleTypeChange}>
          <SelectTrigger className="w-full sm:w-[160px]" aria-label={t('pantalla.tipo')}>
            <SelectValue placeholder={t('pantalla.tipo')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('pantalla.todos')}</SelectItem>
            {(Object.keys(PROMOTION_TYPE_LABELS) as PromotionType[]).map((key) => (
              <SelectItem key={key} value={key}>{t(`tipos.${key}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label={t('pantalla.actualizar')}
          className={cn(clasesBoton({ variante: 'secundario', tamano: 'sm' }), 'col-span-2 sm:w-10 sm:px-0')}
        >
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
