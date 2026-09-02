'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ClientForm } from '@/components/clientes/new/ClientForm';
import { Pencil, UserPlus } from 'lucide-react';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

interface CustomerEditDialogProps {
  customerId?: string;
  organizationId?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  /** Si true, muestra "Editar cliente", si false "Nuevo cliente" */
  editMode?: boolean;
}

/**
 * Diálogo reutilizable para crear o editar un cliente.
 * Reutiliza ClientForm de /app/clientes/new en modo embebido.
 * Se usa en:
 *  - OpportunityDrawer (editar cliente de la oportunidad)
 *  - OpportunityDetail (editar cliente de la oportunidad)
 *  - Cualquier vista que necesite crear/editar cliente sin navegar
 */
export function CustomerEditDialog({
  customerId,
  organizationId,
  open,
  onOpenChange,
  onSaved,
  editMode = true,
}: CustomerEditDialogProps) {
  const [orgId, setOrgId] = useState<number | undefined>(organizationId);

  useEffect(() => {
    if (!organizationId) {
      const id = getOrganizationId();
      if (id) setOrgId(Number(id));
    } else {
      setOrgId(organizationId);
    }
  }, [organizationId]);

  const isEdit = editMode && !!customerId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? (
              <>
                <Pencil className="h-5 w-5 text-blue-500" />
                Editar cliente
              </>
            ) : (
              <>
                <UserPlus className="h-5 w-5 text-green-500" />
                Nuevo cliente
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Actualiza los datos del cliente: tipo (persona/empresa), contacto, dirección, etc.'
              : 'Completa los datos del nuevo cliente. Puedes usar DIAN para autocompletar.'}
          </DialogDescription>
        </DialogHeader>

        {orgId && (
          <ClientForm
            organizationId={orgId}
            clientId={isEdit ? customerId : undefined}
            mode={isEdit ? 'edit' : 'create'}
            embedded
            onCancel={() => onOpenChange(false)}
            onSuccess={() => {
              onOpenChange(false);
              onSaved?.();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
