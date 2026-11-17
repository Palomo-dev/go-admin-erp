'use client';

/**
 * Recursos humanos › Marcación (Figma 20.26–20.28; plan
 * `docs/hrm/PLAN-MARCACION-DISPOSITIVOS.md`, fase M0): «En vivo», «Métodos por
 * sede» y «Dispositivos». La vista va en la URL (`?vista=envivo|metodos|dispositivos`)
 * para que «atrás» vuelva a ella; la sede es la del header (PATRONES §9).
 *
 * En vivo se refresca cada 2 min con «actualizado hace N» (como Asistencia: no es
 * Realtime). «Abrir kiosco en esta pantalla» (M1) abre `/marcacion/kiosco` en otra
 * pestaña: el equipo muestra su código y se vincula desde Dispositivos.
 * `?vista=dispositivos&agregar=pantalla_qr|etiqueta_nfc` abre el alta con ese tipo
 * (lo usa la vista Métodos).
 */
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlarmClockCheck, House, Plus, TabletSmartphone } from 'lucide-react';
import { EmptyState, PageHeader, SegmentedControl } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { useBranchOpcional } from '@/lib/context/BranchContext';
import { useCarga } from '../personas/apiPersonas';
import { NavPestanasHrm } from '../navegacion/NavPestanasHrm';
import { conSede, useDias, useSedeActiva } from '../asistencia/comunAsistencia';
import { VistaMetodos } from './metodos/VistaMetodos';
import { VistaEnVivo } from './VistaEnVivo';
import { VistaDispositivos } from './VistaDispositivos';
import { DialogoAgregarPunto } from './DialogoAgregarPunto';
import {
  agregarDeParametro,
  estadoDispositivo,
  minutosDesde,
  vistaDeParametro,
  type RespuestaDispositivos,
  type RespuestaEnVivo,
  type TipoAlta,
  type VistaMarcacion,
} from './marcacionVista';

const REFRESCO_MS = 120_000;

