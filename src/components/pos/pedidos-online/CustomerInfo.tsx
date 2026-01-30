'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { User, Phone, Mail, MapPin } from 'lucide-react';

interface CustomerInfoProps {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  customer?: {
    id: string;
    full_name: string;
    email: string;
    phone: string;
    address?: string;
  };
  variant?: 'card' | 'inline' | 'compact';
}

export function CustomerInfo({ 
  name, 
  phone, 
  email, 
  address,
  customer,
  variant = 'inline' 
}: CustomerInfoProps) {
  const displayName = name || customer?.full_name || 'Cliente anónimo';
  const displayPhone = phone || customer?.phone;
  const displayEmail = email || customer?.email;
  const displayAddress = address || customer?.address;

  if (variant === 'card') {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" />
            Cliente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="font-medium">{displayName}</p>
          {displayPhone && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="h-4 w-4" />
              <a href={`tel:${displayPhone}`} className="hover:underline">
                {displayPhone}
              </a>
            </p>
          )}
          {displayEmail && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4" />
              <a href={`mailto:${displayEmail}`} className="hover:underline">
                {displayEmail}
              </a>
            </p>
          )}
          {displayAddress && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              {displayAddress}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-2">
        <User className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium text-sm">{displayName}</span>
        {displayPhone && (
          <>
            <span className="text-muted-foreground">•</span>
            <Phone className="h-3 w-3 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{displayPhone}</span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="flex items-center gap-2 text-sm">
        <User className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{displayName}</span>
      </p>
      {displayPhone && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Phone className="h-4 w-4" />
          <a href={`tel:${displayPhone}`} className="hover:underline">
            {displayPhone}
          </a>
        </p>
      )}
      {displayEmail && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Mail className="h-4 w-4" />
          <a href={`mailto:${displayEmail}`} className="hover:underline truncate max-w-[200px]">
            {displayEmail}
          </a>
        </p>
      )}
    </div>
  );
}
