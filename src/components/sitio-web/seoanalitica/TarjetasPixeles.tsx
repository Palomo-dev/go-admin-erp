'use client';

/**
 * «Píxeles y medición» (Figma B/09-01): una tarjeta por píxel con su estado
 * («Conectado» / «No conectado»), el ID abreviado y su acción: «Conectar»,
 * «Probar eventos» (Meta, TikTok, GTM), «Abrir en Google» (GA4). Los ID se
 * guardan como campos tipados; el `<script>` libre sigue en Configuración ›
 * Código y píxeles.
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, Dialogo, FormField, RowActionsMenu, StatusBadge, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { abreviarId, normalizarIdPixel, type PruebaPixelRespuesta, type TipoPixel } from './saludSitio';
import { useTextosSeoAnalitica } from './textos';
import { ICONO_ACCION_SEO, ICONO_NIVEL, ICONO_PIXEL } from './iconosSeoAnalitica';
import { CajaIcono } from '../ui/CajaIcono';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../ui/iconosSitio';
import { ICONO_BLOQUE_ANALITICA } from '@/components/analiticaWeb/iconosAnalitica';
import type { Pixeles } from './usePixeles';

/** Las cuatro tarjetas del diseño. Google Ads queda en la API (columna pendiente) sin tarjeta propia. */
export const PIXELES_VISIBLES: readonly TipoPixel[] = ['meta', 'ga4', 'tiktok', 'gtm'];

const URL_GOOGLE_ANALYTICS = 'https://analytics.google.com/';

function DialogoConectarPixel({
  tipo,
  actual,
  onCerrar,
  onGuardar,
}: {
  tipo: TipoPixel;
  actual: string | null;
  onCerrar: () => void;
  onGuardar: (id: string | null) => Promise<'ok' | 'invalido' | 'pendiente' | 'error'>;
}) {
  const t = useTextosSeoAnalitica();
  const nombre = t(`analitica.pixeles.${tipo}.nombre`);
  const [valor, setValor] = useState(actual ?? '');
  const [guardando, setGuardando] = useState(false);
  const [tocado, setTocado] = useState(false);
  const normal = normalizarIdPixel(tipo, valor);
  const invalido = tocado && (normal === undefined || normal === null);

  const guardar = async () => {
    setTocado(true);
    if (!normal) return;
    setGuardando(true);
    const r = await onGuardar(normal);
    setGuardando(false);
    if (r === 'ok') {
      toast.success(t('analitica.dialogoPixel.guardado', { nombre }));
      onCerrar();
    } else if (r === 'pendiente') toast.error(t('analitica.pixeles.pendiente'));
    else toast.error(t('analitica.dialogoPixel.error'));
  };

  return (
    <Dialogo
      abierto
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo={actual ? t('analitica.dialogoPixel.tituloCambiar', { nombre }) : t('analitica.dialogoPixel.titulo', { nombre })}
      icono={ICONO_PIXEL[tipo]}
      primario={{ etiqueta: t('analitica.dialogoPixel.guardar'), onClick: () => void guardar(), cargando: guardando }}
      textoCancelar={t('analitica.dialogoPixel.cancelar')}
      ancho={440}
    >
      <FormField
        etiqueta={t('analitica.dialogoPixel.campo', { nombre })}
        ayuda={t(`analitica.dialogoPixel.ayuda.${tipo}`)}
        error={invalido ? t('analitica.dialogoPixel.invalido', { nombre }) : null}
        obligatorio
      >
        <Input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onBlur={() => setTocado(true)}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
        />
      </FormField>
    </Dialogo>
  );
}

