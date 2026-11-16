'use client';

/**
 * Certificaciones (Figma 95-hrm-03-08): con vencimiento y aviso N días antes
 * (decisión 10, configurable). Si una que exige el cargo vence, el expediente
 * queda incompleto y la alerta sube al Resumen.
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Award, FileText, Plus, Trash2 } from 'lucide-react';
import { AvisoTonal, CampoFecha, ConfirmDialog, Dialogo, FormField, StatusBadge, type ColumnaTabla } from '@/components/kit';
import { TablaSubseccion } from '@/components/kit/TablaSubseccion';
import { Input } from '@/components/ui/input';
import { diasEntre } from '@/lib/hrm/personas/logica';
import { pedir, subirDocumento, urlDocumento } from '../apiPersonas';
import { fechaCorta } from '../textosPersonas';
import type { ContextoFicha } from './FichaEmpleado';

type Certificacion = ContextoFicha['ficha']['certificaciones'][number];

export function PestanaCertificaciones({ ficha, recargar }: ContextoFicha) {
  const t = useTranslations('hrmPersonas.certificaciones');
  const tc = useTranslations('hrmPersonas.comun');
  const [editando, setEditando] = useState<Partial<Certificacion> | null>(null);
  const [retirar, setRetirar] = useState<Certificacion | null>(null);
  const [guardando, setGuardando] = useState(false);
  const editar = ficha.permisos.editar_basico;

  const estado = (c: Certificacion) =>
    !c.vence ? 'sin_vencimiento' : c.vence < ficha.hoy ? 'vencida' : diasEntre(ficha.hoy, c.vence) <= ficha.dias_aviso ? 'por_vencer' : 'vigente';
  const tono = (s: string) => (s === 'vencida' ? 'peligro' : s === 'por_vencer' ? 'advertencia' : s === 'vigente' ? 'exito' : 'neutro');

  const abrir = async (id: string) => {
    try {
      const { url } = await urlDocumento(id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error(tc('errorCarga'));
    }
  };

  const columnas: ColumnaTabla<Certificacion>[] = [
    { id: 'nombre', encabezado: t('columnas.certificacion'), celda: (c) => <span className="font-medium text-fg">{c.nombre}</span> },
    { id: 'entidad', encabezado: t('columnas.entidad'), ocultarDebajo: 'md', celda: (c) => c.entidad ?? '—' },
    { id: 'expedicion', encabezado: t('columnas.expedicion'), ocultarDebajo: 'lg', celda: (c) => <span className="tabular-nums">{fechaCorta(c.expedicion) || '—'}</span> },
    { id: 'vence', encabezado: t('columnas.vence'), celda: (c) => <span className="tabular-nums">{fechaCorta(c.vence) || '—'}</span> },
    {
      id: 'estado',
      encabezado: t('columnas.estado'),
      celda: (c) => {
        const s = estado(c);
        return <StatusBadge estado={s} tono={tono(s)} etiqueta={t(`estados.${s}`)} />;
      },
    },
    {
      id: 'soporte',
      encabezado: t('columnas.soporte'),
      ocultarDebajo: 'lg',
      celda: (c) =>
        c.documento_id ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void abrir(c.documento_id as string);
            }}
            className="inline-flex items-center gap-1.5 text-sm text-fg hover:underline"
          >
            <FileText aria-hidden className="size-4" strokeWidth={1.5} />
            {c.documento_nombre ?? t('soporte')}
          </button>
        ) : (
          <span className="text-fg-muted">—</span>
        ),
    },
  ];

  const guardar = async (c: Partial<Certificacion> & { archivo?: File | null }, activa = true) => {
    setGuardando(true);
    try {
      let documentoId = c.documento_id ?? null;
      if (c.archivo) documentoId = (await subirDocumento(ficha.persona.id, c.archivo, 'certificacion', { venceEl: c.vence ?? null })).id;
      const cuerpo = { nombre: c.nombre, entidad: c.entidad ?? null, expedicion: c.expedicion ?? null, vence: c.vence ?? null, documento_id: documentoId, activa };
      const url = `/api/hrm/personas/${ficha.persona.id}/certificaciones`;
      if (c.id) await pedir(url, { metodo: 'PATCH', cuerpo: { ...cuerpo, id: c.id } });
      else await pedir(url, { metodo: 'POST', cuerpo });
      toast.success(activa ? t('guardada') : t('retirada'));
      setEditando(null);
      setRetirar(null);
      void recargar();
    } catch {
      toast.error(tc('errorGuardar'));
    } finally {
      setGuardando(false);
    }
  };

  const exigidaVencida = ficha.alertas.find((a) => a.tipo === 'certificacion_vencida' || a.tipo === 'certificacion_por_vencer');

  return (
    <div className="flex flex-col gap-4">
      <TablaSubseccion
        titulo={t('titulo')}
        descripcion={t('aviso', { n: ficha.dias_aviso })}
        columnas={columnas}
        filas={ficha.certificaciones}
        obtenerId={(c) => c.id}
        densidad="compacta"
        onFilaClick={editar ? (c) => setEditando(c) : undefined}
        accionNueva={editar ? { etiqueta: t('agregar'), onClick: () => setEditando({}), icono: Plus } : undefined}
        vacio={{ titulo: t('vacio'), icono: Award }}
      />
      {exigidaVencida && <AvisoTonal tono="advertencia" titulo={t('exigida', { nombre: exigidaVencida.nombre ?? '', cargo: ficha.vinculo?.cargo ?? tc('sinDato') })} />}

      {editando && (
        <DialogoCertificacion
          valor={editando}
          nombrePersona={ficha.persona.nombre}
          guardando={guardando}
          onCerrar={() => setEditando(null)}
          onGuardar={(c) => void guardar(c)}
          onRetirar={editando.id ? () => setRetirar(editando as Certificacion) : undefined}
        />
      )}
      <ConfirmDialog
        abierto={retirar !== null}
        onAbiertoChange={(a) => !a && setRetirar(null)}
        titulo={t('retirarTitulo')}
        descripcion={t('retirarDescripcion', { nombre: retirar?.nombre ?? '' })}
        textoConfirmar={t('retirar')}
        tono="peligro"
        icono={Trash2}
        cargando={guardando}
        onConfirmar={() => (retirar ? guardar(retirar, false) : undefined)}
      />
    </div>
  );
}

function DialogoCertificacion({
  valor,
  nombrePersona,
  guardando,
  onCerrar,
  onGuardar,
  onRetirar,
}: {
  valor: Partial<Certificacion>;
  nombrePersona: string;
  guardando: boolean;
  onCerrar: () => void;
  onGuardar: (c: Partial<Certificacion> & { archivo?: File | null }) => void;
  onRetirar?: () => void;
}) {
  const t = useTranslations('hrmPersonas.certificaciones');
  const tc = useTranslations('hrmPersonas.comun');
  const [c, setC] = useState(valor);
  const [archivo, setArchivo] = useState<File | null>(null);
  return (
    <Dialogo
      abierto
      onAbiertoChange={(a) => !a && onCerrar()}
      titulo={valor.id ? t('editar') : t('agregar')}
      descripcion={nombrePersona}
      ancho={520}
      icono={Award}
      primario={{ etiqueta: tc('guardar'), onClick: () => onGuardar({ ...c, archivo }), cargando: guardando, deshabilitada: !c.nombre?.trim() }}
      secundarios={onRetirar ? [{ etiqueta: t('retirar'), onClick: onRetirar, destructiva: true }] : undefined}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField etiqueta={t('columnas.certificacion')} obligatorio className="sm:col-span-2">
          <Input value={c.nombre ?? ''} onChange={(e) => setC({ ...c, nombre: e.target.value })} className="h-10" />
        </FormField>
        <FormField etiqueta={t('columnas.entidad')} className="sm:col-span-2">
          <Input value={c.entidad ?? ''} onChange={(e) => setC({ ...c, entidad: e.target.value })} className="h-10" />
        </FormField>
        <FormField etiqueta={t('columnas.expedicion')}>
          <CampoFecha valor={c.expedicion ?? ''} onValorChange={(v) => setC({ ...c, expedicion: v || null })} limpiable />
        </FormField>
        <FormField etiqueta={t('columnas.vence')}>
          <CampoFecha valor={c.vence ?? ''} onValorChange={(v) => setC({ ...c, vence: v || null })} limpiable />
        </FormField>
        <FormField etiqueta={t('columnas.soporte')} className="sm:col-span-2">
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-fg file:mr-3 file:rounded-lg file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-fg"
          />
        </FormField>
      </div>
    </Dialogo>
  );
}
