"use client";

import { useEffect, useState } from 'react';
import { PAYMENT_GATEWAYS } from './payment-method-types';
import StripeGatewayConfig from '@/components/finanzas/metodos-pago/gateways/StripeGatewayConfig';
import PayUGatewayConfig from '@/components/finanzas/metodos-pago/gateways/PayUGatewayConfig';
import MercadoPagoGatewayConfig from '@/components/finanzas/metodos-pago/gateways/MercadoPagoGatewayConfig';
import GenericGatewayConfig from '@/components/finanzas/metodos-pago/gateways/GenericGatewayConfig';
import { Card, CardContent } from '@/components/ui/card';

export interface GatewayConfigProps {
  organizationId: number;
  paymentMethodCode: string;
  gateway: string;
  config?: any;
  onConfigChange: (config: any) => void;
  onValidChange?: (isValid: boolean) => void;
}

/**
 * Componente que gestiona la configuración de pasarelas de pago
 * Este componente carga el componente específico para cada tipo de pasarela
 */
export default function PaymentMethodGatewayConfig({
  organizationId,
  paymentMethodCode,
  gateway,
  config,
  onConfigChange,
  onValidChange = () => {}
}: GatewayConfigProps) {
  const [isConfigValid, setIsConfigValid] = useState(true);

  useEffect(() => {
    onValidChange(isConfigValid);
  }, [isConfigValid, onValidChange]);

  const handleConfigChange = (newConfig: any) => {
    onConfigChange(newConfig);
  };

  const handleValidChange = (isValid: boolean) => {
    setIsConfigValid(isValid);
  };

  // Renderiza el componente específico según el tipo de pasarela
  const renderGatewayConfig = () => {
    switch (gateway) {
      case PAYMENT_GATEWAYS.STRIPE:
        return (
          <StripeGatewayConfig
            organizationId={organizationId}
            paymentMethodCode={paymentMethodCode}
            gateway={PAYMENT_GATEWAYS.STRIPE}
            config={config}
            onConfigChange={handleConfigChange}
            onValidChange={handleValidChange}
          />
        );
      case PAYMENT_GATEWAYS.PAYU:
        return (
          <PayUGatewayConfig
            organizationId={organizationId}
            paymentMethodCode={paymentMethodCode}
            gateway={PAYMENT_GATEWAYS.PAYU}
            config={config}
            onConfigChange={handleConfigChange}
            onValidChange={handleValidChange}
          />
        );
      case PAYMENT_GATEWAYS.MERCADOPAGO:
        return (
          <MercadoPagoGatewayConfig
            organizationId={organizationId}
            paymentMethodCode={paymentMethodCode}
            gateway={PAYMENT_GATEWAYS.MERCADOPAGO}
            config={config}
            onConfigChange={handleConfigChange}
            onValidChange={handleValidChange}
          />
        );
      case PAYMENT_GATEWAYS.NONE:
        return <p className="text-muted-foreground py-4">Este método de pago no requiere configuración de pasarela.</p>;
      default:
        return (
          <GenericGatewayConfig
            organizationId={organizationId}
            paymentMethodCode={paymentMethodCode}
            gateway={gateway}
            config={config}
            onConfigChange={handleConfigChange}
            onValidChange={handleValidChange}
          />
        );
    }
  };

  return (
    <Card className="mt-4">
      <CardContent className="pt-6">
        {renderGatewayConfig()}
      </CardContent>
    </Card>
  );
}
