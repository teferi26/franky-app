import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";

interface UniRow {
  id: string;
  name: string;
  short_name: string | null;
  city: string;
  comunidad_autonoma: string;
}

export const revalidate = 3600;

export async function GET() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("universities")
    .select("id, name, short_name, city, comunidad_autonoma")
    .order("comunidad_autonoma")
    .order("city")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const tree = new Map<string, Map<string, UniRow[]>>();
  for (const row of (data as UniRow[]) || []) {
    if (!tree.has(row.comunidad_autonoma)) tree.set(row.comunidad_autonoma, new Map());
    const cities = tree.get(row.comunidad_autonoma)!;
    if (!cities.has(row.city)) cities.set(row.city, []);
    cities.get(row.city)!.push(row);
  }

  const structure = Array.from(tree.entries()).map(([comunidad, cities]) => ({
    comunidad,
    cities: Array.from(cities.entries()).map(([city, unis]) => ({
      city,
      universities: unis.map((u) => ({
        id: u.id,
        name: u.name,
        short_name: u.short_name,
      })),
    })),
  }));

  return NextResponse.json({ structure });
}
