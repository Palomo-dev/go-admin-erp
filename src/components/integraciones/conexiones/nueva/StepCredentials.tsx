'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Key,
  Shield,
  Eye,
  EyeOff,
  ExternalLink,
  AlertTriangle,
  Info,
  Lock,
  Calendar,
  CheckCircle,
} from 'lucide-react';
import { IntegrationProvider } from '@/lib/services/integrationsService';
import { cn } from '@/lib/utils';

interface StepCredentialsProps {
  provider: IntegrationProvider | null;
  credentials: {
    credential_type: string;
    secret_ref: string;
    purpose: 'primary' | 'backup' | 'rotation' | 'legacy';
    expires_at?: string;
  };
  onCredentialsChange: (credentials: {
    credential_type: string;
    secret_ref: string;
    purpose: 'primary' | 'backup' | 'rotation' | 'legacy';
    expires_at?: string;
  }) => void;
  onValidate: () => Promise<{ success: boolean; message: string }>;
  isValidating: boolean;
  validationResult: { success: boolean; message: string } | null;
  organizationId?: number;
}

const AUTH_TYPE_CONFIG: Record<string, {
  label: string;
  fields: Array<{ key: string; label: string; placeholder: string; type: string; hint?: string }>;
  description: string;
}> = {
  api_key: {
    label: 'API Key',
    description: 'Autenticación mediante clave de API',
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'pk_live_...', type: 'password' },
      { key: 'api_secret', label: 'API Secret (opcional)', placeholder: 'sk_live_...', type: 'password' },
    ],
  },
  oauth2: {
    label: 'OAuth 2.0',
    description: 'Autenticación mediante flujo OAuth',
    fields: [
      { key: 'client_id', label: 'Client ID', placeholder: 'client_id_...', type: 'text' },
      { key: 'client_secret', label: 'Client Secret', placeholder: 'client_secret_...', type: 'password' },
    ],
  },
  basic: {
    label: 'Basic Auth',
    description: 'Autenticación básica con usuario y contraseña',
    fields: [
      { key: 'username', label: 'Usuario', placeholder: 'usuario', type: 'text' },
      { key: 'password', label: 'Contraseña', placeholder: '••••••••', type: 'password' },
    ],
  },
};

