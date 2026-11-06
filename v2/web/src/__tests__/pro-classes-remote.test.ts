import { describe, expect, it } from "vitest";
import { buildDemo } from "@/lib/pro/demo";
import { localDate } from "@/lib/pro/format";
import { emptyClassExtras, extrasOf, markContacted, withExtras } from "@/lib/pro/classes-care";
import { addLead } from "@/lib/pro/classes-growth";
import {
  classExtrasFromWire,
  classExtrasToWire,
  diffClassExtras,
  loadClassExtras,
  onlyClassExtrasChanged,
  parseClassExtras,
  planClassExtrasCommand,
} from "@/lib/pro/classes-remote";
import { canProCommand, planProCommand } from "@/lib/pro/remote-actions";

const now = new Date("2026-09-24T09:30:00.000Z");

describe("extras del motor de clases en el servidor", () => {
  it("ida y vuelta al formato del servidor sin perder nada", () => {
    const x = extrasOf(buildDemo("sports", now));
    const wire = classExtrasToWire(x);
    expect(Array.isArray(wire.charges)).toBe(false);
    const back = classExtrasFromWire(JSON.parse(JSON.stringify(wire)));
    expect(back.charges).toHaveLength(x.charges.length);
    expect(back.leads).toHaveLength(x.leads!.length);
    expect(back.records).toHaveLength(x.records!.length);
    expect(back.members).toEqual(JSON.parse(JSON.stringify(x.members)));
    expect(back.policy).toEqual(x.policy);
  });

  it("un documento vacío o con basura da unos extras válidos", () => {
    const empty = classExtrasFromWire({});
    expect(empty).toEqual(emptyClassExtras());
    const weird = classExtrasFromWire({
      charges: [1, 2],
      policy: "x",
      recoveryDays: 15,
      unknown: 3,
    });
    expect(weird.charges).toEqual([]);
    expect(weird.policy).toEqual(emptyClassExtras().policy);
    expect(weird.recoveryDays).toBe(15);
    expect("unknown" in weird).toBe(false);
  });

  it("el cambio va fila a fila", () => {
    const data = buildDemo("sports", now);
    const member = data.members.find((m) => m.status === "active")!;
    const after = markContacted(data, member.id, now);
    const patches = diffClassExtras(extrasOf(data), extrasOf(after));
    expect(patches).toHaveLength(1);
    expect(patches[0].k).toBe("members");
    expect(patches[0].id).toBe(member.id);
    expect((patches[0].v as { contactedAt: string }).contactedAt).toBe(now.toISOString());
  });

  it("una fila nueva en una lista y un valor suelto", () => {
    const data = buildDemo("academy", now);
    const withLead = addLead(data, { name: "Nora Pérez", source: "franky" }, now, "ld-new");
    const changed = withExtras(withLead, (x) => ({ ...x, recoveryDays: 21 }));
    const patches = diffClassExtras(extrasOf(data), extrasOf(changed));
    expect(patches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ k: "leads", id: "ld-new" }),
        { k: "recoveryDays", v: 21 },
      ]),
    );
    expect(patches).toHaveLength(2);
  });

  it("borrar una fila la manda como null", () => {
    const data = buildDemo("sports", now);
    const first = extrasOf(data).leads![0];
    const after = withExtras(data, (x) => ({
      ...x,
      leads: x.leads!.filter((l) => l.id !== first.id),
    }));
    expect(diffClassExtras(extrasOf(data), extrasOf(after))).toEqual([
      { k: "leads", id: first.id, v: null },
    ]);
  });

  it("solo planifica si no cambia nada más que los extras", () => {
    const data = buildDemo("sports", now);
    const member = data.members.find((m) => m.status === "active")!;
    const onlyExtras = markContacted(data, member.id, now);
    expect(onlyClassExtrasChanged(data, onlyExtras)).toBe(true);
    const command = planClassExtrasCommand(data, onlyExtras)!;
    expect(command.rpc).toBe("pro_patch_class_extras");
    expect(command.args.p_organization_id).toBe(data.space.id);

    const mixed = { ...onlyExtras, members: onlyExtras.members.slice(1) };
    expect(onlyClassExtrasChanged(data, mixed)).toBe(false);
    expect(planClassExtrasCommand(data, mixed)).toBeNull();
    expect(planClassExtrasCommand(data, data)).toBeNull();
  });

  it("las acciones del motor pasan por el permiso y por la RPC de parches", () => {
    const data = buildDemo("sports", now);
    expect(canProCommand({ "attendees.manage": true }, "lead.create")).toBe(true);
    expect(canProCommand({ "attendees.manage": true }, "policy.save")).toBe(false);
    expect(canProCommand({ "finance.manage": true }, "charge.remind")).toBe(true);
    const after = addLead(data, { name: "Iker Sala", source: "walkin" }, now, "ld-i");
    expect(planProCommand("lead.create", data, after).rpc).toBe("pro_patch_class_extras");
    expect(() => planProCommand("lead.create", data, data)).toThrow();
  });

  it("lee la respuesta del servidor y tolera que la RPC aún no exista", async () => {
    const org = "org-1";
    const doc = classExtrasToWire(extrasOf(buildDemo("sports", now)));
    const parsed = parseClassExtras({ organization_id: org, version: 3, doc }, org);
    expect(parsed.leads!.length).toBeGreaterThan(0);
    expect(() => parseClassExtras({ organization_id: "otro", version: 1, doc }, org)).toThrow();

    const missing = {
      rpc: async () => ({
        data: null,
        error: { message: "Could not find the function", code: "PGRST202" },
      }),
    };
    await expect(loadClassExtras(missing, org)).resolves.toBeNull();
    const broken = { rpc: async () => ({ data: null, error: { message: "boom", code: "XX000" } }) };
    await expect(loadClassExtras(broken, org)).rejects.toThrow();
    const ok = {
      rpc: async () => ({ data: { organization_id: org, version: 1, doc: {} }, error: null }),
    };
    await expect(loadClassExtras(ok, org)).resolves.toEqual(emptyClassExtras());
    expect(localDate(now)).toBe("2026-09-24");
  });
});
