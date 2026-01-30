'use client';

import React, { useState } from 'react';
import { Copy, Check, Code, Key, FileCode, CheckCircle2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChatChannel } from '@/lib/services/chatChannelsService';

interface WidgetCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: ChatChannel | null;
}

export default function WidgetCodeDialog({
  open,
  onOpenChange,
  channel
}: WidgetCodeDialogProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  if (!channel) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jgmgphmzusbluqhuqihj.supabase.co';
  const widgetUrl = `${supabaseUrl}/functions/v1/chat-widget`;

  const widgetCode = `<!-- GO Chat Widget -->
<script src="${widgetUrl}"></script>
<script>goChat('init', '${channel.public_key}');</script>
<!-- End GO Chat Widget -->`;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(widgetCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
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

  const steps = [
    { step: 1, text: 'Copia el código del widget usando el botón de arriba' },
    { step: 2, text: 'Abre el archivo HTML principal de tu sitio web' },
    { step: 3, text: 'Pega el código justo antes de la etiqueta </body>' },
    { step: 4, text: 'Guarda los cambios y súbelos a tu servidor' },
    { step: 5, text: '¡Listo! El widget aparecerá en la esquina inferior derecha' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-4 border-b border-gray-200 dark:border-gray-700">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Code className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            Instalar Widget de Chat
          </DialogTitle>
          <DialogDescription className="text-base mt-2">
            Sigue estos pasos para agregar el widget de chat a tu sitio web
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          <Tabs defaultValue="code" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="code" className="gap-2">
                <FileCode className="h-4 w-4" />
                Código
              </TabsTrigger>
              <TabsTrigger value="instructions" className="gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Instrucciones
              </TabsTrigger>
            </TabsList>

            <TabsContent value="code" className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Código del Widget
                  </label>
                  <Button
                    size="sm"
                    variant={copiedCode ? "default" : "outline"}
                    className={`gap-2 ${copiedCode ? 'bg-green-600 hover:bg-green-700' : ''}`}
                    onClick={handleCopyCode}
                  >
                    {copiedCode ? (
                      <>
                        <Check className="h-4 w-4" />
                        ¡Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copiar código
                      </>
                    )}
                  </Button>
                </div>
                <div className="relative rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                  <pre className="p-4 bg-gray-900 text-gray-100 text-sm overflow-x-auto max-h-48">
                    <code className="language-html whitespace-pre">{widgetCode}</code>
                  </pre>
                </div>
              </div>

              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                      Clave Pública del Canal
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                    onClick={handleCopyKey}
                  >
                    {copiedKey ? (
                      <>
                        <Check className="h-3 w-3 mr-1" />
                        Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3 mr-1" />
                        Copiar
                      </>
                    )}
                  </Button>
                </div>
                <code className="block text-sm font-mono bg-white dark:bg-gray-800 px-3 py-2 rounded border border-blue-200 dark:border-blue-700 text-gray-800 dark:text-gray-200">
                  {channel.public_key}
                </code>
              </div>
            </TabsContent>

            <TabsContent value="instructions" className="space-y-4">
              <div className="space-y-3">
                {steps.map(({ step, text }) => (
                  <div 
                    key={step}
                    className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                  >
                    <div className="flex-shrink-0 w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                      {step}
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 pt-1">
                      {text}
                    </p>
                  </div>
                ))}
              </div>

              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>Nota:</strong> El widget solo funcionará en los dominios que hayas configurado como permitidos en la configuración del canal.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="pt-4 border-t border-gray-200 dark:border-gray-700 flex-row gap-2 sm:gap-2">
          <Button 
            variant="outline" 
            className="flex-1 sm:flex-none"
            onClick={() => onOpenChange(false)}
          >
            Cerrar
          </Button>
          <Button 
            className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 text-white gap-2"
            onClick={handleCopyCode}
          >
            {copiedCode ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copiedCode ? '¡Copiado!' : 'Copiar código'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
