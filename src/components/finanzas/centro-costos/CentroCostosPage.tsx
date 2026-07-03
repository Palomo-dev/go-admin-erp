'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Loader2, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CostCenterService, CostCenter } from './CostCenterService';

export function CentroCostosPage() {
  const [centers, setCenters] = useState<CostCenter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<CostCenter | null>(null);
  const [formData, setFormData] = useState({ code: '', name: '', parent_id: '', is_active: true });

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setIsLoading(true);
      const data = await CostCenterService.getAll();
      setCenters(data);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al cargar centros de costos');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.code || !formData.name) {
      toast.error('Codigo y nombre son requeridos');
      return;
    }
    try {
      const input = { code: formData.code, name: formData.name, parent_id: formData.parent_id || null, is_active: formData.is_active };
      if (editing) {
        await CostCenterService.update(editing.id, input);
        toast.success('Centro de costo actualizado');
      } else {
        await CostCenterService.create(input);
        toast.success('Centro de costo creado');
      }
      setShowDialog(false);
      load();
    } catch (error) {
      toast.error('Error al guardar');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminar este centro de costos?')) return;
    try {
      await CostCenterService.delete(id);
      toast.success('Eliminado');
      load();
    } catch {
      toast.error('Error al eliminar');
    }
  };

  if (isLoading) {
    return <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-xl">
            <Building2 className="h-6 w-6 text-orange-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Centro de Costos</h1>
            <p className="text-gray-500 dark:text-gray-400">Clasificacion de gastos por departamento</p>
          </div>
        </div>
        <Button onClick={() => { setEditing(null); setFormData({ code: '', name: '', parent_id: '', is_active: true }); setShowDialog(true); }} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-2" /> Nuevo
        </Button>
      </div>

      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader><CardTitle className="text-gray-900 dark:text-white">{centers.length} centros</CardTitle></CardHeader>
        <CardContent>
          {centers.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No hay centros de costos registrados</p>
          ) : (
            <div className="space-y-2">
              {centers.map(c => (
                <div key={c.id} className="flex items-center gap-3 py-2.5 px-3 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded-lg">
                  <span className="font-mono text-sm text-gray-600 dark:text-gray-400 w-20">{c.code}</span>
                  <span className="flex-1 text-gray-900 dark:text-white font-medium">{c.name}</span>
                  {!c.is_active && <span className="text-xs text-red-500">Inactivo</span>}
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setEditing(c); setFormData({ code: c.code, name: c.name, parent_id: c.parent_id || '', is_active: c.is_active }); setShowDialog(true); }}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600" onClick={() => handleDelete(c.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader><DialogTitle className="text-gray-900 dark:text-white">{editing ? 'Editar' : 'Nuevo'} Centro de Costos</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Codigo *</Label>
              <Input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} disabled={!!editing} className="dark:bg-gray-900 dark:border-gray-600 font-mono" />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Nombre *</Label>
              <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="dark:bg-gray-900 dark:border-gray-600" />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} />
              <Label className="text-gray-700 dark:text-gray-300">Activo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} className="dark:border-gray-600">Cancelar</Button>
            <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
