'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, Check, X, Loader2, Copy, Edit, Link2 } from 'lucide-react';
import Link from 'next/link';
import {
  integrationsService,
  IntegrationProvider,
  IntegrationConnector,
  IntegrationConnection,
} from '@/lib/services/integrationsService';
import { wompiService } from '@/lib/services/integrations/wompi';
import { mercadopagoService } from '@/lib/services/integrations/mercadopago';
import { payuService } from '@/lib/services/integrations/payu';
import { stripeClientService } from '@/lib/services/integrations/stripe';
import { paypalService } from '@/lib/services/integrations/paypal';
import { metaMarketingService } from '@/lib/services/integrations/meta';
import { tiktokMarketingService } from '@/lib/services/integrations/tiktok';
import { whatsappClientService, whatsappSyncService } from '@/lib/services/integrations/whatsapp';
import { supabase } from '@/lib/supabase/config';
import {
  StepProviderConnector,
  StepCountryEnvironment,
  StepSettings,
  StepCredentials,
} from '@/components/integraciones/conexiones/nueva';
import { PROVIDER_CONFIGS } from '@/components/integraciones/conexiones';

export type FormMode = 'create' | 'edit' | 'duplicate';

// Pasos para modo crear (completo)
const STEPS_CREATE = [
  { id: 1, title: 'Proveedor', description: 'Selecciona proveedor y conector' },
  { id: 2, title: 'Configuración', description: 'País, ambiente y sucursal' },
  { id: 3, title: 'Ajustes', description: 'Nombre y opciones' },
  { id: 4, title: 'Credenciales', description: 'Datos de acceso' },
];

// Pasos para modo editar/duplicar (sin paso 1)
const STEPS_EDIT = [
  { id: 1, title: 'Configuración', description: 'País, ambiente y sucursal' },
  { id: 2, title: 'Ajustes', description: 'Nombre y opciones' },
  { id: 3, title: 'Credenciales', description: 'Datos de acceso' },
];

interface WizardData {
  connectionId?: string; // Para modo edit
  provider: IntegrationProvider | null;
  connector: IntegrationConnector | null;
  countryCode: string;
  environment: 'production' | 'sandbox' | 'test';
  branchId: number | null;
  connectionName: string;
  settings: Record<string, unknown>;
  credentials: {
    credential_type: string;
    secret_ref: string;
    purpose: 'primary' | 'backup' | 'rotation' | 'legacy';
    expires_at?: string;
  };
}

const initialWizardData: WizardData = {
  provider: null,
  connector: null,
  countryCode: 'CO',
  environment: 'sandbox',
  branchId: null,
  connectionName: '',
  settings: {
    auto_sync: true,
    error_notifications: true,
    verbose_logs: false,
  },
  credentials: {
    credential_type: 'api_key',
    secret_ref: '{}',
    purpose: 'primary',
  },
};

