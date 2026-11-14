'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, RefreshCw, Layers } from 'lucide-react';
import verticalsService, { type Vertical } from '@/lib/services/crm/verticalsService';

export function VerticalsManager() {
  const t = useTranslations('configuracionTextos.verticalsManager');
  const { toast } = useToast();

  const [verticals, setVerticals] = useState<Vertical[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingVertical, setEditingVertical] = useState<Vertical | null>(null);
  const [verticalToDelete, setVerticalToDelete] = useState<Vertical | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_active: true,
  });

  const loadVerticals = useCallback(async () => {
    setLoading(true);
    try {
      const data = await verticalsService.listAll();
      setVerticals(data);
    } catch (error) {
      console.error('Error cargando verticales:', error);
      toast({ title: t('toast.error'), description: t('toast.errorCargar'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    loadVerticals();
  }, [loadVerticals]);

  const handleCreate = () => {
    setEditingVertical(null);
    setFormData({ name: '', description: '', is_active: true });
    setDialogOpen(true);
  };

  const handleEdit = (vertical: Vertical) => {
    setEditingVertical(vertical);
    setFormData({
      name: vertical.name,
      description: vertical.description || '',
      is_active: vertical.is_active,
    });
    setDialogOpen(true);
  };

  const handleDelete = (vertical: Vertical) => {
    setVerticalToDelete(vertical);
    setDeleteDialogOpen(true);
  };

  const handleToggle = async (vertical: Vertical) => {
    try {
      const updated = await verticalsService.update(vertical.id, {
        is_active: !vertical.is_active,
      });
      if (updated) {
        setVerticals((prev) => prev.map((v) => (v.id === vertical.id ? updated : v)));
        toast({
          title: updated.is_active ? t('toast.activada') : t('toast.desactivada'),
          description: updated.is_active
            ? t('toast.activadaDescripcion', { nombre: vertical.name })
            : t('toast.desactivadaDescripcion', { nombre: vertical.name }),
        });
      }
    } catch (error) {
      console.error('Error cambiando estado:', error);
      toast({ title: t('toast.error'), description: t('toast.errorEstado'), variant: 'destructive' });
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({ title: t('toast.validacion'), description: t('toast.nombreObligatorio'), variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (editingVertical) {
        await verticalsService.update(editingVertical.id, {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          is_active: formData.is_active,
        });
        toast({ title: t('toast.actualizada'), description: t('toast.cambiosGuardados') });
      } else {
        await verticalsService.create({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
        });
        toast({ title: t('toast.creada'), description: t('toast.creadaDescripcion') });
      }
      setDialogOpen(false);
      loadVerticals();
    } catch (error) {
      console.error('Error guardando vertical:', error);
      toast({ title: t('toast.error'), description: t('toast.errorGuardar'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!verticalToDelete) return;
    try {
      await verticalsService.delete(verticalToDelete.id);
      toast({ title: t('toast.eliminada'), description: t('toast.eliminadaDescripcion') });
      loadVerticals();
    } catch (error) {
      console.error('Error eliminando vertical:', error);
      toast({ title: t('toast.error'), description: t('toast.errorEliminar'), variant: 'destructive' });
    } finally {
      setDeleteDialogOpen(false);
      setVerticalToDelete(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {t('encabezado.conteo', { n: verticals.length })}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('encabezado.descripcion')}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadVerticals} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" />
            {t('encabezado.nuevaVertical')}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg border border-gray-200 dark:border-gray-700 animate-pulse bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      ) : verticals.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <Layers className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{t('vacio.titulo')}</h3>
          <p className="text-gray-500 dark:text-gray-400">{t('vacio.descripcion')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {verticals.map((vertical) => (
            <Card key={vertical.id} className="border-gray-200 dark:border-gray-700">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {vertical.name}
                      </p>
                      {!vertical.is_active && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500">
                          {t('lista.inactiva')}
                        </span>
                      )}
                    </div>
                    {vertical.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                        {vertical.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <Switch
                      checked={vertical.is_active}
                      onCheckedChange={() => handleToggle(vertical)}
                    />
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(vertical)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(vertical)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog crear/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingVertical ? t('dialogo.tituloEditar') : t('dialogo.tituloNueva')}</DialogTitle>
            <DialogDescription>
              {editingVertical
                ? t('dialogo.descripcionEditar')
                : t('dialogo.descripcionNueva')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="vertical-name">{t('dialogo.nombreEtiqueta')}</Label>
              <Input
                id="vertical-name"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={t('dialogo.nombrePlaceholder')}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vertical-description">{t('dialogo.descripcionEtiqueta')}</Label>
              <Textarea
                id="vertical-description"
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                placeholder={t('dialogo.descripcionPlaceholder')}
                rows={3}
                maxLength={500}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="vertical-active">{t('dialogo.activa')}</Label>
              <Switch
                id="vertical-active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, is_active: checked }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('acciones.cancelar')}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? t('acciones.guardando') : t('acciones.guardar')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog eliminar */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('desactivar.titulo')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('desactivar.descripcion', { nombre: verticalToDelete?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('acciones.cancelar')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {t('desactivar.confirmar')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
