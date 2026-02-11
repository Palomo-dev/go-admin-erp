'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Eye, EyeOff, Save, CheckCircle, XCircle, Loader2, ExternalLink, AlertTriangle } from 'lucide-react';
import type { WhatsAppCredentials } from '@/lib/services/whatsappChannelService';

interface WhatsAppCredentialsCardProps {
  credentials: WhatsAppCredentials | null;
  onSave: (credentials: WhatsAppCredentials['credentials']) => Promise<void>;
  onValidate: () => Promise<void>;
  isSaving: boolean;
  isValidating: boolean;
  organizationId?: number;
  channelId?: string;
  onEmbeddedSignupComplete?: () => void;
}

export default function WhatsAppCredentialsCard({
  credentials,
  onSave,
  onValidate,
  isSaving,
  isValidating,
  organizationId,
  channelId,
  onEmbeddedSignupComplete,
}: WhatsAppCredentialsCardProps) {
  const [showTokens, setShowTokens] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectSuccess, setConnectSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    phone_number_id: credentials?.credentials?.phone_number_id || '',
    access_token: credentials?.credentials?.access_token || '',
    webhook_verify_token: credentials?.credentials?.webhook_verify_token || '',
    business_account_id: credentials?.credentials?.business_account_id || ''
  });

  const handleSave = async () => {
    await onSave(formData);
  };

  const handleEmbeddedSignup = () => {
    if (!organizationId) {
      setConnectError('No se pudo determinar la organización');
      return;
    }

    // Facebook requiere HTTPS para FB.login()
    if (typeof window !== 'undefined' && window.location.protocol !== 'https:') {
      setConnectError(
        'La conexión automática solo funciona en HTTPS (producción). ' +
        'Usa el modo manual para ingresar las credenciales en este entorno.'
      );
      setShowManual(true);
      return;
    }

    setIsConnecting(true);
    setConnectError(null);

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
          // Script ya existe y FB está disponible pero no inicializado
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
              let phoneNumberId = '';
              let wabaId = '';

              const listener = (event: MessageEvent) => {
                if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') return;
                try {
                  const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                  if (data.type === 'WA_EMBEDDED_SIGNUP') {
                    phoneNumberId = data.data?.phone_number_id || '';
                    wabaId = data.data?.waba_id || '';
                  }
                } catch { /* ignore */ }
              };
              window.addEventListener('message', listener);

              setTimeout(async () => {
                window.removeEventListener('message', listener);
                try {
                  const res = await fetch('/api/integrations/whatsapp/oauth/callback', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      code,
                      phone_number_id: phoneNumberId,
                      waba_id: wabaId,
                      organization_id: organizationId,
                      channel_id: channelId,
                    }),
                  });
                  const result = await res.json();
                  if (result.success) {
                    setConnectSuccess(result.message || 'WhatsApp conectado exitosamente');
                    onEmbeddedSignupComplete?.();
                  } else {
                    setConnectError(result.error || 'Error conectando WhatsApp');
                  }
                } catch (err) {
                  setConnectError(err instanceof Error ? err.message : 'Error en el callback');
                } finally {
                  setIsConnecting(false);
                }
              }, 2000);
            } else {
              setConnectError('Autorización cancelada por el usuario');
              setIsConnecting(false);
            }
          },
          {
            config_id: configId,
            response_type: 'code',
            override_default_response_type: true,
            extras: { setup: {}, featureType: '', sessionInfoVersion: 2 },
          }
        );
      })
      .catch((err) => {
        setConnectError(err instanceof Error ? err.message : 'Error cargando SDK');
        setIsConnecting(false);
      });
  };

  const hasCredentials = !!(credentials?.credentials?.phone_number_id);

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg text-gray-900 dark:text-white">
              Credenciales de WhatsApp Business API
            </CardTitle>
            <CardDescription className="text-gray-500 dark:text-gray-400">
              Configura las credenciales de tu cuenta de WhatsApp Business
            </CardDescription>
          </div>
          {credentials && (
            <Badge className={credentials.is_valid 
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' 
              : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
            }>
              {credentials.is_valid ? (
                <><CheckCircle className="h-3 w-3 mr-1" /> Válido</>
              ) : (
                <><XCircle className="h-3 w-3 mr-1" /> Inválido</>
              )}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Embedded Signup - Solo si no hay credenciales o no está en modo manual */}
        {!hasCredentials && !showManual && !connectSuccess && (
          <div className="p-5 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl border border-green-200 dark:border-green-800 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-full bg-[#25D366] flex items-center justify-center">
              <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            </div>
            <h4 className="font-semibold text-gray-900 dark:text-white">Conexión Automática</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Conecta con un clic. Se obtendrán las credenciales y webhook automáticamente.
            </p>
            <Button
              className="bg-[#25D366] hover:bg-[#1DA851] text-white font-semibold px-6"
              onClick={handleEmbeddedSignup}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Conectando...</>
              ) : (
                <><ExternalLink className="h-4 w-4 mr-2" /> Conectar con WhatsApp</>
              )}
            </Button>
            <button
              type="button"
              onClick={() => setShowManual(true)}
              className="block mx-auto text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline"
            >
              Ingresar credenciales manualmente
            </button>
          </div>
        )}

        {/* Éxito de Embedded Signup */}
        {connectSuccess && (
          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 text-center">
            <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
            <p className="font-medium text-green-800 dark:text-green-300">{connectSuccess}</p>
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">Credenciales y webhook configurados automáticamente.</p>
          </div>
        )}

        {/* Error */}
        {connectError && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
            <span className="text-sm text-red-700 dark:text-red-400">{connectError}</span>
          </div>
        )}

        {/* Volver a automático desde modo manual */}
        {!hasCredentials && showManual && (
          <button
            type="button"
            onClick={() => setShowManual(false)}
            className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 underline"
          >
            ← Volver a conexión automática
          </button>
        )}

        {/* Campos manuales (si ya hay credenciales o modo manual activo) */}
        {(hasCredentials || showManual) && !connectSuccess && (<>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="phone_number_id">Phone Number ID</Label>
            <Input
              id="phone_number_id"
              value={formData.phone_number_id}
              onChange={(e) => setFormData({ ...formData, phone_number_id: e.target.value })}
              placeholder="Ej: 123456789012345"
              className="bg-gray-50 dark:bg-gray-900"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="business_account_id">Business Account ID</Label>
            <Input
              id="business_account_id"
              value={formData.business_account_id}
              onChange={(e) => setFormData({ ...formData, business_account_id: e.target.value })}
              placeholder="Ej: 123456789012345"
              className="bg-gray-50 dark:bg-gray-900"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="access_token">Access Token</Label>
          <div className="relative">
            <Input
              id="access_token"
              type={showTokens ? 'text' : 'password'}
              value={formData.access_token}
              onChange={(e) => setFormData({ ...formData, access_token: e.target.value })}
              placeholder="Token de acceso permanente"
              className="bg-gray-50 dark:bg-gray-900 pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full"
              onClick={() => setShowTokens(!showTokens)}
            >
              {showTokens ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="webhook_verify_token">Webhook Verify Token</Label>
          <Input
            id="webhook_verify_token"
            value={formData.webhook_verify_token}
            onChange={(e) => setFormData({ ...formData, webhook_verify_token: e.target.value })}
            placeholder="Token personalizado para verificar webhook"
            className="bg-gray-50 dark:bg-gray-900"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Este token se usará para verificar las solicitudes de webhook de Meta
          </p>
        </div>

        <div className="flex items-center gap-2 pt-4">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSaving ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Guardando...</>
            ) : (
              <><Save className="h-4 w-4 mr-2" /> Guardar Credenciales</>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={onValidate}
            disabled={isValidating || !credentials}
          >
            {isValidating ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Validando...</>
            ) : (
              <><CheckCircle className="h-4 w-4 mr-2" /> Verificar Conexión</>
            )}
          </Button>
        </div>
        </>)}
      </CardContent>
    </Card>
  );
}
