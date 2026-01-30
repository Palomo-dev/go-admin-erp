'use client';

import React, { useState } from 'react';
import { Globe, Plus, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface AllowedDomainsSectionProps {
  domains: string[];
  onAddDomain: (domain: string) => Promise<void>;
  onRemoveDomain: (domain: string) => Promise<void>;
}

export default function AllowedDomainsSection({
  domains,
  onAddDomain,
  onRemoveDomain
}: AllowedDomainsSectionProps) {
  const [newDomain, setNewDomain] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [removingDomain, setRemovingDomain] = useState<string | null>(null);

  const handleAddDomain = async () => {
    if (!newDomain.trim()) return;

    try {
      setIsAdding(true);
      await onAddDomain(newDomain.trim());
      setNewDomain('');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveDomain = async (domain: string) => {
    try {
      setRemovingDomain(domain);
      await onRemoveDomain(domain);
    } finally {
      setRemovingDomain(null);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddDomain();
    }
  };

  return (
    <Card className="dark:bg-gray-800 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Globe className="h-5 w-5 text-blue-600" />
          Dominios Permitidos
        </CardTitle>
        <CardDescription>
          Lista de dominios donde el widget puede funcionar. Deja vacío para permitir todos los dominios.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Domain */}
        <div className="flex gap-2">
          <Input
            placeholder="ejemplo.com"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1"
          />
          <Button onClick={handleAddDomain} disabled={isAdding || !newDomain.trim()}>
            {isAdding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Plus className="h-4 w-4 mr-1" />
                Agregar
              </>
            )}
          </Button>
        </div>

        {/* Domains List */}
        {domains.length === 0 ? (
          <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg text-center">
            <Globe className="h-8 w-8 mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Sin restricción de dominios
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              El widget funcionará en cualquier sitio web
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {domains.map((domain) => (
              <Badge
                key={domain}
                variant="secondary"
                className="flex items-center gap-1 px-3 py-1.5"
              >
                <Globe className="h-3 w-3" />
                {domain}
                <button
                  onClick={() => handleRemoveDomain(domain)}
                  disabled={removingDomain === domain}
                  className="ml-1 hover:text-red-500 transition-colors"
                >
                  {removingDomain === domain ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <X className="h-3 w-3" />
                  )}
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* Info */}
        <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-sm text-yellow-700 dark:text-yellow-300">
          <p className="font-medium mb-1">💡 Consejo de seguridad</p>
          <p className="text-xs">
            Agregar dominios específicos ayuda a prevenir el uso no autorizado del widget en otros sitios.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
