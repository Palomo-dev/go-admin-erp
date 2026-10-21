'use client';

/**
 * Correo de pedidos del dominio: estado, registros DNS y «Reintentar».
 * Los registros salen del servidor. Aquí no hay claves ni secretos.
 */
import { useCallback, useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { StatusBadge, Tarjeta, clasesBoton } from '@/components/kit';
import { DnsRecordRow } from '../ui/DnsRecordRow';
import { esAvisoLimitePlan } from '@/lib/services/website/dominios/correoTiendaReglas';
import { apiDominios } from './apiDominios';
import { useTextosDominios } from './textos';
import type { EstadoCorreoTienda } from '@/lib/services/website/dominios/correoTiendaReglas';

const ETIQUETA: Record<EstadoCorreoTienda['estado'], string> = {
  verified: 'correoVerificado',
  pending: 'correoPendiente',
  verifying: 'correoPendiente',
  failed: 'correoFallido',
  sin_configurar: 'correoSinConfigurar',
  no_aplica: 'correoNoAplica',
};

export function CorreoPedidosDominio({ dominioId, gestionar }: { dominioId: string; gestionar: boolean }) {
  const t = useTextosDominios();
  const [estado, setEstado] = useState<EstadoCorreoTienda | null>(null);
  const [cargando, setCargando] = useState(true);
  const [verificando, setVerificando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setFallo(null);
    try {
      setEstado(await apiDominios.correoLeer(dominioId));
    } catch (e) {
      setFallo(e instanceof Error ? e.message : t('errores.error_interno'));
    } finally {
      setCargando(false);
    }
  }, [dominioId, t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function verificar() {
    setVerificando(true);
    setFallo(null);
    try {
      setEstado(await apiDominios.correoVerificar(dominioId));
    } catch (e) {
      setFallo(e instanceof Error ? e.message : t('errores.error_interno'));
    } finally {
      setVerificando(false);
    }
  }

  if (estado?.estado === 'no_aplica') return null;

  const limitePlan = esAvisoLimitePlan(estado?.error);
  const etiqueta = limitePlan
    ? t('detalle.correoFallido')
    : estado
      ? t(`detalle.${ETIQUETA[estado.estado]}`)
      : t('detalle.correoPendiente');
  const tono = estado?.estado === 'verified' ? 'verified' : limitePlan || estado?.estado === 'failed' ? 'failed' : 'pending';

  return (
    <Tarjeta titulo={t('detalle.correoTitulo')} icono={Mail} descripcion={t('detalle.correoTexto')}>
      {cargando ? (
        <p className="text-[13px] text-fg-secondary">{t('detalle.correoPendiente')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge estado={tono} etiqueta={etiqueta} />
            {estado?.desde ? <span className="text-[13px] text-fg-secondary">{estado.desde}</span> : null}
          </div>
          {estado && estado.estado !== 'verified' && estado.estado !== 'failed' && !limitePlan && estado.desde ? (
            <p className="text-[13px] text-fg-secondary">{t('detalle.correoEnUnosMinutos', { desde: estado.desde })}</p>
          ) : null}
          {estado?.estado !== 'verified' ? (
            <p className="text-[13px] text-fg-secondary">{t('detalle.correoRespaldo')}</p>
          ) : null}
          {limitePlan ? (
            <p className="text-[13px] text-fg-secondary">{t('detalle.correoLimitePlan')}</p>
          ) : estado?.error ? (
            <p className="text-[13px] text-fg-secondary">{estado.error}</p>
          ) : null}
          {fallo ? <p className="text-[13px] text-danger-text">{fallo}</p> : null}
          {!estado?.dnsEnVercel && (estado?.registros.length ?? 0) > 0 ? (
            <p className="text-[13px] text-fg-secondary">{t('detalle.correoDnsAjeno')}</p>
          ) : null}
          {(estado?.registros.length ?? 0) > 0 ? (
            <div className="flex flex-col gap-3">
              <p className="text-xs font-medium text-fg-muted">{t('detalle.correoRegistros')}</p>
              {estado?.registros.map((r) => (
                <DnsRecordRow key={`${r.tipo}-${r.nombre}-${r.valor}`} tipo={r.tipo} nombre={r.nombre} valor={r.valor} estado="pendiente" variante="tarjeta" />
              ))}
            </div>
          ) : null}
          <button
            type="button"
            disabled={!gestionar || verificando}
            onClick={() => void verificar()}
            className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'self-start' })}
          >
            {verificando ? t('detalle.correoVerificando') : t('detalle.correoVerificar')}
          </button>
        </div>
      )}
    </Tarjeta>
  );
}
