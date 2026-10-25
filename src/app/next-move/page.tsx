import { redirect } from "next/navigation";

// The story moved from /next-move to /; keep old links (and their query) working.
export default async function NextMovePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const qs = new URLSearchParams(Object.entries(await searchParams).filter((e): e is [string, string] => typeof e[1] === "string")).toString();
  redirect(qs ? `/?${qs}` : "/");
}
