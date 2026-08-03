'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { CustomerSelector } from '@/components/pos/CustomerSelector';
import type { Customer as ReservationCustomer } from '@/lib/services/reservationsService';
import type { Customer as POSCustomer } from '@/components/pos/types';

interface StepCustomerProps {
  selectedCustomer: ReservationCustomer | null;
  onCustomerSelect: (customer: ReservationCustomer | null) => void;
  onNext: () => void;
}

function mapPOSCustomerToReservation(posCustomer: POSCustomer | undefined): ReservationCustomer | null {
  if (!posCustomer) return null;
  const nameParts = (posCustomer.full_name || '').split(' ');
  return {
    id: posCustomer.id,
    organization_id: posCustomer.organization_id,
    first_name: nameParts[0] || '',
    last_name: nameParts.slice(1).join(' ') || '',
    email: posCustomer.email || undefined,
    phone: posCustomer.phone || undefined,
    avatar_url: (posCustomer as any).avatar_url || undefined,
  };
}

export function StepCustomer({
  selectedCustomer,
  onCustomerSelect,
  onNext,
}: StepCustomerProps) {
  const handleCustomerSelect = (posCustomer?: POSCustomer) => {
    onCustomerSelect(mapPOSCustomerToReservation(posCustomer));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Cliente
        </h2>
        <p className="text-gray-500 dark:text-gray-400">
          Busca un cliente existente o crea uno nuevo
        </p>
      </div>

      <CustomerSelector
        selectedCustomer={selectedCustomer ? {
          id: selectedCustomer.id,
          organization_id: selectedCustomer.organization_id,
          full_name: `${selectedCustomer.first_name} ${selectedCustomer.last_name}`.trim(),
          email: selectedCustomer.email || '',
          phone: selectedCustomer.phone || '',
          doc_type: (selectedCustomer as any).doc_type || (selectedCustomer as any).identification_type || '',
          doc_number: (selectedCustomer as any).doc_number || (selectedCustomer as any).identification_number || '',
          address: selectedCustomer.address || '',
          country: selectedCustomer.country || 'Colombia',
          roles: [],
          tags: [],
          preferences: {},
          created_at: selectedCustomer.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as POSCustomer : undefined}
        onCustomerSelect={handleCustomerSelect}
      />

      {selectedCustomer && (
        <div className="flex justify-end pt-4">
          <Button onClick={onNext} size="lg">
            Continuar
          </Button>
        </div>
      )}
    </div>
  );
}
