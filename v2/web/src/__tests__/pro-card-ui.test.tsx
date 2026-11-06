import { StrictMode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealCardValidation } from "@/lib/pro/card-validation";
import {
  cardMerchant,
  cardRequest,
  completedCardRequest,
  singleServiceInput,
} from "./fixtures/pro-card";

type AuthCallback = (
  event: string,
  session: { user: { id: string } } | null,
) => void;
const mocks = vi.hoisted(() => ({
  session: { user: { id: "user-a" } as { id: string } | null, loading: false },
  rpc: vi.fn<
    (name: string, args: Record<string, unknown>) => Promise<unknown>
  >(),
  api: vi.fn<() => Promise<unknown>>(),
  callbacks: new Set<AuthCallback>(),
}));
vi.mock("@/components/SessionProvider", () => ({
  useSession: () => mocks.session,
}));
vi.mock("@/components/card/card-client", () => ({
  useCardClient: () => ({ rpc: mocks.rpc, api: mocks.api }),
}));
vi.mock("@/lib/pro/card-scanner", () => ({
  useProCardScanner: () => ({ video: { current: null }, error: null }),
}));
vi.mock("@/lib/supabase-client", () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: (callback: AuthCallback) => {
        mocks.callbacks.add(callback);
        return {
          data: {
            subscription: {
              unsubscribe: () => mocks.callbacks.delete(callback),
            },
          },
        };
      },
    },
  }),
}));

const services = [
  {
    id: "service-a",
    name: "Servicio del catálogo",
    category: "Cortes",
    durationMin: 30,
    priceCents: 2000,
    staffIds: [],
    online: true,
  },
];
const view = () => (
  <RealCardValidation organizationId="org-a" services={services} />
);

