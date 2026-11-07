'use client';

/**
 * Hoja lateral del detalle de un saldo a favor (Figma `1020:91478`, captura
 * `73-documentos-saldo-detalle.png`): valor, usado y disponible; movimientos
 * (origen → aplicaciones → devoluciones → anulación) y datos. Sin ruta propia:
 * el listado la abre con `?saldo=<id>`.
 *
 * Lee `GET /api/saldos-a-favor/[id]` (servidor, organización de la sesión).
 * Las acciones son las mismas del listado y van al servidor.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Ban, Banknote, FileText, PiggyBank, ScrollText, Undo2, type LucideIcon } from 'lucide-react';
import { EmptyState, FilaDato, ListaDatos, PanelAdaptable, StatusBadge, Tarjeta, clasesBoton } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { abrirDocumento } from '@/lib/documents/cliente';
import {
  BADGE_ESTADO_SALDO,
  accionesSaldo,
  type DetalleSaldo,
  type FilaListadoSaldo,
  type MovimientoSaldo,
  type PermisosSaldo,
} from '@/lib/finanzas/saldosAFavor/listadoLogica';
import { ErrorPeticionSaldoFavor, saldosAFavorService } from './saldosAFavorService';

export interface DetalleSaldoPanelProps {
  saldoId: string | null;
  onCerrar: () => void;
  permisos: PermisosSaldo;
  /** Cambia cuando el listado registra una acción: la hoja se vuelve a leer. */
  version: number;
  onAplicar: (s: FilaListadoSaldo) => void;
  onDevolver: (s: FilaListadoSaldo) => void;
  onAnular: (s: FilaListadoSaldo) => void;
}

const ICONO_MOVIMIENTO: Record<MovimientoSaldo['tipo'], LucideIcon> = {
  origen: ScrollText,
  aplicacion: FileText,
  devolucion: Undo2,
  anulacion: Ban,
};

/** Ruta del documento de un movimiento, si tiene pantalla. */
export function hrefMovimiento(m: MovimientoSaldo, origen: FilaListadoSaldo['origen']): string | undefined {
  if (!m.documentoId) return undefined;
  if (m.tipo === 'aplicacion') return `/app/finanzas/facturas-venta/${m.documentoId}`;
  if (m.tipo === 'origen' && (origen === 'nota_credito' || origen === 'devolucion')) return `/app/finanzas/notas-credito/${m.documentoId}`;
  return undefined;
}

