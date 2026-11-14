-- 0010 removed the v2 warning cache, but pre-v2 batches used this namespace.
-- No current code writes these records. Remove them once without adding
-- recurring maintenance queries or touching subscriptions and VAPID keys.
DELETE FROM app_records
WHERE key GLOB 'push:warning-office-batch:*';
