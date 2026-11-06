// Honeypot — this endpoint does not exist. Anything hitting it is probing
// the platform for a "bulk users export" path. We log the attempt and 404.
import { honeypotResponse } from "@/lib/honeypot";

export const dynamic = "force-dynamic";

export const GET = (req: Request) => honeypotResponse(req, "users-dump");
export const POST = (req: Request) => honeypotResponse(req, "users-dump");
