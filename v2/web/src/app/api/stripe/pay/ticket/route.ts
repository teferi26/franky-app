import { NextRequest } from "next/server";
import { marketplacePay } from "@/lib/marketplace-pay-route";

export async function POST(req: NextRequest) { return marketplacePay(req, "ticket"); }
