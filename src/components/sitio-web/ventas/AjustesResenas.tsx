'use client';

/**
 * «Ajustes de reseñas» (Figma «16 Sitio web» 3131-92277): hoja de Sitio web › Tienda › Reseñas.
 * Valen para toda la tienda y se guardan con «Guardar» (no en vivo), por
 * `/api/sitio-web/tienda/ajustes-resenas` (permiso `website.sites.edit`).
 *
 * - Origen: solo se muestra; se elige en el editor (sección Reseñas de Producto).
 * - Publicación: moderar (el mismo `reviews_auto_approve`, al revés), quién puede escribir y fotos.
 * - Pedir opinión por correo: encendido, días después de entregado (1-30) y un recordatorio.
 * - Remitente: siempre el de la tienda; sin dominio verificado, la dirección de respaldo.
 * Textos: `sitioWeb.resenas.ajustes.*` (es/en/fr/pt).
 */
import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { BadgeCheck, ExternalLink, Mail, Minus, Plus, Settings } from 'lucide-react';
import { EmptyState, PanelAdaptable, SegmentedControl, clasesBoton } from '@/components/kit';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { grupoOrigenResenas } from '@/lib/website/v2/seccionesFicha';
import { DIAS_CORREO_MAX, DIAS_CORREO_MIN, type CambiosAjustesResenas, type QuienEscribe } from '@/lib/website/ajustesResenas';
import { cn } from '@/utils/Utils';
import { useAjustesResenas } from './useTiendaSitio';

interface Borrador {
  moderar: boolean;
  quienEscribe: QuienEscribe;
  fotos: boolean;
  activo: boolean;
  dias: number;
  recordatorio: boolean;
}

function FilaSwitch({ titulo, ayuda, valor, onCambiar, deshabilitado }: { titulo: string; ayuda: string; valor: boolean; onCambiar: (v: boolean) => void; deshabilitado: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={id} className="text-sm font-medium text-fg">{titulo}</label>
        <p className="text-[13px] leading-[18px] text-fg-secondary">{ayuda}</p>
      </div>
      <Switch id={id} checked={valor} onCheckedChange={onCambiar} disabled={deshabilitado} />
    </div>
  );
}

/** «− 7 +» de 1 a 30. */
export function ContadorDias({ valor, onCambiar, etiqueta, menos, mas, deshabilitado }: { valor: number; onCambiar: (v: number) => void; etiqueta: string; menos: string; mas: string; deshabilitado?: boolean }) {
  const boton = 'flex h-9 w-9 items-center justify-center text-fg-secondary hover:bg-hover disabled:opacity-40';
  return (
    <div role="group" aria-label={etiqueta} className="inline-flex items-center overflow-hidden rounded-lg border border-line bg-surface">
      <button type="button" className={boton} aria-label={menos} disabled={deshabilitado || valor <= DIAS_CORREO_MIN} onClick={() => onCambiar(Math.max(DIAS_CORREO_MIN, valor - 1))}>
        <Minus aria-hidden="true" className="size-4" strokeWidth={1.5} />
      </button>
      <input
        type="number"
        inputMode="numeric"
        aria-label={etiqueta}
        min={DIAS_CORREO_MIN}
        max={DIAS_CORREO_MAX}
        value={valor}
        disabled={deshabilitado}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isInteger(n)) onCambiar(Math.min(DIAS_CORREO_MAX, Math.max(DIAS_CORREO_MIN, n)));
        }}
        className="h-9 w-12 border-x border-line bg-surface text-center text-sm tabular-nums text-fg [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button type="button" className={boton} aria-label={mas} disabled={deshabilitado || valor >= DIAS_CORREO_MAX} onClick={() => onCambiar(Math.min(DIAS_CORREO_MAX, valor + 1))}>
        <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}

