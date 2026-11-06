import type { ProRpcClient } from "@/lib/pro/remote-contracts";
import type { ProVerticalId } from "@/lib/pro/types";
import { PRO_VERTICALS, VERTICAL_ORDER } from "@/lib/pro/verticals";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SectorWorkspace = {
  id: string;
  name: string;
  city: string | null;
  kind: "leisure" | "housing" | "community" | "university";
  subtype: string | null;
  vertical: ProVerticalId | null;
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function validOrganizationId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value)
    ? value.toLowerCase()
    : null;
}

export function validProVertical(value: unknown): ProVerticalId | null {
  return typeof value === "string" &&
    VERTICAL_ORDER.includes(value as ProVerticalId)
    ? (value as ProVerticalId)
    : null;
}

/** Una URL nunca concede acceso: solo selecciona entre membresías ya autorizadas. */
export function selectAuthorizedWorkspace(
  spaces: readonly { id: string }[],
  requested: unknown,
  saved: unknown,
): string | null {
  for (const candidate of [requested, saved]) {
    const id = validOrganizationId(candidate);
    if (id && spaces.some((space) => space.id.toLowerCase() === id)) return id;
  }
  return spaces[0]?.id ?? null;
}

function kindVertical(
  kind: SectorWorkspace["kind"],
  subtype: string | null,
): ProVerticalId | null {
  if (kind === "community" || kind === "university") return kind;
  if (kind === "housing") {
    if (subtype === "agency") return "agency";
    if (subtype === "owner" || subtype === "landlord") return "landlord";
  }
  return null;
}

export function parseSectorWorkspaces(value: unknown): SectorWorkspace[] {
  if (!Array.isArray(value)) throw new Error("workspace_list_invalid");
  const result: SectorWorkspace[] = [];
  for (const item of value) {
    const row = object(item);
    const id = validOrganizationId(row?.id);
    if (!row || !id || typeof row.name !== "string" || row.status !== "active")
      continue;
    if (
      !["leisure", "housing", "community", "university"].includes(
        String(row.kind),
      )
    )
      continue;
    if (
      !Array.isArray(row.permissions) ||
      !row.permissions.includes("resource.read")
    )
      continue;
    const kind = row.kind as SectorWorkspace["kind"];
    const subtype = typeof row.subtype === "string" ? row.subtype : null;
    if (result.some((space) => space.id === id)) continue;
    result.push({
      id,
      name: row.name,
      city: typeof row.city === "string" ? row.city : null,
      kind,
      subtype,
      vertical: kindVertical(kind, subtype),
    });
  }
  return result;
}

export function sectorWorkspaceHref(space: SectorWorkspace): string {
  if (
    space.vertical &&
    ["agenda", "tables", "classes", "courts"].includes(
      PRO_VERTICALS[space.vertical].engine,
    )
  ) {
    return `/pro/${space.id}`;
  }
  return `/espacios?panel=1&organization=${encodeURIComponent(space.id)}`;
}

/** Las tablas Pro son privadas. Consultamos sus RPC con la sesión y cada membresía. */
export async function loadSectorWorkspaces(
  client: ProRpcClient,
  vertical: ProVerticalId,
): Promise<SectorWorkspace[]> {
  const membership = await client.rpc("list_my_workspaces");
  if (membership.error) throw new Error("workspace_list_unavailable");
  const spaces = parseSectorWorkspaces(membership.data);
  const expectedKind =
    vertical === "community" || vertical === "university"
      ? vertical
      : ["agency", "landlord"].includes(vertical)
        ? "housing"
        : "leisure";
  const candidates = spaces.filter((space) => space.kind === expectedKind);
  if (expectedKind !== "leisure")
    return candidates.filter((space) => space.vertical === vertical);

  // Se limita la concurrencia para los equipos con muchas sedes.
  const result: SectorWorkspace[] = [];
  for (let offset = 0; offset < candidates.length; offset += 4) {
    const batch = await Promise.all(
      candidates.slice(offset, offset + 4).map(async (space) => {
        const response = await client.rpc("pro_get_space", {
          p_organization_id: space.id,
        });
        if (response.error) throw new Error("workspace_sector_unavailable");
        const data = object(response.data);
        const organization = object(data?.organization);
        if (validOrganizationId(organization?.id) !== space.id)
          throw new Error("workspace_identity_mismatch");
        const profile = object(data?.profile);
        if (
          profile &&
          validOrganizationId(profile.organization_id) !== space.id
        )
          throw new Error("workspace_identity_mismatch");
        let resolved = validProVertical(profile?.vertical);
        if (!resolved) {
          const from = new Date();
          const fallback = await client.rpc("professional_get_workspace", {
            p_organization_id: space.id,
            p_from: from.toISOString(),
            p_until: new Date(from.getTime() + 86400000).toISOString(),
          });
          if (fallback.error) throw new Error("workspace_sector_unavailable");
          const workspace = object(fallback.data);
          const settings = object(workspace?.settings);
          if (
            settings &&
            validOrganizationId(settings.organization_id) !== space.id
          )
            throw new Error("workspace_identity_mismatch");
          resolved = validProVertical(settings?.category);
        }
        return { ...space, vertical: resolved };
      }),
    );
    result.push(...batch.filter((space) => space.vertical === vertical));
  }
  return result;
}
