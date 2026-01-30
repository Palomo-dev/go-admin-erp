'use client';

import { useState } from 'react';
import { AlertTriangle, Users, MessageSquare, Target, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/utils/Utils';
import type { DuplicateGroup } from './types';

interface DuplicadosPanelProps {
  duplicates: DuplicateGroup[];
  loading?: boolean;
  onMerge: (primaryId: string, secondaryIds: string[]) => Promise<void>;
}

export function DuplicadosPanel({ duplicates, loading, onMerge }: DuplicadosPanelProps) {
  const [selectedGroup, setSelectedGroup] = useState<DuplicateGroup | null>(null);
  const [primaryCustomer, setPrimaryCustomer] = useState<string | null>(null);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [merging, setMerging] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Posibles Duplicados
        </h3>
        <div className="animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (duplicates.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
            <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Sin duplicados
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          No se encontraron identidades duplicadas en tu base de datos
        </p>
      </div>
    );
  }

  const handleSelectPrimary = (customerId: string) => {
    setPrimaryCustomer(customerId);
    // Auto-seleccionar los demás como secundarios
    if (selectedGroup) {
      setSelectedCustomers(
        selectedGroup.customers
          .filter(c => c.id !== customerId)
          .map(c => c.id)
      );
    }
  };

  const handleToggleSecondary = (customerId: string) => {
    setSelectedCustomers(prev => 
      prev.includes(customerId)
        ? prev.filter(id => id !== customerId)
        : [...prev, customerId]
    );
  };

  const handleMerge = async () => {
    if (!primaryCustomer || selectedCustomers.length === 0) return;
    
    setMerging(true);
    try {
      await onMerge(primaryCustomer, selectedCustomers);
      setShowMergeDialog(false);
      setSelectedGroup(null);
      setPrimaryCustomer(null);
      setSelectedCustomers([]);
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="h-5 w-5 text-orange-500" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Posibles Duplicados ({duplicates.length})
        </h3>
      </div>

      <div className="space-y-4">
        {duplicates.map((group, index) => (
          <div
            key={index}
            className="border border-orange-200 dark:border-orange-800 rounded-lg p-4 bg-orange-50/50 dark:bg-orange-900/10"
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                  {group.identity_type === 'phone' ? 'Teléfono' : 
                   group.identity_type === 'email' ? 'Email' : group.identity_type}
                </Badge>
                <code className="ml-2 text-sm font-mono bg-white dark:bg-gray-800 px-2 py-0.5 rounded">
                  {group.identity_value}
                </code>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSelectedGroup(group);
                  setPrimaryCustomer(null);
                  setSelectedCustomers([]);
                  setShowMergeDialog(true);
                }}
              >
                <Users className="h-4 w-4 mr-2" />
                Unificar
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {group.customers.map((customer) => (
                <div
                  key={customer.id}
                  className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white text-sm">
                      {customer.full_name || 'Sin nombre'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {customer.email || customer.phone || '-'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {customer.conversations_count}
                    </span>
                    <span className="flex items-center gap-1">
                      <Target className="h-3 w-3" />
                      {customer.opportunities_count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Diálogo de fusión */}
      <AlertDialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Unificar Clientes</AlertDialogTitle>
            <AlertDialogDescription>
              Selecciona el cliente principal. Los demás clientes seleccionados serán fusionados en él.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {selectedGroup && (
            <div className="space-y-3 my-4">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Identidad duplicada: <code className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                  {selectedGroup.identity_value}
                </code>
              </p>

              <div className="space-y-2">
                {selectedGroup.customers.map((customer) => (
                  <div
                    key={customer.id}
                    className={cn(
                      'flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors',
                      primaryCustomer === customer.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                    )}
                    onClick={() => handleSelectPrimary(customer.id)}
                  >
                    <div className="flex-shrink-0">
                      {primaryCustomer === customer.id ? (
                        <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                          <Check className="h-3 w-3 text-white" />
                        </div>
                      ) : (
                        <Checkbox
                          checked={selectedCustomers.includes(customer.id)}
                          onCheckedChange={() => handleToggleSecondary(customer.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {customer.full_name || 'Sin nombre'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {customer.email || customer.phone || '-'}
                      </p>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      <span>{customer.conversations_count} conv.</span>
                      <span className="mx-1">•</span>
                      <span>{customer.opportunities_count} ops.</span>
                    </div>
                    {primaryCustomer === customer.id && (
                      <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        Principal
                      </Badge>
                    )}
                  </div>
                ))}
              </div>

              {primaryCustomer && selectedCustomers.length > 0 && (
                <p className="text-sm text-orange-600 dark:text-orange-400">
                  ⚠️ Se fusionarán {selectedCustomers.length} cliente(s) en el cliente principal.
                  Las conversaciones, oportunidades y actividades serán transferidas.
                </p>
              )}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMerge}
              disabled={!primaryCustomer || selectedCustomers.length === 0 || merging}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {merging ? 'Fusionando...' : 'Fusionar clientes'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
