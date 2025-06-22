"use client";

import React, { useState } from "react";
import { Tag, ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Image from "next/image";

interface Product {
  id: string;
  name: string;
  price: number;
  sku: string;
  image_url?: string;
  image_path?: string;
  image_type?: string;
  category_id?: number;
  description?: string;
  is_menu_item?: boolean;
  status?: string;
  organization_id: string;
  barcode?: string;
}

interface Category {
  id: number;
  name: string;
  slug?: string;
  parent_id?: number | null;
  rank?: number;
  organization_id: string;
}

interface ProductGridProps {
  products: Product[];
  categories: Category[];
  onProductClick: (product: Product) => void;
}

export function ProductGrid({ 
  products, 
  categories, 
  onProductClick 
}: ProductGridProps) {
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);

  // Filtrar productos por categoría
  const filteredProducts = selectedCategory
    ? products.filter(product => {
        // Convertir ambos valores a string para comparación
        const productCategoryId = product.category_id?.toString();
        const selectedCategoryId = selectedCategory.toString();
        return productCategoryId === selectedCategoryId;
      })
    : products;

  // Función para mostrar imagen del producto
  const getProductImage = (product: Product) => {
    if (product.image_url) {
      return product.image_url;
    } else if (product.image_path) {
      return product.image_path;
    } else {
      return "/product-placeholder.png"; // Imagen por defecto
    }
  };

  return (
    <div>
      {/* Categorías */}
      <div className="mb-4 overflow-x-auto pb-2">
        <div className="flex space-x-2">
          <Badge
            variant={selectedCategory === null ? "secondary" : "outline"}
            className={`
              cursor-pointer text-sm py-1 px-3 whitespace-nowrap
              ${selectedCategory === null 
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800' 
                : 'bg-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}
            `}
            onClick={() => setSelectedCategory(null)}
          >
            Todos
          </Badge>
          
          {categories.map(category => (
            <Badge
              key={category.id}
              variant={selectedCategory === category.id ? "secondary" : "outline"}
              className={`
                cursor-pointer text-sm py-1 px-3 whitespace-nowrap
                ${selectedCategory === category.id
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800' 
                  : 'bg-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}
              `}
              onClick={() => setSelectedCategory(category.id)}
            >
              <Tag className="h-3 w-3 mr-1" />
              {category.name}
            </Badge>
          ))}
        </div>
      </div>
      
      {/* Productos */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-3">
        {filteredProducts.length > 0 ? (
          filteredProducts.map(product => (
            <Card 
              key={product.id}
              className="cursor-pointer bg-white dark:bg-gray-850 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-500 transition-colors"
              onClick={() => onProductClick(product)}
            >
              <CardContent className="p-0">
                <div className="relative aspect-square w-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  {product.image_url || product.image_path ? (
                    <Image
                      src={getProductImage(product)}
                      alt={product.name}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center w-full h-full text-gray-400 dark:text-gray-500">
                      <ShoppingCart className="h-12 w-12" />
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate" title={product.name}>
                    {product.name}
                  </h3>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400 truncate" title={product.sku}>
                      SKU: {product.sku}
                    </span>
                    <span className="font-semibold text-sm text-blue-700 dark:text-blue-400">
                      ${product.price?.toFixed(2) || '0.00'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="col-span-full text-center py-12">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No se encontraron productos{selectedCategory ? ' en esta categoría' : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
