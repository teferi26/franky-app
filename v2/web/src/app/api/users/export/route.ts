// Honeypot — common probe path for a "users export" feature.
import { honeypotResponse } from "@/lib/honeypot";

export const dynamic = "force-dynamic";

export const GET = (req: Request) => honeypotResponse(req, "users-export");
export const POST = (req: Request) => honeypotResponse(req, "users-export");
