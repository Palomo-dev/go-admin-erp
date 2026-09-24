'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Check, Copy, Download, ExternalLink, Link2, Loader2, RefreshCw, Share2, Info, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/use-toast';
import { FormField, KpiStrip, PanelAdaptable, SearchInput, StatCard, TabBar, idPanel, idPestana } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { normalizarNombre } from '@/lib/inventario/importacion/texto';

/**
 * «Meta y canales» (Figma `09-meta`): feed por URL para Commerce Manager y
 * exportación CSV en formato Meta, más el diagnóstico de qué productos entran
 * y por qué no entran los demás. Diálogo en escritorio, hoja en móvil.
 *
 * Todo pasa por el servidor con la organización de la sesión:
 *   - `/api/facebook-feed/token` (token, monedas, moneda por defecto, regenerar);
 *   - `/api/inventario/productos/facebook` (CSV y diagnóstico, mismo generador que el feed).
 */
export type PestanaMeta = 'feed' | 'exportar' | 'productos';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number | undefined;
  pestanaInicial?: PestanaMeta;
}

interface Moneda {
  code: string;
  name: string;
  decimals: number;
  is_base: boolean;
}

interface ConfigFeed {
  token: string;
  token_created_at: string | null;
  last_read: { at: string; productos: number; moneda: string } | null;
  currencies: Moneda[];
  rate_date: string | null;
  default_currency: string | null;
  base_currency: string;
}

interface Diagnostico {
  moneda: string;
  resumen: { incluidos: number; excluidos: number; porMotivo: Record<string, number>; variantes: number; agotados: number; sinEnlace: boolean };
  excluidos: { id: number; sku: string; nombre: string; motivo: string }[];
}

async function pedir<T>(url: string, orgId: number | undefined, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(orgId ? { 'x-organization-id': String(orgId) } : {}) } });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string | { message?: string } };
  if (!res.ok) {
    const e = json.error;
    throw new Error(typeof e === 'string' ? e : e?.message || `HTTP ${res.status}`);
  }
  return json;
}

function Copiable({ valor, etiqueta, textoCopiar, textoCopiado }: { valor: string; etiqueta: string; textoCopiar: string; textoCopiado: string }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* el portapapeles puede no estar disponible */
    }
  };
  return (
    <div className="flex gap-2">
      <div className="relative min-w-0 flex-1">
        <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" aria-hidden="true" />
        <Input readOnly value={valor} aria-label={etiqueta} className="bg-subtle pl-9 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
      </div>
      <Button variant="outline" onClick={copiar} disabled={!valor} className="shrink-0">
        {copiado ? <Check className="size-4 text-success" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
        <span className="hidden sm:inline">{copiado ? textoCopiado : textoCopiar}</span>
        <span className="sr-only sm:hidden">{copiado ? textoCopiado : textoCopiar}</span>
      </Button>
    </div>
  );
}

