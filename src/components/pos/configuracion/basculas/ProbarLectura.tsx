'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Play, Square } from 'lucide-react';
import { clasesBoton } from '@/components/kit';
import { bytesHex, bytesLegibles, sugerirProtocolos } from '@/lib/pos/bascula/protocolos';
import type { ConfigBascula, ProtocoloBascula } from '@/lib/pos/bascula/tipos';
import type { EntornoBascula } from '@/lib/pos/bascula/transportes';
import { useLectorBascula } from '@/lib/pos/bascula/useLectorBascula';
import { cn } from '@/utils/Utils';

/**
 * «Probar lectura» (Figma K2/K4): abre el puerto con lo que está escrito en
 * el formulario y muestra la lectura interpretada. Si llegan bytes que el
 * protocolo elegido no entiende, los muestra crudos (texto y hexadecimal) y
 * sugiere el protocolo que sí los entiende.
 */
export interface ProbarLecturaProps {
  config: ConfigBascula;
  /** Para pruebas: entorno fijo en vez del navegador/Desktop real. */
  entorno?: EntornoBascula;
  /** Resultado de la prueba al detenerla (o con la primera lectura reconocida). */
  onResultado?: (ok: boolean) => void;
  onUsarProtocolo?: (p: ProtocoloBascula) => void;
  deshabilitado?: boolean;
}

export function ProbarLectura({ config, entorno, onResultado, onUsarProtocolo, deshabilitado }: ProbarLecturaProps) {
  const t = useTranslations('posBascula.config.prueba');
  const tp = useTranslations('posBascula.config.protocolos');
  const te = useTranslations('posBascula.lectura.errores');
  const locale = useLocale();
  const [activo, setActivo] = useState(false);
  const lector = useLectorBascula(config, activo, { entorno });
  const informado = useRef(false);
  const e = lector.estado;

  // Primera lectura reconocida: la prueba ya salió bien.
  useEffect(() => {
    if (activo && e && e.tramasReconocidas > 0 && !informado.current) {
      informado.current = true;
      onResultado?.(true);
    }
  }, [activo, e, onResultado]);

  const iniciar = () => {
    informado.current = false;
    setActivo(true);
  };
  const detener = () => {
    if (!informado.current) onResultado?.(false);
    informado.current = true;
    setActivo(false);
  };

  const sugeridos = useMemo(
    () => (e && e.crudo.length > 0 && e.tramasReconocidas === 0 ? sugerirProtocolos(e.crudo, { decimales: config.decimales }).filter((p) => p !== config.protocolo) : []),
    [e, config.decimales, config.protocolo],
  );

  const noReconocida = !!e && e.tramasNoReconocidas > 0 && e.tramasReconocidas === 0;
  const lectura = e?.lectura;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-subtle px-4 py-3" aria-labelledby="probar-lectura-titulo">
      <div className="flex items-center justify-between gap-2">
        <h4 id="probar-lectura-titulo" className="text-sm font-semibold text-fg">
          {t('titulo')}
        </h4>
        {activo ? (
          <button type="button" onClick={detener} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
            <Square aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('detener')}
          </button>
        ) : (
          <button type="button" onClick={iniciar} disabled={deshabilitado} className={clasesBoton({ variante: 'tinte', tamano: 'sm' })}>
            <Play aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('iniciar')}
          </button>
        )}
      </div>

      {!activo && !e && <p className="text-xs text-fg-secondary">{t('ayuda')}</p>}

      {activo && e && (
        <div className="flex flex-col gap-2" aria-live="polite">
          {e.fase === 'conectando' && e.crudo.length === 0 && <p className="text-xs text-fg-secondary">{t('esperando')}</p>}
          {e.fase === 'error' && (
            <p role="alert" className="text-xs text-danger-text">
              {te(e.error ?? 'io')}
            </p>
          )}
          {lectura && e.tramasReconocidas > 0 && (
            <p className="text-sm text-fg">
              {t('ok', {
                peso:
                  e.peso !== null
                    ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(e.peso)} ${(e.unidad || config.unidad).toLowerCase()}`
                    : '—',
                estado: lectura.estable ? t('estable') : t('inestable'),
              })}
            </p>
          )}
          {noReconocida && (
            <p role="alert" className="text-xs text-danger-text">
              {t('noReconocida', { protocolo: tp(config.protocolo) })}
            </p>
          )}
          {sugeridos.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-fg-secondary">
              <span>{t('sugerencia', { protocolos: sugeridos.map((p) => tp(p)).join(', ') })}</span>
              {onUsarProtocolo &&
                sugeridos.map((p) => (
                  <button key={p} type="button" onClick={() => onUsarProtocolo(p)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
                    {t('usarSugerido', { protocolo: tp(p) })}
                  </button>
                ))}
            </div>
          )}
          {(noReconocida || e.fase === 'error') && e.crudo.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-fg-secondary">{t('crudos', { cantidad: e.crudo.length })}</span>
              <pre className={cn('max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-md border border-line bg-surface p-2 font-mono text-xs text-fg')} data-crudo="texto">
                {bytesLegibles(e.crudo)}
              </pre>
              <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-all rounded-md border border-line bg-surface p-2 font-mono text-[11px] text-fg-secondary" data-crudo="hex">
                {bytesHex(e.crudo)}
              </pre>
            </div>
          )}
          {e.fase === 'error' && e.error === 'sin_lectura' && e.crudo.length === 0 && <p className="text-xs text-fg-secondary">{t('sinBytes')}</p>}
        </div>
      )}
    </section>
  );
}
