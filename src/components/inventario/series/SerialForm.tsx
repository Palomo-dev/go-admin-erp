'use client';
import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

export type SerialNumber = {
  id?: number;
  product_id: number;
  serial: string;
  status: string;
  sale_id?: string | null;
  purchase_id?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  product_name?: string; // Información adicional para la UI
};

interface SerialFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serialData?: SerialNumber | null;
  onSuccess?: () => void;
}

// No necesitamos mapeo de estados porque ahora los valores del Select
// ya coinciden con los valores aceptados por la base de datos

export function SerialForm({ open, onOpenChange, serialData = null, onSuccess }: SerialFormProps) {
  const { toast } = useToast();
  const [products, setProducts] = useState<{ id: number; name: string; sku: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<SerialNumber>({
    product_id: 0,
    serial: '',
    status: 'in_stock', // Valor por defecto que acepta la base de datos
    notes: '',
  });

  // Cargar productos al abrir el formulario
  useEffect(() => {
    const fetchProducts = async () => {
      const organizationId = getOrganizationId();
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku')
        .eq('organization_id', organizationId)
        .order('name', { ascending: true });

      if (error) {
        console.error('Error al cargar productos:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'No se pudieron cargar los productos',
        });
      } else if (data) {
        setProducts(data);
      }
    };

    if (open) {
      fetchProducts();
      
      // Si tenemos datos para editar, los cargamos
      if (serialData) {
        // Convertimos el status de base de datos al valor para UI si es necesario
        setFormData({
          ...serialData,
          // Mantenemos el valor original si ya es uno de los aceptados por la base de datos
        });
      } else {
        // Reset form para nuevo registro
        setFormData({
          product_id: 0,
          serial: '',
          status: 'in_stock', // Usamos valores aceptados por la base de datos
          notes: '',
        });
      }
    }
  }, [open, serialData, toast]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    if (name === 'product_id') {
      // Aseguramos que product_id sea siempre un número válido
      const numValue = parseInt(value, 10);
      if (!isNaN(numValue)) {
        setFormData((prev) => ({ ...prev, [name]: numValue }));
      }
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validaciones básicas
      if (!formData.product_id) {
        throw new Error('Debe seleccionar un producto');
      }
      
      if (!formData.serial || formData.serial.trim() === '') {
        throw new Error('El número de serie es obligatorio');
      }

      // Comprobar duplicados
      const { data: existingSerial } = await supabase
        .from('serial_numbers')
        .select('id')
        .eq('serial', formData.serial)
        .single();

      // Verificamos si ya existe un número de serie igual (excepto si es el mismo que estamos editando)
      const editingId = serialData?.id;
      if (existingSerial && (!editingId || existingSerial.id !== editingId)) {
        throw new Error('Este número de serie ya está registrado');
      }

      // Validamos que product_id sea un número válido
      if (typeof formData.product_id !== 'number' || isNaN(formData.product_id)) {
        throw new Error('El ID de producto no es válido');
      }

      // Creamos un objeto con solo los campos válidos para la tabla serial_numbers
      const serialPayload: {
        product_id: number;
        serial: string;
        status: string;
        notes: string | null;
        sale_id?: string | null;
        purchase_id?: string | null;
      } = {
        product_id: formData.product_id,
        serial: formData.serial.trim(),
        // Aseguramos que el status cumpla con la restricción CHECK de la base de datos
        // El formData.status ya contiene valores directamente válidos para la BD
        status: formData.status,
        notes: formData.notes || null
      };
      
      // Añadimos sale_id y purchase_id solo si tienen valores válidos
      if (formData.sale_id && formData.sale_id.trim() !== '') {
        serialPayload.sale_id = formData.sale_id.trim();
      }
      
      if (formData.purchase_id && formData.purchase_id.trim() !== '') {
        serialPayload.purchase_id = formData.purchase_id.trim();
      }

      // Imprimir el payload en consola para depuración
      console.log('Payload a enviar a Supabase:', serialPayload);
      
      // Verificamos que el status sea uno de los valores permitidos por la restricción CHECK
      const validStatuses = ['in_stock', 'sold', 'warranty', 'repair', 'defective'];
      if (!validStatuses.includes(serialPayload.status)) {
        throw new Error(`Estado no válido: ${serialPayload.status}. Debe ser uno de: ${validStatuses.join(', ')}`);
      }
      
      if (editingId) {
        // Actualización - solo enviamos los campos que existen en la tabla
        const { error } = await supabase
          .from('serial_numbers')
          .update(serialPayload)
          .eq('id', editingId);

        if (error) {
          console.error('Error de Supabase:', error);
          throw new Error(`Error al actualizar: ${error.message || 'Error desconocido'}`);
        }

        toast({ 
          title: 'Registro actualizado', 
          description: 'El número de serie se actualizó correctamente' 
        });
      } else {
        // Creación - solo enviamos los campos que existen en la tabla
        const { error } = await supabase
          .from('serial_numbers')
          .insert(serialPayload);

        if (error) {
          console.error('Error de Supabase:', error);
          throw new Error(`Error al crear: ${error.message || 'Error desconocido'}`);
        }

        toast({ 
          title: 'Registro creado', 
          description: 'El registro se creó correctamente' 
        });
      }

      // Cerrar formulario y actualizar datos
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Ha ocurrido un error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {serialData ? 'Editar Número de Serie' : 'Registrar Número de Serie'}
          </DialogTitle>
          <DialogDescription>
            Complete los campos para {serialData ? 'actualizar' : 'registrar'} un número de serie.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="product_id">Producto *</Label>
            <Select
              name="product_id"
              value={formData.product_id.toString()}
              onValueChange={(value) => handleSelectChange('product_id', value)}
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar producto" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Productos</SelectLabel>
                  {products.length === 0 ? (
                    <SelectItem value="0" disabled>No hay productos disponibles</SelectItem>
                  ) : (
                    products.map((product) => (
                      <SelectItem key={product.id} value={product.id.toString()}>
                        {product.name} - {product.sku}
                      </SelectItem>
                    ))
                  )}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="serial">Número de Serie *</Label>
            <Input
              id="serial"
              name="serial"
              value={formData.serial}
              onChange={handleChange}
              disabled={isLoading}
              required
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Estado *</Label>
            <Select
              name="status"
              value={formData.status}
              onValueChange={(value) => handleSelectChange('status', value)}
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Estado</SelectLabel>
                  <SelectItem value="in_stock">En stock</SelectItem>
                  <SelectItem value="sold">Vendida</SelectItem>
                  <SelectItem value="warranty">Garantía</SelectItem>
                  <SelectItem value="repair">Reparación</SelectItem>
                  <SelectItem value="defective">Defectuoso</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              name="notes"
              value={formData.notes || ''}
              onChange={handleChange}
              disabled={isLoading}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Guardando...' : serialData ? 'Actualizar' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
