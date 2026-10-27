export function createMapStartupRecovery({ setTimer, clearTimer, reload }) {
  let timer = null;
  let reloading = false;

  function cancel() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  function retry() {
    if (reloading) return;
    reloading = true;
    cancel();
    reload();
  }

  function schedule() {
    if (timer === null && !reloading) timer = setTimer(retry, 10000);
  }

  return { cancel, retry, schedule };
}
