'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Edit2, Check, X, Package } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import { getPublicUrl } from '@/lib/supabase/imageUtils';
import type { SaleItem } from './types';

interface OrderItemCardProps {
  item: SaleItem;
  onUpdateQuantity: (itemId: string, newQuantity: number) => Promise<void>;
  onDelete: (itemId: string) => Promise<void>;
  onTransfer?: (itemId: string) => void;
}

export function OrderItemCard({
  item,
  onUpdateQuantity,
  onDelete,
  onTransfer,
}: OrderItemCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editQuantity, setEditQuantity] = useState(item.quantity);
  const [isProcessing, setIsProcessing] = useState(false);

  // DEBUG: Ver estructura del item
  console.log('🔍 OrderItemCard - Item recibido:', {
    id: item.id,
    product: item.product,
    product_name: item.product?.name,
    has_images: !!item.product?.product_images,
    images_count: item.product?.product_images?.length
  });

  const handleSaveQuantity = async () => {
    if (editQuantity === item.quantity || editQuantity < 1) {
      setIsEditing(false);
      return;
    }

    setIsProcessing(true);
    try {
      await onUpdateQuantity(item.id, editQuantity);
      setIsEditing(false);
    } catch (error) {
      console.error('Error actualizando cantidad:', error);
      setEditQuantity(item.quantity);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('¿Eliminar este item del pedido?')) return;

    setIsProcessing(true);
    try {
      await onDelete(item.id);
    } catch (error) {
      console.error('Error eliminando item:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Obtener imagen primaria del producto
  const getProductImage = () => {
    const images = item.product?.product_images;
    if (!images || images.length === 0) return null;
    
    const primaryImage = images.find(img => img.is_primary) || images[0];
    if (!primaryImage?.storage_path) return null;
    
    // Convertir storage_path a URL pública
    return getPublicUrl(primaryImage.storage_path);
  };

  const productImage = getProductImage();

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        {/* Imagen del producto */}
        <div className="flex-shrink-0">
          {productImage ? (
            <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
              <Image
                src={productImage}
                alt={item.product?.name || 'Producto'}
                fill
                className="object-cover"
                sizes="64px"
              />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <Package className="h-8 w-8 text-gray-400" />
            </div>
          )}
        </div>

        {/* Info del producto */}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">
            {item.product?.name || 'Producto'}
          </h3>
          {item.notes && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
              📝 {typeof item.notes === 'object' ? (item.notes as any)?.extra : item.notes}
            </p>
          )}
          
          {/* Precio unitario */}
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
            {formatCurrency(Number(item.unit_price))} c/u
          </p>
        </div>

        {/* Cantidad y acciones */}
        <div className="flex flex-col items-end gap-2">
          {/* Total */}
          <p className="font-bold text-lg text-gray-900 dark:text-gray-100">
            {formatCurrency(Number(item.total))}
          </p>

          {/* Cantidad editable */}
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Input
                  type="number"
                  min="1"
                  value={editQuantity}
                  onChange={(e) => setEditQuantity(parseInt(e.target.value) || 1)}
                  className="w-16 text-center"
                  disabled={isProcessing}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleSaveQuantity}
                  disabled={isProcessing}
                >
                  <Check className="h-4 w-4 text-green-600" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIsEditing(false);
                    setEditQuantity(item.quantity);
                  }}
                  disabled={isProcessing}
                >
                  <X className="h-4 w-4 text-red-600" />
                </Button>
              </>
            ) : (
              <>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Cant: {item.quantity}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsEditing(true)}
                  disabled={isProcessing}
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>

          {/* Acciones */}
          <div className="flex gap-1">
            {onTransfer && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onTransfer(item.id)}
                disabled={isProcessing}
              >
                Transferir
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDelete}
              disabled={isProcessing}
            >
              <Trash2 className="h-4 w-4 text-red-600" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
