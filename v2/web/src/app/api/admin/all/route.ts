// Honeypot — an "/admin/all" path attackers expect to find admin-only
// bulk data. There's no such endpoint; we log + 404.
import { honeypotResponse } from "@/lib/honeypot";

export const dynamic = "force-dynamic";

export const GET = (req: Request) => honeypotResponse(req, "admin-all");
export const POST = (req: Request) => honeypotResponse(req, "admin-all");
