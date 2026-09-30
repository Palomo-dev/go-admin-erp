'use client';

import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DataTable, Dialogo, DialogoMotivo, EmptyState, ListCard, StatusBadge } from '@/components/kit';
import { toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { abrirDocumento } from '@/lib/documents/cliente';
import { supabase } from '@/lib/supabase/config';
import { clienteReportes } from '@/lib/services/reportes/clienteReportes';
import { leerHistorial, type FilaHistorial } from '@/lib/services/reportes/historialService';
import { listarCierres, type FilaCierre } from '@/lib/services/reportes/lecturasReportes';
import { useEtiquetaPeriodo } from './SelectorPeriodo';
import { useMensajeError } from './useMensajeError';
import type { ContextoReportes } from './useContextoReportes';

const TONO = { borrador: 'neutro', emitido: 'informacion', firmado: 'exito', reemplazado: 'advertencia' } as const;

export function CierresTab({ ctx, recarga, onRecargar }: { ctx: ContextoReportes; recarga: number; onRecargar: () => void }) {
  const t = useTranslations('reportes');
  const { formatDateTime, formatPlain } = useFormatDate();
  const etiqueta = useEtiquetaPeriodo();
  const mensaje = useMensajeError();
  const [filas, setFilas] = useState<FilaCierre[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reabrir, setReabrir] = useState<FilaCierre | null>(null);
  const [errorReabrir, setErrorReabrir] = useState<string | null>(null);
  const [versionesDe, setVersionesDe] = useState<FilaCierre | null>(null);
  const [auditoriaDe, setAuditoriaDe] = useState<FilaCierre | null>(null);
  const [eventos, setEventos] = useState<FilaHistorial[]>([]);

  const cargar = () => {
    if (!ctx.orgId) return;
    setError(null);
    void listarCierres(ctx.orgId).then(setFilas).catch(() => setError(t('errores.generico')));
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.orgId, recarga]);

  useEffect(() => {
    if (!auditoriaDe || !ctx.orgId) return;
    void leerHistorial(supabase, ctx.orgId, { limite: 100, reportId: `cierre-${auditoriaDe.tipo}` })
      .then((lista) => setEventos(lista.filter((e) => e.filtros.numero === auditoriaDe.numero)))
      .catch(() => setEventos([]));
  }, [auditoriaDe, ctx.orgId]);

  const firmar = async (fila: FilaCierre) => {
    try {
      await clienteReportes.firmarCierre(fila.id);
      toastSuccess(t('cierres.firmado'));
      onRecargar();
    } catch (e) {
      setError(mensaje(e));
    }
  };

  if (error && !filas) return <EmptyState variante="error" descripcion={error} onReintentar={cargar} />;

  const versiones = versionesDe ? (filas ?? []).filter((f) => f.numero === versionesDe.numero) : [];

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-fg">{t('cierres.titulo')}</h2>
      {error && <p className="text-sm text-danger-text">{error}</p>}
      <DataTable<FilaCierre>
        etiqueta={t('cierres.titulo')}
        estado={filas === null ? 'cargando' : filas.length === 0 ? 'vacio' : 'listo'}
        filas={filas ?? []}
        obtenerId={(f) => f.id}
        vacio={{ titulo: t('cierres.vacio'), descripcion: t('cierres.vacioDesc'), icono: FileText }}
        columnas={[
          {
            id: 'cierre',
            encabezado: t('cierres.colCierre'),
            celda: (f) => (
              <span className="block">
                <span className="block font-medium">{etiqueta.periodo({ tipo: esTipo(f.tipo) ? f.tipo : 'mensual', fechaInicio: f.fechaInicio, fechaFin: f.fechaFin })}</span>
                <span className="block text-xs text-fg-secondary">{f.numero} · {t.has(`cierreDlg.plantillas.${f.plantilla}`) ? t(`cierreDlg.plantillas.${f.plantilla}`) : f.plantilla}</span>
              </span>
            ),
          },
          { id: 'alcance', encabezado: t('cierres.colAlcance'), ocultarDebajo: 'md', celda: (f) => f.sucursal ?? t('filtros.todasLasSucursales') },
          {
            id: 'version',
            encabezado: t('cierres.colVersion'),
            celda: (f) => `v${f.version} · ${f.estado === 'reemplazado' ? t('cierres.reemplazada') : t('cierres.vigente')}`,
          },
          {
            id: 'estado',
            encabezado: t('cierres.colEstado'),
            celda: (f) => <StatusBadge estado={f.estado} etiqueta={t(`cierres.estados.${f.estado}`)} tono={TONO[f.estado]} tamano="sm" />,
          },
          {
            id: 'acciones',
            encabezado: t('cierres.colAcciones'),
            celda: (f) => (
              <span className="flex flex-wrap gap-2 text-sm">
                <button type="button" className="text-link" onClick={() => abrirDocumento('cierre-periodo', f.id, { formato: 'html' })}>{t('cierres.ver')}</button>
                <button type="button" className="text-link" onClick={() => abrirDocumento('cierre-periodo', f.id, { papel: 'carta' })}>{t('cierres.carta')}</button>
                <button type="button" className="text-link" onClick={() => abrirDocumento('cierre-periodo', f.id, { papel: '80mm' })}>{t('cierres.mm80')}</button>
                <button type="button" className="text-link" onClick={() => setVersionesDe(f)}>{t('cierres.versiones')}</button>
                <button type="button" className="text-link" onClick={() => setAuditoriaDe(f)}>{t('cierres.auditoria')}</button>
                {ctx.permisos.firmar && f.estado === 'emitido' && <button type="button" className="text-link" onClick={() => void firmar(f)}>{t('cierres.firmar')}</button>}
                {ctx.permisos.reabrir && f.estado === 'firmado' && <button type="button" className="text-link" onClick={() => setReabrir(f)}>{t('cierres.reabrir')}</button>}
              </span>
            ),
          },
        ]}
        tarjetaMovil={(f) => (
          <ListCard
            titulo={f.numero}
            subtitulo={formatPlain(f.fechaInicio)}
            estado={<StatusBadge estado={f.estado} etiqueta={t(`cierres.estados.${f.estado}`)} tono={TONO[f.estado]} tamano="sm" />}
            onClick={() => abrirDocumento('cierre-periodo', f.id, { formato: 'html' })}
          />
        )}
      />
      <p className="text-xs text-fg-secondary">{t('cierres.pie')}</p>
      <DialogoMotivo
        abierto={reabrir !== null}
        onAbiertoChange={(a) => {
          if (!a) {
            setReabrir(null);
            setErrorReabrir(null);
          }
        }}
        titulo={t('cierres.reabrir')}
        textoConfirmar={t('cierres.reabrir')}
        etiquetaMotivo={t('cierres.motivo')}
        error={errorReabrir}
        onConfirmar={async (motivo) => {
          if (!reabrir) return;
          try {
            await clienteReportes.reabrirCierre(reabrir.id, motivo);
            toastSuccess(t('cierres.reabierto'));
            setReabrir(null);
            setErrorReabrir(null);
            onRecargar();
          } catch (e) {
            setErrorReabrir(mensaje(e));
          }
        }}
      />
      <Dialogo abierto={versionesDe !== null} onAbiertoChange={(a) => !a && setVersionesDe(null)} titulo={t('cierres.versiones')} descripcion={versionesDe?.numero} primario={{ etiqueta: t('periodo.listo'), onClick: () => setVersionesDe(null) }}>
        <ul className="flex flex-col gap-2">
          {versiones.map((v) => (
            <li key={v.id} className="text-sm text-fg">
              v{v.version} · {t(`cierres.estados.${v.estado}`)} · {v.emitidoEn ? formatDateTime(v.emitidoEn) : '—'}
            </li>
          ))}
        </ul>
      </Dialogo>
      <Dialogo abierto={auditoriaDe !== null} onAbiertoChange={(a) => !a && setAuditoriaDe(null)} titulo={t('cierres.auditoria')} descripcion={auditoriaDe?.numero} primario={{ etiqueta: t('periodo.listo'), onClick: () => setAuditoriaDe(null) }}>
        {eventos.length === 0 && <p className="text-sm text-fg-secondary">{t('cierres.sinAuditoria')}</p>}
        <ul className="flex flex-col gap-2">
          {eventos.map((e) => (
            <li key={e.id} className="text-sm text-fg">
              {t.has(`historial.accion.${e.accion}`) ? t(`historial.accion.${e.accion}`) : e.accion} · {e.usuario ?? '—'} · {formatDateTime(e.created_at)}
            </li>
          ))}
        </ul>
      </Dialogo>
    </div>
  );
}

function esTipo(valor: string): valor is 'diario' | 'semanal' | 'quincenal' | 'mensual' | 'trimestral' | 'semestral' | 'anual' | 'personalizado' {
  return ['diario', 'semanal', 'quincenal', 'mensual', 'trimestral', 'semestral', 'anual', 'personalizado'].includes(valor);
}
