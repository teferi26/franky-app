"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const NotasCorteCalculatorWrapper = dynamic(
  () => import("@/components/NotasCorteCalculator"),
  {
    loading: () => (
      <div className="rounded-2xl border border-border-light p-6 sm:p-8" aria-busy="true">
        <div className="mb-8 flex items-center justify-center gap-1">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-1">
              <Skeleton className="h-8 w-8 rounded-full" />
              {i < 4 && <Skeleton className="h-0.5 w-8 sm:w-12" />}
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="mt-4 h-12 w-52" />
        </div>
      </div>
    ),
    ssr: false,
  }
);

export default NotasCorteCalculatorWrapper;
