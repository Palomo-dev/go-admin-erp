'use client';

/**
 * Transferencia · detalle (Figma `2329:131697`), con el kit. Conserva lo del
 * detalle viejo: origen, destino, monto, fecha, referencia, notas, id, creado,
 * descargar comprobante, anular con motivo (`fn_transferencia_anular`, que
 * revierte saldos y genera el contra-asiento) y «Reintentar» si falla la carga.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ArrowLeftRight, Download, XCircle } from 'lucide-react';
import { DialogoMotivo, EmptyState, FilaDato, ListaDatos, PageHeader, Skeleton, StatusBadge, Tarjeta, clasesBoton } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { transferenciasService, type BankTransfer } from '@/lib/services/transferenciasService';
import { RUTAS_TESORERIA, rutaCuentaBancaria } from '@/lib/finanzas/tesoreria/rutas';
import { useCabeceraMovil } from '@/components/shell/header/cabeceraMovil';

const TONO_ESTADO = { completed: 'exito', pending: 'advertencia', cancelled: 'peligro' } as const;

export function TransferenciaDetalle({ id }: { id: string }) {
  const t = useTranslations('finanzasTesoreriaR3.transferencias');
  const tc = useTranslations('finanzasTesoreriaR3.comun');
  const te = useTranslations('tesoreria');
  const { formatear } = useMonedaOrganizacion();
  const { formatDate, formatDateTime } = useFormatDate();
  const [transferencia, setTransferencia] = useState<BankTransfer | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [anulando, setAnulando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [errorAnular, setErrorAnular] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    try {
      setTransferencia(await transferenciasService.getTransferById(id));
      setEstado('listo');
    } catch {
      setEstado('error');
    }
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useCabeceraMovil({ modo: 'page', titulo: t('detalleTitulo'), volverA: RUTAS_TESORERIA.transferencias });

  const comprobante = () => {
    if (!transferencia) return;
    const x = transferencia;
    const lineas = [
      t('comprobante.titulo'),
      `${t('comprobante.id')}: ${x.id}`,
      `${t('columnas.fecha')}: ${formatDate(x.transfer_date)}`,
      `${t('columnas.origen')}: ${x.from_account?.name ?? '—'} (${x.from_account?.bank_name ?? '—'})`,
      `${t('columnas.destino')}: ${x.to_account?.name ?? '—'} (${x.to_account?.bank_name ?? '—'})`,
      `${t('columnas.monto')}: ${formatear(Number(x.amount))}`,
      `${t('columnas.referencia')}: ${x.reference ?? '—'}`,
      `${t('columnas.estado')}: ${t(`estados.${x.status}`)}`,
      `${t('notas')}: ${x.notes ?? '—'}`,
    ];
    const blob = new Blob([lineas.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transferencia_${x.id.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const confirmar = async (motivo: string) => {
    if (!transferencia) return;
    setOcupado(true);
    setErrorAnular(null);
    try {
      const r = await transferenciasService.cancelTransfer(transferencia.id, motivo);
      if (!r.success) {
        setErrorAnular(te(`errores.${r.codigo ?? 'desconocido'}`));
        return;
      }
      toast.success(t('anulada'));
      setAnulando(false);
      void cargar();
    } finally {
      setOcupado(false);
    }
  };

  if (estado === 'cargando' && !transferencia) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (estado === 'error' || !transferencia) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <EmptyState
          variante={estado === 'error' ? 'error' : 'empty'}
          titulo={estado === 'error' ? t('errorCarga') : t('noEncontrada')}
          onReintentar={estado === 'error' ? () => void cargar() : undefined}
          accion={{ etiqueta: t('volver'), href: RUTAS_TESORERIA.transferencias }}
        />
      </div>
    );
  }

  const x = transferencia;
  const titulo = x.reference ? t('detalleTituloRef', { referencia: x.reference }) : t('detalleTitulo');

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        variante="detail"
        titulo={titulo}
        subtitulo={`${x.from_account?.name ?? '—'} → ${x.to_account?.name ?? '—'} · ${formatDate(x.transfer_date)}`}
        icono={ArrowLeftRight}
        badge={<StatusBadge estado={x.status} etiqueta={t(`estados.${x.status}`)} tono={TONO_ESTADO[x.status]} />}
        volverA={RUTAS_TESORERIA.transferencias}
        migas={[{ etiqueta: tc('migas.tesoreria'), href: RUTAS_TESORERIA.movimientos }, { etiqueta: t('titulo'), href: RUTAS_TESORERIA.transferencias }, { etiqueta: titulo }]}
        acciones={
          <>
            <button type="button" onClick={comprobante} className={clasesBoton({ variante: 'secundario' })}>
              <Download className="h-4 w-4" aria-hidden />
              {t('descargarComprobante')}
            </button>
            {x.status === 'completed' && (
              <button type="button" onClick={() => setAnulando(true)} className={clasesBoton({ variante: 'destructivo' })}>
                <XCircle className="h-4 w-4" aria-hidden />
                {t('anular')}
              </button>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Tarjeta titulo={t('datos')}>
          <p className="mb-4 text-3xl font-semibold tabular-nums text-fg">{formatear(Number(x.amount))}</p>
          <ListaDatos etiqueta={t('datos')}>
            <FilaDato etiqueta={t('columnas.origen')} valor={x.from_account?.name ?? '—'} descripcion={x.from_account?.bank_name ?? undefined} href={x.from_account ? rutaCuentaBancaria(x.from_account.id) : undefined} />
            <FilaDato etiqueta={t('columnas.destino')} valor={x.to_account?.name ?? '—'} descripcion={x.to_account?.bank_name ?? undefined} href={x.to_account ? rutaCuentaBancaria(x.to_account.id) : undefined} />
            <FilaDato etiqueta={t('columnas.fecha')} valor={formatDate(x.transfer_date)} />
            <FilaDato etiqueta={t('columnas.referencia')} valor={x.reference ?? '—'} />
            {x.notes && <FilaDato etiqueta={t('notas')} valor={x.notes} />}
          </ListaDatos>
        </Tarjeta>
        <Tarjeta titulo={t('registro')}>
          <ListaDatos etiqueta={t('registro')}>
            <FilaDato etiqueta={t('comprobante.id')} valor={<span className="font-mono text-xs">{x.id}</span>} />
            <FilaDato etiqueta={t('creada')} valor={formatDateTime(x.created_at)} />
            <FilaDato etiqueta={t('asiento')} valor={t('asientoAyuda')} />
          </ListaDatos>
        </Tarjeta>
      </div>

      <DialogoMotivo
        abierto={anulando}
        onAbiertoChange={(a) => !a && !ocupado && (setAnulando(false), setErrorAnular(null))}
        titulo={t('anularTitulo')}
        descripcion={te('anular.descripcion')}
        textoConfirmar={t('anular')}
        consecuencias={[t('anularConsecuencia')]}
        cargando={ocupado}
        error={errorAnular}
        onConfirmar={(m) => void confirmar(m)}
      />
    </div>
  );
}
