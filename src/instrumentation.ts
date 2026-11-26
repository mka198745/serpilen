export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { processOrderQueue } = await import("@/lib/order-queue");
  const { processStockReadyNotifications } = await import("@/lib/order-notifications");
  const tick = () => {
    try { processOrderQueue(); } catch (error) { console.error("Order queue maintenance failed:", error); }
    void processStockReadyNotifications().catch(error => console.error("Notification worker failed:", error));
  };
  tick();
  const timer = setInterval(tick, 30_000);
  timer.unref();
}