function DialogoProbarEventos({ tipo, onCerrar, probar }: { tipo: TipoPixel; onCerrar: () => void; probar: (t: TipoPixel) => Promise<PruebaPixelRespuesta | null> }) {
  const t = useTextosSeoAnalitica();
  const nombre = t(`analitica.pixeles.${tipo}.nombre`);
  const [resultado, setResultado] = useState<PruebaPixelRespuesta | null | 'cargando'>('cargando');

  const correr = useCallback(async () => {
    setResultado('cargando');
    setResultado(await probar(tipo));
  }, [probar, tipo]);
  useEffect(() => {
    void correr();
  }, [correr]);

  const texto = (() => {
    if (resultado === 'cargando') return t('analitica.prueba.revisando');
    if (!resultado) return t('analitica.prueba.error');
    if (resultado.resultado === 'encontrado') return t('analitica.prueba.encontrado', { id: resultado.id ?? '' });
    if (resultado.resultado === 'no_encontrado') return t('analitica.prueba.noEncontrado', { id: resultado.id ?? '' });
    if (resultado.resultado === 'sin_host') return t('analitica.prueba.sinHost');
    return t('analitica.prueba.error');
  })();
  const host = resultado && resultado !== 'cargando' ? resultado.host : null;

  return (
    <Dialogo
      abierto
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo={t('analitica.prueba.titulo', { nombre })}
      icono={ICONO_ACCION_SEO.probar}
      descripcion={host ? t('analitica.prueba.descripcion', { host }) : undefined}
      primario={{ etiqueta: t('analitica.prueba.otraVez'), onClick: () => void correr(), cargando: resultado === 'cargando' }}
      textoCancelar={t('analitica.prueba.cerrar')}
      ancho={440}
    >
      <p role="status" className="flex items-start gap-2 text-sm text-fg">
        {resultado !== 'cargando' && resultado && (
          <StatusBadge
            estado={resultado.resultado === 'encontrado' ? 'bien' : 'falta'}
            icono={resultado.resultado === 'encontrado' ? ICONO_NIVEL.bien : ICONO_NIVEL.falta}
            etiqueta={resultado.resultado === 'encontrado' ? t('analitica.pixeles.conectado') : t('analitica.pixeles.noConectado')}
          />
        )}
        <span>{texto}</span>
      </p>
    </Dialogo>
  );
}

