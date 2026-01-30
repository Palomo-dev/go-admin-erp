'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Filter,
  Edit,
  Play,
  Megaphone,
  Users,
  Loader2,
  RefreshCw,
  Save,
  X,
  Trash2,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { SegmentosService } from '../SegmentosService';
import { Segment, FilterRule, FILTER_FIELDS, FILTER_OPERATORS } from '../types';
import { formatDate } from '@/utils/Utils';

interface SegmentoDetallePageProps {
  segmentId: string;
}

export function SegmentoDetallePage({ segmentId }: SegmentoDetallePageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  
  const [segment, setSegment] = useState<Segment | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(searchParams.get('edit') === 'true');
  const [isSaving, setIsSaving] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isDynamic, setIsDynamic] = useState(true);
  const [filters, setFilters] = useState<FilterRule[]>([]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [segmentData, customersData] = await Promise.all([
        SegmentosService.getSegmentById(segmentId),
        SegmentosService.getSegmentCustomers(segmentId),
      ]);

      if (!segmentData) {
        toast({ title: 'Error', description: 'Segmento no encontrado', variant: 'destructive' });
        router.push('/app/crm/segmentos');
        return;
      }

      setSegment(segmentData);
      setCustomers(customersData);
      
      // Initialize form
      setName(segmentData.name);
      setDescription(segmentData.description || '');
      setIsDynamic(segmentData.is_dynamic);
      setFilters(segmentData.filter_json || []);
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo cargar el segmento', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [segmentId, router, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: 'Error', description: 'El nombre es requerido', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      const updated = await SegmentosService.updateSegment(segmentId, {
        name,
        description: description || undefined,
        filter_json: filters,
        is_dynamic: isDynamic,
      });

      if (updated) {
        toast({ title: 'Segmento actualizado' });
        setIsEditing(false);
        loadData();
      }
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo actualizar', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRecalculate = async () => {
    setIsRecalculating(true);
    try {
      const count = await SegmentosService.recalculateSegment(segmentId);
      toast({ title: 'Recálculo completado', description: `${count} clientes en el segmento` });
      loadData();
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo recalcular', variant: 'destructive' });
    } finally {
      setIsRecalculating(false);
    }
  };

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">Cargando segmento...</p>
        </div>
      </div>
    );
  }

  if (!segment) return null;

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
              {segment.name}
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              CRM / Segmentos / Detalle
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={() => { setIsEditing(false); loadData(); }}>
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Guardar
              </Button>
            </>
          ) : (
            <>
              {segment.is_dynamic && (
                <Button variant="outline" onClick={handleRecalculate} disabled={isRecalculating}>
                  {isRecalculating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                  Recalcular
                </Button>
              )}
              <Button variant="outline" onClick={() => setIsEditing(true)}>
                <Edit className="h-4 w-4 mr-2" />
                Editar
              </Button>
              <Link href={`/app/crm/campanas/nuevo?segment=${segmentId}`}>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                  <Megaphone className="h-4 w-4 mr-2" />
                  Crear Campaña
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Info & Filtros */}
        <div className="lg:col-span-2 space-y-6">
          {/* Información */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-gray-100">Información</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditing ? (
                <>
                  <div className="space-y-2">
                    <Label>Nombre</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-gray-50 dark:bg-gray-900" />
                  </div>
                  <div className="space-y-2">
                    <Label>Descripción</Label>
                    <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="bg-gray-50 dark:bg-gray-900" />
                  </div>
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">Segmento dinámico</p>
                      <p className="text-sm text-gray-500">Se recalcula automáticamente</p>
                    </div>
                    <Switch checked={isDynamic} onCheckedChange={setIsDynamic} />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-4">
                    <Badge className={segment.is_dynamic ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}>
                      {segment.is_dynamic ? 'Dinámico' : 'Estático'}
                    </Badge>
                    <span className="text-gray-500 dark:text-gray-400">
                      {segment.customer_count} clientes
                    </span>
                  </div>
                  {segment.description && (
                    <p className="text-gray-700 dark:text-gray-300">{segment.description}</p>
                  )}
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Última ejecución: {segment.last_run_at ? formatDate(segment.last_run_at) : 'Nunca'}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Filtros */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-gray-900 dark:text-gray-100">Reglas de filtro</CardTitle>
              {isEditing && (
                <Button variant="outline" size="sm" onClick={addFilter}>
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {filters.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Sin reglas definidas</p>
              ) : (
                <div className="space-y-3">
                  {filters.map((filter, index) => {
                    const fieldType = getFieldType(filter.field);
                    const operators = FILTER_OPERATORS[fieldType] || FILTER_OPERATORS.text;
                    const fieldLabel = FILTER_FIELDS.find(f => f.value === filter.field)?.label || filter.field;
                    const opLabel = operators.find(o => o.value === filter.operator)?.label || filter.operator;

                    if (isEditing) {
                      return (
                        <div key={index} className="flex flex-wrap items-center gap-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                          <Select value={filter.field} onValueChange={(v) => updateFilter(index, { field: v })}>
                            <SelectTrigger className="w-36 bg-white dark:bg-gray-800"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {FILTER_FIELDS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Select value={filter.operator} onValueChange={(v) => updateFilter(index, { operator: v as any })}>
                            <SelectTrigger className="w-32 bg-white dark:bg-gray-800"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {operators.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {!['is_empty', 'is_not_empty'].includes(filter.operator) && (
                            <Input value={String(filter.value)} onChange={(e) => updateFilter(index, { value: e.target.value })} className="flex-1 min-w-[100px] bg-white dark:bg-gray-800" />
                          )}
                          <Button variant="ghost" size="icon" onClick={() => removeFilter(index)} className="text-red-600"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      );
                    }

                    return (
                      <div key={index} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                        <span className="font-medium text-gray-900 dark:text-gray-100">{fieldLabel}</span>
                        <span className="mx-2 text-gray-500">{opLabel}</span>
                        {!['is_empty', 'is_not_empty'].includes(filter.operator) && (
                          <span className="text-blue-600 font-medium">&quot;{String(filter.value)}&quot;</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Clientes */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Users className="h-5 w-5" />
              Clientes ({customers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {customers.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No hay clientes en este segmento</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {customers.map((customer) => (
                  <Link key={customer.id} href={`/app/crm/clientes/${customer.id}`}>
                    <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer">
                      <p className="font-medium text-gray-900 dark:text-gray-100">{customer.full_name || 'Sin nombre'}</p>
                      <p className="text-sm text-gray-500">{customer.email || customer.phone || 'Sin contacto'}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
