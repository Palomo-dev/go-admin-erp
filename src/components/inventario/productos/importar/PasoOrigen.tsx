'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileSpreadsheet, Globe, Loader2, Package, Sparkles, Upload, X, Coins, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField, FormSection, SegmentedControl } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { CAMPOS } from '@/lib/inventario/importacion/campos';
import { extensionAdmitida, leerMatriz, TAMANO_MAXIMO_ARCHIVO } from '@/lib/inventario/importacion/lector';
import { CREDITOS_ANALISIS_WEB, CREDITOS_DETALLE_WEB } from '@/lib/inventario/importacion/costosWeb';
import { analizarWeb, ErrorApi, pedirSaldoWeb, type SaldoWeb } from './apiImportacion';
import type { AsistenteImportacion } from './useAsistenteImportacion';

interface Props {
  a: AsistenteImportacion;
  orgId: number | undefined;
  onError: (mensaje: string) => void;
  onInfo: (mensaje: string) => void;
}

function ZonaArchivo({ etiqueta, ayuda, icono: Icono, nombre, onArchivo, compacta }: { etiqueta: string; ayuda: string; icono: typeof FileSpreadsheet; nombre?: string; onArchivo: (f: File) => void; compacta?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={etiqueta}
      onClick={() => ref.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          ref.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setEncima(true);
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => {
        e.preventDefault();
        setEncima(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onArchivo(f);
      }}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        compacta ? 'py-5' : 'py-8 sm:py-12',
        encima ? 'border-line-brand bg-brand-tint' : 'border-line-strong hover:border-line-brand hover:bg-hover',
      )}
    >
      <Icono aria-hidden="true" className={cn('text-fg-muted', compacta ? 'size-7' : 'size-10')} strokeWidth={1.5} />
      <p className="break-all text-sm font-medium text-fg sm:text-base">{nombre || etiqueta}</p>
      <p className="text-xs text-fg-secondary">{ayuda}</p>
      <input
        ref={ref}
        type="file"
        accept=".csv,.xls,.xlsx"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onArchivo(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

export function PasoOrigen({ a, orgId, onError, onInfo }: Props) {
  const t = useTranslations('productosImportar');
  const [leyendo, setLeyendo] = useState(false);
  const [url, setUrl] = useState(a.web?.url ?? '');
  const [saldo, setSaldo] = useState<SaldoWeb | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const cancelar = useRef<AbortController | null>(null);

  useEffect(() => {
    if (a.origen !== 'web' || saldo) return;
    pedirSaldoWeb(orgId).then(setSaldo).catch(() => setSaldo(null));
  }, [a.origen, orgId, saldo]);

  useEffect(() => () => cancelar.current?.abort(), []);

  const leer = async (f: File, tipo: 'productos' | 'saldos') => {
    if (!extensionAdmitida(f.name)) return onError(t('origen.errorFormato'));
    if (f.size > TAMANO_MAXIMO_ARCHIVO) return onError(t('origen.errorTamano'));
    setLeyendo(true);
    try {
      const matriz = leerMatriz(await f.arrayBuffer(), f.name);
      if (tipo === 'saldos') {
        if (!a.cargarSaldos(f.name, matriz)) onError(t('origen.saldosNoReconocido'));
        return;
      }
      if (matriz.length < 2) return onError(t('origen.sinDatos'));
      a.cargarMatriz(f.name, matriz);
    } catch {
      onError(t('origen.errorLectura'));
    } finally {
      setLeyendo(false);
    }
  };

  const analizar = async () => {
    const limpia = url.trim();
    if (!/^https?:\/\/\S+\.\S+/.test(limpia)) return onError(t('web.urlInvalida'));
    cancelar.current?.abort();
    cancelar.current = new AbortController();
    setAnalizando(true);
    try {
      const r = await analizarWeb(orgId, limpia, cancelar.current.signal);
      if (!r.productos.length) return onError(t('web.sinProductos'));
      a.cargarWeb(limpia, r.productos, r.creditos, r.ia);
      onInfo(`${t('web.encontrados', { n: r.productos.length })} · ${t('web.creditosCobrados', { n: r.creditos })}`);
      setSaldo((s) => (s ? { ...s, saldo: Math.max(0, s.saldo - r.creditos) } : s));
      a.setPaso('seleccion');
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return;
      if (e instanceof ErrorApi && e.status === 402) onError(t('web.sinSaldo'));
      else onError(t('web.errorProveedor', { mensaje: e instanceof Error ? e.message : String(e) }));
    } finally {
      setAnalizando(false);
    }
  };

  const filasArchivo = a.archivo ? Math.max(0, a.archivo.matriz.length - Math.max(0, a.archivo.filaCabecera) - 1) : 0;
  const sinSaldo = !!saldo && (!saldo.permitido || saldo.saldo < CREDITOS_ANALISIS_WEB);

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        etiqueta={t('origen.elegir')}
        anchoCompleto
        valor={a.origen}
        onValorChange={(v) => a.setOrigen(v)}
        opciones={[
          { valor: 'archivo', etiqueta: t('origenes.archivo'), icono: FileSpreadsheet },
          { valor: 'web', etiqueta: t('origenes.web'), icono: Globe },
        ]}
        className="sm:max-w-md"
      />

      {a.origen === 'archivo' ? (
        <>
          <FormSection titulo={t('origen.archivoTitulo')} descripcion={t('origen.archivoDesc')} icono={FileSpreadsheet}>
            {leyendo ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-fg-secondary" role="status">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t('origen.leyendo')}
              </div>
            ) : (
              <ZonaArchivo
                etiqueta={t('origen.soltar')}
                ayuda={a.archivo ? t('origen.archivoElegido', { filas: filasArchivo }) : t('origen.formatos')}
                icono={Upload}
                nombre={a.archivo?.nombre}
                onArchivo={(f) => leer(f, 'productos')}
              />
            )}
            <details className="rounded-lg bg-subtle p-3 text-sm">
              <summary className="cursor-pointer font-medium text-fg">{t('origen.ayudaTitulo')}</summary>
              <ul className="mt-2 grid gap-x-6 gap-y-1 text-xs text-fg-secondary sm:grid-cols-2">
                {CAMPOS.map((c) => (
                  <li key={c.campo}>
                    <span className="font-medium text-fg">{t(`cabeceras.${c.campo}`)}</span> — {t(`campos.${c.campo}.ayuda`)}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-fg-secondary">{t('origen.ayudaFormatos')}</p>
            </details>
          </FormSection>

          <FormSection titulo={t('origen.saldosTitulo')} descripcion={t('origen.saldosDesc')} icono={Package} colapsable abiertaPorDefecto={!!a.saldos}>
            {a.saldos ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-line p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{a.saldos.nombre}</p>
                  <p className="text-xs text-fg-secondary">{t('origen.saldosCargados', { n: a.saldos.datos.size })}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={a.quitarSaldos}>
                  <X className="size-4" aria-hidden="true" /> {t('origen.quitar')}
                </Button>
              </div>
            ) : (
              <ZonaArchivo compacta etiqueta={t('origen.saldosElegir')} ayuda={t('origen.formatos')} icono={Package} onArchivo={(f) => leer(f, 'saldos')} />
            )}
          </FormSection>
        </>
      ) : (
        <FormSection titulo={t('web.titulo')} descripcion={t('web.descripcion')} icono={Sparkles}>
          <FormField etiqueta={t('web.url')} ayuda={t('web.urlAyuda')}>
            <div className="relative">
              <Globe aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
              <Input
                type="url"
                inputMode="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t('web.urlPlaceholder')}
                className="pl-9"
                disabled={analizando}
                onKeyDown={(e) => e.key === 'Enter' && !analizando && analizar()}
              />
            </div>
          </FormField>

          <div className="rounded-lg border border-line bg-subtle p-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-fg">
              <Coins className="size-4 text-brand" aria-hidden="true" /> {t('web.costoTitulo')}
            </p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-fg-secondary">
              <li>{t('web.costoAnalisis', { n: CREDITOS_ANALISIS_WEB })}</li>
              <li>{t('web.costoDetalle', { n: CREDITOS_DETALLE_WEB })}</li>
              <li>{t('web.costoFallo')}</li>
            </ul>
            {saldo && <p className="mt-2 text-xs font-medium text-fg">{t('web.saldo', { n: saldo.saldo })}</p>}
            {sinSaldo && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-warning-text" role="alert">
                <AlertTriangle className="size-3.5" aria-hidden="true" /> {t('web.sinSaldo')}
              </p>
            )}
          </div>

          {analizando ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between" role="status">
              <p className="flex items-center gap-2 text-sm text-fg-secondary">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t('web.analizando')}
              </p>
              <Button variant="outline" onClick={() => cancelar.current?.abort()}>
                {t('acciones.cancelar')}
              </Button>
            </div>
          ) : (
            <Button onClick={analizar} disabled={!url.trim() || sinSaldo} className="w-full sm:w-auto sm:self-start">
              <Sparkles className="size-4" aria-hidden="true" /> {t('web.analizar')}
            </Button>
          )}
          {a.web && !analizando && (
            <p className="text-xs text-fg-secondary">{t('web.yaAnalizada', { n: a.web.productos.length, host: safeHost(a.web.url) })}</p>
          )}
        </FormSection>
      )}
    </div>
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
