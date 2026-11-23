'use client';

/**
 * Cabecera de «Motivos de devolución» (Figma `874:579636`) con el kit:
 * `PageHeader` con migas (sustituyen al «←»), subtítulo con el conteo,
 * «Importar CSV» y «Nuevo motivo» (primaria), Exportar en el «⋯», y la barra de
 * búsqueda con el filtro de estado en un `SegmentedControl`.
 */
import { useTranslations } from 'next-intl';
import { ClipboardList, Download, Plus, RefreshCw, Upload } from 'lucide-react';
import { ListToolbar, PageHeader, RowActionsMenu, SearchInput, SegmentedControl } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { ReturnReasonFilters } from '../types';
import { useMigaVentas } from '@/components/pos/useMigaVentas';

interface ReturnReasonsHeaderProps {
  filters: ReturnReasonFilters;
  onFiltersChange: (filters: ReturnReasonFilters) => void;
  onNewClick: () => void;
  onImportClick: () => void;
  onExportClick: () => void;
  onRefresh: () => void;
  totalReasons: number;
  activeReasons: number;
  loading: boolean;
}

type EstadoFiltro = 'all' | 'active' | 'inactive';

export function ReturnReasonsHeader({
  filters,
  onFiltersChange,
  onNewClick,
  onImportClick,
  onExportClick,
  onRefresh,
  totalReasons,
  activeReasons,
  loading,
}: ReturnReasonsHeaderProps) {
  const t = useTranslations('posDevoluciones.motivos.encabezado');
  const tPagina = useTranslations('posDevoluciones.pagina');
  const migaVentas = useMigaVentas();

  const handleSearchChange = (value: string) => {
    onFiltersChange({ ...filters, search: value });
  };

  const handleStatusChange = (value: EstadoFiltro) => {
    const newFilter = value === 'all' ? { ...filters, is_active: undefined } : { ...filters, is_active: value === 'active' };
    onFiltersChange(newFilter);
  };

  const estado: EstadoFiltro = filters.is_active === undefined ? 'all' : filters.is_active ? 'active' : 'inactive';

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtituloConteo', { total: totalReasons, activos: activeReasons })}
        icono={ClipboardList}
        migas={[
          migaVentas,
          { etiqueta: tPagina('migas.devoluciones'), href: '/app/pos/devoluciones' },
          { etiqueta: t('titulo') },
        ]}
        acciones={
          <>
            <Button variant="outline" size="icon" className="size-10" onClick={onRefresh} disabled={loading} aria-label={t('actualizar')} title={t('actualizar')}>
              <RefreshCw aria-hidden="true" className={`size-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.5} />
            </Button>
            <Button variant="outline" className="h-10 gap-2" onClick={onImportClick}>
              <Upload aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('importarCsv')}
            </Button>
            <Button className="h-10 gap-2" onClick={onNewClick}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('nuevo')}
            </Button>
            <RowActionsMenu
              orientacion="horizontal"
              tamano="md"
              titulo={t('titulo')}
              acciones={[
                { id: 'exportar', etiqueta: t('exportar'), icono: Download, onSelect: onExportClick },
              ]}
            />
          </>
        }
      />

      <ListToolbar
        busqueda={
          <SearchInput
            value={filters.search || ''}
            onChange={handleSearchChange}
            placeholder={t('buscarPlaceholder')}
            etiqueta={t('buscarPlaceholder')}
            cargando={loading}
          />
        }
        filtros={
          <SegmentedControl<EstadoFiltro>
            etiqueta={t('estadoPlaceholder')}
            valor={estado}
            onValorChange={handleStatusChange}
            opciones={[
              { valor: 'all', etiqueta: t('todos') },
              { valor: 'active', etiqueta: t('activos') },
              { valor: 'inactive', etiqueta: t('inactivos') },
            ]}
          />
        }
      />
    </div>
  );
}
