"use client";
import WorkspaceEntryLinks from './WorkspaceEntryLinks';

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Menu, X, User, LogOut, Heart, ChevronDown, GraduationCap, Home, Beer, Newspaper, Bell, Shield, MessageCircle, Flame, Ticket, Building2, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase-client";
import { useSession } from "@/components/SessionProvider";
import { isNonStudentRole } from "@/lib/roles";
import ThemeToggle from "@/components/ThemeToggle";
import { usePathname } from "next/navigation";
import { posicionPanel } from "@/components/navbar-dropdown-position";
import MobileTabBar from "@/components/MobileTabBar";
import { buttonVariants } from "@/components/ui/button";

// `open: true` = accesible sin cuenta. El visitante anónimo ve SOLO esos
// enlaces: antes no veía ninguno (el nav entero estaba tras `user &&`), así que
// alguien que llegaba de Google a /carreras no tenía forma de ir a /becas salvo
// bajando al footer. Y enseñarle enlaces que rebotan al login es peor todavía.
type MenuItem = {
  name: string;
  path: string;
  desc: string;
  highlight?: boolean;
  open?: boolean;
};

const menuItems: { title: string; icon: React.ReactNode; items: MenuItem[] }[] = [
  // Decisión de IA de navegación (24-jul-2026): el navbar enseña lo esencial y
  // el resto vive donde se descubre investigando.
  //   - "Comparar unis" salió del menú: ahora es un CTA dentro de /universidades.
  //   - "Carreras" salió del menú (solapaba con Notas de corte, que ya lista
  //     todas las titulaciones). En agosto de 2026 el listado /carreras se
  //     borró del todo y redirige a /notas-corte; solo siguen vivas las fichas
  //     /carreras/[slug], que tienen contenido propio.
  //   - "Nota media", "Mercado" y "Comunidades" viven en el menú del perfil.
  {
    title: 'Universidad',
    icon: <GraduationCap className="w-4 h-4" />,
    items: [
      { name: 'Notas de corte', path: '/notas-corte', desc: 'Calcula tus posibilidades', open: true },
      { name: 'Universidades', path: '/universidades', desc: 'Encuentra y compara unis', open: true },
      { name: 'Becas y ayudas', path: '/becas', desc: 'Convocatorias, requisitos y BecarIA', highlight: true, open: true },
      { name: 'Test vocacional', path: '/test-vocacional', desc: 'Descubre tu vocación', open: true }
    ]
  },
  {
    title: 'Alojamiento',
    icon: <Home className="w-4 h-4" />,
    items: [
      { name: 'Buscar piso', path: '/alojamiento', desc: 'Encuentra tu nuevo hogar', open: true },
      { name: 'RoomieMatch', path: '/roomie-match', desc: 'Conecta con compañeros' },
      { name: 'Mis visitas', path: '/mis-visitas', desc: 'Reservas y devoluciones de vivienda' }
    ]
  },
  {
    title: 'Vida social',
    icon: <Beer className="w-4 h-4" />,
    items: [
      // "Noticias" duplicaba el enlace suelto "Novedades" (misma página).
      { name: 'Zonas de ocio', path: '/ocio', desc: 'Los mejores lugares', open: true },
      { name: 'Eventos', path: '/eventos', desc: 'No te pierdas nada', open: true },
      { name: 'Crush', path: '/crush', desc: 'Intercambia Instagram con tu uni' }
    ]
  }
];

/**
 * Menú del propietario/inmobiliaria: viene a publicar pisos y a gestionar sus
 * visitas, así que becas, notas de corte, test vocacional, roomie o crush solo
 * le estorban.
 */
const OWNER_MENU: typeof menuItems = [
  {
    title: "Alojamiento",
    icon: <Home className="w-4 h-4" />,
    items: [
      { name: "Mis pisos", path: "/propietario/dashboard", desc: "Visitas, interesados y cobros" },
      { name: "Publicar un piso", path: "/negocio/registro?type=housing", desc: "Sube tu piso al catálogo", open: true },
      { name: "Buscar piso", path: "/alojamiento", desc: "Mira lo que publica la competencia", open: true },
      { name: "Plan Inmobiliarias", path: "/negocio/propietario", desc: "Hasta 40 pisos con una cuota", open: true },
      { name: "Franky Pro", path: "/pro/demo-inmobiliaria", desc: "Prueba el nuevo panel: interesados, cartera e inquilinos", open: true },
    ],
  },
];

