'use client';

import { useTranslations } from 'next-intl';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { PageHeaderSkeleton, DetailSkeleton } from '@/components/common/PageSkeletons';
import { PageHeader } from '@/components/kit/PageHeader';
import { PromocionFormulario } from '@/components/pos/promociones/formulario/PromocionFormulario';
import { useMigaVentas } from '@/components/pos/useMigaVentas';

export default function NuevaPromocionPage() {
  const t = useTranslations('posPromociones');
  const migaVentas = useMigaVentas();
  const { isLoading: orgLoading } = useOrganization();

  if (orgLoading) {
    return (
      <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 sm:p-6">
        <PageHeaderSkeleton />
        <DetailSkeleton />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 sm:p-6">
      <div className="flex w-full flex-col gap-4">
        <PageHeader
          variante="form"
          titulo={t('pantalla.nueva')}
          subtitulo={t('v2.subtitulo')}
          volverA="/app/pos/promociones"
          migas={[
            migaVentas,
            { etiqueta: t('pantalla.titulo'), href: '/app/pos/promociones' },
            { etiqueta: t('pantalla.nueva') },
          ]}
        />
        <PromocionFormulario />
      </div>
    </div>
  );
}
