'use client';

import { useState, useEffect, useCallback } from 'react';
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
      toast({ title: 'Error', description: 'No se pudieron cargar las verticales', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

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
          title: updated.is_active ? 'Vertical activada' : 'Vertical desactivada',
          description: `"${vertical.name}" ha sido ${updated.is_active ? 'activada' : 'desactivada'}`,
        });
      }
    } catch (error) {
      console.error('Error cambiando estado:', error);
      toast({ title: 'Error', description: 'No se pudo cambiar el estado', variant: 'destructive' });
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({ title: 'Validacion', description: 'El nombre es obligatorio', variant: 'destructive' });
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
        toast({ title: 'Vertical actualizada', description: 'Los cambios se guardaron correctamente' });
      } else {
        await verticalsService.create({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
        });
        toast({ title: 'Vertical creada', description: 'La vertical se creo correctamente' });
      }
      setDialogOpen(false);
      loadVerticals();
    } catch (error) {
      console.error('Error guardando vertical:', error);
      toast({ title: 'Error', description: 'No se pudo guardar la vertical', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!verticalToDelete) return;
    try {
      await verticalsService.delete(verticalToDelete.id);
      toast({ title: 'Vertical eliminada', description: 'La vertical se desactivo correctamente' });
      loadVerticals();
    } catch (error) {
      console.error('Error eliminando vertical:', error);
      toast({ title: 'Error', description: 'No se pudo eliminar la vertical', variant: 'destructive' });
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
              {verticals.length} vertical{verticals.length !== 1 ? 'es' : ''}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Gestiona las verticales de negocio del CRM
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadVerticals} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Nueva Vertical
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
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No hay verticales configuradas</h3>
          <p className="text-gray-500 dark:text-gray-400">Crea verticales para clasificar tus oportunidades por linea de negocio</p>
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
                          Inactiva
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
            <DialogTitle>{editingVertical ? 'Editar Vertical' : 'Nueva Vertical'}</DialogTitle>
            <DialogDescription>
              {editingVertical
                ? 'Modifica los datos de la vertical'
                : 'Crea una nueva vertical para clasificar oportunidades'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="vertical-name">Nombre *</Label>
              <Input
                id="vertical-name"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Ej: Hotelero, Retail, Construccion..."
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vertical-description">Descripcion</Label>
              <Textarea
                id="vertical-description"
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Descripcion opcional de la vertical"
                rows={3}
                maxLength={500}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="vertical-active">Activa</Label>
              <Switch
                id="vertical-active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, is_active: checked }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog eliminar */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar vertical?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta accion desactivara la vertical &quot;{verticalToDelete?.name}&quot;. Las oportunidades
              asociadas no seran eliminadas pero perderan esta clasificacion.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