export function AjustesResenasHoja({
  abierto,
  onAbiertoChange,
  rutaEditor,
  alGuardar,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  /** Editor de la ficha (sección Reseñas de Producto), si el sitio la tiene. */
  rutaEditor: string | null;
  alGuardar?: () => void;
}) {
  const t = useTranslations('sitioWeb.resenas');
  const { toast } = useToast();
  const { datos, cargando, fallo, recargar, guardar } = useAjustesResenas(abierto);
  const [b, setB] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const idQuien = useId();

  useEffect(() => {
    if (datos) {
      setB({
        moderar: datos.moderar,
        quienEscribe: datos.quienEscribe,
        fotos: datos.fotos,
        activo: datos.correo.activo,
        dias: datos.correo.dias,
        recordatorio: datos.correo.recordatorio,
      });
    }
  }, [datos]);

  const editable = !!datos?.puedeEditar && !guardando;
  const poner = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setB((x) => (x ? { ...x, [k]: v } : x));

  const onGuardar = async () => {
    if (!b) return;
    const cambios: CambiosAjustesResenas = {
      moderar: b.moderar,
      quienEscribe: b.quienEscribe,
      fotos: b.fotos,
      correo: { activo: b.activo, dias: b.dias, recordatorio: b.recordatorio },
    };
    setGuardando(true);
    try {
      await guardar(cambios);
      toast({ title: t('ajustes.guardado') });
      alGuardar?.();
      onAbiertoChange(false);
    } catch (error) {
      toast({ title: t('ajustes.error', { mensaje: (error as Error).message }), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };

  const grupo = grupoOrigenResenas(datos?.origenTienda ?? 'generated');

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('ajustes.titulo')}
      descripcion={t('ajustes.descripcion')}
      icono={Settings}
      ocupado={guardando}
      pie={
        <>
          <button type="button" onClick={() => onAbiertoChange(false)} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
            {t('ajustes.cancelar')}
          </button>
          <button type="button" onClick={() => void onGuardar()} disabled={!b || !editable} className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
            {t('ajustes.guardar')}
          </button>
        </>
      }
    >
      {fallo ? (
        <EmptyState variante="error" titulo={t('ajustes.errorCarga')} accion={{ etiqueta: t('ajustes.reintentar'), onClick: () => void recargar() }} />
      ) : cargando || !b || !datos ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {!datos.puedeEditar && <p className="text-xs text-fg-secondary">{t('ajustes.soloLectura')}</p>}
          <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-line bg-subtle p-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fg">{t('ajustes.origen', { origen: t(`origen.nombres.${grupo === 'hasta_n' ? 'hastaN' : grupo}`) })}</p>
              <p className="text-[13px] text-fg-secondary">{t('ajustes.origenAyuda')}</p>
            </div>
            {rutaEditor && (
              <Link href={rutaEditor} className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-action hover:underline">
                {t('ajustes.abrirEditor')}
                <ExternalLink aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
              </Link>
            )}
          </div>

          <section className="flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-fg">{t('ajustes.publicacion')}</h3>
            <FilaSwitch titulo={t('ajustes.moderar')} ayuda={t('ajustes.moderarAyuda')} valor={b.moderar} onCambiar={(v) => poner('moderar', v)} deshabilitado={!editable} />
            <div className="flex flex-col gap-1.5">
              <span id={idQuien} className="text-sm font-medium text-fg">{t('ajustes.quien')}</span>
              <SegmentedControl<QuienEscribe>
                aria-labelledby={idQuien}
                anchoCompleto
                tamano="sm"
                valor={b.quienEscribe}
                onValorChange={(v) => editable && poner('quienEscribe', v)}
                opciones={[
                  { valor: 'any', etiqueta: t('ajustes.cualquiera') },
                  { valor: 'buyers', etiqueta: t('ajustes.compradores') },
                ]}
              />
              <p className="text-[13px] leading-[18px] text-fg-secondary">{t('ajustes.quienAyuda')}</p>
            </div>
            <FilaSwitch titulo={t('ajustes.fotos')} ayuda={t('ajustes.fotosAyuda')} valor={b.fotos} onCambiar={(v) => poner('fotos', v)} deshabilitado={!editable} />
          </section>

          <section className="flex flex-col gap-4 border-t border-line pt-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
              <Mail aria-hidden="true" className="size-4 text-fg-secondary" strokeWidth={1.5} />
              {t('ajustes.correo')}
            </h3>
            <FilaSwitch titulo={t('ajustes.enviar')} ayuda={t('ajustes.enviarAyuda')} valor={b.activo} onCambiar={(v) => poner('activo', v)} deshabilitado={!editable} />
            <div className={cn('flex flex-col gap-1.5', !b.activo && 'opacity-60')}>
              <span className="text-sm font-medium text-fg">{t('ajustes.dias')}</span>
              <ContadorDias valor={b.dias} onCambiar={(v) => poner('dias', v)} etiqueta={t('ajustes.dias')} menos={t('ajustes.menos')} mas={t('ajustes.mas')} deshabilitado={!editable || !b.activo} />
              <p className="text-[13px] leading-[18px] text-fg-secondary">{t('ajustes.diasAyuda')}</p>
            </div>
            <div className={cn(!b.activo && 'opacity-60')}>
              <FilaSwitch titulo={t('ajustes.recordatorio')} ayuda={t('ajustes.recordatorioAyuda')} valor={b.recordatorio} onCambiar={(v) => poner('recordatorio', v)} deshabilitado={!editable || !b.activo} />
            </div>
            <div className="rounded-lg border border-line bg-subtle p-3">
              <p className="text-xs text-fg-secondary">{t('ajustes.remitente')}</p>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-fg">
                  {datos.remitente.nombre}
                  {datos.remitente.correo ? ` <${datos.remitente.correo}>` : ''}
                </p>
                {datos.remitente.dominioVerificado && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success-subtle px-2 py-0.5 text-xs text-success-text">
                    <BadgeCheck aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
                    {t('ajustes.dominioVerificado')}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-fg-secondary">{t('ajustes.sinDominio')}</p>
            </div>
          </section>
        </div>
      )}
    </PanelAdaptable>
  );
}
