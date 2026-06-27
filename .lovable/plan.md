
# خطة العمل

## 1) تجاوب الشاشات في وضع PWA (Mobile/Tablet/Desktop داخل التطبيق)

أبحث في `src/pages/chat/*` و `src/components/chat/*` عن نقاط الكسر (`md:`, `lg:`) المستخدمة الآن.
- أضيف utility hook `useViewportClass()` يصنّف الشاشات لـ: `xs` (≤360px), `sm` (361-480), `md` (481-768), `lg` (769-1024), `xl` (1025-1440), `2xl` (>1440).
- أعدّل صفحة الشات الفارغة (Hero "Let's build…") لتقلّل الـ vertical spacing على الشاشات الصغيرة عبر:
  - `min-h` ديناميكي بدل `min-h-screen` ثابت.
  - تقليص الـ margin-top للعنوان من الـ 30vh الحالي إلى `clamp(8vh, 12vh, 18vh)`.
  - رفع شريط الـ chips + الكومبوزر لأعلى ليلامس الـ safe-area.
- أضيف breakpoints مخصصة في `tailwind.config.ts`: `xs: 360, fold: 280, tab: 600, lap: 1024`.

## 2) System Prompt مخصص لكل نموذج + لوضع التعليم

- في `supabase/functions/_shared/` أضيف ملف `modelSystemPrompts.ts` يحتوي خريطة:
  - `learning` → برومبت تعليمي شامل (Markdown + خطوة-بخطوة + لا اختصار + أمثلة).
  - لكل model_slug (gpt-image-2, qwen-image, wan-2-7-t2v, kling, gemini-3-pro-image, ...) برومبت يبرز نقاط قوته.
- أعدّل `supabase/functions/chat-router/index.ts` (أو ما يقابله) ليحقن الـ system prompt حسب `chatMode` و `model_slug`.
- أضيف توجيه "لا تقدّم ردود مختصرة، اشرح بالتفصيل، استخدم تنسيق Markdown غني" داخل كل البرومبتات الافتراضية.

## 3) شريط الـ Loading: إزالة النقطة الإضافية

في `src/components/chat/*` و `src/pages/chat/components/*` أبحث عن مؤشرات اللودينج (Shimmer + النقطة المتحركة dot indicator) وأشيل العنصر الإضافي:
- المكوّن المتأثر غالبًا في `MediaResultCard`, `AssistantMediaBlock`, `ChatLoadingDots`, `ToolStatus`.
- أُبقي على نقطة واحدة فقط أو شيمر فقط (بدون النقطة الزائدة المكررة).

## 4) إخفاء "الشريطين فوق الكومبوزر" في وضع الكومبيوتر

عند تفعيل chip (Images/Videos/…) في الموبايل يظهر شريطان (Settings + Chips). على الديسكتوب يجب إخفاء أحدهما لأن الديسكتوب له تخطيط مختلف:
- في `src/pages/chat/ChatPage.tsx` (أو الـ Composer container) أحدّد الشريط الزائد، وأطبّق `hidden lg:hidden md:flex` بحيث يظهر للموبايل فقط ويختفي من الديسكتوب.

## 5) قوائم اختيار النماذج للصور/الفيديو على الديسكتوب (مربعين بدل واحد)

- أبحث في `src/components/chat/desktop/ModelPicker*.tsx` و `MediaModelSelect.tsx`.
- المشكلة على الأرجح dropdown ثنائي العمود غير مقصود — أعدّل الـ grid إلى `grid-cols-1` على الـ desktop dropdown، مع الحفاظ على الصور المصغّرة بجانب الاسم.

## 6) نظام إشعارات داخلي كامل (in-app، بدون إزعاج)

- جدول `notifications` (موجود حاليًا؟ سأتحقق وأضيفه لو ناقص) بحقول: `id, user_id, kind, title, body, link, read_at, created_at, severity`.
- مكوّن `<NotificationCenter />`: أيقونة جرس في الـ TopBar + Popover بقائمة الإشعارات + Realtime via Supabase channel.
- بدون أي toast/push يزعج المستخدم: كل شيء يُجمع داخل الجرس (badge عدّاد فقط).
- Hook: `useNotifications()` يقرأ، يعلّم كمقروء، ويفلتر حسب النوع.
- إشعارات تلقائية لـ: انتهاء توليد فيديو/صورة، فشل توليد، اشتراك يقترب على الانتهاء، رصيد منخفض.

## 7) نقاط تقنية مهمة

- استخدام `lovable-assets` فقط — لا أُدخل أصول ثقيلة في الريبو.
- كل التعديلات تحافظ على الـ theme tokens الموجودة (`brand-action`, `brand-ink`, `surface-*`).
- لا أكسر التوافق مع الباك إند الحالي؛ التعديلات SQL تُمرَّر عبر migration tool.
- النتائج تُختبر بصريًا عبر Playwright بعد التطبيق.

## ترتيب التنفيذ

1. إصلاحات UI السريعة (نقطة اللودينج، الشريط الزائد، قوائم النماذج المزدوجة).
2. تجاوب الشاشات + Hero spacing.
3. System Prompts (frontend + edge function).
4. نظام الإشعارات الداخلي (migration + UI + realtime).
5. اختبار شامل عبر Playwright على viewports مختلفة.

---

نظراً لحجم العمل (≈ 6 مهام متشعبة)، سأنفّذ على دفعات وأعرض تقدّم بعد كل دفعة. وافق على الخطة أو عدّل ما تريد إزالته/إضافته قبل أن أبدأ.
