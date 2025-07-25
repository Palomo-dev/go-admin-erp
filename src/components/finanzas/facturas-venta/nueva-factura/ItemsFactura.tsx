'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { Plus, Trash2, Search } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { InvoiceItem } from './NuevaFacturaForm';

type Product = {
  id: number;
  name: string;
  price: number;
  sku: string;
  description?: string;
  tax_id?: string;
  tax_code?: string;
  tax_name?: string;
  tax_rate?: number;
};

type ItemsFacturaProps = {
  items: InvoiceItem[];
  onItemsChange: (items: InvoiceItem[]) => void;
  taxIncluded?: boolean; // Prop para saber si los impuestos están incluidos
};

export function ItemsFactura({ items, onItemsChange, taxIncluded = false }: ItemsFacturaProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const organizationId = getOrganizationId();

  // Cargar productos al iniciar
  useEffect(() => {
    if (organizationId) {
      cargarProductos();
    }
  }, [organizationId]);

  // Función para cargar productos
  const cargarProductos = async () => {
    try {
      setIsLoading(true);
      
      // Consultar productos con sus precios más recientes
      const { data, error } = await supabase
        .rpc('get_products_with_latest_prices', { org_id: organizationId });
      
      if (error) {
        // Si falla la función RPC, intentamos con una consulta directa
        console.warn('Fallback a consulta manual por error en RPC:', error);
        
        // Subconsulta para obtener los precios más recientes de cada producto
        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select(`
            id, name, sku, description,
            product_prices!inner(price, effective_from)
          `)
          .eq('organization_id', organizationId)
          .is('product_prices.effective_to', null)
          .order('name', { ascending: true });
          
        if (productsError) throw productsError;
        
        // Formatear los datos para que tengan la estructura esperada
        const formattedProducts = productsData?.map(product => ({
          id: product.id,
          name: product.name,
          sku: product.sku,
          price: product.product_prices[0]?.price || 0,
          description: product.description,
          // No tenemos información de impuestos en esta consulta fallback
          tax_id: undefined,
          tax_code: undefined,
          tax_name: undefined,
          tax_rate: undefined
        })) || [];
        
        setProducts(formattedProducts);
      } else {
        // Si la función RPC funciona correctamente
        setProducts(data || []);
      }
      
    } catch (error) {
      console.error('Error al cargar productos:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los productos. Intente nuevamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Filtrar productos por búsqueda
  const filteredProducts = searchTerm 
    ? products.filter(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : products;

  // Agregar ítem a la factura
  const agregarItem = (product: Product) => {
    // PRIMERO: Obtenemos el estado actual de taxIncluded para mayor claridad
    const includeTax = taxIncluded;
    console.log('Estado actual de taxIncluded al agregar item:', includeTax);
    
    // Calcular el total_line según si el impuesto está incluido o no
    let total_line = product.price; // Precio base por defecto
    
    if (product.tax_rate) {
      if (includeTax) {
        // Si hay impuesto y ESTÁ incluido, el precio ya incluye el impuesto
        // El total es simplemente precio * cantidad (que en este caso es 1)
        total_line = product.price;
        console.log(`Agregando ítem con impuesto INCLUIDO - Precio: ${product.price}, Total: ${total_line}`);
      } else {
        // Si hay impuesto y NO está incluido, lo añadimos al total_line
        const taxAmount = product.price * (product.tax_rate / 100);
        total_line = product.price + taxAmount;
        console.log(`Agregando ítem con impuesto NO incluido - Precio: ${product.price}, Impuesto: ${taxAmount}, Total: ${total_line}`);
      }
    }
    
    const newItem: InvoiceItem = {
      // Nota: id será asignado por la base de datos al guardar
      // invoice_sales_id y invoice_id serán asignados al guardar la factura
      invoice_type: 'sale', // Predefinimos el tipo como venta
      product_id: product.id,
      description: product.name,
      qty: 1,
      unit_price: product.price,
      tax_code: product.tax_code || null,
      tax_rate: product.tax_rate || null,
      tax_included: includeTax, // Usamos el valor del prop taxIncluded
      total_line: total_line,
      product_name: product.name,
    };
    
    console.log('Agregando item con impuesto incluido:', includeTax);
    onItemsChange([...items, newItem]);
    setIsOpen(false);
  };

  // Agregar ítem manual
  const agregarItemManual = () => {
    // Capturamos el estado actual de taxIncluded para mayor claridad
    const includeTax = taxIncluded;
    console.log('Estado actual de taxIncluded al agregar item manual:', includeTax);
    
    const newItem: InvoiceItem = {
      // Nota: id será asignado por la base de datos al guardar
      // invoice_sales_id y invoice_id serán asignados al guardar la factura
      invoice_type: 'sale', // Predefinimos el tipo como venta
      description: '',
      qty: 1,
      unit_price: 0,
      tax_included: includeTax, // Usamos el valor del prop taxIncluded
      total_line: 0,
    };
    
    console.log('Agregando item manual con impuesto incluido:', includeTax);
    onItemsChange([...items, newItem]);
  };

  // Actualizar un ítem
  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const updatedItems = [...items];
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: value,
    };

    // Si estamos cambiando el tax_code o tax_rate, actualizar tax_included según el estado actual
    if (field === 'tax_code' || field === 'tax_rate') {
      updatedItems[index].tax_included = taxIncluded;
    }

    // Recalcular total_line considerando si el impuesto está incluido o no
    const item = updatedItems[index];
    const quantity = item.qty;
    const unitPrice = item.unit_price;
    const taxRate = item.tax_rate || 0;
    
    if (item.tax_included) {
      // Si el impuesto está incluido en el precio, el total es simplemente precio x cantidad
      // El precio ya contiene el impuesto
      item.total_line = quantity * unitPrice;
      console.log(`Ítem ${index} con impuesto INCLUIDO - Total: ${item.total_line}`);
    } else {
      // Si el impuesto NO está incluido, calculamos el total añadiendo el impuesto
      // Solo si tiene una tasa de impuesto asignada
      if (taxRate > 0) {
        const lineSubtotal = quantity * unitPrice;
        const taxAmount = lineSubtotal * (taxRate / 100);
        item.total_line = lineSubtotal + taxAmount;
        console.log(`Ítem ${index} con impuesto NO incluido - Subtotal: ${lineSubtotal}, Impuesto: ${taxAmount}, Total: ${item.total_line}`);
      } else {
        item.total_line = quantity * unitPrice;
      }
    }
    
    onItemsChange(updatedItems);
  };

  // Eliminar un ítem
  const eliminarItem = (index: number) => {
    const updatedItems = items.filter((_, i) => i !== index);
    onItemsChange(updatedItems);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Search className="h-4 w-4 mr-2" />
              Buscar Producto
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Buscar Producto</DialogTitle>
            </DialogHeader>
            
            <div className="py-4 space-y-4">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Buscar por nombre o SKU"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <div className="max-h-72 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Precio</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.map(product => (
                      <TableRow key={product.id}>
                        <TableCell>{product.name}</TableCell>
                        <TableCell>{product.sku}</TableCell>
                        <TableCell className="text-right">${product.price.toLocaleString()}</TableCell>
                        <TableCell>
                          <Button 
                            size="sm" 
                            onClick={() => agregarItem(product)}
                            className="h-8 px-2"
                          >
                            Agregar
                            {product.tax_name && (
                              <span className="ml-1 text-xs font-normal opacity-70">
                                ({product.tax_name})
                              </span>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredProducts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-4">
                          No se encontraron productos
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        
        <Button variant="outline" onClick={agregarItemManual}>
          <Plus className="h-4 w-4 mr-2" />
          Agregar Ítem Manual
        </Button>
      </div>
      
      {/* Tabla de ítems */}
      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descripción</TableHead>
              <TableHead className="text-center">Cantidad</TableHead>
              <TableHead className="text-right">Precio Unit.</TableHead>
              <TableHead className="text-center">Impuesto</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-4">
                  No hay ítems en la factura
                </TableCell>
              </TableRow>
            ) : (
              items.map((item, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <Input
                      value={item.description}
                      onChange={(e) => updateItem(index, 'description', e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="1"
                      className="text-center"
                      value={item.qty}
                      onChange={(e) => updateItem(index, 'qty', parseFloat(e.target.value))}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="text-right"
                      value={item.unit_price}
                      onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value))}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center">
                      {item.tax_code ? (
                        <span className="text-sm font-medium">{item.tax_rate}%</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">N/A</span>
                      )}
                      {item.tax_code && (
                        <div className="flex items-center gap-1 mt-1">
                          <input
                            type="checkbox"
                            id={`tax-included-${index}`}
                            checked={item.tax_included || false}
                            onChange={(e) => updateItem(index, 'tax_included', e.target.checked)}
                            className="h-3 w-3"
                          />
                          <label htmlFor={`tax-included-${index}`} className="text-xs">Incluido</label>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    ${item.total_line.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => eliminarItem(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
