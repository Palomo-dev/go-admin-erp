'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { FileText, Plus, Loader2, Edit, Trash2, Copy, Check, ArrowLeft, Search, Filter, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ContabilidadService, JournalEntry, ChartAccount } from '../ContabilidadService';
import { formatCurrency, formatNumber } from '@/utils/Utils';

interface JournalLineInput {
  account_code: string;
  description: string;
  debit: string;
  credit: string;
}

export function AsientosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [asientos, setAsientos] = useState<JournalEntry[]>([]);
  const [cuentas, setCuentas] = useState<ChartAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [filterPosted, setFilterPosted] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    entry_date: new Date().toISOString().split('T')[0],
    memo: '',
    lines: [
      { account_code: '', description: '', debit: '', credit: '' },
      { account_code: '', description: '', debit: '', credit: '' }
    ] as JournalLineInput[]
  });

  useEffect(() => {
    loadData();
    // Si viene con action=new, abrir dialog
    if (searchParams.get('action') === 'new') {
      setShowDialog(true);
    }
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [asientosData, cuentasData] = await Promise.all([
        ContabilidadService.obtenerAsientos(),
        ContabilidadService.obtenerPlanCuentas()
      ]);
      setAsientos(asientosData);
      setCuentas(cuentasData.filter(c => c.is_active));
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast.error('Error al cargar los datos');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      entry_date: new Date().toISOString().split('T')[0],
      memo: '',
      lines: [
        { account_code: '', description: '', debit: '', credit: '' },
        { account_code: '', description: '', debit: '', credit: '' }
      ]
    });
  };

  const addLine = () => {
    setFormData({
      ...formData,
      lines: [...formData.lines, { account_code: '', description: '', debit: '', credit: '' }]
    });
  };

  const removeLine = (index: number) => {
    if (formData.lines.length <= 2) return;
    setFormData({
      ...formData,
      lines: formData.lines.filter((_, i) => i !== index)
    });
  };

  const updateLine = (index: number, field: keyof JournalLineInput, value: string) => {
    const newLines = [...formData.lines];
    newLines[index] = { ...newLines[index], [field]: value };
    setFormData({ ...formData, lines: newLines });
  };

  const getTotalDebits = () => formData.lines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
  const getTotalCredits = () => formData.lines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);
  const isBalanced = () => Math.abs(getTotalDebits() - getTotalCredits()) < 0.01;

  const handleSave = async () => {
    if (!formData.entry_date) {
      toast.error('La fecha es requerida');
      return;
    }

    const validLines = formData.lines.filter(l => l.account_code && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0));
    if (validLines.length < 2) {
      toast.error('Se requieren al menos 2 líneas con valores');
      return;
    }

    if (!isBalanced()) {
      toast.error('El asiento debe estar balanceado (débitos = créditos)');
      return;
    }

    try {
      setIsProcessing(true);
      await ContabilidadService.crearAsiento({
        entry_date: formData.entry_date,
        memo: formData.memo,
        lines: validLines.map(l => ({
          account_code: l.account_code,
          description: l.description,
          debit: parseFloat(l.debit) || 0,
          credit: parseFloat(l.credit) || 0
        }))
      });
      toast.success('Asiento creado exitosamente');
      setShowDialog(false);
      resetForm();
      loadData();
    } catch (error) {
      console.error('Error creando asiento:', error);
      toast.error('Error al crear el asiento');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePublish = async (id: number) => {
    try {
      await ContabilidadService.publicarAsiento(id);
      toast.success('Asiento publicado exitosamente');
      loadData();
    } catch (error) {
      toast.error('Error al publicar el asiento');
    }
  };

  const handleDuplicate = async (id: number) => {
    try {
      await ContabilidadService.duplicarAsiento(id);
      toast.success('Asiento duplicado exitosamente');
      loadData();
    } catch (error) {
      toast.error('Error al duplicar el asiento');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de eliminar este asiento?')) return;
    try {
      await ContabilidadService.eliminarAsiento(id);
      toast.success('Asiento eliminado exitosamente');
      loadData();
    } catch (error) {
      toast.error('Error al eliminar el asiento');
    }
  };

  const filteredAsientos = asientos.filter(a => {
    if (filterPosted === 'posted' && !a.posted) return false;
    if (filterPosted === 'draft' && a.posted) return false;
    if (filterSource !== 'all' && a.source !== filterSource) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      if (!a.memo?.toLowerCase().includes(term) && !a.id.toString().includes(term)) return false;
    }
    return true;
  });

  const uniqueSources = Array.from(new Set(asientos.map(a => a.source).filter(Boolean)));

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
          <Link href="/app/finanzas/contabilidad">
            <Button variant="ghost" size="icon" className="hover:bg-gray-100 dark:hover:bg-gray-800">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <FileText className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Asientos Contables
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Registro y gestión de asientos
            </p>
          </div>
        </div>

        <Button onClick={() => setShowDialog(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Asiento
        </Button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Asientos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{asientos.length}</div>
          </CardContent>
        </Card>
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Publicados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {asientos.filter(a => a.posted).length}
            </div>
          </CardContent>
        </Card>
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Borradores</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
              {asientos.filter(a => !a.posted).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardContent className="py-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por ID o memo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
            <Select value={filterPosted} onValueChange={setFilterPosted}>
              <SelectTrigger className="w-[150px] dark:bg-gray-900 dark:border-gray-600">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="posted">Publicados</SelectItem>
                <SelectItem value="draft">Borradores</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterSource} onValueChange={setFilterSource}>
              <SelectTrigger className="w-[150px] dark:bg-gray-900 dark:border-gray-600">
                <SelectValue placeholder="Origen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los orígenes</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                {uniqueSources.map(s => s && (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white">Lista de Asientos</CardTitle>
          <CardDescription className="dark:text-gray-400">
            {filteredAsientos.length} asientos encontrados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="dark:border-gray-700">
                <TableHead className="dark:text-gray-300">ID</TableHead>
                <TableHead className="dark:text-gray-300">Fecha</TableHead>
                <TableHead className="dark:text-gray-300">Memo</TableHead>
                <TableHead className="dark:text-gray-300">Origen</TableHead>
                <TableHead className="dark:text-gray-300">Estado</TableHead>
                <TableHead className="text-right dark:text-gray-300">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAsientos.map((asiento) => (
                <TableRow key={asiento.id} className="dark:border-gray-700">
                  <TableCell className="font-mono text-gray-900 dark:text-white">
                    #{asiento.id}
                  </TableCell>
                  <TableCell className="text-gray-700 dark:text-gray-300">
                    {new Date(asiento.entry_date).toLocaleDateString('es-CO')}
                  </TableCell>
                  <TableCell className="text-gray-700 dark:text-gray-300 max-w-xs truncate">
                    {asiento.memo || '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="dark:border-gray-600">
                      {asiento.source || 'manual'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {asiento.posted 
                      ? <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Publicado</Badge>
                      : <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">Borrador</Badge>
                    }
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Link href={`/app/finanzas/contabilidad/asientos/${asiento.id}`}>
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                      {!asiento.posted && (
                        <Button variant="ghost" size="sm" onClick={() => handlePublish(asiento.id)} className="text-green-600">
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => handleDuplicate(asiento.id)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      {!asiento.posted && (
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(asiento.id)} className="text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog Nuevo Asiento */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">Nuevo Asiento Contable</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              Crea un nuevo asiento con sus líneas de débito y crédito
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Fecha *</Label>
                <Input
                  type="date"
                  value={formData.entry_date}
                  onChange={(e) => setFormData({ ...formData, entry_date: e.target.value })}
                  className="dark:bg-gray-900 dark:border-gray-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Memo</Label>
                <Input
                  value={formData.memo}
                  onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                  placeholder="Descripción del asiento"
                  className="dark:bg-gray-900 dark:border-gray-600"
                />
              </div>
            </div>

            {/* Líneas */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="text-gray-700 dark:text-gray-300">Líneas del Asiento</Label>
                <Button type="button" variant="outline" size="sm" onClick={addLine} className="dark:border-gray-600">
                  <Plus className="h-4 w-4 mr-1" /> Agregar Línea
                </Button>
              </div>
              
              <div className="border rounded-lg dark:border-gray-700 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="dark:border-gray-700">
                      <TableHead className="dark:text-gray-300">Cuenta</TableHead>
                      <TableHead className="dark:text-gray-300">Descripción</TableHead>
                      <TableHead className="dark:text-gray-300 w-32">Débito</TableHead>
                      <TableHead className="dark:text-gray-300 w-32">Crédito</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formData.lines.map((line, index) => (
                      <TableRow key={index} className="dark:border-gray-700">
                        <TableCell>
                          <Select
                            value={line.account_code}
                            onValueChange={(v) => updateLine(index, 'account_code', v)}
                          >
                            <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                              <SelectValue placeholder="Seleccionar" />
                            </SelectTrigger>
                            <SelectContent className="max-h-60">
                              {cuentas.map(c => (
                                <SelectItem key={c.account_code} value={c.account_code}>
                                  {c.account_code} - {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            value={line.description}
                            onChange={(e) => updateLine(index, 'description', e.target.value)}
                            placeholder="Descripción"
                            className="dark:bg-gray-900 dark:border-gray-600"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={line.debit}
                            onChange={(e) => updateLine(index, 'debit', e.target.value)}
                            placeholder="0.00"
                            className="dark:bg-gray-900 dark:border-gray-600"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={line.credit}
                            onChange={(e) => updateLine(index, 'credit', e.target.value)}
                            placeholder="0.00"
                            className="dark:bg-gray-900 dark:border-gray-600"
                          />
                        </TableCell>
                        <TableCell>
                          {formData.lines.length > 2 && (
                            <Button variant="ghost" size="sm" onClick={() => removeLine(index)} className="text-red-600">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Totales */}
              <div className="flex justify-end gap-8 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">Total Débitos:</span>
                  <span className="ml-2 font-bold text-gray-900 dark:text-white">
                    {formatCurrency(getTotalDebits())}
                  </span>
                </div>
                <div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">Total Créditos:</span>
                  <span className="ml-2 font-bold text-gray-900 dark:text-white">
                    {formatCurrency(getTotalCredits())}
                  </span>
                </div>
                <div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">Diferencia:</span>
                  <span className={`ml-2 font-bold ${isBalanced() ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(Math.abs(getTotalDebits() - getTotalCredits()))}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} className="dark:border-gray-600">
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isProcessing || !isBalanced()} className="bg-blue-600 hover:bg-blue-700">
              {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crear Asiento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
