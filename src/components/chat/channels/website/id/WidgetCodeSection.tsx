'use client';

import React, { useState } from 'react';
import { Copy, Check, Code, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ChatChannel } from '@/lib/services/chatChannelsService';

interface WidgetCodeSectionProps {
  channel: ChatChannel;
  onRotateKey: () => Promise<void>;
  isRotating: boolean;
}

export default function WidgetCodeSection({
  channel,
  onRotateKey,
  isRotating
}: WidgetCodeSectionProps) {
  const [copied, setCopied] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jgmgphmzusbluqhuqihj.supabase.co';
  const widgetUrl = `${supabaseUrl}/functions/v1/chat-widget`;

  const widgetCode = `<!-- GO Chat Widget -->
<script src="${widgetUrl}"></script>
<script>goChat('init', '${channel.public_key}');</script>
<!-- End GO Chat Widget -->`;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(widgetCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Error copiando código:', error);
    }
  };

  const handleCopyKey = async () => {
    try {
      await navigator.clipboard.writeText(channel.public_key || '');
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } catch (error) {
      console.error('Error copiando clave:', error);
    }
  };

  return (
    <Card className="dark:bg-gray-800 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Code className="h-5 w-5 text-blue-600" />
          Código de Instalación
        </CardTitle>
        <CardDescription>
          Copia este código y pégalo antes de &lt;/body&gt; en tu sitio web
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Widget Code */}
        <div className="relative">
          <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg text-xs overflow-x-auto max-h-48">
            <code>{widgetCode}</code>
          </pre>
          <Button
            size="sm"
            variant="secondary"
            className="absolute top-2 right-2"
            onClick={handleCopyCode}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-1 text-green-500" />
                Copiado
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-1" />
                Copiar
              </>
            )}
          </Button>
        </div>

        {/* Public Key */}
        <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <div>
            <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
              Clave Pública
            </p>
            <code className="text-xs bg-blue-100 dark:bg-blue-800 px-2 py-1 rounded font-mono">
              {channel.public_key}
            </code>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleCopyKey}>
              {copiedKey ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" disabled={isRotating}>
                  {isRotating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                    ¿Rotar clave pública?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Al rotar la clave pública, deberás actualizar el código del widget en todos los sitios donde esté instalado. 
                    Las sesiones existentes dejarán de funcionar hasta que actualices el código.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={onRotateKey}>
                    Sí, rotar clave
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Instructions */}
        <div className="text-sm text-gray-600 dark:text-gray-400">
          <p className="font-medium mb-2">Instrucciones:</p>
          <ol className="list-decimal list-inside space-y-1 text-xs">
            <li>Copia el código del widget</li>
            <li>Abre el archivo HTML de tu sitio web</li>
            <li>Pega el código justo antes de &lt;/body&gt;</li>
            <li>Guarda y sube los cambios a tu servidor</li>
            <li>El widget aparecerá en la esquina configurada</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