export function FacebookFeedDialog({ open, onOpenChange, organizationId, pestanaInicial = 'feed' }: Props) {
  const t = useTranslations('productosFacebook');
  const { formatDateTime } = useFormatDate();
  const [pestana, setPestana] = useState<PestanaMeta>(pestanaInicial);
  const [config, setConfig] = useState<ConfigFeed | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmarRegenerar, setConfirmarRegenerar] = useState(false);
  const [regenerando, setRegenerando] = useState(false);
  const [guardandoMoneda, setGuardandoMoneda] = useState(false);
  const [monedaExport, setMonedaExport] = useState<string>('');
  const [exportando, setExportando] = useState(false);
  const [diag, setDiag] = useState<Diagnostico | null>(null);
  const [cargandoDiag, setCargandoDiag] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    if (open) setPestana(pestanaInicial);
  }, [open, pestanaInicial]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const c = await pedir<ConfigFeed>('/api/facebook-feed/token', organizationId, { method: 'POST', body: JSON.stringify({ action: 'get' }) });
      setConfig(c);
      setMonedaExport((m) => m || c.default_currency || c.base_currency);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (open && !config) void cargar();
  }, [open, config, cargar]);

  const cargarDiagnostico = useCallback(async () => {
    setCargandoDiag(true);
    try {
      const moneda = monedaExport ? `&currency=${encodeURIComponent(monedaExport)}` : '';
      setDiag(await pedir<Diagnostico>(`/api/inventario/productos/facebook?formato=resumen${moneda}`, organizationId));
    } catch (e) {
      toast({ variant: 'destructive', title: t('errores.diagnostico'), description: e instanceof Error ? e.message : String(e) });
    } finally {
      setCargandoDiag(false);
    }
  }, [organizationId, monedaExport, t]);

  useEffect(() => {
    if (open && pestana === 'productos' && !diag && !cargandoDiag) void cargarDiagnostico();
  }, [open, pestana, diag, cargandoDiag, cargarDiagnostico]);

  const origen = typeof window !== 'undefined' ? window.location.origin : '';
  const urlFeed = (moneda?: string) =>
    config && organizationId ? `${origen}/api/facebook-feed?org_id=${organizationId}&token=${config.token}${moneda ? `&currency=${moneda}` : ''}` : '';
  const extras = (config?.currencies ?? []).filter((c) => !c.is_base);
  const tasaVieja = config?.rate_date ? Date.now() - new Date(config.rate_date).getTime() > 72 * 60 * 60 * 1000 : false;
  const monedasElegibles = useMemo(() => config?.currencies ?? [], [config]);

  const regenerar = async () => {
    setRegenerando(true);
    try {
      const c = await pedir<ConfigFeed>('/api/facebook-feed/token', organizationId, { method: 'POST', body: JSON.stringify({ action: 'regenerate' }) });
      setConfig(c);
      toast({ title: t('feed.regenerado') });
    } catch (e) {
      toast({ variant: 'destructive', title: t('errores.regenerar'), description: e instanceof Error ? e.message : String(e) });
    } finally {
      setRegenerando(false);
      setConfirmarRegenerar(false);
    }
  };

  const guardarMoneda = async (codigo: string) => {
    setGuardandoMoneda(true);
    try {
      await pedir('/api/facebook-feed/token', organizationId, { method: 'POST', body: JSON.stringify({ action: 'set_default_currency', currency: codigo }) });
      setConfig((c) => (c ? { ...c, default_currency: codigo } : c));
      toast({ title: t('feed.monedaGuardada', { moneda: codigo }) });
    } catch (e) {
      toast({ variant: 'destructive', title: t('errores.moneda'), description: e instanceof Error ? e.message : String(e) });
    } finally {
      setGuardandoMoneda(false);
    }
  };

  const exportar = async () => {
    setExportando(true);
    try {
      const res = await fetch(`/api/inventario/productos/facebook?formato=csv&currency=${encodeURIComponent(monedaExport)}`, { headers: organizationId ? { 'x-organization-id': String(organizationId) } : {} });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const total = Number(res.headers.get('X-Product-Count') ?? 0);
      if (total === 0) {
        toast({ title: t('exportar.sinProductos') });
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `catalogo_meta_${monedaExport.toLowerCase()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: t('exportar.listo', { n: total }) });
    } catch (e) {
      toast({ variant: 'destructive', title: t('errores.exportar'), description: e instanceof Error ? e.message : String(e) });
    } finally {
      setExportando(false);
    }
  };

  const excluidosFiltrados = useMemo(() => {
    const q = normalizarNombre(busqueda);
    return (diag?.excluidos ?? []).filter((e) => !q || normalizarNombre(`${e.nombre} ${e.sku}`).includes(q));
  }, [diag, busqueda]);

  const selectorMoneda = (valor: string, onChange: (v: string) => void, id: string, deshabilitado?: boolean) => (
    <Select value={valor || undefined} onValueChange={onChange} disabled={deshabilitado}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={t('monedaPlaceholder')} />
      </SelectTrigger>
      <SelectContent>
        {monedasElegibles.map((m) => (
          <SelectItem key={m.code} value={m.code}>
            {m.code} · {m.name}
            {m.is_base ? ` (${t('base')})` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <>
      <PanelAdaptable
        abierto={open}
        onAbiertoChange={onOpenChange}
        titulo={t('titulo')}
        descripcion={t('descripcion')}
        icono={Share2}
        ancho={672}
        debajoCabecera={
          <TabBar
            id="meta"
            etiqueta={t('titulo')}
            valor={pestana}
            onValorChange={setPestana}
            pestanas={[
              { valor: 'feed', etiqueta: t('pestanas.feed') },
              { valor: 'exportar', etiqueta: t('pestanas.exportar') },
              { valor: 'productos', etiqueta: t('pestanas.productos'), contador: diag ? diag.resumen.incluidos : undefined },
            ]}
          />
        }
        pie={
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            {t('cerrar')}
          </Button>
        }
      >
        {cargando && !config ? (
          <p className="flex items-center gap-2 text-sm text-fg-secondary" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t('cargando')}
          </p>
        ) : error && !config ? (
          <div className="flex flex-col gap-2 rounded-lg bg-danger-subtle p-3 text-sm text-danger-text" role="alert">
            <p>{t('errores.cargar', { mensaje: error })}</p>
            <Button variant="outline" size="sm" className="self-start" onClick={() => void cargar()}>
              {t('reintentar')}
            </Button>
          </div>
        ) : config ? (
          <>
            {pestana === 'feed' && (
              <div role="tabpanel" id={idPanel('meta', 'feed')} aria-labelledby={idPestana('meta', 'feed')} className="flex flex-col gap-4">
                <FormField etiqueta={t('feed.urlBase', { moneda: config.default_currency ?? config.base_currency })} ayuda={config.default_currency && config.default_currency !== config.base_currency ? t('feed.urlBaseConDefecto', { moneda: config.default_currency }) : undefined}>
                  <Copiable valor={urlFeed()} etiqueta={t('feed.urlBase', { moneda: config.base_currency })} textoCopiar={t('copiar')} textoCopiado={t('copiado')} />
                </FormField>
                {extras.map((m) => (
                  <FormField key={m.code} etiqueta={t('feed.urlMoneda', { moneda: m.code, nombre: m.name })}>
                    <Copiable valor={urlFeed(m.code)} etiqueta={t('feed.urlMoneda', { moneda: m.code, nombre: m.name })} textoCopiar={t('copiar')} textoCopiado={t('copiado')} />
                  </FormField>
                ))}
                {extras.length === 0 && <p className="text-xs text-fg-secondary">{t('feed.sinMonedasExtra')}</p>}
                {tasaVieja && extras.length > 0 && (
                  <p className="flex items-start gap-2 rounded-lg bg-warning-subtle p-3 text-xs text-warning-text" role="status">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {t('feed.tasaVieja', { fecha: formatPlainDate(config.rate_date) })}
                  </p>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField etiqueta={t('feed.monedaDefecto')} ayuda={t('feed.monedaDefectoAyuda')}>
                    {(c) => selectorMoneda(config.default_currency ?? config.base_currency, (v) => void guardarMoneda(v), c.id, guardandoMoneda)}
                  </FormField>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-fg">{t('feed.token')}</span>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-fg-secondary">
                        <span className="font-mono">•••• {config.token.slice(-4)}</span>
                        {config.token_created_at && <> · {t('feed.creado', { fecha: formatDateTime(config.token_created_at) })}</>}
                      </span>
                      <Button variant="outline" size="sm" onClick={() => setConfirmarRegenerar(true)} disabled={regenerando}>
                        {regenerando ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />} {t('feed.regenerar')}
                      </Button>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-fg-secondary">
                  {config.last_read
                    ? t('feed.ultimaLectura', { fecha: formatDateTime(config.last_read.at), n: config.last_read.productos })
                    : t('feed.sinLecturas')}
                </p>

                <div className="rounded-lg bg-info-subtle p-3 text-sm text-info-text">
                  <p className="font-medium">{t('feed.comoConectar')}</p>
                  <ol className="mt-1 list-inside list-decimal space-y-0.5 text-xs">
                    {(['1', '2', '3', '4', '5', '6'] as const).map((n) => (
                      <li key={n}>{t(`feed.pasos.${n}`)}</li>
                    ))}
                  </ol>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button variant="ghost" asChild className="self-start">
                    <a href={urlFeed()} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="size-4" aria-hidden="true" /> {t('feed.vistaPrevia')}
                    </a>
                  </Button>
                  <span className="text-xs text-fg-muted">{t('feed.nota')}</span>
                </div>
              </div>
            )}

            {pestana === 'exportar' && (
              <div role="tabpanel" id={idPanel('meta', 'exportar')} aria-labelledby={idPestana('meta', 'exportar')} className="flex flex-col gap-4">
                <p className="text-sm text-fg-secondary">{t('exportar.descripcion')}</p>
                <FormField etiqueta={t('exportar.moneda')}>{(c) => selectorMoneda(monedaExport, (v) => { setMonedaExport(v); setDiag(null); }, c.id)}</FormField>
                <p className="flex items-start gap-2 rounded-lg bg-info-subtle p-3 text-xs text-info-text">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {t('exportar.correccion')}
                </p>
                <Button onClick={() => void exportar()} disabled={exportando || !monedaExport} className="w-full sm:w-auto sm:self-start">
                  {exportando ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />} {t('exportar.boton')}
                </Button>
              </div>
            )}

            {pestana === 'productos' && (
              <div role="tabpanel" id={idPanel('meta', 'productos')} aria-labelledby={idPestana('meta', 'productos')} className="flex flex-col gap-4">
                {cargandoDiag || !diag ? (
                  <p className="flex items-center gap-2 text-sm text-fg-secondary" role="status">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t('productos.calculando')}
                  </p>
                ) : (
                  <>
                    <KpiStrip etiqueta={t('pestanas.productos')}>
                      <StatCard etiqueta={t('productos.incluidos')} valor={String(diag.resumen.incluidos)} tono="exito" detalle={t('productos.variantes', { n: diag.resumen.variantes })} />
                      <StatCard etiqueta={t('productos.agotados')} valor={String(diag.resumen.agotados)} tono="advertencia" />
                      <StatCard etiqueta={t('productos.excluidos')} valor={String(diag.resumen.excluidos)} tono="peligro" icono={EyeOff} />
                    </KpiStrip>
                    {diag.resumen.sinEnlace && (
                      <p className="flex items-start gap-2 rounded-lg bg-warning-subtle p-3 text-xs text-warning-text" role="status">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {t('productos.sinEnlace')}
                      </p>
                    )}
                    {Object.entries(diag.resumen.porMotivo).filter(([m]) => m !== 'padreConVariantes').length > 0 && (
                      <ul className="flex flex-wrap gap-2">
                        {Object.entries(diag.resumen.porMotivo)
                          .filter(([m]) => m !== 'padreConVariantes')
                          .map(([m, n]) => (
                            <li key={m} className="rounded-full bg-subtle px-3 py-1 text-xs text-fg-secondary">
                              {t(`motivos.${m}`)}: <span className="font-semibold text-fg">{n}</span>
                            </li>
                          ))}
                      </ul>
                    )}
                    {!!diag.resumen.porMotivo.padreConVariantes && <p className="text-xs text-fg-muted">{t('productos.padres', { n: diag.resumen.porMotivo.padreConVariantes })}</p>}
                    {diag.excluidos.length > 0 && (
                      <>
                        <SearchInput value={busqueda} onChange={setBusqueda} onValueChange={setBusqueda} placeholder={t('productos.buscar')} atajo={false} />
                        <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line">
                          {excluidosFiltrados.map((e) => (
                            <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                              <span className="min-w-0">
                                <span className="block truncate text-fg">{e.nombre}</span>
                                <span className="block truncate font-mono text-xs text-fg-muted">{e.sku}</span>
                              </span>
                              <span className="shrink-0 text-xs text-fg-secondary">{t(`motivos.${e.motivo}`)}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    <Button variant="ghost" size="sm" className="self-start" onClick={() => void cargarDiagnostico()}>
                      <RefreshCw className="size-4" aria-hidden="true" /> {t('productos.recalcular')}
                    </Button>
                  </>
                )}
              </div>
            )}
          </>
        ) : null}
      </PanelAdaptable>

      <ConfirmDialog
        open={confirmarRegenerar}
        onOpenChange={setConfirmarRegenerar}
        title={t('feed.confirmarTitulo')}
        description={t('feed.confirmarDesc')}
        confirmLabel={t('feed.regenerar')}
        cancelLabel={t('cancelar')}
        variant="destructive"
        loading={regenerando}
        onConfirm={() => void regenerar()}
      />
    </>
  );
}
