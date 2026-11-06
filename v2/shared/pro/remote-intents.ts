/** Intenciones de la interfaz que no deben mezclarse con las filas persistidas. */
export type ProMutationIntent =
  | {
      type: "table.adopt";
      resourceId: string;
      zone: string;
      x: number;
      y: number;
      w: number;
      h: number;
      shape: "square" | "round" | "bar";
    }
  | { type: "table.waitlist.seat"; waitlistId: string; tableId: string }
  | { type: "table.waitlist.cancel"; waitlistId: string }
  | {
      type: "class.session.create";
      classTypeId: string;
      startsAt: string;
      resourceIds: string[];
      capacity: number;
      repeatWeeks: 1 | 4 | 8;
    };
