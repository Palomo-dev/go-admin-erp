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
}

const AUTH_TYPE_CONFIG: Record<string, {
  label: string;
  fields: Array<{ key: string; label: string; placeholder: string; type: string }>;
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
}: StepCredentialsProps) {
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const authType = provider?.auth_type || 'api_key';
  const authConfig = AUTH_TYPE_CONFIG[authType] || AUTH_TYPE_CONFIG.api_key;

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
            Datos de Acceso
          </h4>

          {authConfig.fields.map((field) => (
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
            </div>
          ))}

          {/* Propósito de la credencial */}
          <div className="space-y-2">
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
          </div>

          {/* Expiración */}
          <div className="space-y-2">
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
          </div>
        </CardContent>
      </Card>

      {/* Validación */}
      <Card>
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
      </Card>

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