/**
 * Menú del gestor de universidad. Antes recibía el del propietario, así que le
 * ofrecíamos "Publicar un piso" y "Plan Inmobiliarias" (que no son lo suyo) y
 * un "Mi panel" que apuntaba a /propietario/dashboard, ruta que el middleware
 * le rebota a la home por no tener el rol propietario: un enlace muerto en el
 * único menú que veía.
 */
const UNI_ADMIN_MENU: typeof menuItems = [
  {
    title: "Mi universidad",
    icon: <GraduationCap className="w-4 h-4" />,
    items: [
      { name: "Mi panel", path: "/uni", desc: "Métricas de tu campus y tu ficha" },
      { name: "Universidades colaboradoras", path: "/colaboradores", desc: "El programa de colaboración", open: true },
      { name: "Todas las universidades", path: "/universidades", desc: "El catálogo público", open: true },
      { name: "Notas de corte", path: "/notas-corte", desc: "Lo que consultan tus futuros alumnos", open: true },
    ],
  },
];

/**
 * Secciones visibles según la sesión y el tipo de cuenta, sin apartados que
 * queden vacíos.
 */
function visibleMenu(isAuthed: boolean, role?: string | null) {
  if (isAuthed && role === "propietario") return OWNER_MENU;
  if (isAuthed && role === "university_admin") return UNI_ADMIN_MENU;
  if (isAuthed) return menuItems;
  return menuItems
    .map((m) => ({ ...m, items: m.items.filter((i) => i.open) }))
    .filter((m) => m.items.length > 0);
}

/** Enlace de la barra de escritorio: texto plano, activo en color de texto. */
const NAV_LINK =
  "flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13.5px] font-medium whitespace-nowrap shrink-0 transition-[color,background-color] duration-200";
const NAV_LINK_IDLE = "text-text-secondary hover:text-text-primary hover:bg-bg-secondary";
const NAV_LINK_ACTIVE = "text-text-primary bg-bg-secondary";

/** Icono de acción (campana, chats, favoritos, perfil) de la barra. */
const ICON_BTN =
  "relative flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition-[color,background-color,transform] duration-200 hover:bg-bg-secondary hover:text-text-primary active:scale-95";

