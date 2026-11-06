import { z } from "zod";
import { ProRemoteError, type ProRpcClient } from "./remote-contracts";

const slotsSchema = z.array(
  z.string().refine((value) => Number.isFinite(Date.parse(value))),
);

export async function loadProSlots(
  client: ProRpcClient,
  input: {
    organizationId: string;
    serviceId: string;
    date: string;
    resourceIds: string[];
    partySize?: number;
  },
): Promise<string[]> {
  const response = await client.rpc("professional_get_slots", {
    p_organization_id: input.organizationId,
    p_service_id: input.serviceId,
    p_date: input.date,
    p_resource_ids: [...new Set(input.resourceIds)].sort(),
    p_party_size: input.partySize ?? 1,
  });
  if (response.error) {
    throw new ProRemoteError(response.error.message, response.error.code);
  }
  const parsed = slotsSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new ProRemoteError("No se pudo comprobar la disponibilidad.");
  }
  return [...new Set(parsed.data)].sort();
}
