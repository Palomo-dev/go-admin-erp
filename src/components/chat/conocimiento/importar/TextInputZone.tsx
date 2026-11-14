'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { AlignLeft, SeparatorHorizontal } from 'lucide-react';

interface TextInputZoneProps {
  textContent: string;
  separator: string;
  onTextChange: (text: string) => void;
  onSeparatorChange: (separator: string) => void;
}

export default function TextInputZone({
  textContent,
  separator,
  onTextChange,
  onSeparatorChange
}: TextInputZoneProps) {
  const t = useTranslations('chatDialogos.importar');
  return (
    <Card className="border-line bg-surface">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium text-fg flex items-center gap-2">
          <AlignLeft aria-hidden="true" className="h-4 w-4 text-brand" />
          {t('textoTitulo')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="import-text">{t('pegaAqui')}</Label>
            <span className="text-xs text-fg-muted">
              {t('caracteres', { n: textContent.length })}
            </span>
          </div>
          <Textarea
            id="import-text"
            value={textContent}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder={t('ejemploTexto')}
            rows={12}
            className="font-mono text-sm resize-none"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="import-separator" className="flex items-center gap-2">
            <SeparatorHorizontal aria-hidden="true" className="h-4 w-4" />
            {t('separador')}
          </Label>
          <Input
            id="import-separator"
            value={separator}
            onChange={(e) => onSeparatorChange(e.target.value)}
            placeholder="---"
            aria-describedby="import-separator-ayuda"
            className="max-w-[200px]"
          />
          <p id="import-separator-ayuda" className="text-xs text-fg-muted">
            {t('separadorAyuda', { separador: '---' })}
          </p>
        </div>

        <div className="rounded-lg bg-subtle p-4">
          <p className="mb-2 text-sm font-medium text-fg">{t('formatoTexto')}</p>
          <code className="block whitespace-pre-wrap rounded bg-surface p-2 text-xs text-fg-secondary">
            {t('ejemploTexto')}
          </code>
        </div>
      </CardContent>
    </Card>
  );
}
