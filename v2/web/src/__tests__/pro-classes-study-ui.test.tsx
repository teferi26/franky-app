import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ContinuityToday,
  CourseForecastPanel,
  GroupStudy,
  MemberGrades,
  MemberLevel,
  RecoveryRulesCard,
  ReinforcementToday,
} from "@/components/pro/sections/classes/study";
import {
  BirthdayExtras,
  BirthdaysToday,
  CompanyInvoice,
  ErasmusCard,
  MaterialNeedsPanel,
} from "@/components/pro/sections/classes/leisure";
import { buildDemo } from "@/lib/pro/demo";
import { PRO_VERTICALS } from "@/lib/pro/verticals";
import { addDays, localDate } from "@/lib/pro/format";
import { patchTypeExtra, roomBookingOf } from "@/lib/pro/classes-ops";
import { groupStudents } from "@/lib/pro/classes-play";
import { needsReinforcement } from "@/lib/pro/classes-study";
import type { ProData, ProVerticalId } from "@/lib/pro/types";

const mocks = vi.hoisted(() => ({
  usePro: vi.fn(),
  update: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
}));
vi.mock("@/lib/pro/store", () => ({
  usePro: mocks.usePro,
  localId: (prefix: string) => `${prefix}-local`,
}));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ success: mocks.success, info: mocks.info }),
}));

// Jueves 24 de septiembre de 2026, 11:30 en Madrid.
const now = new Date("2026-09-24T09:30:00.000Z");
const today = localDate(now);

function mount(vertical: ProVerticalId, data: ProData) {
  mocks.usePro.mockReturnValue({
    data,
    now,
    demo: true,
    vertical: PRO_VERTICALS[vertical],
    spaceId: data.space.id,
    update: mocks.update,
    can: () => true,
    pending: false,
  });
}

function noLongDashes(container: HTMLElement) {
  expect(container.textContent ?? "").not.toMatch(/[\u2014\u2013]/);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.update.mockResolvedValue(true);
});
afterEach(cleanup);

describe("academia", () => {
  it("la ficha enseña las notas y apunta una nueva", () => {
    const data = buildDemo("academy", now);
    const member = needsReinforcement(data, "ct1")[0].member;
    mount("academy", data);
    const { container } = render(<MemberGrades memberId={member.id} />);
    expect(screen.getByText("Notas y simulacros")).toBeTruthy();
    expect(screen.getByRole("img", { name: /Notas:/ })).toBeTruthy();
    noLongDashes(container);

    fireEvent.click(screen.getByRole("button", { name: /Apuntar nota/ }));
    fireEvent.change(screen.getByLabelText("Tema"), { target: { value: "Series de potencias" } });
    fireEvent.change(screen.getByLabelText("Nota"), { target: { value: "4,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nota" }));
    expect(mocks.update).toHaveBeenCalledWith("grade.add", expect.any(Function));
    const recipe = mocks.update.mock.calls[0][1] as (d: ProData) => ProData;
    const saved = recipe(data).classExtras?.grades?.find((g) => g.topic === "Series de potencias");
    expect(saved?.grade).toBe(4.5);
  });

  it("la pestaña Grupo tiene refuerzo, material y grupo siguiente", () => {
    const data = buildDemo("academy", now);
    const session = data.sessions.find((s) => s.classTypeId === "ct1")!;
    mount("academy", data);
    const { container } = render(<GroupStudy session={session} />);
    expect(screen.getByText("Necesitan refuerzo")).toBeTruthy();
    expect(screen.getByText("Apuntes de derivadas")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Enviar al grupo/ }).getAttribute("href")).toMatch(
      /^https:\/\/wa\.me\/\?text=/,
    );
    expect(screen.getByText("Al acabar, siguen en")).toBeTruthy();
    noLongDashes(container);
  });

  it("el nivel de idioma sugiere el grupo del nivel", () => {
    const data = buildDemo("academy", now);
    const member = groupStudents(data, "ct5")[0];
    mount("academy", data);
    render(<MemberLevel memberId={member.id} />);
    expect(screen.getByText("Nivel de idioma")).toBeTruthy();
    expect(screen.getByText("Inglés B2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Pasar a C1/ }));
    expect(mocks.update).toHaveBeenCalledWith("member.level", expect.any(Function));
  });

  it("Hoy propone el grupo siguiente cuando el examen está cerca", () => {
    const base = buildDemo("academy", now);
    const data = patchTypeExtra(base, "ct4", { examOn: addDays(today, 3) });
    mount("academy", data);
    const { container } = render(<ContinuityToday />);
    expect(screen.getByText("Siguiente asignatura")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /Proponer/ }).length).toBeGreaterThan(0);
    noLongDashes(container);
  });

  it("Hoy avisa de quién va flojo antes del examen", () => {
    const data = buildDemo("academy", now);
    mount("academy", data);
    render(<ReinforcementToday />);
    expect(screen.getByText("Van flojos antes del examen")).toBeTruthy();
  });

  it("previsión del curso y norma de recuperaciones", () => {
    const data = buildDemo("academy", now);
    mount("academy", data);
    const { container } = render(
      <>
        <CourseForecastPanel />
        <RecoveryRulesCard />
      </>,
    );
    expect(screen.getByText("El curso entero")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Previsión por meses" }).children.length).toBe(12);
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(mocks.update).toHaveBeenCalledWith("recovery.rules", expect.any(Function));
    noLongDashes(container);
  });
});

describe("ocio", () => {
  it("Hoy trae cumpleaños que vuelven, material y Erasmus", () => {
    const data = buildDemo("culture", now);
    mount("culture", data);
    const onOffer = vi.fn();
    const { container } = render(
      <>
        <BirthdaysToday />
        <MaterialNeedsPanel />
        <ErasmusCard onOffer={onOffer} />
      </>,
    );
    expect(screen.getByText("Cumpleaños que vuelven")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /Felicitar/ }).length).toBe(2);
    expect(screen.getByText("Material de la semana")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ofrecerla a Erasmus" }));
    expect(onOffer).toHaveBeenCalledWith(expect.objectContaining({ what: expect.stringContaining("en inglés") }));
    noLongDashes(container);
  });

  it("la reserva de empresa emite su factura", () => {
    const data = buildDemo("culture", now);
    const booking = data.bookings.find((b) => roomBookingOf(data, b.id).company)!;
    const session = data.sessions.find((s) => s.id === booking.sessionId)!;
    mount("culture", data);
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<CompanyInvoice session={session} booking={booking} />);
    expect(screen.getByText("Levante Digital Consultores S.L.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Emitir factura/ }));
    expect(mocks.update).toHaveBeenCalledWith("room.invoice", expect.any(Function));
    expect(open).toHaveBeenCalled();
    open.mockRestore();
  });

  it("los extras del cumpleaños se marcan en la reserva", () => {
    const base = buildDemo("culture", now);
    const booking = base.bookings[0];
    const data: ProData = {
      ...base,
      classExtras: {
        ...base.classExtras!,
        roomBookings: { ...base.classExtras!.roomBookings, [booking.id]: { birthdayOf: "Irene" } },
      },
    };
    mount("culture", data);
    render(<BirthdayExtras bookingId={booking.id} />);
    fireEvent.click(screen.getByRole("button", { name: "Tarta propia" }));
    expect(mocks.update).toHaveBeenCalledWith("room.extras", expect.any(Function));
  });
});
