import React from "react";

interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
}

const Separator: React.FC<SeparatorProps> = ({
  orientation = "horizontal",
  className = "",
  ...props
}) => {
  const baseClasses = "shrink-0";
  const orientationClasses =
    orientation === "horizontal"
      ? "h-[1px] w-full bg-gray-200 dark:bg-gray-700"
      : "h-full w-[1px] bg-gray-200 dark:bg-gray-700";

  const combinedClasses = `${baseClasses} ${orientationClasses} ${className}`;

  return <div className={combinedClasses} role="separator" {...props} />;
};

Separator.displayName = "Separator";

export { Separator };
