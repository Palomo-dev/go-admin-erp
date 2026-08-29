'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, RefreshCw, Check, Globe, Loader2, ExternalLink, Coins } from 'lucide-react';
import { toast } from 'sonner';

interface FacebookFeedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number | undefined;
}

interface FeedCurrency {
  code: string;
  name: string;
  decimals: number;
  is_base: boolean;
}

export function FacebookFeedDialog({
  open,
  onOpenChange,
  organizationId,
}: FacebookFeedDialogProps) {
  // ─── Token (path rápido — get_token) ───
  const [token, setToken] = useState<string>('');
  const [tokenLoading, setTokenLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  // ─── Monedas (path lento — get_currencies) ───
  const [currencies, setCurrencies] = useState<FeedCurrency[]>([]);
  const [currenciesLoading, setCurrenciesLoading] = useState(false);
  const [currenciesError, setCurrenciesError] = useState(false);
  const [rateDate, setRateDate] = useState<string>('');
  const [copiedCurrency, setCopiedCurrency] = useState<string>('');

  // Cache en sessionStorage: evita re-fetchear token+monedas cada vez que se
  // abre el dialog en la misma sesión. Clave por organización para no mezclar.
  const cacheKey = organizationId ? `fbfeed:${organizationId}` : '';
  const readCache = (): { token: string; currencies: FeedCurrency[]; rateDate: string } | null => {
    if (!cacheKey || typeof window === 'undefined') return null;
    try {
      const raw = window.sessionStorage.getItem(cacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.token) return parsed;
    } catch {
      /* sessionStorage no disponible o corrupto — ignora */
    }
    return null;
  };
  const writeCache = (data: { token: string; currencies: FeedCurrency[]; rateDate: string }) => {
    if (!cacheKey || typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(cacheKey, JSON.stringify(data));
    } catch {
      /* ignora errores de cuota */
    }
  };

  // URL principal (legacy, SIN parámetro currency) — intacta, como la original.
  const feedUrl = token && organizationId
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/api/facebook-feed?org_id=${organizationId}&token=${token}`
    : '';

  const isStale = rateDate ? (Date.now() - new Date(rateDate).getTime()) > 72 * 60 * 60 * 1000 : false;

  useEffect(() => {
    if (!open || !organizationId) return;

    // 1. Hidratar desde caché de sesión → la URL principal aparece instantáneamente
    //    si el dialog ya se abrió antes en esta sesión (sin ningún fetch).
    const cached = readCache();
    if (cached) {
      setToken(cached.token);
      if (Array.isArray(cached.currencies)) setCurrencies(cached.currencies);
      if (typeof cached.rateDate === 'string') setRateDate(cached.rateDate);
      // Refrescar en background para reflejar cambios (token regenerado, tasas
      // nuevas, monedas activadas/desactivadas) sin bloquear la UI.
      fetchToken(true);
      fetchCurrencies(true);
      return;
    }

    // 2. Sin caché: disparar AMBAS peticiones en paralejo (token rápido + monedas).
    //    La URL principal se renderiza en cuanto llega el token, sin esperar monedas.
    fetchToken();
    fetchCurrencies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, organizationId]);

  // ─── Token (rápido) ───
  // `background=true` → no muestra spinner (ya hay datos cacheados en pantalla).
  const fetchToken = async (background = false) => {
    if (!organizationId) return;
    if (!background) setTokenLoading(true);
    try {
      const res = await fetch('/api/facebook-feed/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: organizationId, action: 'get_token' }),
      });
      const data = await res.json();
      if (data.success) {
        setToken(data.token);
        // Actualizar caché con token fresco.
        if (data.token) {
          writeCache({
            token: data.token,
            currencies,
            rateDate,
          });
        }
      } else if (!background) {
        toast.error('Error al obtener el token del feed');
      }
    } catch {
      if (!background) toast.error('Error de conexión');
    } finally {
      if (!background) setTokenLoading(false);
    }
  };

  // ─── Monedas (lento, no bloquea la URL principal) ───
  // `background=true` → no muestra spinner (ya hay datos cacheados en pantalla).
  const fetchCurrencies = async (background = false) => {
    if (!organizationId) return;
    if (!background) setCurrenciesLoading(true);
    setCurrenciesError(false);
    try {
      const res = await fetch('/api/facebook-feed/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: organizationId, action: 'get_currencies' }),
      });
      const data = await res.json();
      if (data.success) {
        let nextCurrencies = currencies;
        if (Array.isArray(data.currencies)) {
          nextCurrencies = data.currencies as FeedCurrency[];
          setCurrencies(nextCurrencies);
        }
        let nextRateDate = rateDate;
        if (typeof data.rate_date === 'string') {
          nextRateDate = data.rate_date;
          setRateDate(data.rate_date);
        }
        // Actualizar caché con monedas+rateDate frescos.
        if (token) {
          writeCache({
            token,
            currencies: nextCurrencies,
            rateDate: nextRateDate,
          });
        }
      } else if (!background) {
        // No romper la URL principal — solo marcar error de monedas.
        setCurrenciesError(true);
      }
    } catch {
      if (!background) setCurrenciesError(true);
    } finally {
      if (!background) setCurrenciesLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (!organizationId) return;
    setRegenerating(true);
    // Invalidar caché: el token anterior ya no sirve.
    if (cacheKey && typeof window !== 'undefined') {
      try { window.sessionStorage.removeItem(cacheKey); } catch { /* ignore */ }
    }
    try {
      const res = await fetch('/api/facebook-feed/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: organizationId, action: 'regenerate' }),
      });
      const data = await res.json();
      if (data.success) {
        const nextCurrencies = Array.isArray(data.currencies)
          ? (data.currencies as FeedCurrency[])
          : currencies;
        const nextRateDate = typeof data.rate_date === 'string' ? data.rate_date : rateDate;
        setToken(data.token);
        if (Array.isArray(data.currencies)) {
          setCurrencies(nextCurrencies);
        }
        if (typeof data.rate_date === 'string') {
          setRateDate(nextRateDate);
        }
        // Persistir el token nuevo en caché.
        if (data.token) {
          writeCache({ token: data.token, currencies: nextCurrencies, rateDate: nextRateDate });
        }
        toast.success('Token regenerado. La URL anterior ya no funciona.');
      } else {
        toast.error('Error al regenerar el token');
      }
    } catch {
      toast.error('Error de conexión');
    } finally {
      setRegenerating(false);
    }
  };

  const handleCopy = () => {
    if (!feedUrl) return;
    navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('URL copiada al portapapeles');
  };

  const handleCopyCurrency = (code: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedCurrency(code);
    setTimeout(() => setCopiedCurrency(''), 2000);
    toast.success(`URL ${code} copiada al portapapeles`);
  };

  const buildCurrencyUrl = (code: string) =>
    token && organizationId
      ? `${typeof window !== 'undefined' ? window.location.origin : ''}/api/facebook-feed?org_id=${organizationId}&token=${token}&currency=${code}`
      : '';

  // Monedas adicionales (excluye la base — la base es la URL principal sin currency).
  const extraCurrencies = currencies.filter((c) => !c.is_base);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-blue-600" />
            URL Feed de Catálogo para Facebook
          </DialogTitle>
          <DialogDescription>
            Pega esta URL en Facebook Commerce Manager para que Facebook lea tu catálogo automáticamente.
            La URL se mantiene actualizada con tus productos en tiempo real.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* ─── URL principal (legacy, sin currency) ─── */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              URL del Feed (CSV)
            </label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={feedUrl}
                className="font-mono text-xs"
                placeholder={tokenLoading ? 'Generando URL...' : 'URL del feed'}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
                disabled={!feedUrl}
                aria-label="Copiar URL principal del feed"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            {tokenLoading && (
              <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Generando URL...
              </p>
            )}
          </div>

          {/* ─── Feeds por moneda (URLs adicionales con currency=CODE) ─── */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-blue-600" />
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Feeds por moneda
              </label>
              {currenciesLoading && (
                <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
              )}
            </div>

            {currenciesLoading ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Cargando monedas configuradas...
              </p>
            ) : currenciesError ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                No se pudieron cargar las monedas. La URL principal sigue funcionando.
              </p>
            ) : extraCurrencies.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                No hay monedas adicionales configuradas. Actívalas en Finanzas → Monedas.
              </p>
            ) : (
              <div className="space-y-2">
                {extraCurrencies.map((c) => {
                  const url = buildCurrencyUrl(c.code);
                  return (
                    <div key={c.code} className="flex gap-2 items-center">
                      <span className="w-16 shrink-0 text-xs font-semibold text-gray-700 dark:text-gray-300">
                        {c.code}
                      </span>
                      <Input
                        readOnly
                        value={url}
                        className="font-mono text-xs"
                        aria-label={`URL del feed en ${c.code} - ${c.name}`}
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleCopyCurrency(c.code, url)}
                        disabled={!url}
                        aria-label={`Copiar URL del feed en ${c.code}`}
                      >
                        {copiedCurrency === c.code ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {rateDate && isStale && (
              <div role="status" className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3">
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  Última tasa de cambio: {rateDate}. Considera actualizar las tasas en Finanzas → Monedas.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-4 space-y-2">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
              Cómo usar esta URL en Facebook:
            </p>
            <ol className="text-xs text-blue-800 dark:text-blue-300 space-y-1 list-decimal list-inside">
              <li>Ve a Facebook Commerce Manager</li>
              <li>Selecciona tu catálogo de productos</li>
              <li>Ve a &quot;Fuentes de datos&quot; → &quot;Agregar fuente de datos&quot;</li>
              <li>Selecciona &quot;Feed programado&quot; y elige &quot;CSV&quot;</li>
              <li>Pega esta URL en el campo &quot;URL del archivo&quot;</li>
              <li>Configura la frecuencia de actualización (recomendado: diaria)</li>
            </ol>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              El token garantiza que solo Facebook pueda acceder a tu catálogo.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRegenerate}
              disabled={regenerating}
              aria-label="Regenerar token"
            >
              {regenerating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Regenerar token
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          {feedUrl && (
            <Button
              onClick={() => window.open(feedUrl, '_blank')}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              aria-label="Vista previa del feed"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Vista previa
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
