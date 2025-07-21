import * as React from "react";

interface SliderProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultValue?: number[];
  max?: number;
  min?: number;
  step?: number;
  value?: number[];
  onValueChange?: (value: number[]) => void;
  onValueCommit?: (value: number[]) => void;
  disabled?: boolean;
  orientation?: "horizontal" | "vertical";
}

declare const Slider: React.ForwardRefExoticComponent<
  SliderProps & React.RefAttributes<HTMLDivElement>
>;

export { Slider };
export type { SliderProps };
