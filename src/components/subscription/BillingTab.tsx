'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { 
  CreditCardIcon, 
  DocumentTextIcon, 
  ArrowTopRightOnSquareIcon,
  PlusIcon,
  TrashIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

interface Invoice {
  id: string;
  number: string;
  status: string;
  amount: number;
  currency: string;
  created: string;
  dueDate: string | null;
  paidAt: string | null;
  invoicePdf: string | null;
  hostedInvoiceUrl: string | null;
}

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

interface BillingTabProps {
  orgId: number;
}

export default function BillingTab({ orgId }: BillingTabProps) {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [hasStripeCustomer, setHasStripeCustomer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (orgId) {
      loadBillingData();
    }
  }, [orgId]);

  const loadBillingData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Verificar si tiene Stripe customer
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('stripe_customer_id')
        .eq('organization_id', orgId)
        .single();

      setHasStripeCustomer(!!subscription?.stripe_customer_id);

      if (subscription?.stripe_customer_id) {
        // Cargar facturas
        const invoicesRes = await fetch(`/api/subscriptions/invoices?organizationId=${orgId}`);
        const invoicesData = await invoicesRes.json();
        if (invoicesData.success) {
          setInvoices(invoicesData.invoices || []);
        }

        // Cargar métodos de pago
        const pmRes = await fetch(`/api/subscriptions/payment-methods?organizationId=${orgId}`);
        const pmData = await pmRes.json();
        if (pmData.success) {
          setPaymentMethods(pmData.paymentMethods || []);
        }
      }
    } catch (err: any) {
      console.error('Error loading billing data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenBillingPortal = async () => {
    try {
      setActionLoading('portal');
      const response = await fetch('/api/subscriptions/billing-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: orgId }),
      });

      const data = await response.json();
      
      if (data.success && data.url) {
        window.open(data.url, '_blank');
      } else {
        throw new Error(data.error || 'Error abriendo portal');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeletePaymentMethod = async (pmId: string) => {
    if (!confirm('¿Estás seguro de eliminar este método de pago?')) return;
    
    try {
      setActionLoading(pmId);
      const response = await fetch('/api/subscriptions/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: orgId,
          action: 'delete',
          paymentMethodId: pmId
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setPaymentMethods(prev => prev.filter(pm => pm.id !== pmId));
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSetDefaultPaymentMethod = async (pmId: string) => {
    try {
      setActionLoading(pmId);
      const response = await fetch('/api/subscriptions/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: orgId,
          action: 'set-default',
          paymentMethodId: pmId
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setPaymentMethods(prev => prev.map(pm => ({
          ...pm,
          isDefault: pm.id === pmId
        })));
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(amount / 100);
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      paid: 'bg-green-100 text-green-800',
      open: 'bg-yellow-100 text-yellow-800',
      draft: 'bg-gray-100 text-gray-800',
      uncollectible: 'bg-red-100 text-red-800',
      void: 'bg-gray-100 text-gray-500'
    };

    const labels: Record<string, string> = {
      paid: 'Pagada',
      open: 'Pendiente',
      draft: 'Borrador',
      uncollectible: 'Incobrable',
      void: 'Anulada'
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100'}`}>
        {labels[status] || status}
      </span>
    );
  };

  const getBrandIcon = (brand: string) => {
    const brandLower = brand?.toLowerCase() || '';
    if (brandLower === 'visa') return '💳 Visa';
    if (brandLower === 'mastercard') return '💳 Mastercard';
    if (brandLower === 'amex') return '💳 Amex';
    return '💳 ' + (brand || 'Tarjeta');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Cargando información de facturación...</span>
      </div>
    );
  }

  if (!hasStripeCustomer) {
    return (
      <div className="bg-white shadow rounded-lg p-8 text-center">
        <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-yellow-400" />
        <h3 className="mt-4 text-lg font-medium text-gray-900">Sin información de facturación</h3>
        <p className="mt-2 text-sm text-gray-500">
          Actualmente estás usando un plan gratuito o sin integración de pagos.
          Actualiza a un plan de pago para acceder a la información de facturación.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Acceso rápido al portal */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-blue-800">Portal de Facturación de Stripe</h3>
            <p className="text-sm text-blue-600">Gestiona tus facturas, métodos de pago y suscripción</p>
          </div>
          <button
            onClick={handleOpenBillingPortal}
            disabled={actionLoading === 'portal'}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {actionLoading === 'portal' ? 'Abriendo...' : 'Abrir Portal'}
            <ArrowTopRightOnSquareIcon className="ml-2 h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Métodos de Pago */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Métodos de Pago</h3>
              <p className="text-sm text-gray-500">Tarjetas guardadas para facturación</p>
            </div>
            <button
              onClick={handleOpenBillingPortal}
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <PlusIcon className="h-4 w-4 mr-1" />
              Agregar
            </button>
          </div>
        </div>
        <div className="p-6">
          {paymentMethods.length > 0 ? (
            <div className="space-y-3">
              {paymentMethods.map((pm) => (
                <div key={pm.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <CreditCardIcon className="h-8 w-8 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {getBrandIcon(pm.brand)} •••• {pm.last4}
                      </p>
                      <p className="text-xs text-gray-500">
                        Vence: {pm.expMonth}/{pm.expYear}
                      </p>
                    </div>
                    {pm.isDefault && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircleIcon className="h-3 w-3 mr-1" />
                        Predeterminada
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    {!pm.isDefault && (
                      <button
                        onClick={() => handleSetDefaultPaymentMethod(pm.id)}
                        disabled={actionLoading === pm.id}
                        className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
                      >
                        Usar como principal
                      </button>
                    )}
                    <button
                      onClick={() => handleDeletePaymentMethod(pm.id)}
                      disabled={actionLoading === pm.id}
                      className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-50"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <CreditCardIcon className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-2 text-sm text-gray-500">No hay métodos de pago guardados</p>
              <button
                onClick={handleOpenBillingPortal}
                className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <PlusIcon className="h-4 w-4 mr-1" />
                Agregar método de pago
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Historial de Facturas */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Historial de Facturas</h3>
          <p className="text-sm text-gray-500">Facturas generadas por Stripe</p>
        </div>
        <div className="overflow-hidden">
          {invoices.length > 0 ? (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Factura</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Monto</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <DocumentTextIcon className="h-5 w-5 text-gray-400 mr-2" />
                        <span className="text-sm font-medium text-gray-900">
                          {invoice.number || invoice.id.slice(-8)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(invoice.created)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatAmount(invoice.amount, invoice.currency)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(invoice.status || 'draft')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        {invoice.hostedInvoiceUrl && (
                          <a
                            href={invoice.hostedInvoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800"
                          >
                            Ver
                          </a>
                        )}
                        {invoice.invoicePdf && (
                          <a
                            href={invoice.invoicePdf}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-green-600 hover:text-green-800"
                          >
                            PDF
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12">
              <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-2 text-sm text-gray-500">No hay facturas disponibles</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
