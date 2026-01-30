'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Settings, Plus, Loader2, Copy, Trash2, Edit, Power, PowerOff, Play, ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ReglasContablesService, AccountingRule, ChartAccount, SOURCE_TYPES, EVENT_TYPES } from './ReglasContablesService';

export function ReglasContablesPage() {
  const [reglas, setReglas] = useState<AccountingRule[]>([]);
  const [cuentas, setCuentas] = useState<ChartAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<AccountingRule | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [filterSource, setFilterSource] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    source_type: '',
    event_type: '',
    debit_account_code: '',
    credit_account_code: '',
    tax_account_code: '',
    use_tax_from_document: false,
    priority: 0
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [reglasData, cuentasData] = await Promise.all([
        ReglasContablesService.obtenerReglas(),
        ReglasContablesService.obtenerCuentasContables()
      ]);
      setReglas(reglasData);
      setCuentas(cuentasData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast.error('Error al cargar los datos');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      source_type: '',
      event_type: '',
      debit_account_code: '',
      credit_account_code: '',
      tax_account_code: '',
      use_tax_from_document: false,
      priority: 0
    });
    setEditingRule(null);
  };

  const handleOpenDialog = (rule?: AccountingRule) => {
    if (rule) {
      setEditingRule(rule);
      setFormData({
        name: rule.name,
        description: rule.description || '',
        source_type: rule.source_type,
        event_type: rule.event_type,
        debit_account_code: rule.debit_account_code,
        credit_account_code: rule.credit_account_code,
        tax_account_code: rule.tax_account_code || '',
        use_tax_from_document: rule.use_tax_from_document,
        priority: rule.priority
      });
    } else {
      resetForm();
    }
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.source_type || !formData.event_type || 
        !formData.debit_account_code || !formData.credit_account_code) {
      toast.error('Completa todos los campos requeridos');
      return;
    }

    try {
      setIsProcessing(true);
      if (editingRule) {
        await ReglasContablesService.actualizarRegla(editingRule.id, formData);
        toast.success('Regla actualizada exitosamente');
      } else {
        await ReglasContablesService.crearRegla(formData);
        toast.success('Regla creada exitosamente');
      }
      setShowDialog(false);
      resetForm();
      loadData();
    } catch (error) {
      console.error('Error guardando regla:', error);
      toast.error('Error al guardar la regla');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDuplicate = async (rule: AccountingRule) => {
    try {
      await ReglasContablesService.duplicarRegla(rule.id);
      toast.success('Regla duplicada exitosamente');
      loadData();
    } catch (error) {
      toast.error('Error al duplicar la regla');
    }
  };

  const handleToggleActive = async (rule: AccountingRule) => {
    try {
      await ReglasContablesService.toggleActivo(rule.id, !rule.is_active);
      toast.success(rule.is_active ? 'Regla desactivada' : 'Regla activada');
      loadData();
    } catch (error) {
      toast.error('Error al cambiar estado');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta regla?')) return;
    try {
      await ReglasContablesService.eliminarRegla(id);
      toast.success('Regla eliminada exitosamente');
      loadData();
    } catch (error) {
      toast.error('Error al eliminar la regla');
    }
  };

  const getSourceLabel = (value: string) => SOURCE_TYPES.find(s => s.value === value)?.label || value;
  const getEventLabel = (value: string) => EVENT_TYPES.find(e => e.value === value)?.label || value;
  const getAccountName = (code: string) => cuentas.find(c => c.account_code === code)?.name || code;

  const filteredReglas = filterSource 
    ? reglas.filter(r => r.source_type === filterSource)
    : reglas;

  if (isLoading) {
    return (
      <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <Settings className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Reglas Contables
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Configuración de asientos automáticos
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Select
            value={filterSource || 'all'}
            onValueChange={(value) => setFilterSource(value === 'all' ? null : value)}
          >
            <SelectTrigger className="w-[160px] dark:bg-gray-800 dark:border-gray-700">
              <SelectValue placeholder="Filtrar origen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los orígenes</SelectItem>
              {SOURCE_TYPES.map(source => (
                <SelectItem key={source.value} value={source.value}>{source.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={() => handleOpenDialog()} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Regla
          </Button>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Reglas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{reglas.length}</div>
          </CardContent>
        </Card>
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Reglas Activas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {reglas.filter(r => r.is_active).length}
            </div>
          </CardContent>
        </Card>
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Reglas Inactivas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600 dark:text-gray-300">
              {reglas.filter(r => !r.is_active).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabla */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white">Lista de Reglas</CardTitle>
          <CardDescription className="dark:text-gray-400">
            {filteredReglas.length} reglas encontradas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="dark:border-gray-700">
                  <TableHead className="dark:text-gray-300">Nombre</TableHead>
                  <TableHead className="dark:text-gray-300">Origen</TableHead>
                  <TableHead className="dark:text-gray-300">Evento</TableHead>
                  <TableHead className="dark:text-gray-300">Débito</TableHead>
                  <TableHead className="dark:text-gray-300">Crédito</TableHead>
                  <TableHead className="dark:text-gray-300">Estado</TableHead>
                  <TableHead className="text-right dark:text-gray-300">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReglas.map((regla) => (
                  <TableRow key={regla.id} className={`dark:border-gray-700 ${!regla.is_active ? 'opacity-50' : ''}`}>
                    <TableCell className="font-medium text-gray-900 dark:text-white">
                      {regla.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="dark:border-gray-600">
                        {getSourceLabel(regla.source_type)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-700 dark:text-gray-300">
                      {getEventLabel(regla.event_type)}
                    </TableCell>
                    <TableCell className="text-gray-700 dark:text-gray-300">
                      <span className="text-xs">{regla.debit_account_code}</span>
                    </TableCell>
                    <TableCell className="text-gray-700 dark:text-gray-300">
                      <span className="text-xs">{regla.credit_account_code}</span>
                    </TableCell>
                    <TableCell>
                      {regla.is_active 
                        ? <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Activa</Badge>
                        : <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">Inactiva</Badge>
                      }
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(regla)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDuplicate(regla)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleToggleActive(regla)}>
                          {regla.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(regla.id)} className="text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">
              {editingRule ? 'Editar Regla' : 'Nueva Regla Contable'}
            </DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              Configura la regla para generar asientos automáticos
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Nombre *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ej: Venta con IVA"
                className="dark:bg-gray-900 dark:border-gray-600"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Descripción</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descripción de la regla..."
                className="dark:bg-gray-900 dark:border-gray-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Origen *</Label>
                <Select
                  value={formData.source_type}
                  onValueChange={(value) => setFormData({ ...formData, source_type: value })}
                >
                  <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                    <SelectValue placeholder="Seleccionar origen" />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_TYPES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Evento *</Label>
                <Select
                  value={formData.event_type}
                  onValueChange={(value) => setFormData({ ...formData, event_type: value })}
                >
                  <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                    <SelectValue placeholder="Seleccionar evento" />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map(e => (
                      <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-3">
                <ArrowLeftRight className="h-5 w-5 text-blue-600" />
                <span className="font-medium text-gray-900 dark:text-white">Cuentas Contables</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-gray-700 dark:text-gray-300">Cuenta Débito *</Label>
                  <Select
                    value={formData.debit_account_code}
                    onValueChange={(value) => setFormData({ ...formData, debit_account_code: value })}
                  >
                    <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                      <SelectValue placeholder="Seleccionar cuenta" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {cuentas.map(c => (
                        <SelectItem key={c.account_code} value={c.account_code}>
                          {c.account_code} - {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-700 dark:text-gray-300">Cuenta Crédito *</Label>
                  <Select
                    value={formData.credit_account_code}
                    onValueChange={(value) => setFormData({ ...formData, credit_account_code: value })}
                  >
                    <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                      <SelectValue placeholder="Seleccionar cuenta" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {cuentas.map(c => (
                        <SelectItem key={c.account_code} value={c.account_code}>
                          {c.account_code} - {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Cuenta IVA (opcional)</Label>
              <Select
                value={formData.tax_account_code}
                onValueChange={(value) => setFormData({ ...formData, tax_account_code: value })}
              >
                <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                  <SelectValue placeholder="Seleccionar cuenta de IVA" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="">Sin cuenta de IVA</SelectItem>
                  {cuentas.map(c => (
                    <SelectItem key={c.account_code} value={c.account_code}>
                      {c.account_code} - {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={formData.use_tax_from_document}
                onCheckedChange={(checked) => setFormData({ ...formData, use_tax_from_document: checked })}
              />
              <Label className="text-gray-700 dark:text-gray-300">Usar IVA del documento</Label>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Prioridad</Label>
              <Input
                type="number"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                className="dark:bg-gray-900 dark:border-gray-600"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Menor número = mayor prioridad
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} className="dark:border-gray-600">
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isProcessing} className="bg-blue-600 hover:bg-blue-700">
              {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingRule ? 'Guardar Cambios' : 'Crear Regla'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
