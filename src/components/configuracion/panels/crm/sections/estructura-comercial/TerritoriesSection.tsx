'use client';

import { MapPin, Pencil, Trash2 } from 'lucide-react';
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
import { criteriaSummary, useTerritories } from './useTerritories';

/** Sección: Territorios con criterios JSON. */
export function TerritoriesSection() {
  const s = useTerritories();

  return (
    <div className="space-y-3">
      <SectionHeader
        icon={MapPin}
        title={`${s.territories.length} territorio${s.territories.length !== 1 ? 's' : ''}`}
        subtitle="Define territorios con criterios (ciudad, vertical, tamaño)"
        loading={s.loading}
        onRefresh={s.load}
        onCreate={s.handleCreate}
        createLabel="Nuevo Territorio"
      />

      {s.loading ? (
        <LoadingSkeleton />
      ) : s.territories.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No hay territorios configurados"
          hint="Crea territorios para asignar regiones o segmentos a tus equipos"
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
        title="¿Eliminar territorio?"
        description={
          <>Esta acción eliminará el territorio &quot;{s.toDelete?.name}&quot; permanentemente.</>
        }
        onConfirm={s.confirmDelete}
      />
    </div>
  );
}
