import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { db } from './db';
import type { Territory } from './types';

export interface TerritoryForm {
  name: string;
  criteria: string;
  is_active: boolean;
}

const EMPTY_FORM: TerritoryForm = { name: '', criteria: '{}', is_active: true };

/** Estado y acciones de la sección de territorios. */
export function useTerritories() {
  const t = useTranslations('configuracionTextos.useTerritories');
  const { toast } = useToast();
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Territory | null>(null);
  const [toDelete, setToDelete] = useState<Territory | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TerritoryForm>(EMPTY_FORM);
  const [criteriaError, setCriteriaError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await db.getTerritories();
      setTerritories(data);
    } catch (error) {
      console.error('Error cargando territorios:', error);
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
    setCriteriaError(null);
    setDialogOpen(true);
  };

  const handleEdit = (territory: Territory) => {
    setEditing(territory);
    setForm({
      name: territory.name,
      criteria: JSON.stringify(territory.criteria || {}, null, 2),
      is_active: territory.is_active,
    });
    setCriteriaError(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: t('validacion'), description: t('errores.nombreObligatorio'), variant: 'destructive' });
      return;
    }
    let parsedCriteria: Record<string, unknown> = {};
    try {
      parsedCriteria = JSON.parse(form.criteria || '{}');
      setCriteriaError(null);
    } catch {
      setCriteriaError(t('errores.jsonInvalido'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        criteria: parsedCriteria,
        is_active: form.is_active,
      };
      if (editing) {
        await db.updateTerritory(editing.id, payload);
        toast({
          title: t('exito.actualizado'),
          description: t('exito.actualizadoDetalle'),
        });
      } else {
        await db.createTerritory(payload);
        toast({ title: t('exito.creado'), description: t('exito.creadoDetalle') });
      }
      setDialogOpen(false);
      load();
    } catch (error) {
      console.error('Error guardando territorio:', error);
      toast({
        title: t('error'),
        description: t('errores.guardar'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const askDelete = (territory: Territory) => {
    setToDelete(territory);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await db.deleteTerritory(toDelete.id);
      toast({
        title: t('exito.eliminado'),
        description: t('exito.eliminadoDetalle'),
      });
      load();
    } catch (error) {
      console.error('Error eliminando territorio:', error);
      toast({
        title: t('error'),
        description: t('errores.eliminar'),
        variant: 'destructive',
      });
    } finally {
      setDeleteDialogOpen(false);
      setToDelete(null);
    }
  };

  return {
    territories,
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
    criteriaError,
    setCriteriaError,
    handleCreate,
    handleEdit,
    handleSave,
    askDelete,
    confirmDelete,
  };
}
