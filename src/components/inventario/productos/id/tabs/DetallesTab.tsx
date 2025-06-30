'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { CalendarIcon, Save, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface DetallesTabProps {
  producto: any;
}

/**
 * Pestaña de Detalles del producto
 * Muestra y permite editar los campos básicos
 */
const DetallesTab: React.FC<DetallesTabProps> = ({ producto }) => {
  const { theme } = useTheme();
  const router = useRouter();
  const { organization } = useOrganization();
  
  const [loading, setLoading] = useState<boolean>(false);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [unidades, setUnidades] = useState<any[]>([]);
  const [proveedores, setProveedores] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    name: producto.name || '',
    sku: producto.sku || '',
    barcode: producto.barcode || '',
    description: producto.description || '',
    category_id: producto.category_id || '',
    unit_code: producto.unit_code || '',
    supplier_id: producto.supplier_id || '',
    track_stock: producto.track_stock || false,
  });
  
  // Cargar datos de categorías, unidades y proveedores al montar el componente
  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!organization?.id) return;
        
        // Cargar categorías
        const { data: categoriasData } = await supabase
          .from('categories')
          .select('*')
          .eq('organization_id', organization.id)
          .order('name');
        
        if (categoriasData) setCategorias(categoriasData);
        
        // Cargar unidades
        const { data: unidadesData } = await supabase
          .from('units')
          .select('*')
          .order('name');
        
        if (unidadesData) setUnidades(unidadesData);
        
        // Cargar proveedores
        const { data: proveedoresData } = await supabase
          .from('suppliers')
          .select('*')
          .eq('organization_id', organization.id)
          .order('name');
        
        if (proveedoresData) setProveedores(proveedoresData);
        
      } catch (error) {
        console.error('Error al cargar datos complementarios:', error);
      }
    };
    
    fetchData();
  }, [organization]);
  
  // Manejar cambio en los inputs del formulario
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };
  
  // Manejar cambio en campos de select
  const handleSelectChange = (name: string, value: string) => {
    // Convertir 'none' a null o valor vacío según corresponda
    const processedValue = value === 'none' ? null : value;
    setFormData({ ...formData, [name]: processedValue });
  };
  
  // Manejar cambio en switch de seguimiento de stock
  const handleSwitchChange = (checked: boolean) => {
    setFormData({
      ...formData,
      track_stock: checked,
    });
  };
  
  // Guardar cambios en el producto
  const handleSaveChanges = async () => {
    setLoading(true);
    
    try {
      const { error } = await supabase
        .from('products')
        .update({
          name: formData.name,
          sku: formData.sku,
          barcode: formData.barcode,
          description: formData.description,
          category_id: formData.category_id || null,
          unit_code: formData.unit_code || null,
          supplier_id: formData.supplier_id || null,
          track_stock: formData.track_stock,
          updated_at: new Date().toISOString(),
        })
        .eq('id', producto.id)
        .eq('organization_id', organization?.id);
      
      if (error) throw error;
      
      toast({
        title: "Cambios guardados",
        description: "Los datos del producto se actualizaron correctamente",
      });
      
      // Recargar la página para mostrar los datos actualizados
      router.refresh();
      
    } catch (error: any) {
      console.error('Error al guardar cambios:', error);
      toast({
        variant: "destructive",
        title: "Error al guardar",
        description: error.message || "No se pudieron guardar los cambios. Intente de nuevo más tarde.",
      });
    } finally {
      setLoading(false);
    }
  };
  
  // Formatear fechas para mostrar hace cuánto tiempo
  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      return formatDistanceToNow(new Date(dateString), {
        addSuffix: true,
        locale: es
      });
    } catch (e) {
      return 'Fecha inválida';
    }
  };
  
  return (
    <div className="space-y-8">
      {/* Formulario de detalles */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Información Básica</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre del Producto</Label>
            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="Nombre del producto"
              className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="sku">SKU</Label>
            <Input
              id="sku"
              name="sku"
              value={formData.sku}
              onChange={handleInputChange}
              placeholder="SKU único"
              className={`font-mono ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}`}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="barcode">Código de Barras</Label>
            <Input
              id="barcode"
              name="barcode"
              value={formData.barcode}
              onChange={handleInputChange}
              placeholder="Código de barras (opcional)"
              className={`font-mono ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}`}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="category_id">Categoría</Label>
            <Select
              value={formData.category_id?.toString() || 'none'}
              onValueChange={(value) => handleSelectChange('category_id', value)}
            >
              <SelectTrigger 
                className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}
              >
                <SelectValue placeholder="Seleccionar categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin categoría</SelectItem>
                {categorias.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id.toString()}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="unit_code">Unidad de Medida</Label>
            <Select
              value={formData.unit_code || 'none'}
              onValueChange={(value) => handleSelectChange('unit_code', value)}
            >
              <SelectTrigger 
                className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}
              >
                <SelectValue placeholder="Seleccionar unidad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin unidad</SelectItem>
                {unidades.map((unit) => (
                  <SelectItem key={unit.code} value={unit.code}>
                    {unit.name} ({unit.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="supplier_id">Proveedor</Label>
            <Select
              value={formData.supplier_id?.toString() || 'none'}
              onValueChange={(value) => handleSelectChange('supplier_id', value)}
            >
              <SelectTrigger 
                className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}
              >
                <SelectValue placeholder="Seleccionar proveedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin proveedor</SelectItem>
                {proveedores.map((prov) => (
                  <SelectItem key={prov.id} value={prov.id.toString()}>
                    {prov.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="description">Descripción</Label>
          <Textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            placeholder="Descripción detallada del producto"
            className={`min-h-24 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}`}
          />
        </div>
        
        <div className="flex items-center space-x-2 py-2">
          <Switch
            id="track_stock"
            checked={formData.track_stock}
            onCheckedChange={handleSwitchChange}
          />
          <Label htmlFor="track_stock">Seguimiento de Stock</Label>
        </div>
      </div>
      
      {/* Metadatos y botón guardar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pt-4 border-t border-gray-200 dark:border-gray-800">
        <div className="space-y-1 text-sm text-gray-500 dark:text-gray-400">
          <div className="flex items-center">
            <CalendarIcon className="h-4 w-4 mr-1" />
            <span>Creado: {formatDate(producto.created_at)}</span>
          </div>
          <div className="flex items-center">
            <CalendarIcon className="h-4 w-4 mr-1" />
            <span>Última modificación: {formatDate(producto.updated_at)}</span>
          </div>
        </div>
        
        <Button 
          onClick={handleSaveChanges} 
          disabled={loading}
          className="mt-4 sm:mt-0"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Guardar Cambios
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default DetallesTab;
