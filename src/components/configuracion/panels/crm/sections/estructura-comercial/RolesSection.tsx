'use client';

import { Pencil, Trash2, UserCog } from 'lucide-react';
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
  const s = useRoles();

  return (
    <div className="space-y-3">
      <SectionHeader
        icon={UserCog}
        title={`${s.roles.length} rol${s.roles.length !== 1 ? 'es' : ''}`}
        subtitle="Define roles comerciales con área y responsabilidades"
        loading={s.loading}
        onRefresh={s.load}
        onCreate={s.handleCreate}
        createLabel="Nuevo Rol"
      />

      {s.loading ? (
        <LoadingSkeleton />
      ) : s.roles.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="No hay roles configurados"
          hint="Crea roles como SDR, Account Executive, Sales Manager, etc."
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
                      Área: {role.area}
                      {role.job_positions?.name && (
                        <>
                          {' '}
                          · Cargo HRM:{' '}
                          <span className="text-blue-600 dark:text-blue-400 font-medium">
                            {role.job_positions.name}
                          </span>
                        </>
                      )}
                      {Array.isArray(role.responsibilities) &&
                        role.responsibilities.length > 0 && (
                          <> · {role.responsibilities.length} responsabilidades</>
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
        title="¿Eliminar rol?"
        description={
          <>Esta acción eliminará el rol &quot;{s.toDelete?.name}&quot; permanentemente.</>
        }
        onConfirm={s.confirmDelete}
      />
    </div>
  );
}