/** Fila del menú móvil. */
const MOBILE_ROW =
  "flex items-center gap-3 px-4 py-3 rounded-xl border border-border-light text-sm font-semibold text-text-primary transition-colors hover:bg-bg-secondary active:bg-bg-tertiary";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  // Sesión y rol vienen del contexto compartido: el navbar hacía su propio
  // getUser() más una consulta a profiles en cada carga, duplicando lo que ya
  // resolvían AuthGatePopup y LazyChrome.
  // `loading` cubre sesión Y rol: sin leerlo, el primer pintado de CADA página
  // enseñaba el menú de anónimo ("Iniciar sesión / Empezar Gratis") a quien
  // tiene sesión, y el de estudiante a un propietario, antes de cambiar de
  // golpe. Mientras carga se pinta un esqueleto del mismo tamaño.
  const { user, role, loading, signOut: sessionSignOut } = useSession();
  const [scrolled, setScrolled] = useState(false);
  // La barra se esconde al bajar y reaparece al subir: deja la pantalla
  // entera al contenido mientras lees y vuelve en cuanto la buscas.
  const [hidden, setHidden] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
  // Referencias a los botones del menú: el panel se pinta fuera del <nav> y
  // necesita medir su botón para colocarse debajo.
  const botonesRef = useRef<(HTMLButtonElement | null)[]>([]);
  // Margen de gracia al cerrar. El panel vive en un portal, así que botón y
  // panel son árboles DOM distintos: al pasar el ratón del uno al otro SIEMPRE
  // hay un mouseleave por el camino. Cerrar en ese mismo instante hacía
  // imposible llegar a las opciones (el menú "no aguantaba"); ahora el cierre
  // espera unos ms y entrar en el panel (o en otro botón) lo cancela.
  const cierreTimer = useRef<number | null>(null);
  const abrirMenu = (index: number) => {
    if (cierreTimer.current !== null) {
      window.clearTimeout(cierreTimer.current);
      cierreTimer.current = null;
    }
    setActiveDropdown(index);
  };
  const cerrarMenuConGracia = () => {
    if (cierreTimer.current !== null) window.clearTimeout(cierreTimer.current);
    cierreTimer.current = window.setTimeout(() => {
      cierreTimer.current = null;
      setActiveDropdown(null);
    }, 180);
  };
  const cerrarMenuYa = () => {
    if (cierreTimer.current !== null) {
      window.clearTimeout(cierreTimer.current);
      cierreTimer.current = null;
    }
    setActiveDropdown(null);
  };
  useEffect(() => () => {
    if (cierreTimer.current !== null) window.clearTimeout(cierreTimer.current);
  }, []);
  const [mounted, setMounted] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [unreadChats, setUnreadChats] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let lastY = window.scrollY;
    let raf = 0;
    const handleScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        setScrolled(y > 12);
        // Solo se esconde bajando y pasado el primer tramo; cualquier subida
        // la devuelve. Con un desplegable abierto nunca se esconde.
        const delta = y - lastY;
        if (y < 80) setHidden(false);
        else if (delta > 6) setHidden(true);
        else if (delta < -4) setHidden(false);
        lastY = y;
      });
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => {
      window.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Close menu on route change
  useEffect(() => {
    setOpen(false);
    setHidden(false);
  }, [pathname]);

  // Lock body scroll while the mobile menu is open
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    if (open) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Cerrar el menú móvil con Escape y atrapar el foco dentro mientras esté
  // abierto. Estaba marcado como role="dialog" aria-modal pero el tabulador se
  // escapaba al contenido de detrás, que es justo lo que aria-modal promete que
  // no pasa: un lector de pantalla se perdía fuera del menú.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          '[role="dialog"] a[href], [role="dialog"] button:not([disabled]), [role="dialog"] input, [role="dialog"] [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !active || !list.includes(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    // Llevar el foco al primer elemento del menú al abrirlo.
    const id = window.setTimeout(() => focusables()[0]?.focus(), 30);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(id);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  // Nº de chats con mensajes sin leer → badge en "Mensajes". Se refresca al
  // cambiar de ruta (p. ej. al salir de /chats) y cada minuto.
  useEffect(() => {
    if (!user) {
      setUnreadChats(0);
      return;
    }
    const supabase = createClient();
    let active = true;
    const fetchUnread = async () => {
      // No sondear cuando la pestaña está oculta: evita RPCs de pestañas abandonadas.
      if (typeof document !== "undefined" && document.hidden) return;
      const { data, error } = await supabase.rpc("get_unread_chat_count");
      if (active && !error && typeof data === "number") setUnreadChats(data);
    };
    fetchUnread();
    const id = setInterval(fetchUnread, 60000);
    // Al volver a la pestaña, refrescar de inmediato (la cuenta puede estar obsoleta).
    const onVisible = () => {
      if (!document.hidden) fetchUnread();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, pathname]);

  const handleSignOut = sessionSignOut;
  // Propietario y gestor de universidad: nada de contenido de campus
  // (FOMO, Crush, Novedades, entradas, favoritos). Se aplica IGUAL en
  // escritorio y en el menú ☰; antes el ☰ no filtraba y les seguía enseñando
  // justo lo que el de escritorio les quitaba.
  const esProfesional = isNonStudentRole(role);

  const badge = (n: number, className?: string) =>
    n > 0 ? (
      <span
        className={cn(
          "absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-violet px-1 text-[10px] font-bold text-white ring-2 ring-bg-primary",
          className
        )}
      >
        {n > 9 ? "9+" : n}
      </span>
    ) : null;

  return (
    <header
      className={cn(
        "fixed top-0 w-full z-50 border-b transition-[transform,background-color,border-color,box-shadow] duration-300 ease-[var(--ease-out-quart)]",
        scrolled
          ? "glass border-border/70 shadow-[0_1px_0_rgba(18,16,25,0.02)]"
          : "bg-bg-primary/85 backdrop-blur-sm border-transparent",
        hidden && activeDropdown === null && !open && "-translate-y-full"
      )}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* gap + shrink-0 en los tres bloques: sin esto la navegación crecía
            por encima del logo (que va con z-50) y se solapaban, que es lo que
            pasó al meter el selector de tema en la barra. */}
        <div className="flex items-center justify-between gap-3 h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group shrink-0" aria-label="Franky, inicio">
            <Image
              src="/img/franky-icon.png"
              alt=""
              width={32}
              height={32}
              className="rounded-[10px] transition-transform duration-300 ease-[var(--ease-spring)] group-hover:rotate-[-6deg] group-hover:scale-105"
            />
            <span className="text-[19px] font-bold font-heading tracking-tight text-text-primary">
              Franky
            </span>
          </Link>

          {/* Desktop Navigation. Se pinta SIEMPRE: el visitante anónimo ve las
              secciones públicas (catálogos + FOMO), que es justo lo que ha
              venido a buscar. Los enlaces que exigen cuenta se filtran en
              `visibleMenu`, así nadie choca contra el muro por sorpresa. */}
          {/* overflow-x-clip (NO overflow-hidden): recorta el desbordamiento
              lateral que solapaba con el logo, pero deja salir los
              desplegables, que se abren hacia abajo. La navegación de
              escritorio empieza en 1440px; por debajo se usa el menú ☰, que
              lleva TODOS los enlaces. */}
          <nav
            className="hidden min-[1440px]:flex items-center gap-0.5 min-w-0"
            aria-label="Navegación principal"
          >
            {loading ? (
              // Estado neutro: mismo alto y ancho aproximado que el menú real,
              // para no dar el salto al resolverse la sesión.
              <div className="flex items-center gap-1.5" aria-hidden="true">
                {[72, 112, 110, 106, 96].map((w) => (
                  <div
                    key={w}
                    className="h-8 rounded-lg skeleton-shimmer"
                    style={{ width: w }}
                  />
                ))}
              </div>
            ) : (
            <>
            {!esProfesional && (
            <Link
              href="/fomo"
              aria-current={pathname.startsWith('/fomo') ? "page" : undefined}
              className={cn(
                NAV_LINK,
                "mr-1 border",
                pathname.startsWith('/fomo')
                  ? "border-violet/30 bg-violet-50 text-violet-deep"
                  : "border-border text-text-primary hover:border-violet/40 hover:bg-violet-50 hover:text-violet-deep"
              )}
            >
              <Flame className="w-4 h-4 shrink-0 text-violet" />
              <span>FOMO</span>
            </Link>
            )}

            {visibleMenu(!!user, role).map((menu, index) =>
              /* Un desplegable que se abre para enseñar UN solo enlace es un
                 clic de más y parece que falta contenido. Cuando solo queda
                 uno, se pinta como enlace directo. */
              menu.items.length === 1 ? (
                <Link
                  key={menu.title}
                  href={menu.items[0].path}
                  aria-current={pathname === menu.items[0].path ? "page" : undefined}
                  className={cn(NAV_LINK, pathname === menu.items[0].path ? NAV_LINK_ACTIVE : NAV_LINK_IDLE)}
                >
                  <span>{menu.items[0].name}</span>
                </Link>
              ) : (
              <div
                key={menu.title}
                className="group shrink-0"
                onMouseEnter={() => abrirMenu(index)}
                onMouseLeave={cerrarMenuConGracia}
                // Con teclado el ratón nunca sale del contenedor: sin esto, el
                // desplegable abierto con Enter se quedaba abierto al tabular
                // fuera. `relatedTarget` distingue salir del bloque de moverse
                // a otro sitio; el panel vive en un portal (NO es hijo de este
                // div), así que hay que comprobarlo aparte o tabular hacia el
                // propio menú lo cerraba.
                onBlur={(e) => {
                  const destino = e.relatedTarget as HTMLElement | null;
                  if (
                    !e.currentTarget.contains(destino) &&
                    !destino?.closest?.("[data-navbar-panel]")
                  ) {
                    setActiveDropdown((current) => (current === index ? null : current));
                  }
                }}
              >
                <button
                  type="button"
                  ref={(el) => { botonesRef.current[index] = el; }}
                  aria-haspopup="menu"
                  aria-expanded={activeDropdown === index}
                  onClick={() => (activeDropdown === index ? cerrarMenuYa() : abrirMenu(index))}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") cerrarMenuYa();
                  }}
                  className={cn(
                    NAV_LINK,
                    activeDropdown === index || menu.items.some((i) => pathname === i.path)
                      ? NAV_LINK_ACTIVE
                      : NAV_LINK_IDLE
                  )}
                >
                  <span>{menu.title}</span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 text-text-muted transition-transform duration-200",
                      activeDropdown === index ? 'rotate-180' : ''
                    )}
                  />
                </button>

                {/* El panel se pinta en <body>, no aquí dentro: el <nav> lleva
                    `overflow-x: clip` y lo recortaba. Con un portal ningún
                    contenedor puede cortarlo y se recoloca solo si no cabe. */}
                {mounted && activeDropdown === index && createPortal(
                  <div
                    data-navbar-panel
                    className="fixed w-72 z-[60] pt-2"
                    style={posicionPanel(botonesRef.current[index])}
                    // Listeners NATIVOS, no props onMouseEnter/onMouseLeave de
                    // React: el panel cuelga de document.body por el portal y
                    // la sintetización de enter/leave de React a través de
                    // portales no es de fiar aquí.
                    ref={(el) => {
                      if (el && !el.dataset.hoverListo) {
                        el.dataset.hoverListo = "1";
                        el.addEventListener("mouseenter", () => abrirMenu(index));
                        el.addEventListener("mouseleave", cerrarMenuConGracia);
                      }
                    }}
                  >
                  <div className="bg-bg-primary rounded-2xl shadow-float border border-border p-1.5 overflow-hidden animate-dropdown">
                    {menu.items.map((item, itemIndex) => (
                      <Link
                        key={itemIndex}
                        href={item.path}
                        prefetch={false}
                        aria-current={pathname === item.path ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-xl group/item transition-colors duration-150",
                          pathname === item.path ? "bg-bg-secondary" : "hover:bg-bg-secondary"
                        )}
                        onClick={cerrarMenuYa}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-text-primary">
                            {item.name}
                            {item.highlight && (
                              <span className="rounded-md bg-violet-50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-violet-deep">
                                IA
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-xs text-text-muted line-clamp-1">
                            {item.desc}
                          </span>
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-text-muted opacity-0 -translate-x-1 transition-[opacity,transform] duration-200 group-hover/item:opacity-100 group-hover/item:translate-x-0" aria-hidden="true" />
                      </Link>
                    ))}
                  </div>
                  </div>,
                  document.body
                )}
              </div>
              )
            )}

            {!esProfesional && (
            <Link
              href="/noticias"
              aria-current={pathname === '/noticias' ? "page" : undefined}
              className={cn(NAV_LINK, pathname === '/noticias' ? NAV_LINK_ACTIVE : NAV_LINK_IDLE)}
            >
              <span>Novedades</span>
            </Link>
            )}
            </>
            )}
          </nav>

          {/* Right Actions. min-w reservado en los tres estados (cargando,
              anónimo y con sesión) para que el logo y la navegación no se
              muevan al resolverse la sesión. */}
          <div className="hidden min-[1440px]:flex items-center justify-end gap-1 pl-4 ml-2 shrink-0">
            {/* Tema: solo desde 2xl; por debajo sigue en el menú ☰ y en el pie. */}
            <ThemeToggle className="hidden 2xl:inline-flex mr-2" />
            {loading ? (
              <div className="flex items-center gap-1" aria-hidden="true">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-9 w-9 rounded-lg skeleton-shimmer" />
                ))}
              </div>
            ) : user ? (
              <>
                {(role === "admin" || role === "analyst") && (
                  <Link
                    href={role === "admin" ? "/admin" : "/admin/analytics"}
                    // Sin prefetch a propósito: el panel exige aal2, así que el
                    // prefetch en una sesión aal1 guarda en el Router Cache la
                    // redirección a /perfil/seguridad y, tras meter el código,
                    // el panel "no cargaba" hasta recargar a mano.
                    prefetch={false}
                    className="mr-1 flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:border-text-primary/30 hover:bg-bg-secondary"
                    title={role === "admin" ? "Panel Admin" : "Analytics y moderación"}
                  >
                    <Shield className="h-3.5 w-3.5" />
                    <span className="hidden xl:inline">{role === "admin" ? "Admin" : "Panel"}</span>
                  </Link>
                )}
                <WorkspaceEntryLinks userId={user.id} />
                {role === "university_admin" && (
                  <Link
                    href="/uni"
                    className="mr-1 flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:border-text-primary/30 hover:bg-bg-secondary"
                    title="Panel de universidad"
                  >
                    <GraduationCap className="h-3.5 w-3.5" />
                    <span className="hidden xl:inline">Mi universidad</span>
                  </Link>
                )}
                {role === "propietario" && (
                  <Link
                    href="/propietario/dashboard"
                    className="mr-1 flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:border-text-primary/30 hover:bg-bg-secondary"
                    title="Panel de propietario"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    <span className="hidden xl:inline">Mis pisos</span>
                  </Link>
                )}
                <Link href="/notificaciones" className={ICON_BTN} aria-label="Notificaciones">
                  <Bell className="h-[18px] w-[18px]" />
                </Link>
                <Link
                  href="/chats"
                  className={ICON_BTN}
                  title="Chats"
                  aria-label={unreadChats > 0 ? `Chats, ${unreadChats} sin leer` : "Chats"}
                >
                  <MessageCircle className="h-[18px] w-[18px]" />
                  {badge(unreadChats)}
                </Link>
                {/* Favoritos guarda eventos, pisos y anuncios de estudiante:
                    no pinta nada en una cuenta de propietario o de gestor. */}
                {!esProfesional && (
                <Link href="/favoritos" className={ICON_BTN} aria-label="Favoritos">
                  <Heart className="h-[18px] w-[18px]" />
                </Link>
                )}
                <Link href="/perfil" className={ICON_BTN} title="Mi perfil" aria-label="Mi perfil">
                  <User className="h-[18px] w-[18px]" />
                </Link>
                <button
                  onClick={handleSignOut}
                  className={cn(ICON_BTN, "hover:text-error hover:bg-rose-50 dark:hover:bg-rose-950/30")}
                  aria-label="Cerrar sesión"
                >
                  <LogOut className="h-[18px] w-[18px]" />
                </button>
              </>
            ) : (
              <div className="flex items-center gap-1.5">
                <Link href="/login" className={cn(NAV_LINK, NAV_LINK_IDLE)}>
                  Iniciar sesión
                </Link>
                <Link href="/registro" className={cn(buttonVariants({ size: "sm" }), "h-9 px-4 text-[13px] rounded-lg")}>
                  Empezar gratis
                  <ArrowUpRight className="h-3.5 w-3.5 arrow-nudge" />
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setOpen(!open)}
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={open}
            className="min-[1440px]:hidden relative z-50 flex h-10 w-10 items-center justify-center rounded-lg text-text-primary transition-colors hover:bg-bg-secondary active:scale-95"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Overlay — compact accordion */}
      {open && mounted && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menú de navegación"
          className="min-[1440px]:hidden fixed inset-0 z-[100] bg-bg-primary overflow-y-auto animate-fade-in"
        >
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between px-5 h-16 bg-bg-primary/90 backdrop-blur-md border-b border-border-light">
            <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-2.5">
              <Image src="/img/franky-icon.png" alt="" width={28} height={28} className="rounded-lg" />
              <span className="text-base font-bold font-heading tracking-tight text-text-primary">Franky</span>
            </Link>
            <button
              onClick={() => setOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-bg-secondary active:scale-95"
              aria-label="Cerrar menú"
            >
              <X className="h-5 w-5 text-text-secondary" />
            </button>
          </div>

          <div className="px-4 py-4 space-y-2">
            {/* Anonymous users see signup CTAs instead of a menu they can't use
                yet. Con `loading` no se pinta nada. */}
            {!user && !loading && (
              <div className="space-y-2 mb-4 animate-list-in" style={{ ["--i" as string]: 0 }}>
                <Link
                  href="/registro"
                  onClick={() => setOpen(false)}
                  className={cn(buttonVariants({ size: "lg" }), "w-full")}
                >
                  Crear cuenta gratis
                </Link>
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}
                >
                  Iniciar sesión
                </Link>
              </div>
            )}

            {/* FOMO CTA. También para anónimos: /fomo y /fomo/[slug] son
                públicos (landing con vista previa). Fuera para propietarios y
                gestores, igual que en escritorio. */}
            {!esProfesional && (
            <Link
              href="/fomo"
              onClick={() => setOpen(false)}
              className={cn(MOBILE_ROW, "animate-list-in border-violet/25 bg-violet-50 text-violet-deep")}
              style={{ ["--i" as string]: 1 }}
            >
              <Flame className="h-4 w-4 shrink-0 text-violet" />
              <span>{user ? "FOMO · Tu universidad" : "FOMO · Qué se cuece en tu campus"}</span>
              <ArrowRight className="ml-auto h-4 w-4 text-violet" />
            </Link>
            )}

            {/* Crush CTA — acceso directo: es uno de los pilares del pivote. */}
            {user && !esProfesional && (
            <Link
              href="/crush"
              onClick={() => setOpen(false)}
              className={cn(MOBILE_ROW, "animate-list-in")}
              style={{ ["--i" as string]: 2 }}
            >
              <Heart className="h-4 w-4 shrink-0 text-fuchsia" />
              <span>Crush · Intercambia Instagram</span>
              <ArrowRight className="ml-auto h-4 w-4 text-text-muted" />
            </Link>
            )}

            {/* Acordeón de secciones. Para anónimos se muestran solo las
                entradas públicas. */}
            {(loading ? [] : visibleMenu(!!user, role)).map((menu, mi) =>
              menu.items.length === 1 ? (
                <Link
                  key={menu.title}
                  href={menu.items[0].path}
                  onClick={() => setOpen(false)}
                  className={cn(MOBILE_ROW, "animate-list-in")}
                  style={{ ["--i" as string]: 3 + mi }}
                >
                  <span className="text-text-muted">{menu.icon}</span>
                  <span>{menu.items[0].name}</span>
                </Link>
              ) : (
              <div
                key={menu.title}
                className="rounded-xl overflow-hidden border border-border-light animate-list-in"
                style={{ ["--i" as string]: 3 + mi }}
              >
                <button
                  onClick={() => setOpenSection(openSection === menu.title ? null : menu.title)}
                  aria-expanded={openSection === menu.title}
                  aria-controls={`menu-seccion-${menu.title}`}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-bg-secondary transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-text-muted">{menu.icon}</span>
                    <span className="text-sm font-semibold text-text-primary">{menu.title}</span>
                  </div>
                  <ChevronDown className={cn(
                    "h-4 w-4 text-text-muted transition-transform duration-300 ease-[var(--ease-out-quart)]",
                    openSection === menu.title ? "rotate-180" : ""
                  )} />
                </button>
                <div
                  id={`menu-seccion-${menu.title}`}
                  className={cn(
                  "grid transition-[grid-template-rows] duration-300 ease-[var(--ease-out-quart)]",
                  openSection === menu.title ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                )}>
                  <div className="overflow-hidden">
                    <div className="border-t border-border-light px-2 py-1.5 space-y-0.5">
                      {menu.items.map((item) => (
                        <Link
                          key={item.path}
                          href={item.path}
                          onClick={() => setOpen(false)}
                          className="flex flex-col px-3 py-2.5 rounded-lg hover:bg-bg-secondary active:bg-bg-tertiary transition-colors"
                        >
                          <span className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
                            {item.name}
                            {item.highlight && (
                              <span className="rounded-md bg-violet-50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-violet-deep">IA</span>
                            )}
                          </span>
                          <span className="text-xs text-text-muted mt-0.5">{item.desc}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              )
            )}

            {/* Novedades — solo para cuentas de estudiante con sesión */}
            {user && !esProfesional && (
            <Link
              href="/noticias"
              onClick={() => setOpen(false)}
              className={cn(MOBILE_ROW, "animate-list-in")}
              style={{ ["--i" as string]: 7 }}
            >
              <Newspaper className="h-4 w-4 text-text-muted shrink-0" />
              <span>Novedades</span>
            </Link>
            )}

            {/* Auth */}
            <div className="pt-3 border-t border-border-light space-y-2">
              {loading ? (
                <div className="space-y-2" aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-12 rounded-xl skeleton-shimmer" />
                  ))}
                </div>
              ) : user ? (
                <>
                  <Link href="/perfil" onClick={() => setOpen(false)} className={MOBILE_ROW}>
                    <User className="h-4 w-4 text-text-muted shrink-0" />
                    <span>Mi perfil</span>
                  </Link>
                  <Link href="/chats" onClick={() => setOpen(false)} className={MOBILE_ROW}>
                    <MessageCircle className="h-4 w-4 text-text-muted shrink-0" />
                    <span>Mis chats</span>
                    {unreadChats > 0 && (
                      <span className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-violet px-1.5 text-xs font-bold text-white">
                        {unreadChats > 9 ? "9+" : unreadChats}
                      </span>
                    )}
                  </Link>
                  <Link href="/notificaciones" onClick={() => setOpen(false)} className={MOBILE_ROW}>
                    <Bell className="h-4 w-4 text-text-muted shrink-0" />
                    <span>Notificaciones</span>
                  </Link>
                  {/* Entradas y favoritos son de estudiante. */}
                  {!esProfesional && (
                  <>
                  <Link href="/mis-entradas" onClick={() => setOpen(false)} className={MOBILE_ROW}>
                    <Ticket className="h-4 w-4 text-text-muted shrink-0" />
                    <span>Mis entradas</span>
                  </Link>
                  <Link href="/favoritos" onClick={() => setOpen(false)} className={MOBILE_ROW}>
                    <Heart className="h-4 w-4 text-text-muted shrink-0" />
                    <span>Favoritos</span>
                  </Link>
                  </>
                  )}
                  {(role === "admin" || role === "analyst") && (
                    <Link
                      href={role === "admin" ? "/admin" : "/admin/analytics"}
                      prefetch={false}
                      onClick={() => setOpen(false)}
                      className={cn(buttonVariants({ variant: "outline" }), "w-full")}
                    >
                      <Shield className="h-4 w-4" /> {role === "admin" ? "Panel Admin" : "Panel"}
                    </Link>
                  )}
                  <WorkspaceEntryLinks userId={user.id} onNavigate={() => setOpen(false)} />
                  {role === "university_admin" && (
                    <Link href="/uni" onClick={() => setOpen(false)} className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
                      <GraduationCap className="h-4 w-4" /> Mi universidad
                    </Link>
                  )}
                  {role === "propietario" && (
                    <Link href="/propietario/dashboard" onClick={() => setOpen(false)} className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
                      <Building2 className="h-4 w-4" /> Mis pisos
                    </Link>
                  )}
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-error font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-colors"
                  >
                    <LogOut className="h-4 w-4" /> Cerrar sesión
                  </button>
                </>
              ) : (
                <div className="flex gap-2">
                  <Link href="/login" onClick={() => setOpen(false)} className={cn(buttonVariants({ variant: "outline" }), "flex-1")}>
                    Iniciar sesión
                  </Link>
                  <Link href="/registro" onClick={() => setOpen(false)} className={cn(buttonVariants(), "flex-1")}>
                    Empezar gratis
                  </Link>
                </div>
              )}

              {/* Tema: en móvil el footer queda muy abajo, así que el selector
                  tiene que estar también aquí para que se encuentre. */}
              <div className="mt-4 flex items-center justify-between border-t border-border-light pt-4">
                <span className="text-sm font-medium text-text-secondary">Tema</span>
                <ThemeToggle />
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Barra inferior de móvil (ver MobileTabBar). Se monta aquí y no en el
          layout raíz; el contador de chats sin leer se comparte con el icono
          de arriba. */}
      {mounted && createPortal(<MobileTabBar unreadChats={unreadChats} />, document.body)}
    </header>
  );
}
