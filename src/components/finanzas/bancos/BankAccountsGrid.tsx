'use client';

import React from 'react';
import { BankAccountCard } from './BankAccountCard';
import { BankAccount } from './BancosService';
import { Landmark } from 'lucide-react';

interface BankAccountsGridProps {
  accounts: BankAccount[];
  isLoading?: boolean;
  onToggleActive?: (accountId: number, isActive: boolean) => void;
}

export function BankAccountsGrid({ accounts, isLoading, onToggleActive }: BankAccountsGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div 
            key={i} 
            className="h-48 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-full mb-4">
          <Landmark className="h-12 w-12 text-gray-400 dark:text-gray-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          No hay cuentas bancarias
        </h3>
        <p className="text-gray-500 dark:text-gray-400 max-w-md">
          Aún no has registrado ninguna cuenta bancaria. Crea una nueva cuenta para comenzar a gestionar tus finanzas.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {accounts.map((account) => (
        <BankAccountCard 
          key={account.id} 
          account={account} 
          onToggleActive={onToggleActive}
        />
      ))}
    </div>
  );
}
