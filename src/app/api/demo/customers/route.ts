import { NextResponse } from "next/server";
import { PERSONAS } from "@/fixtures/personas";
import { sandboxCustomerId } from "@/server/providers/nessie";

/** Public-safe persona summaries and whether a live Nessie sandbox customer is mapped. */
export async function GET() {
  const hasKey = Boolean(process.env.NESSIE_API_KEY);
  return NextResponse.json({
    customers: PERSONAS.map((p) => ({
      id: p.id,
      summary: p.summary,
      sandboxAvailable: hasKey && sandboxCustomerId(p.id) !== null,
    })),
  });
}
