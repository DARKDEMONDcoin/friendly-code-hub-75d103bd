# خطة: ريديزاين شامل لصفحات الإعدادات بنظام Bento

## الهدف
أوحّد كل صفحات الإعدادات الفرعية على نفس لغة `Cyber-minimal glass bento` اللي بدأنا بيها في `DesktopSettingsHome` — جريد bento، كروت زجاجية، حواف 3xl، tokens سيمانتيك، نفس التايبوغرافي (Space Grotesk + DM Sans)، نفس الإحساس الهادي.

## الـ Primitives الجديدة (مكان واحد، إعادة استخدام في كل الصفحات)

ملف جديد `src/components/settings/bento/Bento.tsx` يصدّر:

- `BentoGrid` — `grid grid-cols-1 md:grid-cols-4 auto-rows-[180px] gap-4`
- `BentoCard` — كارت أساسي (rounded-3xl, border-border, bg-card، tokens فقط) مع props: `span`, `rows`, `tone` (default | accent | gradient), `as`, `onClick`, `interactive`
- `BentoHero` — كارت عريض (col-span-2..4 row-span-2) فيه عنوان + وصف + slot يمين/تحت
- `BentoSectionTitle` — عنوان قسم بين الجريدات
- `BentoStat` — رقم كبير + label (للصفحات اللي فيها counters/limits)
- `BentoToggleRow` — صف toggle داخل الكارت
- `BentoFieldTile` — نفس الـ FieldTile الموجودة، تتنقل من DesktopSettingsHome للملف المشترك

كل التوكنز سيمانتيك من `index.css` — صفر ألوان hardcoded.

## التطبيق على الصفحات (14 صفحة)

كل صفحة تتحوّل لمجموعة `BentoGrid`s داخل `DesktopSettingsLayout`. الموبايل (`CartoonPage`) يفضل زي ما هو في النسخة دي — تركيز الريديزاين على نسخة الديسكتوب اللي بنشوفها في البريفيو، عشان ما نكسرش الـ flows الموبايلية.

```text
1. ProfileSettingsPage
   Hero (2x2): صورة + اسم + ايميل + خطة + verified
   Tiles: Avatar (1x2) | Display name (2x1) | Username (2x1) | Bio (4x1) | Account actions (2x1) | Danger (2x1)

2. NotificationSettingsPage
   Hero (4x1): "How Megsy reaches you"
   Channels (2x2): Email/Push/In-app toggles
   Categories (2x2): Mentions/News/Updates
   Quiet hours (2x1) | Sound (2x1)

3. SettingsPrivacyPage
   Hero (4x1)
   Data sharing (2x2) | Telemetry (2x1) | Export data (2x1) | Delete account (4x1, tone=danger)

4. AIPersonalizationPage (الأكبر)
   Hero (4x2): Call name + profession + about
   Tone sliders (2x2): formality/verbosity/creativity
   Language style (2x1) | Preferred tier (2x1)
   Interests (4x1) | AI traits (2x2) | Custom instructions (2x2)
   Save bar ثابت تحت

5. MemoryPage
   Hero (4x1): storage usage + progress
   Memory list (4x3): كل ذاكرة كارت bento صغير قابل للحذف
   Controls (2x1) x2

6. CustomizationPage
   Hero (4x1): chat preview
   Accent palette (4x2): grid سواتشز
   Density/Bubble style (2x1) x2

7. LanguagePage
   Hero (2x2): اللغة الحالية + flag
   UI language (2x2): سيرش + lista
   AI reply language (4x1)

8. SkillsSettingsPage
   Hero (4x1)
   Skills grid (4x?): كل skill كارت bento (1x1 أو 2x1 حسب النوع)
   Add skill (2x1)

9. SettingsSupportPage / SettingsHelpPage / SettingsContactPage
   Hero (4x1) + روابط quick-access (1x1 لكل واحد) + form/links (4x1)

10. SystemStatusPage
    Hero (4x1) + status tiles لكل خدمة (1x1) + incidents (4x2)

11. MegsyOperatorSettingsPage
    Hero (4x1) + operator controls (2x1) متعددة

12. SettingsPage (root mobile/overview fallback)
    بياخد نفس الـ DesktopSettingsHome (موجود)
```

## التفاصيل التقنية

- صفر `text-white` / `bg-black` / hex مباشر — كله tokens
- `font-display` = Space Grotesk للعناوين، body = DM Sans (متظبط من قبل)
- Hover: `hover:bg-primary/5 hover:border-primary/30 transition-all`
- Active toggles: استخدام `<Switch>` من shadcn مع `data-[state=checked]:bg-primary`
- شيل الـ `CartoonHero` / `CleanCard` / `INK,YELLOW,PINK...` imports من نسخة الديسكتوب فقط — الموبايل لسه بيستخدمها
- كل كارت interactive له `focus-visible:ring-2 ring-primary` للـ a11y
- موشن خفيف: `motion.div` مع `whileHover={{ y: -2 }}` على الكروت الكبيرة بس

## التنفيذ التدريجي (لتجنب فشل البيلد)

1. أنشئ `Bento.tsx` + اختبار typecheck
2. ProfileSettingsPage + NotificationSettingsPage + SettingsPrivacyPage (الأقصر)
3. CustomizationPage + LanguagePage + MemoryPage
4. AIPersonalizationPage + SkillsSettingsPage (الأطول)
5. SystemStatusPage + Support/Help/Contact + MegsyOperator
6. typecheck نهائي + تنظيف imports غير مستخدمة

## اللي مش هيتغير

- الـ business logic (Supabase calls, state, validation)
- الـ routes والـ navigation
- الموبايل cartoon shell
- `DesktopSettingsLayout` نفسه (الـ sidebar زي ما هو)
- `DesktopSettingsHome` (متعدّل بالفعل)
