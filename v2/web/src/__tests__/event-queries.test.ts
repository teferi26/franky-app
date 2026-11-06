import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  EVENT_DETAIL_SELECT,
  EVENT_UNIVERSITY_EMBED,
  ambiguousUniversityEmbeds,
} from "@/lib/event-queries";

describe("select de la ficha de evento", () => {
  it("nombra la FK al embeber universities (evita PGRST201 y el falso 404)", () => {
    expect(EVENT_UNIVERSITY_EMBED).toBe("universities!events_university_id_fkey(name)");
    expect(ambiguousUniversityEmbeds(EVENT_DETAIL_SELECT)).toEqual([]);
  });

  it("solo embebe el nombre de la universidad, nada más de otras tablas", () => {
    const embeds = EVENT_DETAIL_SELECT.match(/[a-z_]+(![a-z_]+)?\(([^)]*)\)/g) ?? [];
    expect(embeds).toEqual(["universities!events_university_id_fkey(name)"]);
  });

  it("detecta el embed ambiguo antiguo", () => {
    expect(ambiguousUniversityEmbeds("*, universities(name)")).toHaveLength(1);
  });

  it("la ficha /eventos/[id] usa el select compartido", () => {
    const src = readFileSync(
      path.resolve(__dirname, "../app/eventos/[id]/page.tsx"),
      "utf8",
    );
    expect(src).toContain("EVENT_DETAIL_SELECT");
    expect(ambiguousUniversityEmbeds(src)).toEqual([]);
  });
});
