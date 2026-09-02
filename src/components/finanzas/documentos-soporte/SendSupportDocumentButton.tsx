'use client';

import React, { useState } from 'react';
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
        throw new Error(result.error || 'Error enviando documento a Factus');
      }

      const isValidated = result.data?.is_validated;
      toast({
        title: isValidated ? 'Documento validado por DIAN' : 'Documento enviado a DIAN',
        description: `Ref: ${result.data?.reference_code || supportDocumentId.substring(0, 8)}`,
      });

      if (onSent) onSent();
    } catch (error: any) {
      console.error('Error enviando documento soporte:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo enviar el documento a DIAN',
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
      Enviar a DIAN
    </Button>
  );
}

export default SendSupportDocumentButton;

