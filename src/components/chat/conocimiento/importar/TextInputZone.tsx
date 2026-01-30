'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { AlignLeft, SeparatorHorizontal } from 'lucide-react';

interface TextInputZoneProps {
  textContent: string;
  separator: string;
  onTextChange: (text: string) => void;
  onSeparatorChange: (separator: string) => void;
}

export default function TextInputZone({
  textContent,
  separator,
  onTextChange,
  onSeparatorChange
}: TextInputZoneProps) {
  return (
    <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium text-gray-900 dark:text-white flex items-center gap-2">
          <AlignLeft className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          Entrada de Texto
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-gray-700 dark:text-gray-300">
              Pega el contenido aquí
            </Label>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {textContent.length} caracteres
            </span>
          </div>
          <Textarea
            value={textContent}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder={`Título del primer fragmento
Contenido del primer fragmento aquí...
Puede tener múltiples líneas.

---

Título del segundo fragmento
Contenido del segundo fragmento...`}
            rows={12}
            className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 font-mono text-sm resize-none"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <SeparatorHorizontal className="h-4 w-4" />
            Separador entre fragmentos
          </Label>
          <Input
            value={separator}
            onChange={(e) => onSeparatorChange(e.target.value)}
            placeholder="---"
            className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 max-w-[200px]"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Usa este texto para separar cada fragmento. Por defecto: ---
          </p>
        </div>

        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Formato esperado:</p>
          <code className="text-xs text-gray-600 dark:text-gray-400 block bg-gray-100 dark:bg-gray-900 p-2 rounded whitespace-pre-wrap">
{`Título del fragmento
El contenido va aquí en las
siguientes líneas.

---

Otro título
Más contenido para el
segundo fragmento.`}
          </code>
        </div>
      </CardContent>
    </Card>
  );
}
