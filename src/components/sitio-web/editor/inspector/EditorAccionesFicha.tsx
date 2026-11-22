'use client';

/**
 * «Ficha de producto › Acciones de compra», pestaña Contenido (Figma «16 Sitio web», frames D
 * 2787:66244, 2788:66782 y 2789:67326; aprobado por el dueño el 2026-11-22):
 * - «Distribución lista»: 6 tarjetas con su miniatura (Editor/Miniatura de distribución). Elegir
 *   una reacomoda los botones y CONSERVA los textos escritos. Si la lista ya no coincide con
 *   ninguna, la etiqueta dice «Personalizada».
 * - «Botones y orden»: lista arrastrable (Editor/Fila de botón de la ficha). Los botones que
 *   comparten fila van en el mismo recuadro azul. Cada uno: mostrar/ocultar («Agregar al
 *   carrito» no se oculta), tamaño, estilo, texto, texto corto del celular y «Compartir fila con
 *   el siguiente».
 * - Aviso si «Pedir por WhatsApp» se muestra y el sitio no tiene número (Configuración › Contacto).
 *
 * No guarda: cada cambio va a `onCambiar` (contenido del bloque) y el lienzo lo pinta en vivo,
 * como el resto del inspector. Lectura, distribuciones y regla de filas:
 * `@/lib/website/v2/accionesFicha` (la misma copia que usa la tienda).
 */
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Eye, EyeOff, Heart, Minus, Share2, ShoppingCart, Zap, MessageCircle } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { AvisoTonal, SegmentedControl, clasesBoton } from '@/components/kit';
import { AsaArrastre, CLASES_HUECO, Ordenable, ZonaOrdenable } from '@/components/kit/arrastreTabla';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { RAIZ_SITIO_WEB } from '@/components/sitio-web/rutasSitioWeb';
import {
  DISTRIBUCIONES,
  DISTRIBUCIONES_FICHA,
  ESTILOS_ACCION_FICHA,
  MAX_TEXTO_ACCION_FICHA,
  MAX_TEXTO_CORTO_ACCION_FICHA,
  TAMANOS_ACCION_FICHA,
  TEXTOS_ACCION_FICHA,
  TIPOS_SIEMPRE_VISIBLES,
  accionesVisibles,
  aplicarDistribucion,
  armarFilas,
  cambiarAccion,
  contenidoConAcciones,
  formaDe,
  leerAccionesFicha,
  moverAccion,
  numeroWhatsappFicha,
  type AccionFicha,
  type DistribucionFicha,
  type EstiloAccionFicha,
  type TamanoAccionFicha,
  type TipoAccionFicha,
} from '@/lib/website/v2/accionesFicha';
import { EtiquetaGrupo, InsigniaNuevo, TarjetaComposicion, TituloBloque } from './PartesZonaGlobal';

/** Configuración › Contacto: donde se escribe el número de WhatsApp del sitio. */
export const RUTA_CONTACTO_SITIO = `${RAIZ_SITIO_WEB}/configuracion`;

/** Textos: `sitioWeb.editor.accionesFicha.*` (es/en/fr/pt). */
function useT() {
  return useTranslations('sitioWeb.editor.accionesFicha');
}

const ICONOS: Record<TipoAccionFicha, typeof ShoppingCart> = {
  cantidad: Minus,
  agregar: ShoppingCart,
  comprar: Zap,
  favorito: Heart,
  whatsapp: MessageCircle,
  compartir: Share2,
};

/** Como lo guarda el contrato: sin espacios de más. */
const limpio = (v: string) => v.trim().replace(/\s+/g, ' ');

const Ayuda = ({ children, id }: { children: ReactNode; id?: string }) => (
  <p id={id} className="text-[11px] leading-[14px] text-fg-muted">
    {children}
  </p>
);

// ─── Miniatura de distribución (Figma 2786:66410) ──────────────────────────────────────────

/** Una pieza de la miniatura según forma y estilo del botón. */
function PiezaMiniatura({ accion }: { accion: AccionFicha }) {
  const forma = formaDe(accion);
  if (forma === 'cantidad') return <span className="h-3 w-7 shrink-0 rounded-sm border border-line-strong bg-surface" />;
  if (forma === 'pequeno') return <span className="size-3 shrink-0 rounded-sm border border-line-strong bg-surface" />;
  const verde = accion.tipo === 'whatsapp';
  if (accion.estilo === 'enlace') {
    return (
      <span className="flex h-3 min-w-0 flex-1 items-center justify-center">
        <span className={cn('h-[2px] w-1/2 rounded-full', verde ? 'bg-emerald-600' : 'bg-brand-action')} />
      </span>
    );
  }
  if (accion.estilo === 'borde') {
    return <span className={cn('h-3 min-w-0 flex-1 rounded-sm border bg-surface', verde ? 'border-emerald-600' : 'border-brand-action')} />;
  }
  const neutro = accion.tipo === 'favorito' || accion.tipo === 'compartir';
  return <span className={cn('h-3 min-w-0 flex-1 rounded-sm', verde ? 'bg-emerald-600' : neutro ? 'bg-line-strong' : 'bg-brand-action')} />;
}

