"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

// Pestañas (v3): segmento neutro con la activa en blanco y sombra hairline.
// La variante `underline` (TabsList className="tabs-underline") pinta una
// línea bajo la activa, para cabeceras de ficha.
const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex items-center gap-1 rounded-xl bg-bg-secondary p-1",
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium text-text-muted",
      "transition-[color,background-color,box-shadow] duration-200 ease-[var(--ease-out-quart)]",
      "hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/30 disabled:pointer-events-none disabled:opacity-50",
      "data-[state=active]:bg-bg-primary data-[state=active]:text-text-primary data-[state=active]:shadow-[0_1px_2px_rgba(18,16,25,0.08),0_0_0_1px_rgba(18,16,25,0.04)] data-[state=active]:font-semibold cursor-pointer",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("mt-4 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary data-[state=active]:animate-fade-in", className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
