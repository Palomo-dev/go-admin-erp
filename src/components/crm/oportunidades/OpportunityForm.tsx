'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from '@/components/ui/use-toast';
import { CalendarIcon, Plus, Trash2, Loader2, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/utils/Utils';
import { opportunitiesService } from './opportunitiesService';
import { Pipeline, Stage, Customer, CreateOpportunityInput, Opportunity } from './types';
import { CustomerSearchSelect } from './CustomerSearchSelect';
import { ProductSearchSelect } from './ProductSearchSelect';
import { PipelineSearchSelect } from './PipelineSearchSelect';
import { SpaceSearchSelect } from './SpaceSearchSelect';

interface OpportunityFormProps {
  opportunity?: Opportunity;
  initialPipelineId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

interface ProductLine {
  id?: string;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
}

interface SpaceLine {
  id?: string;
  space_id: string;
  space_name: string;
  nights: number;
  unit_price: number;
}

interface CustomLine {
  id?: string;
  concept: string;
  quantity: number;
  unit_price: number;
}

export function OpportunityForm({ opportunity, initialPipelineId, onSuccess, onCancel }: OpportunityFormProps) {
  const router = useRouter();
  const isEditing = !!opportunity;

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Data para selects
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<{ id: number; name: string; sku: string; price: number; image?: string }[]>([]);
  const [spaces, setSpaces] = useState<{ id: string; label: string; floor_zone?: string; status: string; type_name?: string; base_rate: number }[]>([]);

  // Form state - usar initialPipelineId si se proporciona
  const [pipelineId, setPipelineId] = useState(opportunity?.pipeline_id || initialPipelineId || '');
  const [stageId, setStageId] = useState(opportunity?.stage_id || '');
  const [customerId, setCustomerId] = useState(opportunity?.customer_id || '');
  const [name, setName] = useState(opportunity?.name || '');
  const [amount, setAmount] = useState(opportunity?.amount?.toString() || '');
  const [currency, setCurrency] = useState(opportunity?.currency || 'COP');
  const [expectedCloseDate, setExpectedCloseDate] = useState<Date | undefined>(
    opportunity?.expected_close_date ? new Date(opportunity.expected_close_date) : undefined
  );
  const [productLines, setProductLines] = useState<ProductLine[]>([]);
  const [spaceLines, setSpaceLines] = useState<SpaceLine[]>([]);
  const [customLines, setCustomLines] = useState<CustomLine[]>([]);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (pipelineId) {
      loadStages(pipelineId);
    }
  }, [pipelineId]);

  useEffect(() => {
    if (opportunity?.id) {
      loadOpportunityProducts();
    }
  }, [opportunity?.id]);

  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      // Cargar datos en paralelo con manejo de errores individual
      const [pipelinesResult, customersResult, productsResult, spacesResult] = await Promise.allSettled([
        opportunitiesService.getPipelines(),
        opportunitiesService.getCustomers(),
        opportunitiesService.getProducts(),
        opportunitiesService.getSpaces(),
      ]);

      // Procesar resultados
      const pipelinesData = pipelinesResult.status === 'fulfilled' ? pipelinesResult.value : [];
      const customersData = customersResult.status === 'fulfilled' ? customersResult.value : [];
      const productsData = productsResult.status === 'fulfilled' ? productsResult.value : [];
      const spacesData = spacesResult.status === 'fulfilled' ? spacesResult.value : [];

      setPipelines(pipelinesData);
      setCustomers(customersData);
      setProducts(productsData);
      setSpaces(spacesData);

      // Solo establecer pipeline por defecto si no hay uno inicial
      if (pipelinesData.length > 0 && !pipelineId && !initialPipelineId) {
        const defaultPipeline = pipelinesData.find((p) => p.is_default) || pipelinesData[0];
        setPipelineId(defaultPipeline.id);
      }
    } catch (error) {
      // Con Promise.allSettled este catch raramente se ejecuta
      // pero lo mantenemos por seguridad
    } finally {
      setIsLoading(false);
    }
  };

  const loadStages = async (pipelineId: string) => {
    try {
      const stagesData = await opportunitiesService.getStages(pipelineId);
      setStages(stagesData);
      if (stagesData.length > 0 && !stageId) {
        const firstStage = stagesData.sort((a, b) => a.position - b.position)[0];
        setStageId(firstStage.id);
      }
    } catch (error) {
      console.error('Error cargando etapas:', error);
    }
  };

  const loadOpportunityProducts = async () => {
    if (!opportunity?.id) return;
    try {
      const productsData = await opportunitiesService.getOpportunityProducts(opportunity.id);
      setProductLines(
        productsData.map((p) => ({
          id: p.id,
          product_id: p.product_id,
          product_name: p.product?.name || 'Producto',
          quantity: p.quantity,
          unit_price: p.unit_price,
        }))
      );
    } catch (error) {
      console.error('Error cargando productos:', error);
    }
  };

  const addProductLine = () => {
    setProductLines([
      ...productLines,
      { product_id: 0, product_name: '', quantity: 1, unit_price: 0 },
    ]);
  };

  const updateProductLine = (index: number, field: keyof ProductLine, value: any) => {
    const updated = [...productLines];
    updated[index] = { ...updated[index], [field]: value };

    // Si se selecciona un producto, actualizar nombre y precio
    if (field === 'product_id') {
      const product = products.find((p) => p.id === Number(value));
      if (product) {
        updated[index].product_name = product.name;
        updated[index].unit_price = product.price;
      }
    }

    setProductLines(updated);
  };

  const removeProductLine = (index: number) => {
    setProductLines(productLines.filter((_, i) => i !== index));
  };

  // ============== FUNCIONES PARA ESPACIOS ==============
  const addSpaceLine = () => {
    setSpaceLines([
      ...spaceLines,
      { space_id: '', space_name: '', nights: 1, unit_price: 0 },
    ]);
  };

  const updateSpaceLine = (index: number, field: keyof SpaceLine, value: any) => {
    const updated = [...spaceLines];
    updated[index] = { ...updated[index], [field]: value };

    // Si se selecciona un espacio, actualizar nombre y precio
    if (field === 'space_id') {
      const space = spaces.find((s) => s.id === value);
      if (space) {
        updated[index].space_name = space.label;
        updated[index].unit_price = space.base_rate;
      }
    }

    setSpaceLines(updated);
  };

  const removeSpaceLine = (index: number) => {
    setSpaceLines(spaceLines.filter((_, i) => i !== index));
  };

  // ============== FUNCIONES PARA CONCEPTOS PERSONALIZADOS ==============
  const addCustomLine = () => {
    setCustomLines([
      ...customLines,
      { concept: '', quantity: 1, unit_price: 0 },
    ]);
  };

  const updateCustomLine = (index: number, field: keyof CustomLine, value: any) => {
    const updated = [...customLines];
    updated[index] = { ...updated[index], [field]: value };
    setCustomLines(updated);
  };

  const removeCustomLine = (index: number) => {
    setCustomLines(customLines.filter((_, i) => i !== index));
  };

  const calculateTotal = () => {
    const productsTotal = productLines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);
    const spacesTotal = spaceLines.reduce((sum, line) => sum + line.nights * line.unit_price, 0);
    const customTotal = customLines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);
    return productsTotal + spacesTotal + customTotal;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !pipelineId || !stageId) {
      toast({
        title: 'Error',
        description: 'Por favor completa los campos requeridos',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const totalAmount = productLines.length > 0 ? calculateTotal() : parseFloat(amount) || 0;

      if (isEditing && opportunity) {
        await opportunitiesService.updateOpportunity(opportunity.id, {
          name,
          stage_id: stageId,
          customer_id: customerId || undefined,
          amount: totalAmount,
          currency,
          expected_close_date: expectedCloseDate
            ? format(expectedCloseDate, 'yyyy-MM-dd')
            : undefined,
        });
        toast({
          title: 'Éxito',
          description: 'Oportunidad actualizada correctamente',
        });
      } else {
        const input: CreateOpportunityInput = {
          pipeline_id: pipelineId,
          stage_id: stageId,
          customer_id: customerId || undefined,
          name,
          amount: totalAmount,
          currency,
          expected_close_date: expectedCloseDate
            ? format(expectedCloseDate, 'yyyy-MM-dd')
            : undefined,
          products: productLines
            .filter((p) => p.product_id > 0)
            .map((p) => ({
              product_id: p.product_id,
              quantity: p.quantity,
              unit_price: p.unit_price,
            })),
        };
        await opportunitiesService.createOpportunity(input);
        toast({
          title: 'Éxito',
          description: 'Oportunidad creada correctamente',
        });
      }

      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/app/crm/oportunidades');
      }
    } catch (error) {
      console.error('Error guardando oportunidad:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar la oportunidad',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      router.back();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleCancel}
          className="text-gray-600 dark:text-gray-400"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {isEditing ? 'Editar Oportunidad' : 'Nueva Oportunidad'}
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Información principal */}
        <Card className="lg:col-span-2 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">Información General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Nombre */}
              <div className="sm:col-span-2">
                <Label htmlFor="name" className="text-gray-700 dark:text-gray-300">
                  Nombre de la oportunidad *
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Venta de equipos para oficina"
                  className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                  required
                />
              </div>

              {/* Pipeline */}
              <div>
                <PipelineSearchSelect
                  pipelines={pipelines}
                  selectedPipelineId={pipelineId}
                  onSelect={(value) => {
                    setPipelineId(value);
                    setStageId('');
                  }}
                  label="Pipeline"
                />
              </div>

              {/* Etapa */}
              <div>
                <Label htmlFor="stage" className="text-gray-700 dark:text-gray-300">
                  Etapa inicial *
                </Label>
                <Select value={stageId} onValueChange={setStageId}>
                  <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
                    <SelectValue placeholder="Selecciona una etapa" />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-gray-800">
                    {stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: stage.color }}
                          />
                          {stage.name} ({(stage.probability * 100).toFixed(0)}%)
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Cliente */}
              <div>
                <CustomerSearchSelect
                  customers={customers}
                  selectedCustomerId={customerId}
                  onSelect={setCustomerId}
                  label="Cliente"
                  placeholder="Buscar cliente..."
                />
              </div>

              {/* Fecha de cierre */}
              <div>
                <Label className="text-gray-700 dark:text-gray-300">Fecha esperada de cierre</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700',
                        !expectedCloseDate && 'text-gray-500'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {expectedCloseDate
                        ? format(expectedCloseDate, 'dd/MM/yyyy', { locale: es })
                        : 'Seleccionar fecha'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-white dark:bg-gray-800">
                    <Calendar
                      mode="single"
                      selected={expectedCloseDate}
                      onSelect={setExpectedCloseDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Monto directo (si no hay productos) */}
            {productLines.length === 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="amount" className="text-gray-700 dark:text-gray-300">
                    Monto
                  </Label>
                  <Input
                    id="amount"
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                  />
                </div>
                <div>
                  <Label htmlFor="currency" className="text-gray-700 dark:text-gray-300">
                    Moneda
                  </Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-gray-800">
                      <SelectItem value="COP">COP - Peso Colombiano</SelectItem>
                      <SelectItem value="USD">USD - Dólar</SelectItem>
                      <SelectItem value="EUR">EUR - Euro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Productos y Espacios - columna derecha */}
        <div className="lg:col-span-1 space-y-6">
          {/* Productos cotizados */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-gray-900 dark:text-white text-base">Productos</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addProductLine}
                className="border-gray-200 dark:border-gray-700"
              >
                <Plus className="h-4 w-4 mr-1" />
                Agregar
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {productLines.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">
                  Sin productos
                </p>
              ) : (
                productLines.map((line, index) => (
                  <div
                    key={index}
                    className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <ProductSearchSelect
                          products={products}
                          selectedProductId={line.product_id || 0}
                          onSelect={(productId) => {
                            updateProductLine(index, 'product_id', productId);
                          }}
                          placeholder="Seleccionar producto"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeProductLine(index)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-gray-500">Cantidad</Label>
                        <Input
                          type="number"
                          value={line.quantity}
                          onChange={(e) =>
                            updateProductLine(index, 'quantity', Number(e.target.value))
                          }
                          min={1}
                          className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Precio unit.</Label>
                        <Input
                          type="number"
                          value={line.unit_price}
                          onChange={(e) =>
                            updateProductLine(index, 'unit_price', Number(e.target.value))
                          }
                          className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                        />
                      </div>
                    </div>
                    <div className="text-right text-sm font-medium text-gray-700 dark:text-gray-300">
                      Subtotal: {formatCurrency(line.quantity * line.unit_price)}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Espacios (PMS) */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-gray-900 dark:text-white text-base">Espacios (PMS)</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addSpaceLine}
                className="border-gray-200 dark:border-gray-700"
              >
                <Plus className="h-4 w-4 mr-1" />
                Agregar
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {spaceLines.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">
                  Sin espacios
                </p>
              ) : (
                spaceLines.map((line, index) => (
                  <div
                    key={index}
                    className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg space-y-2 border border-purple-200 dark:border-purple-800"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <SpaceSearchSelect
                          spaces={spaces}
                          selectedSpaceId={line.space_id || ''}
                          onSelect={(spaceId) => {
                            updateSpaceLine(index, 'space_id', spaceId);
                          }}
                          placeholder="Seleccionar espacio"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeSpaceLine(index)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-gray-500">Noches</Label>
                        <Input
                          type="number"
                          value={line.nights}
                          onChange={(e) =>
                            updateSpaceLine(index, 'nights', Number(e.target.value))
                          }
                          min={1}
                          className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Tarifa/noche</Label>
                        <Input
                          type="number"
                          value={line.unit_price}
                          onChange={(e) =>
                            updateSpaceLine(index, 'unit_price', Number(e.target.value))
                          }
                          className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                        />
                      </div>
                    </div>
                    <div className="text-right text-sm font-medium text-purple-700 dark:text-purple-300">
                      Subtotal: {formatCurrency(line.nights * line.unit_price)}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Conceptos Personalizados */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-gray-900 dark:text-white text-base">Otros Conceptos</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addCustomLine}
                className="border-gray-200 dark:border-gray-700"
              >
                <Plus className="h-4 w-4 mr-1" />
                Agregar
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {customLines.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">
                  Sin conceptos adicionales
                </p>
              ) : (
                customLines.map((line, index) => (
                  <div
                    key={index}
                    className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg space-y-2 border border-amber-200 dark:border-amber-800"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <Input
                          placeholder="Descripción del concepto..."
                          value={line.concept}
                          onChange={(e) => updateCustomLine(index, 'concept', e.target.value)}
                          className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeCustomLine(index)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-gray-500">Cantidad</Label>
                        <Input
                          type="number"
                          value={line.quantity}
                          onChange={(e) =>
                            updateCustomLine(index, 'quantity', Number(e.target.value))
                          }
                          min={1}
                          className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Precio unit.</Label>
                        <Input
                          type="number"
                          value={line.unit_price}
                          onChange={(e) =>
                            updateCustomLine(index, 'unit_price', Number(e.target.value))
                          }
                          className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                        />
                      </div>
                    </div>
                    <div className="text-right text-sm font-medium text-amber-700 dark:text-amber-300">
                      Subtotal: {formatCurrency(line.quantity * line.unit_price)}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Total General */}
          {(productLines.length > 0 || spaceLines.length > 0 || customLines.length > 0) && (
            <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <CardContent className="py-4">
                <div className="flex justify-between items-center text-lg font-bold">
                  <span className="text-blue-700 dark:text-blue-300">Total General:</span>
                  <span className="text-blue-900 dark:text-blue-100">
                    {formatCurrency(calculateTotal())}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Acciones */}
      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={handleCancel}
          className="border-gray-200 dark:border-gray-700"
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={isSaving}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Guardar cambios' : 'Crear oportunidad'}
        </Button>
      </div>
    </form>
  );
}
