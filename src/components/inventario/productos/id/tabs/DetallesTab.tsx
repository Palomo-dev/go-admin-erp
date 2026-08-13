'use client';

import { useState, useEffect } from 'react';

import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { CalendarIcon, Save, Loader2, PackageCheck, Barcode, ShieldCheck, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { SearchSelect } from '@/components/ui/search-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { STATION_LABELS, type PrinterStation } from '@/components/pos/configuracion/printersService';

interface DetallesTabProps {
  producto: any;
}

/**
 * Pestaña de Detalles del producto
 * Muestra y permite editar los campos básicos
 */
const DetallesTab: React.FC<DetallesTabProps> = ({ producto }) => {

  const router = useRouter();
  const { organization } = useOrganization();
  
  const [loading, setLoading] = useState<boolean>(false);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [unidades, setUnidades] = useState<any[]>([]);
  const [proveedores, setProveedores] = useState<any[]>([]);
  
  // Obtener el proveedor preferido desde product_suppliers
  const preferredSupplier = producto.product_suppliers?.find((ps: any) => ps.is_preferred);
  
  const [formData, setFormData] = useState({
    name: producto.name || '',
    sku: producto.sku || '',
    barcode: producto.barcode || '',
    description: producto.description || '',
    category_id: producto.category_id || '',
    unit_code: producto.unit_code || '',
    supplier_id: preferredSupplier?.supplier_id?.toString() || '',
    station: producto.station || null,
    track_stock: producto.track_stock !== false,
    product_type: producto.product_type || 'product',
    brand: producto.brand || '',
    reference: producto.reference || '',
    track_serial: producto.track_serial || false,
    warranty_months: producto.warranty_months ?? null,
    auto_generate_serial: producto.auto_generate_serial || false,
    serial_pattern: producto.serial_pattern || '',
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
  
  // Manejar cambio en el switch de track_stock
  const handleTrackStockChange = (checked: boolean) => {
    setFormData({ ...formData, track_stock: checked });
  };
  
  // Generar código de barras único (EAN-13)
  const generateBarcode = () => {
    const digits = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10));
    // Calcular dígito verificador (EAN-13 checksum)
    const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
    const checksum = (10 - (sum % 10)) % 10;
    const barcode = [...digits, checksum].join('');
    setFormData({ ...formData, barcode });
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
          barcode: formData.barcode || null,
          description: formData.description,
          category_id: formData.category_id || null,
          unit_code: formData.unit_code || null,
          station: formData.station || null,
          track_stock: formData.track_stock,
          product_type: formData.product_type,
          brand: formData.brand || null,
          reference: formData.reference || null,
          track_serial: formData.track_serial,
          warranty_months: formData.warranty_months ?? null,
          auto_generate_serial: formData.auto_generate_serial,
          serial_pattern: formData.serial_pattern || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', producto.id)
        .eq('organization_id', organization?.id);
      
      if (error) throw error;

      // Propagar track_stock a las variantes hijas
      await supabase
        .from('products')
        .update({ track_stock: formData.track_stock, updated_at: new Date().toISOString() })
        .eq('parent_product_id', producto.id);

      // Sincronizar product_suppliers
      if (formData.supplier_id) {
        const supplierId = typeof formData.supplier_id === 'string' ? parseInt(formData.supplier_id) : formData.supplier_id;
        // Quitar is_preferred de otros proveedores de este producto
        await supabase.from('product_suppliers').update({ is_preferred: false }).eq('product_id', producto.id);
        // Upsert el proveedor seleccionado como preferido
        const { data: existing } = await supabase.from('product_suppliers').select('id').eq('product_id', producto.id).eq('supplier_id', supplierId).maybeSingle();
        if (existing) {
          await supabase.from('product_suppliers').update({ is_preferred: true, cost: producto.cost || 0 }).eq('id', existing.id);
        } else {
          await supabase.from('product_suppliers').insert({ product_id: producto.id, supplier_id: supplierId, cost: producto.cost || 0, is_preferred: true });
        }
      } else {
        // Si se quitó el proveedor, quitar is_preferred de todos
        await supabase.from('product_suppliers').update({ is_preferred: false }).eq('product_id', producto.id);
      }
      
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
              className="dark:bg-gray-800 dark:border-gray-700"
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
              className="font-mono dark:bg-gray-800 dark:border-gray-700"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="barcode">Código de Barras</Label>
            <div className="flex gap-2">
              <Input
                id="barcode"
                name="barcode"
                value={formData.barcode}
                onChange={handleInputChange}
                placeholder="Código de barras (opcional)"
                className="font-mono dark:bg-gray-800 dark:border-gray-700 flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={generateBarcode}
                title="Generar código de barras"
                className="shrink-0"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="category_id">Categoría</Label>
            <SearchSelect
              options={categorias.map((cat) => ({ value: cat.id.toString(), label: cat.name }))}
              value={formData.category_id?.toString() || 'none'}
              onValueChange={(value) => handleSelectChange('category_id', value)}
              placeholder="Seleccionar categoría"
              searchPlaceholder="Buscar categoría..."
              emptyText="No se encontraron categorías"
              noneLabel="Sin categoría"
              className="dark:bg-gray-800 dark:border-gray-700"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="unit_code">Unidad de Medida</Label>
            <SearchSelect
              options={unidades.map((unit) => ({ value: unit.code, label: unit.name, sublabel: unit.code }))}
              value={formData.unit_code || 'none'}
              onValueChange={(value) => handleSelectChange('unit_code', value)}
              placeholder="Seleccionar unidad"
              searchPlaceholder="Buscar unidad..."
              emptyText="No se encontraron unidades"
              noneLabel="Sin unidad"
              className="dark:bg-gray-800 dark:border-gray-700"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="supplier_id">Proveedor</Label>
            <SearchSelect
              options={proveedores.map((prov) => ({ value: prov.id.toString(), label: prov.name }))}
              value={formData.supplier_id?.toString() || 'none'}
              onValueChange={(value) => handleSelectChange('supplier_id', value)}
              placeholder="Seleccionar proveedor"
              searchPlaceholder="Buscar proveedor..."
              emptyText="No se encontraron proveedores"
              noneLabel="Sin proveedor"
              className="dark:bg-gray-800 dark:border-gray-700"
            />
          </div>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="description">Descripción</Label>
          <RichTextEditor
            value={formData.description}
            onChange={(html) => setFormData(prev => ({ ...prev, description: html }))}
            placeholder="Descripción detallada del producto"
            className="dark:bg-gray-800 dark:border-gray-700"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="station">Estación de Cocina/Bar</Label>
          <Select
            value={formData.station || 'none'}
            onValueChange={(value) => handleSelectChange('station', value)}
          >
            <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700">
              <SelectValue placeholder="Heredar de la categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Heredar de la categoría</SelectItem>
              {Object.entries(STATION_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {/* Switch de rastreo de inventario */}
        <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <PackageCheck className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            <div>
              <Label className="text-sm font-medium text-gray-900 dark:text-white">
                Rastrear inventario
              </Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Si se desactiva, las ventas no descontarán stock de este producto
              </p>
            </div>
          </div>
          <Switch
            checked={formData.track_stock}
            onCheckedChange={handleTrackStockChange}
          />
        </div>

        {/* Tipo de Producto */}
        <div className="space-y-2">
          <Label htmlFor="product_type">Tipo de Producto</Label>
          <Select
            value={formData.product_type}
            onValueChange={(value) => {
              setFormData({ ...formData, product_type: value, track_stock: value === 'service' ? false : formData.track_stock });
            }}
          >
            <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700">
              <SelectValue placeholder="Seleccionar tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="product">Producto</SelectItem>
              <SelectItem value="service">Servicio</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500 dark:text-gray-400">Los servicios no manejan inventario.</p>
        </div>

        {/* Marca y Referencia */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="brand">Marca</Label>
            <Input
              id="brand"
              name="brand"
              value={formData.brand}
              onChange={handleInputChange}
              placeholder="Ej: Nike, Sony, Generica"
              className="dark:bg-gray-800 dark:border-gray-700"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reference">Referencia</Label>
            <Input
              id="reference"
              name="reference"
              value={formData.reference}
              onChange={handleInputChange}
              placeholder="Ej: REF-001, Modelo X"
              className="dark:bg-gray-800 dark:border-gray-700"
            />
          </div>
        </div>
      </div>

      {/* Sección de Trazabilidad de Seriales y Garantía */}
      <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
            <Barcode className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-medium">Trazabilidad de Seriales y Garantía</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Configura el seguimiento de números de serie y garantías
            </p>
          </div>
        </div>

        {/* Switch track_serial */}
        <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <Barcode className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <div>
              <Label className="text-sm font-medium text-gray-900 dark:text-white">
                Requiere número de serial
              </Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Activa el seguimiento individual de cada unidad
              </p>
            </div>
          </div>
          <Switch
            checked={formData.track_serial}
            onCheckedChange={(checked) => setFormData({ ...formData, track_serial: checked })}
          />
        </div>

        {/* Campos condicionales cuando track_serial está activo */}
        {formData.track_serial && (
          <div className="space-y-4 pl-2 border-l-2 border-blue-200 dark:border-blue-800 ml-2">
            {/* Meses de garantía */}
            <div className="space-y-2">
              <Label htmlFor="warranty_months" className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
                Meses de garantía
              </Label>
              <Input
                id="warranty_months"
                type="number"
                min="0"
                value={formData.warranty_months ?? ''}
                onChange={(e) => setFormData({ ...formData, warranty_months: e.target.value ? parseInt(e.target.value) : null })}
                placeholder="Ej: 12, 24, 36"
                className="dark:bg-gray-800 dark:border-gray-700"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Duración de la garantía en meses desde la fecha de venta
              </p>
            </div>

            {/* Auto-generar serial */}
            <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
              <div className="flex items-center gap-3">
                <RefreshCw className="h-5 w-5 text-amber-500" />
                <div>
                  <Label className="text-sm font-medium text-gray-900 dark:text-white">
                    Auto-generar seriales
                  </Label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Genera números de serie automáticamente al recibir stock
                  </p>
                </div>
              </div>
              <Switch
                checked={formData.auto_generate_serial}
                onCheckedChange={(checked) => setFormData({ ...formData, auto_generate_serial: checked })}
              />
            </div>

            {/* Patrón de serial */}
            {formData.auto_generate_serial && (
              <div className="space-y-2">
                <Label htmlFor="serial_pattern">Patrón de generación</Label>
                <Input
                  id="serial_pattern"
                  name="serial_pattern"
                  value={formData.serial_pattern}
                  onChange={handleInputChange}
                  placeholder="Ej: {PROD}-{YYYY}-{####}"
                  className="font-mono dark:bg-gray-800 dark:border-gray-700"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Variables: {'{PROD}'} = SKU, {'{YYYY}'} = año, {'{####}'} = número secuencial
                </p>
              </div>
            )}
          </div>
        )}
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
