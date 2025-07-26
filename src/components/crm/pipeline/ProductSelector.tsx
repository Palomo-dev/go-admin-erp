"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, Plus } from "lucide-react";
import { formatCurrency } from "@/utils/Utils";

interface Product {
  id: number;
  name: string;
  sku: string;
}

interface SelectedProduct {
  product: Product;
  quantity: number;
  unit_price: number;
}

interface ProductSelectorProps {
  products: Product[];
  selectedProducts: SelectedProduct[];
  onProductsChange: (products: SelectedProduct[]) => void;
  currency: string;
}

export default function ProductSelector({ 
  products, 
  selectedProducts, 
  onProductsChange,
  currency 
}: ProductSelectorProps) {
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");

  const handleAddProduct = () => {
    if (!selectedProductId || !quantity || !unitPrice) {
      return;
    }

    const product = products.find(p => p.id.toString() === selectedProductId);
    if (!product) return;

    // Verificar si el producto ya está seleccionado
    const existingIndex = selectedProducts.findIndex(sp => sp.product.id === product.id);
    
    const newSelectedProduct: SelectedProduct = {
      product,
      quantity: parseFloat(quantity),
      unit_price: parseFloat(unitPrice)
    };

    let updatedProducts: SelectedProduct[];
    if (existingIndex >= 0) {
      // Actualizar producto existente
      updatedProducts = [...selectedProducts];
      updatedProducts[existingIndex] = newSelectedProduct;
    } else {
      // Agregar nuevo producto
      updatedProducts = [...selectedProducts, newSelectedProduct];
    }

    onProductsChange(updatedProducts);

    // Limpiar formulario
    setSelectedProductId("");
    setQuantity("1");
    setUnitPrice("");
  };

  const handleRemoveProduct = (productId: number) => {
    const updatedProducts = selectedProducts.filter(sp => sp.product.id !== productId);
    onProductsChange(updatedProducts);
  };

  const getTotalAmount = () => {
    return selectedProducts.reduce((total, sp) => total + (sp.quantity * sp.unit_price), 0);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-12 gap-2 items-end">
        <div className="col-span-5">
          <Label htmlFor="product" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Producto
          </Label>
          <Select value={selectedProductId} onValueChange={setSelectedProductId}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar producto" />
            </SelectTrigger>
            <SelectContent>
              {(() => {
                console.log("Renderizando selector de productos. Total:", products.length);
                if (products.length === 0) {
                  console.log("No hay productos disponibles:", products);
                  return (
                    <SelectItem value="no-data" disabled>
                      No hay productos disponibles
                    </SelectItem>
                  );
                }
                return products.map((product) => {
                  console.log("Renderizando producto:", product);
                  return (
                    <SelectItem key={product.id} value={product.id.toString()}>
                      {product.name} ({product.sku})
                    </SelectItem>
                  );
                });
              })()}
            </SelectContent>
          </Select>
        </div>
        
        <div className="col-span-2">
          <Label htmlFor="quantity" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Cantidad
          </Label>
          <Input
            id="quantity"
            type="number"
            min="0.01"
            step="0.01"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="1"
          />
        </div>
        
        <div className="col-span-3">
          <Label htmlFor="unitPrice" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Precio unitario
          </Label>
          <Input
            id="unitPrice"
            type="number"
            min="0"
            step="0.01"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            placeholder="0.00"
          />
        </div>
        
        <div className="col-span-2">
          <Button
            type="button"
            onClick={handleAddProduct}
            disabled={!selectedProductId || !quantity || !unitPrice}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {selectedProducts.length > 0 && (
        <Card className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-900 dark:text-white">
              Productos Seleccionados
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {selectedProducts.map((sp) => (
              <div
                key={sp.product.id}
                className="flex items-center justify-between p-2 bg-white dark:bg-gray-700 rounded-md border border-gray-200 dark:border-gray-600"
              >
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-white text-sm">
                    {sp.product.name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    SKU: {sp.product.sku} • Cantidad: {sp.quantity} • Precio: {formatCurrency(sp.unit_price)}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-gray-900 dark:text-white text-sm">
                    {formatCurrency(sp.quantity * sp.unit_price)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveProduct(sp.product.id)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            
            {selectedProducts.length > 1 && (
              <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-600">
                <span className="font-medium text-gray-900 dark:text-white">
                  Total productos:
                </span>
                <span className="font-bold text-blue-600 dark:text-blue-400">
                  {formatCurrency(getTotalAmount())} {currency}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
