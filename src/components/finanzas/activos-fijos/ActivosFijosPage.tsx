'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Loader2, Package } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { FixedAssetService, FixedAsset, ASSET_TYPES, DEPRECIATION_METHODS } from './FixedAssetService';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: 'Activo', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  disposed: { label: 'Dado de Baja', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  fully_depreciated: { label: 'Totalmente Depreciado', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400' },
  sold: { label: 'Vendido', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
};

export function ActivosFijosPage() {
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<FixedAsset | null>(null);
  const [formData, setFormData] = useState({
    code: '', name: '', description: '', asset_type: 'equipment',
    acquisition_date: new Date().toISOString().split('T')[0],
    acquisition_cost: 0, salvage_value: 0, useful_life_months: 12,
    depreciation_method: 'straight_line',
  });

  useEffect(() => { load(); }, []);

  const load = async () => {
    try { setIsLoading(true); const data = await FixedAssetService.getAll(); setAssets(data); }
    catch { toast.error('Error al cargar activos'); }
    finally { setIsLoading(false); }
  };

  const handleSave = async () => {
    if (!formData.code || !formData.name) { toast.error('Codigo y nombre requeridos'); return; }
    try {
      const input = { ...formData, description: formData.description || null };
      if (editing) { await FixedAssetService.update(editing.id, input); toast.success('Activo actualizado'); }
      else { await FixedAssetService.create(input); toast.success('Activo creado'); }
      setShowDialog(false); load();
    } catch { toast.error('Error al guardar'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminar este activo?')) return;
    try { await FixedAssetService.delete(id); toast.success('Eliminado'); load(); }
    catch { toast.error('Error al eliminar'); }
  };

  if (isLoading) {
    return <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-teal-100 dark:bg-teal-900/30 rounded-xl">
            <Package className="h-6 w-6 text-teal-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Activos Fijos</h1>
            <p className="text-gray-500 dark:text-gray-400">Gestion y depreciacion de activos</p>
          </div>
        </div>
        <Button onClick={() => { setEditing(null); setFormData({ code: '', name: '', description: '', asset_type: 'equipment', acquisition_date: new Date().toISOString().split('T')[0], acquisition_cost: 0, salvage_value: 0, useful_life_months: 12, depreciation_method: 'straight_line' }); setShowDialog(true); }} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-2" /> Nuevo Activo
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="dark:bg-gray-800 dark:border-gray-700"><CardContent className="py-3"><div className="text-sm text-gray-600 dark:text-gray-400">Total Activos</div><div className="text-xl font-bold text-gray-900 dark:text-white">{assets.length}</div></CardContent></Card>
        <Card className="dark:bg-gray-800 dark:border-gray-700"><CardContent className="py-3"><div className="text-sm text-gray-600 dark:text-gray-400">Valor Adquisicion</div><div className="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(assets.reduce((s, a) => s + a.acquisition_cost, 0))}</div></CardContent></Card>
        <Card className="dark:bg-gray-800 dark:border-gray-700"><CardContent className="py-3"><div className="text-sm text-gray-600 dark:text-gray-400">Depreciacion Acum.</div><div className="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(assets.reduce((s, a) => s + a.accumulated_depreciation, 0))}</div></CardContent></Card>
        <Card className="dark:bg-gray-800 dark:border-gray-700"><CardContent className="py-3"><div className="text-sm text-gray-600 dark:text-gray-400">Valor Actual</div><div className="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(assets.reduce((s, a) => s + a.current_value, 0))}</div></CardContent></Card>
      </div>

      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader><CardTitle className="text-gray-900 dark:text-white">Listado de Activos</CardTitle></CardHeader>
        <CardContent>
          {assets.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No hay activos fijos registrados</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b dark:border-gray-700 text-gray-600 dark:text-gray-400">
                    <th className="text-left py-2 px-3 font-medium">Codigo</th>
                    <th className="text-left py-2 px-3 font-medium">Nombre</th>
                    <th className="text-left py-2 px-3 font-medium">Tipo</th>
                    <th className="text-left py-2 px-3 font-medium">Estado</th>
                    <th className="text-right py-2 px-3 font-medium">Costo</th>
                    <th className="text-right py-2 px-3 font-medium">Deprec. Acum.</th>
                    <th className="text-right py-2 px-3 font-medium">Valor Actual</th>
                    <th className="text-right py-2 px-3 font-medium">Deprec./Mes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map(a => {
                    const monthlyDep = FixedAssetService.calculateMonthlyDepreciation(a);
                    const statusInfo = STATUS_LABELS[a.status] || { label: a.status, color: '' };
                    return (
                      <tr key={a.id} className="border-b dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="py-2 px-3 font-mono text-gray-600 dark:text-gray-400">{a.code}</td>
                        <td className="py-2 px-3 text-gray-900 dark:text-white">{a.name}</td>
                        <td className="py-2 px-3 text-gray-500 dark:text-gray-400">{ASSET_TYPES.find(t => t.value === a.asset_type)?.label || a.asset_type}</td>
                        <td className="py-2 px-3"><Badge className={statusInfo.color}>{statusInfo.label}</Badge></td>
                        <td className="py-2 px-3 text-right font-mono text-gray-700 dark:text-gray-300">{formatCurrency(a.acquisition_cost)}</td>
                        <td className="py-2 px-3 text-right font-mono text-gray-700 dark:text-gray-300">{formatCurrency(a.accumulated_depreciation)}</td>
                        <td className="py-2 px-3 text-right font-mono font-medium text-gray-900 dark:text-white">{formatCurrency(a.current_value)}</td>
                        <td className="py-2 px-3 text-right font-mono text-gray-500 dark:text-gray-400">{formatCurrency(monthlyDep)}</td>
                        <td className="py-2 px-3">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setEditing(a); setFormData({ code: a.code, name: a.name, description: a.description || '', asset_type: a.asset_type, acquisition_date: a.acquisition_date, acquisition_cost: a.acquisition_cost, salvage_value: a.salvage_value, useful_life_months: a.useful_life_months, depreciation_method: a.depreciation_method }); setShowDialog(true); }}><Edit className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600" onClick={() => handleDelete(a.id)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700 max-w-2xl">
          <DialogHeader><DialogTitle className="text-gray-900 dark:text-white">{editing ? 'Editar' : 'Nuevo'} Activo Fijo</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label className="text-gray-700 dark:text-gray-300">Codigo *</Label><Input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} disabled={!!editing} className="dark:bg-gray-900 dark:border-gray-600 font-mono" /></div>
              <div className="space-y-2"><Label className="text-gray-700 dark:text-gray-300">Tipo *</Label><Select value={formData.asset_type} onValueChange={(v) => setFormData({ ...formData, asset_type: v })}><SelectTrigger className="dark:bg-gray-900 dark:border-gray-600"><SelectValue /></SelectTrigger><SelectContent>{ASSET_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="space-y-2"><Label className="text-gray-700 dark:text-gray-300">Nombre *</Label><Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="dark:bg-gray-900 dark:border-gray-600" /></div>
            <div className="space-y-2"><Label className="text-gray-700 dark:text-gray-300">Descripcion</Label><Input value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="dark:bg-gray-900 dark:border-gray-600" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label className="text-gray-700 dark:text-gray-300">Fecha Adquisicion *</Label><Input type="date" value={formData.acquisition_date} onChange={(e) => setFormData({ ...formData, acquisition_date: e.target.value })} className="dark:bg-gray-900 dark:border-gray-600" /></div>
              <div className="space-y-2"><Label className="text-gray-700 dark:text-gray-300">Costo Adquisicion *</Label><Input type="number" value={formData.acquisition_cost} onChange={(e) => setFormData({ ...formData, acquisition_cost: parseFloat(e.target.value) || 0 })} className="dark:bg-gray-900 dark:border-gray-600" /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label className="text-gray-700 dark:text-gray-300">Valor Rescate</Label><Input type="number" value={formData.salvage_value} onChange={(e) => setFormData({ ...formData, salvage_value: parseFloat(e.target.value) || 0 })} className="dark:bg-gray-900 dark:border-gray-600" /></div>
              <div className="space-y-2"><Label className="text-gray-700 dark:text-gray-300">Vida Util (meses)</Label><Input type="number" value={formData.useful_life_months} onChange={(e) => setFormData({ ...formData, useful_life_months: parseInt(e.target.value) || 12 })} className="dark:bg-gray-900 dark:border-gray-600" /></div>
              <div className="space-y-2"><Label className="text-gray-700 dark:text-gray-300">Metodo Dep.</Label><Select value={formData.depreciation_method} onValueChange={(v) => setFormData({ ...formData, depreciation_method: v })}><SelectTrigger className="dark:bg-gray-900 dark:border-gray-600"><SelectValue /></SelectTrigger><SelectContent>{DEPRECIATION_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent></Select></div>
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