export function TarjetasPixeles({ pixeles }: { pixeles: Pixeles }) {
  const t = useTextosSeoAnalitica();
  const [conectar, setConectar] = useState<TipoPixel | null>(null);
  const [probar, setProbar] = useState<TipoPixel | null>(null);
  const [quitar, setQuitar] = useState<TipoPixel | null>(null);
  const datos = pixeles.datos;
  const puedeEditar = datos?.puedeEditar ?? false;

  return (
    <section aria-labelledby="pixeles-titulo" className="flex flex-col gap-3">
      <h2 id="pixeles-titulo" className="flex items-center gap-2 text-base font-semibold text-fg">
        <ICONO_BLOQUE_ANALITICA.pixeles aria-hidden="true" className={`${CLASE_TAMANO_ICONO.base} shrink-0 text-fg-secondary`} strokeWidth={TRAZO_ICONO} />
        {t('analitica.pixeles.titulo')}
        <StatusBadge estado="nuevo" etiqueta={t('analitica.pixeles.nuevo')} />
      </h2>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PIXELES_VISIBLES.map((tipo) => {
          const estado = datos?.pixeles[tipo];
          const id = estado?.id ?? null;
          const disponible = estado?.disponible ?? false;
          const nombre = t(`analitica.pixeles.${tipo}.nombre`);
          return (
            <li key={tipo} className="flex min-w-0 flex-col gap-2 rounded-xl border border-line bg-surface p-4" data-testid={`pixel-${tipo}`}>
              {pixeles.cargando && !datos ? (
                <>
                  <Skeleton className="h-5 w-2/3 rounded-md" />
                  <Skeleton className="h-4 w-full rounded-md" />
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {/* Caja de 32 con el icono del píxel; en tono de éxito cuando está conectado. */}
                      <CajaIcono icono={ICONO_PIXEL[tipo]} tamano="sm" tono={id ? 'exito' : 'neutro'} />
                      <h3 className="min-w-0 text-sm font-semibold text-fg">{nombre}</h3>
                    </div>
                    <div className="flex items-center gap-1">
                      <StatusBadge estado={id ? 'conectado' : 'no conectado'} etiqueta={id ? t('analitica.pixeles.conectado') : t('analitica.pixeles.noConectado')} />
                      {id && puedeEditar && (
                        <RowActionsMenu
                          titulo={nombre}
                          acciones={[
                            { id: 'cambiar', etiqueta: t('analitica.pixeles.cambiar'), icono: ICONO_ACCION_SEO.cambiar, onSelect: () => setConectar(tipo) },
                            {
                              id: 'quitar',
                              etiqueta: t('analitica.pixeles.desconectar'),
                              icono: ICONO_ACCION_SEO.desconectar,
                              destructiva: true,
                              onSelect: () => setQuitar(tipo),
                            },
                          ]}
                        />
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-fg-secondary">{id ? t('analitica.pixeles.id', { id: abreviarId(id) }) : t(`analitica.pixeles.${tipo}.texto`)}</p>
                  {tipo === 'meta' && datos?.metaEnCodigo && (
                    // Estado real (el sitio no pinta este ID): icono + texto, sin color de alarma.
                    <p role="note" className="flex items-start gap-1.5 text-xs text-fg-secondary" data-testid="pixel-meta-en-codigo">
                      <ICONO_NIVEL.mejorable aria-hidden="true" className={`${CLASE_TAMANO_ICONO.base} mt-px shrink-0`} strokeWidth={TRAZO_ICONO} />
                      <span>{t('analitica.pixeles.metaEnCodigo')}</span>
                    </p>
                  )}
                  <div className="mt-auto pt-1">
                    {id ? (
                      tipo === 'ga4' ? (
                        <a href={URL_GOOGLE_ANALYTICS} target="_blank" rel="noopener noreferrer" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                          {t('analitica.pixeles.abrirGoogle')}
                          <ICONO_ACCION_SEO.abrirFuera aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
                        </a>
                      ) : (
                        <button type="button" onClick={() => setProbar(tipo)} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                          <ICONO_ACCION_SEO.probar aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
                          {t('analitica.pixeles.probar')}
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConectar(tipo)}
                        disabled={!puedeEditar || !disponible}
                        title={!disponible ? t('analitica.pixeles.pendiente') : !puedeEditar ? t('analitica.pixeles.sinPermiso') : undefined}
                        className={clasesBoton({ variante: 'primario', tamano: 'sm' })}
                      >
                        <ICONO_ACCION_SEO.conectar aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
                        {t('analitica.pixeles.conectar')}
                      </button>
                    )}
                    {!id && (!disponible || !puedeEditar) && !pixeles.cargando && (
                      <p className="mt-2 text-xs text-fg-muted">{!disponible ? t('analitica.pixeles.pendiente') : t('analitica.pixeles.sinPermiso')}</p>
                    )}
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-fg-muted">{t('analitica.pixeles.nota')}</p>
      {conectar && (
        <DialogoConectarPixel tipo={conectar} actual={datos?.pixeles[conectar]?.id ?? null} onCerrar={() => setConectar(null)} onGuardar={(id) => pixeles.guardar(conectar, id)} />
      )}
      {quitar && (
        <ConfirmDialog
          abierto
          onAbiertoChange={(v) => !v && setQuitar(null)}
          titulo={`${t('analitica.pixeles.desconectar')} ${t(`analitica.pixeles.${quitar}.nombre`)}`}
          descripcion={t(`analitica.pixeles.${quitar}.texto`)}
          textoConfirmar={t('analitica.pixeles.desconectar')}
          tono="peligro"
          icono={ICONO_ACCION_SEO.desconectar}
          onConfirmar={async () => {
            const nombre = t(`analitica.pixeles.${quitar}.nombre`);
            const r = await pixeles.guardar(quitar, null);
            if (r === 'ok') toast.success(t('analitica.dialogoPixel.quitado', { nombre }));
            else toast.error(t('analitica.dialogoPixel.error'));
            setQuitar(null);
          }}
        />
      )}
      {probar && <DialogoProbarEventos tipo={probar} onCerrar={() => setProbar(null)} probar={pixeles.probar} />}
    </section>
  );
}
