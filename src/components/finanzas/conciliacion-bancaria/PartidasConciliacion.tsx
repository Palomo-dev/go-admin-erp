'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { DataTable, Dialogo, FormField, StatusBadge, type ColumnaTabla } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { errorCierre, importeItem } from '@/lib/finanzas/conciliacion/diferencia';
import { ConciliacionService, type PartidaConciliacion, type PartidasDeConciliacion } from './ConciliacionService';
import type { BankReconciliationItem } from '../bancos/BancosService';

const SIN_MOVIMIENTO = 'ninguno';

interface PartidasConciliacionProps {
  reconciliationId: string;
  partidas: PartidasDeConciliacion;
  cerrada: boolean;
  puedeResolver: boolean;
  /** Movimientos conciliados aquí: entre ellos suele estar el que resuelve la partida. */
  items: readonly BankReconciliationItem[];
  formatear: (valor: number) => string;
  onCambio: () => void | Promise<void>;
}

/** «octubre» si todas vienen del mismo mes; si no, el título general. */
function mesDeOrigen(partidas: readonly PartidaConciliacion[], locale: string): string | null {
  const meses = new Set(partidas.map((p) => p.origen_fin.slice(0, 7)));
  if (meses.size !== 1) return null;
  return formatPlainDateMes(partidas[0].origen_fin, locale);
}

function formatPlainDateMes(fecha: string, locale: string): string {
  const [anio, mes] = fecha.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(anio, mes - 1, 15)));
}

/**
 * Partidas conciliatorias (Figma «Conciliación — cerrada con partida pendiente» y
 * «— partidas de la conciliación anterior»). Una partida no genera asiento: pasa
 * a la conciliación siguiente hasta que aparece en el extracto.
 */
export function PartidasConciliacion({
  reconciliationId,
  partidas,
  cerrada,
  puedeResolver,
  items,
  formatear,
  onCambio,
}: PartidasConciliacionProps) {
  const t = useTranslations('conciliacionCierre');
  const locale = useLocale();
  const { formatDate } = useFormatDate();
  const [resolviendo, setResolviendo] = useState<PartidaConciliacion | null>(null);
  const [movimiento, setMovimiento] = useState(SIN_MOVIMIENTO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const movimientos = useMemo(
    () => items.filter((i) => i.is_matched && i.bank_transaction_id !== null),
    [items],
  );

  const abrir = (partida: PartidaConciliacion) => {
    setMovimiento(SIN_MOVIMIENTO);
    setError(null);
    setResolviendo(partida);
  };

  const resolver = async () => {
    if (!resolviendo) return;
    setGuardando(true);
    setError(null);
    try {
      await ConciliacionService.resolverPartida(
        resolviendo.id,
        reconciliationId,
        movimiento === SIN_MOVIMIENTO ? null : Number(movimiento),
      );
      setResolviendo(null);
      await onCambio();
    } catch (e) {
      console.error('Error resolviendo la partida:', e);
      setError(t(`errores.${errorCierre(e)}`));
    } finally {
      setGuardando(false);
    }
  };

  const columnasBase: ColumnaTabla<PartidaConciliacion>[] = [
    { id: 'fecha', encabezado: t('partidas.fecha'), ancho: 120, celda: (p) => formatPlainDate(p.fecha) },
    { id: 'descripcion', encabezado: t('partidas.descripcion'), celda: (p) => p.descripcion },
    { id: 'valor', encabezado: t('partidas.valor'), variante: 'importe', ancho: 160, celda: (p) => formatear(p.valor) },
    {
      id: 'estado',
      encabezado: t('partidas.estado'),
      ancho: 170,
      celda: (p) =>
        p.estado === 'pendiente' ? (
          <StatusBadge estado="pendiente" etiqueta={t('partidas.pendiente')} tono="advertencia" />
        ) : (
          <StatusBadge
            estado="resuelta"
            etiqueta={t('partidas.resueltaEl', { fecha: formatDate(p.resuelta_en) })}
            tono="exito"
          />
        ),
    },
  ];

  const columnasPropias: ColumnaTabla<PartidaConciliacion>[] = [
    ...columnasBase,
    { id: 'registrada', encabezado: t('partidas.registradaPor'), ancho: 180, celda: (p) => p.registrada_por ?? '—' },
  ];

  const columnasTraidas: ColumnaTabla<PartidaConciliacion>[] = [
    ...columnasBase,
    {
      id: 'accion',
      encabezado: '',
      alinear: 'derecha',
      ancho: 160,
      celda: (p) => {
        if (p.estado === 'resuelta') {
          return p.bank_transaction_id ? (
            <Link href="/app/finanzas/tesoreria/cuentas" className="text-sm font-medium text-brand hover:underline">
              {t('partidas.verMovimiento')}
            </Link>
          ) : null;
        }
        if (cerrada || !puedeResolver) return null;
        return (
          <button
            type="button"
            onClick={() => abrir(p)}
            className="text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {t('partidas.marcarResuelta')}
          </button>
        );
      },
    },
  ];

  const mes = mesDeOrigen(partidas.traidas, locale);
  const pendientesPropias = partidas.propias.length > 0;

  return (
    <div className="space-y-6">
      {pendientesPropias && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-fg">{t('partidas.tituloPropias')}</h2>
          <DataTable
            etiqueta={t('partidas.tituloPropias')}
            columnas={columnasPropias}
            filas={partidas.propias}
            obtenerId={(p) => p.id}
            densidad="compacta"
          />
        </section>
      )}

      {partidas.traidas.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-fg">
            {mes ? t('partidas.tituloTraidasMes', { mes }) : t('partidas.tituloTraidas')}
          </h2>
          <DataTable
            etiqueta={t('partidas.tituloTraidas')}
            columnas={columnasTraidas}
            filas={partidas.traidas}
            obtenerId={(p) => p.id}
            densidad="compacta"
          />
        </section>
      )}

      {(pendientesPropias || partidas.traidas.length > 0) && (
        <p className="text-sm text-fg-secondary">{t('partidas.nota')}</p>
      )}

      <Dialogo
        abierto={resolviendo !== null}
        onAbiertoChange={(v) => !v && setResolviendo(null)}
        titulo={t('resolver.titulo')}
        descripcion={t('resolver.descripcion')}
        ancho={520}
        primario={{ etiqueta: t('resolver.confirmar'), onClick: () => void resolver(), cargando: guardando }}
      >
        {resolviendo && (
          <p className="text-sm text-fg">
            {resolviendo.descripcion} · {formatear(resolviendo.valor)}
          </p>
        )}
        <FormField etiqueta={t('resolver.movimiento')}>
          <Select value={movimiento} onValueChange={setMovimiento}>
            <SelectTrigger aria-label={t('resolver.movimiento')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SIN_MOVIMIENTO}>{t('resolver.sinMovimiento')}</SelectItem>
              {movimientos.map((i) => (
                <SelectItem key={i.id} value={String(i.bank_transaction_id)}>
                  {i.bank_transactions?.description ?? t('resolver.movimientoN', { id: i.bank_transaction_id ?? 0 })}
                  {' · '}
                  {formatear(importeItem(i))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </Dialogo>
    </div>
  );
}
