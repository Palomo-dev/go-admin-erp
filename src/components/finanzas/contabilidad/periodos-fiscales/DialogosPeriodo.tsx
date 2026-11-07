'use client';

/**
 * Diálogos de Periodos contables: cerrar con checklist (991:78604 · 991:78713),
 * reabrir con motivo (991:78789), generar periodos (2327:128337) y cerrar
 * ejercicio (2327:128271). Las escrituras van por `PeriodosFiscalesService`
 * (RPC con permiso y bloqueo en la base); aquí solo se arma el diálogo.
 */
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CircleCheck, CircleX, Lock, TriangleAlert } from 'lucide-react';
import { AvisoTonal, Dialogo, DialogoMotivo, FormField, Skeleton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { cn } from '@/lib/utils';
import {
  checklistCierre,
  yaGenerado,
  type EstadoItem,
  type ItemCierre,
} from '@/lib/finanzas/contabilidad/periodosLogica';
import {
  PeriodosFiscalesService,
  motivoReaperturaValido,
  type ConsecutivoComprobante,
  type FiscalPeriod,
} from './PeriodosFiscalesService';

const CLASE_SELECT = 'h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg';
const RUTA_SALUD = '/app/finanzas/contabilidad/salud';
const RUTA_BORRADORES = '/app/finanzas/contabilidad/asientos?estado=borrador';

// ── Cerrar periodo ──────────────────────────────────────────────────────────

interface CerrarPeriodoDialogoProps {
  periodo: FiscalPeriod | null;
  nombre: string;
  puedeCerrar: boolean;
  onCerrado: () => void | Promise<void>;
  onError: (error: unknown) => void;
  onAbiertoChange: (abierto: boolean) => void;
}

interface Revision {
  cuadre: { debitos: number; creditos: number } | null;
  pendientes: { borradores: number; pendientes: number } | null;
  consecutivos: ConsecutivoComprobante[];
}

export function CerrarPeriodoDialogo({ periodo, nombre, puedeCerrar, onCerrado, onError, onAbiertoChange }: CerrarPeriodoDialogoProps) {
  const t = useTranslations('finanzasContabilidadR3.periodos.cerrar');
  const { formatear } = useMonedaOrganizacion();
  const [revision, setRevision] = useState<Revision | null>(null);
  const [notas, setNotas] = useState('');
  const [cerrando, setCerrando] = useState(false);

  useEffect(() => {
    setRevision(null);
    setNotas('');
    if (!periodo) return;
    let vigente = true;
    void Promise.all([
      PeriodosFiscalesService.cuadreDelPeriodo(periodo).catch(() => null),
      PeriodosFiscalesService.pendientesDelPeriodo(periodo.id),
      PeriodosFiscalesService.consecutivosDelPeriodo(periodo.id),
    ]).then(([cuadre, pendientes, consecutivos]) => {
      if (vigente) setRevision({ cuadre, pendientes, consecutivos });
    });
    return () => {
      vigente = false;
    };
  }, [periodo]);

  const saltos = revision?.consecutivos.reduce((n, c) => n + c.saltos.length, 0) ?? 0;
  const { items, bloqueado } = revision
    ? checklistCierre({ cuadre: revision.cuadre, pendientes: revision.pendientes, saltosConsecutivo: saltos })
    : { items: [] as ItemCierre[], bloqueado: true };

  const cerrar = async () => {
    if (!periodo) return;
    setCerrando(true);
    try {
      await PeriodosFiscalesService.cerrarPeriodo(periodo.id, notas);
      await onCerrado();
    } catch (error) {
      onError(error);
    } finally {
      setCerrando(false);
    }
  };

  const texto = (item: ItemCierre): { titulo: string; detalle: string; href?: string; enlace?: string } => {
    switch (item.id) {
      case 'balance':
        if (!revision?.cuadre) return { titulo: t('items.balanceSinDato'), detalle: '' };
        return item.estado === 'ok'
          ? { titulo: t('items.balanceOk'), detalle: t('items.balanceOkDetalle', { periodo: nombre }) }
          : { titulo: t('items.balanceMal'), detalle: t('items.balanceMalDetalle', { valor: formatear(item.cantidad) }), href: RUTA_SALUD, enlace: t('items.ver') };
      case 'pendientes':
        if (!revision?.pendientes) return { titulo: t('items.pendientesSinDato'), detalle: '' };
        return item.estado === 'ok'
          ? { titulo: t('items.pendientes', { n: 0 }), detalle: t('items.pendientesOk', { periodo: nombre }) }
          : { titulo: t('items.pendientes', { n: item.cantidad }), detalle: t('items.pendientesMal'), href: RUTA_SALUD, enlace: t('items.ver') };
      case 'borradores':
        if (!revision?.pendientes) return { titulo: t('items.pendientesSinDato'), detalle: '' };
        return item.estado === 'ok'
          ? { titulo: t('items.borradores', { n: 0 }), detalle: t('items.borradoresOk', { periodo: nombre }) }
          : { titulo: t('items.borradores', { n: item.cantidad }), detalle: t('items.borradoresMal'), href: RUTA_BORRADORES, enlace: t('items.verBorradores') };
      case 'consecutivos':
      default:
        return item.estado === 'ok'
          ? { titulo: t('items.consecutivosOk'), detalle: '' }
          : { titulo: t('items.consecutivosAviso', { n: item.cantidad }), detalle: t('items.consecutivosDetalle') };
    }
  };

  // «Pendientes» y «borradores» sin dato dicen lo mismo: una sola fila.
  const visibles = items.filter((i) => !(i.id === 'borradores' && !revision?.pendientes));

  return (
    <Dialogo
      abierto={!!periodo}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo', { periodo: nombre })}
      descripcion={t('descripcion', { periodo: nombre })}
      icono={Lock}
      ancho={560}
      primario={{
        etiqueta: t('confirmar'),
        onClick: () => void cerrar(),
        cargando: cerrando,
        deshabilitada: !revision || bloqueado || !puedeCerrar,
        motivo: !puedeCerrar ? t('sinPermiso') : bloqueado && revision ? t('bloqueado') : undefined,
      }}
      pie={<span className="text-xs text-fg-muted">{t('pie')}</span>}
    >
      <div className="space-y-3">
        {!revision ? (
          <div className="space-y-2" aria-busy="true" aria-label={t('revisando')}>
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : (
          <ul className="space-y-2">
            {visibles.map((item) => {
              const { titulo, detalle, href, enlace } = texto(item);
              return (
                <ItemChecklist key={item.id} estado={item.estado} titulo={titulo} detalle={detalle} href={href} enlace={enlace}>
                  {item.id === 'consecutivos' && item.estado === 'aviso' && revision && (
                    <ul className="mt-1 space-y-0.5 text-xs text-fg-secondary">
                      {revision.consecutivos
                        .filter((c) => c.saltos.length > 0)
                        .map((c) => (
                          <li key={`${c.comprobante_tipo}-${c.comprobante_prefijo}`}>
                            {t('items.consecutivo', {
                              tipo: `${c.comprobante_tipo.replace(/_/g, ' ')}${c.comprobante_prefijo ? ` ${c.comprobante_prefijo}` : ''}`,
                              desde: c.desde,
                              hasta: c.hasta,
                              cantidad: c.cantidad,
                            })}{' '}
                            · {t('items.faltan', { lista: `${c.saltos.slice(0, 20).join(', ')}${c.saltos.length > 20 ? '…' : ''}` })}
                          </li>
                        ))}
                    </ul>
                  )}
                </ItemChecklist>
              );
            })}
          </ul>
        )}
        <FormField etiqueta={t('notas')} ayuda={t('notasAyuda')}>
          <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
        </FormField>
      </div>
    </Dialogo>
  );
}

const ICONO_ITEM: Record<EstadoItem, { icono: typeof CircleCheck; clase: string }> = {
  ok: { icono: CircleCheck, clase: 'text-success-text' },
  aviso: { icono: TriangleAlert, clase: 'text-warning-text' },
  bloquea: { icono: CircleX, clase: 'text-danger-text' },
};

/** Figma `kit/contabilidad · ItemChecklist` 978:605674: ok · aviso · bloquea. */
function ItemChecklist({
  estado,
  titulo,
  detalle,
  href,
  enlace,
  children,
}: {
  estado: EstadoItem;
  titulo: string;
  detalle?: string;
  href?: string;
  enlace?: string;
  children?: ReactNode;
}) {
  const { icono: Icono, clase } = ICONO_ITEM[estado];
  return (
    <li
      data-estado={estado}
      className={cn(
        'flex items-start gap-3 rounded-lg border px-3 py-2.5',
        estado === 'bloquea' ? 'border-line-danger bg-danger-subtle' : 'border-line bg-surface',
      )}
    >
      <Icono aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', clase)} strokeWidth={1.5} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-fg">{titulo}</span>
        {detalle && <span className="block text-xs text-fg-secondary">{detalle}</span>}
        {children}
      </span>
      {href && enlace && (
        <Link href={href} className="shrink-0 text-sm font-medium text-brand hover:underline">
          {enlace}
        </Link>
      )}
    </li>
  );
}

// ── Reabrir ─────────────────────────────────────────────────────────────────

export function ReabrirPeriodoDialogo({
  periodo,
  nombre,
  onReabierto,
  mensajeError,
  onAbiertoChange,
}: {
  periodo: FiscalPeriod | null;
  nombre: string;
  onReabierto: () => void | Promise<void>;
  mensajeError: (error: unknown) => string;
  onAbiertoChange: (abierto: boolean) => void;
}) {
  const t = useTranslations('finanzasContabilidadR3.periodos.reabrir');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setError(null), [periodo]);

  return (
    <DialogoMotivo
      abierto={!!periodo}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo', { periodo: nombre })}
      descripcion={t('descripcion', { periodo: nombre })}
      textoConfirmar={t('confirmar')}
      consecuencias={[t('consecuencia1'), t('consecuencia2')]}
      etiquetaMotivo={t('etiquetaMotivo')}
      placeholder={t('placeholder')}
      minimo={5}
      cargando={cargando}
      error={error}
      onConfirmar={async (motivo) => {
        if (!periodo) return;
        const limpio = motivoReaperturaValido(motivo);
        if (!limpio) return;
        setCargando(true);
        setError(null);
        try {
          await PeriodosFiscalesService.reabrirPeriodo(periodo.id, limpio);
          await onReabierto();
        } catch (e) {
          setError(mensajeError(e));
        } finally {
          setCargando(false);
        }
      }}
    />
  );
}

// ── Generar ─────────────────────────────────────────────────────────────────

export function GenerarPeriodosDialogo({
  abierto,
  anioInicial,
  periodos,
  onGenerado,
  onError,
  onAbiertoChange,
}: {
  abierto: boolean;
  anioInicial: number;
  periodos: FiscalPeriod[];
  onGenerado: (anio: number, tipo: 'monthly' | 'yearly') => void | Promise<void>;
  onError: (error: unknown) => void;
  onAbiertoChange: (abierto: boolean) => void;
}) {
  const t = useTranslations('finanzasContabilidadR3.periodos.generarDialogo');
  const [anioTexto, setAnioTexto] = useState(String(anioInicial));
  const [tipo, setTipo] = useState<'monthly' | 'yearly'>('monthly');
  const [generando, setGenerando] = useState(false);

  useEffect(() => {
    if (abierto) {
      setAnioTexto(String(anioInicial));
      setTipo('monthly');
    }
  }, [abierto, anioInicial]);

  const anio = Number(anioTexto);
  const anioValido = Number.isInteger(anio) && anio >= 2000 && anio <= 2100;
  const repetido = anioValido && yaGenerado(periodos, anio, tipo);

  const generar = async () => {
    setGenerando(true);
    try {
      if (tipo === 'monthly') await PeriodosFiscalesService.generarPeriodosMensuales(anio);
      else await PeriodosFiscalesService.generarPeriodoAnual(anio);
      await onGenerado(anio, tipo);
    } catch (error) {
      onError(error);
    } finally {
      setGenerando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      ancho={440}
      primario={{
        etiqueta: t('confirmar'),
        onClick: () => void generar(),
        cargando: generando,
        deshabilitada: !anioValido || repetido,
        motivo: !anioValido ? t('anioInvalido') : repetido ? t('yaExiste', { anio }) : undefined,
      }}
    >
      <div className="space-y-4">
        <FormField etiqueta={t('anio')} obligatorio error={!anioValido ? t('anioInvalido') : repetido ? t('yaExiste', { anio }) : null}>
          <Input type="number" inputMode="numeric" min={2000} max={2100} value={anioTexto} onChange={(e) => setAnioTexto(e.target.value)} />
        </FormField>
        <FormField etiqueta={t('tipo')} obligatorio>
          {(campo) => (
            <select id={campo.id} value={tipo} onChange={(e) => setTipo(e.target.value as 'monthly' | 'yearly')} className={CLASE_SELECT}>
              <option value="monthly">{t('mensuales')}</option>
              <option value="yearly">{t('anual')}</option>
            </select>
          )}
        </FormField>
      </div>
    </Dialogo>
  );
}

// ── Cerrar ejercicio ────────────────────────────────────────────────────────

export function CerrarEjercicioDialogo({
  abierto,
  anioInicial,
  borradores,
  anioConBorradores,
  puedeCerrar,
  onCerrado,
  onError,
  onAbiertoChange,
}: {
  abierto: boolean;
  anioInicial: number;
  /** Borradores contados para `anioConBorradores` (los de otro año no se conocen). */
  borradores: number;
  anioConBorradores: number;
  puedeCerrar: boolean;
  onCerrado: (anio: number, resultado: { asientos: number; resultado: number; cuenta_resultado: string }) => void | Promise<void>;
  onError: (error: unknown) => void;
  onAbiertoChange: (abierto: boolean) => void;
}) {
  const t = useTranslations('finanzasContabilidadR3.periodos.ejercicio');
  const tc = useTranslations('finanzasContabilidadR3.periodos');
  const { formatear } = useMonedaOrganizacion();
  const [anioTexto, setAnioTexto] = useState(String(anioInicial));
  const [vista, setVista] = useState<{ resultado: number; cuentaResultado: string } | null | 'cargando'>('cargando');
  const [cerrando, setCerrando] = useState(false);

  useEffect(() => {
    if (abierto) setAnioTexto(String(anioInicial));
  }, [abierto, anioInicial]);

  const anio = Number(anioTexto);
  const anioValido = Number.isInteger(anio) && anio >= 2000 && anio <= 2100;

  useEffect(() => {
    if (!abierto || !anioValido) return;
    let vigente = true;
    setVista('cargando');
    void PeriodosFiscalesService.resultadoDelAnio(anio)
      .then((v) => vigente && setVista(v))
      .catch(() => vigente && setVista(null));
    return () => {
      vigente = false;
    };
  }, [abierto, anio, anioValido]);

  const quedanBorradores = anio === anioConBorradores && borradores > 0;

  const cerrar = async () => {
    setCerrando(true);
    try {
      const resultado = await PeriodosFiscalesService.cerrarEjercicio(anio);
      await onCerrado(anio, resultado);
    } catch (error) {
      onError(error);
    } finally {
      setCerrando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo', { anio: anioValido ? anio : anioInicial })}
      descripcion={t('descripcion')}
      ancho={560}
      primario={{
        etiqueta: t('confirmar'),
        onClick: () => void cerrar(),
        cargando: cerrando,
        deshabilitada: !puedeCerrar || !anioValido || quedanBorradores,
        motivo: !puedeCerrar ? tc('cierreAnualSinPermiso') : quedanBorradores ? t('borradoresTexto') : undefined,
      }}
    >
      <div className="space-y-4">
        <FormField etiqueta={t('anio')} obligatorio>
          <Input type="number" inputMode="numeric" min={2000} max={2100} value={anioTexto} onChange={(e) => setAnioTexto(e.target.value)} />
        </FormField>
        {quedanBorradores && (
          <AvisoTonal
            tono="advertencia"
            titulo={t('borradoresTitulo', { n: borradores })}
            descripcion={t('borradoresTexto')}
            accion={{ etiqueta: tc('cerrar.items.verBorradores'), href: RUTA_BORRADORES }}
          />
        )}
        {vista === 'cargando' ? (
          <Skeleton className="h-20 rounded-xl" aria-label={t('calculando')} />
        ) : vista === null ? (
          <p className="text-sm text-fg-secondary">{t('sinDato')}</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="bg-subtle text-left text-xs font-medium text-fg-secondary">
                <tr>
                  <th scope="col" className="px-3 py-2.5">{t('resultado')}</th>
                  <th scope="col" className="px-3 py-2.5">{t('cuentaDestino')}</th>
                  <th scope="col" className="px-3 py-2.5 text-right">{t('valor')}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-line">
                  <td className="px-3 py-2.5 text-fg">{vista.resultado < -0.01 ? t('perdida') : t('utilidad')}</td>
                  <td className="px-3 py-2.5 text-fg">{vista.cuentaResultado === '3610' ? t('cuenta3610') : t('cuenta3605')}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-fg">{formatear(Math.abs(vista.resultado))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-fg-muted">{t('nota')}</p>
      </div>
    </Dialogo>
  );
}
