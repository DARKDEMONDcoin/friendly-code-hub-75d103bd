/** @doc Pick UI language and AI reply language preferences. */
// Language settings — cartoon redesign. Mobile uses the cartoon shell.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { DesktopSettingsLayout } from "@/components/settings/DesktopSettingsLayout";
import { CleanStack, CleanCard } from "@/components/settings/CleanSettings";
import {
  BentoGrid,
  BentoCard,
  BentoHero,
  BentoLabel,
} from "@/components/settings/bento/Bento";
import { goBackOr } from "@/lib/navigation";
import { BackIcon } from "@/components/settings/SettingsIcons";
import CartoonFlag from "@/components/branding/CartoonFlag";
import { CartoonPage, CartoonHero, CartoonCard } from "@/components/settings/CartoonSettingsShell";
import { INK, MINT, YELLOW, TEXT, MUTED, SURFACE_2 } from "@/pages/billing/ReferralsPage";
import languageSticker from "@/assets/settings/language-sticker.png";

type Lang = { code: string; name: string; native: string; country: string; rtl?: boolean };

// Mirrors the Google Translate / Chrome language list. One language per country
// flag — no duplicate flag entries. (Hebrew/Israel removed per request.)
const LANGUAGES: Lang[] = [
  { code: "en", name: "English", native: "English", country: "uk" },
  { code: "ar", name: "Arabic", native: "Arabic", country: "eg", rtl: true },
  { code: "es", name: "Spanish", native: "Español", country: "es" },
  { code: "fr", name: "French", native: "Français", country: "fr" },
  { code: "de", name: "German", native: "Deutsch", country: "de" },
  { code: "it", name: "Italian", native: "Italiano", country: "it" },
  { code: "pt", name: "Portuguese", native: "Português", country: "pt" },
  { code: "nl", name: "Dutch", native: "Nederlands", country: "nl" },
  { code: "ru", name: "Russian", native: "Русский", country: "ru" },
  { code: "uk", name: "Ukrainian", native: "Українська", country: "ua" },
  { code: "pl", name: "Polish", native: "Polski", country: "pl" },
  { code: "cs", name: "Czech", native: "Čeština", country: "cz" },
  { code: "sk", name: "Slovak", native: "Slovenčina", country: "sk" },
  { code: "sl", name: "Slovenian", native: "Slovenščina", country: "si" },
  { code: "hr", name: "Croatian", native: "Hrvatski", country: "hr" },
  { code: "sr", name: "Serbian", native: "Српски", country: "rs" },
  { code: "bs", name: "Bosnian", native: "Bosanski", country: "ba" },
  { code: "mk", name: "Macedonian", native: "Македонски", country: "mk" },
  { code: "sq", name: "Albanian", native: "Shqip", country: "al" },
  { code: "ro", name: "Romanian", native: "Română", country: "ro" },
  { code: "hu", name: "Hungarian", native: "Magyar", country: "hu" },
  { code: "bg", name: "Bulgarian", native: "Български", country: "bg" },
  { code: "el", name: "Greek", native: "Ελληνικά", country: "gr" },
  { code: "tr", name: "Turkish", native: "Türkçe", country: "tr" },
  { code: "sv", name: "Swedish", native: "Svenska", country: "se" },
  { code: "no", name: "Norwegian", native: "Norsk", country: "no" },
  { code: "da", name: "Danish", native: "Dansk", country: "dk" },
  { code: "fi", name: "Finnish", native: "Suomi", country: "fi" },
  { code: "is", name: "Icelandic", native: "Íslenska", country: "is" },
  { code: "et", name: "Estonian", native: "Eesti", country: "ee" },
  { code: "lv", name: "Latvian", native: "Latviešu", country: "lv" },
  { code: "lt", name: "Lithuanian", native: "Lietuvių", country: "lt" },
  { code: "be", name: "Belarusian", native: "Беларуская", country: "by" },
  { code: "ka", name: "Georgian", native: "ქართული", country: "ge" },
  { code: "hy", name: "Armenian", native: "Հայերեն", country: "am" },
  { code: "az", name: "Azerbaijani", native: "Azərbaycanca", country: "az" },
  { code: "kk", name: "Kazakh", native: "Қазақша", country: "kz" },
  { code: "ky", name: "Kyrgyz", native: "Кыргызча", country: "kg" },
  { code: "uz", name: "Uzbek", native: "Oʻzbekcha", country: "uz" },
  { code: "fa", name: "Persian", native: "Persian", country: "ir", rtl: true },
  { code: "ps", name: "Pashto", native: "Pashto", country: "af", rtl: true },
  { code: "ku", name: "Kurdish", native: "Kurdî", country: "iq" },
  { code: "ur", name: "Urdu", native: "Urdu", country: "pk", rtl: true },
  { code: "hi", name: "Hindi", native: "हिन्दी", country: "in" },
  { code: "bn", name: "Bengali", native: "বাংলা", country: "bd" },
  { code: "ne", name: "Nepali", native: "नेपाली", country: "np" },
  { code: "si", name: "Sinhala", native: "සිංහල", country: "lk" },
  { code: "my", name: "Burmese", native: "မြန်မာ", country: "mm" },
  { code: "th", name: "Thai", native: "ไทย", country: "th" },
  { code: "lo", name: "Lao", native: "ລາວ", country: "la" },
  { code: "km", name: "Khmer", native: "ខ្មែរ", country: "kh" },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt", country: "vn" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia", country: "id" },
  { code: "ms", name: "Malay", native: "Bahasa Melayu", country: "my" },
  { code: "tl", name: "Filipino", native: "Filipino", country: "ph" },
  { code: "zh", name: "Chinese (Simplified)", native: "简体中文", country: "cn" },
  { code: "zh-TW", name: "Chinese (Traditional)", native: "繁體中文", country: "tw" },
  { code: "ja", name: "Japanese", native: "日本語", country: "jp" },
  { code: "ko", name: "Korean", native: "한국어", country: "kr" },
  { code: "mn", name: "Mongolian", native: "Монгол", country: "mn" },
  { code: "sw", name: "Swahili", native: "Kiswahili", country: "ke" },
  { code: "am", name: "Amharic", native: "አማርኛ", country: "et" },
  { code: "ha", name: "Hausa", native: "Hausa", country: "ng" },
  { code: "zu", name: "Zulu", native: "isiZulu", country: "za" },
];

