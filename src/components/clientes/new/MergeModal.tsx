'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useEtiquetasCatalogo } from './useEtiquetasCatalogo';

interface MergeModalProps {
  existingClient: {
    id: string;
    first_name: string;
    last_name: string;
    email?: string;
    doc_number?: string;
    roles?: string[];
  };
  newClientData: {
    firstName: string;
    lastName: string;
    email?: string;
    documentNumber?: string;
  };
  onMerge: (action: 'keep-existing' | 'update-existing' | 'create-new') => void;
  onCancel: () => void;
}

export function MergeModal({ existingClient, newClientData, onMerge, onCancel }: MergeModalProps) {
  const t = useTranslations('clientes.formulario');
  const etiquetas = useEtiquetasCatalogo();
  return (
    <Dialog open={true} onOpenChange={onCancel}>
      <DialogContent className="sm:max-w-md md:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-center">{t('duplicado.titulo')}</DialogTitle>
          <DialogDescription className="text-center text-gray-600 dark:text-gray-400">
            {t('duplicado.descripcion')}
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-4 border border-gray-200 dark:border-gray-700 rounded-md">
              <h3 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">{t('duplicado.existente')}</h3>
              <ul className="space-y-2 text-sm">
                <li><span className="font-medium">{t('duplicado.nombre')}</span> {existingClient.first_name} {existingClient.last_name}</li>
                {existingClient.email && <li><span className="font-medium">{t('duplicado.email')}</span> {existingClient.email}</li>}
                {existingClient.doc_number && <li><span className="font-medium">{t('duplicado.documento')}</span> {existingClient.doc_number}</li>}
                {existingClient.roles && existingClient.roles.length > 0 && (
                  <li>
                    <span className="font-medium">{t('duplicado.roles')}</span>{" "}
                    {existingClient.roles.map((rol) => etiquetas.rol(rol, rol)).join(", ")}
                  </li>
                )}
              </ul>
            </Card>

            <Card className="p-4 border border-gray-200 dark:border-gray-700 rounded-md">
              <h3 className="font-semibold text-green-600 dark:text-green-400 mb-2">{t('duplicado.nuevo')}</h3>
              <ul className="space-y-2 text-sm">
                <li><span className="font-medium">{t('duplicado.nombre')}</span> {newClientData.firstName} {newClientData.lastName}</li>
                {newClientData.email && <li><span className="font-medium">{t('duplicado.email')}</span> {newClientData.email}</li>}
                {newClientData.documentNumber && <li><span className="font-medium">{t('duplicado.documento')}</span> {newClientData.documentNumber}</li>}
              </ul>
            </Card>
          </div>
          
          <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-md border border-amber-200 dark:border-amber-700">
            <h4 className="font-medium text-amber-800 dark:text-amber-300 mb-1">{t('duplicado.pregunta')}</h4>
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {t('duplicado.instruccion')}
            </p>
          </div>
        </div>
        
        <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-between">
          <Button
            variant="outline"
            onClick={() => onMerge('keep-existing')}
            className="w-full sm:w-auto"
          >
            {t('duplicado.usarExistente')}
          </Button>
          
          <Button
            variant="secondary"
            onClick={() => onMerge('update-existing')}
            className="w-full sm:w-auto"
          >
            {t('duplicado.actualizarExistente')}
          </Button>
          
          <Button
            onClick={() => onMerge('create-new')}
            className="w-full sm:w-auto"
          >
            {t('duplicado.crearNuevo')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
