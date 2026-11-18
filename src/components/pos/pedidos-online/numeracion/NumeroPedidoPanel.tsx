'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Save } from 'lucide-react';
import { AvisoTonal, EmptyState, FormField, SegmentedControl } from '@/components/kit';
import { clasesBoton } from '@/components/kit/botonClases';
import { useToast } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import {
  AJUSTES_NUMERO_POR_DEFECTO,
  ejemploNumero,
  normalizarAjustesNumero,
  normalizarPrefijo,
  type AjustesNumeroPedido,
  type FormatoNumeroPedido,
} from '@/lib/pos/pedidosWeb/numeroPedido';

/**
 * Configuración › POS › Número de pedido: el formato del número de los pedidos web (tienda,
 * pedido manual y los que arma el chat con IA). Por defecto el de siempre (`WO-{org}-…`);
 * también un consecutivo (`PREFIJO-0001`) o un código corto (`PREFIJO-XXXXXX`). Los pedidos que
 * ya existen conservan su número. Guardar exige administración (en el servidor).
 */
interface Lectura {
  ajustes: AjustesNumeroPedido;
  disponible: boolean;
  puedeEditar: boolean;
  organizationId: number;
}

class NumeroError extends Error {
  constructor(public readonly codigo: string) {
    super(codigo);
  }
}

async function pedir<T>(init: RequestInit = {}): Promise<T> {
  const h: Record<string, string> = {};
  if (init.body) h['Content-Type'] = 'application/json';
  const org = Number(getOrganizationId()) || null;
  if (org) h['x-organization-id'] = String(org);
  const r = await fetch('/api/pos/numero-pedido', { credentials: 'same-origin', cache: 'no-store', ...init, headers: h });
  let cuerpo: Record<string, unknown> = {};
  try {
    cuerpo = await r.json();
  } catch {
    cuerpo = {};
  }
  if (!r.ok) throw new NumeroError(typeof cuerpo.codigo === 'string' ? cuerpo.codigo : 'error');
  return cuerpo as T;
}

const CLASE_INPUT =
  'h-10 w-full rounded-lg border border-line-strong bg-surface px-3 font-mono text-sm uppercase text-fg placeholder:normal-case placeholder:text-fg-muted focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20 disabled:opacity-60';

export function NumeroPedidoPanel() {
  const t = useTranslations('posNumeroPedido');
  const { toast } = useToast();
  const [lectura, setLectura] = React.useState<Lectura | null>(null);
  const [formato, setFormato] = React.useState<FormatoNumeroPedido>('actual');
  const [prefijo, setPrefijo] = React.useState('');
  const [error, setError] = React.useState(false);
  const [errorPrefijo, setErrorPrefijo] = React.useState<string | null>(null);
  const [guardando, setGuardando] = React.useState(false);

  const cargar = React.useCallback(() => {
    setError(false);
    pedir<Lectura>()
      .then((r) => {
        setLectura(r);
        setFormato(r.ajustes.formato);
        setPrefijo(r.ajustes.prefijo ?? '');
      })
      .catch(() => setError(true));
  }, []);
  React.useEffect(() => {
    cargar();
  }, [cargar]);

  const bloqueado = !lectura || !lectura.puedeEditar || !lectura.disponible;
  const conPrefijo = formato !== 'actual';
  const ajustesVista: AjustesNumeroPedido = conPrefijo
    ? { formato, prefijo: normalizarPrefijo(prefijo) || 'PED' }
    : AJUSTES_NUMERO_POR_DEFECTO;
  const ejemplo = ejemploNumero(ajustesVista, lectura?.organizationId ?? 1);

  const mensajePrefijo = (codigo: string) =>
    codigo === 'reservado' || codigo === 'prefijo_reservado'
      ? t('errores.reservado')
      : codigo === 'prefijo_en_uso'
        ? t('errores.enUso')
        : t('errores.formato');

  const guardar = async () => {
    const parsed = normalizarAjustesNumero({ formato, prefijo });
    if (!parsed.ok) {
      setErrorPrefijo(mensajePrefijo(parsed.error));
      return;
    }
    setErrorPrefijo(null);
    setGuardando(true);
    try {
      await pedir({ method: 'PUT', body: JSON.stringify(parsed.ajustes) });
      setLectura((l) => (l ? { ...l, ajustes: parsed.ajustes } : l));
      setPrefijo(parsed.ajustes.prefijo ?? '');
      toast({ title: t('guardado') });
    } catch (err) {
      const codigo = err instanceof NumeroError ? err.codigo : 'error';
      if (codigo === 'prefijo_en_uso' || codigo === 'prefijo_reservado' || codigo === 'prefijo_invalido') {
        setErrorPrefijo(mensajePrefijo(codigo));
      } else {
        toast({
          title: t('errorGuardar'),
          description: codigo === 'no_disponible' ? t('pendienteMigracion') : codigo === 'sin_permiso' ? t('sinPermiso') : undefined,
          variant: 'destructive',
        });
      }
    } finally {
      setGuardando(false);
    }
  };

  if (error) return <EmptyState variante="error" titulo={t('errorCargar')} onReintentar={cargar} />;
  if (!lectura) {
    return (
      <div className="flex justify-center py-10" role="status" aria-label={t('cargando')}>
        <Loader2 aria-hidden="true" className="size-5 animate-spin text-fg-muted" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button type="button" disabled={guardando || bloqueado} onClick={() => void guardar()} className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
          {guardando ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Save aria-hidden="true" className="size-4" strokeWidth={1.5} />}
          {t('guardar')}
        </button>
      </div>

      <AvisoTonal
        tono="informacion"
        titulo={!lectura.disponible ? t('pendienteMigracion') : !lectura.puedeEditar ? t('soloLectura') : t('comoFunciona')}
        descripcion={lectura.disponible && lectura.puedeEditar ? t('existentes') : undefined}
        compacto
      />

      <FormField etiqueta={t('formato')} ayuda={t(`ayudaFormato.${formato}`)}>
        {(c) => (
          <SegmentedControl<FormatoNumeroPedido>
            id={c.id}
            aria-labelledby={c.idEtiqueta}
            aria-describedby={c['aria-describedby']}
            opciones={[
              { valor: 'actual', etiqueta: t('formatos.actual') },
              { valor: 'consecutivo', etiqueta: t('formatos.consecutivo') },
              { valor: 'corto', etiqueta: t('formatos.corto') },
            ]}
            valor={formato}
            deshabilitado={bloqueado}
            onValorChange={(v) => {
              setFormato(v);
              setErrorPrefijo(null);
            }}
          />
        )}
      </FormField>

      {conPrefijo && (
        <FormField etiqueta={t('prefijo')} ayuda={t('ayudaPrefijo')} error={errorPrefijo} obligatorio>
          {(c) => (
            <input
              id={c.id}
              aria-describedby={c['aria-describedby']}
              aria-invalid={!!errorPrefijo}
              value={prefijo}
              maxLength={10}
              disabled={bloqueado}
              autoComplete="off"
              spellCheck={false}
              placeholder={t('placeholderPrefijo')}
              onChange={(e) => {
                setPrefijo(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''));
                setErrorPrefijo(null);
              }}
              className={`${CLASE_INPUT} sm:max-w-xs`}
            />
          )}
        </FormField>
      )}

      <div className="rounded-xl border border-line bg-subtle px-4 py-3">
        <p className="text-xs font-medium text-fg-secondary">{t('asiSeVera')}</p>
        <p className="mt-1 font-mono text-base font-semibold text-fg">{ejemplo}</p>
      </div>
    </div>
  );
}
