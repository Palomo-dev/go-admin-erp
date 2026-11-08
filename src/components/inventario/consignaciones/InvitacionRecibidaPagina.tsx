'use client';

/**
 * Invitación de vínculo recibida (Figma R7 `2406:147790`, captura
 * `docs/design/figma/89-consignacion-recibida-07-invitacion-recibida.png`). Se
 * abre con el enlace de un solo uso y con sesión. Se acepta en nombre de la
 * organización ACTIVA de la sesión (la organización nunca sale del cuerpo), siendo
 * administrador, y amarrando el vínculo a un proveedor tuyo. «Qué verá de ti»:
 * tu nombre, NIT y el usuario que acepta, y lo de SUS notas; nunca tus clientes,
 * precios, inventario ni contabilidad.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link2 } from 'lucide-react';
import { AvisoTonal, FormField, PageHeader, StatusBadge, Tarjeta, clasesBoton } from '@/components/kit';
import { toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { ElegirProveedor, type ProveedorDocumento } from '@/components/finanzas/documento/terceros';
import { ErrorPeticionSaldoFavor } from '@/components/finanzas/saldos-a-favor/saldosAFavorService';
import { textoErrorSaldo } from '@/components/finanzas/saldos-a-favor/textosSaldo';
import { RUTA_CONSIGNACIONES_INVENTARIO, TOKEN_RE } from '@/lib/inventario/consignaciones/recibidas';
import { consignacionesRecibidasService } from './consignacionesRecibidasService';

const NS = 'consignacionesR4';

type Invitacion = Awaited<ReturnType<typeof consignacionesRecibidasService.verInvitacion>>;

export function InvitacionRecibidaPagina({ token }: { token: string }) {
  const t = useTranslations(NS);
  const router = useRouter();
  const { formatDate } = useFormatDate();
  const [inv, setInv] = useState<Invitacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proveedor, setProveedor] = useState<ProveedorDocumento | null>(null);
  const [enviando, setEnviando] = useState(false);
  const tokenValido = TOKEN_RE.test(token);
  const orgActiva = getOrganizationId();

  useEffect(() => {
    if (!tokenValido) return;
    let vigente = true;
    consignacionesRecibidasService
      .verInvitacion(token)
      .then((r) => vigente && setInv(r))
      .catch((e) => vigente && setError(e instanceof ErrorPeticionSaldoFavor ? textoErrorSaldo(t, e) : t('errores.error_desconocido')));
    return () => {
      vigente = false;
    };
  }, [token, tokenValido, t]);

  const esAdminAqui = !!inv?.organizaciones?.some((o) => o.id === orgActiva);
  const nombreOrg = inv?.organizaciones?.find((o) => o.id === orgActiva)?.nombre ?? '';
  const invita = inv?.invita?.nombre ?? '—';

  const responder = async (aceptar: boolean) => {
    setEnviando(true);
    setError(null);
    try {
      if (aceptar) {
        if (!proveedor) return;
        await consignacionesRecibidasService.aceptarVinculo({ token, organizacion_id: orgActiva, proveedor_id: Number(proveedor.id) });
        toastSuccess(t('invitacion.aceptada', { invita }));
      } else {
        await consignacionesRecibidasService.rechazarVinculo(token, null);
        toastSuccess(t('invitacion.rechazada'));
      }
      router.push(RUTA_CONSIGNACIONES_INVENTARIO);
    } catch (e) {
      setError(textoErrorSaldo(t, e));
    } finally {
      setEnviando(false);
    }
  };

  const filas = [
    { texto: t('invitacion.vera.datos'), si: true },
    { texto: t('invitacion.vera.notas'), si: true },
    { texto: t('invitacion.vera.nunca'), si: false },
  ];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 sm:p-6">
      <PageHeader titulo={inv?.estado === 'pendiente' ? t('invitacion.titulo', { invita }) : t('invitacion.tituloGenerico')} icono={Link2} variante="detail" volverA={RUTA_CONSIGNACIONES_INVENTARIO} />
      {(!tokenValido || inv?.estado === 'invalida') && <AvisoTonal tono="peligro" titulo={t('invitacion.invalida')} descripcion={t('invitacion.invalidaDescripcion')} />}
      {inv?.estado === 'vencida' && <AvisoTonal tono="advertencia" titulo={t('invitacion.vencida')} descripcion={t('invitacion.vencidaDescripcion')} />}
      {inv?.estado === 'pendiente' && (
        <>
          <p className="text-sm text-fg-secondary">{t('invitacion.subtitulo', { creada: formatDate(inv.creada ?? null), vence: formatDate(inv.vence ?? null) })}</p>
          {!esAdminAqui && <AvisoTonal tono="advertencia" titulo={t('invitacion.noAdminTitulo')} descripcion={t('invitacion.noAdmin')} />}
          {esAdminAqui && (
            <>
              <p className="text-sm text-fg">{t('invitacion.aceptasEnNombre', { organizacion: nombreOrg })}</p>
              <FormField etiqueta={t('invitacion.tercero', { invita })} obligatorio ayuda={t('invitacion.terceroAyuda')}>
                {(c) => <ElegirProveedor layout="campo" id={c.id} proveedor={proveedor} onCambiar={setProveedor} onQuitar={() => setProveedor(null)} />}
              </FormField>
            </>
          )}
          <Tarjeta titulo={t('invitacion.queVera', { invita })}>
            <ul>
              {filas.map((f) => (
                <li key={f.texto} className="flex items-center justify-between gap-3 border-t border-line py-2 text-sm text-fg first:border-t-0">
                  <span>{f.texto}</span>
                  <StatusBadge estado={f.si ? 'completado' : 'rechazado'} etiqueta={f.si ? t('vincular.si') : t('vincular.nunca')} />
                </li>
              ))}
            </ul>
          </Tarjeta>
          {esAdminAqui && (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => void responder(false)} disabled={enviando} className={clasesBoton({ variante: 'secundario' })}>
                {t('invitacion.rechazar')}
              </button>
              <button type="button" onClick={() => void responder(true)} disabled={enviando || !proveedor} className={clasesBoton({ variante: 'primario' })}>
                {t('invitacion.aceptar')}
              </button>
            </div>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
