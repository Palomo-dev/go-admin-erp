'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Tags, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Copy,
  Loader2,
  RefreshCw,
  ArrowLeft
} from 'lucide-react';
import { EtiquetasService } from './EtiquetasService';
import { ProductTag } from './types';
import { useToast } from '@/components/ui/use-toast';

const COLORES_PREDEFINIDOS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

export function EtiquetasPage() {
  const { toast } = useToast();
  const [etiquetas, setEtiquetas] = useState<ProductTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<ProductTag | null>(null);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    color: '#3B82F6'
  });

  useEffect(() => {
    cargarEtiquetas();
  }, []);

  const cargarEtiquetas = async () => {
    try {
      setLoading(true);
      const data = await EtiquetasService.obtenerEtiquetas();
      setEtiquetas(data);
    } catch (error) {
      console.error('Error cargando etiquetas:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las etiquetas',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const abrirModalNuevo = () => {
    setEditando(null);
    setFormData({ name: '', color: '#3B82F6' });
    setShowModal(true);
  };

  const abrirModalEditar = (etiqueta: ProductTag) => {
    setEditando(etiqueta);
    setFormData({ name: etiqueta.name, color: etiqueta.color });
    setShowModal(true);
  };

  const handleGuardar = async () => {
    if (!formData.name.trim()) {
      toast({
        title: 'Error',
        description: 'El nombre es requerido',
        variant: 'destructive'
      });
      return;
    }

    try {
      setSaving(true);
      
      if (editando) {
        await EtiquetasService.actualizarEtiqueta(editando.id, formData);
        toast({ title: 'Etiqueta actualizada' });
      } else {
        await EtiquetasService.crearEtiqueta(formData);
        toast({ title: 'Etiqueta creada' });
      }

      setShowModal(false);
      cargarEtiquetas();
    } catch (error) {
      console.error('Error guardando:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar la etiqueta',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEliminar = async (id: number) => {
    if (!confirm('¿Está seguro de eliminar esta etiqueta?')) return;

    try {
      await EtiquetasService.eliminarEtiqueta(id);
      toast({ title: 'Etiqueta eliminada' });
      cargarEtiquetas();
    } catch (error) {
      console.error('Error eliminando:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la etiqueta',
        variant: 'destructive'
      });
    }
  };

  const handleDuplicar = async (id: number) => {
    try {
      await EtiquetasService.duplicarEtiqueta(id);
      toast({ title: 'Etiqueta duplicada' });
      cargarEtiquetas();
    } catch (error) {
      console.error('Error duplicando:', error);
      toast({
        title: 'Error',
        description: 'No se pudo duplicar la etiqueta',
        variant: 'destructive'
      });
    }
  };

  const etiquetasFiltradas = etiquetas.filter(e =>
    e.name.toLowerCase().includes(busqueda.toLowerCase())
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
                <Tags className="h-6 w-6 text-blue-600" />
              </div>
              Etiquetas de Productos
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Inventario / Etiquetas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={cargarEtiquetas}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            onClick={abrirModalNuevo}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nueva Etiqueta
          </Button>
        </div>
      </div>

      {/* Contenido */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar etiquetas..."
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
                  <div className="w-8 h-8 bg-gray-200 dark:bg-gray-600 rounded-full"></div>
                  <div className="flex-1 h-4 bg-gray-200 dark:bg-gray-600 rounded w-40"></div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-16"></div>
                </div>
              ))}
            </div>
          ) : etiquetasFiltradas.length === 0 ? (
            <div className="text-center py-10 text-gray-500 dark:text-gray-400">
              <Tags className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No hay etiquetas</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="dark:border-gray-700">
                  <TableHead className="dark:text-gray-300">Color</TableHead>
                  <TableHead className="dark:text-gray-300">Nombre</TableHead>
                  <TableHead className="dark:text-gray-300 text-center">Productos</TableHead>
                  <TableHead className="dark:text-gray-300 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {etiquetasFiltradas.map(etiqueta => (
                  <TableRow key={etiqueta.id} className="dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <TableCell>
                      <div 
                        className="w-8 h-8 rounded-full shadow-inner border-2 border-white dark:border-gray-700"
                        style={{ backgroundColor: etiqueta.color }}
                      />
                    </TableCell>
                    <TableCell className="font-medium dark:text-white">
                      <span 
                        className="inline-flex items-center px-3 py-1 rounded-full text-sm"
                        style={{ 
                          backgroundColor: `${etiqueta.color}20`,
                          color: etiqueta.color
                        }}
                      >
                        {etiqueta.name}
                      </span>
                    </TableCell>
                    <TableCell className="text-center dark:text-gray-300">
                      {etiqueta.product_count || 0}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => abrirModalEditar(etiqueta)}
                          className="h-8 w-8 p-0"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDuplicar(etiqueta.id)}
                          className="h-8 w-8 p-0"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEliminar(etiqueta.id)}
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
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
              {editando ? 'Editar Etiqueta' : 'Nueva Etiqueta'}
            </DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              {editando ? 'Modificar información de la etiqueta' : 'Crear una nueva etiqueta para productos'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="dark:text-gray-300">Nombre</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ej: Oferta, Nuevo, Popular..."
                className="dark:bg-gray-900 dark:border-gray-600"
              />
            </div>

            <div className="space-y-2">
              <Label className="dark:text-gray-300">Color</Label>
              <div className="flex items-center gap-3">
                <div 
                  className="w-12 h-12 rounded-lg border-2 border-gray-200 dark:border-gray-600 shadow-inner"
                  style={{ backgroundColor: formData.color }}
                />
                <Input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                  className="w-20 h-10 p-1 cursor-pointer"
                />
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {COLORES_PREDEFINIDOS.map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, color }))}
                    className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                      formData.color === color ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            {/* Preview */}
            <div className="pt-4 border-t dark:border-gray-700">
              <Label className="dark:text-gray-300 text-sm">Vista previa</Label>
              <div className="mt-2">
                <span 
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
                  style={{ 
                    backgroundColor: `${formData.color}20`,
                    color: formData.color
                  }}
                >
                  {formData.name || 'Nombre de etiqueta'}
                </span>
              </div>
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
