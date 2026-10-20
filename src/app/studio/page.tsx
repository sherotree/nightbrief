import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { DigestStudio } from "@/components/DigestStudio";

export const metadata: Metadata = {
  title: "Studio",
  description:
    "Paste an overnight chat or email export. Gemma summarizes it locally into two lines.",
};

export default function StudioPage() {
  return (
    <>
      <SiteHeader current="studio" />
      <main className="nb-studio">
        <DigestStudio />
      </main>
    </>
  );
}
