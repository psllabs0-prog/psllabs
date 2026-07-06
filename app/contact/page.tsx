import type { Metadata } from "next";

import { ContactBackground } from "@/components/contact/contact-background";
import { ContactForm } from "@/components/contact/contact-form";
import { ContactInfoPanel } from "@/components/contact/contact-info-panel";
import { AnimateIn } from "@/components/product/animate-in";
import { contactPage } from "@/lib/contact";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Contact",
  description:
    "Reach PSL Labs for order support, COA requests, and research supply questions.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <main className="relative overflow-hidden bg-gradient-to-br from-paper via-lab-white to-biotech-mist/40">
      <ContactBackground />

      <div className="relative mx-auto max-w-[1440px] px-6 py-16 md:px-16 md:py-20 lg:px-24 lg:py-24">
        <div className="grid grid-cols-1 items-start gap-14 lg:grid-cols-2 lg:gap-16 xl:gap-24">
          <ContactInfoPanel content={contactPage} />

          <AnimateIn delay={0.12} className="lg:sticky lg:top-28">
            <ContactForm
              title={contactPage.formTitle}
              description={contactPage.formDescription}
            />
          </AnimateIn>
        </div>
      </div>
    </main>
  );
}
