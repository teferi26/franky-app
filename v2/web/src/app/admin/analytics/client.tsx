"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, BarChart3, Download, Pause, Play } from "lucide-react";
import AnalyticsTabsNav, { readAnalyticsTab, type TabKey } from "./components/AnalyticsTabsNav";
import AnalyticsFiltersBar from "./components/AnalyticsFiltersBar";
import AnalyticsScopeNotice from './components/AnalyticsScopeNotice';
import { useAnalyticsFilters } from "./hooks/useAnalyticsFilters";
import { useAnalyticsExport } from "./hooks/useAnalyticsExport";
import { withAccountScope } from "@/components/AccountScope";
import { Button } from "@/components/ui/button";
import { PanelHeader, Notice } from "../components/panel-ui";

// Cada pestaña arrastra recharts (unos 100 KB gzip). Se cargan con next/dynamic
// para que ese coste solo se pague al entrar en la pestaña correspondiente, no
// en el chunk inicial del panel.
const tabLoading = (
  <div className="skeleton-shimmer h-64 rounded-2xl border border-border bg-bg-secondary/50" />
);
const OverviewTab = dynamic(() => import("./tabs/OverviewTab"), { loading: () => tabLoading });
const DemographicsTab = dynamic(() => import("./tabs/DemographicsTab"), { loading: () => tabLoading });
const AcademicTab = dynamic(() => import("./tabs/AcademicTab"), { loading: () => tabLoading });
const EngagementTab = dynamic(() => import("./tabs/EngagementTab"), { loading: () => tabLoading });
const MonetizationTab = dynamic(() => import("./tabs/MonetizationTab"), { loading: () => tabLoading });
const ContentTab = dynamic(() => import("./tabs/ContentTab"), { loading: () => tabLoading });
const SecurityTab = dynamic(() => import("./tabs/SecurityTab"), { loading: () => tabLoading });
const GrowthTab = dynamic(() => import("./tabs/GrowthTab"), { loading: () => tabLoading });

function TabContent({ tab }: { tab: TabKey }) {
  switch (tab) {
    case "overview":
      return <OverviewTab />;
    case "demographics":
      return <DemographicsTab />;
    case "academic":
      return <AcademicTab />;
    case "engagement":
      return <EngagementTab />;
    case "monetization":
      return <MonetizationTab />;
    case "content":
      return <ContentTab />;
    case "security":
      return <SecurityTab />;
    case "growth":
      return <GrowthTab />;
  }
}

function AnalyticsClient() {
  const searchParams = useSearchParams();
  const tab = readAnalyticsTab(searchParams.get('tab'));

  const selectTab = useCallback((k: TabKey) => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", k);
    window.history.replaceState(null, "", url.toString());
  }, []);

  const [refreshKey, setRefreshKey] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const { queryString } = useAnalyticsFilters();
  const { downloading, message, downloadSnapshot } = useAnalyticsExport(queryString);

  // Auto-refresh cada 60s cuando está activo. Se omite si la pestaña está en
  // segundo plano para no relanzar las rutas de analytics sin que nadie las vea.
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setRefreshKey((k) => k + 1);
    }, 60_000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <PanelHeader
        eyebrow="Analítica"
        title={
          <span className="inline-flex items-center gap-2.5">
            <BarChart3 className="h-7 w-7 text-violet" strokeWidth={1.75} /> Análisis de Franky
          </span>
        }
        description="Conoce quién llega, qué estudia y cómo utiliza Franky. Cada sección indica qué filtros aplica y qué periodo representa."
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin"><ArrowLeft className="mr-2 h-4 w-4" strokeWidth={1.75} /> Volver al panel</Link>
            </Button>
            <Button
              type="button"
              variant={autoRefresh ? "default" : "outline"}
              size="sm"
              onClick={() => setAutoRefresh((v) => !v)}
              aria-pressed={autoRefresh}
              title={autoRefresh ? "Actualización cada minuto mientras esta página está visible" : "Activar actualización cada minuto"}
            >
              {autoRefresh ? <Pause className="mr-2 h-3.5 w-3.5" strokeWidth={1.75} /> : <Play className="mr-2 h-3.5 w-3.5" strokeWidth={1.75} />}
              Actualizar cada minuto
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={downloadSnapshot} disabled={downloading}>
              <Download className="mr-2 h-3.5 w-3.5" strokeWidth={1.75} />
              {downloading ? "Preparando análisis…" : "Exportar análisis"}
            </Button>
          </>
        }
        className="mb-8"
      />

      {message && <Notice role="status" className="mb-6">{message}</Notice>}

      <AnalyticsFiltersBar onRefresh={() => setRefreshKey((k) => k + 1)} />

      <AnalyticsTabsNav active={tab} onChange={selectTab} />
      <AnalyticsScopeNotice key={tab} tab={tab} />

      <Suspense fallback={<div className="skeleton-shimmer h-64 rounded-2xl border border-border bg-bg-secondary/50" />}>
        <div key={refreshKey}>
          <TabContent tab={tab} />
        </div>
      </Suspense>
    </div>
  );
}

export default withAccountScope(AnalyticsClient);
