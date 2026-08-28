'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Building2,
  CheckCircle,
  XCircle,
  AlertCircle,
  ExternalLink,
  Shield,
  RefreshCw,
  Key,
  Webhook,
} from 'lucide-react';

// ============================================================
// Pagina de onboarding y produccion para integraciones QR.
// Muestra el estado de cada proveedor, checklist de onboarding,
// estado de rotacion de credenciales y salud de webhooks.
// ============================================================

/** Configuracion de cada proveedor QR. */
interface ProviderConfig {
  code: string;
  name: string;
  description: string;
  portalUrl: string;
  portalLabel: string;
  icon: typeof Building2;
}

/** Pasos del checklist de onboarding. */
const ONBOARDING_STEPS: Array<{ key: string; label: string }> = [
  { key: 'register', label: 'Registrar cuenta con proveedor' },
  { key: 'kyc', label: 'Completar KYC' },
  { key: 'sandbox_creds', label: 'Obtener credenciales sandbox' },
  { key: 'health_check', label: 'Probar health-check' },
  { key: 'qr_test', label: 'Probar generacion de QR' },
  { key: 'webhook_test', label: 'Probar webhook' },
  { key: 'prod_creds', label: 'Obtener credenciales produccion' },
  { key: 'webhook_url', label: 'Configurar URL de webhook' },
  { key: 'go_live', label: 'Go-live' },
];

/** Proveedores QR soportados. */
const PROVIDERS: ProviderConfig[] = [
  {
    code: 'wompi',
    name: 'Wompi (Bancolombia QR)',
    description: 'Pasarela de pagos de Bancolombia con soporte QR.',
    portalUrl: 'https://dashboard.wompi.co/',
    portalLabel: 'Dashboard Wompi',
    icon: Building2,
  },
  {
    code: 'bancolombia',
    name: 'Bancolombia (ruta directa)',
    description: 'Integracion directa con API de Bancolombia. Requiere firma del Reglamento de APIs y proceso comercial.',
    portalUrl: 'https://developer.bancolombia.com/',
    portalLabel: 'Portal Developers Bancolombia',
    icon: Building2,
  },
  {
    code: 'breb',
    name: 'Bre-B / Mono',
    description: 'Transferencias P2P via Bre-B integrado con Mono. OAuth.',
    portalUrl: 'https://breb.app/',
    portalLabel: 'Portal Bre-B',
    icon: Building2,
  },
  {
    code: 'redeban',
    name: 'Redeban',
    description: 'QR dinamico via Redeban. Contactar integraciones@redeban.com.',
    portalUrl: 'https://www.redeban.com.co/',
    portalLabel: 'Sitio Redeban',
    icon: Building2,
  },
];

/** Estado de salud de webhook de un proveedor. */
interface WebhookHealth {
  provider: string;
  label: string;
  hasActiveConnections: boolean;
  activeConnectionsCount: number;
  hasWebhookSecret: boolean;
  lastEventAt: string | null;
  lastEventType: string | null;
  webhookUrl: string;
}

/** Estado de rotacion de una credencial. */
interface CredentialExpiry {
  connectionId: string;
  provider: string;
  connectionName: string;
  environment: string;
  createdAt: string;
  ageDays: number;
  daysUntilRotation: number;
  needsRotation: boolean;
  rotationDueDate: string;
  severity: 'high' | 'medium' | 'none';
}

/** Alerta de rotacion. */
interface RotationAlertData {
  provider: string;
  severity: 'high' | 'medium';
  message: string;
}

/** Resumen de rotacion. */
interface RotationSummary {
  total: number;
  needsRotation: number;
  upcoming: number;
  healthy: number;
}

/** Estado de conexion por proveedor (desde webhook-health). */
type ProviderStatus = 'connected' | 'not_connected' | 'error';

/**
 * Determina el estado de un proveedor a partir de su salud de webhook.
 */