export function MiniaturaDistribucion({ acciones }: { acciones: readonly AccionFicha[] }) {
  const filas = armarFilas(accionesVisibles(acciones));
  return (
    <span className="absolute inset-0 flex flex-col justify-center gap-1 px-3">
      {filas.map((fila, i) => (
        <span key={i} className="flex items-center gap-1">
          {fila.map((a) => (
            <PiezaMiniatura key={a.tipo} accion={a} />
          ))}
        </span>
      ))}
    </span>
  );
}

// ─── Fila de botón (Figma 2786:66264) ──────────────────────────────────────────────────────

interface FilaBotonProps {
  accion: AccionFicha;
  /** El elemento siguiente de la lista (para «Compartir fila»). */
  siguiente: AccionFicha | null;
  abierta: boolean;
  onAbrir: () => void;
  onCambiar: (cambio: Partial<Omit<AccionFicha, 'tipo'>>) => void;
  asa: ReactNode;
  sinNumeroWhatsapp: boolean;
}

function FilaBoton({ accion, siguiente, abierta, onAbrir, onCambiar, asa, sinNumeroWhatsapp }: FilaBotonProps) {
  const t = useT();
  const idPanel = useId();
  const nombre = t(`tipos.${accion.tipo}`);
  const Icono = ICONOS[accion.tipo];
  const fija = TIPOS_SIEMPRE_VISIBLES.includes(accion.tipo);
  const esCantidad = accion.tipo === 'cantidad';
  const porDefecto = TEXTOS_ACCION_FICHA[accion.tipo];
  // Lo escrito se guarda limpio (sin espacios de más): el campo conserva lo que se teclea y se
  // pone al día si el texto cambia por fuera (deshacer, otra distribución).
  const [texto, setTexto] = useState(accion.texto ?? '');
  const [corto, setCorto] = useState(accion.textoCorto ?? '');
  useEffect(() => {
    setTexto((v) => (limpio(v) === (accion.texto ?? '') ? v : (accion.texto ?? '')));
  }, [accion.texto]);
  useEffect(() => {
    setCorto((v) => (limpio(v) === (accion.textoCorto ?? '') ? v : (accion.textoCorto ?? '')));
  }, [accion.textoCorto]);
  return (
    <div className={cn('rounded-lg border border-line bg-surface', !accion.visible && 'opacity-60')} data-accion={accion.tipo}>
      <div className="flex items-center gap-1 py-1 pl-1 pr-1.5">
        {asa}
        <Icono aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
        <span className="ml-1 min-w-0 flex-1 truncate text-[13px] font-medium leading-[18px] text-fg">{nombre}</span>
        <span className="shrink-0 rounded-full bg-subtle px-2 py-0.5 text-[11px] leading-[14px] text-fg-secondary">
          {esCantidad ? t('conEtiqueta') : t(`tamanos.${accion.tamano}`)}
        </span>
        <button
          type="button"
          onClick={() => !fija && onCambiar({ visible: !accion.visible })}
          disabled={fija}
          aria-pressed={accion.visible}
          aria-label={fija ? t('noSeOculta') : accion.visible ? t('ocultar', { nombre }) : t('mostrarBoton', { nombre })}
          title={fija ? t('noSeOculta') : undefined}
          className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'w-8 shrink-0 px-0 disabled:opacity-40')}
        >
          {accion.visible ? <Eye aria-hidden="true" className="size-4" strokeWidth={1.5} /> : <EyeOff aria-hidden="true" className="size-4" strokeWidth={1.5} />}
        </button>
        <button
          type="button"
          onClick={onAbrir}
          aria-expanded={abierta}
          aria-controls={idPanel}
          aria-label={t('abrir', { nombre })}
          className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'w-8 shrink-0 px-0')}
        >
          <ChevronDown aria-hidden="true" className={cn('size-4 transition-transform', abierta && 'rotate-180')} strokeWidth={1.5} />
        </button>
      </div>

      {accion.tipo === 'whatsapp' && accion.visible && sinNumeroWhatsapp && (
        <div className="px-2 pb-2">
          <AvisoTonal
            tono="advertencia"
            compacto
            titulo={t('sinWhatsapp.titulo')}
            descripcion={t('sinWhatsapp.descripcion')}
            accion={{ etiqueta: t('sinWhatsapp.ir'), href: RUTA_CONTACTO_SITIO, externo: true }}
          />
        </div>
      )}

      {abierta && (
        <div id={idPanel} className="flex flex-col gap-3 border-t border-line px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor={`${idPanel}-ver`} className={cn('text-[13px] font-medium leading-[18px] text-fg', fija && 'opacity-60')}>
              {t('mostrar')}
            </label>
            <Switch id={`${idPanel}-ver`} checked={accion.visible} disabled={fija} onCheckedChange={(v) => onCambiar({ visible: v })} />
          </div>
          {fija && <Ayuda>{t('noSeOculta')}</Ayuda>}

          {esCantidad ? (
            <Ayuda>{t('ayudaCantidad')}</Ayuda>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <EtiquetaGrupo id={`${idPanel}-tamano`}>{t('tamano')}</EtiquetaGrupo>
                <SegmentedControl<TamanoAccionFicha>
                  aria-labelledby={`${idPanel}-tamano`}
                  tamano="sm"
                  anchoCompleto
                  tonoActivo="marca"
                  valor={accion.tamano}
                  onValorChange={(v) => onCambiar({ tamano: v })}
                  opciones={TAMANOS_ACCION_FICHA.map((v) => ({ valor: v, etiqueta: t(`tamanos.${v}`) }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <EtiquetaGrupo id={`${idPanel}-estilo`}>{t('estilo')}</EtiquetaGrupo>
                <SegmentedControl<EstiloAccionFicha>
                  aria-labelledby={`${idPanel}-estilo`}
                  tamano="sm"
                  anchoCompleto
                  tonoActivo="marca"
                  valor={accion.estilo}
                  onValorChange={(v) => onCambiar({ estilo: v })}
                  opciones={ESTILOS_ACCION_FICHA.map((v) => ({ valor: v, etiqueta: t(`estilos.${v}`) }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${idPanel}-texto`} className="text-xs font-semibold leading-4 text-fg-secondary">
                  {t('texto')}
                </label>
                <Input
                  id={`${idPanel}-texto`}
                  value={texto}
                  maxLength={MAX_TEXTO_ACCION_FICHA}
                  placeholder={porDefecto.texto}
                  aria-describedby={`${idPanel}-texto-ayuda`}
                  onChange={(e) => {
                    setTexto(e.target.value);
                    onCambiar({ texto: e.target.value });
                  }}
                />
                <Ayuda id={`${idPanel}-texto-ayuda`}>{t('ayudaTexto', { texto: porDefecto.texto })}</Ayuda>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${idPanel}-corto`} className="text-xs font-semibold leading-4 text-fg-secondary">
                  {t('textoCorto')}
                </label>
                <Input
                  id={`${idPanel}-corto`}
                  value={corto}
                  maxLength={MAX_TEXTO_CORTO_ACCION_FICHA}
                  placeholder={porDefecto.corto}
                  aria-describedby={`${idPanel}-corto-ayuda`}
                  onChange={(e) => {
                    setCorto(e.target.value);
                    onCambiar({ textoCorto: e.target.value });
                  }}
                />
                <Ayuda id={`${idPanel}-corto-ayuda`}>{t('ayudaTextoCorto')}</Ayuda>
              </div>
              {accion.tipo === 'favorito' && <Ayuda>{t('ayudaFavorito')}</Ayuda>}
            </>
          )}

          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <label htmlFor={`${idPanel}-fila`} className={cn('text-[13px] font-medium leading-[18px] text-fg', !siguiente && 'opacity-60')}>
                {t('compartirFila')}
              </label>
              <Ayuda>{siguiente ? t('ayudaCompartirFila', { siguiente: t(`tipos.${siguiente.tipo}`) }) : t('ultimo')}</Ayuda>
            </div>
            <Switch
              id={`${idPanel}-fila`}
              checked={!!accion.compartirFila}
              disabled={!siguiente}
              onCheckedChange={(v) => onCambiar({ compartirFila: v })}
              className="mt-0.5 shrink-0"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Editor ─────────────────────────────────────────────────────────────────────────────────

export interface EditorAccionesFichaProps {
  contenido: Record<string, unknown>;
  onCambiar: (contenido: Record<string, unknown>) => void;
  /** Número de WhatsApp del sitio (`whatsapp_number` de los ajustes). */
  numeroWhatsapp: unknown;
}

/**
 * Grupos visuales de la lista: los botones seguidos que la tienda pone en la misma fila van en un
 * recuadro azul. Un oculto entre medio corta el recuadro (no cuenta para las filas).
 */
function gruposDeLista(acciones: readonly AccionFicha[]): AccionFicha[][] {
  const filas = armarFilas(accionesVisibles(acciones));
  const filaDe = new Map<TipoAccionFicha, number>();
  filas.forEach((f, i) => f.forEach((a) => filaDe.set(a.tipo, i)));
  const grupos: AccionFicha[][] = [];
  let previa: AccionFicha | null = null;
  for (const a of acciones) {
    const fila = filaDe.get(a.tipo);
    const junto = previa && fila !== undefined && filaDe.get(previa.tipo) === fila;
    if (junto) grupos[grupos.length - 1].push(a);
    else grupos.push([a]);
    previa = a;
  }
  return grupos;
}

export function EditorAccionesFicha({ contenido, onCambiar, numeroWhatsapp }: EditorAccionesFichaProps) {
  const t = useT();
  const leidas = useMemo(() => leerAccionesFicha(contenido), [contenido]);
  const { acciones, preset } = leidas;
  const [abierta, setAbierta] = useState<TipoAccionFicha | null>(null);
  const sinNumeroWhatsapp = numeroWhatsappFicha(numeroWhatsapp) === null;
  const idDistribucion = useId();

  const guardar = (lista: AccionFicha[]) => onCambiar(contenidoConAcciones(contenido, lista));
  const elegir = (d: DistribucionFicha) => guardar(aplicarDistribucion(acciones, d));
  const grupos = gruposDeLista(acciones);
  const ids = acciones.map((a) => a.tipo);
  const nombre = (tipo: string) => t(`tipos.${tipo}`);

  const pintarFila = (a: AccionFicha, i: number) => (
    <Ordenable key={a.tipo} id={a.tipo}>
      {(fila) => (
        <div ref={fila.ref} style={fila.estilo} className={cn('rounded-lg', fila.arrastrando && CLASES_HUECO)}>
          <FilaBoton
            accion={a}
            siguiente={acciones[i + 1] ?? null}
            abierta={abierta === a.tipo}
            onAbrir={() => setAbierta((x) => (x === a.tipo ? null : a.tipo))}
            onCambiar={(cambio) => guardar(cambiarAccion(acciones, a.tipo, cambio))}
            asa={<AsaArrastre asa={fila.asa} nombre={nombre(a.tipo)} />}
            sinNumeroWhatsapp={sinNumeroWhatsapp}
          />
        </div>
      )}
    </Ordenable>
  );

  return (
    <div className="flex flex-col gap-4" data-editor-acciones-ficha="">
      <section className="flex flex-col gap-2" aria-labelledby={idDistribucion}>
        <div className="flex items-center gap-2">
          <span id={idDistribucion}>
            <TituloBloque>{t('distribucion')}</TituloBloque>
          </span>
          {preset === 'personalizada' ? (
            <span className="rounded-full bg-subtle px-2 py-0.5 text-[11px] font-medium leading-[14px] text-fg-secondary">{t('personalizada')}</span>
          ) : (
            <InsigniaNuevo />
          )}
        </div>
        <div role="radiogroup" aria-labelledby={idDistribucion} className="grid grid-cols-2 gap-2">
          {DISTRIBUCIONES_FICHA.map((d) => (
            <TarjetaComposicion key={d} etiqueta={t(`distribuciones.${d}`)} seleccionada={preset === d} onElegir={() => elegir(d)}>
              <MiniaturaDistribucion acciones={DISTRIBUCIONES[d]} />
            </TarjetaComposicion>
          ))}
        </div>
        <Ayuda>{preset === 'personalizada' ? t('ayudaPersonalizada') : t('ayudaDistribucion')}</Ayuda>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <TituloBloque>{t('botones')}</TituloBloque>
          <InsigniaNuevo />
        </div>
        <Ayuda>{t('ayudaBotones')}</Ayuda>
        <ZonaOrdenable
          ids={ids}
          nombre={nombre}
          modo="tabla"
          onMover={(id, sobre) => guardar(moverAccion(acciones, id as TipoAccionFicha, sobre as TipoAccionFicha))}
          capa={(id) => (
            <div className="rounded-lg border border-brand bg-surface px-3 py-2 text-[13px] font-medium text-fg shadow-lg">{nombre(id)}</div>
          )}
        >
          <div className="flex flex-col gap-2">
            {grupos.map((grupo) => {
              const filas = grupo.map((a) => pintarFila(a, acciones.indexOf(a)));
              if (grupo.length === 1) return filas[0];
              return (
                <div
                  key={`grupo-${grupo[0].tipo}`}
                  role="group"
                  aria-label={t('mismaFila', { nombres: grupo.map((a) => nombre(a.tipo)).join(' + ') })}
                  className="flex flex-col gap-1.5 rounded-lg border border-brand bg-brand-tint p-1.5"
                >
                  <p className="px-1 text-[11px] font-medium leading-[14px] text-brand-deep">
                    {t('mismaFila', { nombres: grupo.map((a) => nombre(a.tipo)).join(' + ') })}
                  </p>
                  {filas}
                </div>
              );
            })}
          </div>
        </ZonaOrdenable>
      </section>

      <TituloBloque>{t('comportamiento')}</TituloBloque>
    </div>
  );
}
