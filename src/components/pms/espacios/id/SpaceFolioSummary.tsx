'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ShoppingCart, Image as ImageIcon, Plus, Receipt } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import { getPublicUrl } from '@/lib/supabase/imageUtils';
import { supabase } from '@/lib/supabase/config';
import SpaceConsumptionService from '@/lib/services/spaceConsumptionService';
import type { FolioItem } from '@/lib/services/foliosService';

interface SpaceFolioSummaryProps {
  spaceId: string;
  onAddConsumption?: () => void;
  refreshTrigger?: number;
}

interface FolioItemWithProduct extends FolioItem {
  product?: {
    id: number;
    name: string;
    product_images?: Array<{
      id: number;
      storage_path: string;
      is_primary: boolean;
      display_order: number;
    }>;
    parent_product?: {
      product_images?: Array<{
        id: number;
        storage_path: string;
        is_primary: boolean;
        display_order: number;
      }>;
    } | null;
  };
}

export function SpaceFolioSummary({ spaceId, onAddConsumption, refreshTrigger }: SpaceFolioSummaryProps) {
  const [items, setItems] = useState<FolioItemWithProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const loadFolioItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const activeReservation = await SpaceConsumptionService.getActiveReservation(spaceId);

      if (!activeReservation?.folio_id) {
        setItems([]);
        setTotal(0);
        return;
      }

      const { data, error } = await supabase
        .from('folio_items')
        .select(`
          *,
          product:products (
            id,
            name,
            parent_product_id,
            product_images (
              id,
              storage_path,
              is_primary,
              display_order
            )
          )
        `)
        .eq('folio_id', activeReservation.folio_id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const folioItems = (data || []) as unknown as FolioItemWithProduct[];
      setItems(folioItems);
      setTotal(folioItems.reduce((sum, item) => sum + Number(item.amount), 0));
    } catch (error) {
      console.error('Error cargando items del folio:', error);
      setItems([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [spaceId]);

  useEffect(() => {
    loadFolioItems();
  }, [loadFolioItems, refreshTrigger]);

  const getProductImage = (item: FolioItemWithProduct): string | null => {
    const product = item.product;
    if (!product) return null;

    let images = product.product_images;

    // Si no hay imágenes y el producto tiene parent_product_id, buscar imágenes del padre
    if ((!images || images.length === 0) && product.parent_product_id) {
      // Las imágenes del padre se cargan por separado si es necesario
      // Por ahora usamos las imágenes del producto directo
      return null;
    }

    if (!images || images.length === 0) return null;

    const primaryImage = images.find(img => img.is_primary) || images[0];
    if (!primaryImage) return null;

    return getPublicUrl(primaryImage.storage_path);
  };

  if (isLoading) {
    return (
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 dark:text-gray-100">
            <Receipt className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Folio de Consumos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="dark:bg-gray-800 dark:border-gray-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 dark:text-gray-100">
            <Receipt className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Folio de Consumos
          </CardTitle>
          {onAddConsumption && (
            <Button
              size="sm"
              variant="outline"
              onClick={onAddConsumption}
              className="h-8 text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Agregar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <ShoppingCart className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
              Sin consumos registrados
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Los consumos del espacio aparecerán aquí
            </p>
          </div>
        ) : (
          <>
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-2">
                {items.map((item) => {
                  const imageUrl = getProductImage(item);
                  const variantEntries = item.variant_data
                    ? Object.entries(item.variant_data).filter(([, v]) => !!v)
                    : [];
                  const modifiers = item.modifiers || [];

                  return (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 p-3 rounded-lg border bg-white dark:bg-gray-900/50 dark:border-gray-700"
                    >
                      {/* Imagen del producto */}
                      <div className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 relative">
                        {imageUrl ? (
                          <Image
                            src={imageUrl}
                            alt={item.description}
                            fill
                            className="object-cover"
                            sizes="48px"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="h-5 w-5 text-gray-400 dark:text-gray-600" />
                          </div>
                        )}
                      </div>

                      {/* Información del item */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                            {item.product?.name || item.description}
                          </h4>
                          <span className="font-bold text-sm text-blue-600 dark:text-blue-400 shrink-0">
                            {formatCurrency(Number(item.amount))}
                          </span>
                        </div>

                        {/* Cantidad y precio unitario */}
                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          <span>Cant: {item.quantity}</span>
                          <span>·</span>
                          <span>{formatCurrency(Number(item.unit_price))} c/u</span>
                          {item.source === 'room_service' && (
                            <Badge variant="outline" className="text-[0.6rem] px-1 py-0 h-4">
                              Habitación
                            </Badge>
                          )}
                        </div>

                        {/* Variantes */}
                        {variantEntries.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {variantEntries.map(([attr, value]) => (
                              <Badge
                                key={attr}
                                variant="outline"
                                className="text-[0.65rem] px-1.5 py-0 border-indigo-300 text-indigo-700 dark:border-indigo-700 dark:text-indigo-300"
                              >
                                {attr}: {value}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {/* Modificadores */}
                        {modifiers.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {modifiers.map((mod) => (
                              <Badge
                                key={mod.modifierId}
                                variant="outline"
                                className="text-[0.65rem] px-1.5 py-0 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300"
                              >
                                {mod.name}
                                {mod.extraPrice > 0 ? ` (+${formatCurrency(mod.extraPrice)})` : ''}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Total */}
            <div className="mt-3 pt-3 border-t dark:border-gray-700 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Total</span>
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {formatCurrency(total)}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