async function requestConfirmation() {
  await screen.findByLabelText("Servicio");
  fireEvent.change(
    screen.getByLabelText("Código compartido por el estudiante"),
    { target: { value: singleServiceInput.credential } },
  );
  fireEvent.change(screen.getByLabelText("Servicio"), {
    target: { value: "service-a" },
  });
  fireEvent.click(
    screen.getByLabelText(
      "El importe corresponde a una sola unidad del servicio elegido",
    ),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Pedir confirmación al estudiante" }),
  );
  await screen.findByText("Esperando al estudiante");
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.callbacks.clear();
  mocks.session = { user: { id: "user-a" }, loading: false };
  mocks.rpc.mockImplementation(async (name) =>
    name === "get_franky_card_merchant" ? cardMerchant() : cardRequest(),
  );
  mocks.api.mockResolvedValue({
    url: "https://supabase.test.invalid/private-photo",
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Validación Card real", () => {
  it("espera al estudiante sin mostrar un comprobante ni una confirmación comercial", async () => {
    render(view());
    await requestConfirmation();
    expect(screen.getByText(/Descuento propuesto: 2\s*€/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Servicio realizado/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Comprobante/)).not.toBeInTheDocument();
    expect(
      mocks.rpc.mock.calls.filter(
        ([name]) => name === "respond_franky_card_request",
      ),
    ).toHaveLength(0);
  });

  it("sólo muestra éxito después del ticket y de la respuesta final del servidor", async () => {
    let result = cardRequest();
    let finish!: (value: unknown) => void;
    const pending = new Promise<unknown>((resolve) => {
      finish = resolve;
    });
    mocks.rpc.mockImplementation(async (name) =>
      name === "get_franky_card_merchant"
        ? cardMerchant()
        : name === "respond_franky_card_request"
          ? pending
          : result,
    );
    render(view());
    await requestConfirmation();
    result = cardRequest({
      status: "customer_confirmed",
      customer_confirmed: true,
      identity: { full_name: "Titular confirmado", photo_path: null },
    });
    fireEvent.focus(window);
    await screen.findByText("Titular confirmado");
    const confirm = screen.getByRole("button", {
      name: "Servicio realizado, registrar",
    });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Referencia del ticket"), {
      target: { value: "ticket-42" },
    });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(screen.queryByText("Operación registrada")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        mocks.rpc.mock.calls.filter(
          ([name]) => name === "respond_franky_card_request",
        ),
      ).toHaveLength(1),
    );
    await act(async () => {
      finish(completedCardRequest());
      await pending;
    });
    expect(await screen.findByText("Operación registrada")).toBeInTheDocument();
    expect(
      screen.getByText("Ticket ticket-42 · Comprobante consumption-a"),
    ).toBeInTheDocument();
  });

  it("muestra el rechazo del estudiante sin éxito ni comprobante", async () => {
    render(view());
    await requestConfirmation();
    mocks.rpc.mockResolvedValueOnce(cardRequest({ status: "rejected" }));
    fireEvent.focus(window);
    expect(await screen.findByText("Solicitud rechazada")).toBeInTheDocument();
    expect(screen.queryByText(/Comprobante/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Siguiente tarjeta" }),
    ).toBeInTheDocument();
  });

  it("borra datos privados al cambiar de cuenta y descarta la respuesta en vuelo", async () => {
    let finish!: (value: unknown) => void;
    const pending = new Promise<unknown>((resolve) => {
      finish = resolve;
    });
    render(view());
    await requestConfirmation();
    mocks.rpc.mockReturnValueOnce(pending);
    fireEvent.focus(window);
    act(() => {
      mocks.callbacks.forEach((callback) =>
        callback("SIGNED_IN", { user: { id: "user-b" } }),
      );
    });
    expect(screen.getByText("Vuelve a abrir tu negocio")).toBeInTheDocument();
    await act(async () => {
      finish(
        cardRequest({
          status: "customer_confirmed",
          customer_confirmed: true,
          identity: { full_name: "Persona anterior", photo_path: null },
        }),
      );
      await pending;
    });
    expect(screen.queryByText("Persona anterior")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Esperando al estudiante"),
    ).not.toBeInTheDocument();
  });

  it("abre correctamente en StrictMode y no conserva controladores desmontados", async () => {
    render(<StrictMode>{view()}</StrictMode>);
    await requestConfirmation();
    expect(screen.getByText("Esperando al estudiante")).toBeInTheDocument();
    expect(
      mocks.rpc.mock.calls.filter(
        ([name]) => name === "create_franky_card_request",
      ),
    ).toHaveLength(1);
  });

  it("bloquea el registro si no puede mostrar la foto consentida", async () => {
    render(view());
    await requestConfirmation();
    mocks.api.mockRejectedValueOnce(new Error("photo unavailable"));
    mocks.rpc.mockResolvedValueOnce(
      cardRequest({
        status: "customer_confirmed",
        customer_confirmed: true,
        identity: {
          full_name: "Titular confirmado",
          photo_path: "private/photo",
        },
      }),
    );
    fireEvent.focus(window);
    await screen.findByText(
      "No podemos mostrar la foto de la tarjeta. Actualiza antes de confirmar.",
    );
    fireEvent.change(screen.getByLabelText("Referencia del ticket"), {
      target: { value: "ticket-42" },
    });
    expect(
      screen.getByRole("button", { name: "Servicio realizado, registrar" }),
    ).toBeDisabled();
    mocks.rpc.mockResolvedValueOnce(
      cardRequest({
        status: "customer_confirmed",
        customer_confirmed: true,
        identity: {
          full_name: "Titular confirmado",
          photo_path: "private/photo",
        },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    const photo = await screen.findByRole("img", {
      name: "Foto de la tarjeta confirmada",
    });
    expect(
      screen.getByRole("button", { name: "Servicio realizado, registrar" }),
    ).toBeDisabled();
    fireEvent.load(photo);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Servicio realizado, registrar" }),
      ).toBeEnabled(),
    );
  });
});
