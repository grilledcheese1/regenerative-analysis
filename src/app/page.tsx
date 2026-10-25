import { redirect } from "next/navigation";
import NextMoveEntry from "@/components/story/NextMoveEntry";

/** The main site: sign in, then the scroll story. The tabbed screens live at /home. */
export default async function Home({ searchParams }: { searchParams: Promise<{ view?: string; as?: string }> }) {
  const { view, as } = await searchParams;
  if (view === "details") redirect(as ? `/home?as=${encodeURIComponent(as)}` : "/home"); // old link
  return <NextMoveEntry as={as} />;
}
