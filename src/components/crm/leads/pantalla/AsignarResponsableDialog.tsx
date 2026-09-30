'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { UserPlus } from 'lucide-react';
import { Dialogo } from '@/components/kit/Dialogo';
import { FormField } from '@/components/kit/FormField';
import { CLASE_CAMPO, type OpcionUsuario } from '@/components/crm/kit/camposCrm';

/**
 * «Asignar responsable» de uno o varios leads (Figma 765:447453, barra
 * masiva): `POST /api/crm/leads/assign` (`crm.leads.assign`). «Sin asignar»
 * quita el responsable.
 */
export interface AsignarResponsableDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  cantidad: number;
  usuarios: readonly OpcionUsuario[];
  inicial?: string | null;
  onAsignar: (ownerId: string | null) => void;
  ocupado?: boolean;
  error?: string | null;
}

export function AsignarResponsableDialog({ abierto, onAbiertoChange, cantidad, usuarios, inicial, onAsignar, ocupado, error }: AsignarResponsableDialogProps) {
  const t = useTranslations('crm.pantallaLeads.asignar');
  const [valor, setValor] = useState(inicial ?? '');
  useEffect(() => {
    if (abierto) setValor(inicial ?? '');
  }, [abierto, inicial]);

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(x) => !ocupado && onAbiertoChange(x)}
      titulo={t('titulo')}
      descripcion={t('descripcion', { n: cantidad })}
      icono={UserPlus}
      ancho={440}
      primario={{ etiqueta: t('asignar'), onClick: () => onAsignar(valor || null), cargando: ocupado }}
      textoCancelar={t('cancelar')}
    >
      {error && <p role="alert" className="rounded-lg bg-danger-subtle px-3 py-2 text-[13px] text-danger-text">{error}</p>}
      <FormField etiqueta={t('responsable')}>
        <select value={valor} onChange={(e) => setValor(e.target.value)} className={CLASE_CAMPO}>
          <option value="">{t('sinAsignar')}</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>{u.nombre}</option>
          ))}
        </select>
      </FormField>
    </Dialogo>
  );
}
