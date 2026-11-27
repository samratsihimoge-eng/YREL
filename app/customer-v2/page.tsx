import { redirect } from "next/navigation";

// Keep a single customer-app entry point; the retired visual demo redirects to the live customer flow.
export default function CustomerV2Redirect(){ redirect("/"); }
