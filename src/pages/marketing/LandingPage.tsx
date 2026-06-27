/** @doc Public home page — hero, showcase, featured demos and pricing preview. */
import { useEffect, useState, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import type Lenis from "lenis";
import { supabase } from "@/integrations/supabase/client";
import LandingNavbar from "@/components/landing/LandingNavbar";
import HeroSection from "@/components/landing/HeroSection";
import FlyingMegsyStar from "@/components/landing/FlyingMegsyStar";
import SEOHead from "@/components/common/SEOHead";
import { LandingContentProvider, useLandingContent } from "@/lib/landing/LandingContentContext";
import type { LocaleCode } from "@/lib/landing/i18n/locales";

// Below-the-fold — lazy load to keep landing FCP fast on weak devices
const StatsMarquee = lazy(() => import("@/components/landing/StatsMarquee"));

const HorizontalGallery = lazy(() => import("@/components/landing/HorizontalGallery"));
const StickyFeatureTabs = lazy(() => import("@/components/landing/StickyFeatureTabs"));
const ParallaxShowcase = lazy(() => import("@/components/landing/ParallaxShowcase"));
const ShowcaseGallery = lazy(() => import("@/components/landing/ShowcaseGallery"));
const CreativeBlueprintsSection = lazy(
  () => import("@/components/landing/CreativeBlueprintsSection"),
);
const MegsyChatModelsSection = lazy(() => import("@/components/landing/MegsyChatModelsSection"));
const MegsyImageModelsSection = lazy(() => import("@/components/landing/MegsyImageModelsSection"));
const MegsyCodeModelsSection = lazy(() => import("@/components/landing/MegsyCodeModelsSection"));
const MegsyVideoModelsSection = lazy(() => import("@/components/landing/MegsyVideoModelsSection"));
const HowItWorks = lazy(() => import("@/components/landing/HowItWorks"));
const PricingPreview = lazy(() => import("@/components/landing/PricingPreview"));
const ReferralSection = lazy(() => import("@/components/landing/ReferralSection"));
const FAQSection = lazy(() => import("@/components/landing/FAQSection"));
const CTASection = lazy(() => import("@/components/landing/CTASection"));
const FinalHeroCTA = lazy(() => import("@/components/landing/FinalHeroCTA"));
const LandingFooter = lazy(() => import("@/components/landing/LandingFooter"));

const SectionFallback = () => (
  <div className="min-h-[200px] w-full px-4 py-16 mx-auto max-w-7xl">
    <div className="h-8 w-48 rounded-md bg-foreground/[0.04] animate-pulse mb-6" />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="h-32 rounded-xl bg-foreground/[0.04] animate-pulse" />
      <div className="h-32 rounded-xl bg-foreground/[0.04] animate-pulse" />
      <div className="h-32 rounded-xl bg-foreground/[0.04] animate-pulse" />
    </div>
  </div>
);

const LandingSEO = () => {
  const { locale, content } = useLandingContent();
  return (
    <SEOHead
      title={content.meta.title}
      description={content.meta.description}
      path={locale.path || "/"}
      locale={locale.code}
      emitLandingAlternates
    />
  );
};

interface LandingPageProps {
  locale?: LocaleCode;
}

const LandingPage = ({ locale = "en" }: LandingPageProps) => {
  const navigate = useNavigate();
  // Render landing immediately; auth check happens in background so the
  // first paint is not blocked by a Supabase network round-trip.
  const [ready, setReady] = useState(true);

  useEffect(() => {
    if (!ready) return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const isTouch =
      window.matchMedia("(hover: none) and (pointer: coarse)").matches || window.innerWidth < 1024;

    // On touch devices, native scroll feels far better than Lenis' synthetic touch sync.
    // Skip Lenis entirely on mobile/tablets to fix laggy/sticky scroll.
    if (isTouch) return;

    let rafId = 0;
    let lenis: Lenis | null = null;
    let cancelled = false;

    // Dynamic import — keeps Lenis out of the landing's initial JS bundle.
    import("lenis").then(({ default: LenisCtor }) => {
      if (cancelled) return;
      lenis = new LenisCtor({
        duration: 1.1,
        easing: (t) => 1 - Math.pow(1 - t, 4),
        smoothWheel: true,
        wheelMultiplier: 0.85,
        touchMultiplier: 1.4,
        syncTouch: false,
        overscroll: false,
        autoResize: true,
      });

      document.documentElement.setAttribute("data-lenis-smooth", "true");
      (window as unknown as { __lenis?: Lenis }).__lenis = lenis;

      const raf = (time: number) => {
        lenis?.raf(time);
        rafId = requestAnimationFrame(raf);
      };
      rafId = requestAnimationFrame(raf);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      lenis?.stop();
      lenis?.destroy();
      delete (window as unknown as { __lenis?: Lenis }).__lenis;
      document.documentElement.removeAttribute("data-lenis-smooth");
    };
  }, [ready]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/chat", { replace: true });
      }
    });
  }, [navigate]);

  return (
    <LandingContentProvider locale={locale}>
      <LandingSEO />
      <div data-theme="dark" className="min-h-dvh overflow-x-clip bg-background text-foreground">
        <LandingNavbar />
        <FlyingMegsyStar />
        <main id="main">
          <HeroSection />
          {/* Each section gets its own Suspense so one slow chunk doesn't
              block every other section from rendering. */}
          <div>
            <Suspense fallback={<SectionFallback />}>
              <StatsMarquee />
            </Suspense>
          </div>
          <div>
            <Suspense fallback={<SectionFallback />}>
              <HorizontalGallery />
            </Suspense>
          </div>
          <div>
            <Suspense fallback={<SectionFallback />}>
              <StickyFeatureTabs />
            </Suspense>
          </div>
          <div>
            <Suspense fallback={<SectionFallback />}>
              <MegsyChatModelsSection />
            </Suspense>
          </div>
          <div>
            <Suspense fallback={<SectionFallback />}>
              <ParallaxShowcase />
            </Suspense>
          </div>
          <div>
            <Suspense fallback={<SectionFallback />}>
              <ShowcaseGallery />
            </Suspense>
          </div>
          <div>
            <Suspense fallback={<SectionFallback />}>
              <MegsyCodeModelsSection />
            </Suspense>
          </div>
          <div>
            <Suspense fallback={<SectionFallback />}>
              <CreativeBlueprintsSection />
            </Suspense>
          </div>
          <div>
            <Suspense fallback={<SectionFallback />}>
              <HowItWorks />
            </Suspense>
          </div>
          <div>
            <Suspense fallback={<SectionFallback />}>
              <PricingPreview />
            </Suspense>
          </div>
          <div>
            <Suspense fallback={<SectionFallback />}>
              <ReferralSection />
            </Suspense>
          </div>
          <div>
            <Suspense fallback={<SectionFallback />}>
              <FAQSection />
            </Suspense>
          </div>
          <div>
            <Suspense fallback={<SectionFallback />}>
              <CTASection />
            </Suspense>
          </div>
          <div>
            <Suspense fallback={<SectionFallback />}>
              <FinalHeroCTA />
            </Suspense>
          </div>
        </main>
        <Suspense fallback={<SectionFallback />}>
          <LandingFooter />
        </Suspense>
      </div>
    </LandingContentProvider>
  );
};

export default LandingPage;
