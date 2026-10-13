import type { Metadata } from "next";
import { HowScreen } from "@/components/how/HowScreen";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "The six steps of a SettleOnce payment, what the contract guarantees, and what it deliberately does not do.",
};

export default function HowPage() {
  return <HowScreen />;
}
