'use client';

/**
 * «No se pudo entregar» como hoja (Figma Envío/HojaInferior · «09 Novedad»): inferior en el celular
 * y lateral en el computador (`HojaDetalle` del kit), sobre la parada o sobre la ruta del supervisor.
 * El cuerpo es `FormularioNovedad`, el mismo de la página `/no-entregado`.
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { HojaDetalle } from '@/components/kit/HojaDetalle';
import type { EnvioApp } from '@/lib/services/logistica/misEnviosService';
import { FormularioNovedad } from './FormularioNovedad';

export interface HojaNovedadProps {
  envio: EnvioApp | null;
  orgId: number | null;
  onCerrar: () => void;
  onHecho: () => void;
}

export function HojaNovedad({ envio, orgId, onCerrar, onHecho }: HojaNovedadProps) {
  const t = useTranslations('logistica.misEnvios');
  const [ocupado, setOcupado] = useState(false);
  const nombre = envio ? envio.delivery_contact_name || envio.customer?.full_name || t('cliente') : '';
  return (
    <HojaDetalle
      abierto={!!envio && !!orgId}
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo={t('novedad.titulo')}
      subtitulo={envio ? `${envio.shipment_number} · ${nombre}` : undefined}
      ancho={480}
      ocupado={ocupado}
    >
      {envio && orgId ? (
        <FormularioNovedad key={envio.id} envio={envio} orgId={orgId} variante="hoja" onOcupadoChange={setOcupado} onHecho={onHecho} />
      ) : null}
    </HojaDetalle>
  );
}
