'use client';

/**
 * Perfil tributario de la empresa (Figma «07 Finanzas» 2335:136222, captura
 * `docs/design/figma/88-tributario-perfil.png`): vigencias con el régimen de
 * renta y la condición frente al IVA por separado (P5 del Contador), las
 * calidades (gran contribuyente, autorretenedor…), los códigos del documento
 * electrónico, la periodicidad del IVA y el ICA por municipio.
 *
 * Es página de trabajo (se edita), así que vive en Finanzas › Tributario.
 * Mientras la migración no esté aplicada, la pantalla lo dice («pendiente de
 * activar») y no ofrece guardar. En móvil, cada vigencia es una tarjeta con su
 * menú de acciones.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CalendarRange, Pencil, Plus } from 'lucide-react';
import { AvisoTonal, DataTable, FilaDato, ListCard, ListaDatos, StatusBadge, Tarjeta, clasesBoton, type AccionFila, type ColumnaTabla } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { inicioPropuesto, RESPONSABILIDAD, type VigenciaPerfil } from '@/lib/finanzas/tributario/perfil';
import { tributarioCliente, RUTAS_TRIBUTARIO, type PerfilCliente } from '../tributarioCliente';
import { AvisoPendienteActivar, CabeceraTributario, ErrorLectura, codigoDe, type Lectura } from '../piezas';
import { VigenciaDialogo, type BaseVigencia } from './VigenciaDialogo';

export function PerfilTributarioPage() {
  const t = useTranslations('finanzasTributarioR4.perfil');
  const { formatPlain } = useFormatDate();
  const [lectura, setLectura] = useState<Lectura<PerfilCliente>>({ estado: 'cargando' });
  const [dialogo, setDialogo] = useState<{ abierto: boolean; vigencia: VigenciaPerfil | null }>({ abierto: false, vigencia: null });

  const cargar = useCallback(async () => {
    setLectura({ estado: 'cargando' });
    try {
      setLectura({ estado: 'listo', datos: await tributarioCliente.perfil() });
    } catch (err) {
      setLectura({ estado: 'error', codigo: codigoDe(err) });
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const datos = lectura.estado === 'listo' ? lectura.datos : null;
  const puedeEditar = !!datos?.activo && datos.separacionActiva && datos.puedeEditar;

  const base = useMemo<BaseVigencia>(() => {
    const ultima = datos?.vigencias[0];
    if (ultima) {
      // El soporte de un cambio de periodicidad pertenece a la vigencia que lo tuvo: la nueva no lo hereda.
      return {
        ...ultima,
        advertenciasAceptadas: [],
        motivoCambioPeriodicidad: null,
        cambioPeriodicidadHecho: null,
        cambioPeriodicidadNorma: null,
        cambioPeriodicidadFecha: null,
        cambioPeriodicidadEstado: 'no_aplica',
      };
    }
    const fe = datos?.empresa.responsabilidadesRut ?? [];
    // Desde la ficha solo se toma lo que tiene equivalencia explícita (O-47 ↔ SIMPLE, O-13, O-15, O-23).
    // La condición frente al IVA NO se deduce: R-99-PN no equivale a «no responsable».
    return {
      regimenRenta: fe.includes(RESPONSABILIDAD.simple) ? 'simple' : null,
      condicionIva: null,
      granContribuyente: fe.includes(RESPONSABILIDAD.granContribuyente) ? true : null,
      granContribuyenteActo: null,
      granContribuyenteDesde: null,
      autorretenedor: fe.includes(RESPONSABILIDAD.autorretenedor) ? true : null,
      autorretenedorActo: null,
      autorretenedorActoFecha: null,
      autorretencionEspecial: null,
      incActividad: null,
      rteTipo: null,
      rteIngresosSuperan160000Uvt: null,
      noContribuyenteNaturaleza: null,
      cambioPeriodicidadHecho: null,
      cambioPeriodicidadNorma: null,
      cambioPeriodicidadFecha: null,
      cambioPeriodicidadEstado: 'no_aplica',
      actualizadoEn: null,
      agenteRetencionIva: fe.includes(RESPONSABILIDAD.agenteRetencionIva) ? true : null,
      agenteRetencion: false,
      responsableInc: false,
      periodicidadIva: 'no_aplica',
      responsabilidades: fe,
      responsabilidadesRut: [],
      motivoCambioPeriodicidad: null,
      advertenciasAceptadas: [],
      requiereRevision: false,
      regimenOrigen: null,
      notas: null,
      ica: [],
    };
  }, [datos]);

  const vigenciaTexto = (v: VigenciaPerfil) =>
    v.vigenteHasta
      ? v.vigenteDesde.slice(5) === '01-01' && v.vigenteHasta === `${v.vigenteDesde.slice(0, 4)}-12-31`
        ? v.vigenteDesde.slice(0, 4)
        : t('vigencia.rango', { desde: formatPlain(v.vigenteDesde), hasta: formatPlain(v.vigenteHasta) })
      : t('vigencia.desde', { desde: formatPlain(v.vigenteDesde) });

  const renta = (v: VigenciaPerfil) => (v.regimenRenta ? t(`regimenRenta.${v.regimenRenta}`) : t('campos.sinDefinir'));
  const iva = (v: VigenciaPerfil) =>
    v.condicionIva === 'responsable'
      ? `${t('condicionIva.responsable')} · ${t(`periodicidadIva.${v.periodicidadIva}`)}`
      : v.condicionIva === 'no_responsable'
        ? t('condicionIva.no_responsable')
        : t('campos.sinDefinir');
  const estadoVigencia = (v: VigenciaPerfil) =>
    v.requiereRevision ? (
      <StatusBadge estado="revisar" etiqueta={t('estado.revisar')} tono="advertencia" />
    ) : v.cambioPeriodicidadEstado === 'pendiente_soporte' ? (
      <StatusBadge estado="pendiente_soporte" etiqueta={t('cambioEstado.pendiente_soporte')} tono="advertencia" />
    ) : v.advertenciasAceptadas.length > 0 ? (
      <StatusBadge estado="advertencias" etiqueta={t('estado.conAdvertencias', { cuantas: v.advertenciasAceptadas.length })} tono="informacion" />
    ) : (
      <StatusBadge estado="completo" etiqueta={t('estado.completo')} tono="exito" />
    );

  const columnas: ColumnaTabla<VigenciaPerfil>[] = [
    { id: 'vigencia', encabezado: t('columnas.vigencia'), celda: (v) => <span className="font-medium text-fg">{vigenciaTexto(v)}</span> },
    { id: 'renta', encabezado: t('columnas.renta'), celda: renta },
    { id: 'iva', encabezado: t('columnas.iva'), celda: iva },
    {
      id: 'responsabilidades',
      encabezado: t('columnas.responsabilidades'),
      celda: (v) => (v.responsabilidades.length ? v.responsabilidades.join(', ') : '—'),
      ocultarDebajo: 'md',
    },
    {
      id: 'ica',
      encabezado: t('columnas.ica'),
      celda: (v) => (v.ica.length === 0 ? '—' : v.ica.map((i) => `${i.municipio ?? '—'} · ${t(`periodicidadIca.${i.periodicidad}`)}`).join('; ')),
      ocultarDebajo: 'lg',
    },
    { id: 'estado', encabezado: t('columnas.estado'), celda: estadoVigencia },
  ];

  const abrirNueva = () => setDialogo({ abierto: true, vigencia: null });
  const acciones = (v: VigenciaPerfil): AccionFila[] =>
    puedeEditar ? [{ id: 'editar', etiqueta: v.requiereRevision ? t('revisar') : t('editar'), icono: Pencil, onSelect: () => setDialogo({ abierto: true, vigencia: v }) }] : [];
  const vigente = datos?.vigente ?? null;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <CabeceraTributario
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        acciones={
          puedeEditar ? (
            <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={abrirNueva}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('nuevaVigencia')}
            </button>
          ) : undefined
        }
      />

      {lectura.estado === 'error' && <ErrorLectura codigo={lectura.codigo} onReintentar={() => void cargar()} />}

      {datos && !datos.activo && <AvisoPendienteActivar descripcion={t('pendiente')} />}
      {datos && datos.activo && !datos.separacionActiva && <AvisoPendienteActivar descripcion={t('pendienteSeparacion')} />}

      {datos && datos.activo && datos.faltan.length > 0 && (
        <AvisoTonal
          tono="advertencia"
          titulo={t('faltan.titulo')}
          descripcion={
            <ul className="list-disc space-y-0.5 pl-4">
              {datos.faltan.map((f) => (
                <li key={f}>{t(`faltan.${f}`)}</li>
              ))}
            </ul>
          }
          accion={puedeEditar ? { etiqueta: t('faltan.completar'), onClick: () => setDialogo({ abierto: true, vigencia: vigente }) } : undefined}
        />
      )}

      {lectura.estado !== 'error' && (!datos || datos.activo) && (
        <DataTable<VigenciaPerfil>
          etiqueta={t('titulo')}
          columnas={columnas}
          filas={datos?.vigencias ?? []}
          obtenerId={(v) => v.id}
          estado={lectura.estado === 'cargando' ? 'cargando' : datos && datos.vigencias.length === 0 ? 'vacio' : 'listo'}
          vacio={{
            titulo: t('vacio.titulo'),
            descripcion: t('vacio.descripcion'),
            accion: puedeEditar ? { etiqueta: t('nuevaVigencia'), onClick: abrirNueva, icono: Plus } : undefined,
          }}
          acciones={puedeEditar ? acciones : undefined}
          tarjetaMovil={(v) => (
            <ListCard
              icono={CalendarRange}
              titulo={vigenciaTexto(v)}
              subtitulo={`${t('columnas.renta')}: ${renta(v)} · ${t('columnas.iva')}: ${iva(v)}`}
              meta={v.responsabilidades.length ? v.responsabilidades.join(', ') : undefined}
              estado={estadoVigencia(v)}
              acciones={acciones(v)}
            />
          )}
        />
      )}

      {datos && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Tarjeta titulo={t('empresa.titulo')}>
            <ListaDatos>
              <FilaDato
                etiqueta={t('empresa.nit')}
                valor={datos.empresa.nit ? `${datos.empresa.nit}${datos.empresa.dv !== null ? `-${datos.empresa.dv}` : ''}` : t('empresa.sinNit')}
                tono={datos.empresa.nit ? undefined : 'advertencia'}
              />
              <FilaDato
                etiqueta={t('empresa.rut')}
                valor={datos.empresa.responsabilidadesRut.length ? datos.empresa.responsabilidadesRut.join(', ') : '—'}
                descripcion={t('empresa.rutAyuda')}
              />
            </ListaDatos>
            <p className="mt-3 text-sm">
              <Link href="/app/organizacion/informacion" className="font-medium text-brand hover:underline">
                {t('empresa.editarNit')}
              </Link>
            </p>
          </Tarjeta>
          <Tarjeta titulo={t('usos.titulo')}>
            <p className="text-sm text-fg-secondary">{t('usos.descripcion')}</p>
            <p className="mt-3 text-sm">
              <Link href={RUTAS_TRIBUTARIO.centro} className="font-medium text-brand hover:underline">
                {t('usos.irCentro')}
              </Link>
            </p>
          </Tarjeta>
        </div>
      )}

      {datos?.activo && (
        <VigenciaDialogo
          abierto={dialogo.abierto}
          onAbiertoChange={(abierto) => setDialogo((d) => ({ ...d, abierto }))}
          vigencia={dialogo.vigencia}
          base={base}
          vigencias={datos.vigencias}
          inicioPropuesto={inicioPropuesto(datos.vigencias, datos.hoy)}
          catalogo={datos.catalogo}
          catalogoRut={datos.catalogoRut}
          hoy={datos.hoy}
          onGuardado={() => void cargar()}
        />
      )}
    </div>
  );
}
