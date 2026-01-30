'use client';

import React, { useState } from 'react';
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<CreateChannelData>({
    type: preselectedType || 'website',
    name: '',
    ai_mode: 'hybrid'
  });

  React.useEffect(() => {
    if (open && preselectedType) {
      const defaultName = getDefaultName(preselectedType);
      setFormData({
        type: preselectedType,
        name: defaultName,
        ai_mode: 'hybrid'
      });
    } else if (open && !preselectedType) {
      setFormData({
        type: 'website',
        name: '',
        ai_mode: 'hybrid'
      });
    }
  }, [open, preselectedType]);

  const channelTypes: { value: ChannelType; label: string; icon: React.ReactNode; available: boolean }[] = [
    { value: 'website', label: 'Sitio Web', icon: <Globe className="h-4 w-4" />, available: true },
    { value: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle className="h-4 w-4" />, available: true },
    { value: 'facebook', label: 'Facebook Messenger', icon: <Facebook className="h-4 w-4" />, available: true },
    { value: 'instagram', label: 'Instagram', icon: <Instagram className="h-4 w-4" />, available: true },
    { value: 'telegram', label: 'Telegram', icon: <Send className="h-4 w-4" />, available: false },
    { value: 'email', label: 'Email', icon: <Mail className="h-4 w-4" />, available: false }
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

  const getDefaultName = (type: ChannelType): string => {
    const names: Record<ChannelType, string> = {
      website: 'Chat Web Principal',
      whatsapp: 'WhatsApp Business',
      facebook: 'Facebook Messenger',
      instagram: 'Instagram Direct',
      telegram: 'Telegram Bot',
      email: 'Soporte Email'
    };
    return names[type] || '';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crear Nuevo Canal</DialogTitle>
          <DialogDescription>
            Configura un nuevo canal de comunicación para recibir mensajes de tus clientes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Channel Type */}
          <div className="space-y-2">
            <Label>Tipo de Canal</Label>
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
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {channelTypes.map((type) => (
                  <SelectItem 
                    key={type.value} 
                    value={type.value}
                    disabled={!type.available}
                  >
                    <div className="flex items-center gap-2">
                      {type.icon}
                      <span>{type.label}</span>
                      {!type.available && (
                        <span className="text-xs text-gray-400">(Próximamente)</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Channel Name */}
          <div className="space-y-2">
            <Label htmlFor="channel-name">Nombre del Canal</Label>
            <Input
              id="channel-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ej: Chat Web Principal"
            />
          </div>

          {/* AI Mode */}
          <div className="space-y-2">
            <Label>Modo de IA</Label>
            <Select 
              value={formData.ai_mode} 
              onValueChange={(value: AIMode) => setFormData({ ...formData, ai_mode: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">
                  <div className="flex flex-col">
                    <span>Desactivado</span>
                    <span className="text-xs text-gray-500">Solo agentes humanos</span>
                  </div>
                </SelectItem>
                <SelectItem value="hybrid">
                  <div className="flex flex-col">
                    <span>Híbrido (Recomendado)</span>
                    <span className="text-xs text-gray-500">IA sugiere, humano decide</span>
                  </div>
                </SelectItem>
                <SelectItem value="auto">
                  <div className="flex flex-col">
                    <span>Automático</span>
                    <span className="text-xs text-gray-500">IA responde automáticamente</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Info based on type */}
          {formData.type === 'website' && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-700 dark:text-blue-300">
              <p className="font-medium mb-1">Chat para Sitio Web</p>
              <p className="text-xs">
                Después de crear el canal, podrás copiar el código del widget para instalarlo en tu sitio web.
              </p>
            </div>
          )}

          {['whatsapp', 'facebook', 'instagram'].includes(formData.type) && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-sm text-green-700 dark:text-green-300">
              <p className="font-medium mb-1">Conexión con {formData.type === 'whatsapp' ? 'WhatsApp' : formData.type === 'facebook' ? 'Facebook' : 'Instagram'}</p>
              <p className="text-xs">
                Después de crear el canal, necesitarás conectar tu cuenta de {formData.type === 'whatsapp' ? 'WhatsApp Business' : 'Meta Business'}.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting || !formData.name.trim()}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creando...
              </>
            ) : (
              'Crear Canal'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
