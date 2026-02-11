'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import {
  AlertTriangle, CheckCircle2, Eye, EyeOff, XCircle,
  Clock, Send, MessageSquare, Loader2, StickyNote, ExternalLink,
  Info, ShieldAlert, Flame, Hash, Calendar, User, Layers,
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import { AlertasService } from './AlertasService';
import type { SystemAlert } from './types';

interface AlertaDetailSheetProps {
  alert: SystemAlert | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  isAdmin: boolean;
  channels: { code: string; provider_name: string }[];
  onStatusChanged: () => void;
  onNavigate: (url: string) => void;
}

const severityConfig = {
  info: { label: 'Info', icon: Info, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  warning: { label: 'Warning', icon: ShieldAlert, color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  critical: { label: 'Crítica', icon: Flame, color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300' },
  delivered: { label: 'Entregada', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  read: { label: 'Leída', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' },
  resolved: { label: 'Resuelta', color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  ignored: { label: 'Ignorada', color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
};

const moduleLabels: Record<string, string> = {
  inventario: 'Inventario', finanzas: 'Finanzas', pos: 'POS', crm: 'CRM',
  hrm: 'HRM', pms: 'PMS', sistema: 'Sistema', integraciones: 'Integraciones', transporte: 'Transporte',
};

export function AlertaDetailSheet({
  alert, open, onOpenChange, userId, isAdmin, channels, onStatusChanged, onNavigate,
}: AlertaDetailSheetProps) {
  const [detail, setDetail] = useState<SystemAlert | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    if (alert && open) {
      setLoading(true);
      setDetail(null);
      AlertasService.getAlertDetail(alert.id).then((d) => {
        setDetail(d || alert);
        setLoading(false);
      });
    }
  }, [alert?.id, open]);

  if (!alert) return null;

  const a = detail || alert;
  const sev = severityConfig[a.severity] || severityConfig.info;
  const SevIcon = sev.icon;
  const st = statusConfig[a.status] || statusConfig.pending;

  const handleAction = async (action: string) => {
    if (!userId) return;
    setActionLoading(action);

    let success = false;
    switch (action) {
      case 'read':
        success = await AlertasService.updateStatus(a.id, 'read', userId);
        break;
      case 'resolved':
        success = await AlertasService.updateStatus(a.id, 'resolved', userId);
        break;
      case 'ignored':
        success = await AlertasService.updateStatus(a.id, 'ignored', userId);
        break;
      case 'create_rule':
        success = await AlertasService.createRuleFromAlert(a);
        break;
    }

    setActionLoading(null);
    if (success) {
      onStatusChanged();
      if (action !== 'create_rule') {
        const updated = await AlertasService.getAlertDetail(a.id);
        setDetail(updated || a);
      }
    }
  };

  const handleResend = async (channel: string) => {
    setActionLoading(`resend_${channel}`);
    await AlertasService.resendToChannel(a, channel);
    setActionLoading(null);
    const updated = await AlertasService.getAlertDetail(a.id);
    setDetail(updated || a);
    onStatusChanged();
  };

  const handleAddNote = async () => {
    if (!noteText.trim() || !userId) return;
    setActionLoading('note');
    const success = await AlertasService.addNote(a.id, noteText.trim(), userId);
    if (success) {
      setNoteText('');
      const updated = await AlertasService.getAlertDetail(a.id);
      setDetail(updated || a);
    }
    setActionLoading(null);
  };

  const notes: { text: string; by: string; at: string }[] = a.metadata?.notes || [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg w-full overflow-y-auto bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800">
        <SheetHeader className="pb-4">
          <div className="flex items-start gap-3">
            <div className={cn('p-2.5 rounded-xl', sev.color)}>
              <SevIcon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base leading-tight">{a.title}</SheetTitle>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge className={cn('text-xs', sev.color)}>{sev.label}</Badge>
                <Badge className={cn('text-xs', st.color)}>{st.label}</Badge>
                <Badge variant="outline" className="text-xs capitalize">
                  {moduleLabels[a.source_module] || a.source_module}
                </Badge>
              </div>
              <SheetDescription className="sr-only">Detalle de alerta del sistema</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <Separator />

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        ) : (
          <div className="py-4 space-y-5">
            {/* Mensaje */}
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-800">
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{a.message}</p>
            </div>

            {/* Info */}
            <div className="space-y-2">
              <InfoRow icon={Calendar} label="Fecha" value={new Date(a.created_at).toLocaleString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />
              <InfoRow icon={Hash} label="ID" value={a.id.substring(0, 12) + '...'} />
              {a.source_id && <InfoRow icon={Layers} label="Source ID" value={a.source_id} />}
              {a.sent_channels && a.sent_channels.length > 0 && (
                <InfoRow icon={Send} label="Enviada por" value={a.sent_channels.join(', ')} />
              )}
              {a.resolved_by && (
                <InfoRow
                  icon={User}
                  label="Resuelta por"
                  value={a.resolver_profile ? `${a.resolver_profile.first_name || ''} ${a.resolver_profile.last_name || ''}`.trim() || a.resolver_profile.email : a.resolved_by.substring(0, 8)}
                />
              )}
              {a.resolved_at && (
                <InfoRow icon={Clock} label="Resuelta el" value={new Date(a.resolved_at).toLocaleString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />
              )}
              {a.rule_id && (
                <InfoRow icon={Layers} label="Regla" value={a.rule_id.substring(0, 12) + '...'} />
              )}
            </div>

            {/* Metadata extra */}
            {a.metadata && Object.keys(a.metadata).filter(k => k !== 'notes' && k !== 'manual').length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Metadata</p>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-800 space-y-1">
                  {Object.entries(a.metadata)
                    .filter(([k]) => k !== 'notes' && k !== 'manual')
                    .map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs">
                        <span className="text-gray-500 dark:text-gray-400">{k}</span>
                        <span className="text-gray-700 dark:text-gray-300 font-medium">{String(v)}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Notas internas */}
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                <StickyNote className="h-3.5 w-3.5" /> Notas internas
              </p>
              {notes.length > 0 ? (
                <div className="space-y-2 mb-3">
                  {notes.map((n, i) => (
                    <div key={i} className="bg-yellow-50 dark:bg-yellow-950/20 rounded-lg p-2 border border-yellow-200 dark:border-yellow-800 text-xs">
                      <p className="text-gray-700 dark:text-gray-300">{n.text}</p>
                      <p className="text-gray-400 mt-1">
                        {new Date(n.at).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 mb-3">Sin notas</p>
              )}
              <div className="flex gap-2">
                <Input
                  placeholder="Agregar nota..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  className="text-xs bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddNote(); }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddNote}
                  disabled={!noteText.trim() || actionLoading === 'note'}
                  className="flex-shrink-0"
                >
                  {actionLoading === 'note' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <StickyNote className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>

            {/* Reenviar por canal */}
            {channels.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                  <Send className="h-3.5 w-3.5" /> Reenviar por canal
                </p>
                <div className="flex flex-wrap gap-2">
                  {channels.map((ch) => {
                    const alreadySent = a.sent_channels?.includes(ch.code);
                    return (
                      <Button
                        key={ch.code}
                        variant="outline"
                        size="sm"
                        disabled={!!actionLoading}
                        onClick={() => handleResend(ch.code)}
                        className={cn('text-xs', alreadySent && 'border-green-300 dark:border-green-700')}
                      >
                        {actionLoading === `resend_${ch.code}` ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : alreadySent ? (
                          <CheckCircle2 className="h-3 w-3 text-green-500 mr-1" />
                        ) : (
                          <Send className="h-3 w-3 mr-1" />
                        )}
                        {ch.code}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <Separator />

        <SheetFooter className="pt-4 flex-col sm:flex-row gap-2">
          {a.status !== 'resolved' && a.status !== 'ignored' && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAction('read')}
                disabled={a.status === 'read' || !!actionLoading}
                className="flex-1"
              >
                {actionLoading === 'read' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                Reconocer
              </Button>
              <Button
                size="sm"
                onClick={() => handleAction('resolved')}
                disabled={!!actionLoading}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              >
                {actionLoading === 'resolved' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                Resolver
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleAction('ignored')}
                disabled={!!actionLoading}
                className="text-gray-500"
              >
                {actionLoading === 'ignored' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
                Ignorar
              </Button>
            </>
          )}
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAction('create_rule')}
              disabled={!!actionLoading}
              className="flex-1 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400"
            >
              {actionLoading === 'create_rule' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Layers className="h-4 w-4 mr-1" />}
              Crear Regla
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
      <span className="text-gray-500 dark:text-gray-400 w-24 flex-shrink-0">{label}</span>
      <span className="text-gray-700 dark:text-gray-300 font-medium truncate">{value}</span>
    </div>
  );
}
