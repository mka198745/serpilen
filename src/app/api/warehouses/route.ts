import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  warehouses,
  warehouseLocations,
  inventory,
  inventoryReservations,
  inventoryLedger,
  stockCountSessions,
  orderReturns,
  posShifts,
  posCashTransactions,
  purchaseOrders,
  purchaseRequests,
  goodsReceipts,
} from "@/db/schema";
import { desc, eq, count } from "drizzle-orm";
import { slugifyTr } from "@/lib/slug";

import { requireStaff } from "@/lib/auth";
export const dynamic = "force-dynamic";

const ALLOWED_TYPES = ["CENTRAL", "STORE", "ONLINE", "WHOLESALE"] as const;

export async function GET(request: Request) {
  const __gate = await requireStaff(request);
  if (!__gate.ok) return __gate.response;

  const all = await db.select().from(warehouses).orderBy(desc(warehouses.id));
  return NextResponse.json({ success: true, data: all });
}

/** POST /api/warehouses — Admin panelinden manuel depo ekleme. Kod otomatik üretilir. */
export async function POST(request: Request) {
  const __gate = await requireStaff(request);
  if (!__gate.ok) return __gate.response;

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

    const [{ id: __created_id }] = await db.insert(warehouses).values({ name, code, type, address }).returning({ id: warehouses.id });
    const [created] = await db.select().from(warehouses).where(eq(warehouses.id, __created_id));

    return NextResponse.json({ success: true, data: created });
  } catch (err: any) {
    console.error("Warehouse create error:", err);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: err?.message || "Depo eklenemedi." } }, { status: 500 });
  }
}

/** PATCH /api/warehouses — Depo Aktif/Pasif (isActive) günceller. */
export async function PATCH(request: Request) {
  const __gate = await requireStaff(request);
  if (!__gate.ok) return __gate.response;

  const body = (await request.json().catch(() => ({}))) as { id?: number | string; isActive?: boolean };
  const id = Number(body?.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Geçerli bir depo id zorunludur." } },
      { status: 422 }
    );
  }
  if (typeof body?.isActive !== "boolean") {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "isActive (true/false) zorunludur." } },
      { status: 422 }
    );
  }
  try {
    const [existing] = await db.select().from(warehouses).where(eq(warehouses.id, id));
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Depo bulunamadı." } },
        { status: 404 }
      );
    }
    await db.update(warehouses).set({ isActive: body.isActive }).where(eq(warehouses.id, id));
    const [updated] = await db.select().from(warehouses).where(eq(warehouses.id, id));
    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    console.error("Warehouse patch error:", err);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: err?.message || "Depo güncellenemedi." } }, { status: 500 });
  }
}

/**
 * DELETE /api/warehouses?id=N (veya gövdede { id }) — Depoyu siler.
 * Depoya bağlı kayıt (stok, konum, vardiya, satın alma, iade, sayım, defter hareketleri)
 * varsa silmeyi REDDEDER (409) — veri kaybetmemek için.
 */
export async function DELETE(request: Request) {
  const __gate = await requireStaff(request);
  if (!__gate.ok) return __gate.response;

  const url = new URL(request.url);
  let id = Number(url.searchParams.get("id"));
  if (!Number.isFinite(id)) {
    const body = (await request.json().catch(() => ({}))) as { id?: number | string };
    id = Number(body?.id);
  }
  if (!Number.isFinite(id)) {
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Geçerli bir depo id zorunludur." } },
      { status: 422 }
    );
  }
  try {
    const [existing] = await db.select().from(warehouses).where(eq(warehouses.id, id));
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Depo bulunamadı." } },
        { status: 404 }
      );
    }
    const refs: [string, any][] = [
      ["stok kaydı", inventory],
      ["stok konumu", warehouseLocations],
      ["stok rezervasyonu", inventoryReservations],
      ["stok defteri hareketi", inventoryLedger],
      ["stok sayımı", stockCountSessions],
      ["iade kaydı", orderReturns],
      ["POS vardiyası", posShifts],
      ["POS nakit hareketi", posCashTransactions],
      ["satın alma siparişi", purchaseOrders],
      ["satın alma talebi", purchaseRequests],
      ["mal kabulü", goodsReceipts],
    ];
    const blockers: string[] = [];
    for (const [label, table] of refs) {
      try {
        const [row] = await db.select({ c: count(table.id) }).from(table as any).where(eq((table as any).warehouseId, id));
        if (Number(row?.c ?? 0) > 0) blockers.push(`${label} (${row.c})`);
      } catch {
        // tablo/kolon yoksa yoksay
      }
    }
    if (blockers.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "HAS_REFERENCES",
            message: `"${existing.name}" silinemez — bağlı kayıtlar var: ${blockers.join(", ")}. Depoyu kullanmak yerine pasife alabilirsiniz.`,
          },
        },
        { status: 409 }
      );
    }
    await db.delete(warehouses).where(eq(warehouses.id, id));
    return NextResponse.json({ success: true, data: { id } });
  } catch (err: any) {
    console.error("Warehouse delete error:", err);
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: err?.message || "Depo silinemedi." } }, { status: 500 });
  }
}
