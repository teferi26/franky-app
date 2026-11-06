import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WaitlistOffer } from "@/components/professional/WaitlistOffer";
import { ProfessionalNotices } from "@/components/professional/ProfessionalNotices";
import type {
  ProfessionalBooking,
  ProfessionalNotice,
} from "../../../shared/professional-services";
const state = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/components/professional/useProfessionalRpc", () => ({
  useProfessionalRpc: () => state.rpc,
}));
const booking = {
  id: "booking",
  customer_user_id: "holder",
  organization_id: "org",
  status: "requested",
  waitlist_offer_status: "offered",
  waitlist_offer_version: 3,
  waitlist_offer_expires_at: new Date(Date.now() + 600000).toISOString(),
  total_cents: 2400,
  price_snapshot: { terms: "Avisar 24 horas antes" },
  timezone: "Atlantic/Canary",
} as ProfessionalBooking;
const notice = {
  id: "notice",
  booking_id: "booking",
  organization_id: "org",
  title: "Tienes una plaza",
  body: "Confirma antes del plazo.",
  read_at: null,
} as ProfessionalNotice;
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
beforeEach(() => {
  state.rpc.mockReset();
  state.rpc.mockResolvedValue({
    items: [notice],
    next_cursor: null,
    unread_count: 1,
  });
});
describe("waitlist consent and notices", () => {
  it("requires explicit agreement and sends the exact original price, version and terms", () => {
    const action = vi.fn();
    render(
      <WaitlistOffer
        booking={booking}
        busy={false}
        onAction={action}
        onRefresh={() => {}}
      />,
    );
    const button = screen.getByRole("button", { name: "Aceptar plaza" });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(button);
    expect(action).toHaveBeenCalledWith("accept_waitlist", {
      offer_version: 3,
      expected_total_cents: 2400,
      expected_terms: "Avisar 24 horas antes",
    });
  });
  it("resets agreement when the offered price changes", () => {
    const props = { busy: false, onAction: vi.fn(), onRefresh: vi.fn() };
    const { rerender } = render(<WaitlistOffer booking={booking} {...props} />);
    fireEvent.click(screen.getByRole("checkbox"));
    rerender(
      <WaitlistOffer booking={{ ...booking, total_cents: 2500 }} {...props} />,
    );
    expect(
      screen.getByRole("button", { name: "Aceptar plaza" }),
    ).toBeDisabled();
  });
  it("does not let staff accept on behalf of a registered holder", () => {
    render(
      <WaitlistOffer
        booking={booking}
        operator
        busy={false}
        onAction={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Aceptar plaza" })).toBeNull();
    expect(screen.getByText(/titular debe aceptar/)).toBeTruthy();
  });
  it("allows an operator to record an unregistered guest acceptance", () => {
    render(
      <WaitlistOffer
        booking={{ ...booking, customer_user_id: null }}
        operator
        busy={false}
        onAction={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(
      screen.getByLabelText(
        "El invitado acepta el precio y las condiciones indicados.",
      ),
    ).toBeTruthy();
  });
  it("an expired offer can only refresh, never claim a confirmed place", () => {
    render(
      <WaitlistOffer
        booking={{
          ...booking,
          waitlist_offer_expires_at: new Date(Date.now() - 1000).toISOString(),
        }}
        busy={false}
        onAction={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Aceptar plaza" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Actualizar reserva" }),
    ).toBeTruthy();
  });
  it("marks only the opened notice, after its authorized current booking loads", async () => {
    const opened = vi.fn().mockResolvedValue(undefined);
    render(<ProfessionalNotices owner="holder" onOpen={opened} />);
    await screen.findByText("1 sin leer");
    fireEvent.click(screen.getByText(/Avisos de reservas/));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Abrir reserva y marcar leído",
      }),
    );
    await waitFor(() =>
      expect(state.rpc).toHaveBeenCalledWith("professional_read_notice", {
        p_notice_id: "notice",
      }),
    );
    expect(opened).toHaveBeenCalledWith(notice);
    expect(state.rpc.mock.calls[0][1].p_organization_id).toBeNull();
  });
  it("a rejected access cannot mark a notice read", async () => {
    render(
      <ProfessionalNotices
        owner="holder"
        onOpen={vi.fn().mockRejectedValue(Error("professional_forbidden"))}
      />,
    );
    await screen.findByText("1 sin leer");
    fireEvent.click(screen.getByText(/Avisos de reservas/));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Abrir reserva y marcar leído",
      }),
    );
    await screen.findByRole("alert");
    expect(
      state.rpc.mock.calls.some((c) => c[0] === "professional_read_notice"),
    ).toBe(false);
  });
  it("does not carry late notices into the next mounted account", async () => {
    let finish!: (v: unknown) => void;
    state.rpc.mockImplementationOnce(
      () =>
        new Promise((r) => {
          finish = r;
        }),
    );
    const first = render(<ProfessionalNotices owner="old" onOpen={vi.fn()} />);
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    first.unmount();
    state.rpc.mockResolvedValue({
      items: [],
      next_cursor: null,
      unread_count: 0,
    });
    render(<ProfessionalNotices owner="new" onOpen={vi.fn()} />);
    await act(async () => {
      finish({ items: [notice], next_cursor: null, unread_count: 1 });
    });
    expect(screen.queryByText("Tienes una plaza")).toBeNull();
  });
});
