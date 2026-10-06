'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { formatTimeInTz } from '@/lib/utils/dateDisplay';
import { CustomerSelector } from '@/components/pos/CustomerSelector';
import type { Customer } from '@/components/pos/types';
import type { ReservaActivaMesa } from '../reservasProximas';
import { AbrirMesaDialog, type DatosAbrirDialogo } from './AbrirMesaDialog';
import { CampoClienteMesa } from './FilasCuentaMesa';
import { abrirMesa, codigoError, listarMeseros, type OpcionMesero } from './cuentaMesaService';

/**
 * Abrir una mesa (Figma D1 escritorio y T1 tableta) con todo lo que pide:
 * comensales, mesero (quien abre va primero), cliente opcional y la reserva
 * que llega. Lo usan el plano de mesas y la cuenta de una mesa libre.
 */
export interface AbrirMesaFlujoProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  mesa: { id: string; nombre: string; zona: string | null; capacidad: number } | null;
  reserva?: ReservaActivaMesa;
  onVerReserva?: () => void;
  tableta?: boolean;
  onAbierta: (sesionId: string | null) => void;
}

export function AbrirMesaFlujo({ abierto, onAbiertoChange, mesa, reserva, onVerReserva, tableta, onAbierta }: AbrirMesaFlujoProps) {
  const t = useTranslations('posMesasFlujo');
  const { organization } = useOrganization();
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [meseros, setMeseros] = useState<OpcionMesero[]>([]);
  const [cliente, setCliente] = useState<Customer | undefined>(undefined);
  const [buscando, setBuscando] = useState(false);
  const [abriendo, setAbriendo] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    setCliente(undefined);
    supabase.auth.getUser().then(({ data }) => vigente && setUsuarioId(data.user?.id ?? null));
    if (organization?.id) listarMeseros(organization.id).then((m) => vigente && setMeseros(m)).catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [abierto, organization?.id]);

  const alAbrir = async (d: DatosAbrirDialogo) => {
    if (!mesa) return;
    setAbriendo(true);
    try {
      const r = await abrirMesa({
        mesaId: mesa.id,
        comensales: d.comensales,
        meseroId: d.meseroId,
        clienteId: cliente?.id ?? null,
        reservaId: d.sentarReserva && reserva ? reserva.reserva.id : null,
      });
      onAbiertoChange(false);
      toast.success(t('toast.abierta', { mesa: mesa.nombre }));
      onAbierta(r.sesionId);
    } catch (error) {
      const codigo = codigoError(error);
      toast.error(t.has(`errores.${codigo}`) ? t(`errores.${codigo}`) : t('errores.error'));
    } finally {
      setAbriendo(false);
    }
  };

  return (
    <AbrirMesaDialog
      abierto={abierto && !!mesa}
      onAbiertoChange={onAbiertoChange}
      mesa={mesa?.nombre ?? ''}
      zona={mesa?.zona ?? null}
      capacidad={mesa?.capacidad ?? 4}
      reserva={
        reserva
          ? {
              id: reserva.reserva.id,
              nombre: reserva.reserva.customer_name,
              hora: formatTimeInTz(reserva.inicio, reserva.zona),
              personas: reserva.reserva.party_size,
              llegada:
                reserva.minutosParaInicio > 5
                  ? t('abrir.llega', { min: reserva.minutosParaInicio })
                  : reserva.minutosParaInicio < -5
                    ? t('abrir.tarde', { min: -reserva.minutosParaInicio })
                    : t('abrir.aLaHora'),
            }
          : null
      }
      onVerReserva={onVerReserva}
      meseros={meseros}
      usuarioId={usuarioId}
      tableta={tableta}
      abriendo={abriendo}
      campoCliente={
        tableta ? undefined : (
          <CustomerSelector
            selectedCustomer={cliente}
            onCustomerSelect={(c) => setCliente(c)}
            open={buscando}
            onOpenChange={setBuscando}
            disparador={<CampoClienteMesa nombre={cliente?.full_name ?? null} placeholder={t('abrir.clienteBuscar')} />}
          />
        )
      }
      onAbrir={(d) => void alAbrir(d)}
    />
  );
}
