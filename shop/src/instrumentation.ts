/** با بالا آمدن سرور Next اجرا می‌شود */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DISABLE_SCHEDULER === "1") return;

  const { startScheduler } = await import("@/lib/scheduler");
  startScheduler();
}
