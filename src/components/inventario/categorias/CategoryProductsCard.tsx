'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Package, ChevronDown, ChevronUp, ExternalLink, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';

interface Product {
  id: number;
  uuid: string;
  name: string;
  sku: string;
  status: string | null;
  description: string | null;
}

interface CategoryProductsCardProps {
  categoryId: number;
  organizationId: number;
}

export default function CategoryProductsCard({ categoryId, organizationId }: CategoryProductsCardProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    loadProducts();
  }, [categoryId, organizationId]);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select('id, uuid, name, sku, status, description')
        .eq('category_id', categoryId)
        .eq('organization_id', organizationId)
        .order('name');

      if (error) throw error;
      setProducts(data || []);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
      <CardHeader className="pb-3">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center justify-between w-full text-left"
        >
          <CardTitle className="text-base text-gray-900 dark:text-white flex items-center gap-2">
            <Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Productos vinculados
            <Badge variant="secondary" className="ml-1 text-xs">
              {loading ? '...' : products.length}
            </Badge>
          </CardTitle>
          {isExpanded
            ? <ChevronUp className="h-4 w-4 text-gray-400" />
            : <ChevronDown className="h-4 w-4 text-gray-400" />
          }
        </button>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-6 text-gray-500 dark:text-gray-400">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No hay productos en esta categoría</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {products.map((product) => (
                <Link
                  key={product.id}
                  href={`/app/inventario/productos/${product.uuid}`}
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {product.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                      {product.sku}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <Badge
                      variant="outline"
                      className={
                        product.status === 'active'
                          ? 'text-green-600 border-green-300 dark:text-green-400 dark:border-green-700 text-[10px]'
                          : 'text-gray-500 border-gray-300 dark:text-gray-400 dark:border-gray-600 text-[10px]'
                      }
                    >
                      {product.status === 'active' ? 'Activo' : product.status || 'N/A'}
                    </Badge>
                    <ExternalLink className="h-3.5 w-3.5 text-gray-300 group-hover:text-blue-400 transition-colors" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
