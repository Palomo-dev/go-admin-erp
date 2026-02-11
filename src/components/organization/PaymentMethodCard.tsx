'use client';

import { useState, useEffect } from 'react';
import { CreditCardIcon, PencilIcon, TrashIcon, PlusIcon } from '@heroicons/react/24/outline';
import { PaymentMethodSkeleton } from './OrganizationSkeletons';

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

interface PaymentMethodCardProps {
  stripeCustomerId: string | null;
  organizationId: number;
  onPaymentMethodUpdated?: () => void;
}

const brandLogos: Record<string, string> = {
  visa: '💳 Visa',
  mastercard: '💳 Mastercard',
  amex: '💳 Amex',
  discover: '💳 Discover',
  diners: '💳 Diners',
  jcb: '💳 JCB',
  unionpay: '💳 UnionPay',
};

export default function PaymentMethodCard({ 
  stripeCustomerId,
  organizationId,
  onPaymentMethodUpdated 
}: PaymentMethodCardProps) {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    if (stripeCustomerId) {
      loadPaymentMethods();
    } else {
      setLoading(false);
    }
  }, [stripeCustomerId]);

  const loadPaymentMethods = async () => {
    if (!stripeCustomerId || !organizationId) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/subscriptions/payment-methods?organizationId=${organizationId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Error al cargar métodos de pago');
      }
      
      setPaymentMethods(result.paymentMethods || []);
    } catch (err: any) {
      console.error('Error loading payment methods:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePaymentMethod = async (paymentMethodId: string) => {
    if (!confirm('¿Estás seguro de eliminar este método de pago?')) return;
    
    try {
      setActionLoading(paymentMethodId);
      setError(null);
      
      const response = await fetch('/api/subscriptions/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          organizationId,
          action: 'delete',
          paymentMethodId 
        }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Error al eliminar método de pago');
      }
      
      // Recargar métodos de pago
      await loadPaymentMethods();
      onPaymentMethodUpdated?.();
      
    } catch (err: any) {
      console.error('Error deleting payment method:', err);
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenBillingPortal = async () => {
    if (!stripeCustomerId || !organizationId) return;
    
    try {
      setActionLoading('portal');
      setError(null);
      
      const response = await fetch('/api/subscriptions/billing-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          organizationId,
          returnUrl: window.location.href,
        }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Error al abrir portal de facturación');
      }
      
      if (result.url) {
        window.location.href = result.url;
      }
      
    } catch (err: any) {
      console.error('Error opening billing portal:', err);
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const formatBrand = (brand: string) => {
    return brandLogos[brand.toLowerCase()] || `💳 ${brand}`;
  };

  if (!stripeCustomerId) {
    return (
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Método de Pago</h3>
          <p className="text-sm text-gray-500">Gestiona tu método de pago para suscripciones</p>
        </div>
        <div className="p-6">
          <div className="text-center py-6">
            <CreditCardIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h4 className="mt-2 text-sm font-medium text-gray-900">Sin método de pago</h4>
            <p className="mt-1 text-sm text-gray-500">
              El método de pago se configurará al seleccionar un plan de pago.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return <PaymentMethodSkeleton />;
  }

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Método de Pago</h3>
          <p className="text-sm text-gray-500">Gestiona tu método de pago para suscripciones</p>
        </div>
        <button
          onClick={handleOpenBillingPortal}
          disabled={actionLoading === 'portal'}
          className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {actionLoading === 'portal' ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
              Abriendo...
            </>
          ) : (
            <>
              <PencilIcon className="h-4 w-4 mr-1" />
              Gestionar Facturación
            </>
          )}
        </button>
      </div>
      
      <div className="p-6">
        {error && (
          <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        
        {paymentMethods.length === 0 ? (
          <div className="text-center py-6">
            <CreditCardIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h4 className="mt-2 text-sm font-medium text-gray-900">Sin métodos de pago</h4>
            <p className="mt-1 text-sm text-gray-500">
              Agrega un método de pago para tus suscripciones.
            </p>
            <button
              onClick={handleOpenBillingPortal}
              className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Agregar Método de Pago
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {paymentMethods.map((pm) => (
              <div 
                key={pm.id} 
                className={`flex items-center justify-between p-4 rounded-lg border ${
                  pm.isDefault ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                }`}
              >
                <div className="flex items-center space-x-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-8 bg-gradient-to-r from-gray-700 to-gray-900 rounded flex items-center justify-center">
                      <span className="text-white text-xs font-bold">
                        {pm.brand.toUpperCase().substring(0, 4)}
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {formatBrand(pm.brand)} •••• {pm.last4}
                    </p>
                    <p className="text-xs text-gray-500">
                      Expira {pm.expMonth.toString().padStart(2, '0')}/{pm.expYear}
                    </p>
                  </div>
                  {pm.isDefault && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                      Predeterminada
                    </span>
                  )}
                </div>
                
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleDeletePaymentMethod(pm.id)}
                    disabled={actionLoading === pm.id || paymentMethods.length === 1}
                    className="p-2 text-gray-400 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={paymentMethods.length === 1 ? 'No puedes eliminar el único método de pago' : 'Eliminar'}
                  >
                    {actionLoading === pm.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                    ) : (
                      <TrashIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
