'use client';

/**
 * Ficha única del empleado (Figma 20.3, `docs/design/figma/95-hrm-03-*`).
 *
 * Cabecera: `PageHeader` del kit con migas y «←» junto al título (decisión 15,
 * igual que «Editar rol»); en el celular, la cabecera móvil del shell. Las
 * páginas de detalle no muestran la barra de pestañas del módulo.
 * «Reenviar invitación» va una sola vez, en la cabecera (PATRONES §4.1), y solo
 * mientras la invitación del alta está pendiente o vencida: cada empleado es un
 * usuario de la app (revisión 2026-11-15).
 *
 * Datos: `GET /api/hrm/personas/[id]/ficha` (básicos y permisos). Cada pestaña
 * sensible pide su grupo por su ruta, y esa lectura queda registrada.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { History, Send, Sparkles, Upload, Users } from 'lucide-react';
import {
  EmptyState,
  PageHeader,
  RowActionsMenu,
  Skeleton,
  StatusBadge,
  TabBar,
  clasesBoton,
  useOpcionUrl,
  type AccionFila,
} from '@/components/kit';
import { TONO_ESTADO_EMPLEADO, type TipoCambio } from '@/lib/hrm/personas/catalogo';
import { reenviarInvitaciones, useCarga, type Ficha } from '../apiPersonas';
import { puedeReenviarInvitacion } from '@/lib/hrm/personas/logica';
import { RegistrarCambioDialogo } from '../cambio/RegistrarCambioDialogo';
import { DialogoRevisarAprobacion } from '../../aprobaciones/DialogoRevisarAprobacion';
import { PestanaResumen } from './PestanaResumen';
import { PestanaDatosPersonales } from './PestanaDatosPersonales';
import { PestanaContactos } from './PestanaContactos';
import { PestanaLaboral } from './PestanaLaboral';
import { PestanaSalario } from './PestanaSalario';
import { PestanaSeguridadSocial } from './PestanaSeguridadSocial';
import { PestanaDocumentos } from './PestanaDocumentos';
import { PestanaCertificaciones } from './PestanaCertificaciones';
import { PestanaHistorial } from './PestanaHistorial';

const PESTANAS = ['resumen', 'datos', 'contactos', 'laboral', 'salario', 'seguridad', 'documentos', 'certificaciones', 'historial'] as const;
export type PestanaFicha = (typeof PESTANAS)[number];
const LISTA = '/app/hrm/empleados';

export interface ContextoFicha {
  ficha: Ficha;
  recargar: () => Promise<void>;
  irA: (p: PestanaFicha) => void;
  registrarCambio: (tipo?: TipoCambio) => void;
  verSolicitud: (instanciaId: string) => void;
}

export function FichaEmpleado({ id }: { id: string }) {
  const t = useTranslations('hrmPersonas.ficha');
  const tc = useTranslations('hrmPersonas.comun');
  const router = useRouter();
  const { carga, recargar } = useCarga<Ficha>(`/api/hrm/personas/${encodeURIComponent(id)}/ficha`);
  const [pestana, setPestana] = useOpcionUrl<PestanaFicha>('pestana', PESTANAS, 'resumen', 'replace');
  const [cambio, setCambio] = useState<{ tipo?: TipoCambio } | null>(null);
  const [solicitud, setSolicitud] = useState<string | null>(null);
  const [invitando, setInvitando] = useState(false);

  const ficha = carga.estado === 'listo' ? carga.datos : null;

  // Enlaces viejos con el id del vínculo: se corrige la URL a la persona.
  useEffect(() => {
    if (ficha && ficha.persona.id !== id) router.replace(`${LISTA}/${ficha.persona.id}${window.location.search}`);
  }, [ficha, id, router]);

  if (carga.estado === 'sinPermiso' || carga.estado === 'noExiste' || carga.estado === 'error') {
    const variante = carga.estado === 'sinPermiso' ? 'forbidden' : carga.estado === 'error' ? 'error' : 'empty';
    return (
      <div className="p-4 sm:p-6">
        <PageHeader
          variante="form"
          titulo={t('tituloSinDatos')}
          volverA={LISTA}
          migas={[{ etiqueta: tc('migas.rrhh'), href: LISTA }, { etiqueta: tc('migas.empleados'), href: LISTA }]}
        />
        <EmptyState
          variante={variante}
          icono={variante === 'empty' ? Users : undefined}
          titulo={t(`estados.${carga.estado}.titulo`)}
          descripcion={t(`estados.${carga.estado}.descripcion`)}
          accion={variante === 'error' ? undefined : { etiqueta: t(`estados.${carga.estado}.accion`), href: variante === 'forbidden' ? '/app/inicio' : LISTA }}
          onReintentar={variante === 'error' ? () => void recargar() : undefined}
        />
      </div>
    );
  }

  if (!ficha) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6" aria-busy="true">
        <Skeleton className="h-4 w-64" />
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-lg" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-72" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  const v = ficha.vinculo;
  const p = ficha.permisos;
  const acceso = ficha.persona.acceso.estado;
  const reenviable = p.editar_basico && puedeReenviarInvitacion({ acceso, estado: v?.estado ?? 'activo' });
  const contexto: ContextoFicha = {
    ficha,
    recargar,
    irA: setPestana,
    registrarCambio: (tipo) => setCambio({ tipo }),
    verSolicitud: setSolicitud,
  };

  const invitar = async () => {
    setInvitando(true);
    try {
      const r = await reenviarInvitaciones([ficha.persona.id]);
      const res = r.resultados[0]?.resultado ?? 'error';
      if (res === 'enviada') toast.success(t('invitacion.enviada'));
      else toast.error(t(`invitacion.${['ya_entro', 'sin_invitacion', 'sin_cupo', 'demasiadas'].includes(res) ? res : 'error'}`));
      void recargar();
    } catch {
      toast.error(t('invitacion.error'));
    } finally {
      setInvitando(false);
    }
  };

  const menu: AccionFila[] = [
    { id: 'subir', etiqueta: t('acciones.subirDocumento'), icono: Upload, onSelect: () => setPestana('documentos') },
    {
      id: 'ia',
      etiqueta: t('acciones.leerIa'),
      icono: Sparkles,
      onSelect: () => setPestana('documentos'),
      oculta: !p.grupos.identificacion.editar,
    },
  ];

  const subtitulo = [v?.cargo, v?.area, v?.sede, ficha.jefe?.nombre ? t('jefe', { nombre: ficha.jefe.nombre }) : null].filter(Boolean).join(' · ');
  const badges = (
    <span className="flex flex-wrap items-center gap-1.5">
      {v ? <StatusBadge estado={v.estado} tono={TONO_ESTADO_EMPLEADO[v.estado]} etiqueta={tc(`estados.${v.estado}`)} /> : null}
      {v?.tipo_contrato ? <StatusBadge estado="contrato" tono="neutro" etiqueta={tc(`contratos.${v.tipo_contrato}`)} /> : null}
      {acceso === 'invitacion_pendiente' || acceso === 'invitacion_vencida' ? (
        <StatusBadge
          estado={acceso}
          tono={acceso === 'invitacion_pendiente' ? 'informacion' : 'advertencia'}
          apariencia="contorno"
          etiqueta={t(`acceso.${acceso}`)}
        />
      ) : null}
    </span>
  );

  const acciones = (
    <>
      {reenviable && (
        <button type="button" onClick={() => void invitar()} disabled={invitando} className={clasesBoton({ variante: 'secundario' })}>
          <Send aria-hidden className="size-4" strokeWidth={1.5} />
          {t('acciones.reenviar')}
        </button>
      )}
      {p.registrar_cambio && v && v.estado !== 'retirado' && (
        <button type="button" onClick={() => setCambio({})} className={clasesBoton({ variante: 'primario' })}>
          <History aria-hidden className="size-4" strokeWidth={1.5} />
          {t('acciones.registrarCambio')}
        </button>
      )}
      <RowActionsMenu acciones={menu} orientacion="horizontal" titulo={ficha.persona.nombre} tamano="md" />
    </>
  );

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        variante="form"
        titulo={ficha.persona.nombre}
        subtitulo={subtitulo || undefined}
        badge={<span className="hidden lg:inline-flex">{badges}</span>}
        volverA={LISTA}
        migas={[
          { etiqueta: tc('migas.rrhh'), href: LISTA },
          { etiqueta: tc('migas.empleados'), href: LISTA },
          { etiqueta: ficha.persona.nombre },
        ]}
        acciones={acciones}
        movil={{ titulo: ficha.persona.nombre, subtitulo: [v?.cargo, v?.area, v?.sede].filter(Boolean).join(' · '), accionesEnFila: true }}
      />
      <div className="lg:hidden">{badges}</div>

      <TabBar<PestanaFicha>
        id="ficha-empleado"
        etiqueta={t('pestanas.etiqueta')}
        valor={pestana}
        onValorChange={setPestana}
        pestanas={PESTANAS.map((x) => ({
          valor: x,
          etiqueta: t(`pestanas.${x}`),
          contador: x === 'documentos' ? ficha.documentos_total : undefined,
        }))}
      />

      <div role="tabpanel" id={`ficha-empleado-panel-${pestana}`} aria-labelledby={`ficha-empleado-tab-${pestana}`}>
        {pestana === 'resumen' && <PestanaResumen {...contexto} />}
        {pestana === 'datos' && <PestanaDatosPersonales {...contexto} />}
        {pestana === 'contactos' && <PestanaContactos {...contexto} />}
        {pestana === 'laboral' && <PestanaLaboral {...contexto} />}
        {pestana === 'salario' && <PestanaSalario {...contexto} />}
        {pestana === 'seguridad' && <PestanaSeguridadSocial {...contexto} />}
        {pestana === 'documentos' && <PestanaDocumentos {...contexto} />}
        {pestana === 'certificaciones' && <PestanaCertificaciones {...contexto} />}
        {pestana === 'historial' && <PestanaHistorial {...contexto} />}
      </div>

      {cambio && v && (
        <RegistrarCambioDialogo
          abierto
          onAbiertoChange={(a) => !a && setCambio(null)}
          tipoInicial={cambio.tipo}
          empleados={[{ vinculoId: v.id, personaId: ficha.persona.id, nombre: ficha.persona.nombre, cargo: v.cargo, sede: v.sede }]}
          onRegistrado={() => void recargar()}
        />
      )}
      <DialogoRevisarAprobacion
        instanciaId={solicitud}
        abierto={solicitud !== null}
        onAbiertoChange={(a) => !a && setSolicitud(null)}
        onResuelta={() => void recargar()}
      />
    </div>
  );
}
