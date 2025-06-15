import React from "react";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  color?: string;
}

/**
 * Componente de spinner de carga reutilizable
 */
const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = "md",
  className = "",
  color = "text-primary"
}) => {
  // Tamaños predefinidos
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-8 w-8",
    lg: "h-12 w-12"
  };

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div
        className={`animate-spin rounded-full border-2 border-t-transparent ${sizeClasses[size]} ${color}`}
        style={{ borderTopColor: "transparent" }}
      ></div>
    </div>
  );
};

export default LoadingSpinner;
