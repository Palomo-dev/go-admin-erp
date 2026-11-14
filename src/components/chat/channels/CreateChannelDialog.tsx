'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Globe,
  MessageCircle,
  Facebook,
  Instagram,
  Send,
  Mail,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChannelType, AIMode, CreateChannelData } from '@/lib/services/chatChannelsService';

const MODOS: AIMode[] = ['manual', 'hybrid', 'auto'];

interface CreateChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateChannelData) => Promise<void>;
  preselectedType?: ChannelType | null;
}

export default function CreateChannelDialog({
  open,
  onOpenChange,
  onSubmit,
  preselectedType
}: CreateChannelDialogProps) {
  const t = useTranslations('chatDialogos.nuevoCanal');
  const tc = useTranslations('chatModulo.canales');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<CreateChannelData>({
    type: preselectedType || 'website',
    name: '',
    ai_mode: 'hybrid'
  });

  const getDefaultName = React.useCallback((type: ChannelType): string => t(`nombresDefecto.${type}`), [t]);

  React.useEffect(() => {
    if (open && preselectedType) {
      setFormData({
        type: preselectedType,
        name: getDefaultName(preselectedType),
        ai_mode: 'hybrid'
      });
    } else if (open && !preselectedType) {
      setFormData({
        type: 'website',
        name: '',
        ai_mode: 'hybrid'
      });
    }
  }, [open, preselectedType, getDefaultName]);

  const channelTypes: { value: ChannelType; icon: React.ReactNode; available: boolean }[] = [
    { value: 'website', icon: <Globe className="h-4 w-4" />, available: true },
    { value: 'whatsapp', icon: <MessageCircle className="h-4 w-4" />, available: true },
    { value: 'facebook', icon: <Facebook className="h-4 w-4" />, available: true },
    { value: 'instagram', icon: <Instagram className="h-4 w-4" />, available: true },
    { value: 'telegram', icon: <Send className="h-4 w-4" />, available: false },
    { value: 'email', icon: <Mail className="h-4 w-4" />, available: false }
  ];

  const handleSubmit = async () => {
    if (!formData.name.trim()) return;

    try {
      setIsSubmitting(true);
      await onSubmit(formData);
      setFormData({ type: 'website', name: '', ai_mode: 'hybrid' });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const esMeta = ['whatsapp', 'facebook', 'instagram'].includes(formData.type);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tc('nuevo.titulo')}</DialogTitle>
          <DialogDescription>{tc('nuevo.descripcion')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="channel-type">{tc('nuevo.tipo')}</Label>
            <Select
              value={formData.type}
              onValueChange={(value: ChannelType) => {
                setFormData({
                  ...formData,
                  type: value,
                  name: formData.name || getDefaultName(value)
                });
              }}
            >
              <SelectTrigger id="channel-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {channelTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value} disabled={!type.available}>
                    <div className="flex items-center gap-2">
                      <span aria-hidden="true">{type.icon}</span>
                      <span>{tc(`tipos.${type.value}`)}</span>
                      {!type.available && (
                        <span className="text-xs text-fg-muted">({tc('conectar.proximamente')})</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="channel-name">{tc('nuevo.nombre')}</Label>
            <Input
              id="channel-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={t('nombrePlaceholder')}
              aria-describedby="channel-name-ayuda"
            />
            <p id="channel-name-ayuda" className="text-xs text-fg-muted">{tc('nuevo.nombreAyuda')}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="channel-ai-mode">{tc('nuevo.ayudaIa')}</Label>
            <Select
              value={formData.ai_mode}
              onValueChange={(value: AIMode) => setFormData({ ...formData, ai_mode: value })}
            >
              <SelectTrigger id="channel-ai-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODOS.map((modo) => (
                  <SelectItem key={modo} value={modo}>
                    <div className="flex flex-col">
                      <span>{tc(`modos.${modo}`)}</span>
                      <span className="text-xs text-fg-muted">{tc(`modosDescripcion.${modo}`)}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {formData.type === 'website' && (
            <div className="rounded-lg bg-brand-tint p-3 text-sm text-brand-deep">
              <p className="mb-1 font-medium">{t('avisoWebTitulo')}</p>
              <p className="text-xs">{t('avisoWeb')}</p>
            </div>
          )}

          {esMeta && (
            <div className="rounded-lg bg-success-subtle p-3 text-sm text-success-text">
              <p className="mb-1 font-medium">{t('avisoMetaTitulo', { red: tc(`tipos.${formData.type}`) })}</p>
              <p className="text-xs">{t(formData.type === 'whatsapp' ? 'avisoWhatsApp' : 'avisoMeta')}</p>
            </div>
          )}

          {formData.type === 'whatsapp' && (
            <div className="space-y-1 rounded-lg bg-brand-tint p-3 text-xs text-brand-deep">
              <p className="font-medium">{t('metodosTitulo')}</p>
              <ul className="list-inside list-disc space-y-0.5">
                <li><strong>{tc('nuevo.formas.cloud_api')}</strong> · {t('metodoCloud')}</li>
                <li><strong>{tc('nuevo.formas.qr_scan')}</strong> · {t('metodoQr')}</li>
                <li><strong>{tc('nuevo.formas.coexistence')}</strong> · {t('metodoCoexistencia')}</li>
              </ul>
              <p className="pt-1">{t('metodosNota')}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('cancelar')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !formData.name.trim()}>
            {isSubmitting ? (
              <>
                <Loader2 aria-hidden="true" className="h-4 w-4 mr-2 animate-spin" />
                {t('creando')}
              </>
            ) : (
              tc('nuevo.crear')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
