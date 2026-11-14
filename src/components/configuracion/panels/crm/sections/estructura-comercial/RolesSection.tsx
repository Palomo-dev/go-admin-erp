'use client';

import { Pencil, Trash2, UserCog } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ConfirmDeleteDialog,
  EmptyState,
  InactiveBadge,
  LoadingSkeleton,
  SectionHeader,
} from './shared';
import { RoleDialog } from './RoleDialog';
import { useRoles } from './useRoles';

/** Sección: Roles comerciales (lista + diálogos). */
export function RolesSection() {
  const t = useTranslations('configuracionTextos.rolesSection');
  const s = useRoles();

  return (
    <div className="space-y-3">
      <SectionHeader
        icon={UserCog}
        title={t('contador', { n: s.roles.length })}
        subtitle={t('subtitulo')}
        loading={s.loading}
        onRefresh={s.load}
        onCreate={s.handleCreate}
        createLabel={t('nuevo')}
      />

      {s.loading ? (
        <LoadingSkeleton />
      ) : s.roles.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title={t('vacio.titulo')}
          hint={t('vacio.ayuda')}
        />
      ) : (
        <div className="space-y-2">
          {s.roles.map((role) => (
            <Card key={role.id} className="border-gray-200 dark:border-gray-700">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-xs">
                        {role.code}
                      </Badge>
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {role.name}
                      </p>
                      {!role.is_active && <InactiveBadge />}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {t('area', { area: role.area })}
                      {role.job_positions?.name && (
                        <>
                          {' '}
                          {t.rich('cargoHrm', {
                            cargo: role.job_positions.name,
                            c: (chunks) => (
                              <span className="text-blue-600 dark:text-blue-400 font-medium">
                                {chunks}
                              </span>
                            ),
                          })}
                        </>
                      )}
                      {Array.isArray(role.responsibilities) &&
                        role.responsibilities.length > 0 && (
                          <> {t('responsabilidades', { n: role.responsibilities.length })}</>
                        )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Button variant="ghost" size="icon" onClick={() => s.handleEdit(role)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => s.askDelete(role)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <RoleDialog
        open={s.dialogOpen}
        onOpenChange={s.setDialogOpen}
        editing={s.editing !== null}
        form={s.form}
        setForm={s.setForm}
        jobPositions={s.jobPositions}
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
