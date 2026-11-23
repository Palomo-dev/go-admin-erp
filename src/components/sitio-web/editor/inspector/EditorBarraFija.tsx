'use client';

/**
 * «Acciones de producto › Barra fija al bajar» (Figma «16 Sitio web», propuesta 9 de 2836:69391:
 * K-E1 2859:71544 celular y K-E2 2859:71699 computador; aprobada por el dueño el 2026-11-23).
 *
 * Reemplaza el interruptor suelto «Barra fija en el celular» (`sticky_mobile`, que se sigue
 * guardando igual) por una sección con dos grupos:
 * - Celular: encendida, estilo (Plana = hoy, Flotante, Vidrio) con miniatura, qué muestra
 *   (miniatura y precio, cantidad, «Comprar ahora», corazón), texto del botón, cuándo aparece
 *   (a los 400 px = hoy, o al pasar el botón), al agregar (check = hoy, o vuela al carrito) y
 *   vibración suave.
 * - Computador (nueva, apagada por defecto): posición con miniatura (arriba bajo la cabecera,
 *   sugerida; en lugar de la cabecera; abajo flotante), estilo, qué muestra y cuándo aparece.
 *
 * Todo arranca con el valor de hoy y sin claves guardadas. Lectura y escritura:
 * `@/lib/website/v2/barraFija` (la misma copia que usa la tienda). No guarda: cada cambio va a
 * `onCambiar` (contenido del bloque), como el resto del inspector.
 */
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import { SegmentedControl } from '@/components/kit';
import { clasesBadgeTono } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  APARICIONES_BARRA_FIJA,
  EFECTOS_AGREGAR_BARRA_FIJA,
  ESTILOS_BARRA_FIJA,
  MAX_TEXTO_BARRA_FIJA,
  POSICIONES_BARRA_ESCRITORIO,
  TEXTO_BARRA_FIJA,
  contenidoConBarraFija,
  leerBarraFija,
  textoBarraLimpio,
  type AparicionBarraFija,
  type EfectoAgregarBarraFija,
  type EstiloBarraFija,
  type OpcionesBarraCelular,
  type OpcionesBarraEscritorio,
  type PosicionBarraEscritorio,
} from '@/lib/website/v2/barraFija';
import { EtiquetaGrupo, FilaInterruptor, TarjetaComposicion, TituloBloque } from './PartesZonaGlobal';

/**
 * Claves del contenido de `product_actions` que pinta esta sección: el inspector no las repite
 * como campo suelto (el interruptor de antes, «Barra fija en el celular»).
 */
export const CLAVES_BARRA_FIJA_EDITOR: readonly string[] = ['sticky_mobile'];

/** Textos: `sitioWeb.editor.barraFija.*` (es/en/fr/pt). */
function useT() {
  return useTranslations('sitioWeb.editor.barraFija');
}

type Dispositivo = 'celular' | 'computador';

const Ayuda = ({ children, id }: { children: ReactNode; id?: string }) => (
  <p id={id} className="text-[11px] leading-[14px] text-fg-muted">
    {children}
  </p>
);

/** «Hoy» (gris) o «Sugerida» (verde) bajo el nombre de la tarjeta. */
function Insignia({ tono, children }: { tono: 'neutro' | 'exito'; children: ReactNode }) {
  return <span className={clasesBadgeTono(tono, 'suave', 'sm')}>{children}</span>;
}

// ─── Miniaturas (Figma: tarjetas de estilo y de posición) ──────────────────────────────────

const Lineas = () => (
  <span className="absolute inset-x-3 top-2.5 flex flex-col gap-1">
    <span className="h-1 w-3/4 rounded-full bg-line-strong" />
    <span className="h-1 w-1/2 rounded-full bg-line-strong" />
    <span className="h-1 w-2/3 rounded-full bg-line-strong" />
  </span>
);

const BotonMini = () => (
  <>
    <span className="h-2 min-w-0 flex-1 rounded-sm bg-brand-action" />
    <span className="size-2 shrink-0 rounded-sm border border-line-strong bg-surface" />
  </>
);

