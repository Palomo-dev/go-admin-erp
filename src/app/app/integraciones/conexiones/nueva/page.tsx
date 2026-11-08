/**
 * /app/integraciones/conexiones/nueva — entrada vieja del asistente de conexiones.
 *
 * Frente INT (2026-11-07): redirige EN EL SERVIDOR al asistente nuevo de Integraciones › Conexiones
 * para todo proveedor que el nuevo cubre (pasarelas por llaves, OTA, iCal, OAuth, domicilios y
 * logística), conservando proveedor, sucursal y `?return=`. Editar una conexión cubierta va a su
 * detalle («Reemplazar llave»). El formulario viejo (`AsistenteViejo`) queda SOLO para lo que el
 * nuevo no cubre: Bold (datáfonos por sucursal), Bancolombia QR, Bre-B, Redeban, WhatsApp, Twilio
 * y proveedores de la base que el catálogo no conozca. Reglas: `rutaAsistente.ts`.
 *
 * El proveedor puede llegar como uuid (`integration_providers.id`) o como código; el uuid se
 * resuelve con el cliente de la SESIÓN (RLS). Una consulta fallida no redirige: se queda en el
 * formulario de siempre.
 */
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getServerUserClient } from '@/lib/supabase/server-user';
import { destinoDelAsistenteViejo } from '@/lib/services/integrations/conexiones/rutaAsistente';
import AsistenteViejo from './AsistenteViejo';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Parametros = Promise<Record<string, string | string[] | undefined>>;

async function codigoDeProveedor(id: string): Promise<string | null> {
  try {
    const db = await getServerUserClient();
    const { data } = await db.from('integration_providers').select('code').eq('id', id).maybeSingle();
    return typeof (data as { code?: unknown } | null)?.code === 'string' ? (data as { code: string }).code : null;
  } catch {
    return null;
  }
}

async function proveedorDeConexion(id: string): Promise<string | null> {
  try {
    const db = await getServerUserClient();
    const { data } = await db
      .from('integration_connections')
      .select('connector:integration_connectors(provider:integration_providers(code))')
      .eq('id', id)
      .maybeSingle();
    const conector = (data as { connector?: unknown } | null)?.connector;
    const c = Array.isArray(conector) ? conector[0] : conector;
    const p = (c as { provider?: unknown } | undefined)?.provider;
    const prov = Array.isArray(p) ? p[0] : p;
    const code = (prov as { code?: unknown } | undefined)?.code;
    return typeof code === 'string' ? code : null;
  } catch {
    return null;
  }
}

export default async function NuevaConexionPage({ searchParams }: { searchParams: Parametros }) {
  const sp = await searchParams;
  const uno = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : null);
  const mode = uno('mode');
  const id = uno('id');
  let proveedor = uno('provider');
  if (proveedor && UUID.test(proveedor)) proveedor = (await codigoDeProveedor(proveedor)) ?? proveedor;
  const deConexion = (mode === 'edit' || mode === 'duplicate') && id && UUID.test(id) ? await proveedorDeConexion(id) : null;
  const sucursal = Number.parseInt(uno('sucursal') ?? uno('branch_id') ?? '', 10);

  const destino = destinoDelAsistenteViejo({
    mode,
    id,
    proveedor,
    proveedorDeConexion: deConexion,
    volver: uno('return'),
    sucursalId: Number.isInteger(sucursal) && sucursal > 0 ? sucursal : null,
  });
  if (destino) redirect(destino);

  return (
    <Suspense fallback={null}>
      <AsistenteViejo />
    </Suspense>
  );
}
