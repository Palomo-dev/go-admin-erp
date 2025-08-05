'use client';

import { useState, useEffect } from 'react';
import { X, Code, Lightbulb, AlertCircle, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  validateEventCode, 
  getEventCodeExamples,
  type CustomEvent,
  type CreateCustomEventData 
} from '@/lib/services/customEventsService';
import { PayloadHelpDialog } from './PayloadHelpDialog';

interface CustomEventFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateCustomEventData) => void;
  initialData?: CustomEvent | null;
  organizationId: number;
}

export function CustomEventForm({ 
  isOpen, 
  onClose, 
  onSubmit, 
  initialData, 
  organizationId 
}: CustomEventFormProps) {
  const [formData, setFormData] = useState<CreateCustomEventData>({
    code: '',
    name: '',
    description: '',
    module: 'custom',
    category: 'custom',
    sample_payload: {},
    is_active: true
  });

  const [payloadJson, setPayloadJson] = useState('{}');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPayloadHelp, setShowPayloadHelp] = useState(false);

  // ========================================
  // EFECTOS
  // ========================================

  useEffect(() => {
    if (initialData) {
      setFormData({
        code: initialData.code,
        name: initialData.name,
        description: initialData.description || '',
        module: initialData.module,
        category: initialData.category === 'system' ? 'custom' : initialData.category,
        sample_payload: initialData.sample_payload,
        is_active: initialData.is_active
      });
      setPayloadJson(JSON.stringify(initialData.sample_payload, null, 2));
    } else {
      resetForm();
    }
  }, [initialData]);

  // ========================================
  // FUNCIONES DE VALIDACIÓN
  // ========================================

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Validar código
    if (!formData.code.trim()) {
      newErrors.code = 'El código es requerido';
    } else {
      const codeValidation = validateEventCode(formData.code);
      if (!codeValidation.isValid) {
        newErrors.code = codeValidation.error || 'Código inválido';
      }
    }

    // Validar nombre
    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es requerido';
    }

    // Validar módulo
    if (!formData.module.trim()) {
      newErrors.module = 'El módulo es requerido';
    }

    // Validar JSON del payload
    try {
      const parsed = JSON.parse(payloadJson);
      if (typeof parsed !== 'object' || parsed === null) {
        newErrors.sample_payload = 'El payload debe ser un objeto JSON válido';
      }
    } catch (error) {
      newErrors.sample_payload = 'JSON inválido en el payload de ejemplo';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ========================================
  // HANDLERS
  // ========================================

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const payload = JSON.parse(payloadJson);
      await onSubmit({
        ...formData,
        sample_payload: payload
      });
    } catch (error) {
      console.error('Error al enviar formulario:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: keyof CreateCustomEventData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Limpiar error cuando el usuario corrige
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleModuleChange = (module: string) => {
    handleInputChange('module', module);
    
    // Auto-generar código basado en el módulo si está vacío
    if (!formData.code) {
      const examples = getEventCodeExamples(module);
      if (examples.length > 0) {
        handleInputChange('code', examples[0]);
      }
    }
  };

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      description: '',
      module: 'custom',
      category: 'custom',
      sample_payload: {},
      is_active: true
    });
    setPayloadJson('{}');
    setErrors({});
  };

  const handleExampleSelect = (example: string) => {
    handleInputChange('code', example);
  };

  const handlePayloadExample = (module: string) => {
    const examples: Record<string, object> = {
      crm: {
        cliente_id: 'uuid-cliente',
        cliente_nombre: 'Nombre del Cliente',
        tipo_evento: 'vencimiento_contrato',
        fecha_vencimiento: '2025-08-30'
      },
      ventas: {
        venta_id: 'V-12345',
        producto_id: 'P-67890',
        cantidad: 10,
        total: 1500.00,
        vendedor_id: 'uuid-vendedor'
      },
      inventario: {
        producto_id: 'P-12345',
        producto_nombre: 'Producto Ejemplo',
        stock_actual: 5,
        stock_minimo: 10,
        almacen_id: 'ALM-001'
      },
      finanzas: {
        factura_id: 'F-12345',
        cliente_id: 'uuid-cliente',
        monto: 2500.00,
        fecha_vencimiento: '2025-08-15',
        estado: 'pendiente'
      },
      custom: {
        evento_id: 'uuid-evento',
        descripcion: 'Descripción del evento',
        data: 'Datos adicionales'
      }
    };

    const example = examples[module] || examples.custom;
    setPayloadJson(JSON.stringify(example, null, 2));
  };

  if (!isOpen) return null;

  const codeExamples = getEventCodeExamples(formData.module);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {initialData ? 'Editar Evento Personalizado' : 'Crear Evento Personalizado'}
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Columna izquierda - Información básica */}
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Información Básica</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Módulo */}
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Módulo *
                      </label>
                      <select
                        value={formData.module}
                        onChange={(e) => handleModuleChange(e.target.value)}
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                        required
                      >
                        <option value="crm">CRM</option>
                        <option value="ventas">Ventas</option>
                        <option value="inventario">Inventario</option>
                        <option value="finanzas">Finanzas</option>
                        <option value="rrhh">RR.HH.</option>
                        <option value="pms">PMS</option>
                        <option value="custom">Personalizado</option>
                      </select>
                      {errors.module && (
                        <p className="text-red-500 text-sm mt-1">{errors.module}</p>
                      )}
                    </div>

                    {/* Código */}
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Código del Evento *
                      </label>
                      <Input
                        value={formData.code}
                        onChange={(e) => handleInputChange('code', e.target.value)}
                        placeholder="ej: cliente.vencimiento_contrato"
                        className={errors.code ? 'border-red-500' : ''}
                        required
                      />
                      {errors.code && (
                        <p className="text-red-500 text-sm mt-1">{errors.code}</p>
                      )}
                      
                      {/* Ejemplos de códigos */}
                      {codeExamples.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-gray-500 mb-1">Ejemplos sugeridos:</p>
                          <div className="flex flex-wrap gap-1">
                            {codeExamples.slice(0, 3).map((example) => (
                              <Badge
                                key={example}
                                variant="outline"
                                className="cursor-pointer text-xs"
                                onClick={() => handleExampleSelect(example)}
                              >
                                {example}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Nombre */}
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Nombre del Evento *
                      </label>
                      <Input
                        value={formData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        placeholder="ej: Vencimiento de Contrato"
                        className={errors.name ? 'border-red-500' : ''}
                        required
                      />
                      {errors.name && (
                        <p className="text-red-500 text-sm mt-1">{errors.name}</p>
                      )}
                    </div>

                    {/* Descripción */}
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Descripción
                      </label>
                      <Textarea
                        value={formData.description}
                        onChange={(e) => handleInputChange('description', e.target.value)}
                        placeholder="Describe cuándo y por qué se dispara este evento..."
                        rows={3}
                      />
                    </div>

                    {/* Categoría */}
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Categoría
                      </label>
                      <select
                        value={formData.category}
                        onChange={(e) => handleInputChange('category', e.target.value)}
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                      >
                        <option value="business">Negocio</option>
                        <option value="custom">Personalizado</option>
                      </select>
                    </div>

                    {/* Estado activo */}
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="is_active"
                        checked={formData.is_active}
                        onChange={(e) => handleInputChange('is_active', e.target.checked)}
                        className="rounded"
                      />
                      <label htmlFor="is_active" className="text-sm">
                        Evento activo
                      </label>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Columna derecha - Payload de ejemplo */}
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Code className="h-5 w-5" />
                        Payload de Ejemplo
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowPayloadHelp(true)}
                        className="text-xs"
                      >
                        <HelpCircle className="h-4 w-4 mr-1" />
                        Ayuda
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Lightbulb className="h-4 w-4 text-yellow-500" />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handlePayloadExample(formData.module)}
                      >
                        Usar ejemplo para {formData.module}
                      </Button>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">
                        JSON del Payload
                      </label>
                      <Textarea
                        value={payloadJson}
                        onChange={(e) => setPayloadJson(e.target.value)}
                        placeholder='{"key": "value"}'
                        rows={12}
                        className={`font-mono text-sm ${errors.sample_payload ? 'border-red-500' : ''}`}
                      />
                      {errors.sample_payload && (
                        <p className="text-red-500 text-sm mt-1">{errors.sample_payload}</p>
                      )}
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-blue-500 mt-0.5" />
                        <div className="text-sm text-blue-700 dark:text-blue-300">
                          <p className="font-medium mb-1">💡 Consejo:</p>
                          <p>El payload de ejemplo ayuda a otros usuarios a entender qué datos estarán disponibles cuando se dispare este evento.</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  {initialData ? 'Actualizando...' : 'Creando...'}
                </>
              ) : (
                <>
                  {initialData ? 'Actualizar Evento' : 'Crear Evento'}
                </>
              )}
            </Button>
          </div>
        </form>

        {/* Diálogo de Ayuda para Payloads */}
        <PayloadHelpDialog
          isOpen={showPayloadHelp}
          onClose={() => setShowPayloadHelp(false)}
          onSelectPayload={(payload) => {
            setPayloadJson(payload);
            // Limpiar error de payload si existe
            if (errors.sample_payload) {
              setErrors(prev => ({ ...prev, sample_payload: '' }));
            }
          }}
          currentModule={formData.module}
        />
      </div>
    </div>
  );
}
