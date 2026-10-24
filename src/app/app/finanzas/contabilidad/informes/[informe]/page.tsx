import { notFound } from 'next/navigation';
import { InformeEstadosPage } from '@/components/finanzas/contabilidad/estados/InformeEstadosPage';
import { esIdInforme } from '@/lib/finanzas/estados/tipos';

function uno(valor: string | string[] | undefined): string | null {
  const crudo = Array.isArray(valor) ? valor[0] : valor;
  const texto = crudo?.trim() ?? '';
  return texto || null;
}

function dia(valor: string | null): string | null {
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null;
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ informe: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { informe } = await params;
  if (!esIdInforme(informe)) notFound();
  const consulta = await searchParams;
  const sucursal = uno(consulta.sucursal);
  const centro = uno(consulta.centro);
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <InformeEstadosPage
        informe={informe}
        cuentaInicial={uno(consulta.cuenta)}
        desdeInicial={dia(uno(consulta.desde))}
        hastaInicial={dia(uno(consulta.hasta))}
        sucursalInicial={sucursal && /^\d+$/.test(sucursal) ? Number(sucursal) : null}
        centroInicial={centro && /^[0-9a-f-]{36}$/i.test(centro) ? centro : null}
      />
    </div>
  );
}
