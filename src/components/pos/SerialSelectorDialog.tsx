'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, CheckCircle2, Loader2, Package, Search } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Dialogo } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { serialTrackingService, type SerialNumber } from '@/lib/services/serialTrackingService';
import type { CartItem } from '@/components/pos/types';

/**
 * Seriales obligatorios antes de cobrar (POS-PLAN L48). Paso 12 del rediseño:
 * la presentación pasa al `Dialogo` del kit y los textos a `posCobro.seriales`
 * (4 idiomas); la lógica (carga por producto, tope por cantidad, confirmar
 * solo lo completo) es la de siempre. Props públicas intactas (las usa
 * también la factura de venta nueva).
 */
interface SerialSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CartItem[];
  organizationId: number;
  branchId: number;
  onConfirm: (selections: Record<number, number[]>) => void;
}

interface ProductSerialState {
  available: SerialNumber[];
  selected: number[];
  loading: boolean;
  error: string;
}

export function SerialSelectorDialog({
  open,
  onOpenChange,
  items,
  organizationId,
  branchId,
  onConfirm,
}: SerialSelectorDialogProps) {
  const t = useTranslations('posCobro.seriales');
  // `warranty_end` es una fecha pura (columna date): se pinta sin convertir de zona.
  const { formatPlain } = useFormatDate();
  const [serialStates, setSerialStates] = useState<Record<number, ProductSerialState>>({});
  const [searchTerm, setSearchTerm] = useState<string>('');

  const serializedItems = items.filter(
    (item) => item.product?.track_serial === true
  );

  const loadSerials = useCallback(async () => {
    const newStates: Record<number, ProductSerialState> = {};
    for (const item of serializedItems) {
      newStates[item.product_id] = {
        available: [],
        selected: [],
        loading: true,
        error: '',
      };
    }
    setSerialStates(newStates);

    for (const item of serializedItems) {
      try {
        const serials = await serialTrackingService.getAvailableSerials(
          item.product_id,
          organizationId,
          branchId
        );
        setSerialStates((prev) => ({
          ...prev,
          [item.product_id]: {
            available: serials,
            selected: [],
            loading: false,
            error: '',
          },
        }));
      } catch (err: unknown) {
        const mensaje = err instanceof Error ? err.message : '';
        setSerialStates((prev) => ({
          ...prev,
          [item.product_id]: {
            available: [],
            selected: [],
            loading: false,
            error: mensaje || t('errorCarga'),
          },
        }));
      }
    }
  }, [serializedItems, organizationId, branchId, t]);

  useEffect(() => {
    if (open && serializedItems.length > 0) {
      loadSerials();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se carga al abrir, como siempre
  }, [open]);

  const handleToggleSerial = (productId: number, serialId: number, requiredQty: number) => {
    setSerialStates((prev) => {
      const state = prev[productId];
      if (!state) return prev;

      const isSelected = state.selected.includes(serialId);
      let newSelected: number[];

      if (isSelected) {
        newSelected = state.selected.filter((id) => id !== serialId);
      } else {
        if (state.selected.length >= requiredQty) return prev;
        newSelected = [...state.selected, serialId];
      }

      return {
        ...prev,
        [productId]: {
          ...state,
          selected: newSelected,
        },
      };
    });
  };

  const handleConfirm = () => {
    const selections: Record<number, number[]> = {};
    for (const item of serializedItems) {
      const state = serialStates[item.product_id];
      if (state && state.selected.length === item.quantity) {
        selections[item.product_id] = state.selected;
      }
    }
    onConfirm(selections);
    onOpenChange(false);
  };

  const allComplete = serializedItems.every(
    (item) =>
      serialStates[item.product_id]?.selected.length === item.quantity
  );

  if (serializedItems.length === 0) {
    return null;
  }

  return (
    <Dialogo
      abierto={open}
      onAbiertoChange={onOpenChange}
      titulo={t('titulo')}
      descripcion={t('descripcion', { n: serializedItems.length })}
      icono={Package}
      ancho={672}
      primario={{ etiqueta: t('confirmar'), onClick: handleConfirm, deshabilitada: !allComplete }}
    >
      <div className="flex flex-col gap-3">
        {serializedItems.map((item) => {
          const state = serialStates[item.product_id];
          const requiredQty = item.quantity;
          const selectedCount = state?.selected.length ?? 0;
          const isComplete = selectedCount === requiredQty;
          const producto = item.product?.name ?? '';

          return (
            <section
              key={item.id}
              aria-label={producto}
              className={cn('rounded-lg border p-3', isComplete ? 'border-line-success bg-success-subtle' : 'border-line bg-subtle')}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium text-fg">{producto}</p>
                  <p className="text-xs text-fg-secondary">{t('skuCantidad', { sku: item.product?.sku ?? '—', cantidad: requiredQty })}</p>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                    isComplete ? 'bg-success-subtle text-success-text' : 'bg-warning-subtle text-warning-text',
                  )}
                >
                  {t('progreso', { elegidos: selectedCount, requeridos: requiredQty })}
                </span>
              </div>

              {state?.loading && (
                <p role="status" className="flex items-center gap-2 py-2 text-sm text-fg-secondary">
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                  {t('cargando')}
                </p>
              )}

              {state?.error && (
                <p role="alert" className="flex items-center gap-2 py-2 text-sm text-danger-text">
                  <AlertCircle aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {state.error}
                </p>
              )}

              {!state?.loading && !state?.error && state && (
                <>
                  {state.available.length === 0 ? (
                    <p className="flex items-center gap-2 py-2 text-sm text-danger-text">
                      <AlertCircle aria-hidden="true" className="size-4" strokeWidth={1.5} />
                      {t('sinDisponibles')}
                    </p>
                  ) : (
                    <>
                      <div className="relative mb-2">
                        <Search aria-hidden="true" className="absolute left-2 top-2.5 size-4 text-fg-muted" strokeWidth={1.5} />
                        <Input
                          placeholder={t('buscar')}
                          aria-label={t('buscarAria', { producto })}
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="h-9 pl-8"
                        />
                      </div>
                      <ul aria-label={t('lista', { producto })} className="flex max-h-[200px] flex-col gap-1 overflow-y-auto">
                        {state.available
                          .filter((s) =>
                            searchTerm
                              ? s.serial.toLowerCase().includes(searchTerm.toLowerCase())
                              : true
                          )
                          .map((serial) => {
                            const isSelected = state.selected.includes(serial.id);
                            return (
                              <li key={serial.id}>
                                <button
                                  type="button"
                                  role="checkbox"
                                  aria-checked={isSelected}
                                  onClick={() => handleToggleSerial(item.product_id, serial.id, requiredQty)}
                                  className={cn(
                                    'flex w-full items-center gap-3 rounded-md border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                                    isSelected ? 'border-line-brand bg-brand-tint' : 'border-transparent hover:bg-hover',
                                  )}
                                >
                                  <span
                                    aria-hidden="true"
                                    className={cn(
                                      'flex size-5 shrink-0 items-center justify-center rounded border',
                                      isSelected ? 'border-brand bg-brand text-fg-on-brand' : 'border-line-strong',
                                    )}
                                  >
                                    {isSelected && <CheckCircle2 className="size-4" />}
                                  </span>
                                  <span className="font-mono text-sm text-fg">{serial.serial}</span>
                                  {serial.warranty_end && (
                                    <span className="ml-auto rounded border border-line px-1.5 text-xs text-fg-secondary">
                                      {t('garantia', { fecha: formatPlain(serial.warranty_end) })}
                                    </span>
                                  )}
                                </button>
                              </li>
                            );
                          })}
                      </ul>
                      {state.available.length < requiredQty && (
                        <p className="mt-2 flex items-center gap-2 text-sm text-danger-text">
                          <AlertCircle aria-hidden="true" className="size-4" strokeWidth={1.5} />
                          {t('insuficientes', { disponibles: state.available.length, requeridos: requiredQty })}
                        </p>
                      )}
                    </>
                  )}
                </>
              )}
            </section>
          );
        })}
      </div>
    </Dialogo>
  );
}
