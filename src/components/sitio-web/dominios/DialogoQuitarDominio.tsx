'use client';

/**
 * «¿Quitar tumarca.com de tu sitio?» (Figma B/07-22), desde la lista y desde
 * el detalle. El texto cambia si el dominio se compró aquí (sigue siendo tuyo
 * hasta que vence) y si es el principal (el subdominio pasa a serlo).
 */
import { useState } from 'react';
import { ConfirmDialog } from '@/components/kit';
import { mensajeDeError } from './apiDominios';
import type { DominioSitio } from './tiposDominios';
import { ICONO_ACCION_DOMINIO } from './iconosDominios';
import { useTextosDominios } from './textos';
import { useFormatoDominio } from './useFormatoDominio';

export interface DialogoQuitarDominioProps {
  dominio: DominioSitio | null;
  /** Alias www que se van con la raíz («tumarca.com y www.tumarca.com»). */
  alias: readonly string[];
  hostSubdominio: string | null;
  onAbiertoChange: (v: boolean) => void;
  onQuitar: (id: string) => Promise<void>;
  onQuitado: (host: string) => void;
  onError: (mensaje: string) => void;
}

export function DialogoQuitarDominio({ dominio, alias, hostSubdominio, onAbiertoChange, onQuitar, onQuitado, onError }: DialogoQuitarDominioProps) {
  const t = useTextosDominios();
  const f = useFormatoDominio();
  const [quitando, setQuitando] = useState(false);
  if (!dominio) return null;

  const hosts = [dominio.host, ...alias].join(' y ');
  const vence = dominio.renovacion.tipo === 'automatica' || dominio.renovacion.tipo === 'apagada' ? dominio.renovacion.venceEn : null;
  const partes = [t('quitar.texto', { hosts })];
  if (dominio.tipo === 'comprado') partes.push(vence ? t('quitar.textoComprado', { fecha: f.fecha(vence) }) : t('quitar.textoCompradoSinFecha'));
  if (dominio.principal && hostSubdominio) partes.push(t('quitar.textoPrincipal', { sub: hostSubdominio }));

  return (
    <ConfirmDialog
      abierto
      onAbiertoChange={(v) => !quitando && onAbiertoChange(v)}
      titulo={t('quitar.titulo', { host: dominio.host })}
      descripcion={partes.join(' ')}
      textoConfirmar={t('quitar.confirmar')}
      tono="peligro"
      icono={ICONO_ACCION_DOMINIO.quitar}
      cargando={quitando}
      onConfirmar={async () => {
        setQuitando(true);
        try {
          await onQuitar(dominio.id);
          onQuitado(dominio.host);
          onAbiertoChange(false);
        } catch (e) {
          onError(mensajeDeError(t, e));
        } finally {
          setQuitando(false);
        }
      }}
    />
  );
}
