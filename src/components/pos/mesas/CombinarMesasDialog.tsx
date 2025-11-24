'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Users, ShoppingBag, ArrowRight } from 'lucide-react';
import type { TableWithSession } from './types';

interface CombinarMesasDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mesas: TableWithSession[];
  onCombinar: (mesaPrincipalId: string, mesasACombinar: string[]) => Promise<void>;
}

export function CombinarMesasDialog({
  open,
  onOpenChange,
  mesas,
  onCombinar,
}: CombinarMesasDialogProps) {
  const [mesaPrincipal, setMesaPrincipal] = useState<string | null>(null);
  const [mesasSeleccionadas, setMesasSeleccionadas] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filtrar solo mesas ocupadas con sesión activa o con cuenta solicitada
  const mesasDisponibles = mesas.filter(
    (m) => m.session && (m.session.status === 'active' || m.session.status === 'bill_requested')
  );

  const handleToggleMesa = (mesaId: string) => {
    setMesasSeleccionadas((prev) =>
      prev.includes(mesaId)
        ? prev.filter((id) => id !== mesaId)
        : [...prev, mesaId]
    );
  };

  const handleSubmit = async () => {
    if (!mesaPrincipal || mesasSeleccionadas.length === 0) return;

    setIsSubmitting(true);
    try {
      await onCombinar(mesaPrincipal, mesasSeleccionadas);
      onOpenChange(false);
      setMesaPrincipal(null);
      setMesasSeleccionadas([]);
    } catch (error) {
      console.error('Error combinando mesas:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
        if (!isOpen) {
          setMesaPrincipal(null);
          setMesasSeleccionadas([]);
        }
      }}
    >
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-xl">Combinar Mesas</DialogTitle>
          <DialogDescription className="text-base">
            Paso 1: Selecciona la <strong>mesa principal</strong> (donde quedarán todos los pedidos).
            <br />
            Paso 2: Selecciona las <strong>mesas a combinar</strong> (quedarán libres).
          </DialogDescription>
        </DialogHeader>

        {mesasDisponibles.length < 2 && (
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              ⚠️ Necesitas al menos 2 mesas ocupadas para combinar.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {/* Mesa Principal */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-base font-semibold">1. Mesa Principal</Label>
              <Badge variant="secondary" className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                Recibirá todos los pedidos
              </Badge>
            </div>
            <ScrollArea className="h-[150px] border-2 border-green-200 dark:border-green-800 rounded-lg p-3 bg-green-50/50 dark:bg-green-950/20">
              <div className="space-y-2">
                {mesasDisponibles.map((mesa) => (
                  <div
                    key={mesa.id}
                    className={`flex items-center space-x-3 p-3 rounded-lg transition-all ${
                      mesaPrincipal === mesa.id
                        ? 'bg-green-500 text-white shadow-md'
                        : 'hover:bg-white dark:hover:bg-gray-800 border border-transparent hover:border-green-300'
                    }`}
                  >
                    <Checkbox
                      id={`principal-${mesa.id}`}
                      checked={mesaPrincipal === mesa.id}
                      onCheckedChange={() => setMesaPrincipal(mesa.id)}
                      className={mesaPrincipal === mesa.id ? 'border-white' : ''}
                    />
                    <Label
                      htmlFor={`principal-${mesa.id}`}
                      className="flex-1 cursor-pointer flex items-center justify-between"
                    >
                      <div>
                        <span className="font-medium text-base">{mesa.name}</span>
                        {mesa.zone && (
                          <span className={`text-xs ml-2 ${mesaPrincipal === mesa.id ? 'text-green-100' : 'text-gray-500'}`}>
                            {mesa.zone}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {mesa.session?.customers || 0}
                        </span>
                        {(mesa.session as any)?.sale_items && (
                          <span className="flex items-center gap-1">
                            <ShoppingBag className="h-3 w-3" />
                            {(mesa.session as any).sale_items.length}
                          </span>
                        )}
                      </div>
                    </Label>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Indicador Visual */}
          {mesaPrincipal && mesasSeleccionadas.length > 0 && (
            <div className="flex items-center justify-center py-2">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                <ArrowRight className="h-5 w-5" />
                <span className="text-sm font-medium">
                  {mesasSeleccionadas.length} {mesasSeleccionadas.length === 1 ? 'mesa' : 'mesas'} → Mesa Principal
                </span>
                <ArrowRight className="h-5 w-5" />
              </div>
            </div>
          )}

          {/* Mesas a Combinar */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-base font-semibold">2. Mesas a Combinar</Label>
              <Badge variant="secondary" className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                Quedarán libres
              </Badge>
            </div>
            <ScrollArea className="h-[150px] border-2 border-blue-200 dark:border-blue-800 rounded-lg p-3 bg-blue-50/50 dark:bg-blue-950/20">
              <div className="space-y-2">
                {mesasDisponibles.length > 0 ? (
                  mesasDisponibles
                    .filter((m) => m.id !== mesaPrincipal)
                    .map((mesa) => (
                      <div
                        key={mesa.id}
                        className={`flex items-center space-x-3 p-3 rounded-lg transition-all ${
                          mesasSeleccionadas.includes(mesa.id)
                            ? 'bg-blue-500 text-white shadow-md'
                            : 'hover:bg-white dark:hover:bg-gray-800 border border-transparent hover:border-blue-300'
                        }`}
                      >
                        <Checkbox
                          id={`combinar-${mesa.id}`}
                          checked={mesasSeleccionadas.includes(mesa.id)}
                          onCheckedChange={() => handleToggleMesa(mesa.id)}
                          disabled={!mesaPrincipal}
                          className={mesasSeleccionadas.includes(mesa.id) ? 'border-white' : ''}
                        />
                        <Label
                          htmlFor={`combinar-${mesa.id}`}
                          className="flex-1 cursor-pointer flex items-center justify-between"
                        >
                          <div>
                            <span className="font-medium text-base">{mesa.name}</span>
                            {mesa.zone && (
                              <span className={`text-xs ml-2 ${mesasSeleccionadas.includes(mesa.id) ? 'text-blue-100' : 'text-gray-500'}`}>
                                {mesa.zone}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {mesa.session?.customers || 0}
                            </span>
                            {(mesa.session as any)?.sale_items && (
                              <span className="flex items-center gap-1">
                                <ShoppingBag className="h-3 w-3" />
                                {(mesa.session as any).sale_items.length}
                              </span>
                            )}
                          </div>
                        </Label>
                      </div>
                    ))
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                    Selecciona primero una mesa principal
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              !mesaPrincipal || mesasSeleccionadas.length === 0 || isSubmitting
            }
          >
            {isSubmitting ? 'Combinando...' : 'Combinar Mesas'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
