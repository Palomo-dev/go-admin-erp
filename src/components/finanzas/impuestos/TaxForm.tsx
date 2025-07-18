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

  // Cargar datos de plantillas de impuestos
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const { data, error } = await supabase
          .from('tax_templates')
          .select('*')
          .order('name');

        if (error) throw error;
        setTemplates(data || []);
      } catch (error) {
        console.error('Error al cargar plantillas:', error);
      }
    };

    fetchTemplates();
  }, []);

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
      <DialogContent className="sm:max-w-[500px] dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-xl text-blue-600 dark:text-blue-400">
            {editMode ? 'Editar Impuesto' : 'Nuevo Impuesto'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          {!editMode && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="useTemplate" 
                  checked={useTemplate} 
                  onCheckedChange={(checked) => setUseTemplate(!!checked)}
                />
                <Label htmlFor="useTemplate" className="dark:text-gray-300">
                  Usar plantilla de impuesto
                </Label>
              </div>
              
              {useTemplate && (
                <div className="grid grid-cols-1 gap-2">
                  <Label htmlFor="template" className="dark:text-gray-300">
                    Plantilla
                  </Label>
                  <select
                    id="template"
                    value={selectedTemplate || ''}
                    onChange={(e) => setSelectedTemplate(Number(e.target.value))}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 dark:border-gray-700 dark:bg-gray-900"
                  >
                    <option value="">Seleccionar plantilla</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} ({template.rate}%) - {template.code}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-2">
            <Label htmlFor="name" className="dark:text-gray-300">
              Nombre <span className="text-red-500">*</span>
            </Label>
            <Input 
              id="name" 
              value={name} 
              onChange={(e) => setName(e.target.value)}
              className="dark:bg-gray-900 dark:border-gray-700"
              placeholder="Ej: IVA 19%"
            />
          </div>

          <div className="grid grid-cols-1 gap-2">
            <Label htmlFor="rate" className="dark:text-gray-300">
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
              className="dark:bg-gray-900 dark:border-gray-700"
              placeholder="Ej: 19"
            />
          </div>

          <div className="grid grid-cols-1 gap-2">
            <Label htmlFor="description" className="dark:text-gray-300">
              Descripción
            </Label>
            <Textarea 
              id="description" 
              value={description} 
              onChange={(e) => setDescription(e.target.value)}
              className="resize-none dark:bg-gray-900 dark:border-gray-700"
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
            <Label htmlFor="isActive" className="dark:text-gray-300">
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
            <Label htmlFor="isDefault" className="dark:text-gray-300">
              Impuesto predeterminado
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onClose()} 
            disabled={loading}
            className="dark:border-gray-700 dark:hover:bg-gray-700"
          >
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={loading || !isFormValid()}
            className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              'Guardar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TaxForm;
