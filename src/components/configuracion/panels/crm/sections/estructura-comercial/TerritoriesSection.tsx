'use client';

import { MapPin, Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  ConfirmDeleteDialog,
  EmptyState,
  InactiveBadge,
  LoadingSkeleton,
  SectionHeader,
} from './shared';
import { TerritoryDialog } from './TerritoryDialog';
import { useTerritories } from './useTerritories';

/** Sección: Territorios con criterios JSON. */
export function TerritoriesSection() {
  const t = useTranslations('configuracionTextos.territoriesSection');
  const s = useTerritories();

  /** Resumen legible de los criterios de un territorio. */
  const criteriaSummary = (criteria: Record<string, unknown>): string => {
    const keys = Object.keys(criteria || {});
    if (keys.length === 0) return t('criterios.ninguno');
    return t('criterios.resumen', { n: keys.length, claves: keys.join(', ') });
  };

  return (
    <div className="space-y-3">
      <SectionHeader
        icon={MapPin}
        title={t('contador', { n: s.territories.length })}
        subtitle={t('subtitulo')}
        loading={s.loading}
        onRefresh={s.load}
        onCreate={s.handleCreate}
        createLabel={t('nuevo')}
      />

      {s.loading ? (
        <LoadingSkeleton />
      ) : s.territories.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title={t('vacio.titulo')}
          hint={t('vacio.ayuda')}
        />
      ) : (
        <div className="space-y-2">
          {s.territories.map((territory) => (
            <Card key={territory.id} className="border-gray-200 dark:border-gray-700">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {territory.name}
                      </p>
                      {!territory.is_active && <InactiveBadge />}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate font-mono">
                      {criteriaSummary(territory.criteria)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Button variant="ghost" size="icon" onClick={() => s.handleEdit(territory)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => s.askDelete(territory)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TerritoryDialog
        open={s.dialogOpen}
        onOpenChange={s.setDialogOpen}
        editing={s.editing !== null}
        form={s.form}
        setForm={s.setForm}
        criteriaError={s.criteriaError}
        setCriteriaError={s.setCriteriaError}
        saving={s.saving}
        onSave={s.handleSave}
      />

      <ConfirmDeleteDialog
        open={s.deleteDialogOpen}
        onOpenChange={s.setDeleteDialogOpen}
        title={t('eliminar.titulo')}
        description={t('eliminar.descripcion', { nombre: s.toDelete?.name ?? '' })}
        onConfirm={s.confirmDelete}
      />
    </div>
  );
}
