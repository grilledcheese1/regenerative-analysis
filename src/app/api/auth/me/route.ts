import { currentAccount } from "@/server/auth/session";

/** The signed-in demo account, or null. */
export async function GET() {
  return Response.json({ account: await currentAccount() });
}
