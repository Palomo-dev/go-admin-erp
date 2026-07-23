'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import {
  ArrowLeftRight,
  Plus,
  Search,
  Trash2,
  Loader2,
  RefreshCw,
  ArrowLeft,
  Globe,
  Building2,
} from 'lucide-react';
import { unitConversionService, type UnitConversion } from '@/lib/services/unitConversionService';
import { UnidadesService } from './UnidadesService';
import type { Unit } from './types';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';

export function ConversionesPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();
  const [conversions, setConversions] = useState<UnitConversion[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [showModal, setShowModal] = useState(false);

  const [formData, setFormData] = useState({
    from_unit_code: '',
    to_unit_code: '',
    factor: 1,
  });

  const cargarDatos = useCallback(async () => {
    try {
      setLoading(true);
      const [convs, unitsData] = await Promise.all([
        unitConversionService.getConversions(organization?.id),
        UnidadesService.obtenerUnidades(),
      ]);
      setConversions(convs);
      setUnits(unitsData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las conversiones',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [organization?.id, toast]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const handleCrear = async () => {
    if (!formData.from_unit_code || !formData.to_unit_code) {
      toast({
        title: 'Error',
        description: 'Debe seleccionar ambas unidades',
        variant: 'destructive',
      });
      return;
    }

    if (formData.from_unit_code === formData.to_unit_code) {
      toast({
        title: 'Error',
        description: 'Las unidades deben ser diferentes',
        variant: 'destructive',
      });
      return;
    }

    if (formData.factor <= 0) {
      toast({
        title: 'Error',
        description: 'El factor debe ser mayor a 0',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);
      await unitConversionService.createConversion({
        from_unit_code: formData.from_unit_code,
        to_unit_code: formData.to_unit_code,
        factor: formData.factor,
        organization_id: organization?.id,
      });
      toast({ title: 'Conversión creada' });
      setShowModal(false);
      setFormData({ from_unit_code: '', to_unit_code: '', factor: 1 });
      cargarDatos();
    } catch (error: any) {
      console.error('Error creando conversión:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo crear la conversión',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEliminar = async (id: number) => {
    if (!confirm('¿Está seguro de eliminar esta conversión?')) return;

    try {
      await unitConversionService.deleteConversion(id);
      toast({ title: 'Conversión eliminada' });
      cargarDatos();
    } catch (error: any) {
      console.error('Error eliminando:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo eliminar la conversión',
        variant: 'destructive',
      });
    }
  };

  const getUnitName = (code: string) => {
    const unit = units.find((u) => u.code === code);
    return unit ? `${unit.name} (${unit.code})` : code;
  };

  const conversionsFiltradas = conversions.filter(
    (c) =>
      c.from_unit_code.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.to_unit_code.toLowerCase().includes(busqueda.toLowerCase()) ||
      getUnitName(c.from_unit_code).toLowerCase().includes(busqueda.toLowerCase()) ||
      getUnitName(c.to_unit_code).toLowerCase().includes(busqueda.toLowerCase())
  );

  const conversionsGlobales = conversionsFiltradas.filter((c) => c.organization_id === null);
  const conversionsOrg = conversionsFiltradas.filter((c) => c.organization_id !== null);

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
                <ArrowLeftRight className="h-6 w-6 text-blue-600" />
              </div>
              Conversiones de Unidades
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Inventario / Unidades / Conversiones
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={cargarDatos}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            onClick={() => {
              setFormData({ from_unit_code: '', to_unit_code: '', factor: 1 });
              setShowModal(true);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nueva Conversión
          </Button>
        </div>
      </div>

      {/* Buscador */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por unidad..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="pl-10 dark:bg-gray-900 dark:border-gray-600"
            />
          </div>
        </CardHeader>
      </Card>

      {/* Conversiones de la organización */}
      {conversionsOrg.length > 0 && (
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <Building2 className="h-4 w-4" />
              Conversiones de la Organización
            </div>
          </CardHeader>
          <CardContent>
            <TablaConversiones
              conversions={conversionsOrg}
              loading={loading}
              getUnitName={getUnitName}
              onDelete={handleEliminar}
            />
          </CardContent>
        </Card>
      )}

      {/* Conversiones globales */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <Globe className="h-4 w-4" />
            Conversiones Globales del Sistema
          </div>
        </CardHeader>
        <CardContent>
          <TablaConversiones
            conversions={conversionsGlobales}
            loading={loading}
            getUnitName={getUnitName}
            onDelete={handleEliminar}
            readOnly
          />
        </CardContent>
      </Card>

      {/* Modal crear */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-white">Nueva Conversión</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              Define el factor de conversión entre dos unidades de medida
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="dark:text-gray-300">Unidad Origen *</Label>
              <Select
                value={formData.from_unit_code}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, from_unit_code: v }))}
              >
                <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                  <SelectValue placeholder="Seleccionar unidad..." />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-900 dark:border-gray-700">
                  {units.map((u) => (
                    <SelectItem key={u.code} value={u.code}>
                      {u.name} ({u.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="dark:text-gray-300">Unidad Destino *</Label>
              <Select
                value={formData.to_unit_code}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, to_unit_code: v }))}
              >
                <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                  <SelectValue placeholder="Seleccionar unidad..." />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-900 dark:border-gray-700">
                  {units.map((u) => (
                    <SelectItem key={u.code} value={u.code}>
                      {u.name} ({u.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="dark:text-gray-300">Factor de Conversión *</Label>
              <Input
                type="number"
                step="0.0001"
                min="0.0001"
                value={formData.factor}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, factor: parseFloat(e.target.value) || 1 }))
                }
                className="dark:bg-gray-900 dark:border-gray-600 w-40"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                1 {formData.from_unit_code || 'ORIG'} = {formData.factor}{' '}
                {formData.to_unit_code || 'DEST'}
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
              onClick={handleCrear}
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

interface TablaConversionesProps {
  conversions: UnitConversion[];
  loading: boolean;
  getUnitName: (code: string) => string;
  onDelete: (id: number) => void;
  readOnly?: boolean;
}

function TablaConversiones({
  conversions,
  loading,
  getUnitName,
  onDelete,
  readOnly,
}: TablaConversionesProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg animate-pulse"
          >
            <div className="w-20 h-8 bg-gray-200 dark:bg-gray-600 rounded"></div>
            <div className="w-6 h-4 bg-gray-200 dark:bg-gray-600 rounded"></div>
            <div className="flex-1 h-4 bg-gray-200 dark:bg-gray-600 rounded w-40"></div>
            <div className="w-16 h-4 bg-gray-200 dark:bg-gray-600 rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  if (conversions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <ArrowLeftRight className="w-10 h-10 mx-auto mb-3 opacity-50" />
        <p>No hay conversiones registradas</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="dark:border-gray-700">
          <TableHead className="dark:text-gray-300">Origen</TableHead>
          <TableHead className="dark:text-gray-300 text-center"></TableHead>
          <TableHead className="dark:text-gray-300">Destino</TableHead>
          <TableHead className="dark:text-gray-300 text-center">Factor</TableHead>
          <TableHead className="dark:text-gray-300 text-center">Equivalencia</TableHead>
          {!readOnly && (
            <TableHead className="dark:text-gray-300 text-right">Acciones</TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {conversions.map((conv) => (
          <TableRow
            key={conv.id}
            className="dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
          >
            <TableCell>
              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 font-mono">
                {conv.from_unit_code}
              </Badge>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {getUnitName(conv.from_unit_code)}
              </div>
            </TableCell>
            <TableCell className="text-center">
              <ArrowLeftRight className="h-4 w-4 text-gray-400 mx-auto" />
            </TableCell>
            <TableCell>
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 font-mono">
                {conv.to_unit_code}
              </Badge>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {getUnitName(conv.to_unit_code)}
              </div>
            </TableCell>
            <TableCell className="text-center font-mono dark:text-gray-300">
              {conv.factor}
            </TableCell>
            <TableCell className="text-center text-sm text-gray-600 dark:text-gray-400">
              1 {conv.from_unit_code} = {conv.factor} {conv.to_unit_code}
            </TableCell>
            {!readOnly && (
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(conv.id)}
                  className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default ConversionesPage;
