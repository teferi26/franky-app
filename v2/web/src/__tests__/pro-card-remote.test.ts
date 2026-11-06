import { describe, expect, it, vi } from "vitest";
import {
  ProCardSession,
  cardRequestState,
  publicCardError,
} from "@/lib/pro/card-remote";
import {
  cardMerchant,
  cardRequest,
  completedCardRequest,
  singleServiceInput,
} from "./fixtures/pro-card";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function session(isCurrent = () => true) {
  const rpc =
    vi.fn<(name: string, args: Record<string, unknown>) => Promise<unknown>>();
  rpc.mockResolvedValueOnce(cardMerchant());
  const controller = new ProCardSession(rpc, "org-a", isCurrent);
  await controller.loadMerchant();
  rpc.mockClear();
  return { rpc, controller };
}

describe("Card real: una unidad, consentimiento y respuestas confirmadas", () => {
  it("manda una unidad elegible y deja el cálculo al servidor", async () => {
    const { rpc, controller } = await session();
    const canonical = cardRequest();
    rpc.mockResolvedValueOnce(canonical);
    expect(
      await controller.create({
        ...singleServiceInput,
        credential: `franky:card:v1:${singleServiceInput.credential}`,
      }),
    ).toEqual(canonical);
    expect(rpc).toHaveBeenCalledWith("create_franky_card_request", {
      p_venue_id: "venue-a",
      p_token: singleServiceInput.credential,
      p_kind: "discount",
      p_offer_id: "offer-a",
      p_program_id: null,
      p_request_key: expect.any(String),
      p_lines: [
        {
          id: "unit-1",
          label: "Servicio del catálogo",
          service_key: "service-a",
          gross_cents: 2000,
          public_price_cents: 2000,
        },
      ],
    });
  });

  it("conserva la clave tras respuesta perdida incluso si actualiza antes de reintentar", async () => {
    const { rpc, controller } = await session();
    rpc.mockRejectedValueOnce(new Error("network failure"));
    await expect(controller.create(singleServiceInput)).rejects.toMatchObject({
      code: "card_unavailable",
    });
    const firstKey = rpc.mock.calls[0][1].p_request_key;
    rpc.mockResolvedValueOnce(cardMerchant());
    await controller.loadMerchant();
    await expect(
      controller.create({ ...singleServiceInput, grossCents: 2100 }),
    ).rejects.toMatchObject({ code: "card_request_conflict" });
    rpc.mockResolvedValueOnce(cardRequest());
    await controller.create(singleServiceInput);
    expect(rpc.mock.calls.at(-1)?.[1].p_request_key).toBe(firstKey);
  });

  it("bloquea el doble toque antes de que React cambie el estado", async () => {
    const { rpc, controller } = await session();
    const response = deferred<unknown>();
    rpc.mockReturnValueOnce(response.promise);
    const first = controller.create(singleServiceInput);
    expect(await controller.create(singleServiceInput)).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
    response.resolve(cardRequest());
    await first;
  });

  it("nunca confirma por el estudiante y exige un ticket real después", async () => {
    const { rpc, controller } = await session();
    rpc.mockResolvedValueOnce(cardRequest());
    await controller.create(singleServiceInput);
    await expect(
      controller.respond("confirm", "ticket-42"),
    ).rejects.toMatchObject({ code: "card_customer_confirmation_required" });
    expect(rpc).toHaveBeenCalledTimes(1);
    rpc.mockResolvedValueOnce(
      cardRequest({
        status: "customer_confirmed",
        customer_confirmed: true,
        identity: { full_name: "Estudiante", photo_path: null },
      }),
    );
    await controller.read("request-a");
    await expect(controller.respond("confirm", "")).rejects.toMatchObject({
      code: "card_invalid_input",
    });
    rpc.mockResolvedValueOnce(completedCardRequest());
    const result = await controller.respond("confirm", "ticket-42");
    expect(result?.consumption_id).toBe("consumption-a");
    expect(rpc.mock.calls.at(-1)).toEqual([
      "respond_franky_card_request",
      {
        p_request_id: "request-a",
        p_action: "confirm",
        p_external_reference: "ticket-42",
      },
    ]);
  });

  it("reintenta la confirmación con el mismo ticket y no repite una completada", async () => {
    const { rpc, controller } = await session();
    rpc.mockResolvedValueOnce(
      cardRequest({
        status: "customer_confirmed",
        customer_confirmed: true,
        identity: { full_name: "Estudiante", photo_path: null },
      }),
    );
    await controller.read("request-a");
    rpc.mockRejectedValueOnce(new Error("response lost"));
    await expect(
      controller.respond("confirm", "ticket-42"),
    ).rejects.toMatchObject({ code: "card_unavailable" });
    await expect(
      controller.respond("confirm", "ticket-43"),
    ).rejects.toMatchObject({ code: "card_request_conflict" });
    rpc.mockResolvedValueOnce(completedCardRequest());
    await controller.respond("confirm", "ticket-42");
    const calls = rpc.mock.calls.length;
    expect((await controller.respond("confirm", "ticket-42"))?.status).toBe(
      "completed",
    );
    expect(rpc).toHaveBeenCalledTimes(calls);
  });

  it("conserva el rechazo confirmado y no registra una solicitud caducada", async () => {
    const { rpc, controller } = await session();
    rpc.mockResolvedValueOnce(cardRequest());
    await controller.create(singleServiceInput);
    rpc.mockResolvedValueOnce(cardRequest({ status: "rejected" }));
    expect((await controller.respond("reject"))?.status).toBe("rejected");
    controller.reset();
    rpc.mockResolvedValueOnce(
      cardRequest({ expires_at: "2000-01-01T00:00:00Z" }),
    );
    const expired = await controller.read("request-a");
    expect(cardRequestState(expired!)).toBe("expired");
    await expect(
      controller.respond("confirm", "ticket-42"),
    ).rejects.toMatchObject({ code: "card_request_expired" });
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it("descarta respuestas tardías al cambiar de cuenta", async () => {
    let ownerIsCurrent = true;
    const { rpc, controller } = await session(() => ownerIsCurrent);
    const response = deferred<unknown>();
    rpc.mockReturnValueOnce(response.promise);
    const pending = controller.create(singleServiceInput);
    ownerIsCurrent = false;
    response.resolve(cardRequest());
    await expect(pending).rejects.toMatchObject({ code: "auth_required" });
    ownerIsCurrent = true;
    await expect(controller.create(singleServiceInput)).rejects.toMatchObject({
      code: "auth_required",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("no expone el token en errores ni logs y permite corregir un token rechazado", async () => {
    const { rpc, controller } = await session();
    const logs = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "error"),
      vi.spyOn(console, "warn"),
    ];
    rpc.mockRejectedValueOnce(
      new Error(`failed with secret ${singleServiceInput.credential}`),
    );
    const error = await controller
      .create(singleServiceInput)
      .catch((reason: unknown) => reason);
    expect(publicCardError(error)).not.toContain(singleServiceInput.credential);
    expect(String(error)).not.toContain(singleServiceInput.credential);
    logs.forEach((log) => {
      expect(log).not.toHaveBeenCalled();
      log.mockRestore();
    });
    rpc.mockRejectedValueOnce(new Error("card_credential_invalid"));
    await expect(controller.create(singleServiceInput)).rejects.toMatchObject({
      code: "card_credential_invalid",
    });
    rpc.mockResolvedValueOnce(cardRequest());
    await expect(
      controller.create({ ...singleServiceInput, credential: "b".repeat(64) }),
    ).resolves.toMatchObject({ status: "pending" });
  });

  it("rechaza respuestas de otro negocio, otra solicitud o un recibo sin confirmar", async () => {
    const { rpc, controller } = await session();
    rpc.mockResolvedValueOnce(cardRequest({ id: "wrong-request" }));
    await expect(controller.read("request-a")).rejects.toMatchObject({
      code: "card_invalid_response",
    });
    await expect(controller.respond("reject")).rejects.toMatchObject({
      code: "card_invalid_input",
    });
    rpc.mockResolvedValueOnce(cardRequest({ status: "completed" }));
    await expect(controller.read("request-a")).rejects.toMatchObject({
      code: "card_invalid_response",
    });
    rpc.mockResolvedValueOnce(cardRequest({ organization_id: "org-b" }));
    await expect(controller.read("request-a")).rejects.toMatchObject({
      code: "card_forbidden",
    });
  });

  it("no envía código mal formado ni servicios fuera de la oferta", async () => {
    const { rpc, controller } = await session();
    await expect(
      controller.create({
        ...singleServiceInput,
        credential: "código inventado",
      }),
    ).rejects.toMatchObject({ code: "card_credential_invalid" });
    await expect(
      controller.create({ ...singleServiceInput, serviceId: "service-b" }),
    ).rejects.toMatchObject({ code: "card_offer_unavailable" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
