import type { Metadata } from "next";
import { Landing } from "@/components/landing/landing";
import { SPINDLE } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Spindle: your method, on a base that shows its work",
  description: "Spindle teaches personal trainers how the body works, with every science statement cited. Coaches and gyms layer their own method on top.",
};

export default function Home() {
  return <Landing brand={SPINDLE} />;
}
