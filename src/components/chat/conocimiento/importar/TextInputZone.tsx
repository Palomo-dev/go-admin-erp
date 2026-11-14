'use client';

/**
 * «Pegar texto» de Importar fragmentos: el texto y el separador entre
 * fragmentos. Va dentro de la tarjeta «1. Archivo» de la página (sin tarjeta
 * propia, como la zona del CSV de Figma 94-chat-recuperado-ia-05).
 */
import { useTranslations } from 'next-intl';
import { FormField } from '@/components/kit';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';

interface TextInputZoneProps {
  textContent: string;
  separator: string;
  onTextChange: (text: string) => void;
  onSeparatorChange: (separator: string) => void;
}

export default function TextInputZone({ textContent, separator, onTextChange, onSeparatorChange }: TextInputZoneProps) {
  const t = useTranslations('chatDialogos.importar');
  return (
    <div className="flex flex-col gap-4">
      <FormField etiqueta={t('pegaAqui')} extra={<span className="text-xs text-fg-muted">{t('caracteres', { n: textContent.length })}</span>}>
        {(campo) => (
          <Textarea
            id={campo.id}
            value={textContent}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder={t('ejemploTexto')}
            rows={10}
            className="resize-y font-mono text-sm"
          />
        )}
      </FormField>
      <FormField etiqueta={t('separador')} ayuda={t('separadorAyuda', { separador: '---' })}>
        {(campo) => <Input id={campo.id} value={separator} onChange={(e) => onSeparatorChange(e.target.value)} placeholder="---" className="max-w-[200px]" />}
      </FormField>
    </div>
  );
}
