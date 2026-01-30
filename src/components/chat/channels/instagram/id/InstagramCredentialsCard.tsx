'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Eye, EyeOff, Save, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import type { InstagramCredentials } from '@/lib/services/instagramChannelService';

interface InstagramCredentialsCardProps {
  credentials: InstagramCredentials | null;
  onSave: (credentials: InstagramCredentials['credentials']) => Promise<void>;
  onValidate: () => Promise<void>;
  isSaving: boolean;
  isValidating: boolean;
}

export default function InstagramCredentialsCard({
  credentials,
  onSave,
  onValidate,
  isSaving,
  isValidating
}: InstagramCredentialsCardProps) {
  const [showTokens, setShowTokens] = useState(false);
  const [formData, setFormData] = useState({
    instagram_business_account_id: credentials?.credentials?.instagram_business_account_id || '',
    page_id: credentials?.credentials?.page_id || '',
    access_token: credentials?.credentials?.access_token || '',
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
              Credenciales de Instagram Messaging API
            </CardTitle>
            <CardDescription className="text-gray-500 dark:text-gray-400">
              Configura las credenciales de tu cuenta de Instagram Business
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
            <Label htmlFor="instagram_business_account_id">Instagram Business Account ID</Label>
            <Input
              id="instagram_business_account_id"
              value={formData.instagram_business_account_id}
              onChange={(e) => setFormData({ ...formData, instagram_business_account_id: e.target.value })}
              placeholder="Ej: 17841400000000000"
              className="bg-gray-50 dark:bg-gray-900"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="page_id">Facebook Page ID (vinculada)</Label>
            <Input
              id="page_id"
              value={formData.page_id}
              onChange={(e) => setFormData({ ...formData, page_id: e.target.value })}
              placeholder="Ej: 123456789012345"
              className="bg-gray-50 dark:bg-gray-900"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

          <div className="space-y-2">
            <Label htmlFor="app_secret">App Secret</Label>
            <div className="relative">
              <Input
                id="app_secret"
                type={showTokens ? 'text' : 'password'}
                value={formData.app_secret}
                onChange={(e) => setFormData({ ...formData, app_secret: e.target.value })}
                placeholder="Secret de la aplicación"
                className="bg-gray-50 dark:bg-gray-900 pr-10"
              />
            </div>
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
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
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
