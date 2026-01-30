'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, ExternalLink, Webhook } from 'lucide-react';
import { useState } from 'react';
import type { FacebookCredentials } from '@/lib/services/facebookChannelService';

interface FacebookWebhookCardProps {
  channelId: string;
  credentials: FacebookCredentials | null;
}

export default function FacebookWebhookCard({ channelId, credentials }: FacebookWebhookCardProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const webhookUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/api/webhooks/facebook/${channelId}`
    : `/api/webhooks/facebook/${channelId}`;

  const handleCopy = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Webhook className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <CardTitle className="text-lg text-gray-900 dark:text-white">
            Configuración de Webhook
          </CardTitle>
        </div>
        <CardDescription className="text-gray-500 dark:text-gray-400">
          Configura estos valores en tu cuenta de Meta Business Suite para Facebook Messenger
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>URL del Webhook</Label>
          <div className="flex gap-2">
            <Input
              value={webhookUrl}
              readOnly
              className="bg-gray-50 dark:bg-gray-900 font-mono text-sm"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleCopy(webhookUrl, 'url')}
            >
              {copiedField === 'url' ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Verify Token</Label>
          <div className="flex gap-2">
            <Input
              value={credentials?.credentials?.webhook_verify_token || 'No configurado'}
              readOnly
              className="bg-gray-50 dark:bg-gray-900 font-mono text-sm"
            />
            {credentials?.credentials?.webhook_verify_token && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleCopy(credentials.credentials.webhook_verify_token!, 'token')}
              >
                {copiedField === 'token' ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>

        <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
            Campos de Suscripción Requeridos
          </h4>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-blue-300 text-blue-700 dark:border-blue-600 dark:text-blue-300">
              messages
            </Badge>
            <Badge variant="outline" className="border-blue-300 text-blue-700 dark:border-blue-600 dark:text-blue-300">
              messaging_postbacks
            </Badge>
            <Badge variant="outline" className="border-blue-300 text-blue-700 dark:border-blue-600 dark:text-blue-300">
              message_deliveries
            </Badge>
            <Badge variant="outline" className="border-blue-300 text-blue-700 dark:border-blue-600 dark:text-blue-300">
              message_reads
            </Badge>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => window.open('https://developers.facebook.com/apps', '_blank')}
        >
          <ExternalLink className="h-4 w-4" />
          Abrir Meta Business Suite
        </Button>
      </CardContent>
    </Card>
  );
}