export function MiniaturaEstiloBarra({ estilo }: { estilo: EstiloBarraFija }) {
  const barra =
    estilo === 'floating'
      ? 'inset-x-2 bottom-1.5 rounded-md border border-line shadow-md bg-surface'
      : estilo === 'glass'
        ? 'inset-x-0 bottom-0 border-t border-white/70 bg-white/60 backdrop-blur-sm'
        : 'inset-x-0 bottom-0 border-t border-line bg-surface';
  return (
    <span className="absolute inset-0" data-miniatura-estilo={estilo}>
      <Lineas />
      {estilo === 'glass' && <span className="absolute inset-x-3 bottom-2 h-3 rounded-sm bg-line-strong/70" />}
      <span className={cn('absolute flex items-center gap-1 px-2 py-1.5', barra)}>
        <BotonMini />
      </span>
    </span>
  );
}

export function MiniaturaPosicionBarra({ posicion }: { posicion: PosicionBarraEscritorio }) {
  return (
    <span className="absolute inset-0" data-miniatura-posicion={posicion}>
      {posicion !== 'replace' && <span className="absolute inset-x-0 top-0 h-2.5 bg-fg" />}
      {posicion === 'top' && (
        <span className="absolute inset-x-0 top-2.5 flex items-center justify-end gap-1 border-b border-line bg-surface px-2 py-1">
          <span className="h-1.5 w-6 rounded-sm bg-brand-action" />
        </span>
      )}
      {posicion === 'replace' && (
        <span className="absolute inset-x-0 top-0 flex items-center gap-1 border-b border-line bg-surface px-2 py-1">
          <span className="size-1.5 rounded-sm bg-brand-action" />
          <span className="h-1.5 flex-1" />
          <span className="h-1.5 w-6 rounded-sm bg-brand-action" />
        </span>
      )}
      <span className={cn('absolute inset-x-3 flex flex-col gap-1', posicion === 'top' ? 'top-8' : 'top-6')}>
        <span className="h-1 w-3/4 rounded-full bg-line-strong" />
        <span className="h-1 w-1/2 rounded-full bg-line-strong" />
      </span>
      {posicion === 'bottom' && (
        <span className="absolute inset-x-3 bottom-1.5 flex items-center justify-end gap-1 rounded-full border border-line bg-surface px-2 py-1 shadow-md">
          <span className="h-1.5 w-6 rounded-full bg-brand-action" />
        </span>
      )}
    </span>
  );
}

// ─── Sección ────────────────────────────────────────────────────────────────────────────────

export interface EditorBarraFijaProps {
  contenido: Record<string, unknown>;
  onCambiar: (contenido: Record<string, unknown>) => void;
}

export function EditorBarraFija({ contenido, onCambiar }: EditorBarraFijaProps) {
  const t = useT();
  const idTitulo = useId();
  const [dispositivo, setDispositivo] = useState<Dispositivo>('celular');
  const leida = useMemo(() => leerBarraFija(contenido), [contenido]);
  const cambiarCelular = (cambio: Partial<OpcionesBarraCelular>) => onCambiar(contenidoConBarraFija(contenido, { celular: cambio }));
  const cambiarEscritorio = (cambio: Partial<OpcionesBarraEscritorio>) => onCambiar(contenidoConBarraFija(contenido, { escritorio: cambio }));

  return (
    <section className="flex flex-col gap-3" aria-labelledby={idTitulo} data-editor-barra-fija="">
      <span id={idTitulo}>
        <TituloBloque>{t('titulo')}</TituloBloque>
      </span>
      <SegmentedControl<Dispositivo>
        aria-labelledby={idTitulo}
        tamano="sm"
        anchoCompleto
        valor={dispositivo}
        onValorChange={setDispositivo}
        opciones={[
          { valor: 'celular', etiqueta: t('celular') },
          { valor: 'computador', etiqueta: t('computador') },
        ]}
      />
      {dispositivo === 'celular' ? (
        <PanelCelular op={leida.celular} onCambiar={cambiarCelular} />
      ) : (
        <PanelComputador op={leida.escritorio} onCambiar={cambiarEscritorio} />
      )}
    </section>
  );
}

