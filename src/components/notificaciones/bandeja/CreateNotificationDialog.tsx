'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import type { OrgMember, CreateNotificationPayload } from './types';

interface CreateNotificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: OrgMember[];
  onSubmit: (payload: CreateNotificationPayload) => Promise<boolean>;
}

const channelOptions = [
  { value: 'app', label: 'In-App' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'push', label: 'Push' },
];

const typeOptions = [
  { value: 'manual', label: 'Manual / General' },
  { value: 'announcement', label: 'Anuncio' },
  { value: 'reminder', label: 'Recordatorio' },
  { value: 'alert', label: 'Alerta' },
];

export function CreateNotificationDialog({ open, onOpenChange, members, onSubmit }: CreateNotificationDialogProps) {
  const [recipientUserId, setRecipientUserId] = useState<string>('');
  const [channel, setChannel] = useState('app');
  const [type, setType] = useState('manual');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);

  const reset = () => {
    setRecipientUserId('');
    setChannel('app');
    setType('manual');
    setTitle('');
    setContent('');
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setIsSending(true);

    const success = await onSubmit({
      recipientUserId: recipientUserId || null,
      channel,
      type,
      title: title.trim(),
      content: content.trim(),
    });

    setIsSending(false);
    if (success) {
      reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-gray-900">
        <DialogHeader>
          <DialogTitle>Nueva Notificación</DialogTitle>
          <DialogDescription>Enviar notificación manual a un usuario o a toda la organización.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Destinatario */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600 dark:text-gray-400">Destinatario</Label>
            <select
              value={recipientUserId}
              onChange={(e) => setRecipientUserId(e.target.value)}
              className="w-full h-9 px-3 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              <option value="">Toda la organización</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.profiles ? `${m.profiles.first_name || ''} ${m.profiles.last_name || ''}`.trim() || m.profiles.email : m.user_id.substring(0, 8)}
                  {m.roles ? ` (${m.roles.name})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Canal y Tipo */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600 dark:text-gray-400">Canal</Label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="w-full h-9 px-3 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                {channelOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600 dark:text-gray-400">Tipo</Label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full h-9 px-3 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                {typeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Título */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600 dark:text-gray-400">Título *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título de la notificación"
              className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            />
          </div>

          {/* Contenido */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600 dark:text-gray-400">Contenido</Label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Mensaje de la notificación..."
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!title.trim() || isSending}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
