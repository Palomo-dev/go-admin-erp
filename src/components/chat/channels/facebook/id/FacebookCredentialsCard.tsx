'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Eye, EyeOff, Save, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import type { FacebookCredentials } from '@/lib/services/facebookChannelService';

interface FacebookCredentialsCardProps {
  credentials: FacebookCredentials | null;
  onSave: (credentials: FacebookCredentials['credentials']) => Promise<void>;
  onValidate: () => Promise<void>;
  isSaving: boolean;
  isValidating: boolean;
}

export default function FacebookCredentialsCard({
  credentials,
  onSave,
  onValidate,
  isSaving,
  isValidating
}: FacebookCredentialsCardProps) {
  const [showTokens, setShowTokens] = useState(false);
  const [formData, setFormData] = useState({
    page_id: credentials?.credentials?.page_id || '',
    page_access_token: credentials?.credentials?.page_access_token || '',
    app_id: credentials?.credentials?.app_id || '',
    app_secret: credentials?.credentials?.app_secret || '',
    webhook_verify_token: credentials?.credentials?.webhook_verify_token || ''
  });

  const handleSave = async () => {
    await onSave(formData);
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg text-gray-900 dark:text-white">
              Credenciales de Facebook Messenger API
            </CardTitle>
            <CardDescription className="text-gray-500 dark:text-gray-400">
              Configura las credenciales de tu página de Facebook
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="page_id">Page ID</Label>
            <Input
              id="page_id"
              value={formData.page_id}
              onChange={(e) => setFormData({ ...formData, page_id: e.target.value })}
              placeholder="Ej: 123456789012345"
              className="bg-gray-50 dark:bg-gray-900"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="app_id">App ID</Label>
            <Input
              id="app_id"
              value={formData.app_id}
              onChange={(e) => setFormData({ ...formData, app_id: e.target.value })}
              placeholder="ID de la aplicación de Meta"
              className="bg-gray-50 dark:bg-gray-900"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="page_access_token">Page Access Token</Label>
          <div className="relative">
            <Input
              id="page_access_token"
              type={showTokens ? 'text' : 'password'}
              value={formData.page_access_token}
              onChange={(e) => setFormData({ ...formData, page_access_token: e.target.value })}
              placeholder="Token de acceso de página"
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
          <Label htmlFor="app_secret">App Secret</Label>
          <Input
            id="app_secret"
            type={showTokens ? 'text' : 'password'}
            value={formData.app_secret}
            onChange={(e) => setFormData({ ...formData, app_secret: e.target.value })}
            placeholder="Secret de la aplicación"
            className="bg-gray-50 dark:bg-gray-900"
          />
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
      </CardContent>
    </Card>
  );
}
