import { NextResponse } from "next/server";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** POST /api/customers — Web POS "hızlı müşteri" kaydı (yalnızca personel). */
export async function POST(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;

  try {
    const body = await request.json();
    const name = String(body?.name ?? "").trim();
    const phone = String(body?.phone ?? "").trim();
    const email = body?.email ? String(body.email).trim().toLowerCase() : null;
    const city = body?.city ? String(body.city).trim() : "İstanbul";

    if (!name || !phone) {
      return NextResponse.json(
        { success: false, error: "Ad ve telefon zorunludur." },
        { status: 422 }
      );
    }

    const [{ id }] = await db
      .insert(customers)
      .values({
        type: "B2C",
        name,
        phone,
        email,
        city,
        segment: "YENİ",
      })
      .returning({ id: customers.id });
    const [created] = await db.select().from(customers).where(eq(customers.id, id));

    return NextResponse.json({ success: true, data: created });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
