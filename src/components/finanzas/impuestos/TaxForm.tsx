"use client";

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/lib/supabase/config';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';

interface TaxTemplate {
  id: number;
  country: string;
  code: string;
  name: string;
  rate: number;
  description: string | null;
}

interface OrganizationTax {
  id: string;
  organization_id: number;
  template_id: number | null;
  name: string;
  rate: number;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
}

interface TaxFormProps {
  open: boolean;
  onClose: (refreshData?: boolean) => void;
  tax: OrganizationTax | null;
  editMode: boolean;
  organizationId: number;
}

const TaxForm: React.FC<TaxFormProps> = ({
  open,
  onClose,
  tax,
  editMode,
  organizationId,
}) => {
  // Estado para el formulario
  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const [description, setDescription] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<TaxTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [useTemplate, setUseTemplate] = useState(false);
  const { toast } = useToast();

  // Cargar datos de plantillas de impuestos filtradas por país de la organización
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const { data, error } = await supabase
          .rpc('get_tax_templates_by_organization_country', {
            org_id: organizationId
          });

        if (error) throw error;
        setTemplates(data || []);
        
        // Si hay plantillas disponibles y no estamos en modo edición, 
        // activar automáticamente el uso de plantillas
        if (!editMode && data && data.length > 0) {
          setUseTemplate(true);
        }
      } catch (error) {
        console.error('Error al cargar plantillas:', error);
        // En caso de error, intentar cargar todas las plantillas como fallback
        try {
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('tax_templates')
            .select('*')
            .order('name');
          
          if (!fallbackError && fallbackData) {
            setTemplates(fallbackData);
          }
        } catch (fallbackErrorFinal) {
          console.error('Error en fallback de plantillas:', fallbackErrorFinal);
        }
      }
    };

    if (organizationId) {
      fetchTemplates();
    }
  }, [organizationId, editMode]);

  // Inicializar formulario con datos del impuesto si estamos en modo edición
  useEffect(() => {
    if (editMode && tax) {
      setName(tax.name);
      setRate(tax.rate.toString());
      setDescription(tax.description || '');
      setIsDefault(tax.is_default);
      setIsActive(tax.is_active);
      setSelectedTemplate(tax.template_id);
      setUseTemplate(!!tax.template_id);
    } else {
      // Valores por defecto para un nuevo impuesto
      setName('');
      setRate('');
      setDescription('');
      setIsDefault(false);
      setIsActive(true);
      setSelectedTemplate(null);
      setUseTemplate(false);
    }
  }, [editMode, tax]);

  // Función para aplicar datos de la plantilla seleccionada
  const applyTemplate = () => {
    if (!selectedTemplate) return;
    
    const template = templates.find(t => t.id === selectedTemplate);
    if (template) {
      setName(template.name);
      setRate(template.rate.toString());
      setDescription(template.description || '');
    }
  };

  // Efecto para aplicar la plantilla cuando cambia la selección
  useEffect(() => {
    if (useTemplate && selectedTemplate) {
      applyTemplate();
    }
  }, [selectedTemplate, useTemplate]);

  // Validación básica
  const isFormValid = () => {
    return name.trim() !== '' && !isNaN(parseFloat(rate));
  };

  // Guardar el impuesto
  const handleSave = async () => {
    // Validaciones básicas
    if (!name.trim()) {
      toast({
        title: 'Error',
        description: 'El nombre del impuesto es obligatorio.',
        variant: 'destructive',
      });
      return;
    }

    if (parseFloat(rate.toString()) < 0 || parseFloat(rate.toString()) > 100) {
      toast({
        title: 'Error',
        description: 'La tasa debe estar entre 0 y 100%.',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Llamar a la función RPC con SECURITY DEFINER para evitar problemas de RLS
      const { data, error } = await supabase.rpc('manage_organization_tax', {
        p_organization_id: organizationId,
        p_name: name,
        p_rate: parseFloat(rate.toString()),
        p_description: description || null,
        p_is_default: isDefault,
        p_is_active: isActive,
        p_template_id: useTemplate ? selectedTemplate : null,
        p_id: editMode && tax ? tax.id : null
      });

      if (error) {
        throw error;
      }

      if (data && !data.success) {
        throw new Error(data.message || 'Error desconocido al guardar el impuesto');
      }

      // Mostrar mensaje de éxito
      toast({
        title: 'Éxito',
        description: data.message || (editMode ? 'Impuesto actualizado correctamente.' : 'Impuesto creado correctamente.'),
      });

      // No necesitamos actualizar manualmente otros impuestos como predeterminados
      // porque la función RPC ya se encarga de eso

      onClose(true);
    } catch (error) {
      console.error('Error al guardar el impuesto:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar el impuesto. Intente de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Actualizar impuesto predeterminado
  const updateDefaultTax = async () => {
    try {
      if (editMode && tax) {
        // Desmarcar todos los demás impuestos como no predeterminados
        await supabase
          .from('organization_taxes')
          .update({ is_default: false })
          .eq('organization_id', organizationId)
          .neq('id', tax.id);
      } else {
        // Desmarcar todos los impuestos como no predeterminados
        // La nueva inserción ya tendrá is_default = true
        await supabase
          .from('organization_taxes')
          .update({ is_default: false })
          .eq('organization_id', organizationId);
      }
    } catch (error) {
      console.error('Error al actualizar impuesto predeterminado:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => !loading && onClose()}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto dark:bg-gray-800 dark:border-gray-700 bg-white border-gray-200">
        <DialogHeader className="px-4 sm:px-6">
          <DialogTitle className="text-lg sm:text-xl text-blue-600 dark:text-blue-400">
            {editMode ? 'Editar Impuesto' : 'Nuevo Impuesto'}
          </DialogTitle>
        </DialogHeader>
        
        {!editMode && templates.length > 0 && (
          <div className="mx-4 sm:mx-6 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-xs sm:text-sm text-blue-700 dark:text-blue-300 leading-relaxed">
              ℹ️ <strong>Plantillas sugeridas:</strong> Se muestran automáticamente los impuestos 
              configurados para su país de operación. Puede usar una plantilla o crear un impuesto personalizado.
            </p>
          </div>
        )}
        
        <div className="grid gap-4 py-4 px-4 sm:px-6">
          {!editMode && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="useTemplate" 
                  checked={useTemplate} 
                  onCheckedChange={(checked) => setUseTemplate(!!checked)}
                  className="dark:border-gray-600"
                />
                <Label htmlFor="useTemplate" className="text-sm dark:text-gray-300 cursor-pointer">
                  Usar plantilla de impuesto
                </Label>
              </div>
              
              {useTemplate && (
                <div className="grid grid-cols-1 gap-2">
                  <Label htmlFor="template" className="text-sm dark:text-gray-300">
                    Plantillas de Impuestos Disponibles
                    {templates.length > 0 && templates[0]?.country && (
                      <span className="ml-2 text-xs text-blue-600 dark:text-blue-400 font-medium">
                        ({templates[0].country})
                      </span>
                    )}
                  </Label>
                  {templates.length === 0 ? (
                    <div className="p-3 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800/50 text-center">
                      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                        No hay plantillas de impuestos disponibles para su país
                      </p>
                    </div>
                  ) : (
                    <>
                      <select
                        id="template"
                        value={selectedTemplate || ''}
                        onChange={(e) => setSelectedTemplate(Number(e.target.value))}
                        className="flex h-10 w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-200 ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600 focus:ring-offset-2"
                      >
                        <option value="" className="dark:bg-gray-900 dark:text-gray-400">Seleccionar plantilla del país</option>
                        {templates.map((template) => (
                          <option key={template.id} value={template.id} className="dark:bg-gray-900 dark:text-gray-200">
                            {template.name} - {template.rate}% {template.description ? `(${template.description})` : ''}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Se muestran solo las plantillas específicas para su país de operación
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-2">
            <Label htmlFor="name" className="text-sm dark:text-gray-300">
              Nombre <span className="text-red-500">*</span>
            </Label>
            <Input 
              id="name" 
              value={name} 
              onChange={(e) => setName(e.target.value)}
              className="dark:bg-gray-900 dark:border-gray-700 dark:text-gray-200 dark:placeholder:text-gray-500"
              placeholder="Ej: IVA 19%"
            />
          </div>

          <div className="grid grid-cols-1 gap-2">
            <Label htmlFor="rate" className="text-sm dark:text-gray-300">
              Tasa (%) <span className="text-red-500">*</span>
            </Label>
            <Input 
              id="rate" 
              value={rate} 
              onChange={(e) => {
                // Solo permitir números y punto decimal
                const value = e.target.value.replace(/[^0-9.]/g, '');
                setRate(value);
              }}
              className="dark:bg-gray-900 dark:border-gray-700 dark:text-gray-200 dark:placeholder:text-gray-500"
              placeholder="Ej: 19"
              type="text"
              inputMode="decimal"
            />
          </div>

          <div className="grid grid-cols-1 gap-2">
            <Label htmlFor="description" className="text-sm dark:text-gray-300">
              Descripción
            </Label>
            <Textarea 
              id="description" 
              value={description} 
              onChange={(e) => setDescription(e.target.value)}
              className="resize-none min-h-[80px] dark:bg-gray-900 dark:border-gray-700 dark:text-gray-200 dark:placeholder:text-gray-500"
              placeholder="Descripción del impuesto"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Switch 
              id="isActive" 
              checked={isActive} 
              onCheckedChange={setIsActive}
              className="data-[state=checked]:bg-green-600 dark:data-[state=checked]:bg-green-700"
            />
            <Label htmlFor="isActive" className="text-sm dark:text-gray-300 cursor-pointer">
              Impuesto activo
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Switch 
              id="isDefault" 
              checked={isDefault} 
              onCheckedChange={setIsDefault}
              className="data-[state=checked]:bg-amber-600 dark:data-[state=checked]:bg-amber-700"
            />
            <Label htmlFor="isDefault" className="text-sm dark:text-gray-300 cursor-pointer">
              Impuesto predeterminado
            </Label>
          </div>
        </div>

        <DialogFooter className="px-4 sm:px-6 flex-col sm:flex-row gap-2">
          <Button 
            variant="outline" 
            onClick={() => onClose()} 
            disabled={loading}
            className="w-full sm:w-auto dark:border-gray-700 dark:hover:bg-gray-700 dark:text-gray-300"
          >
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={loading || !isFormValid()}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                <span className="text-sm sm:text-base">Guardando...</span>
              </>
            ) : (
              <span className="text-sm sm:text-base">Guardar</span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TaxForm;