export function DetalleSaldoPanel({ saldoId, onCerrar, permisos, version, onAplicar, onDevolver, onAnular }: DetalleSaldoPanelProps) {
  const t = useTranslations('finanzasDocumentosR3.saldos');
  const moneda = useMonedaOrganizacion();
  const { formatDate } = useFormatDate();
  const [datos, setDatos] = useState<DetalleSaldo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (id: string) => {
    setError(null);
    try {
      setDatos(await saldosAFavorService.detalle(id));
    } catch (e) {
      setDatos(null);
      setError(e instanceof ErrorPeticionSaldoFavor ? String(e.codigo) : 'error_desconocido');
    }
  }, []);

  useEffect(() => {
    if (!saldoId) {
      setDatos(null);
      return;
    }
    if (datos?.saldo.id !== saldoId) setDatos(null);
    void cargar(saldoId);
    // `datos` no dispara la lectura: solo el id y la versión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saldoId, version, cargar]);

  const s = datos?.saldo ?? null;
  const acciones = s ? accionesSaldo(s, permisos) : null;
  const titulo = s ? t('detalle.titulo', { cliente: s.cliente ?? t('sinCliente') }) : t('detalle.cargando');
  const origenTexto = (f: FilaListadoSaldo) => t(`origenes.${f.origen}`);

  const textoMovimiento = (m: MovimientoSaldo): { tipo: string; numero: string; linea: string } => {
    const fecha = formatDate(m.fecha);
    switch (m.tipo) {
      case 'origen':
        return {
          tipo: s ? t(`detalle.movimiento.origen.${s.origen}`) : '',
          numero: m.numero ?? (s ? origenTexto(s) : ''),
          linea: [m.metodo ? t('detalle.movimiento.metodo', { metodo: m.metodo }) : null, moneda.formatear(m.monto), fecha].filter(Boolean).join(' · '),
        };
      case 'aplicacion':
        return { tipo: t('detalle.movimiento.factura'), numero: m.numero ?? '—', linea: t('detalle.movimiento.aplicado', { monto: moneda.formatear(m.monto), fecha }) };
      case 'devolucion':
        return {
          tipo: t('detalle.movimiento.devolucion'),
          numero: m.referencia ?? t('detalle.movimiento.devolucionSinRef'),
          linea: t('detalle.movimiento.devuelto', { monto: moneda.formatear(m.monto), metodo: m.metodo ?? '—', fecha }),
        };
      default:
        return { tipo: t('detalle.movimiento.anulacion'), numero: m.motivo ?? '—', linea: fecha };
    }
  };

  const pie =
    s && acciones && (acciones.aplicar || acciones.devolver || acciones.anular) ? (
      <div className="flex flex-wrap items-center justify-end gap-2">
        {acciones.anular && (
          <button type="button" onClick={() => onAnular(s)} className={clasesBoton({ variante: 'fantasma' })}>
            <Ban aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('acciones.anular')}
          </button>
        )}
        {acciones.devolver && (
          <button type="button" onClick={() => onDevolver(s)} className={clasesBoton({ variante: 'secundario' })}>
            <Banknote aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('acciones.devolver')}
          </button>
        )}
        {acciones.aplicar && (
          <button type="button" onClick={() => onAplicar(s)} className={clasesBoton({ variante: 'primario' })}>
            <FileText aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('acciones.aplicarAFactura')}
          </button>
        )}
      </div>
    ) : undefined;

  return (
    <PanelAdaptable
      abierto={!!saldoId}
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo={titulo}
      icono={PiggyBank}
      descripcion={
        s ? (
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge estado={BADGE_ESTADO_SALDO[s.estado]} etiqueta={t(`estados.${s.estado}`)} />
            <span>{[s.origenNumero ? `${origenTexto(s)} ${s.origenNumero}` : origenTexto(s), formatDate(s.fecha), datos?.sucursal].filter(Boolean).join(' · ')}</span>
          </span>
        ) : undefined
      }
      ancho={560}
      pie={pie}
    >
      {error ? (
        <EmptyState
          variante={error === 'sin_permiso' ? 'forbidden' : 'error'}
          titulo={error === 'saldo_no_encontrado' ? t('detalle.noEncontrado') : error === 'sin_permiso' ? t('sinPermiso.titulo') : t('detalle.error')}
          onReintentar={error === 'saldo_no_encontrado' || error === 'sin_permiso' || !saldoId ? undefined : () => void cargar(saldoId)}
        />
      ) : !s ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-3 gap-3">
            {(
              [
                ['valor', s.valor, 'text-fg'],
                ['usado', s.usado, 'text-fg'],
                ['disponible', s.disponible, s.disponible > 0 && s.estado === 'disponible' ? 'text-success-text' : 'text-fg'],
              ] as const
            ).map(([clave, valor, clase]) => (
              <div key={clave} className="flex flex-col gap-0.5">
                <dt className="text-[13px] text-fg-secondary">{t(`detalle.${clave}`)}</dt>
                <dd className={`text-base font-semibold tabular-nums ${clase}`}>{moneda.formatear(valor)}</dd>
              </div>
            ))}
          </dl>

          <Tarjeta titulo={t('detalle.movimientos')}>
            <ol className="flex flex-col gap-2">
              {datos!.movimientos.map((m) => {
                const Icono = ICONO_MOVIMIENTO[m.tipo];
                const txt = textoMovimiento(m);
                const href = hrefMovimiento(m, s.origen);
                const contenido = (
                  <>
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-subtle text-fg-secondary">
                      <Icono aria-hidden="true" className="size-4" strokeWidth={1.5} />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-xs text-fg-muted">{txt.tipo}</span>
                      <span className="truncate text-sm font-medium text-fg">{txt.numero}</span>
                      <span className="text-xs text-fg-secondary">{txt.linea}</span>
                    </span>
                  </>
                );
                return (
                  <li key={m.id}>
                    {href ? (
                      <Link href={href} className="flex items-start gap-3 rounded-lg border border-line p-3 hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                        {contenido}
                      </Link>
                    ) : (
                      <div className="flex items-start gap-3 rounded-lg border border-line p-3">{contenido}</div>
                    )}
                  </li>
                );
              })}
              <li>
                <div className="flex items-start gap-3 rounded-lg border border-brand bg-brand-tint p-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-brand">
                    <PiggyBank aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-xs text-fg-muted">{t('detalle.movimiento.saldo')}</span>
                    <span className="text-sm font-medium text-fg">{moneda.formatear(s.disponible)}</span>
                    <span className="text-xs text-fg-secondary">
                      {[t(`estados.${s.estado}`), s.vence ? t('detalle.venceEl', { fecha: formatDate(s.vence) }) : t('sinVencimiento')].join(' · ')}
                    </span>
                  </span>
                </div>
              </li>
            </ol>
          </Tarjeta>

          <Tarjeta titulo={t('detalle.datos')}>
            <ListaDatos>
              <FilaDato
                etiqueta={t('detalle.cliente')}
                valor={[s.cliente ?? t('sinCliente'), s.clienteDoc].filter(Boolean).join(' · ')}
                href={`/app/finanzas/cuentas-por-cobrar/cliente/${s.clienteId}`}
              />
              <FilaDato etiqueta={t('detalle.origen')} valor={origenTexto(s)} />
              {s.origen === 'pago' && s.origenId && (
                <FilaDato
                  etiqueta={t('detalle.recibo')}
                  valor={
                    <button type="button" onClick={() => abrirDocumento('recibo-caja', s.origenId as string)} className="text-brand hover:underline">
                      {s.origenNumero ?? t('acciones.verRecibo')}
                    </button>
                  }
                />
              )}
              {datos?.sucursal && <FilaDato etiqueta={t('detalle.sucursal')} valor={datos.sucursal} />}
              <FilaDato etiqueta={t('detalle.vence')} valor={s.vence ? formatDate(s.vence) : t('sinVencimiento')} />
              {s.notas && <FilaDato etiqueta={t('detalle.notas')} valor={s.notas} />}
            </ListaDatos>
          </Tarjeta>

          {acciones && !acciones.anular && acciones.motivoNoAnulable && acciones.motivoNoAnulable !== 'sin_permiso' && s.estado !== 'anulado' && (
            <p className="text-xs text-fg-muted">{t(`anular.bloqueos.${acciones.motivoNoAnulable}`)}</p>
          )}
        </div>
      )}
    </PanelAdaptable>
  );
}
