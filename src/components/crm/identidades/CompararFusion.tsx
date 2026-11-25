'use client';

/**
 * «Comparar y fusionar» (Figma CRM 1436:843123) y «Fusión — error, nada
 * cambió» (1438:1553). Dos registros lado a lado: se elige el principal y,
 * fila por fila, con qué dato se queda (los iguales se marcan «Igual» y no se
 * eligen). Confirmar es UNA llamada a `POST /api/crm/customer-merges`
 * (`crm_merge_customers`, transacción): si falla, nada cambió y se dice por qué.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Info, Merge } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { PageHeader } from '@/components/kit/PageHeader';
import { EmptyState } from '@/components/kit/EmptyState';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { clasesBoton } from '@/components/kit/botonClases';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { pedirCrm, ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import type { ClienteComparado, GrupoComparacion, IdGrupoComparacion } from '@/lib/services/crm/customerMergeLogica';
import { cn } from '@/utils/Utils';
import {
  choicesDesdeGrupos,
  claveErrorFusion,
  eleccionesGrupoIniciales,
  grupoIgual,
  gruposVisibles,
  leerIdsComparar,
  motivoComparacion,
  nombreCliente,
  valorGrupo,
  type Lado,
} from './fusionLogica';

type Estado = 'cargando' | 'listo' | 'error' | 'sinPermiso' | 'noEncontrado';
interface Respuesta {
  clientes: ClienteComparado[];
  puedeFusionar: boolean;
  puedeDeshacer: boolean;
}

const VOLVER = '/app/crm/identidades';

export function CompararFusion() {
  const t = useTranslations('crm.duplicados');
  const router = useRouter();
  const params = useSearchParams();
  const ids = useMemo(() => leerIdsComparar(params?.get('ids') ?? null), [params]);
  const { formatDate } = useFormatDate();

  const [estado, setEstado] = useState<Estado>('cargando');
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [derechaId, setDerechaId] = useState('');
  const [principalId, setPrincipalId] = useState('');
  const [elecciones, setElecciones] = useState<Partial<Record<IdGrupoComparacion, Lado>>>({});
  const [fusionando, setFusionando] = useState(false);
  const [error, setError] = useState<{ clave: string; nombre: string } | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    if (ids.length < 2) {
      setEstado('noEncontrado');
      return;
    }
    setEstado('cargando');
    pedirCrm<Respuesta>(`/api/crm/customer-merges/compare?ids=${ids.map(encodeURIComponent).join(',')}`, { signal: ctrl.signal })
      .then(({ data }) => {
        if (ctrl.signal.aborted) return;
        setDatos(data);
        setPrincipalId(data.clientes[0].id);
        setDerechaId(data.clientes[1].id);
        setEstado('listo');
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        const s = e instanceof ErrorApiCrm ? e.status : 0;
        setEstado(s === 401 || s === 403 ? 'sinPermiso' : s === 404 || s === 409 || s === 400 ? 'noEncontrado' : 'error');
      });
    return () => ctrl.abort();
  }, [ids]);

  const izquierda = datos?.clientes[0] ?? null;
  const derecha = datos?.clientes.find((c) => c.id === derechaId) ?? null;
  const columnas = izquierda && derecha ? [izquierda, derecha] : [];
  const principal = columnas.find((c) => c.id === principalId) ?? null;
  const secundario = columnas.find((c) => c.id !== principalId) ?? null;

  useEffect(() => {
    setElecciones(principal && secundario ? eleccionesGrupoIniciales(principal, secundario) : {});
    setError(null);
  }, [principal, secundario]);

  const nombre = (c: ClienteComparado | null) => (c ? (nombreCliente(c) ?? t('fusion.sinNombre')) : '');
  const motivo = izquierda && derecha ? motivoComparacion(izquierda, derecha) : null;
  const nRegistros = datos?.clientes.length ?? ids.length;
  const bloqueoFactura = (secundario?.conteos.facturasEmitidas ?? 0) > 0;
  const puedeFusionar = !!datos?.puedeFusionar && !!principal && !!secundario;

  const fusionar = async () => {
    if (!principal || !secundario) return;
    setFusionando(true);
    setError(null);
    try {
      const { data } = await pedirCrm<{ id: string }>('/api/crm/customer-merges', {
        method: 'POST',
        cuerpo: { primary_id: principal.id, secondary_id: secundario.id, choices: choicesDesdeGrupos(elecciones, secundario.id) },
      });
      toast({
        title: t('fusionada', { nombre: nombre(principal) }),
        description: t('fusionadaDetalle'),
        action: datos?.puedeDeshacer ? (
          <ToastAction altText={t('deshacer')} onClick={() => void deshacer(data.id)}>
            {t('deshacer')}
          </ToastAction>
        ) : undefined,
      });
      router?.push(VOLVER);
    } catch (e) {
      // La RPC es una transacción: si falló, nada cambió.
      setError({ clave: claveErrorFusion(e instanceof ErrorApiCrm ? e.codigo : null), nombre: nombre(secundario) });
      window.scrollTo?.({ top: 0, behavior: 'smooth' });
    } finally {
      setFusionando(false);
    }
  };

  const deshacer = async (mergeId: string) => {
    try {
      await pedirCrm(`/api/crm/customer-merges/${encodeURIComponent(mergeId)}/undo`, { method: 'POST', cuerpo: {} });
      toast({ title: t('deshecha') });
    } catch (e) {
      toast({ title: t('noDeshecha'), description: t(`errores.${claveErrorFusion(e instanceof ErrorApiCrm ? e.codigo : null)}`), variant: 'destructive' });
    }
  };

  const subtitulo =
    estado !== 'listo'
      ? undefined
      : motivo
        ? t('comparar.subtitulo', { motivo: t(`mismo.${motivo.clave}`, { valor: motivo.valor }), n: nRegistros })
        : t('comparar.subtituloManual', { n: nRegistros });

  const botonFusionar = (
    <button
      type="button"
      className={clasesBoton()}
      onClick={() => void fusionar()}
      disabled={!puedeFusionar || fusionando || bloqueoFactura}
      aria-busy={fusionando || undefined}
      title={bloqueoFactura ? t('comparar.bloqueoFactura.titulo', { nombre: nombre(secundario) }) : undefined}
    >
      <Merge aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {fusionando ? t('comparar.fusionando') : t('comparar.fusionar')}
    </button>
  );

  return (
    <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 pb-24 lg:p-6">
      <PageHeader
        titulo={t('comparar.titulo')}
        subtitulo={subtitulo}
        variante="form"
        volverA={VOLVER}
        migas={[
          { etiqueta: t('pantalla.migaCrm'), href: '/app/crm' },
          { etiqueta: t('pantalla.titulo'), href: VOLVER },
          { etiqueta: t('comparar.titulo') },
        ]}
        cargando={estado === 'cargando'}
        acciones={
          estado === 'listo' && datos?.puedeFusionar ? (
            <>
              <Link href={VOLVER} className={clasesBoton({ variante: 'fantasma', className: 'text-fg' })}>
                {t('comparar.cancelar')}
              </Link>
              {botonFusionar}
            </>
          ) : undefined
        }
      />

      {estado === 'cargando' && (
        <div aria-busy="true" aria-label={t('comparar.cargando')} className="flex flex-col gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-subtle" />
          ))}
        </div>
      )}

      {(estado === 'error' || estado === 'sinPermiso' || estado === 'noEncontrado') && (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            variante={estado === 'sinPermiso' ? 'forbidden' : estado === 'error' ? 'error' : 'empty'}
            titulo={t(estado === 'sinPermiso' ? 'sinPermiso' : estado === 'error' ? 'comparar.error' : 'comparar.noEncontrado')}
            accion={{ etiqueta: t('comparar.volver'), href: VOLVER }}
          />
        </div>
      )}

      {estado === 'listo' && datos && izquierda && derecha && principal && secundario && (
        <>
          {error && (
            <AvisoTonal
              tono="peligro"
              rol="alert"
              titulo={error.clave === 'factura_emitida' ? t('comparar.errorFactura.titulo', { nombre: error.nombre }) : t('fusion.error.titulo')}
              descripcion={error.clave === 'factura_emitida' ? t('comparar.errorFactura.descripcion') : t(`errores.${error.clave}`)}
            />
          )}
          {!error && bloqueoFactura && (
            <AvisoTonal
              tono="advertencia"
              titulo={t('comparar.bloqueoFactura.titulo', { nombre: nombre(secundario) })}
              descripcion={t('comparar.bloqueoFactura.descripcion', { n: secundario.conteos.facturasEmitidas })}
            />
          )}

          {datos.clientes.length > 2 && (
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
              <span className="text-[13px] text-fg-secondary">{t('comparar.otrosRegistros', { n: datos.clientes.length })}</span>
              <div className="sm:w-72">
                <SelectCrm
                  valor={derechaId}
                  onValorChange={(v) => {
                    setDerechaId(v);
                    if (principalId !== izquierda.id) setPrincipalId(izquierda.id);
                  }}
                  opciones={datos.clientes.slice(1).map((c) => ({ valor: c.id, etiqueta: nombre(c) }))}
                  aria-label={t('comparar.compararCon')}
                />
              </div>
            </div>
          )}

          <TablaComparacion
            columnas={[izquierda, derecha]}
            principalId={principal.id}
            onPrincipal={datos.puedeFusionar ? setPrincipalId : undefined}
            elecciones={elecciones}
            onElegir={(g, lado) => setElecciones((e) => ({ ...e, [g]: lado }))}
            formatDate={formatDate}
          />

          <div className="flex gap-3 rounded-xl border border-line-warning bg-warning-subtle p-4 text-[13px] leading-[18px] text-warning-text">
            <Info aria-hidden="true" className="mt-px size-4 shrink-0" strokeWidth={1.5} />
            <div className="flex flex-col gap-1">
              <p>
                {t('comparar.seMueve', {
                  conversaciones: t('comparar.n.conversaciones', { n: secundario.conteos.conversaciones }),
                  oportunidades: t('comparar.n.oportunidades', { n: secundario.conteos.oportunidades }),
                  llamadas: t('comparar.n.llamadas', { n: secundario.conteos.llamadas }),
                  identidades: t('comparar.n.identidades', { n: secundario.conteos.identidades }),
                })}
              </p>
              {(secundario.conteos.ventas > 0 || secundario.conteos.cartera > 0) && (
                <p>
                  {t('comparar.seQueda', {
                    ventas: t('comparar.n.ventas', { n: secundario.conteos.ventas }),
                    cartera: t('comparar.n.cartera', { n: secundario.conteos.cartera }),
                  })}
                </p>
              )}
            </div>
          </div>

          {!datos.puedeFusionar && <p className="text-xs text-fg-secondary">{t('soloLectura')}</p>}

          {datos.puedeFusionar && (
            <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-line bg-surface p-3 lg:hidden">
              <Link href={VOLVER} className={clasesBoton({ variante: 'secundario', className: 'flex-1' })}>
                {t('comparar.cancelar')}
              </Link>
              <div className="flex flex-[2] [&>button]:w-full">{botonFusionar}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface PropsTabla {
  columnas: [ClienteComparado, ClienteComparado];
  principalId: string;
  onPrincipal?: (id: string) => void;
  elecciones: Partial<Record<IdGrupoComparacion, Lado>>;
  onElegir: (g: IdGrupoComparacion, lado: Lado) => void;
  formatDate: (v: string) => string;
}

function TablaComparacion({ columnas, principalId, onPrincipal, elecciones, onElegir, formatDate }: PropsTabla) {
  const t = useTranslations('crm.duplicados');
  const [a, b] = columnas;
  const principal = a.id === principalId ? a : b;
  const secundario = a.id === principalId ? b : a;
  const grupos = gruposVisibles(principal, secundario);
  const ladoDe = (c: ClienteComparado): Lado => (c.id === principalId ? 'principal' : 'secundario');
  const etiquetaFila = (g: GrupoComparacion) =>
    g.id === 'documento'
      ? [a, b].some((c) => (c.identification_type ?? '').trim().toUpperCase() === 'NIT')
        ? t('comparar.filas.nit')
        : t('comparar.filas.documento')
      : t(`comparar.filas.${g.id}`);
  const whatsappA = a.whatsapp.join(', ');
  const whatsappB = b.whatsapp.join(', ');

  const subtitulo = (c: ClienteComparado) =>
    [
      c.lead_source ? t('comparar.creadoDesde', { fecha: formatDate(c.created_at), origen: c.lead_source }) : t('comparar.creado', { fecha: formatDate(c.created_at) }),
      c.conteos.oportunidades > 0 ? t('comparar.n.oportunidades', { n: c.conteos.oportunidades }) : null,
      c.conteos.facturas > 0 ? t('comparar.n.facturas', { n: c.conteos.facturas }) : null,
    ]
      .filter(Boolean)
      .join(' · ');

  const fila = 'grid grid-cols-1 gap-2 px-4 py-2.5 lg:grid-cols-[200px_minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-4';

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div role="radiogroup" aria-label={t('comparar.principal')} className={cn(fila, 'border-b border-line bg-subtle py-3')}>
        <span className="text-xs font-semibold text-fg-secondary">{t('comparar.campo')}</span>
        {columnas.map((c) => {
          const esPrincipal = c.id === principalId;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={esPrincipal}
              disabled={!onPrincipal}
              onClick={() => onPrincipal?.(c.id)}
              className={cn(
                'flex min-w-0 items-center gap-3 rounded-lg border bg-surface px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-default',
                esPrincipal ? 'border-brand-action ring-1 ring-brand-action' : 'border-line hover:border-line-strong',
              )}
            >
              <PuntoRadio activo={esPrincipal} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">{nombreCliente(c) ?? t('fusion.sinNombre')}</span>
                <span className="block truncate text-xs text-fg-secondary">{subtitulo(c)}</span>
              </span>
              {esPrincipal && <StatusBadge estado="principal" etiqueta={t('comparar.principal')} tono="marca" apariencia="contorno" tamano="sm" />}
            </button>
          );
        })}
      </div>

      <div className="divide-y divide-line">
        {grupos.map((g) => {
          const igual = grupoIgual(a, b, g);
          return (
            <div key={g.id} className={fila} role={igual ? undefined : 'radiogroup'} aria-label={igual ? undefined : etiquetaFila(g)}>
              <span className="text-xs font-semibold text-fg-secondary">{etiquetaFila(g)}</span>
              {columnas.map((c, i) => {
                const valor = valorGrupo(c, g);
                if (igual) {
                  return (
                    <span key={c.id} className="flex min-w-0 items-center gap-2 px-2.5 py-2 text-sm text-fg-secondary">
                      <span className="truncate">{valor || '—'}</span>
                      {i === 1 && valor && <StatusBadge estado="igual" etiqueta={t('comparar.igual')} tono="neutro" tamano="sm" />}
                    </span>
                  );
                }
                const lado = ladoDe(c);
                const activo = elecciones[g.id] === lado;
                return (
                  <label
                    key={c.id}
                    className={cn(
                      'flex min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm',
                      activo ? 'bg-brand-tint text-fg' : 'text-fg',
                      valor ? 'cursor-pointer' : 'cursor-not-allowed text-fg-muted',
                    )}
                  >
                    <input
                      type="radio"
                      name={`fila-${g.id}`}
                      className="size-4 shrink-0 accent-brand-action"
                      checked={activo}
                      disabled={!valor}
                      onChange={() => onElegir(g.id, lado)}
                    />
                    <span className="truncate">{valor || '—'}</span>
                  </label>
                );
              })}
            </div>
          );
        })}

        {(whatsappA || whatsappB) && (
          <div className={fila} title={t('comparar.whatsappSeMueve')}>
            <span className="text-xs font-semibold text-fg-secondary">{t('comparar.filas.whatsapp')}</span>
            {[whatsappA, whatsappB].map((v, i) => (
              <span key={i} className="truncate px-2.5 py-2 text-sm text-fg-secondary">
                {v || '—'}
              </span>
            ))}
            <span className="text-xs text-fg-muted lg:col-span-2 lg:col-start-2">{t('comparar.whatsappSeMueve')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function PuntoRadio({ activo }: { activo: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn('flex size-[18px] shrink-0 items-center justify-center rounded-full border', activo ? 'border-brand-action bg-brand-action' : 'border-line-strong bg-surface')}
    >
      {activo && <span className="size-1.5 rounded-full bg-surface" />}
    </span>
  );
}
