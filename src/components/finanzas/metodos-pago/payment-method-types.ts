// Tipos para métodos de pago
export interface PaymentMethod {
  code: string;
  name: string;
  requires_reference: boolean;
  is_active: boolean;
  is_system: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface GatewayConfig {
  environment?: string;
  webhook_url?: string;
  api_key?: string;
  secret_key?: string;
  merchant_id?: string;
  account_id?: string;
  access_token?: string;
  public_key?: string;
  additional_json?: string;
  [key: string]: any;
}

export interface OrganizationPaymentMethod {
  id: number;
  organization_id: number;
  payment_method_code: string;
  is_active: boolean;
  settings: {
    gateway?: string;
    gateway_config?: GatewayConfig;
    account_mapping?: Record<string, string>;
  };
  payment_method?: PaymentMethod;
  created_at?: string;
  updated_at?: string;
}

// Constantes para métodos de pago
export const PAYMENT_GATEWAYS = {
  NONE: '',
  STRIPE: 'stripe',
  PAYU: 'payu',
  MERCADOPAGO: 'mercadopago'
};

export const PAYMENT_GATEWAY_OPTIONS = [
  { label: "Ninguno", value: PAYMENT_GATEWAYS.NONE },
  { label: "Stripe", value: PAYMENT_GATEWAYS.STRIPE },
  { label: "PayU", value: PAYMENT_GATEWAYS.PAYU },
  { label: "Mercado Pago", value: PAYMENT_GATEWAYS.MERCADOPAGO }
];

export const ACCOUNTING_DEFAULT_MAPPINGS = [
  { key: "income", label: "Cuenta de Ingresos" },
  { key: "receivable", label: "Cuenta por Cobrar" },
  { key: "bank", label: "Cuenta Bancaria" },
  { key: "cash", label: "Caja Efectivo" }
];

// Constantes de sistema
export const SYSTEM_PAYMENT_METHODS = {
  CASH: 'cash',
  CARD: 'card',
  TRANSFER: 'transfer',
  CREDIT: 'credit',
  CHECK: 'check',
  PAYPAL: 'paypal',
  STRIPE: 'stripe',
  MERCADOPAGO: 'mp'
};