const CheckMark = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-4 h-4"
  >
    <path d="M5 12l4.5 4.5L19 7" />
  </svg>
);

const LanguagePage = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [currentLang, setCurrentLang] = useState(localStorage.getItem("language") || "en");

  const handleSelect = (code: string) => {
    localStorage.setItem("language", code);
    setCurrentLang(code);
    window.dispatchEvent(new Event("languagechange-custom"));
  };

  const current = LANGUAGES.find((l) => l.code === currentLang);

  const Row = ({ lang }: { lang: Lang }) => {
    const isActive = currentLang === lang.code;
    return (
      <button
        onClick={() => handleSelect(lang.code)}
        className="notranslate w-full flex items-center justify-between gap-4 px-4 py-3 text-left hover:bg-muted/40 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
      >
        <div className="flex items-center gap-3 min-w-0">
          <CartoonFlag country={lang.country} size={36} />
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-foreground truncate">{lang.name}</p>
            <p
              className="text-[12px] text-muted-foreground truncate"
              dir={lang.rtl ? "rtl" : "ltr"}
            >
              {lang.native}
            </p>
          </div>
        </div>
        {isActive && (
          <span className="w-6 h-6 rounded-full bg-foreground text-background grid place-items-center shrink-0">
            <CheckMark />
          </span>
        )}
      </button>
    );
  };

  const Content = () => {
    const [query, setQuery] = useState("");
    const filtered = LANGUAGES.filter(
      (l) =>
        l.name.toLowerCase().includes(query.toLowerCase()) ||
        l.native.toLowerCase().includes(query.toLowerCase()) ||
        l.code.toLowerCase().includes(query.toLowerCase()),
    );
    return (
      <div className="grid grid-cols-12 gap-8">
        {/* Sticky passport card */}
        <aside className="col-span-4">
          <div className="sticky top-6 rounded-2xl border border-border/60 bg-card/40 overflow-hidden">
            <div className="relative h-32 bg-gradient-to-br from-primary/20 via-primary/5 to-transparent border-b border-border/40">
              <div className="absolute inset-0 opacity-[0.04]" style={{
                backgroundImage:
                  "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)",
                backgroundSize: "16px 16px",
              }} />
              <span className="absolute top-4 left-5 text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                Active language
              </span>
              {current && (
                <span className="absolute top-4 right-5 text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                  {current.code.toUpperCase()}
                </span>
              )}
            </div>
            <div className="px-5 pb-5 -mt-10">
              {current ? (
                <>
                  <div className="w-20 h-20 rounded-full border-4 border-card bg-card grid place-items-center overflow-hidden">
                    <CartoonFlag country={current.country} size={64} />
                  </div>
                  <p className="notranslate mt-4 text-[20px] font-semibold tracking-tight text-foreground">
                    {current.name}
                  </p>
                  <p
                    className="text-[13px] text-muted-foreground mt-0.5"
                    dir={current.rtl ? "rtl" : "ltr"}
                  >
                    {current.native}
                  </p>
                  <div className="mt-5 pt-5 border-t border-border/40 space-y-2.5">
                    <div className="flex justify-between text-[12.5px]">
                      <span className="text-muted-foreground">Direction</span>
                      <span className="text-foreground font-medium">
                        {current.rtl ? "Right to left" : "Left to right"}
                      </span>
                    </div>
                    <div className="flex justify-between text-[12.5px]">
                      <span className="text-muted-foreground">Region</span>
                      <span className="text-foreground font-medium uppercase">
                        {current.country}
                      </span>
                    </div>
                    <div className="flex justify-between text-[12.5px]">
                      <span className="text-muted-foreground">UI &amp; AI replies</span>
                      <span className="text-foreground font-medium">{current.name}</span>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Pick a language to get started.</p>
              )}
            </div>
          </div>
        </aside>

        {/* Searchable list */}
        <div className="col-span-8 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[13px] font-semibold tracking-tight text-foreground">
                All languages
              </h2>
              <p className="text-[12.5px] text-muted-foreground mt-0.5">
                {filtered.length} of {LANGUAGES.length} available
              </p>
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search language…"
              className="w-64 h-9 px-3 text-[13px] rounded-md border border-border/60 bg-card/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
          <div className="border border-border/60 rounded-lg overflow-hidden bg-card/40 max-h-[640px] overflow-y-auto">
            {filtered.map((lang, i) => {
              const isActive = currentLang === lang.code;
              return (
                <button
                  key={lang.code}
                  onClick={() => handleSelect(lang.code)}
                  className={`notranslate w-full flex items-center gap-4 px-4 py-3 text-left transition-colors ${
                    i > 0 ? "border-t border-border/40" : ""
                  } ${isActive ? "bg-primary/[0.06]" : "hover:bg-card/80"}`}
                >
                  <span className="text-[11px] font-mono text-muted-foreground w-8 shrink-0">
                    {lang.code.toUpperCase()}
                  </span>
                  <CartoonFlag country={lang.country} size={24} />
                  <div className="flex-1 min-w-0 flex items-baseline gap-3">
                    <p
                      className={`text-[13.5px] truncate ${
                        isActive ? "text-foreground font-semibold" : "text-foreground font-medium"
                      }`}
                    >
                      {lang.name}
                    </p>
                    <p
                      className="text-[12px] text-muted-foreground truncate"
                      dir={lang.rtl ? "rtl" : "ltr"}
                    >
                      {lang.native}
                    </p>
                  </div>
                  {isActive ? (
                    <span className="text-[11px] font-medium text-primary uppercase tracking-[0.12em]">
                      Active
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100">
                      Select
                    </span>
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-4 py-12 text-center text-[13px] text-muted-foreground">
                No languages match "{query}".
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (!isMobile) {
    return (
      <DesktopSettingsLayout title="Language" subtitle="Choose your preferred language">
        <Content />
      </DesktopSettingsLayout>
    );
  }

  const MobileRow = ({ lang }: { lang: Lang }) => {
    const isActive = currentLang === lang.code;
    return (
      <button
        onClick={() => handleSelect(lang.code)}
        className="notranslate w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition first:rounded-t-[22px] last:rounded-b-[22px]"
        style={{
          backgroundColor: isActive ? SURFACE_2 : "transparent",
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <CartoonFlag country={lang.country} size={36} />
          <div className="min-w-0">
            <p className="text-[14px] truncate" style={{ color: TEXT, fontWeight: 800 }}>
              {lang.name}
            </p>
            <p
              className="text-[12px] truncate"
              dir={lang.rtl ? "rtl" : "ltr"}
              style={{ color: MUTED, fontWeight: 600 }}
            >
              {lang.native}
            </p>
          </div>
        </div>
        {isActive && (
          <span
            className="w-7 h-7 rounded-full grid place-items-center shrink-0"
            style={{ background: YELLOW, color: INK, border: `2px solid ${INK}` }}
          >
            <CheckMark />
          </span>
        )}
      </button>
    );
  };

  return (
    <CartoonPage title="Language">
      {current && (
        <CartoonHero
          sticker={languageSticker}
          bg={MINT}
          title={current.name}
          subtitle={current.native}
        />
      )}
      <div className="mt-3">
        <p
          className="text-[11px] uppercase tracking-[0.12em] mb-2 px-2"
          style={{ color: MUTED, fontWeight: 800 }}
        >
          All languages
        </p>
        <CartoonCard className="!p-0 overflow-hidden">
          <div className="divide-y" style={{ borderColor: "hsl(var(--surface-4))" }}>
            {LANGUAGES.map((l) => (
              <div
                key={l.code}
                style={{ borderColor: "hsl(var(--surface-4))" }}
                className="border-t first:border-t-0"
              >
                <MobileRow lang={l} />
              </div>
            ))}
          </div>
        </CartoonCard>
      </div>
    </CartoonPage>
  );
};

export default LanguagePage;
