"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Bell,
  Check,
  ChevronsUpDown,
  ExternalLink,
  MoreHorizontal,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usePro } from "@/lib/pro/store";
import type { ProSectionId } from "@/lib/pro/types";
import {
  PRO_VERTICALS,
  VERTICAL_ORDER,
  demoSpaceId,
} from "@/lib/pro/verticals";
import { relative } from "@/lib/pro/format";
import { SECTION_META, sectionLabel } from "./sections";
import { Drawer, Empty, FixedPortal } from "./kit";

export function sectionHref(spaceId: string, section: ProSectionId) {
  return section === "hoy" ? `/pro/${spaceId}` : `/pro/${spaceId}/${section}`;
}

function useActiveSection(spaceId: string): ProSectionId {
  const pathname = usePathname() ?? "";
  const rest = pathname
    .replace(`/pro/${spaceId}`, "")
    .split("/")
    .filter(Boolean)[0];
  return (rest as ProSectionId) || "hoy";
}

/* ------------------------------------------------------------------ */

export function ProShell({ children }: { children: React.ReactNode }) {
  const { spaceId, vertical, data, demo, canView, error, pending, refresh } =
    usePro();
  const active = useActiveSection(spaceId);
  const [switcher, setSwitcher] = React.useState(false);
  const [inboxOpen, setInboxOpen] = React.useState(false);
  const [more, setMore] = React.useState(false);
  const unread = data.inbox.filter((i) => !i.read).length;
  const nav = vertical.nav.filter((item) => canView(item.id));
  const primaryNav = vertical.mobileNav.filter(canView);
  const mobileNav = primaryNav.length
    ? primaryNav
    : nav.slice(0, 3).map((item) => item.id);

  React.useEffect(() => {
    setMore(false);
  }, [active]);

  return (
    <div className="min-h-dvh bg-bg-secondary/50 text-text-primary">
      {demo ? <DemoStrip /> : null}
      <div className="mx-auto flex max-w-[1600px]">
        {/* Barra lateral de escritorio */}
        <aside className="sticky top-0 hidden h-dvh w-[252px] shrink-0 flex-col border-r border-border bg-bg-primary lg:flex">
          <div className="flex items-center gap-2 px-5 pb-3 pt-5">
            <Link
              href="/pro"
              className="flex items-center gap-2 font-heading text-[1.05rem] font-extrabold tracking-[-0.02em]"
            >
              <Image
                src="/img/franky-icon.png"
                alt=""
                width={24}
                height={24}
                className="h-6 w-6"
              />
              Franky <span className="text-violet">Pro</span>
            </Link>
          </div>
          <div className="px-3">
            <SpaceButton onClick={() => setSwitcher(true)} />
          </div>
          <nav
            aria-label="Secciones"
            className="mt-3 flex-1 overflow-y-auto px-3 pb-4 pro-scroll"
          >
            <ul className="flex flex-col gap-0.5">
              {nav.map((item) => (
                <li key={item.id}>
                  <NavLink
                    spaceId={spaceId}
                    id={item.id}
                    active={active === item.id}
                  />
                </li>
              ))}
            </ul>
          </nav>
          <div className="border-t border-border-light px-4 py-3.5">
            <PublicProfileLink />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Barra superior */}
          <header className="sticky top-0 z-40 border-b border-border bg-bg-primary/90 backdrop-blur-md lg:border-b-0 lg:bg-transparent lg:backdrop-blur-none">
            <div className="flex h-14 items-center gap-2 px-4 sm:px-6 lg:h-16 lg:px-8">
              <button
                type="button"
                onClick={() => setSwitcher(true)}
                className="flex min-w-0 items-center gap-2 rounded-xl py-1.5 pr-2 text-left lg:hidden"
                aria-label="Cambiar de negocio"
              >
                <Image
                  src="/img/franky-icon.png"
                  alt=""
                  width={24}
                  height={24}
                  className="h-6 w-6 shrink-0"
                />
                <span className="min-w-0">
                  <span className="block truncate font-heading text-[0.95rem] font-bold leading-tight">
                    {data.space.name}
                  </span>
                  <span className="block truncate text-[0.7rem] text-text-muted">
                    {vertical.label}
                  </span>
                </span>
                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-text-muted" />
              </button>
              <div className="flex-1" />
              {demo ? (
                <button
                  type="button"
                  onClick={() => setInboxOpen(true)}
                  className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-bg-primary text-text-secondary transition-colors hover:text-text-primary"
                  aria-label={unread ? `Avisos, ${unread} sin leer` : "Avisos"}
                >
                  <Bell className="h-[1.1rem] w-[1.1rem]" strokeWidth={1.9} />
                  {unread ? (
                    <span className="absolute -right-1 -top-1 inline-flex h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-full bg-violet px-1 text-[0.65rem] font-bold text-white tabular">
                      {unread}
                    </span>
                  ) : null}
                </button>
              ) : null}
            </div>
          </header>

          <main
            id="pro-main"
            className="min-w-0 flex-1 px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-12 lg:pt-2"
          >
            {!demo && error ? (
              <div
                role="alert"
                className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-bg-primary px-4 py-3 text-sm"
              >
                <p className="min-w-0 flex-1 text-text-secondary">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={refresh}
                >
                  Actualizar
                </Button>
              </div>
            ) : null}
            {!demo && pending ? (
              <p role="status" className="mb-3 text-xs text-text-muted">
                Actualizando tu negocio
              </p>
            ) : null}
            <div key={active} className="animate-page-in">
              {children}
            </div>
          </main>
        </div>
      </div>

      {/* Barra inferior del móvil */}
      <FixedPortal>
        <nav
          aria-label="Secciones principales"
          className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-bg-primary/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
        >
          <ul className="mx-auto flex max-w-lg items-stretch justify-between px-2">
            {mobileNav.map((id) => {
              const Icon = SECTION_META[id].icon;
              const isActive = active === id;
              return (
                <li key={id} className="flex-1">
                  <Link
                    href={sectionHref(spaceId, id)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex h-16 flex-col items-center justify-center gap-1 text-[0.68rem] font-semibold transition-colors",
                      isActive ? "text-violet" : "text-text-muted",
                    )}
                  >
                    <Icon
                      className="h-[1.3rem] w-[1.3rem]"
                      strokeWidth={isActive ? 2.2 : 1.8}
                    />
                    <span className="max-w-[4.5rem] truncate">
                      {sectionLabel(vertical.id, id)}
                    </span>
                  </Link>
                </li>
              );
            })}
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setMore(true)}
                className={cn(
                  "flex h-16 w-full flex-col items-center justify-center gap-1 text-[0.68rem] font-semibold",
                  mobileNav.includes(active)
                    ? "text-text-muted"
                    : "text-violet",
                )}
              >
                <MoreHorizontal
                  className="h-[1.3rem] w-[1.3rem]"
                  strokeWidth={1.8}
                />
                Más
              </button>
            </li>
          </ul>
        </nav>
      </FixedPortal>

      <Drawer open={more} onOpenChange={setMore} title="Todas las secciones">
        <ul className="grid grid-cols-2 gap-2">
          {nav.map((item) => {
            const Icon = SECTION_META[item.id].icon;
            return (
              <li key={item.id}>
                <Link
                  href={sectionHref(spaceId, item.id)}
                  className={cn(
                    "flex h-full flex-col gap-2 rounded-2xl border p-3.5 text-sm transition-colors",
                    active === item.id
                      ? "border-violet bg-violet-50"
                      : "border-border hover:border-text-primary/20",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5",
                      active === item.id
                        ? "text-violet"
                        : "text-text-secondary",
                    )}
                    strokeWidth={1.8}
                  />
                  <span className="font-semibold">
                    {sectionLabel(vertical.id, item.id)}
                  </span>
                  <span className="text-xs leading-snug text-text-muted">
                    {SECTION_META[item.id].blurb}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-4">
          <PublicProfileLink />
        </div>
      </Drawer>

      <SpaceSwitcher open={switcher} onOpenChange={setSwitcher} />
      <InboxDrawer open={inboxOpen} onOpenChange={setInboxOpen} />
    </div>
  );
}

function NavLink({
  spaceId,
  id,
  active,
}: {
  spaceId: string;
  id: ProSectionId;
  active: boolean;
}) {
  const { vertical, data } = usePro();
  const Icon = SECTION_META[id].icon;
  const badge = navBadge(id, data);
  return (
    <Link
      href={sectionHref(spaceId, id)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[0.9rem] font-medium transition-colors",
        active
          ? "bg-bg-secondary text-text-primary"
          : "text-text-secondary hover:bg-bg-secondary/70 hover:text-text-primary",
      )}
    >
      {active ? (
        <span
          aria-hidden
          className="absolute left-0 top-2 h-6 w-[3px] rounded-r-full bg-violet"
        />
      ) : null}
      <Icon
        className={cn(
          "h-[1.1rem] w-[1.1rem]",
          active
            ? "text-violet"
            : "text-text-muted group-hover:text-text-secondary",
        )}
        strokeWidth={1.8}
      />
      <span className="flex-1 truncate">{sectionLabel(vertical.id, id)}</span>
      {badge ? (
        <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[0.68rem] font-bold text-violet-deep tabular">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

/** Números que merecen estar en el menú: cosas que esperan una respuesta. */
function navBadge(
  id: ProSectionId,
  data: ReturnType<typeof usePro>["data"],
): number | null {
  switch (id) {
    case "agenda":
    case "reservas":
      return (
        data.bookings.filter((b) => b.status === "requested").length || null
      );
    case "grupos":
      return (
        data.groupRequests.filter((g) => g.status === "new").length || null
      );
    case "interesados":
      return data.leads.filter((l) => l.stage === "new").length || null;
    case "inquilinos":
      return data.incidents.filter((i) => i.status === "open").length || null;
    case "moderacion":
      return (
        data.uniModeration.filter((m) => m.status === "pending").length || null
      );
    case "estudiantes":
      return (
        data.groupRequests.filter((g) => g.status === "new").length || null
      );
    default:
      return null;
  }
}

function SpaceButton({ onClick }: { onClick: () => void }) {
  const { data, vertical } = usePro();
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-border px-3 py-2.5 text-left transition-colors hover:border-text-primary/20"
    >
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-text-primary font-heading text-sm font-bold text-bg-primary">
        {data.space.name.slice(0, 1)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          {data.space.name}
        </span>
        <span className="block truncate text-xs text-text-muted">
          {vertical.label}
        </span>
      </span>
      <ChevronsUpDown className="h-4 w-4 shrink-0 text-text-muted" />
    </button>
  );
}

function PublicProfileLink() {
  const { data, demo } = usePro();
  if (
    !data.space.slug ||
    (!demo && data.space.publicProfile.published !== true)
  )
    return null;
  return (
    <a
      href={`/n/${data.space.slug}`}
      className="flex items-center justify-between gap-2 rounded-xl px-1 text-sm text-text-muted transition-colors hover:text-text-primary"
    >
      <span className="min-w-0">
        <span className="block text-xs">Tu ficha para estudiantes</span>
        <span className="block truncate font-semibold text-text-primary">
          franky.es/n/{data.space.slug}
        </span>
      </span>
      <ExternalLink className="h-4 w-4 shrink-0" strokeWidth={1.8} />
    </a>
  );
}

function DemoStrip() {
  const { vertical, resetDemo } = usePro();
  return (
    <div className="bg-text-primary text-bg-primary">
      <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-2 text-[0.8rem] sm:px-6 lg:px-8">
        <Sparkles
          className="h-3.5 w-3.5 shrink-0 text-violet-light"
          strokeWidth={2}
        />
        <p className="min-w-0 flex-1 truncate">
          Demo de {vertical.label.toLowerCase()}. Toca lo que quieras: los
          cambios se quedan en este dispositivo.
        </p>
        <button
          type="button"
          onClick={resetDemo}
          className="hidden items-center gap-1 font-semibold opacity-80 hover:opacity-100 sm:inline-flex"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reiniciar
        </button>
        <Link
          href="/pro/empezar"
          className="shrink-0 rounded-lg bg-bg-primary px-2.5 py-1 font-semibold text-text-primary"
        >
          Crear mi negocio
        </Link>
      </div>
    </div>
  );
}

function SpaceSwitcher({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { spaceId, demo, spaces } = usePro();
  const groups = VERTICAL_ORDER.reduce<Record<string, typeof VERTICAL_ORDER>>(
    (acc, id) => {
      const g = PRO_VERTICALS[id].group;
      (acc[g] ??= []).push(id);
      return acc;
    },
    {},
  );
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Cambiar de negocio"
      description={
        demo
          ? "Prueba la app de cada sector con datos de ejemplo."
          : "Negocios a los que tienes acceso con esta cuenta."
      }
    >
      <div className="flex flex-col gap-5">
        {!demo ? (
          <ul className="flex flex-col gap-1">
            {spaces.map((space) => (
              <li key={space.id}>
                <Link
                  href={`/pro/${space.id}`}
                  onClick={() => onOpenChange(false)}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-xl px-3 py-3 text-sm font-semibold",
                    space.id === spaceId
                      ? "bg-bg-secondary"
                      : "hover:bg-bg-secondary",
                  )}
                >
                  <span className="truncate">{space.name}</span>
                  {space.id === spaceId ? (
                    <Check className="h-4 w-4 shrink-0 text-violet" />
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          Object.entries(groups).map(([group, ids]) => (
            <div key={group}>
              <p className="eyebrow mb-2">{group}</p>
              <ul className="flex flex-col gap-1">
                {ids.map((id) => {
                  const v = PRO_VERTICALS[id];
                  const target = demoSpaceId(id);
                  const current = target === spaceId;
                  return (
                    <li key={id}>
                      <Link
                        href={`/pro/${target}`}
                        onClick={() => onOpenChange(false)}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
                          current ? "bg-violet-50" : "hover:bg-bg-secondary",
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">
                            {v.label}
                          </span>
                          <span className="block truncate text-xs text-text-muted">
                            {v.tagline}
                          </span>
                        </span>
                        {current ? (
                          <Check className="h-4 w-4 text-violet" />
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
        {demo ? (
          <p className="text-xs text-text-muted">
            ¿Ya tienes tu negocio en Franky?{" "}
            <Link href="/pro" className="font-semibold text-violet">
              Ver mis espacios
            </Link>
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}

function InboxDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data, update, spaceId, now, pending, can } = usePro();
  const items = [...data.inbox].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Avisos"
      description="Reservas, mensajes y lo que necesita tu respuesta."
      footer={
        items.some((i) => !i.read) ? (
          <button
            type="button"
            disabled={pending || !can("inbox.readAll")}
            onClick={() =>
              update("inbox.readAll", (d) => ({
                ...d,
                inbox: d.inbox.map((i) => ({ ...i, read: true })),
              }))
            }
            className="text-sm font-semibold text-violet"
          >
            Marcar todo como leído
          </button>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <Empty
          icon={Bell}
          title="Todo al día"
          body="Cuando entre una reserva o un mensaje, aparecerá aquí."
        />
      ) : (
        <ul className="-mx-2 flex flex-col">
          {items.map((it) => (
            <li key={it.id}>
              <Link
                href={
                  it.href ? sectionHref(spaceId, it.href as ProSectionId) : "#"
                }
                onClick={async () => {
                  if (
                    !(await update("inbox.read", (d) => ({
                      ...d,
                      inbox: d.inbox.map((i) =>
                        i.id === it.id ? { ...i, read: true } : i,
                      ),
                    })))
                  )
                    return;
                  onOpenChange(false);
                }}
                className="flex gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-bg-secondary"
              >
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    it.read ? "bg-transparent" : "bg-violet",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold">
                      {it.title}
                    </span>
                    <span className="shrink-0 text-xs text-text-muted">
                      {relative(it.at, now.getTime())}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-sm text-text-muted">
                    {it.body}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}

/** Esqueleto mientras se preparan los datos del espacio. */
export function ProShellSkeleton() {
  return (
    <div className="min-h-dvh bg-bg-secondary/50">
      <div className="mx-auto flex max-w-[1600px]">
        <aside className="hidden h-dvh w-[252px] shrink-0 border-r border-border bg-bg-primary lg:block" />
        <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="h-8 w-56 rounded-lg skeleton-shimmer" />
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-2xl skeleton-shimmer" />
            ))}
          </div>
          <div className="mt-6 h-80 rounded-2xl skeleton-shimmer" />
        </div>
      </div>
      <span className="sr-only">Cargando tu negocio</span>
    </div>
  );
}
