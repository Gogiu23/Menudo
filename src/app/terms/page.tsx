import type { Metadata } from "next";
import Legal from "../Legal";

export const metadata: Metadata = { title: "Termini · Menudo" };

export default function Page() {
  return <Legal doc="terms" />;
}
