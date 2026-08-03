'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Mail, MessageSquare, QrCode, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { Membership, getMembershipStatusColor, getMembershipStatusLabel } from '@/lib/services/gymService';
import { formatDate } from '@/utils/Utils';

interface MembershipQRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  membership: Membership | null;
  onRegenerateCode?: (membership: Membership) => void;
}

export function MembershipQRDialog({ 
  open, 
  onOpenChange, 
  membership,
  onRegenerateCode 
}: MembershipQRDialogProps) {
  if (!membership) return null;

  const customer = membership.customers;
  const plan = membership.membership_plans;
  const accessCode = membership.access_code || 'SIN-CÓDIGO';

  const handleCopyCode = () => {
    navigator.clipboard.writeText(accessCode);
    toast.success('Código copiado al portapapeles');
  };

  const handleSendEmail = () => {
    if (customer?.email) {
      const subject = encodeURIComponent(`Tu código de acceso - ${plan?.name || 'Membresía'}`);
      const body = encodeURIComponent(
        `Hola ${customer.first_name},\n\nTu código de acceso es: ${accessCode}\n\nPlan: ${plan?.name}\nVálido hasta: ${formatDate(membership.end_date)}\n\n¡Gracias por ser parte de nuestro gimnasio!`
      );
      window.open(`mailto:${customer.email}?subject=${subject}&body=${body}`);
    } else {
      toast.error('El cliente no tiene email registrado');
    }
  };

  const handleSendWhatsApp = () => {
    if (customer?.phone) {
      const phone = customer.phone.replace(/\D/g, '');
      const message = encodeURIComponent(
        `Hola ${customer.first_name}! 👋\n\nTu código de acceso al gimnasio es: *${accessCode}*\n\n📋 Plan: ${plan?.name}\n📅 Válido hasta: ${formatDate(membership.end_date)}\n\n¡Te esperamos! 💪`
      );
      window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
    } else {
      toast.error('El cliente no tiene teléfono registrado');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] bg-white dark:bg-gray-800">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <QrCode className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Código de Acceso
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Info del cliente */}
          <div className="text-center">
            <p className="font-semibold text-lg text-gray-900 dark:text-white">
              {customer?.first_name} {customer?.last_name}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {plan?.name}
            </p>
            <Badge className={getMembershipStatusColor(membership.status) + " mt-2"}>
              {getMembershipStatusLabel(membership.status)}
            </Badge>
          </div>

          {/* QR Code */}
          <div className="flex justify-center">
            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-200 dark:border-gray-700">
              <QRCodeSVG 
                value={accessCode}
                size={180}
                level="H"
                includeMargin={false}
              />
            </div>
          </div>

          {/* Código alfanumérico */}
          <div className="text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
              Código de acceso
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="font-mono text-2xl font-bold tracking-wider text-gray-900 dark:text-white">
                {accessCode}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCopyCode}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Fecha de vencimiento */}
          <div className="text-center text-sm text-gray-500 dark:text-gray-400">
            Válido hasta: <span className="font-medium">{formatDate(membership.end_date)}</span>
          </div>

          {/* Acciones */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleSendEmail}
            >
              <Mail className="h-4 w-4 mr-2" />
              Email
            </Button>
            <Button
              variant="outline"
              className="flex-1 border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400"
              onClick={handleSendWhatsApp}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              WhatsApp
            </Button>
          </div>

          {onRegenerateCode && (
            <Button
              variant="ghost"
              className="w-full text-gray-500 dark:text-gray-400"
              onClick={() => onRegenerateCode(membership)}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Regenerar código
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default MembershipQRDialog;
