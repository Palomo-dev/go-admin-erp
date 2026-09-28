'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Send, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface SendSupportDocumentButtonProps {
  organizationId: number;
  supportDocumentId: string;
  onSent?: () => void;
}

/**
 * Botón que envía un documento soporte a Factus/DIAN
 * Reutiliza el endpoint POST /api/factus/support-document
 */
export function SendSupportDocumentButton({
  organizationId,
  supportDocumentId,
  onSent,
}: SendSupportDocumentButtonProps) {
  const { toast } = useToast();
  const t = useTranslations('documentosSoporte.enviar');
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    if (!organizationId || !supportDocumentId) return;

    setIsSending(true);
    try {
      const res = await fetch('/api/factus/support-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          supportDocumentId,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || t('errorEnvio'));
      }

      const isValidated = result.data?.is_validated;
      toast({
        title: isValidated ? t('validado') : t('enviado'),
        description: t('referencia', { referencia: result.data?.reference_code || supportDocumentId.substring(0, 8) }),
      });

      if (onSent) onSent();
    } catch (error: unknown) {
      console.error('Error enviando documento soporte:', error);
      toast({
        title: t('errorTitulo'),
        description: (error instanceof Error && error.message) || t('errorDescripcion'),
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Button
      onClick={handleSend}
      disabled={isSending}
      className="bg-purple-600 hover:bg-purple-700"
    >
      {isSending ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <Send className="h-4 w-4 mr-2" />
      )}
      {t('boton')}
    </Button>
  );
}

export default SendSupportDocumentButton;

