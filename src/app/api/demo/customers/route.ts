import { NextResponse } from "next/server";
import { PERSONAS } from "@/fixtures/personas";
import { currentAccount } from "@/server/auth/session";
import { loadProfile } from "@/server/profiles";
import { sandboxCustomerId } from "@/server/providers/nessie";

/**
 * Public-safe persona summaries and whether a live Nessie sandbox customer is mapped. The
 * signed-in account's own profile is listed too, for that account only.
 */
export async function GET() {
  const hasKey = Boolean(process.env.NESSIE_API_KEY);
  const customers = PERSONAS.map((p) => ({
    id: p.id,
    summary: p.summary,
    sandboxAvailable: hasKey && sandboxCustomerId(p.id) !== null,
  }));
  const account = await currentAccount();
  const mine = account ? loadProfile(account.accountId) : undefined;
  if (mine) {
    customers.push({ id: mine.persona.id, summary: mine.persona.summary, sandboxAvailable: hasKey && mine.profile.banking.nessieCustomerId !== null });
  }
  return NextResponse.json({ customers });
}
