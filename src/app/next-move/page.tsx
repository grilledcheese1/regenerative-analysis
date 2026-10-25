import { redirect } from "next/navigation";

// Next Move moved to /; keep old links working.
export default function NextMovePage() {
  redirect("/");
}
