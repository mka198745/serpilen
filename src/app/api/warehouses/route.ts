import { NextResponse } from "next/server";
import { db } from "@/db";
import { warehouses } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { slugifyTr } from "@/lib/slug";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = ["CENTRAL", "STORE", "ONLINE", "WHOLESALE"] as const;

export async function GET() {
  const all = await db.select().from(warehouses).orderBy(desc(warehouses.id));
  return NextResponse.json({ success: true, data: all });
}

/** POST /api/warehouses — Admin panelinden manuel depo ekleme. Kod otomatik üretilir. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { name?: string; type?: string; address?: string };
  const name = String(body?.name || "").trim();
  const type = String(body?.type || "CENTRAL").toUpperCase();
  const address = body?.address ? String(body.address).trim() : null;

  if (!name) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Depo adı zorunludur." } },
      { status: 422 }
    );
  }
  if (!ALLOWED_TYPES.includes(type as (typeof ALLOWED_TYPES)[number])) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: `Geçersiz depo tipi. İzinli: ${ALLOWED_TYPES.join(", ")}` } },
      { status: 422 }
    );
  }

  try {
    const all = await db.select().from(warehouses);
    const existing = all.find((w) => w.name.toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR"));
    if (existing) {
      return NextResponse.json({ success: true, existed: true, data: existing });
    }

    // Kod üret: adın baş harflerinden benzersiz kısa kod (örn. "Bursa Depo" → BRD, çakışırsa BRD-2)
    const words = slugifyTr(name).split("-").filter(Boolean);
    const base = (words.map((w) => w[0]).join("").slice(0, 4) || "DEP").toUpperCase();
    let code = base;
    let suffix = 2;
    while (all.some((w) => w.code.toUpperCase() === code)) {
      code = `${base}-${suffix}`;
      suffix++;
    }

    const [{ id: __created_id }] = await db.insert(warehouses).values({ name, code, type, address }).$returningId();
    const [created] = await db.select().from(warehouses).where(eq(warehouses.id, __created_id));

    return NextResponse.json({ success: true, data: created });
  } catch (err: any) {
    console.error("Warehouse create error:", err);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: err?.message || "Depo eklenemedi." } }, { status: 500 });
  }
}
