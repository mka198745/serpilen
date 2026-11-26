import { randomUUID } from "node:crypto";
import { sqlite } from "@/db";
import { currentOrderYear, formatOrderNumber, nextSequenceFrom } from "@/lib/order-number";

/** Called within an immediate SQLite transaction so simultaneous requests cannot reuse a number. */
function allocate() {
  const year = currentOrderYear();
  const prefix = `SİP${year}%`;
  const rows = sqlite.prepare(`SELECT order_number FROM orders WHERE order_number LIKE ?
    UNION ALL SELECT order_number FROM order_number_reservations WHERE order_number LIKE ?`)
    .all(prefix, prefix) as { order_number: string }[];
  const orderNumber = formatOrderNumber(nextSequenceFrom(rows.map((r) => r.order_number), year), year);
  const token = randomUUID();
  sqlite.prepare("INSERT INTO order_number_reservations (token, order_number) VALUES (?, ?)").run(token, orderNumber);
  return { orderNumber, token };
}

export function reserveOnlineOrderNumber() {
  return sqlite.transaction(allocate).immediate();
}

/** Must be called within the order insert transaction. */
export function claimOnlineOrderNumber(token?: string, expected?: string): string {
  if (!token && !expected) {
    const reservation = allocate();
    sqlite.prepare("UPDATE order_number_reservations SET used = 1 WHERE token = ?").run(reservation.token);
    return reservation.orderNumber;
  }
  const reservation = sqlite.prepare("SELECT order_number FROM order_number_reservations WHERE token = ? AND used = 0")
    .get(token || "") as { order_number: string } | undefined;
  if (!reservation || reservation.order_number !== expected) {
    throw new Error("Sipariş numarası geçersiz veya daha önce kullanılmış. Lütfen ödeme sayfasını yenileyin.");
  }
  sqlite.prepare("UPDATE order_number_reservations SET used = 1 WHERE token = ?").run(token);
  return reservation.order_number;
}