function getProviderStatus(health: WebhookHealth | undefined): ProviderStatus {
  if (!health) {
    return 'not_connected';
  }
  if (health.hasActiveConnections) {
    return 'connected';
  }
  return 'not_connected';
}

/**
 * Formatea una fecha ISO a formato legible en español.
 */
function formatDate(iso: string | null): string {
  if (!iso) return 'Sin eventos';
  try {
    return new Date(iso).toLocaleString('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export default function OnboardingPage() {
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [webhookHealth, setWebhookHealth] = useState<WebhookHealth[]>([]);
  const [credentialExpiry, setCredentialExpiry] = useState<CredentialExpiry[]>([]);
  const [rotationAlerts, setRotationAlerts] = useState<RotationAlertData[]>([]);
  const [rotationSummary, setRotationSummary] = useState<RotationSummary | null>(null);
  const [isLoadingHealth, setIsLoadingHealth] = useState(true);
  const [isLoadingRotation, setIsLoadingRotation] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Cargar salud de webhooks
  const loadWebhookHealth = useCallback(async () => {
    setIsLoadingHealth(true);
    try {
      const res = await fetch('/api/integrations/webhook-health');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json() as { providers: WebhookHealth[] };
      setWebhookHealth(data.providers ?? []);
    } catch (err) {
      console.error('[Onboarding] Error cargando salud de webhooks:', err);
      setWebhookHealth([]);
    } finally {
      setIsLoadingHealth(false);
    }
  }, []);

  // Cargar estado de rotacion de credenciales
  const loadCredentialRotation = useCallback(async () => {
    if (!organizationId) return;
    setIsLoadingRotation(true);
    try {
      const res = await fetch(
        `/api/integrations/credential-rotation?organizationId=${organizationId}`,
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json() as {
        credentials: CredentialExpiry[];
        alerts: RotationAlertData[];
        summary: RotationSummary;
      };
      setCredentialExpiry(data.credentials ?? []);
      setRotationAlerts(data.alerts ?? []);
      setRotationSummary(data.summary ?? null);
    } catch (err) {
      console.error('[Onboarding] Error cargando rotacion de credenciales:', err);
      setCredentialExpiry([]);
      setRotationAlerts([]);
      setRotationSummary(null);
    } finally {
      setIsLoadingRotation(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadWebhookHealth();
  }, [loadWebhookHealth]);

  useEffect(() => {
    loadCredentialRotation();
  }, [loadCredentialRotation]);

  // Refrescar ambos
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadWebhookHealth(), loadCredentialRotation()]);
    setIsRefreshing(false);
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Onboarding y Produccion
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configuracion y puesta en marcha de integraciones QR de pagos
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Seccion de alertas de rotacion */}
      {rotationAlerts.length > 0 && (
        <div className="space-y-3">
          {rotationAlerts.map((alert, idx) => (
            <Alert
              key={`${alert.provider}-${idx}`}
              variant={alert.severity === 'high' ? 'destructive' : 'warning'}
            >
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>
                {alert.severity === 'high'
                  ? 'Rotacion requerida'
                  : 'Rotacion proxima'}
              </AlertTitle>
              <AlertDescription>{alert.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Seccion de proveedores */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Proveedores QR
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PROVIDERS.map((provider) => {
            const health = webhookHealth.find((h) => h.provider === provider.code);
            const status = getProviderStatus(health);

            return (
              <ProviderCard
                key={provider.code}
                provider={provider}
                status={status}
                health={health}
                isLoading={isLoadingHealth}
              />
            );
          })}
        </div>
      </div>

      {/* Seccion de seguridad: rotacion de credenciales */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-5 w-5 text-gray-700 dark:text-gray-300" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Seguridad: Rotacion de credenciales
          </h2>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Estado de rotacion</CardTitle>
            <CardDescription>
              Bancolombia requiere rotacion cada 6 meses. Demas proveedores cada 12 meses.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingRotation ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : credentialExpiry.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No hay credenciales QR configuradas para esta organizacion.
              </p>
            ) : (
              <div className="space-y-4">
                {/* Resumen */}
                {rotationSummary && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <SummaryStat
                      label="Total"
                      value={rotationSummary.total}
                      variant="default"
                    />
                    <SummaryStat
                      label="Requieren rotacion"
                      value={rotationSummary.needsRotation}
                      variant={rotationSummary.needsRotation > 0 ? 'destructive' : 'success'}
                    />
                    <SummaryStat
                      label="Proximas"
                      value={rotationSummary.upcoming}
                      variant={rotationSummary.upcoming > 0 ? 'warning' : 'success'}
                    />
                    <SummaryStat
                      label="Saludables"
                      value={rotationSummary.healthy}
                      variant="success"
                    />
                  </div>
                )}

                {/* Lista de credenciales */}
                <div className="space-y-3">
                  {credentialExpiry.map((cred) => (
                    <CredentialRotationRow key={cred.connectionId} cred={cred} />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Seccion de webhooks */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Webhook className="h-5 w-5 text-gray-700 dark:text-gray-300" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Webhooks
          </h2>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Estado de webhooks por proveedor</CardTitle>
            <CardDescription>
              URLs publicas, configuracion de secretos y ultimo evento recibido.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingHealth ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : (
              <div className="space-y-3">
                {webhookHealth.map((health) => (
                  <WebhookHealthRow key={health.provider} health={health} />
                ))}
                {webhookHealth.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No hay informacion de webhooks disponible.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================
// Subcomponente: Card de proveedor con checklist de onboarding
// ============================================================

interface ProviderCardProps {
  provider: ProviderConfig;
  status: ProviderStatus;
  health: WebhookHealth | undefined;
  isLoading: boolean;
}

function ProviderCard({ provider, status, health, isLoading }: ProviderCardProps) {
  const Icon = provider.icon;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700">
              <Icon className="h-6 w-6 text-gray-700 dark:text-gray-300" />
            </div>
            <div>
              <CardTitle className="text-base">{provider.name}</CardTitle>
              <CardDescription className="text-xs mt-1">
                {provider.description}
              </CardDescription>
            </div>
          </div>
          {isLoading ? (
            <Skeleton className="h-6 w-24" />
          ) : (
            <StatusBadge status={status} />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Ambiente */}
        {health && health.hasActiveConnections && (
          <div className="flex items-center gap-2">
            <Badge variant="info">
              {health.activeConnectionsCount} conexion(es) activa(s)
            </Badge>
          </div>
        )}

        {/* Checklist de onboarding */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
            Pasos de onboarding
          </p>
          {ONBOARDING_STEPS.map((step) => (
            <div key={step.key} className="flex items-center space-x-2">
              <Checkbox id={`${provider.code}-${step.key}`} />
              <label
                htmlFor={`${provider.code}-${step.key}`}
                className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
              >
                {step.label}
              </label>
            </div>
          ))}
        </div>

        {/* URL del webhook */}
        {health && (
          <div className="rounded-md bg-gray-50 dark:bg-gray-900 p-3">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
              URL del webhook
            </p>
            <code className="text-xs text-blue-600 dark:text-blue-400 break-all">
              {health.webhookUrl}
            </code>
          </div>
        )}

        {/* Acciones */}
        <div className="flex items-center gap-2 pt-2">
          <a href={provider.portalUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4 mr-2" />
              {provider.portalLabel}
            </Button>
          </a>
          <Link href="/app/integraciones/conexiones/nueva">
            <Button variant="default" size="sm">
              Configurar conexion
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Subcomponente: Badge de estado del proveedor
// ============================================================

function StatusBadge({ status }: { status: ProviderStatus }) {
  if (status === 'connected') {
    return (
      <Badge variant="success" className="flex items-center gap-1">
        <CheckCircle className="h-3 w-3" />
        Conectado
      </Badge>
    );
  }
  if (status === 'error') {
    return (
      <Badge variant="destructive" className="flex items-center gap-1">
        <XCircle className="h-3 w-3" />
        Error
      </Badge>
    );
  }
  return (
    <Badge variant="warning" className="flex items-center gap-1">
      <AlertCircle className="h-3 w-3" />
      No conectado
    </Badge>
  );
}

// ============================================================
// Subcomponente: Estadistica de resumen de rotacion
// ============================================================

interface SummaryStatProps {
  label: string;
  value: number;
  variant: 'default' | 'destructive' | 'warning' | 'success';
}

function SummaryStat({ label, value, variant }: SummaryStatProps) {
  return (
    <div className="rounded-lg border p-3 dark:border-gray-700">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {value}
        </span>
        <Badge variant={variant}>{value > 0 ? 'Atencion' : 'OK'}</Badge>
      </div>
    </div>
  );
}

// ============================================================
// Subcomponente: Fila de credencial con barra de progreso
// ============================================================

function CredentialRotationRow({ cred }: { cred: CredentialExpiry }) {
  // Calcular progreso: 0% = recien creada, 100% = vencida
  const rotationDays = cred.provider === 'bancolombia_qr' || cred.provider === 'bancolombia'
    ? 180
    : 365;
  const progress = Math.min(100, Math.round((cred.ageDays / rotationDays) * 100));

  const providerLabel = cred.provider === 'bancolombia_qr'
    ? 'Bancolombia'
    : cred.provider === 'wompi_co'
      ? 'Wompi'
      : cred.provider === 'breb_mono'
        ? 'Bre-B (Mono)'
        : cred.provider === 'redeban_qr'
          ? 'Redeban'
          : cred.provider;

  return (
    <div className="rounded-lg border p-4 dark:border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {providerLabel}
          </span>
          <Badge variant="outline" className="text-xs">
            {cred.environment}
          </Badge>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {cred.connectionName}
          </span>
        </div>
        {cred.severity === 'high' && (
          <Badge variant="destructive">Rotacion requerida</Badge>
        )}
        {cred.severity === 'medium' && (
          <Badge variant="warning">Proxima a rotar</Badge>
        )}
        {cred.severity === 'none' && (
          <Badge variant="success">Saludable</Badge>
        )}
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>Antiguedad: {cred.ageDays} dias</span>
          <span>
            {cred.daysUntilRotation > 0
              ? `Rotacion en ${cred.daysUntilRotation} dias`
              : `Vencida hace ${Math.abs(cred.daysUntilRotation)} dias`}
          </span>
        </div>
        <Progress
          value={progress}
          indicatorClassName={
            cred.severity === 'high'
              ? 'bg-red-500'
              : cred.severity === 'medium'
                ? 'bg-yellow-500'
                : 'bg-green-500'
          }
        />
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Fecha limite: {formatDate(cred.rotationDueDate)}
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Subcomponente: Fila de salud de webhook
// ============================================================

function WebhookHealthRow({ health }: { health: WebhookHealth }) {
  return (
    <div className="rounded-lg border p-4 dark:border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Webhook className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {health.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {health.hasActiveConnections ? (
            <Badge variant="success">Conectado</Badge>
          ) : (
            <Badge variant="warning">Sin conexiones</Badge>
          )}
          {health.hasWebhookSecret ? (
            <Badge variant="info">Secreto configurado</Badge>
          ) : (
            <Badge variant="outline">Sin secreto</Badge>
          )}
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500 dark:text-gray-400">URL publica:</span>
          <code className="text-blue-600 dark:text-blue-400 break-all text-right">
            {health.webhookUrl}
          </code>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500 dark:text-gray-400">Ultimo evento:</span>
          <span className="text-gray-700 dark:text-gray-300">
            {health.lastEventType ?? 'Ninguno'} - {formatDate(health.lastEventAt)}
          </span>
        </div>
      </div>
    </div>
  );
}