// Sobreescritura de campos para proveedores específicos
const PROVIDER_CREDENTIAL_OVERRIDES: Record<string, {
  label: string;
  description: string;
  fields: Array<{ key: string; label: string; placeholder: string; type: string; hint?: string }>;
  helpUrl?: string;
  helpText?: string;
  oauthProvider?: 'facebook' | 'tiktok';
  embeddedSignup?: 'whatsapp';
}> = {
  wompi: {
    label: 'Wompi Colombia',
    description: 'Se requieren 4 llaves que puedes obtener en el dashboard de Wompi',
    helpUrl: 'https://comercios.wompi.co',
    helpText: 'Obtén tus llaves en Comercios Wompi → Desarrolladores → Llaves de API',
    fields: [
      {
        key: 'public_key',
        label: 'Llave Pública',
        placeholder: 'pub_test_... o pub_prod_...',
        type: 'password',
        hint: 'Usada en frontend para tokenizar tarjetas y obtener tokens de aceptación',
      },
      {
        key: 'private_key',
        label: 'Llave Privada',
        placeholder: 'prv_test_... o prv_prod_...',
        type: 'password',
        hint: 'Usada en backend para crear y consultar transacciones',
      },
      {
        key: 'events_secret',
        label: 'Secreto de Eventos',
        placeholder: 'test_events_... o prod_events_...',
        type: 'password',
        hint: 'Para verificar la autenticidad de los webhooks',
      },
      {
        key: 'integrity_secret',
        label: 'Secreto de Integridad',
        placeholder: 'test_integrity_... o prod_integrity_...',
        type: 'password',
        hint: 'Para generar la firma SHA256 de cada transacción',
      },
    ],
  },
  mercadopago: {
    label: 'MercadoPago',
    description: 'Se requieren 3 llaves que puedes obtener en el panel de Tus Integraciones',
    helpUrl: 'https://www.mercadopago.com.co/developers/panel/app',
    helpText: 'Obtén tus llaves en Tus Integraciones → Aplicación → Credenciales',
    fields: [
      {
        key: 'public_key',
        label: 'Public Key',
        placeholder: 'TEST-xxxx... o APP_USR-xxxx...',
        type: 'password',
        hint: 'Usada en frontend para inicializar MercadoPago.js (CardForm)',
      },
      {
        key: 'access_token',
        label: 'Access Token',
        placeholder: 'TEST-xxxx... o APP_USR-xxxx...',
        type: 'password',
        hint: 'Usada en backend para crear pagos y consultar transacciones',
      },
      {
        key: 'webhook_secret',
        label: 'Secreto de Webhook',
        placeholder: 'Clave secreta de la sección Webhooks',
        type: 'password',
        hint: 'Para verificar la autenticidad de las notificaciones (x-signature)',
      },
    ],
  },
  payu: {
    label: 'PayU Latam',
    description: 'Se requieren 4 credenciales que puedes obtener en el panel de PayU',
    helpUrl: 'https://merchants.payulatam.com/',
    helpText: 'Obtén tus llaves en Panel PayU → Configuración → Configuración técnica',
    fields: [
      {
        key: 'api_key',
        label: 'API Key',
        placeholder: 'Ej: 4Vj8eK4rloUd272L48hsrarnUA',
        type: 'password',
        hint: 'Clave secreta del comercio (NUNCA exponer en frontend)',
      },
      {
        key: 'api_login',
        label: 'API Login',
        placeholder: 'Ej: pRRXKOl8ikMmt9u',
        type: 'password',
        hint: 'Usuario de API para autenticación en cada petición',
      },
      {
        key: 'merchant_id',
        label: 'Merchant ID',
        placeholder: 'Ej: 508029',
        type: 'text',
        hint: 'ID numérico del comercio en PayU',
      },
      {
        key: 'account_id',
        label: 'Account ID (Colombia)',
        placeholder: 'Ej: 512321',
        type: 'text',
        hint: 'ID de la cuenta asociada al país (Colombia)',
      },
    ],
  },
  stripe: {
    label: 'Stripe',
    description: 'Se requieren 3 llaves que puedes obtener en el Dashboard de Stripe',
    helpUrl: 'https://dashboard.stripe.com/apikeys',
    helpText: 'Obtén tus llaves en Dashboard → Developers → API keys',
    fields: [
      {
        key: 'publishable_key',
        label: 'Publishable Key',
        placeholder: 'pk_test_... o pk_live_...',
        type: 'text',
        hint: 'Llave pública para Stripe.js / Elements en el frontend',
      },
      {
        key: 'secret_key',
        label: 'Secret Key',
        placeholder: 'sk_test_... o sk_live_...',
        type: 'password',
        hint: 'Llave secreta para el backend (NUNCA exponer en frontend)',
      },
      {
        key: 'webhook_secret',
        label: 'Webhook Signing Secret',
        placeholder: 'whsec_...',
        type: 'password',
        hint: 'Para verificar la autenticidad de los webhooks de Stripe',
      },
    ],
  },
  paypal: {
    label: 'PayPal',
    description: 'Se requieren 3 credenciales que puedes obtener en el Dashboard de PayPal Developer',
    helpUrl: 'https://developer.paypal.com/dashboard/applications',
    helpText: 'Obtén tus llaves en Dashboard → Apps & Credentials → Tu App REST',
    fields: [
      {
        key: 'client_id',
        label: 'Client ID',
        placeholder: 'AeJIB...',
        type: 'text',
        hint: 'ID público de la app REST (para JS SDK en frontend)',
      },
      {
        key: 'client_secret',
        label: 'Client Secret',
        placeholder: 'EKj...',
        type: 'password',
        hint: 'Secreto de la app REST (NUNCA exponer en frontend)',
      },
      {
        key: 'webhook_id',
        label: 'Webhook ID',
        placeholder: 'WH-xxx...',
        type: 'text',
        hint: 'ID del webhook configurado en la app (para verificar eventos)',
      },
    ],
  },
  meta: {
    label: 'Meta Marketing (Facebook/Instagram)',
    description: 'Conecta tu cuenta de Facebook Business con un clic. GO Admin creará el catálogo y pixel automáticamente.',
    helpUrl: 'https://business.facebook.com/settings/',
    helpText: 'Haz clic en "Conectar con Facebook" para autorizar GO Admin. No necesitas copiar ninguna credencial manualmente.',
    oauthProvider: 'facebook',
    fields: [],
  },
  tiktok: {
    label: 'TikTok Marketing',
    description: 'Conecta tu cuenta de TikTok Ads con un clic. GO Admin creará el pixel y catálogo automáticamente.',
    helpUrl: 'https://ads.tiktok.com/',
    helpText: 'Haz clic en "Conectar con TikTok" para autorizar GO Admin. No necesitas copiar ninguna credencial manualmente.',
    oauthProvider: 'tiktok',
    fields: [],
  },
  whatsapp: {
    label: 'WhatsApp Cloud API',
    description: 'Conecta tu WhatsApp Business con un clic, o ingresa las credenciales manualmente.',
    helpUrl: 'https://developers.facebook.com/apps',
    helpText: 'Usa Embedded Signup para conectar automáticamente, o ingresa las credenciales de forma manual si ya tienes un System User Token.',
    embeddedSignup: 'whatsapp',
    fields: [
      {
        key: 'phone_number_id',
        label: 'Phone Number ID',
        placeholder: 'Ej: 123456789012345',
        type: 'text',
        hint: 'ID del número de teléfono en WhatsApp Cloud API (Meta Business → WhatsApp → API Setup)',
      },
      {
        key: 'business_account_id',
        label: 'Business Account ID (WABA ID)',
        placeholder: 'Ej: 123456789012345',
        type: 'text',
        hint: 'ID de tu WhatsApp Business Account (Meta Business → WhatsApp → Account Overview)',
      },
      {
        key: 'access_token',
        label: 'Access Token (System User)',
        placeholder: 'Token permanente del System User...',
        type: 'password',
        hint: 'Token permanente generado desde Business Settings → System Users. NO usar Temporary Token.',
      },
      {
        key: 'webhook_verify_token',
        label: 'Webhook Verify Token',
        placeholder: 'Un string aleatorio seguro...',
        type: 'text',
        hint: 'Token personalizado para verificar el webhook. Usa el mismo valor que configuraste en Meta.',
      },
    ],
  },
};

