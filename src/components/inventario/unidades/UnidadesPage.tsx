'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { 
  Ruler, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Copy,
  Loader2,
  RefreshCw,
  AlertTriangle,
  ArrowLeft
} from 'lucide-react';
import { UnidadesService } from './UnidadesService';
import { Unit } from './types';
import { useToast } from '@/components/ui/use-toast';

export function UnidadesPage() {
  const { toast } = useToast();
  const [unidades, setUnidades] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<Unit | null>(null);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    conversion_factor: 1
  });

  useEffect(() => {
    cargarUnidades();
  }, []);

  const cargarUnidades = async () => {
    try {
      setLoading(true);
      const data = await UnidadesService.obtenerUnidades();
      setUnidades(data);
    } catch (error) {
      console.error('Error cargando unidades:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las unidades',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const abrirModalNuevo = () => {
    setEditando(null);
    setFormData({ code: '', name: '', conversion_factor: 1 });
    setShowModal(true);
  };

  const abrirModalEditar = (unidad: Unit) => {
    setEditando(unidad);
    setFormData({ 
      code: unidad.code, 
      name: unidad.name, 
      conversion_factor: unidad.conversion_factor 
    });
    setShowModal(true);
  };

  const handleGuardar = async () => {
    if (!formData.code.trim() || !formData.name.trim()) {
      toast({
        title: 'Error',
        description: 'El código y nombre son requeridos',
        variant: 'destructive'
      });
      return;
    }

    try {
      setSaving(true);
      
      if (editando) {
        await UnidadesService.actualizarUnidad(editando.code, {
          name: formData.name,
          conversion_factor: formData.conversion_factor
        });
        toast({ title: 'Unidad actualizada' });
      } else {
        await UnidadesService.crearUnidad(formData);
        toast({ title: 'Unidad creada' });
      }

      setShowModal(false);
      cargarUnidades();
    } catch (error: any) {
      console.error('Error guardando:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo guardar la unidad',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEliminar = async (code: string) => {
    if (!confirm('¿Está seguro de eliminar esta unidad?')) return;

    try {
      await UnidadesService.eliminarUnidad(code);
      toast({ title: 'Unidad eliminada' });
      cargarUnidades();
    } catch (error: any) {
      console.error('Error eliminando:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo eliminar la unidad',
        variant: 'destructive'
      });
    }
  };

  const handleDuplicar = async (code: string) => {
    try {
      await UnidadesService.duplicarUnidad(code);
      toast({ title: 'Unidad duplicada' });
      cargarUnidades();
    } catch (error) {
      console.error('Error duplicando:', error);
      toast({
        title: 'Error',
        description: 'No se pudo duplicar la unidad',
        variant: 'destructive'
      });
    }
  };

  const unidadesFiltradas = unidades.filter(u =>
    u.name.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.code.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/inventario">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <Ruler className="h-6 w-6 text-blue-600" />
              </div>
              Unidades de Medida
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Inventario / Unidades
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={cargarUnidades}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            onClick={abrirModalNuevo}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nueva Unidad
          </Button>
        </div>
      </div>

      {/* Contenido */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por código o nombre..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="pl-10 dark:bg-gray-900 dark:border-gray-600"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg animate-pulse">
                  <div className="w-16 h-8 bg-gray-200 dark:bg-gray-600 rounded"></div>
                  <div className="flex-1 h-4 bg-gray-200 dark:bg-gray-600 rounded w-40"></div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-20"></div>
                </div>
              ))}
            </div>
          ) : unidadesFiltradas.length === 0 ? (
            <div className="text-center py-10 text-gray-500 dark:text-gray-400">
              <Ruler className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No hay unidades de medida</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="dark:border-gray-700">
                  <TableHead className="dark:text-gray-300">Código</TableHead>
                  <TableHead className="dark:text-gray-300">Nombre</TableHead>
                  <TableHead className="dark:text-gray-300 text-center">Factor</TableHead>
                  <TableHead className="dark:text-gray-300 text-center">Productos</TableHead>
                  <TableHead className="dark:text-gray-300 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unidadesFiltradas.map(unidad => (
                  <TableRow key={unidad.code} className="dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <TableCell>
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 font-mono text-sm font-medium">
                        {unidad.code}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium dark:text-white">
                      {unidad.name}
                    </TableCell>
                    <TableCell className="text-center dark:text-gray-300">
                      <span className="font-mono">{unidad.conversion_factor}</span>
                    </TableCell>
                    <TableCell className="text-center dark:text-gray-300">
                      {unidad.product_count || 0}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => abrirModalEditar(unidad)}
                          className="h-8 w-8 p-0"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDuplicar(unidad.code)}
                          className="h-8 w-8 p-0"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEliminar(unidad.code)}
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                          disabled={(unidad.product_count || 0) > 0}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-white">
              {editando ? 'Editar Unidad' : 'Nueva Unidad'}
            </DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              {editando ? 'Modificar información de la unidad' : 'Crear una nueva unidad de medida'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="dark:text-gray-300">Código *</Label>
              <Input
                value={formData.code}
                onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                placeholder="Ej: KG, LT, UN, M..."
                className="dark:bg-gray-900 dark:border-gray-600 font-mono uppercase"
                maxLength={10}
                disabled={!!editando}
              />
              {editando && (
                <p className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  El código no se puede modificar
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="dark:text-gray-300">Nombre *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ej: Kilogramo, Litro, Unidad, Metro..."
                className="dark:bg-gray-900 dark:border-gray-600"
              />
            </div>

            <div className="space-y-2">
              <Label className="dark:text-gray-300">Factor de Conversión</Label>
              <Input
                type="number"
                step="0.0001"
                min="0.0001"
                value={formData.conversion_factor}
                onChange={(e) => setFormData(prev => ({ ...prev, conversion_factor: parseFloat(e.target.value) || 1 }))}
                className="dark:bg-gray-900 dark:border-gray-600 w-40"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Factor para convertir a la unidad base (1 = unidad base)
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowModal(false)}
              className="dark:border-gray-600"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleGuardar}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                'Guardar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
