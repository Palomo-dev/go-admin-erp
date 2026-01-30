'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';
import {
  Hash,
  Plus,
  RefreshCw,
  ArrowLeft,
  Search,
  Edit,
  Trash2,
  Copy,
  Loader2,
  MoreVertical,
  Download,
  Upload,
  RotateCcw,
  Eye,
} from 'lucide-react';
import { 
  ConsecutivosService, 
  SaleSequence, 
  SaleSequenceFormData,
  Branch,
  ConsecutivosStats,
  SEQUENCE_TYPES,
  RESET_PERIODS,
} from './consecutivosService';

export function ConsecutivosPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Datos
  const [sequences, setSequences] = useState<SaleSequence[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [stats, setStats] = useState<ConsecutivosStats | null>(null);

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<SaleSequence | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<SaleSequenceFormData>({
    branch_id: 0,
    sequence_type: 'sale',
    prefix: '',
    current_number: 0,
    padding: 6,
    reset_period: null,
    is_active: true,
  });

  // Delete/Reset dialogs
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Import dialog
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importData, setImportData] = useState('');

  const loadData = useCallback(async (showRefresh = false) => {
    if (showRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [sequencesData, branchesData, statsData] = await Promise.all([
        ConsecutivosService.getSequences(),
        ConsecutivosService.getBranches(),
        ConsecutivosService.getStats(),
      ]);

      setSequences(sequencesData);
      setBranches(branchesData);
      setStats(statsData);
    } catch (error) {
      console.error('Error cargando consecutivos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los consecutivos',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openModalNuevo = () => {
    setEditando(null);
    setFormData({
      branch_id: branches[0]?.id || 0,
      sequence_type: 'sale',
      prefix: '',
      current_number: 0,
      padding: 6,
      reset_period: null,
      is_active: true,
    });
    setShowModal(true);
  };

  const openModalEditar = (seq: SaleSequence) => {
    setEditando(seq);
    setFormData({
      branch_id: seq.branch_id,
      sequence_type: seq.sequence_type,
      prefix: seq.prefix || '',
      current_number: seq.current_number,
      padding: seq.padding,
      reset_period: seq.reset_period,
      is_active: seq.is_active,
    });
    setShowModal(true);
  };

  const handleGuardar = async () => {
    if (!formData.branch_id) {
      toast({
        title: 'Error',
        description: 'Seleccione una sucursal',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);
      if (editando) {
        await ConsecutivosService.updateSequence(editando.id, formData);
        toast({ title: 'Consecutivo actualizado' });
      } else {
        await ConsecutivosService.createSequence(formData);
        toast({ title: 'Consecutivo creado' });
      }
      setShowModal(false);
      loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo guardar',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicar = async (id: number) => {
    try {
      await ConsecutivosService.duplicateSequence(id);
      toast({ title: 'Consecutivo duplicado' });
      loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo duplicar',
        variant: 'destructive',
      });
    }
  };

  const handleEliminar = async () => {
    if (!selectedId) return;

    try {
      await ConsecutivosService.deleteSequence(selectedId);
      toast({ title: 'Consecutivo eliminado' });
      loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo eliminar',
        variant: 'destructive',
      });
    } finally {
      setShowDeleteConfirm(false);
      setSelectedId(null);
    }
  };

  const handleReset = async () => {
    if (!selectedId) return;

    try {
      await ConsecutivosService.resetSequence(selectedId);
      toast({ title: 'Consecutivo reseteado a 0' });
      loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo resetear',
        variant: 'destructive',
      });
    } finally {
      setShowResetConfirm(false);
      setSelectedId(null);
    }
  };

  const handleImport = async () => {
    if (!importData.trim()) {
      toast({ title: 'Error', description: 'Ingrese datos CSV', variant: 'destructive' });
      return;
    }

    try {
      const result = await ConsecutivosService.importFromCSV(importData);
      toast({
        title: 'Importación completada',
        description: `${result.success} registros importados. ${result.errors.length} errores.`,
      });
      if (result.errors.length > 0) {
        console.error('Errores de importación:', result.errors);
      }
      setShowImportDialog(false);
      setImportData('');
      loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Error en la importación',
        variant: 'destructive',
      });
    }
  };

  const handleExport = () => {
    if (sequences.length === 0) {
      toast({ title: 'Sin datos', description: 'No hay consecutivos para exportar' });
      return;
    }
    ConsecutivosService.exportToCSV(sequences);
    toast({ title: 'Exportado', description: 'Archivo CSV descargado' });
  };

  const getSequenceTypeName = (type: string): string => {
    return SEQUENCE_TYPES.find(t => t.value === type)?.label || type;
  };

  const getResetPeriodName = (period: string | null): string => {
    return RESET_PERIODS.find(p => p.value === period)?.label || 'Sin reset';
  };

  const filteredSequences = sequences.filter(seq =>
    seq.prefix?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    seq.sequence_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    seq.branches?.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/pos/configuracion">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <Hash className="h-6 w-6 text-blue-600" />
              </div>
              Consecutivos de Ventas
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              POS / Configuración / Consecutivos
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => loadData(true)} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" onClick={() => setShowImportDialog(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Button onClick={openModalNuevo} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Consecutivo
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Hash className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.total || 0}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Consecutivos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Eye className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.active || 0}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Activos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Hash className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {Object.keys(stats?.byType || {}).length}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Tipos</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabla */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
              Lista de Consecutivos
            </CardTitle>
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar consecutivos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredSequences.length === 0 ? (
            <div className="text-center py-8">
              <Hash className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">No hay consecutivos configurados</p>
              <Button onClick={openModalNuevo} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="h-4 w-4 mr-2" />
                Crear Primer Consecutivo
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-3 text-gray-600 dark:text-gray-400">Sucursal</th>
                    <th className="text-left py-3 px-3 text-gray-600 dark:text-gray-400">Tipo</th>
                    <th className="text-left py-3 px-3 text-gray-600 dark:text-gray-400">Prefijo</th>
                    <th className="text-center py-3 px-3 text-gray-600 dark:text-gray-400">Padding</th>
                    <th className="text-right py-3 px-3 text-gray-600 dark:text-gray-400">Número Actual</th>
                    <th className="text-left py-3 px-3 text-gray-600 dark:text-gray-400">Preview</th>
                    <th className="text-left py-3 px-3 text-gray-600 dark:text-gray-400">Reset</th>
                    <th className="text-center py-3 px-3 text-gray-600 dark:text-gray-400">Estado</th>
                    <th className="text-center py-3 px-3 text-gray-600 dark:text-gray-400">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSequences.map((seq) => (
                    <tr key={seq.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="py-3 px-3 text-gray-900 dark:text-white">
                        {seq.branches?.name || 'Sin sucursal'}
                      </td>
                      <td className="py-3 px-3">
                        <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                          {getSequenceTypeName(seq.sequence_type)}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-gray-900 dark:text-white font-mono">
                        {seq.prefix || '-'}
                      </td>
                      <td className="py-3 px-3 text-center text-gray-600 dark:text-gray-400">
                        {seq.padding}
                      </td>
                      <td className="py-3 px-3 text-right text-gray-900 dark:text-white font-mono">
                        {seq.current_number}
                      </td>
                      <td className="py-3 px-3 text-gray-600 dark:text-gray-400 font-mono text-sm">
                        {ConsecutivosService.generatePreview(seq.prefix, seq.current_number + 1, seq.padding)}
                      </td>
                      <td className="py-3 px-3 text-gray-600 dark:text-gray-400">
                        {getResetPeriodName(seq.reset_period)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <Badge className={seq.is_active 
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                        }>
                          {seq.is_active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openModalEditar(seq)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDuplicar(seq.id)}>
                              <Copy className="h-4 w-4 mr-2" />
                              Duplicar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                              setSelectedId(seq.id);
                              setShowResetConfirm(true);
                            }}>
                              <RotateCcw className="h-4 w-4 mr-2" />
                              Resetear
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => {
                                setSelectedId(seq.id);
                                setShowDeleteConfirm(true);
                              }}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Crear/Editar */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-[500px] bg-white dark:bg-gray-800">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">
              {editando ? 'Editar Consecutivo' : 'Nuevo Consecutivo'}
            </DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-gray-400">
              Configure los parámetros del consecutivo de ventas
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label className="text-gray-700 dark:text-gray-300">Sucursal *</Label>
              <Select 
                value={formData.branch_id?.toString()} 
                onValueChange={(v) => setFormData({...formData, branch_id: parseInt(v)})}
              >
                <SelectTrigger className="mt-1 dark:bg-gray-900 dark:border-gray-600">
                  <SelectValue placeholder="Seleccione sucursal" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id.toString()}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-gray-700 dark:text-gray-300">Tipo de Secuencia *</Label>
              <Select 
                value={formData.sequence_type} 
                onValueChange={(v) => setFormData({...formData, sequence_type: v})}
              >
                <SelectTrigger className="mt-1 dark:bg-gray-900 dark:border-gray-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEQUENCE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-gray-700 dark:text-gray-300">Prefijo</Label>
              <Input
                value={formData.prefix}
                onChange={(e) => setFormData({...formData, prefix: e.target.value.toUpperCase()})}
                placeholder="Ej: VTA-, PED-, COT-"
                className="mt-1 dark:bg-gray-900 dark:border-gray-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-700 dark:text-gray-300">Número Actual</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.current_number}
                  onChange={(e) => setFormData({...formData, current_number: parseInt(e.target.value) || 0})}
                  className="mt-1 dark:bg-gray-900 dark:border-gray-600"
                />
              </div>
              <div>
                <Label className="text-gray-700 dark:text-gray-300">Padding (dígitos)</Label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={formData.padding}
                  onChange={(e) => setFormData({...formData, padding: parseInt(e.target.value) || 6})}
                  className="mt-1 dark:bg-gray-900 dark:border-gray-600"
                />
              </div>
            </div>

            <div>
              <Label className="text-gray-700 dark:text-gray-300">Período de Reset</Label>
              <Select 
                value={formData.reset_period || 'null'} 
                onValueChange={(v) => setFormData({...formData, reset_period: v === 'null' ? null : v})}
              >
                <SelectTrigger className="mt-1 dark:bg-gray-900 dark:border-gray-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESET_PERIODS.map((period) => (
                    <SelectItem key={period.value || 'null'} value={period.value || 'null'}>
                      {period.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Activo</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">El consecutivo está en uso</p>
              </div>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({...formData, is_active: checked})}
              />
            </div>

            {/* Preview */}
            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Preview del próximo consecutivo:</p>
              <p className="text-xl font-mono font-bold text-blue-600 dark:text-blue-400">
                {ConsecutivosService.generatePreview(formData.prefix, formData.current_number + 1, formData.padding)}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleGuardar} 
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editando ? 'Actualizar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alert Dialog Eliminar */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              ¿Eliminar consecutivo?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Esta acción no se puede deshacer. El consecutivo será eliminado permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleEliminar}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Alert Dialog Resetear */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              ¿Resetear consecutivo?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              El número actual se pondrá en 0. El siguiente documento empezará desde el número 1.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleReset}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              Resetear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Importar */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="sm:max-w-[500px] bg-white dark:bg-gray-800">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">Importar Consecutivos</DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-gray-400">
              Pegue los datos en formato CSV (con encabezados)
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <textarea
              value={importData}
              onChange={(e) => setImportData(e.target.value)}
              placeholder="branch_id,sequence_type,prefix,current_number,padding,reset_period,is_active"
              className="w-full h-40 p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-mono text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleImport} className="bg-blue-600 hover:bg-blue-700 text-white">
              Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
