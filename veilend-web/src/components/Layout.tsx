import React from "react";
import { cn } from "@/lib/utils";

interface ContainerProps {
  children: React.ReactNode;
  className?: string;
}

export const Container: React.FC<ContainerProps> = ({
  children,
  className = "",
}) => {
  return (
    <div className={cn("max-w-7xl mx-auto px-4 sm:px-6 lg:px-8", className)}>
      {children}
    </div>
  );
};

interface SectionProps {
  children: React.ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
}

export const Section: React.FC<SectionProps> = ({
  children,
  className = "",
  padding = "md",
}) => {
  const paddingClasses: Record<string, string> = {
    none: "py-0",
    sm: "py-6",
    md: "py-12",
    lg: "py-20",
  };

  return (
    <section className={cn(paddingClasses[padding], className)}>
      {children}
    </section>
  );
};

interface FlexProps {
  children: React.ReactNode;
  direction?: "row" | "col";
  justify?: "start" | "center" | "end" | "between" | "around" | "evenly";
  align?: "start" | "center" | "end" | "stretch";
  gap?: "none" | "sm" | "md" | "lg" | "xl";
  wrap?: boolean;
  className?: string;
}

export const Flex: React.FC<FlexProps> = ({
  children,
  direction = "row",
  justify = "start",
  align = "start",
  gap = "md",
  wrap = false,
  className = "",
}) => {
  const directionClasses: Record<string, string> = {
    row: "flex-row",
    col: "flex-col",
  };

  const justifyClasses: Record<string, string> = {
    start: "justify-start",
    center: "justify-center",
    end: "justify-end",
    between: "justify-between",
    around: "justify-around",
    evenly: "justify-evenly",
  };

  const alignClasses: Record<string, string> = {
    start: "items-start",
    center: "items-center",
    end: "items-end",
    stretch: "items-stretch",
  };

  const gapClasses: Record<string, string> = {
    none: "gap-0",
    sm: "gap-2",
    md: "gap-4",
    lg: "gap-6",
    xl: "gap-8",
  };

  return (
    <div
      className={cn(
        "flex",
        directionClasses[direction],
        justifyClasses[justify],
        alignClasses[align],
        gapClasses[gap],
        wrap && "flex-wrap",
        className
      )}
    >
      {children}
    </div>
  );
};

interface GridProps {
  children: React.ReactNode;
  columns?: number | { sm?: number; md?: number; lg?: number; xl?: number };
  gap?: "none" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

export const Grid: React.FC<GridProps> = ({
  children,
  columns = 1,
  gap = "md",
  className = "",
}) => {
  const gapClasses: Record<string, string> = {
    none: "gap-0",
    sm: "gap-2",
    md: "gap-4",
    lg: "gap-6",
    xl: "gap-8",
  };

  const getColumnsClass = () => {
    if (typeof columns === "number") {
      const colMap: Record<number, string> = {
        1: "grid-cols-1",
        2: "grid-cols-1 md:grid-cols-2",
        3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
        4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
        5: "grid-cols-1 md:grid-cols-3 lg:grid-cols-5",
        6: "grid-cols-1 md:grid-cols-3 lg:grid-cols-6",
      };
      return colMap[columns] || `grid-cols-${columns}`;
    }

    const parts: string[] = [];
    if (columns.sm) parts.push(`grid-cols-${columns.sm}`);
    if (columns.md) parts.push(`md:grid-cols-${columns.md}`);
    if (columns.lg) parts.push(`lg:grid-cols-${columns.lg}`);
    if (columns.xl) parts.push(`xl:grid-cols-${columns.xl}`);
    
    if (parts.length === 0) return "grid-cols-1";
    
    return parts.join(" ");
  };

  return (
    <div
      className={cn(
        "grid",
        getColumnsClass(),
        gapClasses[gap],
        className
      )}
    >
      {children}
    </div>
  );
};

interface GridResponsiveProps {
  children: React.ReactNode;
  columns?: { sm?: number; md?: number; lg?: number; xl?: number };
  gap?: "none" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

export const GridResponsive: React.FC<GridResponsiveProps> = ({
  children,
  columns = { sm: 1, md: 2, lg: 3 },
  gap = "md",
  className = "",
}) => {
  const gapClasses: Record<string, string> = {
    none: "gap-0",
    sm: "gap-2",
    md: "gap-4",
    lg: "gap-6",
    xl: "gap-8",
  };

  const parts: string[] = [];
  if (columns.sm) parts.push(`grid-cols-${columns.sm}`);
  if (columns.md) parts.push(`md:grid-cols-${columns.md}`);
  if (columns.lg) parts.push(`lg:grid-cols-${columns.lg}`);
  if (columns.xl) parts.push(`xl:grid-cols-${columns.xl}`);

  return (
    <div
      className={cn(
        "grid",
        parts.join(" "),
        gapClasses[gap],
        className
      )}
    >
      {children}
    </div>
  );
};

const LayoutComponents = {
  Container,
  Section,
  Flex,
  Grid,
  GridResponsive,
};

export default LayoutComponents;
