'use client';

/**
 * Colillas del período (Figma 20.23.3, 23.6–23.10). Antes del cierre son una vista
 * previa: el empleado solo ve sus colillas cerradas (`fn_hr_nomina_mis_colillas`).
 * El envío por correo y el portal del empleado llegan después (ver la entrega).
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Eye, FileUser } from 'lucide-react';
import { AvisoTonal, DataTable, ListCard, ListToolbar, SearchInput, StatusBadge, type ColumnaTabla, type TonoBadge } from '@/components/kit';
import { CeldaPersona } from '../ausencias/piezasAusencias';
import { rutaColilla, type ColillaPeriodo, type DetallePeriodo, type PersonaNomina } from './apiNomina';
import { contarAlertas, estaCerrado, estadoPeriodo, normalizar } from './nominaLogica';
import { useDinero } from './piezasNomina';

export const TONO_COLILLA: Record<string, TonoBadge> = { draft: 'informacion', approved: 'marca', paid: 'exito', cancelled: 'neutro' };

export function EstadoColilla({ estado }: { estado: string }) {
  const t = useTranslations('hrmNomina.colilla.estados');
  const k = ['draft', 'approved', 'paid', 'cancelled'].includes(estado) ? estado : 'draft';
  return <StatusBadge estado={k} etiqueta={t(k)} tono={TONO_COLILLA[k]} />;
}

export function SeccionColillas({ periodo, personas }: { periodo: DetallePeriodo; personas: Map<string, PersonaNomina> }) {
  const t = useTranslations('hrmNomina.colillas');
  const router = useRouter();
  const dinero = useDinero();
  const [texto, setTexto] = useState('');
  const id = periodo.periodo.id;
  const cerrado = estaCerrado(estadoPeriodo(periodo.periodo.status));
  const filas = useMemo(() => {
    const q = normalizar(texto);
    return periodo.colillas.filter((c) => !q || normalizar([c.nombre, personas.get(c.vinculo_id)?.cargo, personas.get(c.vinculo_id)?.area].filter(Boolean).join(' ')).includes(q));
  }, [periodo, personas, texto]);

  const abrir = (c: ColillaPeriodo) => router.push(rutaColilla(id, c.vinculo_id));
  const columnas: ColumnaTabla<ColillaPeriodo>[] = [
    {
      id: 'persona',
      encabezado: t('columnas.empleado'),
      celda: (c) => <CeldaPersona fila={{ nombre: c.nombre, cargo: personas.get(c.vinculo_id)?.cargo ?? null, area: personas.get(c.vinculo_id)?.area ?? null }} />,
    },
    { id: 'neto', encabezado: t('columnas.neto'), variante: 'importe', celda: (c) => (contarAlertas(c.alertas).bloqueos ? '—' : dinero(c.neto)) },
    { id: 'estado', encabezado: t('columnas.estado'), celda: (c) => <EstadoColilla estado={c.estado} /> },
  ];

  return (
    <>
      {!cerrado ? <AvisoTonal tono="informacion" compacto titulo={t('vistaPrevia')} /> : null}
      {periodo.colillas.length > 0 ? <ListToolbar busqueda={<SearchInput value={texto} onChange={setTexto} placeholder={t('buscar')} etiqueta={t('buscar')} />} /> : null}
      <DataTable
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={filas}
        obtenerId={(c) => c.id}
        estado={filas.length === 0 ? (periodo.colillas.length === 0 ? 'vacio' : 'sinResultados') : 'listo'}
        onFilaClick={abrir}
        etiquetaFila={(c) => c.nombre ?? '—'}
        acciones={(c) => [{ id: 'ver', etiqueta: t('ver'), icono: Eye, onSelect: () => abrir(c) }]}
        tarjetaMovil={(c) => (
          <ListCard avatar={{ nombre: c.nombre ?? '?' }} titulo={c.nombre ?? '—'} valor={dinero(c.neto)} estado={<EstadoColilla estado={c.estado} />} onClick={() => abrir(c)} />
        )}
        vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion'), icono: FileUser }}
        sinResultados={{ descripcion: t('sinResultados') }}
        onLimpiarFiltros={() => setTexto('')}
        termino={texto}
      />
    </>
  );
}
