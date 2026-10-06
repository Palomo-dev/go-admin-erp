'use client';

import CreateOrganizationWizard from './CreateOrganizationWizard';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** Lo que devuelve el asistente al crear la organización. */
export interface OrganizacionCreada {
  id: number;
  name: string;
  logo_url?: string | null;
}

interface CreateOrganizationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Sin uso: el asistente toma el correo de la sesión. Se conserva por compatibilidad. */
  defaultEmail?: string;
  onSuccess?: (data: OrganizacionCreada) => void;
}

/**
 * «Crear nueva organización» con el Dialog del kit. Antes era un modal propio a z-[9999] con
 * su propio «clic fuera»: los desplegables del asistente (ciudad, país…) se abren en un portal a
 * z-50, quedaban detrás del modal, y un clic en ellos contaba como «fuera» y lo cerraba.
 * El Dialog del kit maneja el foco, Escape y los desplegables anidados.
 */
export default function CreateOrganizationDialog({ isOpen, onClose, onSuccess }: CreateOrganizationDialogProps) {
  const t = useTranslations('org.createOrgDialog');

  return (
    <Dialog open={isOpen} onOpenChange={(abierto) => { if (!abierto) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>
        <CreateOrganizationWizard
          onSuccess={(data) => {
            if (onSuccess) {
              onSuccess(data);
            }
            onClose();
          }}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
