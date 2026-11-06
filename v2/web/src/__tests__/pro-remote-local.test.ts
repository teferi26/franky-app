// @vitest-environment node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { loadProWorkspace } from "@/lib/pro/remote-data";
import { planProCommand, ProCommandRunner } from "@/lib/pro/remote-actions";
import type { ProRpcClient } from "@/lib/pro/remote-contracts";

const enabled = process.env.PRO_LOCAL_RPC_TEST === "1";

describe.skipIf(!enabled)(
  "Franky Pro: servidor PostgreSQL local por HTTP",
  () => {
    it("carga la agenda completa con la sesión sintética del servidor desechable", async () => {
      const metadata = z
        .object({
          supabaseUrl: z.literal("http://127.0.0.1:3109"),
          organizationId: z.string(),
          legacyOrganizationId: z.string(),
          session: z.object({ access_token: z.string() }),
        })
        .parse(
          JSON.parse(
            await readFile(
              resolve(process.cwd(), "../tmp/local-pro-ui.json"),
              "utf8",
            ),
          ),
        );
      const preflight = await fetch(
        `${metadata.supabaseUrl}/rest/v1/rpc/pro_get_space`,
        {
          method: "OPTIONS",
          headers: {
            origin: "http://127.0.0.1:3107",
            "access-control-request-method": "POST",
            "access-control-request-headers":
              "authorization,content-profile,accept-profile,apikey,content-type",
          },
        },
      );
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get("access-control-allow-headers")).toContain(
        "content-profile",
      );
      expect(preflight.headers.get("access-control-allow-headers")).toContain(
        "accept-profile",
      );
      const client: ProRpcClient = {
        rpc: async (name, args = {}) => {
          const response = await fetch(
            `${metadata.supabaseUrl}/rest/v1/rpc/${name}`,
            {
              method: "POST",
              headers: {
                authorization: `Bearer ${metadata.session.access_token}`,
                "content-type": "application/json",
              },
              body: JSON.stringify(args),
            },
          );
          const data: unknown = await response.json();
          return response.ok
            ? { data, error: null }
            : {
                data: null,
                error: z
                  .object({ message: z.string(), code: z.string().optional() })
                  .parse(data),
              };
        },
      };
      const from = new Date(Date.now() - 86400000).toISOString();
      const until = new Date(Date.now() + 8 * 86400000).toISOString();
      const result = await loadProWorkspace(
        client,
        metadata.organizationId,
        from,
        until,
      );
      expect(result.complete).toBe(true);
      expect(result.data.space.id).toBe(metadata.organizationId);
      expect(result.settings.enabled).toBe(true);
      expect(result.data.staff.length).toBeGreaterThan(0);
      expect(result.data.clients.length).toBeGreaterThan(0);

      const legacy = await loadProWorkspace(
        client,
        metadata.legacyOrganizationId,
        from,
        until,
      );
      expect(legacy.complete).toBe(true);
      expect(legacy.data.space.vertical).toBe("hairdresser");
      expect(legacy.data.space.publicProfile).toMatchObject({
        published: false,
      });
      expect(legacy.data.space.slug).toBe("");
      const name = `Cliente previo ${crypto.randomUUID().slice(0, 8)}`;
      const after = structuredClone(legacy.data);
      after.clients.push({
        id: crypto.randomUUID(),
        name,
        phone: "+34600111222",
        notes: "",
        technical: "",
        tags: [],
        visits: 0,
        noShows: 0,
        spentCents: 0,
        source: "phone",
        marketingConsent: false,
        cardMember: false,
        createdAt: new Date().toISOString(),
      });
      const runner = new ProCommandRunner(client);
      await runner.run(planProCommand("client.create", legacy.data, after));
      const reloaded = await loadProWorkspace(
        client,
        metadata.legacyOrganizationId,
        from,
        until,
      );
      expect(
        reloaded.data.clients.some((customer) => customer.name === name),
      ).toBe(true);
      const untouched = await client.rpc("pro_get_space", {
        p_organization_id: metadata.legacyOrganizationId,
      });
      expect(untouched.error).toBeNull();
      expect(untouched.data).toHaveProperty("profile", null);
    });
  },
);
