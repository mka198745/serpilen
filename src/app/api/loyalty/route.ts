import { NextResponse } from "next/server";
import { db } from "@/db";
import { loyaltyTransactions, customers, auditLogs } from "@/db/schema";
import { DEFAULT_SETTINGS, getSettings, saveSettings } from "@/lib/settings";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await getSettings();
    const txs = await db.select().from(loyaltyTransactions).orderBy(desc(loyaltyTransactions.id)).limit(30);
    const custs = await db.select().from(customers);
    const all = await db.select().from(loyaltyTransactions);

    const withBalance = custs
      .map((c) => {
        const earned = all.filter((t) => t.customerId === c.id && (t.type === "EARN" || t.type === "BONUS")).reduce((s, t) => s + t.points, 0);
        const spent = all.filter((t) => t.customerId === c.id && t.type === "SPEND").reduce((s, t) => s + Math.abs(t.points), 0);
        return {
          id: c.id,
          name: c.name,
          type: c.type,
          points: c.loyaltyPoints,
          earned,
          spent,
          tier: c.loyaltyPoints >= 1000 ? "VIP PLATİN" : c.loyaltyPoints >= 500 ? "ALTIN" : c.loyaltyPoints >= 100 ? "GÜMÜŞ" : "BRONZ",
        };
      })
      .sort((a, b) => b.points - a.points);

    return NextResponse.json({
      success: true,
      settings,
      defaults: Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([k, v]) => [k, v.value])),
      descriptions: Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([k, v]) => [k, v.description])),
      transactions: txs.map((t) => ({ ...t, createdAt: new Date(t.createdAt).toISOString(), customerName: custs.find((c) => c.id === t.customerId)?.name || "?" })),
      members: withBalance.slice(0, 20),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "SAVE_SETTINGS") {
      await saveSettings((body.settings || {}) as Record<string, string>);
      await db.insert(auditLogs).values({ userName: "Yönetici", action: "LOYALTY_SETTINGS", entity: "AppSettings", entityId: null, details: `Sadakat/ayar güncellendi: ${JSON.stringify(body.settings)}` });
      return NextResponse.json({ success: true, message: "Ayarlar kaydedildi." });
    }

    if (action === "ADJUST") {
      const points = Number(body.points);
      const [c] = await db.select().from(customers).where(eq(customers.id, Number(body.customerId))).limit(1);
      if (!c || !points) return NextResponse.json({ success: false, error: "Üye ve puan zorunlu." }, { status: 422 });
      const newBalance = Math.max(0, c.loyaltyPoints + points);
      await db.update(customers).set({ loyaltyPoints: newBalance }).where(eq(customers.id, c.id));
      await db.insert(loyaltyTransactions).values({
        customerId: c.id,
        points,
        type: points > 0 ? "BONUS" : "SPEND",
        description: body.description || (points > 0 ? "Yönetici bonus puanı" : "Yönetici düşümü"),
      });
      return NextResponse.json({ success: true, data: { balance: newBalance } });
    }

    return NextResponse.json({ success: false, error: "Bilinmeyen eylem." }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
