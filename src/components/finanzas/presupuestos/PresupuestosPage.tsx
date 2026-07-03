'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Loader2, Target } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { BudgetService, Budget, BudgetLine } from './BudgetService';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  closed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export function PresupuestosPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null);
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [formData, setFormData] = useState({ name: '', fiscal_year: new Date().getFullYear() });

  useEffect(() => { load(); }, []);

  const load = async () => {
    try { setIsLoading(true); const data = await BudgetService.getAll(); setBudgets(data); }
    catch { toast.error('Error al cargar presupuestos'); }
    finally { setIsLoading(false); }
  };

  const loadLines = async (budget: Budget) => {
    setSelectedBudget(budget);
    try { const data = await BudgetService.getLines(budget.id); setLines(data); }
    catch { toast.error('Error al cargar lineas'); }
  };

  const handleCreate = async () => {
    if (!formData.name) { toast.error('Nombre requerido'); return; }
    try { await BudgetService.create(formData); toast.success('Presupuesto creado'); setShowDialog(false); load(); }
    catch { toast.error('Error al crear'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminar este presupuesto?')) return;
    try { await BudgetService.delete(id); toast.success('Eliminado'); if (selectedBudget?.id === id) { setSelectedBudget(null); setLines([]); } load(); }
    catch { toast.error('Error al eliminar'); }
  };

  if (isLoading) {
    return <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded-xl">
            <Target className="h-6 w-6 text-cyan-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Presupuestos</h1>
            <p className="text-gray-500 dark:text-gray-400">Planificacion y control financiero</p>
          </div>
        </div>
        <Button onClick={() => { setFormData({ name: '', fiscal_year: new Date().getFullYear() }); setShowDialog(true); }} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-2" /> Nuevo Presupuesto
        </Button>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="dark:bg-gray-800 dark:border-gray-700 md:col-span-1">
          <CardHeader><CardTitle className="text-gray-900 dark:text-white">Presupuestos</CardTitle></CardHeader>
          <CardContent>
            {budgets.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No hay presupuestos</p>
            ) : (
              <div className="space-y-2">
                {budgets.map(b => (
                  <div key={b.id} className={`flex items-center gap-2 py-2.5 px-3 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 ${selectedBudget?.id === b.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`} onClick={() => loadLines(b)}>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-white">{b.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{b.fiscal_year} | {formatCurrency(b.total_amount)}</div>
                    </div>
                    <Badge className={STATUS_COLORS[b.status] || ''}>{b.status}</Badge>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600" onClick={(e) => { e.stopPropagation(); handleDelete(b.id); }}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800 dark:border-gray-700 md:col-span-2">
          <CardHeader><CardTitle className="text-gray-900 dark:text-white">{selectedBudget ? `Lineas - ${selectedBudget.name}` : 'Seleccione un presupuesto'}</CardTitle></CardHeader>
          <CardContent>
            {!selectedBudget ? (
              <p className="text-center text-gray-500 py-8">Seleccione un presupuesto para ver sus lineas</p>
            ) : lines.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No hay lineas en este presupuesto</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b dark:border-gray-700 text-gray-600 dark:text-gray-400">
                      <th className="text-left py-2 px-3 font-medium">Cuenta</th>
                      <th className="text-center py-2 px-3 font-medium">Periodo</th>
                      <th className="text-right py-2 px-3 font-medium">Planificado</th>
                      <th className="text-right py-2 px-3 font-medium">Real</th>
                      <th className="text-right py-2 px-3 font-medium">Varianza</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map(l => (
                      <tr key={l.id} className="border-b dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="py-2 px-3 font-mono text-gray-600 dark:text-gray-400">{l.account_code}</td>
                        <td className="py-2 px-3 text-center text-gray-500 dark:text-gray-400">P{l.period}</td>
                        <td className="py-2 px-3 text-right font-mono text-gray-700 dark:text-gray-300">{formatCurrency(l.planned_amount)}</td>
                        <td className="py-2 px-3 text-right font-mono text-gray-700 dark:text-gray-300">{formatCurrency(l.actual_amount)}</td>
                        <td className={`py-2 px-3 text-right font-mono ${l.variance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{formatCurrency(l.variance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader><DialogTitle className="text-gray-900 dark:text-white">Nuevo Presupuesto</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label className="text-gray-700 dark:text-gray-300">Nombre *</Label><Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="dark:bg-gray-900 dark:border-gray-600" /></div>
            <div className="space-y-2"><Label className="text-gray-700 dark:text-gray-300">Año Fiscal *</Label><Input type="number" value={formData.fiscal_year} onChange={(e) => setFormData({ ...formData, fiscal_year: parseInt(e.target.value) || new Date().getFullYear() })} className="dark:bg-gray-900 dark:border-gray-600" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} className="dark:border-gray-600">Cancelar</Button>
            <Button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-700">Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
