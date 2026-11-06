"use client";

import { useState, useEffect, type CSSProperties } from "react";
import Link from "next/link";
import {
  Home, MapPin, Pencil, Save, X, Eye, EyeOff, ExternalLink,
  Bed, Bath, Info, Trash2, DoorOpen, BellRing, Receipt, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import { Reveal, CountUp } from "@/components/motion";
import { cn } from "@/lib/utils";
import {
  PanelHeader, PanelBody, SectionTitle, Panel, Notice, controlClass,
} from "./panel-ui";
import { createClient } from "@/lib/supabase-client";
import RendimientoSection, {
  type InterestedRequest,
  type ListingStat,
} from "./rendimiento-section";
import PublicarSection, {
  PublicarCta,
  type OwnerStatus,
} from "./publicar-section";

/** Mismas columnas que trae el servidor, para poder refrescar una fila entera. */
const ACC_COLUMNS =
  "id, title, type, price, city, rooms, bathrooms, rooms_available, status, created_at, images, is_paid";

interface Accommodation {
  id: string;
  title: string;
  type: string | null;
  price: number | null;
  city: string | null;
  rooms: number | null;
  bathrooms: number | null;
  /** Habitaciones libres cuando el piso se alquila por habitaciones. */
  rooms_available?: number | null;
  status: string | null;
  created_at: string;
  images: string[] | null;
  /** false = la ficha existe pero no se ve en Franky porque falta el pago. */
  is_paid: boolean | null;
}

/** Lo que devuelve set_accommodation_rental_mode (migración 169). */
interface RentalModeResult {
  ok: boolean;
  error?: string;
  mode?: "habitaciones" | "entero";
  avisados?: number;
  provincia?: string | null;
  visible?: boolean;
}

/** Campos que edita de verdad el formulario en línea. Nada más. */
interface EditData {
  title?: string;
  city?: string;
  price?: string;
  status?: string;
}

export default function PropietarioDashboard({
  userName,
  accommodations: initialAccommodations,
  stats,
  requests,
  maxListings = null,
}: {
  userName: string;
  accommodations: Accommodation[];
  stats: ListingStat[];
  requests: InterestedRequest[];
  /** Plazas del plan, si tiene uno. Null = sin plan (paga ficha a ficha). */
  maxListings?: number | null;
}) {
  const [accommodations, setAccommodations] = useState(initialAccommodations);
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<EditData>({});
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Mensaje de éxito con lo que ha pasado de verdad ("hemos avisado a 24
  // estudiantes de Alicante"): un cambio de modalidad sin feedback parece que
  // no ha hecho nada, y lo que el propietario quiere saber es si alguien se
  // va a enterar.
  const [actionOk, setActionOk] = useState<string | null>(null);

  // Cambio de modalidad (piso entero <-> por habitaciones): formulario en línea
  // igual que el de "editar datos básicos".
  const [modeId, setModeId] = useState<string | null>(null);
  const [modePrice, setModePrice] = useState("");
  const [modeRooms, setModeRooms] = useState("");
  const [modeSaving, setModeSaving] = useState(false);

  const abrirCambioModalidad = (acc: Accommodation) => {
    setEditId(null);
    setActionError(null);
    setActionOk(null);
    setModeId(acc.id);
    // Al pasar a habitaciones el precio es POR HABITACIÓN, así que no se
    // precarga el del piso entero: dejarlo puesto era el error más fácil.
    setModePrice(acc.type === "habitacion" && acc.price != null ? String(acc.price) : "");
    setModeRooms(String(acc.rooms_available ?? acc.rooms ?? 1));
  };

  /**
   * Pasar un piso a alquiler por habitaciones (o devolverlo a entero). Lo
   * hace la función de servidor set_accommodation_rental_mode (migración
   * 169), que además avisa a quien busca piso en la provincia y devuelve a
   * cuánta gente ha avisado.
   */
  const cambiarModalidad = async (acc: Accommodation, mode: "habitaciones" | "entero") => {
    const price = Number(modePrice);
    if (!Number.isFinite(price) || price <= 0) {
      setActionError(
        mode === "habitaciones"
          ? "Pon el precio de cada habitación (€/mes)."
          : "Pon el precio del piso entero (€/mes)."
      );
      return;
    }
    const rooms = Number(modeRooms);
    if (mode === "habitaciones" && (!Number.isInteger(rooms) || rooms < 1 || rooms > 99)) {
      setActionError("Indica cuántas habitaciones hay libres (de 1 a 99).");
      return;
    }

    setModeSaving(true);
    setActionError(null);
    setActionOk(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("set_accommodation_rental_mode", {
      p_id: acc.id,
      p_mode: mode,
      p_price: price,
      p_rooms_available: mode === "habitaciones" ? rooms : null,
    });
    const res = (data ?? null) as RentalModeResult | null;

    if (error || !res?.ok) {
      setModeSaving(false);
      if (error?.code === "PGRST202") {
        setActionError("Esta opción se está activando en el servidor. Inténtalo en unos minutos.");
      } else if (res?.error === "archivado") {
        setActionError("Este piso está retirado: no se puede cambiar su modalidad.");
      } else {
        setActionError("No se ha podido cambiar la modalidad. Inténtalo de nuevo.");
      }
      return;
    }

    // Releer la fila (tipo, precio y habitaciones libres los ha escrito el servidor).
    const { data: fila } = await supabase
      .from("accommodations")
      .select(ACC_COLUMNS)
      .eq("id", acc.id)
      .maybeSingle();
    setModeSaving(false);
    if (fila) {
      setAccommodations((prev) =>
        prev.map((a) => (a.id === acc.id ? (fila as unknown as Accommodation) : a))
      );
    }
    setModeId(null);

    if (mode === "habitaciones") {
      const n = res.avisados ?? 0;
      const zona = res.provincia ? `en ${res.provincia}` : "en tu zona";
      if (!res.visible) {
        setActionOk(
          `«${acc.title}» ya se alquila por habitaciones. Como ahora mismo no está publicado (oculto o pendiente de pago), avisaremos a quien busca piso ${zona} en cuanto se vea.`
        );
      } else if (n === 0) {
        setActionOk(
          `«${acc.title}» ya se alquila por habitaciones. Los avisos a quienes buscan ${zona} se procesan en segundo plano; el piso ya aparece en el catálogo.`
        );
      } else {
        setActionOk(
          `«${acc.title}» ya se alquila por habitaciones. Hemos avisado a ${n} ${n === 1 ? "estudiante que busca" : "estudiantes que buscan"} piso ${zona}.`
        );
      }
    } else {
      setActionOk(`«${acc.title}» vuelve a alquilarse como piso entero.`);
    }
  };

  // Estado del Plan Inmobiliarias. Decide si a este propietario se le ofrece
  // publicar o se le explica que necesita un plan. Hasta que llega, no se
  // enseña ninguna de las dos cosas.
  const [ownerStatus, setOwnerStatus] = useState<OwnerStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  useEffect(() => {
    let cancelado = false;
    fetch("/api/negocio/owner-status")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("owner-status"))))
      .then((json: OwnerStatus) => {
        if (!cancelado) setOwnerStatus(json);
      })
      .catch(() => {
        if (!cancelado) setStatusError(true);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  /**
   * Guarda los cuatro campos básicos. Con .select() de vuelta: un update sin
   * select devuelve OK aunque la RLS no haya tocado ninguna fila, y el panel se
   * quedaba tan ancho enseñando datos que no se habían guardado.
   */
  const handleSave = async (acc: Accommodation) => {
    const title = (editData.title ?? acc.title ?? "").trim();
    if (!title) {
      setActionError("El título no puede quedar vacío.");
      return;
    }

    const rawPrice = (editData.price ?? (acc.price != null ? String(acc.price) : "")).trim();
    const price = rawPrice === "" ? null : Number(rawPrice);
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      setActionError("El precio tiene que ser un número mayor o igual que cero.");
      return;
    }

    setSaving(true);
    setActionError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("accommodations")
      .update({
        title,
        city: (editData.city ?? acc.city ?? "").trim() || null,
        price,
        status: editData.status ?? acc.status ?? "active",
      })
      .eq("id", acc.id)
      .select(ACC_COLUMNS)
      .maybeSingle();

    setSaving(false);

    if (error || !data) {
      setActionError("No se han podido guardar los cambios. Inténtalo de nuevo.");
      return;
    }

    setAccommodations((prev) =>
      prev.map((a) => (a.id === acc.id ? (data as unknown as Accommodation) : a))
    );
    setEditId(null);
    setEditData({});
  };

  /** Activar / desactivar. No borra nada: la ficha sigue siendo tuya. */
  const toggleStatus = async (acc: Accommodation) => {
    const desactivar = acc.status === "active";
    if (
      desactivar &&
      !window.confirm(
        "¿Desactivar este piso? Dejará de verse en Franky y podrás volver a activarlo cuando quieras. Ojo: sigue ocupando una plaza de tu plan; para liberarla hay que retirarlo."
      )
    ) {
      return;
    }

    setActionError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("accommodations")
      .update({ status: desactivar ? "inactive" : "active" })
      .eq("id", acc.id)
      .select(ACC_COLUMNS)
      .maybeSingle();

    if (error || !data) {
      setActionError(
        desactivar
          ? "No se ha podido desactivar el piso. Inténtalo de nuevo."
          : "No se ha podido activar el piso. Inténtalo de nuevo."
      );
      return;
    }

    setAccommodations((prev) =>
      prev.map((a) => (a.id === acc.id ? (data as unknown as Accommodation) : a))
    );
  };

  /**
   * Retirar un piso: lo saca del catálogo y LIBERA su plaza de plan.
   *
   * No es un borrado de verdad a propósito. La ficha tiene contratos,
   * inquilinos y reservas de visita colgando con borrado en cascada: un DELETE
   * real destruiría contratos firmados y el rastro de los cobros, que hay que
   * conservar. La función de servidor archive_accommodation (migración 163)
   * marca la ficha como retirada y cierra lo que colgaba de ella.
   */
  const archivar = async (acc: Accommodation) => {
    if (
      !window.confirm(
        `¿Retirar «${acc.title}»? Desaparece del catálogo y libera una plaza de tu plan. No se puede deshacer: para volver a ofrecerlo habría que publicarlo de nuevo.`
      )
    ) {
      return;
    }

    setActionError(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("archive_accommodation", {
      p_id: acc.id,
      p_reason: null,
    });

    const res = data as
      | { ok: boolean; error?: string; bloqueos?: string[] }
      | null;

    if (error || !res?.ok) {
      if (res?.error === "tiene_cosas_vivas") {
        const lista = (res.bloqueos ?? []).join(", ");
        setActionError(
          `No puedes retirar este piso todavía: tiene ${lista} en marcha. Cancélalos o espera a que terminen.`
        );
      } else {
        setActionError("No se ha podido retirar el piso. Inténtalo de nuevo.");
      }
      return;
    }

    setAccommodations((prev) => prev.filter((a) => a.id !== acc.id));
  };

  // Un piso solo lo ven los estudiantes si está activo Y pagado (la RLS y el
  // trigger de facturación lo exigen), así que contarlos como "activos" a secas
  // era mentirle al propietario.
  const publicados = accommodations.filter(
    (a) => a.status === "active" && a.is_paid !== false
  ).length;
  const sinPagar = accommodations.filter(
    (a) => a.status === "active" && a.is_paid === false
  ).length;
  const ocultos = accommodations.length - publicados;

  const statusBadge = (acc: Accommodation) => {
    if (acc.status === "active" && acc.is_paid === false) {
      return <Badge variant="warning">Falta el pago</Badge>;
    }
    switch (acc.status) {
      case "active":
        return <Badge variant="success">Publicado</Badge>;
      case "inactive":
        return <Badge variant="outline">Oculto</Badge>;
      // Sin caso "reserved": la tabla solo admite active / inactive / rented,
      // así que ese estado nunca ha podido guardarse y el badge no se pintaba.
      case "rented":
        return <Badge variant="default">Alquilado</Badge>;
      default:
        return <Badge variant="outline">Sin estado</Badge>;
    }
  };

  const metricas = [
    {
      label: maxListings ? `Pisos (de ${maxListings} plazas)` : "Pisos",
      value: accommodations.length,
      title:
        "Todos tus pisos ocupan plaza del plan, estén publicados u ocultos. Para liberar una hay que retirar el piso.",
    },
    {
      label: "Publicados",
      value: publicados,
      title: "Activos y con el pago al día: son los que ven los estudiantes",
    },
    {
      label: "Ocultos",
      value: ocultos,
      title: "Inactivos o pendientes de pago: no se ven en Franky",
    },
  ];

  return (
    <div className="min-h-screen bg-bg-primary">
      <PanelHeader
        wide
        title={<>Hola, {userName}</>}
        description="Gestiona tus propiedades en Franky: visitas, solicitudes, inquilinos y contratos."
        actions={
          /* Enlace inverso al panel comercial. Los dos paneles son de la
             misma persona y hasta ahora no se enlazaban entre sí: desde aquí
             no había forma de llegar a la facturación ni a publicar una
             ficha nueva sin escribir la URL a mano. */
          <Button asChild variant="outline" className="group">
            <Link href="/negocio/dashboard" title="Facturación, suscripciones y alta de fichas">
              <Receipt className="h-4 w-4" strokeWidth={1.75} />
              <span className="hidden sm:inline">Facturación y fichas</span>
              <span className="sm:hidden">Facturación</span>
              <ArrowRight className="h-4 w-4 arrow-nudge" />
            </Link>
          </Button>
        }
      />

      <PanelBody wide className="space-y-12">
        {/* Métricas: rejilla de definiciones con la cifra grande. */}
        <Reveal>
          <dl className="grid grid-cols-3 divide-x divide-border rounded-2xl border border-border">
            {metricas.map((m) => (
              <div key={m.label} className="px-4 py-5 sm:px-6" title={m.title}>
                <dt className="eyebrow truncate">{m.label}</dt>
                <dd className="mt-2 font-heading text-3xl font-extrabold tracking-tight text-text-primary tabular sm:text-4xl">
                  <CountUp value={m.value} />
                </dd>
              </div>
            ))}
          </dl>
          {sinPagar > 0 && (
            <Notice tone="warning" className="mt-4">
              {sinPagar === 1
                ? "Tienes 1 piso que no se ve en Franky porque falta completar el pago."
                : `Tienes ${sinPagar} pisos que no se ven en Franky porque falta completar el pago.`}{" "}
              <Link href="/negocio/dashboard" className="font-semibold text-text-primary link-underline">
                Completar el pago
              </Link>
            </Notice>
          )}
        </Reveal>

        {/* Rendimiento por piso */}
        <RendimientoSection stats={stats} requests={requests} />

        {/* Publicar: el alta vive en /negocio/registro, aquí solo se explica */}
        <Reveal as="section">
          <SectionTitle eyebrow="Alta" title="Publicar un piso" className="mb-4" />
          <PublicarSection status={ownerStatus} loadError={statusError} />
        </Reveal>

        <Reveal as="section">
          <SectionTitle
            eyebrow="Gestión"
            title="Mis propiedades"
            description="Aquí se gestionan los pisos que ya tienes publicados."
            className="mb-4"
          />

          {actionError && (
            <Notice tone="error" className="mb-4">
              {actionError}
            </Notice>
          )}
          {actionOk && (
            <Notice tone="success" icon={BellRing} className="mb-4" onClose={() => setActionOk(null)}>
              {actionOk}
            </Notice>
          )}

          {/* Listings */}
          {accommodations.length === 0 ? (
            <Panel>
              <EmptyState
                icon={Home}
                title="Todavía no tienes ningún piso"
                description="Los pisos se dan de alta en el formulario de publicación (fotos y vídeos, universidad cercana, características, preferencias de inquilino). Cuando publiques uno aparecerá aquí para que gestiones sus visitas, solicitudes y contratos."
              >
                <div className="mt-6 flex justify-center">
                  <PublicarCta status={ownerStatus} />
                </div>
              </EmptyState>
            </Panel>
          ) : (
            <ul className="space-y-3">
              {accommodations.map((acc, i) => {
                const cover = acc.images?.[0] ?? null;
                const visible = acc.status === "active" && acc.is_paid !== false;
                const editando = editId === acc.id || modeId === acc.id;
                return (
                  <li
                    key={acc.id}
                    style={{ "--i": i } as CSSProperties}
                    className={cn(
                      "animate-list-in rounded-2xl border border-border bg-bg-primary p-4 shadow-card transition-[border-color,box-shadow] duration-200 sm:p-5",
                      editando ? "border-text-primary/20" : "hover:border-text-primary/15"
                    )}
                  >
                    {modeId === acc.id ? (
                      <div className="animate-step-in">
                        {acc.type === "habitacion" ? (
                          <>
                            <h3 className="font-heading text-base font-bold text-text-primary">
                              Volver a alquilar el piso entero
                            </h3>
                            <p className="mt-1 flex items-start gap-1.5 text-sm text-text-muted">
                              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                              El anuncio pasa a ser de piso completo con el precio que pongas.
                              A quien busca no se le avisa de esto.
                            </p>
                            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                              <Field id={`mode-price-${acc.id}`} label="Precio del piso entero (€/mes)">
                                <Input
                                  id={`mode-price-${acc.id}`}
                                  type="number"
                                  min={1}
                                  max={99999999}
                                  value={modePrice}
                                  onChange={(e) => setModePrice(e.target.value)}
                                  placeholder="900"
                                />
                              </Field>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                              <Button size="sm" variant="dark" loading={modeSaving} onClick={() => cambiarModalidad(acc, "entero")}>
                                <Home className="h-3.5 w-3.5" /> {modeSaving ? "Guardando…" : "Alquilar entero"}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setModeId(null)}>
                                <X className="h-3.5 w-3.5" /> Cancelar
                              </Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <h3 className="font-heading text-base font-bold text-text-primary">
                              Alquilar por habitaciones
                            </h3>
                            <p className="mt-1 flex items-start gap-1.5 text-sm text-text-muted">
                              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                              El anuncio pasa a ofrecerse por habitaciones, con precio por
                              habitación. Al guardar avisamos a los estudiantes que buscan
                              piso en tu provincia. Puedes volver a piso entero cuando quieras.
                            </p>
                            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                              <Field id={`mode-price-${acc.id}`} label="Precio por habitación (€/mes)">
                                <Input
                                  id={`mode-price-${acc.id}`}
                                  type="number"
                                  min={1}
                                  max={99999999}
                                  value={modePrice}
                                  onChange={(e) => setModePrice(e.target.value)}
                                  placeholder="350"
                                />
                              </Field>
                              <Field id={`mode-rooms-${acc.id}`} label="Habitaciones libres">
                                <Input
                                  id={`mode-rooms-${acc.id}`}
                                  type="number"
                                  min={1}
                                  max={99}
                                  value={modeRooms}
                                  onChange={(e) => setModeRooms(e.target.value)}
                                />
                              </Field>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                              <Button size="sm" variant="dark" loading={modeSaving} onClick={() => cambiarModalidad(acc, "habitaciones")}>
                                <DoorOpen className="h-3.5 w-3.5" /> {modeSaving ? "Guardando y avisando…" : "Alquilar por habitaciones y avisar"}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setModeId(null)}>
                                <X className="h-3.5 w-3.5" /> Cancelar
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    ) : editId === acc.id ? (
                      <div className="animate-step-in">
                        <h3 className="font-heading text-base font-bold text-text-primary">Editar datos básicos</h3>
                        <p className="mt-1 flex items-start gap-1.5 text-sm text-text-muted">
                          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                          <span>
                            Desde aquí solo se cambian el título, la ciudad, el
                            precio y el estado. Las fotos, la universidad cercana,
                            los m², las características y las preferencias de
                            inquilino se rellenaron al publicar el piso: para
                            cambiarlas, escríbenos desde{" "}
                            <Link href="/contacto" className="font-semibold text-text-primary link-underline">
                              contacto
                            </Link>
                            .
                          </span>
                        </p>
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                          <Field id={`title-${acc.id}`} label="Título">
                            <Input
                              id={`title-${acc.id}`}
                              value={editData.title ?? acc.title ?? ""}
                              onChange={(e) => setEditData((p) => ({ ...p, title: e.target.value }))}
                            />
                          </Field>
                          <Field id={`city-${acc.id}`} label="Ciudad">
                            <Input
                              id={`city-${acc.id}`}
                              value={editData.city ?? acc.city ?? ""}
                              onChange={(e) => setEditData((p) => ({ ...p, city: e.target.value }))}
                            />
                          </Field>
                          <Field id={`price-${acc.id}`} label="Precio €/mes">
                            <Input
                              id={`price-${acc.id}`}
                              type="number"
                              min={0}
                              value={editData.price ?? (acc.price != null ? String(acc.price) : "")}
                              onChange={(e) => setEditData((p) => ({ ...p, price: e.target.value }))}
                            />
                          </Field>
                          <Field id={`status-${acc.id}`} label="Estado">
                            <select
                              id={`status-${acc.id}`}
                              value={editData.status ?? acc.status ?? "active"}
                              onChange={(e) => setEditData((p) => ({ ...p, status: e.target.value }))}
                              className={controlClass}
                            >
                              <option value="active">Activo</option>
                              <option value="inactive">Inactivo</option>
                              <option value="reserved">Reservado</option>
                            </select>
                          </Field>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button size="sm" variant="dark" loading={saving} onClick={() => handleSave(acc)}>
                            <Save className="h-3.5 w-3.5" /> {saving ? "Guardando…" : "Guardar"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditId(null);
                              setEditData({});
                              setActionError(null);
                            }}
                          >
                            <X className="h-3.5 w-3.5" /> Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4">
                        {cover ? (
                          <div className="img-zoom h-16 w-16 shrink-0 overflow-hidden rounded-xl">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={cover} alt="" className="h-full w-full object-cover" />
                          </div>
                        ) : (
                          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-border bg-bg-secondary">
                            <Home className="h-6 w-6 text-text-muted" strokeWidth={1.5} />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate font-heading font-bold text-text-primary">{acc.title}</h3>
                            {statusBadge(acc)}
                            {acc.type === "habitacion" && (
                              <Badge variant="outline">
                                Por habitaciones
                                {acc.rooms_available ? ` · ${acc.rooms_available} libre${acc.rooms_available === 1 ? "" : "s"}` : ""}
                              </Badge>
                            )}
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                            {acc.city && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" strokeWidth={1.75} /> {acc.city}
                              </span>
                            )}
                            {acc.price != null && (
                              <span className="font-semibold text-text-primary tabular">
                                {acc.price} €/mes{acc.type === "habitacion" ? " por habitación" : ""}
                              </span>
                            )}
                            {acc.rooms != null && (
                              <span className="flex items-center gap-1 tabular">
                                <Bed className="h-3 w-3" strokeWidth={1.75} /> {acc.rooms}
                              </span>
                            )}
                            {acc.bathrooms != null && (
                              <span className="flex items-center gap-1 tabular">
                                <Bath className="h-3 w-3" strokeWidth={1.75} /> {acc.bathrooms}
                              </span>
                            )}
                            {visible && (
                              <Link
                                href={`/alojamiento/${acc.id}`}
                                className="group inline-flex items-center gap-1 font-medium text-text-primary link-underline"
                              >
                                Ver ficha
                                <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
                              </Link>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-0.5">
                          {/* Estudios y residencias no se parten en habitaciones. */}
                          {(acc.type === "piso_completo" || acc.type === "habitacion") && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => abrirCambioModalidad(acc)}
                              title={
                                acc.type === "habitacion"
                                  ? "Volver a alquilar el piso entero"
                                  : "Alquilar por habitaciones y avisar a quien busca piso"
                              }
                            >
                              {acc.type === "habitacion" ? (
                                <Home className="h-4 w-4" strokeWidth={1.75} />
                              ) : (
                                <DoorOpen className="h-4 w-4" strokeWidth={1.75} />
                              )}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => {
                              setModeId(null);
                              setEditId(acc.id);
                              setEditData({});
                              setActionError(null);
                            }}
                            title="Editar datos básicos"
                          >
                            <Pencil className="h-4 w-4" strokeWidth={1.75} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => toggleStatus(acc)}
                            title={acc.status === "active" ? "Desactivar" : "Activar"}
                          >
                            {acc.status === "active" ? (
                              <EyeOff className="h-4 w-4" strokeWidth={1.75} />
                            ) : (
                              <Eye className="h-4 w-4" strokeWidth={1.75} />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="hover:text-error"
                            onClick={() => archivar(acc)}
                            title="Retirar el piso y liberar su plaza del plan"
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Reveal>
      </PanelBody>
    </div>
  );
}
