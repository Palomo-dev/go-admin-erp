'use client';

/**
 * «Llevar tumarca.com a otro proveedor» (Figma B/07-23). El código de
 * autorización lo pide el servidor al registrador y lo envía por correo: nunca
 * se muestra aquí. Bloqueado los primeros 60 días (regla de ICANN).
 */
import { useState } from 'react';
import { AvisoTonal, Dialogo } from '@/components/kit';
import { mensajeDeError } from './apiDominios';
import type { DominioSitio } from './tiposDominios';
import { ICONO_ACCION_DOMINIO } from './iconosDominios';
import { useTextosDominios } from './textos';
import { useFormatoDominio } from './useFormatoDominio';

export interface DialogoCodigoTransferenciaProps {
  dominio: DominioSitio | null;
  transferencia: { puede: boolean; disponibleEn: string | null } | null;
  correoCuenta: string | null;
  onAbiertoChange: (v: boolean) => void;
  onSolicitar: (id: string) => Promise<{ correo: string }>;
  onEnviado: (correo: string) => void;
}

export function DialogoCodigoTransferencia({ dominio, transferencia, correoCuenta, onAbiertoChange, onSolicitar, onEnviado }: DialogoCodigoTransferenciaProps) {
  const t = useTextosDominios();
  const f = useFormatoDominio();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!dominio) return null;
  const puede = transferencia?.puede ?? false;
  const pasos = [
    t('transferir.paso1'),
    correoCuenta ? t('transferir.paso2', { correo: correoCuenta }) : t('transferir.paso2SinCorreo'),
    t('transferir.paso3'),
    t('transferir.paso4'),
  ];

  return (
    <Dialogo
      abierto
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      titulo={t('transferir.titulo', { host: dominio.host })}
      descripcion={t('transferir.sub')}
      icono={ICONO_ACCION_DOMINIO.transferir}
      ancho={520}
      primario={{
        etiqueta: t('transferir.solicitar'),
        cargando: enviando,
        deshabilitada: !puede,
        motivo: puede ? undefined : t('transferir.reglaNoPuede', { host: dominio.host, fecha: f.fecha(transferencia?.disponibleEn) }),
        onClick: async () => {
          setEnviando(true);
          setError(null);
          try {
            const r = await onSolicitar(dominio.id);
            onEnviado(r.correo);
            onAbiertoChange(false);
          } catch (e) {
            setError(mensajeDeError(t, e));
          } finally {
            setEnviando(false);
          }
        },
      }}
    >
      <ol className="flex list-decimal flex-col gap-1.5 rounded-lg bg-canvas py-3 pl-8 pr-4 text-[13px] leading-[18px] text-fg">
        {pasos.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ol>
      <AvisoTonal
        tono="advertencia"
        titulo={t('transferir.reglaTitulo')}
        descripcion={puede ? t('transferir.reglaPuede', { host: dominio.host }) : t('transferir.reglaNoPuede', { host: dominio.host, fecha: f.fecha(transferencia?.disponibleEn) })}
      />
      {error && <AvisoTonal tono="peligro" rol="alert" titulo={error} />}
    </Dialogo>
  );
}