export function MarcacionPage() {
  const t = useTranslations('hrmMarcacionRrhh');
  const tk = useTranslations('hrmKiosco.marcacion');
  const tc = useTranslations('hrmPersonas.comun');
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const sede = useSedeActiva();
  const nombreSede = useBranchOpcional()?.branches.find((b) => b.id === sede)?.name ?? null;
  const dias = useDias();
  const vista = vistaDeParametro(sp?.get('vista'));
  const agregarUrl = agregarDeParametro(sp?.get('agregar'));

  const envivo = useCarga<RespuestaEnVivo>(vista === 'envivo' ? conSede('/api/hrm/marcacion/en-vivo', sede) : null);
  const disp = useCarga<RespuestaDispositivos>(vista === 'dispositivos' ? conSede('/api/hrm/marcacion/dispositivos', sede) : null);

  // «actualizado hace N min»: hora de la última carga y un reloj de 30 s.
  const [cargadoEn, setCargadoEn] = useState<number | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (envivo.carga.estado === 'listo') setCargadoEn(Date.now());
  }, [envivo.carga]);
  const recargarEnVivo = envivo.recargar;
  useEffect(() => {
    if (vista !== 'envivo') return;
    const reloj = setInterval(() => setAhora(Date.now()), 30_000);
    const refresco = setInterval(() => void recargarEnVivo(), REFRESCO_MS);
    return () => {
      clearInterval(reloj);
      clearInterval(refresco);
    };
  }, [vista, recargarEnVivo]);

  // Alta de un punto: desde el botón (paso 1) o desde la URL (tipo ya elegido).
  const [alta, setAlta] = useState<{ abierto: boolean; tipo: TipoAlta | null }>({ abierto: false, tipo: null });
  useEffect(() => {
    if (vista !== 'dispositivos' || !agregarUrl) return;
    setAlta({ abierto: true, tipo: agregarUrl });
    const q = new URLSearchParams(sp?.toString() ?? '');
    q.delete('agregar');
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }, [vista, agregarUrl, sp, router, pathname]);

  const cambiarVista = (v: VistaMarcacion) => {
    const q = new URLSearchParams(sp?.toString() ?? '');
    q.delete('agregar');
    if (v === 'envivo') q.delete('vista');
    else q.set('vista', v);
    const s = q.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  const sinPermiso =
    (vista === 'envivo' && envivo.carga.estado === 'sinPermiso') || (vista === 'dispositivos' && disp.carga.estado === 'sinPermiso');
  const datosVivo = envivo.carga.estado === 'listo' ? envivo.carga.datos : null;
  const datosDisp = disp.carga.estado === 'listo' ? disp.carga.datos : null;
  const puedeAgregar = !!datosDisp?.puede_gestionar;

  let subtitulo: string | undefined;
  if (vista === 'envivo') {
    const partes: string[] = [];
    if (datosVivo) partes.push(t('subtitulo.hoy', { fecha: dias.largo(datosVivo.fecha) }));
    if (nombreSede) partes.push(nombreSede);
    const minutos = minutosDesde(cargadoEn, ahora);
    if (minutos !== null && !sinPermiso) partes.push(minutos < 1 ? t('subtitulo.actualizadoRecien') : t('subtitulo.actualizadoHace', { n: minutos }));
    subtitulo = partes.join(' · ') || undefined;
  } else if (vista === 'dispositivos') {
    const partes: string[] = [];
    if (nombreSede) partes.push(nombreSede);
    if (datosDisp) {
      partes.push(t('subtitulo.dispositivos', { n: datosDisp.dispositivos.length }));
      const ahoraMs = Date.now();
      const sinConexion = datosDisp.dispositivos.filter((d) => estadoDispositivo(d, ahoraMs) === 'sin_conexion').length;
      if (sinConexion > 0) partes.push(t('subtitulo.sinConexion', { n: sinConexion }));
    }
    subtitulo = partes.join(' · ') || undefined;
  } else {
    subtitulo = nombreSede ?? undefined;
  }

  const abrirAlta = () => setAlta({ abierto: true, tipo: null });
  const acciones =
    vista === 'dispositivos' && puedeAgregar && !sinPermiso ? (
      <Button onClick={abrirAlta}>
        <Plus className="size-4" aria-hidden="true" /> {t('dispositivos.agregar')}
      </Button>
    ) : vista === 'metodos' && !sinPermiso ? (
      <Button variant="outline" onClick={() => window.open('/marcacion/kiosco', '_blank', 'noopener')}>
        <TabletSmartphone className="size-4" aria-hidden="true" strokeWidth={1.5} /> {tk('abrirKiosco')}
      </Button>
    ) : undefined;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={subtitulo}
        icono={AlarmClockCheck}
        migas={[{ etiqueta: tc('migas.rrhh'), href: '/app/hrm/empleados' }, { etiqueta: t('titulo') }]}
        cargando={(vista === 'envivo' && envivo.carga.estado === 'cargando') || (vista === 'dispositivos' && disp.carga.estado === 'cargando')}
        acciones={acciones}
        debajo={sinPermiso ? undefined : <NavPestanasHrm incrustada />}
        movil={{ subtitulo, accionesEnFila: !!acciones }}
      />

      {sinPermiso ? (
        <EmptyState
          variante="forbidden"
          titulo={t('sinPermiso.titulo')}
          descripcion={t('sinPermiso.descripcion')}
          accion={{ etiqueta: t('comun.irAlInicio'), href: '/app/inicio', icono: House }}
        />
      ) : (
        <>
          <SegmentedControl
            etiqueta={t('vistas.etiqueta')}
            valor={vista}
            onValorChange={cambiarVista}
            className="self-start"
            opciones={[
              { valor: 'envivo', etiqueta: t('vistas.envivo') },
              { valor: 'metodos', etiqueta: t('vistas.metodos') },
              { valor: 'dispositivos', etiqueta: t('vistas.dispositivos') },
            ]}
          />

          {vista === 'envivo' && <VistaEnVivo carga={envivo.carga} recargar={envivo.recargar} />}
          {vista === 'metodos' && <VistaMetodos sede={sede} />}
          {vista === 'dispositivos' && <VistaDispositivos carga={disp.carga} recargar={disp.recargar} onAgregar={abrirAlta} />}
        </>
      )}

      <DialogoAgregarPunto
        abierto={alta.abierto}
        onAbiertoChange={(a) => setAlta((x) => ({ ...x, abierto: a }))}
        tipoInicial={alta.tipo}
        sedeInicial={sede}
        onCreado={() => void disp.recargar()}
        onVinculado={() => void disp.recargar()}
      />
    </div>
  );
}
