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
      const [providersData, connectorsData, branchesData] = await Promise.all([
        integrationsService.getProviders(),
        integrationsService.getConnectors(),
        integrationsService.getBranches(organizationId),
      ]);

      setProviders(providersData);
      setConnectors(connectorsData);
      setBranches(branchesData);

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
      // Simular validación - en producción llamaría al servicio externo
      await new Promise((resolve) => setTimeout(resolve, 1500));
      
      const result = { success: true, message: 'Conexión validada correctamente' };
      setValidationResult(result);
      return result;
    } catch {
      const result = { success: false, message: 'Error al validar la conexión' };
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
