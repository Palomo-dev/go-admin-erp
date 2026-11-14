import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { db } from './db';
import type { JobPosition, SalesRole } from './types';

export interface RoleForm {
  code: string;
  name: string;
  area: string;
  responsibilities: string;
  is_active: boolean;
  sort_order: number;
  job_position_id: string;
}

const EMPTY_FORM: RoleForm = {
  code: '',
  name: '',
  area: '',
  responsibilities: '',
  is_active: true,
  sort_order: 0,
  job_position_id: '',
};

/** Estado y acciones de la sección de roles (carga, alta/edición y borrado). */
export function useRoles() {
  const t = useTranslations('configuracionTextos.useRoles');
  const { toast } = useToast();
  const [roles, setRoles] = useState<SalesRole[]>([]);
  const [jobPositions, setJobPositions] = useState<JobPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SalesRole | null>(null);
  const [toDelete, setToDelete] = useState<SalesRole | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<RoleForm>(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rolesData, positionsData] = await Promise.all([db.getRoles(), db.getJobPositions()]);
      setRoles(rolesData);
      setJobPositions(positionsData);
    } catch (error) {
      console.error('Error cargando roles:', error);
      toast({
        title: t('error'),
        description: t('errores.cargar'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const handleEdit = (role: SalesRole) => {
    setEditing(role);
    setForm({
      code: role.code,
      name: role.name,
      area: role.area,
      responsibilities: Array.isArray(role.responsibilities)
        ? role.responsibilities.join('\n')
        : '',
      is_active: role.is_active,
      sort_order: role.sort_order,
      job_position_id: role.job_position_id || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.area.trim()) {
      toast({
        title: t('validacion'),
        description: t('errores.obligatorios'),
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const responsibilities = form.responsibilities
        .split('\n')
        .map((r) => r.trim())
        .filter(Boolean);
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        area: form.area.trim(),
        responsibilities,
        is_active: form.is_active,
        sort_order: form.sort_order,
        job_position_id: form.job_position_id || null,
      };
      if (editing) {
        await db.updateRole(editing.id, payload);
        toast({ title: t('exito.actualizado'), description: t('exito.actualizadoDetalle') });
      } else {
        await db.createRole(payload);
        toast({ title: t('exito.creado'), description: t('exito.creadoDetalle') });
      }
      setDialogOpen(false);
      load();
    } catch (error) {
      console.error('Error guardando rol:', error);
      toast({ title: t('error'), description: t('errores.guardar'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const askDelete = (role: SalesRole) => {
    setToDelete(role);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await db.deleteRole(toDelete.id);
      toast({ title: t('exito.eliminado'), description: t('exito.eliminadoDetalle') });
      load();
    } catch (error) {
      console.error('Error eliminando rol:', error);
      toast({ title: t('error'), description: t('errores.eliminar'), variant: 'destructive' });
    } finally {
      setDeleteDialogOpen(false);
      setToDelete(null);
    }
  };

  return {
    roles,
    jobPositions,
    loading,
    load,
    dialogOpen,
    setDialogOpen,
    deleteDialogOpen,
    setDeleteDialogOpen,
    editing,
    toDelete,
    saving,
    form,
    setForm,
    handleCreate,
    handleEdit,
    handleSave,
    askDelete,
    confirmDelete,
  };
}
