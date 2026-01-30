'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  ArrowRight, 
  Save, 
  Check,
  Tag,
  Calendar,
  Settings,
  Filter,
  Percent,
  Gift,
  DollarSign,
  Package
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
import { Checkbox } from '@/components/ui/checkbox';
import { PromotionsService } from '../promotionsService';
import { 
  CreatePromotionData, 
  PromotionType, 
  AppliesTo,
  CreatePromotionRuleData,
  PROMOTION_TYPE_LABELS,
  APPLIES_TO_LABELS
} from '../types';
import { cn } from '@/utils/Utils';
import { toast } from 'sonner';

interface PromotionWizardProps {
  initialData?: CreatePromotionData;
  promotionId?: string;
  onSuccess?: () => void;
}

const WIZARD_STEPS = [
  { id: 'basic', title: 'Datos Básicos', icon: Tag },
  { id: 'discount', title: 'Descuento', icon: Percent },
  { id: 'validity', title: 'Vigencia', icon: Calendar },
  { id: 'rules', title: 'Reglas', icon: Filter },
];

export function PromotionWizard({ initialData, promotionId, onSuccess }: PromotionWizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState('');
  
  const [formData, setFormData] = useState<CreatePromotionData>({
    name: '',
    description: '',
    promotion_type: 'percentage',
    discount_value: 10,
    buy_quantity: 2,
    get_quantity: 1,
    min_purchase_amount: undefined,
    max_discount_amount: undefined,
    applies_to: 'all',
    start_date: new Date().toISOString().split('T')[0],
    end_date: undefined,
    is_active: true,
    usage_limit: undefined,
    is_combinable: false,
    priority: 0,
    rules: [],
    ...initialData
  });

  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [ruleType, setRuleType] = useState<'include' | 'exclude'>('include');

  useEffect(() => {
    loadProducts();
    loadCategories();
  }, []);

  useEffect(() => {
    if (productSearch) {
      loadProducts(productSearch);
    }
  }, [productSearch]);

  const loadProducts = async (search?: string) => {
    try {
      const data = await PromotionsService.getProducts(search);
      setProducts(data);
    } catch (error) {
      console.error('Error loading products:', error);
    }
  };

  const loadCategories = async () => {
    try {
      const data = await PromotionsService.getCategories();
      setCategories(data);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const handleChange = (field: keyof CreatePromotionData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const validateStep = (): boolean => {
    switch (currentStep) {
      case 0: // Datos básicos
        if (!formData.name.trim()) {
          toast.error('El nombre es requerido');
          return false;
        }
        return true;
      case 1: // Descuento
        if (formData.promotion_type === 'percentage' && (!formData.discount_value || formData.discount_value <= 0 || formData.discount_value > 100)) {
          toast.error('El porcentaje debe ser entre 1 y 100');
          return false;
        }
        if (formData.promotion_type === 'fixed' && (!formData.discount_value || formData.discount_value <= 0)) {
          toast.error('El monto de descuento debe ser mayor a 0');
          return false;
        }
        if (formData.promotion_type === 'buy_x_get_y' && (!formData.buy_quantity || !formData.get_quantity)) {
          toast.error('Debe especificar las cantidades de compra y regalo');
          return false;
        }
        return true;
      case 2: // Vigencia
        if (!formData.start_date) {
          toast.error('La fecha de inicio es requerida');
          return false;
        }
        if (formData.end_date && new Date(formData.end_date) < new Date(formData.start_date)) {
          toast.error('La fecha de fin debe ser posterior a la fecha de inicio');
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const nextStep = () => {
    if (validateStep()) {
      setCurrentStep(prev => Math.min(prev + 1, WIZARD_STEPS.length - 1));
    }
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const buildRules = (): CreatePromotionRuleData[] => {
    const rules: CreatePromotionRuleData[] = [];
    
    if (formData.applies_to === 'products') {
      selectedProducts.forEach(productId => {
        rules.push({ rule_type: ruleType, product_id: productId });
      });
    } else if (formData.applies_to === 'categories') {
      selectedCategories.forEach(categoryId => {
        rules.push({ rule_type: ruleType, category_id: categoryId });
      });
    }
    
    return rules;
  };

  const handleSubmit = async () => {
    if (!validateStep()) return;

    setLoading(true);
    try {
      const dataToSave = {
        ...formData,
        rules: buildRules()
      };

      if (promotionId) {
        await PromotionsService.update(promotionId, dataToSave);
        toast.success('Promoción actualizada correctamente');
      } else {
        await PromotionsService.create(dataToSave);
        toast.success('Promoción creada correctamente');
      }

      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/app/pos/promociones');
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar la promoción');
    } finally {
      setLoading(false);
    }
  };

  const getPromotionTypeIcon = (type: PromotionType) => {
    switch (type) {
      case 'percentage': return <Percent className="h-5 w-5" />;
      case 'fixed': return <DollarSign className="h-5 w-5" />;
      case 'buy_x_get_y': return <Gift className="h-5 w-5" />;
      case 'bundle': return <Package className="h-5 w-5" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            {WIZARD_STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className={cn(
                  "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors",
                  index < currentStep 
                    ? "bg-green-500 border-green-500 text-white"
                    : index === currentStep
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "border-gray-300 dark:border-gray-600 text-gray-400"
                )}>
                  {index < currentStep ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <step.icon className="h-5 w-5" />
                  )}
                </div>
                <span className={cn(
                  "ml-2 text-sm font-medium hidden md:block",
                  index === currentStep 
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-gray-500 dark:text-gray-400"
                )}>
                  {step.title}
                </span>
                {index < WIZARD_STEPS.length - 1 && (
                  <div className={cn(
                    "w-12 md:w-24 h-0.5 mx-2",
                    index < currentStep
                      ? "bg-green-500"
                      : "bg-gray-300 dark:bg-gray-600"
                  )} />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step Content */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="dark:text-white flex items-center gap-2">
            {(() => {
              const StepIcon = WIZARD_STEPS[currentStep].icon;
              return <StepIcon className="h-5 w-5 text-blue-600" />;
            })()}
            {WIZARD_STEPS[currentStep].title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 0: Datos Básicos */}
          {currentStep === 0 && (
            <div className="space-y-4">
              <div>
                <Label className="dark:text-gray-200">Nombre de la Promoción *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="ej: Descuento de Verano"
                  className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
              <div>
                <Label className="dark:text-gray-200">Descripción</Label>
                <Textarea
                  value={formData.description || ''}
                  onChange={(e) => handleChange('description', e.target.value)}
                  placeholder="Descripción de la promoción..."
                  rows={3}
                  className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="dark:text-gray-200">Prioridad</Label>
                  <Input
                    type="number"
                    value={formData.priority || 0}
                    onChange={(e) => handleChange('priority', parseInt(e.target.value) || 0)}
                    min={0}
                    className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 mt-1">Mayor número = Mayor prioridad</p>
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                  <div>
                    <Label className="dark:text-white">Combinable</Label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Permitir con otras promociones
                    </p>
                  </div>
                  <Switch
                    checked={formData.is_combinable}
                    onCheckedChange={(checked) => handleChange('is_combinable', checked)}
                    className="data-[state=checked]:bg-blue-600"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Descuento */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <Label className="dark:text-gray-200 mb-3 block">Tipo de Promoción</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {(Object.entries(PROMOTION_TYPE_LABELS) as [PromotionType, string][]).map(([type, label]) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleChange('promotion_type', type)}
                      className={cn(
                        "p-4 rounded-lg border-2 text-center transition-all",
                        formData.promotion_type === type
                          ? "border-blue-600 bg-blue-50 dark:bg-blue-900/30"
                          : "border-gray-200 dark:border-gray-600 hover:border-blue-300"
                      )}
                    >
                      <div className={cn(
                        "flex justify-center mb-2",
                        formData.promotion_type === type
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-gray-400"
                      )}>
                        {getPromotionTypeIcon(type)}
                      </div>
                      <span className={cn(
                        "text-sm font-medium",
                        formData.promotion_type === type
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-gray-600 dark:text-gray-300"
                      )}>
                        {label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Campos según tipo */}
              {(formData.promotion_type === 'percentage' || formData.promotion_type === 'fixed') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="dark:text-gray-200">
                      {formData.promotion_type === 'percentage' ? 'Porcentaje de Descuento' : 'Monto de Descuento'}
                    </Label>
                    <div className="relative">
                      <Input
                        type="number"
                        value={formData.discount_value || ''}
                        onChange={(e) => handleChange('discount_value', parseFloat(e.target.value) || 0)}
                        min={0}
                        max={formData.promotion_type === 'percentage' ? 100 : undefined}
                        className="dark:bg-gray-700 dark:border-gray-600 dark:text-white pr-10"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                        {formData.promotion_type === 'percentage' ? '%' : '$'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <Label className="dark:text-gray-200">Descuento Máximo (opcional)</Label>
                    <Input
                      type="number"
                      value={formData.max_discount_amount || ''}
                      onChange={(e) => handleChange('max_discount_amount', parseFloat(e.target.value) || undefined)}
                      min={0}
                      placeholder="Sin límite"
                      className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                  </div>
                </div>
              )}

              {formData.promotion_type === 'buy_x_get_y' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="dark:text-gray-200">Compra (X)</Label>
                    <Input
                      type="number"
                      value={formData.buy_quantity || ''}
                      onChange={(e) => handleChange('buy_quantity', parseInt(e.target.value) || 0)}
                      min={1}
                      className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                  </div>
                  <div>
                    <Label className="dark:text-gray-200">Lleva (Y)</Label>
                    <Input
                      type="number"
                      value={formData.get_quantity || ''}
                      onChange={(e) => handleChange('get_quantity', parseInt(e.target.value) || 0)}
                      min={1}
                      className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                  </div>
                </div>
              )}

              <div>
                <Label className="dark:text-gray-200">Compra Mínima (opcional)</Label>
                <Input
                  type="number"
                  value={formData.min_purchase_amount || ''}
                  onChange={(e) => handleChange('min_purchase_amount', parseFloat(e.target.value) || undefined)}
                  min={0}
                  placeholder="Sin mínimo"
                  className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
            </div>
          )}

          {/* Step 2: Vigencia */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="dark:text-gray-200">Fecha de Inicio *</Label>
                  <Input
                    type="date"
                    value={formData.start_date?.split('T')[0] || ''}
                    onChange={(e) => handleChange('start_date', e.target.value)}
                    className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
                <div>
                  <Label className="dark:text-gray-200">Fecha de Fin (opcional)</Label>
                  <Input
                    type="date"
                    value={formData.end_date?.split('T')[0] || ''}
                    onChange={(e) => handleChange('end_date', e.target.value || undefined)}
                    className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="dark:text-gray-200">Límite de Usos (opcional)</Label>
                  <Input
                    type="number"
                    value={formData.usage_limit || ''}
                    onChange={(e) => handleChange('usage_limit', parseInt(e.target.value) || undefined)}
                    min={1}
                    placeholder="Sin límite"
                    className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                  <div>
                    <Label className="dark:text-white">Activa</Label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      La promoción estará disponible inmediatamente
                    </p>
                  </div>
                  <Switch
                    checked={formData.is_active}
                    onCheckedChange={(checked) => handleChange('is_active', checked)}
                    className="data-[state=checked]:bg-green-600"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Reglas */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <Label className="dark:text-gray-200 mb-3 block">Aplica a</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {(Object.entries(APPLIES_TO_LABELS) as [AppliesTo, string][]).map(([type, label]) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleChange('applies_to', type)}
                      className={cn(
                        "p-4 rounded-lg border-2 text-center transition-all",
                        formData.applies_to === type
                          ? "border-blue-600 bg-blue-50 dark:bg-blue-900/30"
                          : "border-gray-200 dark:border-gray-600 hover:border-blue-300"
                      )}
                    >
                      <span className={cn(
                        "text-sm font-medium",
                        formData.applies_to === type
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-gray-600 dark:text-gray-300"
                      )}>
                        {label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {formData.applies_to === 'products' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Select value={ruleType} onValueChange={(v: any) => setRuleType(v)}>
                      <SelectTrigger className="w-[150px] dark:bg-gray-700 dark:border-gray-600">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                        <SelectItem value="include">Incluir</SelectItem>
                        <SelectItem value="exclude">Excluir</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder="Buscar productos..."
                      className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-2 p-2 border rounded-lg dark:border-gray-700">
                    {products.map(product => (
                      <label key={product.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded">
                        <Checkbox
                          checked={selectedProducts.includes(product.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedProducts([...selectedProducts, product.id]);
                            } else {
                              setSelectedProducts(selectedProducts.filter(id => id !== product.id));
                            }
                          }}
                        />
                        <div>
                          <span className="dark:text-white">{product.name}</span>
                          <span className="text-xs text-gray-500 ml-2">SKU: {product.sku}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                  {selectedProducts.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedProducts.map(id => {
                        const product = products.find(p => p.id === id);
                        return product ? (
                          <Badge key={id} variant="secondary" className="dark:bg-gray-700">
                            {product.name}
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
              )}

              {formData.applies_to === 'categories' && (
                <div className="space-y-4">
                  <Select value={ruleType} onValueChange={(v: any) => setRuleType(v)}>
                    <SelectTrigger className="w-[150px] dark:bg-gray-700 dark:border-gray-600">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                      <SelectItem value="include">Incluir</SelectItem>
                      <SelectItem value="exclude">Excluir</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="max-h-60 overflow-y-auto space-y-2 p-2 border rounded-lg dark:border-gray-700">
                    {categories.map(category => (
                      <label key={category.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded">
                        <Checkbox
                          checked={selectedCategories.includes(category.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedCategories([...selectedCategories, category.id]);
                            } else {
                              setSelectedCategories(selectedCategories.filter(id => id !== category.id));
                            }
                          }}
                        />
                        <span className="dark:text-white">{category.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={currentStep === 0 ? () => router.push('/app/pos/promociones') : prevStep}
          className="dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:hover:bg-gray-600"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {currentStep === 0 ? 'Cancelar' : 'Anterior'}
        </Button>

        {currentStep < WIZARD_STEPS.length - 1 ? (
          <Button onClick={nextStep} className="bg-blue-600 hover:bg-blue-700">
            Siguiente
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={loading} className="bg-green-600 hover:bg-green-700">
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Guardando...' : promotionId ? 'Actualizar' : 'Crear Promoción'}
          </Button>
        )}
      </div>
    </div>
  );
}
