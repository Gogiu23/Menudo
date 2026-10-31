import type { Metadata } from "next";
import Legal from "../Legal";

export const metadata: Metadata = { title: "Privacy · Menudo" };

export default function Page() {
  return <Legal doc="privacy" />;
}
