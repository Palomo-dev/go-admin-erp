'use client';

/**
 * «Nuevo canal» (Figma 91-chat-21): tipo, nombre, forma de conexión (solo
 * WhatsApp: Cloud API recomendada · Coexistencia · Código QR con riesgo) y
 * ayuda de la IA. Crear el canal lo hace la página con `chatChannelsService`;
 * la conexión con Meta se termina en el detalle del canal, que abre la pestaña
 * de la forma elegida.
 */
import { useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialogo, FormField, SegmentedControl } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import type { AIMode } from '@/lib/services/chatChannelsService';
import { CanalIcono, canalDeTipo } from '@/components/chat/ui/CanalIcono';
import { esCanalMeta, FORMAS_CONEXION, MODOS_IA, TIPOS_DISPONIBLES, type FormaConexion, type TipoDisponible } from './canalesLogica';

export interface NuevoCanal {
  tipo: TipoDisponible;
  nombre: string;
  modo: AIMode;
  forma: FormaConexion;
}

export interface DialogoNuevoCanalProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  tipoInicial?: TipoDisponible | null;
  onCrear: (datos: NuevoCanal) => Promise<void>;
}

export function DialogoNuevoCanal({ abierto, onAbiertoChange, tipoInicial, onCrear }: DialogoNuevoCanalProps) {
  const t = useTranslations('chatModulo.canales');
  const idTipo = useId();
  const idForma = useId();
  const [tipo, setTipo] = useState<TipoDisponible>('whatsapp');
  const [nombre, setNombre] = useState('');
  const [nombreTocado, setNombreTocado] = useState(false);
  const [forma, setForma] = useState<FormaConexion>('cloud_api');
  const [modo, setModo] = useState<AIMode>('hybrid');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    const inicial = tipoInicial ?? 'whatsapp';
    setTipo(inicial);
    setNombre(t(`nuevo.nombrePorDefecto.${inicial}`));
    setNombreTocado(false);
    setForma('cloud_api');
    setModo('hybrid');
    setError(null);
  }, [abierto, tipoInicial, t]);

  const elegirTipo = (nuevo: TipoDisponible) => {
    setTipo(nuevo);
    if (!nombreTocado) setNombre(t(`nuevo.nombrePorDefecto.${nuevo}`));
  };

  const crear = async () => {
    if (!nombre.trim()) {
      setError(t('nuevo.nombreObligatorio'));
      return;
    }
    setEnviando(true);
    try {
      await onCrear({ tipo, nombre: nombre.trim(), modo, forma });
      onAbiertoChange(false);
    } catch {
      // La página ya avisó con un toast; el diálogo queda abierto para reintentar.
    } finally {
      setEnviando(false);
    }
  };

  const textoPrimario = esCanalMeta(tipo) ? (tipo === 'whatsapp' && forma === 'qr_scan' ? t('nuevo.continuar') : t('nuevo.continuarMeta')) : t('nuevo.crear');

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(a) => !enviando && onAbiertoChange(a)}
      titulo={t('nuevo.titulo')}
      descripcion={t('nuevo.descripcion')}
      ancho={560}
      primario={{ etiqueta: textoPrimario, onClick: crear, cargando: enviando }}
    >
      <div className="flex flex-col gap-5">
        <div role="radiogroup" aria-labelledby={idTipo} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <span id={idTipo} className="sr-only">
            {t('nuevo.tipo')}
          </span>
          {TIPOS_DISPONIBLES.map((tp) => {
            const activo = tp === tipo;
            return (
              <button
                key={tp}
                type="button"
                role="radio"
                aria-checked={activo}
                onClick={() => elegirTipo(tp)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-xl border px-2 py-3 text-[13px] font-medium text-fg transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  activo ? 'border-brand bg-brand-tint ring-1 ring-brand' : 'border-line bg-surface hover:bg-hover',
                )}
              >
                <CanalIcono canal={canalDeTipo(tp)} size={32} className="rounded-lg" />
                {t(`tipos.${tp}`)}
              </button>
            );
          })}
        </div>

        <FormField etiqueta={t('nuevo.nombre')} obligatorio ayuda={t('nuevo.nombreAyuda')} error={error}>
          <Input
            value={nombre}
            maxLength={80}
            onChange={(e) => {
              setNombre(e.target.value);
              setNombreTocado(true);
              if (error) setError(null);
            }}
          />
        </FormField>

        {tipo === 'whatsapp' && (
          <div className="flex flex-col gap-2">
            <p id={idForma} className="text-[13px] font-medium text-fg">
              {t('nuevo.comoConecta')}
            </p>
            <div role="radiogroup" aria-labelledby={idForma} className="flex flex-col gap-2">
              {FORMAS_CONEXION.map((f) => {
                const activa = f === forma;
                return (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={activa}
                    onClick={() => setForma(f)}
                    className={cn(
                      'flex items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                      activa ? 'border-brand bg-brand-tint' : 'border-line bg-surface hover:bg-hover',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
                        activa ? 'border-brand' : 'border-line-strong',
                      )}
                    >
                      {activa && <span className="size-2 rounded-full bg-brand" />}
                    </span>
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-fg">
                        {t(`nuevo.formas.${f}`)}
                        {f === 'cloud_api' && (
                          <Badge tono="exito" tamano="sm">
                            {t('nuevo.recomendado')}
                          </Badge>
                        )}
                        {f === 'qr_scan' && (
                          <Badge tono="peligro" tamano="sm">
                            {t('nuevo.riesgo')}
                          </Badge>
                        )}
                      </span>
                      <span className="text-[13px] leading-5 text-fg-secondary">{t(`nuevo.formas.${f}Descripcion`)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <FormField etiqueta={t('nuevo.ayudaIa')}>
          {(campo) => (
            <SegmentedControl<AIMode>
              aria-labelledby={campo.idEtiqueta}
              anchoCompleto
              valor={modo}
              onValorChange={setModo}
              opciones={MODOS_IA.map((m) => ({ valor: m, etiqueta: t(`modosCorto.${m}`) }))}
            />
          )}
        </FormField>
      </div>
    </Dialogo>
  );
}
