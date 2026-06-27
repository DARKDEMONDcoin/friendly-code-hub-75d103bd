UPDATE public.media_provider_keys
SET notes = COALESCE(notes || E'\n', '') || 'يحتاج workspace_id و endpoint_host صحيح قبل الاستخدام (مفتاح أُضيف مؤخرًا وفشل لعدم تحديد المزود)'
WHERE id = 'b047571b-6d65-4100-be66-5b37d2c1b4cc';