function Segmentos<T extends string>({ etiqueta, valor, opciones, onCambiar, ayuda }: { etiqueta: string; valor: T; opciones: { valor: T; etiqueta: string }[]; onCambiar: (v: T) => void; ayuda?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <EtiquetaGrupo id={id}>{etiqueta}</EtiquetaGrupo>
      <SegmentedControl<T> aria-labelledby={id} tamano="sm" anchoCompleto tonoActivo="marca" valor={valor} onValorChange={onCambiar} opciones={opciones} />
      {ayuda && <Ayuda>{ayuda}</Ayuda>}
    </div>
  );
}

function PanelCelular({ op, onCambiar }: { op: OpcionesBarraCelular; onCambiar: (cambio: Partial<OpcionesBarraCelular>) => void }) {
  const t = useT();
  const idEstilo = useId();
  const idTexto = useId();
  // Lo escrito se guarda limpio: el campo conserva lo que se teclea y se pone al día si cambia por fuera.
  const [texto, setTexto] = useState(op.texto ?? '');
  useEffect(() => {
    setTexto((v) => (textoBarraLimpio(v) === op.texto ? v : (op.texto ?? '')));
  }, [op.texto]);

  return (
    <div className="flex flex-col gap-4" data-panel-barra="celular">
      <FilaInterruptor titulo={t('celularEncendida')} ayuda={t('celularAyuda')} valor={op.encendida} onCambiar={(v) => onCambiar({ encendida: v })} />
      {op.encendida && (
        <>
          <div className="flex flex-col gap-2">
            <EtiquetaGrupo id={idEstilo}>{t('estilo')}</EtiquetaGrupo>
            <div role="radiogroup" aria-labelledby={idEstilo} className="grid grid-cols-3 gap-2">
              {ESTILOS_BARRA_FIJA.map((e) => (
                <div key={e} className="flex flex-col gap-1">
                  <TarjetaComposicion etiqueta={t(`estilos.${e}`)} seleccionada={op.estilo === e} onElegir={() => onCambiar({ estilo: e })}>
                    <MiniaturaEstiloBarra estilo={e} />
                  </TarjetaComposicion>
                  {e === 'flat' && (
                    <span className="px-1">
                      <Insignia tono="neutro">{t('hoy')}</Insignia>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <EtiquetaGrupo>{t('queMuestra')}</EtiquetaGrupo>
            <FilaInterruptor titulo={t('miniaturaPrecio')} valor={op.miniatura} onCambiar={(v) => onCambiar({ miniatura: v })} nuevo />
            <FilaInterruptor titulo={t('cantidad')} valor={op.cantidad} onCambiar={(v) => onCambiar({ cantidad: v })} nuevo />
            <FilaInterruptor titulo={t('comprarAhora')} valor={op.comprarAhora} onCambiar={(v) => onCambiar({ comprarAhora: v })} nuevo />
            <FilaInterruptor titulo={t('favorito')} ayuda={t('favoritoAyuda')} valor={op.favorito} onCambiar={(v) => onCambiar({ favorito: v })} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={idTexto} className="text-xs font-semibold leading-4 text-fg-secondary">
              {t('texto')}
            </label>
            <Input
              id={idTexto}
              value={texto}
              maxLength={MAX_TEXTO_BARRA_FIJA}
              placeholder={TEXTO_BARRA_FIJA}
              aria-describedby={`${idTexto}-ayuda`}
              onChange={(e) => {
                setTexto(e.target.value);
                onCambiar({ texto: textoBarraLimpio(e.target.value) });
              }}
            />
            <Ayuda id={`${idTexto}-ayuda`}>{t('textoAyuda', { max: MAX_TEXTO_BARRA_FIJA, texto: TEXTO_BARRA_FIJA })}</Ayuda>
          </div>

          <Segmentos<AparicionBarraFija>
            etiqueta={t('aparece')}
            valor={op.aparece}
            onCambiar={(v) => onCambiar({ aparece: v })}
            opciones={APARICIONES_BARRA_FIJA.map((v) => ({ valor: v, etiqueta: t(`apariciones.${v}`) }))}
            ayuda={op.aparece === 'pass' ? t('aparecePasarAyuda') : undefined}
          />
          <Segmentos<EfectoAgregarBarraFija>
            etiqueta={t('alAgregar')}
            valor={op.alAgregar}
            onCambiar={(v) => onCambiar({ alAgregar: v })}
            opciones={EFECTOS_AGREGAR_BARRA_FIJA.map((v) => ({ valor: v, etiqueta: t(`efectos.${v}`) }))}
            ayuda={op.alAgregar === 'fly' ? t('vuelaAyuda') : undefined}
          />
          <FilaInterruptor titulo={t('vibracion')} ayuda={t('vibracionAyuda')} valor={op.vibracion} onCambiar={(v) => onCambiar({ vibracion: v })} nuevo />
          <Ayuda>{t('chatAyuda')}</Ayuda>
        </>
      )}
    </div>
  );
}

function PanelComputador({ op, onCambiar }: { op: OpcionesBarraEscritorio; onCambiar: (cambio: Partial<OpcionesBarraEscritorio>) => void }) {
  const t = useT();
  const idPosicion = useId();
  return (
    <div className="flex flex-col gap-4" data-panel-barra="computador">
      <FilaInterruptor titulo={t('computadorEncendida')} ayuda={t('computadorAyuda')} valor={op.encendida} onCambiar={(v) => onCambiar({ encendida: v })} nuevo />
      {op.encendida && (
        <>
          <div className="flex flex-col gap-2">
            <EtiquetaGrupo id={idPosicion}>{t('posicion')}</EtiquetaGrupo>
            <div role="radiogroup" aria-labelledby={idPosicion} className="grid grid-cols-3 gap-2">
              {POSICIONES_BARRA_ESCRITORIO.map((p) => (
                <div key={p} className="flex flex-col gap-1">
                  <TarjetaComposicion etiqueta={t(`posiciones.${p}`)} seleccionada={op.posicion === p} onElegir={() => onCambiar({ posicion: p })}>
                    <MiniaturaPosicionBarra posicion={p} />
                  </TarjetaComposicion>
                  {p === 'top' && (
                    <span className="px-1">
                      <Insignia tono="exito">{t('sugerida')}</Insignia>
                    </span>
                  )}
                </div>
              ))}
            </div>
            <Ayuda>{t(`posicionesAyuda.${op.posicion}`)}</Ayuda>
          </div>

          <Segmentos<EstiloBarraFija>
            etiqueta={t('estilo')}
            valor={op.estilo}
            onCambiar={(v) => onCambiar({ estilo: v })}
            opciones={ESTILOS_BARRA_FIJA.map((v) => ({ valor: v, etiqueta: t(`estilos.${v}`) }))}
          />

          <div className="flex flex-col gap-3">
            <EtiquetaGrupo>{t('queMuestra')}</EtiquetaGrupo>
            <FilaInterruptor titulo={t('miniaturaNombre')} valor={op.miniatura} onCambiar={(v) => onCambiar({ miniatura: v })} />
            <FilaInterruptor titulo={t('precio')} valor={op.precio} onCambiar={(v) => onCambiar({ precio: v })} />
            <FilaInterruptor titulo={t('variante')} ayuda={t('varianteAyuda')} valor={op.variante} onCambiar={(v) => onCambiar({ variante: v })} />
            <FilaInterruptor titulo={t('cantidad')} valor={op.cantidad} onCambiar={(v) => onCambiar({ cantidad: v })} />
            <FilaInterruptor titulo={t('comprarAhora')} valor={op.comprarAhora} onCambiar={(v) => onCambiar({ comprarAhora: v })} />
            <FilaInterruptor titulo={t('favorito')} ayuda={t('favoritoAyuda')} valor={op.favorito} onCambiar={(v) => onCambiar({ favorito: v })} />
          </div>

          <Segmentos<AparicionBarraFija>
            etiqueta={t('aparece')}
            valor={op.aparece}
            onCambiar={(v) => onCambiar({ aparece: v })}
            opciones={APARICIONES_BARRA_FIJA.map((v) => ({ valor: v, etiqueta: t(`aparicionesComputador.${v}`) }))}
            ayuda={op.aparece === 'pass' ? t('aparecePasarAyuda') : undefined}
          />
          <Ayuda>{t('compartidoAyuda')}</Ayuda>
        </>
      )}
    </div>
  );
}
