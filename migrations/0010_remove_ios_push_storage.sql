DROP INDEX IF EXISTS idx_ios_push_subscription_environment;
DROP TABLE IF EXISTS ios_push_subscriptions;

DELETE FROM app_records
WHERE key IN ('push:warning-cron-state', 'push:warning-cron-health')
   OR key LIKE 'push:warning-office-batch-v2:%';
