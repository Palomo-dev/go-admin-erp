'use client';

/**
 * «Asignar domiciliario» desde Pedidos online. Es la MISMA hoja de Logística
 * (`HojaAsignarDomiciliario`, Figma «21 Logística» 2800:8231): una sola pieza para asignar.
 *
 * Antes este diálogo exigía vehículo y conductor; desde la Fase 1 de logística asignar NO exige
 * vehículo (RPC `logistica_asignar_domiciliario`, docs/logistica/FASE1-CIMIENTOS.md). Aquí solo
 * se busca el envío del pedido y se abre la hoja.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle } from 'lucide-react';
import { Dialogo } from '@/components/kit';
import { supabase } from '@/lib/supabase/config';
import { filaDespachoDePedidoWeb } from '@/lib/services/logistica/despachoService';
import type { FilaDespacho } from '@/lib/logistica/despacho';
import { HojaAsignarDomiciliario } from '@/components/logistica/asignar/HojaAsignarDomiciliario';
import { useImpresionLogistica } from '@/components/logistica/useImpresionLogistica';

interface AssignDeliveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webOrderId: string;
  organizationId: number;
  onAssigned?: () => void;
}

export function AssignDeliveryDialog({ open, onOpenChange, webOrderId, organizationId, onAssigned }: AssignDeliveryDialogProps) {
  const t = useTranslations('pedidoWeb');
  const { imprimirGuias } = useImpresionLogistica();
  const [fila, setFila] = useState<FilaDespacho | null>(null);
  const [sinEnvio, setSinEnvio] = useState(false);

  useEffect(() => {
    if (!open || !organizationId) return;
    let cancelado = false;
    setFila(null);
    setSinEnvio(false);
    filaDespachoDePedidoWeb(supabase, organizationId, webOrderId)
      .then((f) => {
        if (cancelado) return;
        setFila(f);
        setSinEnvio(!f);
      })
      .catch(() => !cancelado && setSinEnvio(true));
    return () => {
      cancelado = true;
    };
  }, [open, organizationId, webOrderId]);

  if (!open) return null;

  if (sinEnvio) {
    return (
      <Dialogo
        abierto
        onAbiertoChange={onOpenChange}
        titulo={t('assignDeliveryDialog.asignarDelivery')}
        icono={AlertCircle}
        descripcion={t('assignDeliveryDialog.noEncontroEnvioAsociado')}
        primario={{ etiqueta: t('ficha.cancelar'), onClick: () => onOpenChange(false) }}
        sinCancelar
      />
    );
  }

  if (!fila) return null;

  return (
    <HojaAsignarDomiciliario
      abierto
      onAbiertoChange={onOpenChange}
      organizationId={organizationId}
      envios={[fila]}
      onImprimirGuias={(lista, dom) => void imprimirGuias(lista, dom)}
      onAsignado={(r) => {
        if (r.asignados.length > 0) onAssigned?.();
      }}
    />
  );
}
