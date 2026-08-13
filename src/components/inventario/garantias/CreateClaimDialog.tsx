'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import {
  Search,
  ShieldCheck,
  Package,
  User,
  Loader2,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import {
  warrantyClaimsService,
} from '@/lib/services/warrantyClaimsService';
import {
  getOrganizationId,
  getCurrentUserId,
} from '@/lib/hooks/useOrganization';
import { formatDate } from '@/utils/Utils';

interface SerialSearchResult {
  id: number;
  serial: string;
  status: string;
  warranty_start: string | null;
  warranty_end: string | null;
  warranty_months: number | null;
  sale_date: string | null;
  sold_to_customer_id: string | null;
  product_id: number;
  products: { name: string; sku: string; brand: string | null } | null;
  customers: { id: string; full_name: string; phone: string | null; email: string | null } | null;
}

interface CreateClaimDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedSerialId?: number | null;
  onCreated?: () => void;
}

export function CreateClaimDialog({
  open,
  onOpenChange,
  preselectedSerialId,
  onCreated,
}: CreateClaimDialogProps) {
  const { toast } = useToast();
  const organizationId = getOrganizationId();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Búsqueda de serial
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SerialSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedSerial, setSelectedSerial] = useState<SerialSearchResult | null>(null);

  // Formulario
  const [claimReason, setClaimReason] = useState('');
  const [description, setDescription] = useState('');

  // Reset al abrir
  useEffect(() => {
    if (open) {
      setSearchTerm('');
      setSearchResults([]);
      setSelectedSerial(null);
      setClaimReason('');
      setDescription('');
    }
  }, [open]);

  // Cargar serial pre-seleccionado
  useEffect(() => {
    if (open && preselectedSerialId) {
      loadSerialById(preselectedSerialId);
    }
  }, [open, preselectedSerialId]);

  const loadSerialById = async (serialId: number) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('serial_numbers')
        .select(`
          id, serial, status, warranty_start, warranty_end, warranty_months,
          sale_date, sold_to_customer_id, product_id,
          products!fk_serial_product ( name, sku, brand ),
          customers!serial_numbers_sold_to_customer_id_fkey ( id, full_name, phone, email )
        `)
        .eq('id', serialId)
        .eq('organization_id', organizationId)
        .single();

      if (error) throw error;
      setSelectedSerial(data as SerialSearchResult);
    } catch (err: any) {
      console.error('Error cargando serial:', err);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el serial seleccionado',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Búsqueda de seriales (debounced)
  useEffect(() => {
    if (!open || preselectedSerialId) return;
    if (!searchTerm || searchTerm.length < 3) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const { data, error } = await supabase
          .from('serial_numbers')
          .select(`
            id, serial, status, warranty_start, warranty_end, warranty_months,
            sale_date, sold_to_customer_id, product_id,
            products!fk_serial_product ( name, sku, brand ),
            customers!serial_numbers_sold_to_customer_id_fkey ( id, full_name, phone, email )
          `)
          .eq('organization_id', organizationId)
          .or(`serial.ilike.%${searchTerm}%`)
          .limit(10);

        if (error) throw error;
        setSearchResults((data || []) as SerialSearchResult[]);
      } catch (err: any) {
        console.error('Error buscando seriales:', err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm, open, preselectedSerialId, organizationId]);

  const warrantyValid = selectedSerial?.warranty_end
    ? new Date(selectedSerial.warranty_end) > new Date()
    : false;

  const warrantyDaysLeft = selectedSerial?.warranty_end
    ? Math.ceil((new Date(selectedSerial.warranty_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0;

  const handleSubmit = async () => {
    if (!selectedSerial) {
      toast({ title: 'Selecciona un serial', variant: 'destructive' });
      return;
    }
    if (!claimReason.trim()) {
      toast({ title: 'El motivo del reclamo es obligatorio', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const userId = await getCurrentUserId();

      const { data, error } = await warrantyClaimsService.createClaim({
        organization_id: organizationId,
        serial_number_id: selectedSerial.id,
        customer_id: selectedSerial.sold_to_customer_id || null,
        claim_reason: claimReason.trim(),
        description: description.trim() || null,
        status: 'pending',
        created_by: userId,
      });

      if (error) throw error;

      toast({
        title: 'Reclamo creado',
        description: `Reclamo #${data?.id?.substring(0, 8) || 'N/A'} registrado correctamente`,
      });

      onOpenChange(false);
      onCreated?.();
    } catch (err: any) {
      console.error('Error creando reclamo:', err);
      toast({
        title: 'Error',
        description: err?.message || 'No se pudo crear el reclamo',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo Reclamo de Garantía</DialogTitle>
          <DialogDescription>
            Registra un reclamo de garantía para un serial vendido.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            {/* Búsqueda de serial (solo si no hay pre-seleccionado) */}
            {!preselectedSerialId && !selectedSerial && (
              <div className="space-y-2">
                <Label>Buscar serial</Label>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Ingresa el número de serial (mín. 3 caracteres)..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                    autoFocus
                  />
                </div>
                {searching && (
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <Loader2 size={12} className="animate-spin" /> Buscando...
                  </p>
                )}
                {!searching && searchTerm.length >= 3 && searchResults.length === 0 && (
                  <p className="text-xs text-gray-500">No se encontraron seriales.</p>
                )}
                {searchResults.length > 0 && (
                  <div className="space-y-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                    {searchResults.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedSerial(s)}
                        className="w-full text-left p-2 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800 last:border-0 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-mono text-sm font-medium text-blue-600 dark:text-blue-400">
                              {s.serial}
                            </span>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {s.products?.name || 'N/A'} · SKU: {s.products?.sku || 'N/A'}
                            </p>
                          </div>
                          <Badge
                            variant="secondary"
                            className={
                              s.status === 'sold'
                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                            }
                          >
                            {s.status === 'sold' ? 'Vendido' : s.status}
                          </Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Serial seleccionado */}
            {selectedSerial && (
              <div className="space-y-3">
                <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Serial</span>
                    {!preselectedSerialId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => {
                          setSelectedSerial(null);
                          setSearchTerm('');
                        }}
                      >
                        Cambiar
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-blue-600" />
                    <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                      {selectedSerial.serial}
                    </span>
                  </div>

                  {/* Info producto */}
                  <div className="flex items-start gap-2 pt-1">
                    <Package size={14} className="text-gray-400 mt-0.5" />
                    <div className="text-xs">
                      <p className="text-gray-900 dark:text-white font-medium">
                        {selectedSerial.products?.name || 'N/A'}
                      </p>
                      <p className="text-gray-500 dark:text-gray-400">
                        SKU: {selectedSerial.products?.sku || 'N/A'}
                        {selectedSerial.products?.brand ? ` · ${selectedSerial.products.brand}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Info cliente */}
                  {selectedSerial.customers && (
                    <div className="flex items-start gap-2 pt-1">
                      <User size={14} className="text-gray-400 mt-0.5" />
                      <div className="text-xs">
                        <p className="text-gray-900 dark:text-white font-medium">
                          {selectedSerial.customers.full_name}
                        </p>
                        <p className="text-gray-500 dark:text-gray-400">
                          {selectedSerial.customers.phone || selectedSerial.customers.email || 'Sin contacto'}
                        </p>
                      </div>
                    </div>
                  )}
                  {!selectedSerial.customers && (
                    <div className="flex items-start gap-2 pt-1">
                      <AlertTriangle size={14} className="text-amber-500 mt-0.5" />
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Este serial no tiene cliente asociado (no ha sido vendido)
                      </p>
                    </div>
                  )}

                  {/* Estado garantía */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Garantía</span>
                    {selectedSerial.warranty_end ? (
                      <Badge
                        className={
                          warrantyValid
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 gap-1'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 gap-1'
                        }
                      >
                        {warrantyValid ? (
                          <>
                            <CheckCircle2 size={12} />
                            Vigente ({warrantyDaysLeft} días)
                          </>
                        ) : (
                          <>
                            <AlertTriangle size={12} />
                            Vencida
                          </>
                        )}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Sin garantía</Badge>
                    )}
                  </div>

                  {selectedSerial.sale_date && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Fecha de venta: {formatDate(selectedSerial.sale_date)}
                    </p>
                  )}
                </div>

                {/* Formulario reclamo */}
                <div className="space-y-2">
                  <Label htmlFor="claim-reason">
                    Motivo del reclamo <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="claim-reason"
                    placeholder="Ej: Producto defectuoso, no enciende..."
                    value={claimReason}
                    onChange={(e) => setClaimReason(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="claim-description">Descripción (opcional)</Label>
                  <Textarea
                    id="claim-description"
                    placeholder="Describe el problema en detalle..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !selectedSerial || !claimReason.trim()}
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Creando...
              </>
            ) : (
              <>
                <ShieldCheck size={16} className="mr-2" />
                Crear Reclamo
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
