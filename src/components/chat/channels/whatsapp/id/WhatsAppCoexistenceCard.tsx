'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, ExternalLink, Info } from 'lucide-react';

export default function WhatsAppCoexistenceCard() {
  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg text-gray-900 dark:text-white">
              Coexistence Mode (Meta oficial)
            </CardTitle>
            <CardDescription className="text-gray-500 dark:text-gray-400">
              Usa la app WhatsApp Business en tu teléfono + Cloud API al mismo tiempo
            </CardDescription>
          </div>
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
            Sin riesgo de ban
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 flex items-start gap-2">
          <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
            <p>
              <strong>Coexistence</strong> es el modo oficial de Meta que permite usar la app
              WhatsApp Business en el teléfono <strong>y</strong> la Cloud API simultáneamente,
              en el mismo número.
            </p>
            <p>El representante puede responder desde su teléfono y cualquier usuario desde la bandeja del ERP, sin riesgo de ban.</p>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="font-medium text-gray-900 dark:text-white">Requisitos</h4>
          <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 list-disc list-inside">
            <li>Meta Business Portfolio con <strong>Business Verification</strong> aprobado</li>
            <li>WhatsApp Business Account (WABA) con el número registrado</li>
            <li>Límite: 2 números inicialmente, ampliable a 20 tras verificación</li>
          </ul>
        </div>

        <div className="space-y-2">
          <h4 className="font-medium text-gray-900 dark:text-white">Pasos para activar</h4>
          <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-1 list-decimal list-inside">
            <li>Completar <strong>Business Verification</strong> en Meta Business Suite</li>
            <li>Ir a <strong>WhatsApp Manager → Phone Numbers</strong></li>
            <li>Seleccionar el número → <strong>Settings → Coexistence → Enable</strong></li>
            <li>Vincular el número en la app WhatsApp Business del teléfono</li>
            <li>En el ERP: crear canal WhatsApp con credenciales Cloud API (tab &ldquo;Cloud API&rdquo;)</li>
          </ol>
        </div>

        <div className="space-y-2">
          <h4 className="font-medium text-gray-900 dark:text-white">Ventajas</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              'Sin riesgo de ban (oficial Meta)',
              'Rep usa app en teléfono + bandeja ERP',
              'Templates y marketing permitidos',
              'Backfill de 6 meses de historial',
              'Blue tick oficial (con Verified)',
              'IA y cualquier usuario responden',
            ].map((v) => (
              <div key={v} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                {v}
              </div>
            ))}
          </div>
        </div>

        <a
          href="https://business.facebook.com/wa-manager/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          Abrir WhatsApp Manager <ExternalLink className="h-3 w-3" />
        </a>
      </CardContent>
    </Card>
  );
}
