'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  User,
  Calendar,
  DoorOpen,
  DollarSign,
  CreditCard,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import type { Customer } from '@/lib/services/reservationsService';

interface Extra {
  name: string;
  price: number;
  quantity: number;
}

interface Space {
  id: string;
  label: string;
  space_types?: {
    name: string;
    base_rate?: number;
  };
}

interface StepConfirmProps {
  customer: Customer;
  checkin: string;
  checkout: string;
  nights: number;
  occupantCount: number;
  selectedSpaces: Space[];
  extras: Extra[];
  paymentMethod: string;
  paymentAmount: number;
  totalEstimated: number;
  notes: string;
  isSubmitting: boolean;
  onConfirm: () => void;
  onBack: () => void;
}

export function StepConfirm({
  customer,
  checkin,
  checkout,
  nights,
  occupantCount,
  selectedSpaces,
  extras,
  paymentMethod,
  paymentAmount,
  totalEstimated,
  notes,
  isSubmitting,
  onConfirm,
  onBack,
}: StepConfirmProps) {
  const formatDate = (dateString: string) => {
    // Agregar hora para evitar problemas de zona horaria
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const roomsTotal = selectedSpaces.reduce(
    (sum, space) => sum + (space.space_types?.base_rate || 0) * nights,
    0
  );

  const extrasTotal = extras.reduce((sum, extra) => sum + extra.price * extra.quantity, 0);

  const paymentMethodNames: Record<string, string> = {
    cash: 'Efectivo',
    card: 'Tarjeta',
    transfer: 'Transferencia',
    nequi: 'Nequi',
    daviplata: 'Daviplata',
    pse: 'PSE',
    payu: 'PayU',
    mp: 'Mercado Pago',
    credit: 'Crédito',
    check: 'Cheque',
    guarantee: 'Solo Garantía',
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Confirmar Reserva
        </h2>
        <p className="text-gray-500 dark:text-gray-400">
          Revisa los detalles antes de confirmar
        </p>
      </div>

      {/* Cliente */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <User className="h-5 w-5 text-blue-600" />
          Cliente
        </h3>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Nombre:</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {customer.first_name} {customer.last_name}
            </span>
          </div>
          {customer.email && (
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Email:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {customer.email}
              </span>
            </div>
          )}
          {customer.phone && (
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Teléfono:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {customer.phone}
              </span>
            </div>
          )}
          {customer.document_number && (
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Documento:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {customer.document_type}: {customer.document_number}
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* Fechas */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-600" />
          Fechas de Estadía
        </h3>
        <div className="space-y-3">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Check-in</p>
            <p className="font-medium text-gray-900 dark:text-gray-100 capitalize">
              {formatDate(checkin)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Check-out</p>
            <p className="font-medium text-gray-900 dark:text-gray-100 capitalize">
              {formatDate(checkout)}
            </p>
          </div>
          <div className="pt-2 border-t dark:border-gray-700">
            <Badge variant="default" className="text-lg px-4 py-2">
              {nights} noche{nights !== 1 ? 's' : ''} • {occupantCount} ocupante{occupantCount !== 1 ? 's' : ''}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Espacios */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <DoorOpen className="h-5 w-5 text-blue-600" />
          Espacios Seleccionados
        </h3>
        <div className="space-y-3">
          {selectedSpaces.map((space) => (
            <div key={space.id} className="flex justify-between items-start">
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {space.label}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {space.space_types?.name}
                </p>
              </div>
              <p className="font-semibold text-gray-900 dark:text-gray-100">
                ${((space.space_types?.base_rate || 0) * nights).toFixed(2)}
              </p>
            </div>
          ))}
          <Separator />
          <div className="flex justify-between font-semibold">
            <span className="text-gray-900 dark:text-gray-100">Subtotal Alojamiento:</span>
            <span className="text-gray-900 dark:text-gray-100">${roomsTotal.toFixed(2)}</span>
          </div>
        </div>
      </Card>

      {/* Extras */}
      {extras.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Servicios Adicionales
          </h3>
          <div className="space-y-3">
            {extras.map((extra, index) => (
              <div key={index} className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {extra.name}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    ${extra.price} × {extra.quantity}
                  </p>
                </div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  ${(extra.price * extra.quantity).toFixed(2)}
                </p>
              </div>
            ))}
            <Separator />
            <div className="flex justify-between font-semibold">
              <span className="text-gray-900 dark:text-gray-100">Subtotal Extras:</span>
              <span className="text-gray-900 dark:text-gray-100">${extrasTotal.toFixed(2)}</span>
            </div>
          </div>
        </Card>
      )}

      {/* Pago */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-blue-600" />
          Pago
        </h3>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Método de pago:</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {paymentMethodNames[paymentMethod] || paymentMethod}
            </span>
          </div>
          {paymentAmount > 0 && (
            <>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Pago inicial:</span>
                <span className="font-medium text-green-600 dark:text-green-400">
                  ${paymentAmount.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Saldo pendiente:</span>
                <span className="font-medium text-orange-600 dark:text-orange-400">
                  ${(totalEstimated - paymentAmount).toFixed(2)}
                </span>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Total */}
      <Card className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200 dark:border-blue-800">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
              Total Estimado
            </p>
            <p className="text-4xl font-bold text-blue-600 dark:text-blue-400">
              ${totalEstimated.toFixed(2)}
            </p>
          </div>
          <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white">
            <DollarSign className="h-8 w-8" />
          </div>
        </div>
      </Card>

      {/* Notas */}
      {notes && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Notas
          </h3>
          <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
            {notes}
          </p>
        </Card>
      )}

      {/* Botones de navegación */}
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack} disabled={isSubmitting}>
          Atrás
        </Button>
        <Button onClick={onConfirm} disabled={isSubmitting} size="lg">
          {isSubmitting ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Creando Reserva...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-5 w-5 mr-2" />
              Confirmar Reserva
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
