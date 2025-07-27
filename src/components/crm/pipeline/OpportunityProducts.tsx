"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, Plus, Edit, Trash2 } from "lucide-react";
import { formatCurrency } from "@/utils/Utils";
import { toast } from "sonner";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { getOrganizationId } from "@/components/crm/pipeline/utils/pipelineUtils";

interface OpportunityProduct {
  id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  product: {
    id: number;
    name: string;
    sku: string;
    description?: string;
  };
}

interface Product {
  id: number;
  name: string;
  sku: string;
  price: number;
  description?: string;
}

interface OpportunityProductsProps {
  opportunityId: string;
}

export default function OpportunityProducts({ opportunityId }: OpportunityProductsProps) {
  const [products, setProducts] = useState<OpportunityProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("1");
  const [unitPrice, setUnitPrice] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProducts();
    loadAvailableProducts();
  }, [opportunityId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadProducts = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('opportunity_products')
        .select(`
          *,
          product:products(id, name, sku, description)
        `)
        .eq('opportunity_id', opportunityId);

      if (error) {
        console.error('Error cargando productos:', error);
        toast.error('Error al cargar los productos');
        return;
      }

      setProducts(data || []);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al cargar los productos');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableProducts = async () => {
    try {
      const organizationId = getOrganizationId();
      console.log('🔍 [OpportunityProducts] Cargando productos para organización:', organizationId);
      
      const { data, error } = await supabase
        .from('products')
        .select(`
          id, 
          name, 
          sku,
          description,
          product_prices(
            price
          )
        `)
        .eq('organization_id', organizationId)
        .eq('status', 'active')
        .order('name');

      if (error) {
        console.error('❌ [OpportunityProducts] Error cargando productos:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        toast.error('Error al cargar productos');
        return;
      }

      // Transformar datos para incluir el precio del primer registro de product_prices
      const productsWithPrice = data?.map(product => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        description: product.description,
        price: product.product_prices?.[0]?.price || 0
      })) || [];

      console.log('✅ [OpportunityProducts] Productos cargados:', productsWithPrice.length);
      console.log('📊 [OpportunityProducts] Productos con precios:', productsWithPrice);
      setAvailableProducts(productsWithPrice);
    } catch (error) {
      console.error('❌ [OpportunityProducts] Error inesperado:', error);
      toast.error('Error inesperado al cargar productos');
    }
  };

  const handleAddProduct = async () => {
    try {
      setSaving(true);

      // Validaciones
      if (!selectedProductId) {
        toast.error('Debe seleccionar un producto');
        return;
      }

      const qty = parseFloat(quantity);
      const price = parseFloat(unitPrice);

      if (isNaN(qty) || qty <= 0) {
        toast.error('La cantidad debe ser mayor a 0');
        return;
      }

      if (isNaN(price) || price < 0) {
        toast.error('El precio debe ser un número válido');
        return;
      }

      // Verificar si el producto ya está agregado
      const existingProduct = products.find(p => p.product.id.toString() === selectedProductId);
      if (existingProduct) {
        toast.error('Este producto ya está agregado a la oportunidad');
        return;
      }

      // Insertar en opportunity_products
      const insertData = {
        opportunity_id: opportunityId,
        product_id: parseInt(selectedProductId),
        quantity: qty,
        unit_price: price
        // total_price se calcula automáticamente en la base de datos
      };

      console.log('🔍 [OpportunityProducts] Datos a insertar:', insertData);
      console.log('🔍 [OpportunityProducts] Tipo de opportunity_id:', typeof opportunityId, opportunityId);

      const { error } = await supabase
        .from('opportunity_products')
        .insert(insertData);

      if (error) {
        console.error('❌ [OpportunityProducts] Error agregando producto:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          insertData: insertData
        });
        toast.error(`Error al agregar el producto: ${error.message || 'Error desconocido'}`);
        return;
      }

      toast.success('Producto agregado exitosamente');
      
      // Resetear formulario y cerrar diálogo
      setSelectedProductId('');
      setQuantity('1');
      setUnitPrice('');
      setIsDialogOpen(false);
      
      // Recargar productos
      loadProducts();

    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al agregar el producto');
    } finally {
      setSaving(false);
    }
  };

  const handleProductSelect = (productId: string) => {
    setSelectedProductId(productId);
    
    // Auto-llenar el precio del producto seleccionado
    const selectedProduct = availableProducts.find(p => p.id.toString() === productId);
    if (selectedProduct) {
      setUnitPrice(selectedProduct.price.toString());
    }
  };

  const calculateTotal = () => {
    return products.reduce((sum, item) => sum + item.total_price, 0);
  };

  const calculateProbability = () => {
    // Lógica para calcular probabilidad basada en productos
    // Por ahora retornamos un valor base
    const baseProb = 30;
    const productCount = products.length;
    const adjustedProb = Math.min(baseProb + (productCount * 10), 90);
    return adjustedProb;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Productos/Servicios Cotizados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Productos/Servicios Cotizados
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-blue-50 dark:bg-blue-900/20">
              Probabilidad: {calculateProbability()}%
            </Badge>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar Producto
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Agregar Producto a la Oportunidad</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="product">Producto *</Label>
                    <Select value={selectedProductId} onValueChange={handleProductSelect}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar producto" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableProducts.map((product) => (
                          <SelectItem key={product.id} value={product.id.toString()}>
                            <div className="flex flex-col">
                              <span className="font-medium">{product.name}</span>
                              <span className="text-sm text-muted-foreground">
                                SKU: {product.sku} • {formatCurrency(product.price)}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="quantity">Cantidad *</Label>
                      <Input
                        id="quantity"
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        placeholder="1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="unitPrice">Precio Unitario *</Label>
                      <Input
                        id="unitPrice"
                        type="number"
                        step="0.01"
                        min="0"
                        value={unitPrice}
                        onChange={(e) => setUnitPrice(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  {selectedProductId && quantity && unitPrice && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Total:</span>
                        <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                          {formatCurrency(parseFloat(quantity) * parseFloat(unitPrice))}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setIsDialogOpen(false)}
                      disabled={saving}
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleAddProduct}
                      disabled={saving || !selectedProductId || !quantity || !unitPrice}
                    >
                      {saving ? "Agregando..." : "Agregar Producto"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {products.length === 0 ? (
          <div className="text-center py-8">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No hay productos cotizados</h3>
            <p className="text-muted-foreground mb-4">
              Agrega productos o servicios para completar la cotización
            </p>
            <Button variant="outline" onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Agregar Primer Producto
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto/Servicio</TableHead>
                  <TableHead className="text-center">Cantidad</TableHead>
                  <TableHead className="text-right">Precio Unitario</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{item.product.name}</p>
                        {item.product.sku && (
                          <p className="text-sm text-muted-foreground">SKU: {item.product.sku}</p>
                        )}
                        {item.product.description && (
                          <p className="text-sm text-muted-foreground">{item.product.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">{item.quantity}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(item.unit_price)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(item.total_price)}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button size="sm" variant="ghost">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            
            <div className="flex justify-between items-center pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                {products.length} producto{products.length !== 1 ? 's' : ''} cotizado{products.length !== 1 ? 's' : ''}
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Total Cotizado</p>
                <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                  {formatCurrency(calculateTotal())}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
