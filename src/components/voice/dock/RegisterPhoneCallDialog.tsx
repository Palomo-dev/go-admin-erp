'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CustomerPicker, Dialogo, type ClientePicker } from '@/components/kit';
import { AccionesRapidasCrm } from '@/components/crm/acciones/AccionesRapidasCrm';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';

interface CustomerSearchRow { id: string; first_name: string | null; last_name: string | null; phone: string | null; email: string | null }

/** Selecciona un destino; el registro usa el mismo ActivityDialog y escritor del CRM. */
export function RegisterPhoneCallDialog({ onClose }: { onClose(): void }) {
  const t = useTranslations('phoneBrowser');
  const [selected, setSelected] = useState<ClientePicker | null>(null);
  const [intent, setIntent] = useState<number | null>(null);
  const search = useCallback(async (text: string, signal: AbortSignal) => {
    if (!text.trim()) return [];
    const { data } = await pedirCrm<CustomerSearchRow[]>(`/api/crm/customers/search?q=${encodeURIComponent(text.trim())}&limit=20`, { signal });
    return data.map(row => ({ id: row.id, nombre: [row.first_name, row.last_name].filter(Boolean).join(' '), telefono: row.phone, correo: row.email }));
  }, []);
  return <>{intent === null ? <Dialogo abierto onAbiertoChange={open => !open && onClose()} titulo={t('registerCall')} ancho={520} primario={{ etiqueta: t('registerCall'), deshabilitada: !selected, onClick: () => { if (selected) setIntent(Date.now()); } }}><CustomerPicker cliente={selected} onCambiar={setSelected} buscar={search} layout="campo" /></Dialogo>
    : selected && <AccionesRapidasCrm variante="cliente" clienteId={selected.id} cliente={{ id: selected.id, full_name: selected.nombre, phone: selected.telefono, email: selected.correo }} sinBarra abrirAccion={{ accion: 'llamar', clave: intent, modoLlamada: 'registrar' }} onCerrado={onClose} />}</>;
}