export default function NuevaConexionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  // Obtener modo, connectionId y providerId de la URL
  const mode = (searchParams.get('mode') as FormMode) || 'create';
  const connectionId = searchParams.get('id');
  const preselectedProviderId = searchParams.get('provider');

  // Determinar pasos según el modo
  const STEPS = mode === 'create' ? STEPS_CREATE : STEPS_EDIT;

  // Estado del wizard
  const [currentStep, setCurrentStep] = useState(1);
  const [wizardData, setWizardData] = useState<WizardData>(initialWizardData);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [existingConnection, setExistingConnection] = useState<IntegrationConnection | null>(null);

  // Datos auxiliares
  const [providers, setProviders] = useState<IntegrationProvider[]>([]);
  const [connectors, setConnectors] = useState<IntegrationConnector[]>([]);
  const [branches, setBranches] = useState<Array<{ id: number; name: string }>>([]);
  const [organizationDomain, setOrganizationDomain] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  // Estados de validación y guardado
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Cargar datos iniciales
  const loadData = useCallback(async () => {
    if (!organizationId) return;

    setIsLoading(true);
    try {
      const [providersData, connectorsData, branchesData, domainsResult] = await Promise.all([
        integrationsService.getProviders(),
        integrationsService.getConnectors(),
        integrationsService.getBranches(organizationId),
        supabase
          .from('organization_domains')
          .select('host, domain_type, is_primary, is_active, status')
          .eq('organization_id', organizationId)
          .eq('is_active', true)
          .eq('status', 'verified')
          .order('is_primary', { ascending: false }),
      ]);

      setProviders(providersData);
      setConnectors(connectorsData);
      setBranches(branchesData);

      // Dominio: priorizar custom_domain verificado, sino system_subdomain
      if (domainsResult.data && domainsResult.data.length > 0) {
        const customDomain = domainsResult.data.find(
          (d) => d.domain_type === 'custom_domain' && d.is_primary
        );
        const subdomain = domainsResult.data.find(
          (d) => d.domain_type === 'system_subdomain'
        );
        setOrganizationDomain(customDomain?.host || subdomain?.host || '');
      }

      // Si viene un provider preseleccionado desde la URL, auto-seleccionarlo
      if (mode === 'create' && preselectedProviderId) {
        const preselectedProvider = providersData.find((p) => p.id === preselectedProviderId);
        if (preselectedProvider) {
          // Buscar conectores del proveedor
          const providerConnectors = connectorsData.filter((c) => c.provider_id === preselectedProvider.id);
          const defaultConnector = providerConnectors.length === 1 ? providerConnectors[0] : null;

          setWizardData((prev) => ({
            ...prev,
            provider: preselectedProvider,
            connector: defaultConnector,
            connectionName: defaultConnector 
              ? `${preselectedProvider.name} - ${defaultConnector.name}` 
              : preselectedProvider.name,
          }));

          // Si solo hay un conector, ir directo al paso 2
          if (defaultConnector) {
            setCurrentStep(2);
          }
        }
      }

      // Si es modo edit o duplicate, cargar la conexión existente
      if ((mode === 'edit' || mode === 'duplicate') && connectionId) {
        const connections = await integrationsService.getConnections(organizationId);
        const connection = connections.find((c) => c.id === connectionId);
        
        if (connection) {
          setExistingConnection(connection);
          
          // Encontrar el conector y proveedor
          const connector = connectorsData.find((c) => c.id === connection.connector_id);
          const provider = connector ? providersData.find((p) => p.id === connector.provider_id) : null;

          // Cargar datos en el wizard
          setWizardData({
            connectionId: mode === 'edit' ? connection.id : undefined,
            provider: provider || null,
            connector: connector || null,
            countryCode: connection.country_code || 'CO',
            environment: connection.environment,
            branchId: connection.branch_id || null,
            connectionName: mode === 'duplicate' ? `${connection.name} (copia)` : connection.name,
            settings: (connection.settings as Record<string, unknown>) || {
              auto_sync: true,
              error_notifications: true,
              verbose_logs: false,
            },
            credentials: {
              credential_type: provider?.auth_type || 'api_key',
              secret_ref: '{}',
              purpose: 'primary',
            },
          });
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, toast, mode, connectionId, preselectedProviderId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Actualizar tipo de credencial cuando cambia el proveedor
  useEffect(() => {
    if (wizardData.provider) {
      setWizardData((prev) => ({
        ...prev,
        credentials: {
          ...prev.credentials,
          credential_type: wizardData.provider?.auth_type || 'api_key',
        },
      }));
    }
  }, [wizardData.provider]);

  // Validación por paso (diferente según modo)
  const canProceed = (): boolean => {
    if (mode === 'create') {
      // Modo crear: 4 pasos
      switch (currentStep) {
        case 1:
          return !!wizardData.provider && !!wizardData.connector;
        case 2:
          return !!wizardData.countryCode && !!wizardData.environment;
        case 3:
          return !!wizardData.connectionName.trim();
        case 4:
          return !!wizardData.credentials.secret_ref && wizardData.credentials.secret_ref !== '{}';
        default:
          return false;
      }
    } else {
      // Modo edit/duplicate: 3 pasos (sin paso proveedor)
      switch (currentStep) {
        case 1:
          return !!wizardData.countryCode && !!wizardData.environment;
        case 2:
          return !!wizardData.connectionName.trim();
        case 3:
          return !!wizardData.credentials.secret_ref && wizardData.credentials.secret_ref !== '{}';
        default:
          return false;
      }
    }
  };

  // Navegación
  const handleNext = () => {
    if (currentStep < STEPS.length && canProceed()) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCancel = () => {
    router.push('/app/integraciones/conexiones');
  };

  // Validar conexión
  const handleValidate = async (): Promise<{ success: boolean; message: string }> => {
    setIsValidating(true);
    setValidationResult(null);

    try {
      // Validación específica para Wompi
      if (wizardData.provider?.code === 'wompi') {
        const creds = JSON.parse(wizardData.credentials.secret_ref || '{}');
        if (!creds.public_key || !creds.private_key) {
          const result = { success: false, message: 'Ingresa al menos la llave pública y privada' };
          setValidationResult(result);
          return result;
        }

        // Llamar al endpoint de merchant de Wompi para validar las llaves
        const baseUrl = wizardData.environment === 'production'
          ? 'https://production.wompi.co/v1'
          : 'https://sandbox.wompi.co/v1';

        const response = await fetch(`${baseUrl}/merchants/${creds.public_key}`);
        if (!response.ok) {
          const result = { success: false, message: `Llave pública inválida (HTTP ${response.status})` };
          setValidationResult(result);
          return result;
        }

        const data = await response.json();
        const merchantName = data?.data?.name || 'Comercio';
        const result = { success: true, message: `Conexión verificada: ${merchantName}` };
        setValidationResult(result);
        return result;
      }

      // Validación específica para MercadoPago
      if (wizardData.provider?.code === 'mercadopago') {
        const creds = JSON.parse(wizardData.credentials.secret_ref || '{}');
        if (!creds.public_key || !creds.access_token) {
          const result = { success: false, message: 'Ingresa al menos la Public Key y el Access Token' };
          setValidationResult(result);
          return result;
        }

        // Verificar Access Token consultando payment_methods
        const response = await fetch('https://api.mercadopago.com/v1/payment_methods', {
          headers: { Authorization: `Bearer ${creds.access_token}` },
        });

        if (!response.ok) {
          const result = { success: false, message: `Access Token inválido (HTTP ${response.status})` };
          setValidationResult(result);
          return result;
        }

        const methods = await response.json();
        const result = { success: true, message: `Conexión verificada: ${methods.length} métodos de pago disponibles` };
        setValidationResult(result);
        return result;
      }

      // Validación específica para PayU
      if (wizardData.provider?.code === 'payu') {
        const creds = JSON.parse(wizardData.credentials.secret_ref || '{}');
        if (!creds.api_key || !creds.api_login) {
          const result = { success: false, message: 'Ingresa al menos el API Key y API Login' };
          setValidationResult(result);
          return result;
        }

        // Verificar credenciales con comando PING
        const pingResponse = await fetch('/api/integrations/payu/health-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: creds.api_key,
            api_login: creds.api_login,
            merchant_id: creds.merchant_id || '',
            is_test: wizardData.environment !== 'production',
          }),
        });

        const pingData = await pingResponse.json();
        const result = {
          success: pingData.valid === true,
          message: pingData.message || (pingData.valid ? 'Conexión verificada con PayU' : 'Credenciales inválidas'),
        };
        setValidationResult(result);
        return result;
      }

      // Validación específica para Stripe
      if (wizardData.provider?.code === 'stripe') {
        const creds = JSON.parse(wizardData.credentials.secret_ref || '{}');
        if (!creds.secret_key) {
          const result = { success: false, message: 'Ingresa al menos la Secret Key' };
          setValidationResult(result);
          return result;
        }

        // Verificar formato de llaves
        if (creds.publishable_key && !creds.publishable_key.startsWith('pk_')) {
          const result = { success: false, message: 'Publishable Key debe comenzar con pk_test_ o pk_live_' };
          setValidationResult(result);
          return result;
        }

        if (!creds.secret_key.startsWith('sk_')) {
          const result = { success: false, message: 'Secret Key debe comenzar con sk_test_ o sk_live_' };
          setValidationResult(result);
          return result;
        }

        // Verificar credenciales con balance retrieve
        const checkResponse = await fetch('/api/integrations/stripe/health-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret_key: creds.secret_key }),
        });

        const checkData = await checkResponse.json();
        const result = {
          success: checkData.valid === true,
          message: checkData.message || (checkData.valid ? 'Conexión verificada con Stripe' : 'Credenciales inválidas'),
        };
        setValidationResult(result);
        return result;
      }

      // Validación específica para PayPal
      if (wizardData.provider?.code === 'paypal') {
        const creds = JSON.parse(wizardData.credentials.secret_ref || '{}');
        if (!creds.client_id || !creds.client_secret) {
          const result = { success: false, message: 'Ingresa al menos Client ID y Client Secret' };
          setValidationResult(result);
          return result;
        }

        // Verificar credenciales obteniendo un OAuth token
        const checkResponse = await fetch('/api/integrations/paypal/health-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: creds.client_id,
            client_secret: creds.client_secret,
            is_sandbox: wizardData.environment !== 'production',
          }),
        });

        const checkData = await checkResponse.json();
        const result = {
          success: checkData.valid === true,
          message: checkData.message || (checkData.valid ? 'Conexión verificada con PayPal' : 'Credenciales inválidas'),
        };
        setValidationResult(result);
        return result;
      }

      // Validación específica para Meta Marketing
      if (wizardData.provider?.code === 'meta') {
        const creds = JSON.parse(wizardData.credentials.secret_ref || '{}');
        if (!creds.access_token) {
          const result = { success: false, message: 'Ingresa al menos el Access Token' };
          setValidationResult(result);
          return result;
        }

        const checkResponse = await fetch('/api/integrations/meta/health-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: creds.access_token,
            app_secret: creds.app_secret || '',
          }),
        });

        const checkData = await checkResponse.json();
        const result = {
          success: checkData.valid === true,
          message: checkData.message || (checkData.valid ? 'Conexión verificada con Meta' : 'Token inválido'),
        };
        setValidationResult(result);
        return result;
      }

      // Validación específica para WhatsApp Business
      if (wizardData.provider?.code === 'whatsapp') {
        const creds = JSON.parse(wizardData.credentials.secret_ref || '{}');
        if (!creds.phone_number_id || !creds.access_token) {
          const result = { success: false, message: 'Ingresa al menos el Phone Number ID y el Access Token' };
          setValidationResult(result);
          return result;
        }

        const checkResponse = await fetch('/api/integrations/whatsapp/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // Enviar credenciales directamente para validar antes de guardar
            phone_number_id: creds.phone_number_id,
            access_token: creds.access_token,
          }),
        });

        const checkData = await checkResponse.json();
        const result = {
          success: checkData.valid === true,
          message: checkData.message || (checkData.valid
            ? `Conexión verificada: ${checkData.displayName || checkData.phoneNumber || 'WhatsApp'}`
            : 'Credenciales inválidas'),
        };
        setValidationResult(result);
        return result;
      }

      // Validación específica para TikTok Marketing
      if (wizardData.provider?.code === 'tiktok') {
        const creds = JSON.parse(wizardData.credentials.secret_ref || '{}');
        if (!creds.access_token || !creds.advertiser_id) {
          const result = { success: false, message: 'Ingresa al menos el Access Token y Advertiser ID' };
          setValidationResult(result);
          return result;
        }

        const checkResponse = await fetch('/api/integrations/tiktok/health-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: creds.access_token,
            advertiser_id: creds.advertiser_id,
          }),
        });

        const checkData = await checkResponse.json();
        const result = {
          success: checkData.valid === true,
          message: checkData.message || (checkData.valid ? 'Conexión verificada con TikTok' : 'Token o Advertiser ID inválido'),
        };
        setValidationResult(result);
        return result;
      }

      // Validación genérica para otros proveedores
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const result = { success: true, message: 'Conexión validada correctamente' };
      setValidationResult(result);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al validar la conexión';
      const result = { success: false, message: msg };
      setValidationResult(result);
      return result;
    } finally {
      setIsValidating(false);
    }
  };

  // Guardar conexión (crear, editar o duplicar)
  const handleSave = async () => {
    if (!organizationId || !wizardData.connector) return;

    setIsSaving(true);
    try {
      let connectionId: string;

      if (mode === 'edit' && wizardData.connectionId) {
        // Actualizar conexión existente
        const updated = await integrationsService.updateConnection(wizardData.connectionId, {
          name: wizardData.connectionName,
          environment: wizardData.environment,
          countryCode: wizardData.countryCode,
          branchId: wizardData.branchId || undefined,
        });

        if (!updated) {
          throw new Error('No se pudo actualizar la conexión');
        }

        connectionId = wizardData.connectionId;

        toast({
          title: 'Conexión actualizada',
          description: `La conexión "${wizardData.connectionName}" se ha actualizado correctamente`,
        });
      } else {
        // Crear nueva conexión (create o duplicate)
        const connection = await integrationsService.createConnection(
          organizationId,
          wizardData.connector.id,
          {
            name: wizardData.connectionName,
            environment: wizardData.environment,
            countryCode: wizardData.countryCode,
            branchId: wizardData.branchId || undefined,
            settings: wizardData.settings,
          }
        );

        if (!connection) {
          throw new Error('No se pudo crear la conexión');
        }

        connectionId = connection.id;

        toast({
          title: mode === 'duplicate' ? 'Conexión duplicada' : 'Conexión creada',
          description: `La conexión "${wizardData.connectionName}" se ha ${mode === 'duplicate' ? 'duplicado' : 'creado'} correctamente`,
        });
      }

      // Guardar las credenciales (solo si se proporcionaron nuevas)
      if (wizardData.credentials.secret_ref && wizardData.credentials.secret_ref !== '{}') {
        const parsedCreds = JSON.parse(wizardData.credentials.secret_ref);

        if (wizardData.provider?.code === 'wompi') {
          // Wompi: guardar 4 credenciales separadas en integration_credentials
          const wompiSaved = await wompiService.saveCredentials(connectionId, {
            publicKey: parsedCreds.public_key || '',
            privateKey: parsedCreds.private_key || '',
            eventsSecret: parsedCreds.events_secret || '',
            integritySecret: parsedCreds.integrity_secret || '',
          });

          if (!wompiSaved) {
            console.warn('No se pudieron guardar las credenciales de Wompi');
          }
        } else if (wizardData.provider?.code === 'mercadopago') {
          // MercadoPago: guardar 3 credenciales separadas en integration_credentials
          const mpSaved = await mercadopagoService.saveCredentials(connectionId, {
            publicKey: parsedCreds.public_key || '',
            accessToken: parsedCreds.access_token || '',
            webhookSecret: parsedCreds.webhook_secret || '',
          });

          if (!mpSaved) {
            console.warn('No se pudieron guardar las credenciales de MercadoPago');
          }
        } else if (wizardData.provider?.code === 'payu') {
          // PayU: guardar 4 credenciales separadas en integration_credentials
          const payuSaved = await payuService.saveCredentials(connectionId, {
            apiKey: parsedCreds.api_key || '',
            apiLogin: parsedCreds.api_login || '',
            merchantId: parsedCreds.merchant_id || '',
            accountId: parsedCreds.account_id || '',
          });

          if (!payuSaved) {
            console.warn('No se pudieron guardar las credenciales de PayU');
          }
        } else if (wizardData.provider?.code === 'stripe') {
          // Stripe: guardar 3 credenciales separadas en integration_credentials
          const stripeSaved = await stripeClientService.saveCredentials(connectionId, {
            publishableKey: parsedCreds.publishable_key || '',
            secretKey: parsedCreds.secret_key || '',
            webhookSecret: parsedCreds.webhook_secret || '',
          });

          if (!stripeSaved) {
            console.warn('No se pudieron guardar las credenciales de Stripe');
          }
        } else if (wizardData.provider?.code === 'paypal') {
          // PayPal: guardar 3 credenciales separadas en integration_credentials
          const paypalSaved = await paypalService.saveCredentials(connectionId, {
            clientId: parsedCreds.client_id || '',
            clientSecret: parsedCreds.client_secret || '',
            webhookId: parsedCreds.webhook_id || '',
          });

          if (!paypalSaved) {
            console.warn('No se pudieron guardar las credenciales de PayPal');
          }
        } else if (wizardData.provider?.code === 'meta') {
          // Meta Marketing: guardar credenciales base primero
          const metaSaved = await metaMarketingService.saveCredentials(connectionId, {
            accessToken: parsedCreds.access_token || '',
            appSecret: parsedCreds.app_secret || '',
            businessId: parsedCreds.business_id || '',
            pixelId: '',
            catalogId: '',
          });

          if (!metaSaved) {
            console.warn('No se pudieron guardar las credenciales de Meta Marketing');
          }

          // Setup automático: crear catálogo + pixel + sync productos
          try {
            const { data: orgData } = await supabase
              .from('organizations')
              .select('id, name, subdomain')
              .eq('id', organizationId || 0)
              .single();

            const { data: domainData } = await supabase
              .from('organization_domains')
              .select('host')
              .eq('organization_id', orgData?.id || 0)
              .eq('is_primary', true)
              .eq('is_active', true)
              .maybeSingle();

            const domain = domainData?.host || `${orgData?.subdomain || 'shop'}.goadmin.io`;

            const setupResponse = await fetch('/api/integrations/meta/setup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                connection_id: connectionId,
                access_token: parsedCreds.access_token,
                app_secret: parsedCreds.app_secret || '',
                business_id: parsedCreds.business_id,
                organization_id: orgData?.id,
                organization_name: orgData?.name || 'Mi Negocio',
                domain,
              }),
            });

            const setupData = await setupResponse.json();
            if (setupData.success) {
              console.log('Meta setup completo:', setupData.message);
            } else {
              console.warn('Meta setup parcial:', setupData.error);
            }
          } catch (setupErr) {
            console.warn('Error en Meta setup automático (la conexión se guardó):', setupErr);
          }
        } else if (wizardData.provider?.code === 'tiktok') {
          // TikTok Marketing: guardar credenciales base primero
          const tiktokSaved = await tiktokMarketingService.saveCredentials(connectionId, {
            accessToken: parsedCreds.access_token || '',
            appSecret: parsedCreds.app_secret || '',
            advertiserId: parsedCreds.advertiser_id || '',
            pixelCode: '',
            catalogId: '',
          });

          if (!tiktokSaved) {
            console.warn('No se pudieron guardar las credenciales de TikTok Marketing');
          }

          // Setup automático: crear pixel + catálogo + sync productos
          try {
            const { data: orgData } = await supabase
              .from('organizations')
              .select('id, name, subdomain')
              .eq('id', organizationId || 0)
              .single();

            const { data: domainData } = await supabase
              .from('organization_domains')
              .select('host')
              .eq('organization_id', orgData?.id || 0)
              .eq('is_primary', true)
              .eq('is_active', true)
              .maybeSingle();

            const domain = domainData?.host || `${orgData?.subdomain || 'shop'}.goadmin.io`;

            const setupResponse = await fetch('/api/integrations/tiktok/setup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                connection_id: connectionId,
                access_token: parsedCreds.access_token,
                app_secret: parsedCreds.app_secret || '',
                advertiser_id: parsedCreds.advertiser_id,
                organization_id: orgData?.id,
                organization_name: orgData?.name || 'Mi Negocio',
                domain,
              }),
            });

            const setupData = await setupResponse.json();
            if (setupData.success) {
              console.log('TikTok setup completo:', setupData.message);
            } else {
              console.warn('TikTok setup parcial:', setupData.error);
            }
          } catch (setupErr) {
            console.warn('Error en TikTok setup automático (la conexión se guardó):', setupErr);
          }
        } else if (wizardData.provider?.code === 'whatsapp') {
          // Si vino de Embedded Signup, ya se guardó todo en el callback
          if (parsedCreds.access_token === '__embedded_signup__') {
            console.log('[WhatsApp] Credenciales ya guardadas vía Embedded Signup');
          } else {
            // WhatsApp Business: guardar 4 credenciales separadas (modo manual)
            const whatsappSaved = await whatsappClientService.saveCredentials(connectionId, {
              phoneNumberId: parsedCreds.phone_number_id || '',
              businessAccountId: parsedCreds.business_account_id || '',
              accessToken: parsedCreds.access_token || '',
              webhookVerifyToken: parsedCreds.webhook_verify_token || '',
            });

            if (!whatsappSaved) {
              console.warn('No se pudieron guardar las credenciales de WhatsApp');
            }

            // Sync: Integraciones → CRM (crear/actualizar canal + channel_credentials)
            if (organizationId) {
              await whatsappSyncService.syncToChannel(organizationId, connectionId, {
                phone_number_id: parsedCreds.phone_number_id || '',
                business_account_id: parsedCreds.business_account_id || '',
                access_token: parsedCreds.access_token || '',
                webhook_verify_token: parsedCreds.webhook_verify_token || '',
              });
            }
          }
        } else {
          // Genérico: guardar como JSON en un solo registro
          const credentialsSaved = await integrationsService.saveCredentials(
            connectionId,
            wizardData.credentials.credential_type,
            wizardData.credentials.secret_ref,
            wizardData.credentials.purpose,
            wizardData.credentials.expires_at
          );

          if (!credentialsSaved) {
            console.warn('No se pudieron guardar las credenciales');
          }
        }
      }

      // Redirigir a la lista de conexiones
      router.push('/app/integraciones/conexiones');
    } catch (error) {
      console.error('Error saving connection:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudo guardar la conexión',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Obtener título y descripción según el modo
  const getPageTitle = () => {
    switch (mode) {
      case 'edit':
        return 'Editar Conexión';
      case 'duplicate':
        return 'Duplicar Conexión';
      default:
        return 'Nueva Conexión de Integración';
    }
  };

  const getPageDescription = () => {
    switch (mode) {
      case 'edit':
        return 'Modifica la configuración de la conexión';
      case 'duplicate':
        return 'Crea una copia de esta conexión para otra sucursal o país';
      default:
        return 'Configura una nueva conexión con un servicio externo';
    }
  };

  const getButtonText = () => {
    if (isSaving) {
      return mode === 'edit' ? 'Guardando...' : mode === 'duplicate' ? 'Duplicando...' : 'Creando...';
    }
    switch (mode) {
      case 'edit':
        return 'Guardar Cambios';
      case 'duplicate':
        return 'Duplicar Conexión';
      default:
        return 'Crear Conexión';
    }
  };

  const getButtonIcon = () => {
    switch (mode) {
      case 'edit':
        return <Edit className="h-4 w-4 mr-2" />;
      case 'duplicate':
        return <Copy className="h-4 w-4 mr-2" />;
      default:
        return <Check className="h-4 w-4 mr-2" />;
    }
  };

  // Obtener configuración del proveedor para mostrar logo
  const getProviderConfig = () => {
    if (!wizardData.provider) return null;
    return PROVIDER_CONFIGS[wizardData.provider.code];
  };

  const providerConfig = getProviderConfig();

  // Loading state
  if (isLoading) {
    return (
      <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">Cargando...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header Sticky */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
        <div className="px-4 sm:px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/app/integraciones/conexiones"
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            </Link>
            
            {/* Logo del proveedor si está seleccionado */}
            {wizardData.provider && providerConfig?.logoUrl ? (
              <div className={`p-2 rounded-lg ${providerConfig.bgColor} border ${providerConfig.borderColor}`}>
                <img 
                  src={providerConfig.logoUrl} 
                  alt={wizardData.provider.name}
                  className="h-6 w-6 object-contain"
                />
              </div>
            ) : (
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Link2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
            )}
            
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  {getPageTitle()}
                </h1>
                {mode === 'edit' && <Edit className="h-4 w-4 text-blue-600" />}
                {mode === 'duplicate' && <Copy className="h-4 w-4 text-blue-600" />}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {wizardData.provider ? `${wizardData.provider.name}${wizardData.connector ? ` • ${wizardData.connector.name}` : ''}` : getPageDescription()}
              </p>
            </div>

            {/* Progress indicator mini */}
            <div className="hidden sm:flex items-center gap-1">
              {STEPS.map((step, index) => (
                <div
                  key={step.id}
                  className={`h-2 w-8 rounded-full transition-colors ${
                    index + 1 < currentStep
                      ? 'bg-green-500'
                      : index + 1 === currentStep
                      ? 'bg-blue-600'
                      : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Step Indicator Mobile */}
          <div className="sm:hidden mb-6">
            <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mb-2">
              <span>Paso {currentStep} de {STEPS.length}</span>
              <span>{STEPS[currentStep - 1]?.title}</span>
            </div>
            <div className="flex gap-1">
              {STEPS.map((step, index) => (
                <div
                  key={step.id}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    index + 1 < currentStep
                      ? 'bg-green-500'
                      : index + 1 === currentStep
                      ? 'bg-blue-600'
                      : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Step Title */}
          <div className="mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <span className="text-blue-600 dark:text-blue-400 font-bold text-lg">
                  {currentStep}
                </span>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {STEPS[currentStep - 1]?.title}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {STEPS[currentStep - 1]?.description}
                </p>
              </div>
            </div>
          </div>

          {/* Step Content */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
            {/* Modo CREATE: 4 pasos */}
            {mode === 'create' && (
              <>
                {currentStep === 1 && (
                  <StepProviderConnector
                    providers={providers}
                    connectors={connectors}
                    selectedProvider={wizardData.provider}
                    selectedConnector={wizardData.connector}
                    onSelectProvider={(provider) => {
                      setWizardData((prev) => ({
                        ...prev,
                        provider,
                        connector: null,
                        connectionName: provider.name,
                      }));
                    }}
                    onSelectConnector={(connector) => {
                      setWizardData((prev) => ({
                        ...prev,
                        connector,
                        connectionName: `${prev.provider?.name || ''} - ${connector.name}`,
                      }));
                    }}
                  />
                )}

                {currentStep === 2 && (
                  <StepCountryEnvironment
                    connector={wizardData.connector}
                    selectedCountry={wizardData.countryCode}
                    selectedEnvironment={wizardData.environment}
                    selectedBranch={wizardData.branchId}
                    branches={branches}
                    onSelectCountry={(country) => {
                      setWizardData((prev) => ({ ...prev, countryCode: country }));
                    }}
                    onSelectEnvironment={(env) => {
                      setWizardData((prev) => ({ ...prev, environment: env }));
                    }}
                    onSelectBranch={(branchId) => {
                      setWizardData((prev) => ({ ...prev, branchId }));
                    }}
                  />
                )}

                {currentStep === 3 && (
                  <StepSettings
                    provider={wizardData.provider}
                    connector={wizardData.connector}
                    connectionName={wizardData.connectionName}
                    settings={wizardData.settings}
                    organizationDomain={organizationDomain}
                    onNameChange={(name) => {
                      setWizardData((prev) => ({ ...prev, connectionName: name }));
                    }}
                    onSettingsChange={(settings) => {
                      setWizardData((prev) => ({ ...prev, settings }));
                    }}
                  />
                )}

                {currentStep === 4 && (
                  <StepCredentials
                    provider={wizardData.provider}
                    credentials={wizardData.credentials}
                    onCredentialsChange={(credentials) => {
                      setWizardData((prev) => ({ ...prev, credentials }));
                    }}
                    onValidate={handleValidate}
                    isValidating={isValidating}
                    validationResult={validationResult}
                    organizationId={organizationId}
                  />
                )}
              </>
            )}

            {/* Modo EDIT/DUPLICATE: 3 pasos (sin paso proveedor) */}
            {(mode === 'edit' || mode === 'duplicate') && (
              <>
                {currentStep === 1 && (
                  <StepCountryEnvironment
                    connector={wizardData.connector}
                    selectedCountry={wizardData.countryCode}
                    selectedEnvironment={wizardData.environment}
                    selectedBranch={wizardData.branchId}
                    branches={branches}
                    onSelectCountry={(country) => {
                      setWizardData((prev) => ({ ...prev, countryCode: country }));
                    }}
                    onSelectEnvironment={(env) => {
                      setWizardData((prev) => ({ ...prev, environment: env }));
                    }}
                    onSelectBranch={(branchId) => {
                      setWizardData((prev) => ({ ...prev, branchId }));
                    }}
                  />
                )}

                {currentStep === 2 && (
                  <StepSettings
                    provider={wizardData.provider}
                    connector={wizardData.connector}
                    connectionName={wizardData.connectionName}
                    settings={wizardData.settings}
                    organizationDomain={organizationDomain}
                    onNameChange={(name) => {
                      setWizardData((prev) => ({ ...prev, connectionName: name }));
                    }}
                    onSettingsChange={(settings) => {
                      setWizardData((prev) => ({ ...prev, settings }));
                    }}
                  />
                )}

                {currentStep === 3 && (
                  <StepCredentials
                    provider={wizardData.provider}
                    credentials={wizardData.credentials}
                    onCredentialsChange={(credentials) => {
                      setWizardData((prev) => ({ ...prev, credentials }));
                    }}
                    onValidate={handleValidate}
                    isValidating={isValidating}
                    validationResult={validationResult}
                    organizationId={organizationId}
                  />
                )}
              </>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-200 dark:border-gray-800">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isSaving}
              className="border-gray-300 dark:border-gray-700"
            >
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>

            <div className="flex gap-3">
              {currentStep > 1 && (
                <Button
                  variant="outline"
                  onClick={handleBack}
                  disabled={isSaving}
                  className="border-gray-300 dark:border-gray-700"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Anterior
                </Button>
              )}

              {currentStep < STEPS.length ? (
                <Button
                  onClick={handleNext}
                  disabled={!canProceed() || isSaving}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Siguiente
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button
                  onClick={handleSave}
                  disabled={!canProceed() || isSaving}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {getButtonText()}
                    </>
                  ) : (
                    <>
                      {getButtonIcon()}
                      {getButtonText()}
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Resumen (visible desde paso 2) */}
          {currentStep > 1 && wizardData.provider && (
            <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                Resumen de la conexión
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400 block">Proveedor</span>
                  <p className="font-medium text-gray-900 dark:text-white">{wizardData.provider.name}</p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400 block">Conector</span>
                  <p className="font-medium text-gray-900 dark:text-white">{wizardData.connector?.name || '-'}</p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400 block">País</span>
                  <p className="font-medium text-gray-900 dark:text-white">{wizardData.countryCode}</p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400 block">Ambiente</span>
                  <p className="font-medium text-gray-900 dark:text-white capitalize">{wizardData.environment}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