const PURPOSE_OPTIONS = [
  { value: 'primary', label: 'Principal', description: 'Credencial principal activa' },
  { value: 'backup', label: 'Respaldo', description: 'Credencial de respaldo' },
  { value: 'rotation', label: 'Rotación', description: 'Pendiente de rotación' },
  { value: 'legacy', label: 'Legacy', description: 'Credencial antigua (a retirar)' },
];

export function StepCredentials({
  provider,
  credentials,
  onCredentialsChange,
  onValidate,
  isValidating,
  validationResult,
  organizationId,
}: StepCredentialsProps) {
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [isOAuthLoading, setIsOAuthLoading] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);

  const authType = provider?.auth_type || 'api_key';
  const providerOverride = provider?.code ? PROVIDER_CREDENTIAL_OVERRIDES[provider.code] : undefined;
  const authConfig = providerOverride || AUTH_TYPE_CONFIG[authType] || AUTH_TYPE_CONFIG.api_key;

  const toggleShowSecret = (key: string) => {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleFieldChange = (key: string, value: string) => {
    // Construir la referencia del secreto (en producción, esto iría a un vault)
    const currentRef = credentials.secret_ref ? JSON.parse(credentials.secret_ref) : {};
    const newRef = { ...currentRef, [key]: value };
    
    onCredentialsChange({
      ...credentials,
      secret_ref: JSON.stringify(newRef),
    });
  };

  const getFieldValue = (key: string): string => {
    try {
      const parsed = JSON.parse(credentials.secret_ref || '{}');
      return parsed[key] || '';
    } catch {
      return '';
    }
  };

  // Iniciar flujo OAuth (Facebook o TikTok)
  const handleOAuthConnect = async () => {
    if (!organizationId) {
      setOauthError('No se pudo determinar la organización');
      return;
    }
    const oauthType = providerOverride?.oauthProvider;
    if (!oauthType) return;

    // Seleccionar API route según el provider OAuth
    const apiRoute = oauthType === 'facebook'
      ? '/api/integrations/meta/oauth/authorize'
      : '/api/integrations/tiktok/oauth/authorize';

    setIsOAuthLoading(true);
    setOauthError(null);
    try {
      const res = await fetch(apiRoute, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: organizationId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setOauthError(data.error || 'No se pudo generar la URL de autorización');
      }
    } catch (err) {
      setOauthError(err instanceof Error ? err.message : 'Error al conectar');
    } finally {
      setIsOAuthLoading(false);
    }
  };

  const isOAuthProvider = !!providerOverride?.oauthProvider;
  const isEmbeddedSignup = !!providerOverride?.embeddedSignup;
  const [showManualFields, setShowManualFields] = useState(false);
  const [embeddedSignupSuccess, setEmbeddedSignupSuccess] = useState<string | null>(null);

  // Handler para WhatsApp Embedded Signup (Facebook JS SDK)
  const handleWhatsAppEmbeddedSignup = () => {
    if (!organizationId) {
      setOauthError('No se pudo determinar la organización');
      return;
    }

    // Facebook requiere HTTPS para FB.login()
    if (typeof window !== 'undefined' && window.location.protocol !== 'https:') {
      setOauthError(
        'La conexión automática solo funciona en HTTPS (producción). ' +
        'Usa el modo manual para ingresar las credenciales en este entorno.'
      );
      setShowManualFields(true);
      return;
    }

    setIsOAuthLoading(true);
    setOauthError(null);

    const appId = process.env.NEXT_PUBLIC_META_APP_ID || '';
    const configId = process.env.NEXT_PUBLIC_WHATSAPP_CONFIG_ID || '';

    // Cargar FB SDK usando fbAsyncInit (patrón oficial de Meta)
    const loadFBSDK = (): Promise<void> => {
      return new Promise((resolve, reject) => {
        // Si FB ya está inicializado, resolver directo
        if ((window as any).FB && (window as any).__fbInitDone) {
          resolve();
          return;
        }

        // Callback oficial que Meta ejecuta cuando el SDK está listo
        (window as any).fbAsyncInit = function () {
          (window as any).FB.init({
            appId,
            autoLogAppEvents: true,
            xfbml: false,
            version: 'v21.0',
          });
          (window as any).__fbInitDone = true;
          resolve();
        };

        // Solo agregar el script si no existe ya
        if (!document.getElementById('facebook-jssdk')) {
          const script = document.createElement('script');
          script.id = 'facebook-jssdk';
          script.src = 'https://connect.facebook.net/en_US/sdk.js';
          script.async = true;
          script.defer = true;
          script.crossOrigin = 'anonymous';
          script.onerror = () => reject(new Error('No se pudo cargar el SDK de Facebook'));
          document.body.appendChild(script);
        } else if ((window as any).FB) {
          // Script ya existe y FB disponible pero no inicializado
          (window as any).FB.init({
            appId,
            autoLogAppEvents: true,
            xfbml: false,
            version: 'v21.0',
          });
          (window as any).__fbInitDone = true;
          resolve();
        }
      });
    };

    loadFBSDK()
      .then(() => {
        (window as any).FB.login(
          (response: any) => {
            if (response.authResponse) {
              const code = response.authResponse.code;

              // Obtener phone_number_id y waba_id del sessionInfo
              let phoneNumberId = '';
              let wabaId = '';
              if (response.authResponse.grantedScopes) {
                // sessionInfo viene en el evento message del popup
              }

              // Escuchar el evento de sessionInfo
              const sessionInfoListener = (event: MessageEvent) => {
                if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') return;
                try {
                  const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                  if (data.type === 'WA_EMBEDDED_SIGNUP') {
                    phoneNumberId = data.data?.phone_number_id || '';
                    wabaId = data.data?.waba_id || '';
                  }
                } catch { /* ignore */ }
              };
              window.addEventListener('message', sessionInfoListener);

              // Dar un momento para que llegue el sessionInfo, luego enviar al callback
              setTimeout(async () => {
                window.removeEventListener('message', sessionInfoListener);

                try {
                  const res = await fetch('/api/integrations/whatsapp/oauth/callback', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      code,
                      phone_number_id: phoneNumberId,
                      waba_id: wabaId,
                      organization_id: organizationId,
                    }),
                  });
                  const result = await res.json();

                  if (result.success) {
                    setEmbeddedSignupSuccess(result.message || 'WhatsApp conectado exitosamente');
                    // Actualizar credenciales en el formulario para que handleSave las tenga
                    onCredentialsChange({
                      ...credentials,
                      secret_ref: JSON.stringify({
                        phone_number_id: phoneNumberId,
                        business_account_id: wabaId,
                        access_token: '__embedded_signup__',
                        webhook_verify_token: '__auto__',
                      }),
                    });
                  } else {
                    setOauthError(result.error || 'Error conectando WhatsApp');
                  }
                } catch (err) {
                  setOauthError(err instanceof Error ? err.message : 'Error en el callback');
                } finally {
                  setIsOAuthLoading(false);
                }
              }, 2000);
            } else {
              setOauthError('Autorización cancelada por el usuario');
              setIsOAuthLoading(false);
            }
          },
          {
            config_id: configId,
            response_type: 'code',
            override_default_response_type: true,
            extras: {
              setup: {},
              featureType: '',
              sessionInfoVersion: 2,
            },
          }
        );
      })
      .catch((err) => {
        setOauthError(err instanceof Error ? err.message : 'Error cargando SDK');
        setIsOAuthLoading(false);
      });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Key className="h-5 w-5 text-blue-600" />
          Credenciales de Acceso
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Configura las credenciales para conectar con {provider?.name || 'el proveedor'}
        </p>
      </div>

      {/* Aviso de seguridad */}
      <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-blue-900 dark:text-blue-100">
                Seguridad de credenciales
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Las credenciales se almacenan de forma segura y encriptada. 
                Nunca almacenamos tokens en texto plano.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tipo de autenticación */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white">
                Tipo de Autenticación
              </h4>
              <p className="text-sm text-gray-500">{authConfig.description}</p>
            </div>
            <Badge variant="outline" className="text-blue-600 border-blue-300">
              {authConfig.label}
            </Badge>
          </div>

          {/* OAuth2 - Botón de autorización */}
          {authType === 'oauth2' && (
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    Autorización OAuth
                  </p>
                  <p className="text-sm text-gray-500">
                    Conecta tu cuenta de {provider?.name} de forma segura
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    // En producción, esto abriría el flujo OAuth
                    window.open(provider?.website_url || '#', '_blank');
                  }}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Conectar con {provider?.name}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Campos de credenciales */}
      <Card>
        <CardContent className="p-4 space-y-6">
          <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <Lock className="h-4 w-4 text-gray-500" />
            {isOAuthProvider || isEmbeddedSignup ? 'Conexión Automática' : 'Datos de Acceso'}
          </h4>

          {/* OAuth: Botón de Conectar (Facebook o TikTok) */}
          {isOAuthProvider && (() => {
            const isFacebook = providerOverride?.oauthProvider === 'facebook';
            const brandColor = isFacebook ? '#0081FB' : '#000000';
            const brandHover = isFacebook ? '#0070E0' : '#333333';
            const brandName = isFacebook ? 'Facebook Business' : 'TikTok Ads';
            const buttonLabel = isFacebook ? 'Conectar con Facebook' : 'Conectar con TikTok';
            const stepTexts = isFacebook
              ? [
                  'Se abrirá Facebook para que autorices GO Admin',
                  'GO Admin obtendrá tu token y Business Manager automáticamente',
                  'Se creará un catálogo de productos y un pixel de conversión',
                  'Todos tus productos activos se sincronizarán al catálogo',
                  'Volverás aquí con todo configurado',
                ]
              : [
                  'Se abrirá TikTok Business para que autorices GO Admin',
                  'GO Admin obtendrá tu token y cuenta de anuncios automáticamente',
                  'Se creará un catálogo de productos y un pixel de TikTok',
                  'Todos tus productos activos se sincronizarán al catálogo',
                  'Volverás aquí con todo configurado',
                ];

            return (
            <div className="space-y-4">
              <div className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border border-blue-200 dark:border-blue-800 text-center">
                <div className="mb-4">
                  <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: brandColor }}>
                    {isFacebook ? (
                      <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                    ) : (
                      <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.86a8.28 8.28 0 004.76 1.5v-3.4a4.85 4.85 0 01-1-.27z"/></svg>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                    Conectar con {brandName}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 max-w-sm mx-auto">
                    Haz clic para autorizar GO Admin. Se creará el catálogo de productos y pixel de conversión automáticamente.
                  </p>
                </div>

                <Button
                  size="lg"
                  className="text-white font-semibold px-8"
                  style={{ backgroundColor: brandColor }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = brandHover)}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = brandColor)}
                  onClick={handleOAuthConnect}
                  disabled={isOAuthLoading}
                >
                  {isOAuthLoading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                      Conectando...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      {buttonLabel}
                    </>
                  )}
                </Button>

                <p className="text-xs text-gray-500 dark:text-gray-500 mt-3">
                  No necesitas copiar ninguna credencial. GO Admin obtiene todo automáticamente.
                </p>
              </div>

              {oauthError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                  <span className="text-sm text-red-700 dark:text-red-400">{oauthError}</span>
                </div>
              )}

              <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-sm text-gray-600 dark:text-gray-400">
                <p className="font-medium mb-1">¿Qué sucederá?</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  {stepTexts.map((text, i) => (
                    <li key={i}>{text}</li>
                  ))}
                </ol>
              </div>
            </div>
            );
          })()}

          {/* WhatsApp Embedded Signup */}
          {isEmbeddedSignup && !showManualFields && (
            <div className="space-y-4">
              {embeddedSignupSuccess ? (
                <div className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl border border-green-200 dark:border-green-800 text-center">
                  <div className="w-16 h-16 mx-auto rounded-full bg-green-500 flex items-center justify-center mb-3">
                    <CheckCircle className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">¡WhatsApp Conectado!</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{embeddedSignupSuccess}</p>
                  <p className="text-xs text-gray-500 mt-2">Las credenciales y el webhook se configuraron automáticamente.</p>
                </div>
              ) : (
                <div className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl border border-green-200 dark:border-green-800 text-center">
                  <div className="mb-4">
                    <div className="w-16 h-16 mx-auto rounded-full bg-[#25D366] flex items-center justify-center mb-3">
                      <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                      Conectar WhatsApp Business
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 max-w-sm mx-auto">
                      Conecta tu cuenta con un clic. GO Admin obtendrá las credenciales y configurará el webhook automáticamente.
                    </p>
                  </div>

                  <Button
                    size="lg"
                    className="text-white font-semibold px-8 bg-[#25D366] hover:bg-[#1DA851]"
                    onClick={handleWhatsAppEmbeddedSignup}
                    disabled={isOAuthLoading}
                  >
                    {isOAuthLoading ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                        Conectando...
                      </>
                    ) : (
                      <>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Conectar con WhatsApp
                      </>
                    )}
                  </Button>

                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-3">
                    Se abrirá una ventana de Facebook para autorizar tu cuenta de WhatsApp Business.
                  </p>
                </div>
              )}

              {oauthError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                  <span className="text-sm text-red-700 dark:text-red-400">{oauthError}</span>
                </div>
              )}

              <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-sm text-gray-600 dark:text-gray-400">
                <p className="font-medium mb-1">¿Qué sucederá?</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Se abrirá Facebook para que autorices tu WhatsApp Business</li>
                  <li>Seleccionarás o crearás tu WhatsApp Business Account</li>
                  <li>Seleccionarás o registrarás un número de teléfono</li>
                  <li>GO Admin obtendrá el token y credenciales automáticamente</li>
                  <li>El webhook se configurará de forma automática</li>
                </ol>
              </div>

              {/* Toggle para modo manual */}
              <button
                type="button"
                onClick={() => setShowManualFields(true)}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline"
              >
                ¿Prefieres ingresar las credenciales manualmente?
              </button>
            </div>
          )}

          {/* Banner modo manual para Embedded Signup */}
          {isEmbeddedSignup && showManualFields && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowManualFields(false)}
                className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 underline"
              >
                ← Volver a conexión automática
              </button>
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 text-sm">
                <p className="text-amber-800 dark:text-amber-300">
                  Modo manual: Ingresa las credenciales de tu System User Token. Ideal si ya tienes un token permanente configurado.
                </p>
              </div>
            </div>
          )}

          {/* Ayuda específica del proveedor (solo para NO-OAuth y NO-EmbeddedSignup) */}
          {!isOAuthProvider && !isEmbeddedSignup && providerOverride?.helpText && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="text-amber-800 dark:text-amber-300">{providerOverride.helpText}</p>
                  {providerOverride.helpUrl && (
                    <a
                      href={providerOverride.helpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-700 dark:text-amber-400 underline hover:no-underline mt-1 inline-flex items-center gap-1"
                    >
                      Ir al dashboard <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Campos manuales (para proveedores NO-OAuth, o Embedded Signup en modo manual) */}
          {(!isOAuthProvider || (isEmbeddedSignup && showManualFields)) && authConfig.fields.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={field.key}>{field.label}</Label>
              <div className="relative max-w-md">
                <Input
                  id={field.key}
                  type={field.type === 'password' && !showSecrets[field.key] ? 'password' : 'text'}
                  value={getFieldValue(field.key)}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="pr-10"
                />
                {field.type === 'password' && (
                  <button
                    type="button"
                    onClick={() => toggleShowSecret(field.key)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showSecrets[field.key] ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                )}
              </div>
              {field.hint && (
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md">{field.hint}</p>
              )}
            </div>
          ))}

          {/* Propósito de la credencial (solo NO-OAuth o manual) */}
          {(!isOAuthProvider || (isEmbeddedSignup && showManualFields)) && <div className="space-y-2">
            <Label htmlFor="purpose">Propósito</Label>
            <Select
              value={credentials.purpose}
              onValueChange={(value) => onCredentialsChange({
                ...credentials,
                purpose: value as 'primary' | 'backup' | 'rotation' | 'legacy',
              })}
            >
              <SelectTrigger className="max-w-md">
                <SelectValue placeholder="Selecciona el propósito" />
              </SelectTrigger>
              <SelectContent>
                {PURPOSE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div>
                      <span>{option.label}</span>
                      <span className="text-xs text-gray-500 ml-2">- {option.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>}

          {/* Expiración (solo NO-OAuth) */}
          {!isOAuthProvider && <div className="space-y-2">
            <Label htmlFor="expires_at" className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-500" />
              Fecha de expiración (opcional)
            </Label>
            <Input
              id="expires_at"
              type="date"
              value={credentials.expires_at || ''}
              onChange={(e) => onCredentialsChange({
                ...credentials,
                expires_at: e.target.value || undefined,
              })}
              className="max-w-md"
            />
            <p className="text-xs text-gray-500">
              Se notificará antes del vencimiento para renovar las credenciales
            </p>
          </div>}
        </CardContent>
      </Card>

      {/* Validación (solo NO-OAuth) */}
      {!isOAuthProvider && <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white">
                Validar Conexión
              </h4>
              <p className="text-sm text-gray-500">
                Verifica que las credenciales sean correctas antes de guardar
              </p>
            </div>
            <Button
              variant="outline"
              onClick={onValidate}
              disabled={isValidating || !getFieldValue(authConfig.fields[0].key)}
            >
              {isValidating ? 'Validando...' : 'Probar Conexión'}
            </Button>
          </div>

          {/* Resultado de validación */}
          {validationResult && (
            <div
              className={cn(
                'mt-4 p-3 rounded-lg flex items-center gap-2',
                validationResult.success
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
              )}
            >
              {validationResult.success ? (
                <Shield className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              <span>{validationResult.message}</span>
            </div>
          )}
        </CardContent>
      </Card>}

      {/* Documentación */}
      {provider?.docs_url && (
        <Card className="bg-gray-50 dark:bg-gray-800/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Info className="h-5 w-5 text-gray-500" />
              <div className="flex-1">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  ¿Necesitas ayuda para obtener las credenciales?
                </p>
              </div>
              <a
                href={provider.docs_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-sm flex items-center gap-1"
              >
                Ver documentación
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
