'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DialogoMotivo } from '@/components/kit';
import { Trash2, Edit2, Check, X, Package, ChefHat, Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getPublicUrl } from '@/lib/supabase/imageUtils';
import { MOTIVO_MAX } from '@/lib/pos/cocina/rutasCocina';
import type { SaleItem } from './types';

/** Mínimo de caracteres del motivo al restar o anular un plato ya enviado. */
const MOTIVO_MIN = 3;

interface OrderItemCardProps {
  item: SaleItem;
  /** `motivo` es obligatorio al restar unidades de un plato que ya está en cocina. */
  onUpdateQuantity: (itemId: string, newQuantity: number, motivo?: string) => Promise<void>;
  /** `motivo` es obligatorio al anular un plato que ya está en cocina. */
  onDelete: (itemId: string, motivo?: string) => Promise<void>;
  onTransfer?: (itemId: string) => void;
}

export function OrderItemCard({
  item,
  onUpdateQuantity,
  onDelete,
  onTransfer,
}: OrderItemCardProps) {
  const { formatear } = useMonedaOrganizacion();
  const tAjuste = useTranslations('posMesaAjuste');
  const [isEditing, setIsEditing] = useState(false);
  const [editQuantity, setEditQuantity] = useState(item.quantity);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  // Restar unidades de un plato ya enviado: se pide el motivo antes de guardar.
  const [cantidadPorConfirmar, setCantidadPorConfirmar] = useState<number | null>(null);

  // Ítems de comanda vivos del plato (los anulados ya no cuentan).
  const kitchenItemsVivos = (item.kitchen_ticket_items || []).filter(
    (k) => k.status !== 'cancelled' && !k.cancelled_at,
  );
  const enviadoACocina = kitchenItemsVivos.length > 0;

  // Obtener estado de cocina del item (usar el más reciente)
  const getKitchenStatus = () => {
    if (kitchenItemsVivos.length === 0) return null;
    // Tomar el estado del último kitchen_ticket_item (más reciente)
    const latest = kitchenItemsVivos[kitchenItemsVivos.length - 1];
    return latest.status;
  };

  const kitchenStatus = getKitchenStatus();

  // El campo `notes` puede llegar como objeto (jsonb) o como string JSON según el origen del dato.
  // Se normaliza aquí para no depender del tipo real de la columna.
  type ParsedNotes = {
    product_name?: string;
    extra?: string;
    customer_note?: string;
    is_allergy?: boolean;
    guest_number?: number;
    modifiers?: Array<{ groupId: number; groupName: string; modifierId: number; name: string; extraPrice: number }>;
  };

  const parsedNotes = (() => {
    if (item.notes && typeof item.notes === 'object') return item.notes as ParsedNotes;
    if (typeof item.notes === 'string' && item.notes.trim().startsWith('{')) {
      try {
        return JSON.parse(item.notes) as ParsedNotes;
      } catch {
        return { extra: item.notes };
      }
    }
    return item.notes ? { extra: item.notes as string } : null;
  })();

  const kitchenStatusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    pending: { label: 'Pendiente en cocina', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Clock },
    in_progress: { label: 'En preparación', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400', icon: ChefHat },
    ready: { label: '¡Listo para servir!', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 animate-pulse', icon: CheckCircle },
    delivered: { label: 'Entregado', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400', icon: Check },
  };

  const guardarCantidad = async (cantidad: number, motivoCambio?: string) => {
    setIsProcessing(true);
    try {
      await onUpdateQuantity(item.id, cantidad, motivoCambio);
      setIsEditing(false);
      setCantidadPorConfirmar(null);
    } catch (error) {
      console.error('Error actualizando cantidad:', error);
      setEditQuantity(item.quantity);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveQuantity = async () => {
    if (editQuantity === item.quantity || editQuantity < 1) {
      setIsEditing(false);
      return;
    }
    // Restar a algo que la cocina ya tiene: primero el motivo (sale en la comanda de ajuste).
    if (enviadoACocina && editQuantity < item.quantity) {
      setCantidadPorConfirmar(editQuantity);
      return;
    }
    await guardarCantidad(editQuantity);
  };

  // `motivo` llega ya validado por DialogoMotivo (mínimo MOTIVO_MIN) si el plato está en cocina.
  const handleDelete = async (motivo?: string) => {
    if (enviadoACocina && !motivo) return;
    setIsProcessing(true);
    try {
      await onDelete(item.id, enviadoACocina ? motivo : undefined);
    } catch (error) {
      console.error('Error eliminando item:', error);
    } finally {
      setIsProcessing(false);
      setShowDeleteDialog(false);
    }
  };

  // Obtener imagen primaria del producto (con fallback a las imágenes del producto padre si es una variante sin imagen propia)
  const getProductImage = () => {
    const images = item.product?.product_images?.length
      ? item.product.product_images
      : item.product?.parent_product?.product_images;
    if (!images || images.length === 0) return null;
    
    const primaryImage = images.find(img => img.is_primary) || images[0];
    if (!primaryImage?.storage_path) return null;
    
    // Convertir storage_path a URL pública
    return getPublicUrl(primaryImage.storage_path);
  };

  const productImage = getProductImage();

  // Variantes elegidas (ej. Talla: M, Color: Rojo)
  const variantEntries = item.product?.variant_data
    ? Object.entries(item.product.variant_data).filter(([, v]) => !!v)
    : [];

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
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-gray-900 dark:text-gray-100 break-words whitespace-normal">
              {item.product?.name || 'Producto'}
            </h3>
            {parsedNotes?.guest_number && (
              <Badge className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border-purple-300 inline-flex items-center gap-1 shrink-0">
                👤 Comensal {parsedNotes.guest_number}
              </Badge>
            )}
          </div>
          {variantEntries.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap mt-1">
              {variantEntries.map(([attr, value]) => (
                <Badge key={attr} variant="outline" className="text-[0.65rem] px-1.5 py-0 border-indigo-300 text-indigo-700 dark:border-indigo-700 dark:text-indigo-300">
                  {attr}: {value}
                </Badge>
              ))}
            </div>
          )}
          {parsedNotes?.modifiers && parsedNotes.modifiers.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap mt-1">
              {parsedNotes.modifiers.map((mod) => (
                <Badge key={mod.modifierId} variant="outline" className="text-[0.65rem] px-1.5 py-0 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300">
                  {mod.name}{mod.extraPrice > 0 ? ` (+${formatear(mod.extraPrice)})` : ''}
                </Badge>
              ))}
            </div>
          )}
          {kitchenStatus && kitchenStatusConfig[kitchenStatus] && (
            <Badge className={`${kitchenStatusConfig[kitchenStatus].color} text-xs mt-1 inline-flex items-center gap-1`}>
              {React.createElement(kitchenStatusConfig[kitchenStatus].icon, { className: 'h-3 w-3' })}
              {kitchenStatusConfig[kitchenStatus].label}
            </Badge>
          )}
          {parsedNotes?.extra && (
            <p className={parsedNotes.is_allergy
              ? 'text-sm font-semibold text-red-700 dark:text-red-400 mt-1 break-words whitespace-normal flex items-start gap-1'
              : 'text-sm text-gray-600 dark:text-gray-400 mt-1 break-words whitespace-normal'}>
              {parsedNotes.is_allergy ? <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> : '📝 '}
              {parsedNotes.is_allergy ? tAjuste('alergia', { nota: parsedNotes.extra }) : parsedNotes.extra}
            </p>
          )}
          {parsedNotes?.customer_note && (
            <p className="text-sm text-green-700 dark:text-green-400 mt-1 break-words whitespace-normal">
              {tAjuste('notaCliente', { nota: parsedNotes.customer_note })}
            </p>
          )}
          
          {/* Precio unitario */}
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
            {formatear(Number(item.unit_price))} c/u
          </p>
        </div>

        {/* Cantidad y acciones */}
        <div className="flex flex-col items-end gap-2">
          {/* Total */}
          <p className="font-bold text-lg text-gray-900 dark:text-gray-100">
            {formatear(Number(item.total))}
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
              onClick={() => setShowDeleteDialog(true)}
              disabled={isProcessing}
            >
              <Trash2 className="h-4 w-4 text-red-600" />
            </Button>
          </div>
        </div>
      </div>

      {/* Anular un plato ya enviado: motivo obligatorio (la cocina recibe el aviso). */}
      <DialogoMotivo
        abierto={showDeleteDialog && enviadoACocina}
        onAbiertoChange={setShowDeleteDialog}
        titulo={tAjuste('anularTitulo')}
        descripcion={tAjuste('anularDescripcion', { producto: item.product?.name || '' })}
        textoConfirmar={isProcessing ? tAjuste('anulando') : tAjuste('anular')}
        destructiva
        minimo={MOTIVO_MIN}
        maximo={MOTIVO_MAX}
        etiquetaMotivo={tAjuste('motivo')}
        placeholder={tAjuste('motivoPlaceholder')}
        cargando={isProcessing}
        icono={Trash2}
        onConfirmar={(m) => handleDelete(m)}
      >
        <p className="text-xs text-fg-secondary">{tAjuste('motivoAyuda')}</p>
      </DialogoMotivo>

      {/* Quitar un plato que la cocina aún no tiene: confirmación simple. */}
      <ConfirmDialog
        open={showDeleteDialog && !enviadoACocina}
        onOpenChange={setShowDeleteDialog}
        title={tAjuste('eliminarTitulo')}
        description={tAjuste('eliminarDescripcion', { producto: item.product?.name || tAjuste('esteItem') })}
        confirmLabel={tAjuste('eliminar')}
        cancelLabel={tAjuste('cancelar')}
        variant="destructive"
        loading={isProcessing}
        onConfirm={() => handleDelete()}
      />

      {/* Restar unidades de un plato ya enviado: motivo obligatorio (va en la comanda de ajuste) */}
      <DialogoMotivo
        abierto={cantidadPorConfirmar !== null}
        onAbiertoChange={(open) => {
          if (!open) {
            setCantidadPorConfirmar(null);
            setEditQuantity(item.quantity);
          }
        }}
        titulo={tAjuste('restarTitulo')}
        descripcion={tAjuste('restarDescripcion', {
          producto: item.product?.name || '',
          antes: item.quantity,
          despues: cantidadPorConfirmar ?? item.quantity,
        })}
        textoConfirmar={tAjuste('confirmarCambio')}
        destructiva={false}
        minimo={MOTIVO_MIN}
        maximo={MOTIVO_MAX}
        etiquetaMotivo={tAjuste('motivo')}
        placeholder={tAjuste('motivoPlaceholder')}
        cargando={isProcessing}
        icono={Edit2}
        onConfirmar={(m) => {
          if (cantidadPorConfirmar === null) return;
          return guardarCantidad(cantidadPorConfirmar, m);
        }}
      >
        <p className="text-xs text-fg-secondary">{tAjuste('motivoAyuda')}</p>
      </DialogoMotivo>
    </Card>
  );
}
