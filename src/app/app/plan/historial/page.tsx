'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { CalendarIcon, CreditCardIcon, CheckCircleIcon, XCircleIcon, ClockIcon } from '@heroicons/react/24/outline';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Subscription {
  id: string;
  organization_id: number;
  plan_id: number;
  status: string;
  current_period_start: string;
  current_period_end: string;
  trial_start?: string;
  trial_end?: string;
  canceled_at?: string;
  stripe_subscription_id?: string;
  stripe_customer_id?: string;
  created_at: string;
  updated_at: string;
  plans: {
    id: number;
    code: string;
    name: string;
    price_usd_month: number;
    price_usd_year: number;
    max_modules: number;
    max_branches: number;
  };
}

interface SubscriptionResponse {
  id: any;
  organization_id: any;
  plan_id: any;
  status: any;
  current_period_start: any;
  current_period_end: any;
  trial_start?: any;
  trial_end?: any;
  canceled_at?: any;
  stripe_subscription_id?: any;
  stripe_customer_id?: any;
  created_at: any;
  updated_at: any;
  plans: {
    id: any;
    code: any;
    name: any;
    price_usd_month: any;
    price_usd_year: any;
    max_modules: any;
    max_branches: any;
  };
}

const statusColors = {
  active: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  expired: 'bg-gray-100 text-gray-800',
  trial: 'bg-blue-100 text-blue-800',
  pending: 'bg-yellow-100 text-yellow-800'
};

const statusIcons = {
  active: CheckCircleIcon,
  cancelled: XCircleIcon,
  expired: XCircleIcon,
  trial: ClockIcon,
  pending: ClockIcon
};

const statusLabels = {
  active: 'Activo',
  cancelled: 'Cancelado',
  expired: 'Expirado',
  trial: 'Periodo de prueba',
  pending: 'Pendiente'
};

export default function HistorialPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState<string>('');

  useEffect(() => {
    const fetchSubscriptionHistory = async () => {
      try {
        setLoading(true);
        
        // Get current user session
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          setError('No se encontró sesión de usuario');
          return;
        }
        
        const currentOrgId = localStorage.getItem('currentOrganizationId');
        
        if (!currentOrgId) {
          setError('No se encontró organización activa');
          return;
        }

        // Get organization name
        const { data: orgData, error: orgError } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', currentOrgId)
          .single();

        if (orgError) {
          console.error('Error fetching organization:', orgError);
        } else {
          setOrganizationName(orgData.name);
        }

        // Get subscription history for the organization
        const { data: subscriptionsData, error: subscriptionsError } = await supabase
          .from('subscriptions')
          .select(`
            id,
            organization_id,
            plan_id,
            status,
            current_period_start,
            current_period_end,
            trial_start,
            trial_end,
            canceled_at,
            stripe_subscription_id,
            stripe_customer_id,
            created_at,
            updated_at,
            plans!inner (
              id,
              code,
              name,
              price_usd_month,
              price_usd_year,
              max_modules,
              max_branches
            )
          `)
          .eq('organization_id', currentOrgId)
          .order('created_at', { ascending: false });

        if (subscriptionsError) {
          console.error('Error fetching subscriptions:', subscriptionsError);
          setError('Error al obtener el historial de suscripciones');
          return;
        }

        const typedSubscriptions: Subscription[] = (subscriptionsData as unknown as SubscriptionResponse[] || []).map(sub => ({
          id: String(sub.id),
          organization_id: Number(sub.organization_id),
          plan_id: Number(sub.plan_id),
          status: String(sub.status),
          current_period_start: String(sub.current_period_start),
          current_period_end: String(sub.current_period_end),
          trial_start: sub.trial_start ? String(sub.trial_start) : undefined,
          trial_end: sub.trial_end ? String(sub.trial_end) : undefined,
          canceled_at: sub.canceled_at ? String(sub.canceled_at) : undefined,
          stripe_subscription_id: sub.stripe_subscription_id ? String(sub.stripe_subscription_id) : undefined,
          stripe_customer_id: sub.stripe_customer_id ? String(sub.stripe_customer_id) : undefined,
          created_at: String(sub.created_at),
          updated_at: String(sub.updated_at),
          plans: {
            id: Number(sub.plans.id),
            code: String(sub.plans.code),
            name: String(sub.plans.name),
            price_usd_month: Number(sub.plans.price_usd_month),
            price_usd_year: Number(sub.plans.price_usd_year),
            max_modules: Number(sub.plans.max_modules),
            max_branches: Number(sub.plans.max_branches)
          }
        }));
        
        setSubscriptions(typedSubscriptions);
        
      } catch (err) {
        console.error('Error in fetchSubscriptionHistory:', err);
        setError('Error inesperado al cargar el historial');
      } finally {
        setLoading(false);
      }
    };

    fetchSubscriptionHistory();
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatCurrency = (price: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'USD'
    }).format(price);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
          <p className="mt-2">Cargando historial de suscripciones...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Historial de Suscripciones</h1>
        <p className="text-gray-600 mt-2">
          Revisa el historial completo de suscripciones para {organizationName || 'tu organización'}
        </p>
      </div>

      {subscriptions.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <CreditCardIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No hay historial de suscripciones
            </h3>
            <p className="text-gray-600">
              Aún no tienes suscripciones registradas en el sistema.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {subscriptions.map((subscription) => {
            const StatusIcon = statusIcons[subscription.status as keyof typeof statusIcons];
            
            return (
              <Card key={subscription.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold">
                      {subscription.plans.name}
                    </CardTitle>
                    <Badge 
                      className={`${statusColors[subscription.status as keyof typeof statusColors]} flex items-center gap-1`}
                    >
                      <StatusIcon className="h-3 w-3" />
                      {statusLabels[subscription.status as keyof typeof statusLabels]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="flex items-center gap-2">
                      <CreditCardIcon className="h-4 w-4 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-600">Precio del Plan</p>
                        <p className="font-medium">
                          {formatCurrency(subscription.plans.price_usd_month)}/mes
                        </p>
                        <p className="text-xs text-gray-400">
                          {formatCurrency(subscription.plans.price_usd_year)}/año
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-600">Fecha de inicio</p>
                        <p className="font-medium">{formatDate(subscription.created_at)}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-600">Periodo actual</p>
                        <p className="font-medium">
                          {formatDate(subscription.current_period_start)} - {formatDate(subscription.current_period_end)}
                        </p>
                      </div>
                    </div>
                    
                    <div>
                      <p className="text-sm text-gray-600">Límites del plan</p>
                      <p className="font-medium">
                        {subscription.plans.max_modules} módulos, {subscription.plans.max_branches} sucursales
                      </p>
                    </div>
                  </div>
                  
                  {subscription.trial_start && subscription.trial_end && (
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <p className="text-sm text-blue-800">
                        <strong>Periodo de prueba:</strong> {formatDate(subscription.trial_start)} - {formatDate(subscription.trial_end)}
                      </p>
                    </div>
                  )}
                  
                  <div className="text-xs text-gray-500">
                    Última actualización: {formatDate(subscription.updated_at)}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
