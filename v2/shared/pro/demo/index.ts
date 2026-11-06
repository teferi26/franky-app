import type { ProData, ProVerticalId } from "../types";
import { PRO_VERTICALS } from "../verticals";
import { buildAgendaDemo } from "./agenda";
import { buildTablesDemo } from "./tables";
import { buildNightDemo } from "./night";
import { buildClassesDemo } from "./classes";
import { buildCourtsDemo } from "./courts";
import { buildHousingDemo } from "./housing";
import { buildCommunityDemo } from "./community";
import { buildUniversityDemo } from "./university";

/** Negocio de ejemplo de cada sector, con datos realistas relativos a `now`. */
export function buildDemo(vertical: ProVerticalId, now: Date): ProData {
  switch (PRO_VERTICALS[vertical].engine) {
    case "agenda":
      return buildAgendaDemo(vertical, now);
    case "tables":
      return buildTablesDemo(vertical, now);
    case "night":
      return buildNightDemo(vertical, now);
    case "classes":
      return buildClassesDemo(vertical, now);
    case "courts":
      return buildCourtsDemo(vertical, now);
    case "housing":
      return buildHousingDemo(vertical, now);
    case "community":
      return buildCommunityDemo(vertical, now);
    case "university":
      return buildUniversityDemo(vertical, now);
  }
}
