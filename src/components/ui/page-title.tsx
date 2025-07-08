import React from 'react';

interface PageTitleProps {
  children: React.ReactNode;
  className?: string;
}

export function PageTitle({ children, className = '' }: PageTitleProps) {
  return (
    <h1 className={`text-2xl font-semibold tracking-tight ${className}`}>
      {children}
    </h1>
  );
}
