'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Filter,
  Plus,
  Trash2,
  Eye,
  Loader2,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { SegmentosService } from '../SegmentosService';
import { FilterRule, FILTER_FIELDS, FILTER_OPERATORS } from '../types';

export function SegmentoNuevoPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isDynamic, setIsDynamic] = useState(true);
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<{ customers: any[]; count: number } | null>(null);

  const addFilter = () => {
    setFilters([...filters, { field: 'full_name', operator: 'contains', value: '' }]);
  };

  const updateFilter = (index: number, updates: Partial<FilterRule>) => {
    const newFilters = [...filters];
    newFilters[index] = { ...newFilters[index], ...updates };
    setFilters(newFilters);
  };

  const removeFilter = (index: number) => {
    setFilters(filters.filter((_, i) => i !== index));
  };

  const getFieldType = (fieldValue: string): string => {
    const field = FILTER_FIELDS.find(f => f.value === fieldValue);
    return field?.type || 'text';
  };

  const handlePreview = async () => {
    setIsPreviewing(true);
    try {
      const result = await SegmentosService.previewFilter(filters);
      setPreviewData(result);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo obtener la vista previa',
        variant: 'destructive',
      });
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: 'Error',
        description: 'El nombre es requerido',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const segment = await SegmentosService.createSegment({
        name,
        description: description || undefined,
        filter_json: filters,
        is_dynamic: isDynamic,
      });

      if (segment) {
        // Recalcular para obtener el conteo inicial
        await SegmentosService.recalculateSegment(segment.id);
        
        toast({
          title: 'Segmento creado',
          description: 'El segmento se ha creado correctamente',
        });
        router.push(`/app/crm/segmentos/${segment.id}`);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo crear el segmento',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/crm/segmentos">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <Filter className="h-6 w-6 text-blue-600" />
              </div>
              Nuevo Segmento
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              CRM / Segmentos / Nuevo
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              'Crear Segmento'
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulario principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Información básica */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-gray-100">
                Información del segmento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Nombre *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Clientes VIP de Bogotá"
                  className="bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Descripción</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe el propósito del segmento..."
                  rows={3}
                  className="bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                />
              </div>
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">Segmento dinámico</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Se recalcula automáticamente cuando cambian los datos
                  </p>
                </div>
                <Switch
                  checked={isDynamic}
                  onCheckedChange={setIsDynamic}
                />
              </div>
            </CardContent>
          </Card>

          {/* Builder de filtros */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-gray-900 dark:text-gray-100">
                Reglas de filtro
              </CardTitle>
              <Button variant="outline" size="sm" onClick={addFilter}>
                <Plus className="h-4 w-4 mr-2" />
                Agregar regla
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {filters.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <Filter className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay reglas definidas</p>
                  <p className="text-sm">Agrega reglas para filtrar clientes</p>
                </div>
              ) : (
                filters.map((filter, index) => {
                  const fieldType = getFieldType(filter.field);
                  const operators = FILTER_OPERATORS[fieldType] || FILTER_OPERATORS.text;

                  return (
                    <div
                      key={index}
                      className="flex flex-wrap items-center gap-2 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg"
                    >
                      <Select
                        value={filter.field}
                        onValueChange={(value) => updateFilter(index, { field: value, operator: 'contains', value: '' })}
                      >
                        <SelectTrigger className="w-40 bg-white dark:bg-gray-800">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FILTER_FIELDS.map((field) => (
                            <SelectItem key={field.value} value={field.value}>
                              {field.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={filter.operator}
                        onValueChange={(value) => updateFilter(index, { operator: value as any })}
                      >
                        <SelectTrigger className="w-36 bg-white dark:bg-gray-800">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {operators.map((op) => (
                            <SelectItem key={op.value} value={op.value}>
                              {op.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {!['is_empty', 'is_not_empty'].includes(filter.operator) && (
                        <Input
                          value={String(filter.value)}
                          onChange={(e) => updateFilter(index, { value: e.target.value })}
                          placeholder="Valor"
                          className="flex-1 min-w-[120px] bg-white dark:bg-gray-800"
                        />
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFilter(index)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })
              )}

              {filters.length > 0 && (
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    onClick={handlePreview}
                    disabled={isPreviewing}
                  >
                    {isPreviewing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Eye className="h-4 w-4 mr-2" />
                    )}
                    Probar filtro
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Preview */}
        <div className="space-y-6">
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Users className="h-5 w-5" />
                Vista previa
              </CardTitle>
            </CardHeader>
            <CardContent>
              {previewData ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <span className="text-gray-700 dark:text-gray-300">Clientes encontrados</span>
                    <Badge className="bg-blue-600 text-white">{previewData.count}</Badge>
                  </div>
                  
                  {previewData.customers.length > 0 ? (
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {previewData.customers.map((customer) => (
                        <div
                          key={customer.id}
                          className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
                        >
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            {customer.full_name || 'Sin nombre'}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {customer.email || customer.phone || 'Sin contacto'}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-gray-500 dark:text-gray-400 py-4">
                      No se encontraron clientes
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Usa &quot;Probar filtro&quot; para ver los resultados</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
