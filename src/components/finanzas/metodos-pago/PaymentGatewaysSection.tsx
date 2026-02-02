'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Utils';
import {
  CheckCircle2,
  AlertCircle,
  Zap,
  ExternalLink,
  CreditCard,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import integrationsService, {
  type IntegrationConnection,
} from '@/lib/services/integrationsService';

interface PaymentGatewaysSectionProps {
  organizationId: number;
}

interface GatewayInfo {
  code: string;
  name: string;
  description: string;
  countries: string[];
}

const PAYMENT_GATEWAYS: GatewayInfo[] = [
  {
    code: 'stripe',
    name: 'Stripe',
    description: 'Pagos con tarjeta internacionales',
    countries: ['US', 'EU', 'MX', 'BR'],
  },
  {
    code: 'wompi',
    name: 'Wompi',
    description: 'Pagos en Colombia (PSE, tarjetas, Nequi)',
    countries: ['CO'],
  },
  {
    code: 'mercadopago',
    name: 'Mercado Pago',
    description: 'Pagos en Latinoamérica',
    countries: ['AR', 'BR', 'CL', 'CO', 'MX', 'PE', 'UY'],
  },
  {
    code: 'payu',
    name: 'PayU',
    description: 'Pagos en Latinoamérica',
    countries: ['CO', 'MX', 'AR', 'BR', 'CL', 'PE'],
  },
];

export function PaymentGatewaysSection({ organizationId }: PaymentGatewaysSectionProps) {
  const router = useRouter();
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConnections = async () => {
      try {
        setLoading(true);
        const data = await integrationsService.getConnectionsForModule(organizationId, 'payments');
        setConnections(data);
      } catch (error) {
        console.error('Error loading payment connections:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchConnections();
  }, [organizationId]);

  const loadConnections = async () => {
    try {
      setLoading(true);
      const data = await integrationsService.getConnectionsForModule(organizationId, 'payments');
      setConnections(data);
    } catch (error) {
      console.error('Error loading payment connections:', error);
    } finally {
      setLoading(false);
    }
  };

  const getConnectionForGateway = (gatewayCode: string): IntegrationConnection | undefined => {
    return connections.find((conn) => {
      const connector = conn.connector as IntegrationConnection['connector'];
      const provider = connector?.provider;
      return provider?.code === gatewayCode;
    });
  };

  const handleConnect = (gatewayCode: string) => {
    router.push(`/app/integraciones/conexiones/nueva?provider=${gatewayCode}&return=/app/finanzas/metodos-pago`);
  };

  const handleConfigure = (connectionId: string) => {
    router.push(`/app/integraciones/conexiones/${connectionId}`);
  };

  if (loading) {
    return (
      <Card className="mb-6 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50">
        <CardHeader>
          <CardTitle className="text-lg text-blue-600 dark:text-blue-400 flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Pasarelas de Pago
          </CardTitle>
          <CardDescription>Cargando estado de pasarelas...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg text-blue-600 dark:text-blue-400 flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Pasarelas de Pago
          </CardTitle>
          <CardDescription>
            Conecta pasarelas para aceptar pagos electrónicos
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadConnections}
          className="text-gray-500"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PAYMENT_GATEWAYS.map((gateway) => {
            const connection = getConnectionForGateway(gateway.code);
            const isConnected = connection?.status === 'connected';
            const hasError = connection?.status === 'error';

            return (
              <div
                key={gateway.code}
                className={cn(
                  'p-4 rounded-lg border transition-all',
                  isConnected
                    ? 'border-green-200 dark:border-green-800/50 bg-green-50/50 dark:bg-green-900/10'
                    : hasError
                    ? 'border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-900/10'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30',
                  'hover:shadow-md'
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={cn(
                    'flex items-center justify-center w-10 h-10 rounded-lg font-bold text-white',
                    'bg-green-500'
                  )}>
                    {gateway.name[0]}
                  </div>
                  {isConnected && (
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Conectado
                    </Badge>
                  )}
                  {hasError && (
                    <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Error
                    </Badge>
                  )}
                </div>

                <h4 className="font-semibold text-gray-900 dark:text-white">
                  {gateway.name}
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  {gateway.description}
                </p>

                {isConnected ? (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => handleConfigure(connection!.id)}
                    >
                      Configurar
                    </Button>
                    <Link href={`/app/integraciones/conexiones/${connection!.id}`}>
                      <Button variant="ghost" size="sm" className="px-2">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs"
                    onClick={() => handleConnect(gateway.code)}
                  >
                    <Zap className="h-3.5 w-3.5 mr-1" />
                    Conectar
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        {connections.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
            <Link href="/app/integraciones?filter=payments">
              <Button variant="ghost" size="sm" className="text-blue-600 dark:text-blue-400">
                Ver todas las integraciones de pagos
                <ExternalLink className="h-3.5 w-3.5 ml-1" />
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default PaymentGatewaysSection;
