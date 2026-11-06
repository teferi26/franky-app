import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import WorkspaceAccess from "@/components/sector-sites/workspace-access";
import {
  SectorHeader,
  SectorFooter,
} from "@/components/sector-sites/site-chrome";
import { getSectorSite } from "@/lib/sector-sites/catalog";
import { getSectorSlugFromHost } from "@/lib/sector-sites/routing";

export const metadata: Metadata = {
  title: "Accede a tu espacio | Franky",
  robots: { index: false, follow: false },
};

export default async function AccessPage({
  params,
}: {
  params: Promise<{ sector: string }>;
}) {
  const site = getSectorSite((await params).sector);
  if (!site) notFound();
  const host = (await headers()).get("host");
  const onSubdomain = getSectorSlugFromHost(host) === site.slug;
  const homeHref = onSubdomain ? "/" : `/sectores/${site.slug}`;
  return (
    <div className="bg-bg-primary text-text-primary">
      <SectorHeader name={site.name} homeHref={homeHref} />
      <WorkspaceAccess
        vertical={site.vertical}
        sectorName={site.name}
        homeHref={homeHref}
        accessHref={onSubdomain ? "/acceder" : `${homeHref}/acceder`}
      />
      <SectorFooter name={site.name} />
    </div>
  );
}
