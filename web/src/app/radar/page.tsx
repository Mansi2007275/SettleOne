import type { Metadata } from "next";
import { RadarScreen } from "@/components/radar/RadarScreen";

export const metadata: Metadata = {
  title: "Radar",
  description: "Scan any wallet's USDC transfers on Arc for suspected duplicate payments.",
};

export default function RadarPage() {
  return <RadarScreen />;
}
