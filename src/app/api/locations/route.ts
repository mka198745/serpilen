import { NextResponse } from "next/server";
import { db } from "@/db";
import { warehouseLocations, warehouses } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const warehouseId = searchParams.get("warehouseId");

  let rows = await db.select().from(warehouseLocations).orderBy(desc(warehouseLocations.id));
  const allWh = await db.select().from(warehouses);

  if (warehouseId) rows = rows.filter((r) => r.warehouseId === Number(warehouseId));

  return NextResponse.json({
    success: true,
    data: rows.map((r) => ({
      ...r,
      warehouseName: allWh.find((w) => w.id === r.warehouseId)?.name || "Depo",
    })),
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    warehouseId?: number;
    zone?: string;
    aisle?: string;
    rack?: string;
    shelf?: string;
  };

  const warehouseId = Number(body?.warehouseId);
  if (!warehouseId) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Depo seçimi zorunludur." } }, { status: 422 });
  }

  const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, warehouseId)).limit(1);
  if (!wh) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Depo bulunamadı." } }, { status: 404 });
  }

  const zone = (body.zone || "A").trim().toUpperCase() || "A";
  const aisle = (body.aisle || "01").trim().padStart(2, "0") || "01";
  const rack = (body.rack || "01").trim().padStart(2, "0") || "01";
  const shelf = (body.shelf || "01").trim().padStart(2, "0") || "01";
  const locationCode = `${wh.code}-${zone}-${aisle}-${rack}-${shelf}`.replace(/--+/g, "-");

  const all = await db.select().from(warehouseLocations);
  const dup = all.find((l) => l.locationCode === locationCode && l.warehouseId === warehouseId);
  if (dup) {
    return NextResponse.json({ success: true, existed: true, data: dup });
  }

  const [{ id: __created_id }] = await db.insert(warehouseLocations).values({ warehouseId, locationCode, zone, aisle, rack, shelf }).$returningId();
  const [created] = await db.select().from(warehouseLocations).where(eq(warehouseLocations.id, __created_id));

  return NextResponse.json({ success: true, data: created });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { id?: number; zone?: string; aisle?: string; rack?: string; shelf?: string };
  const id = Number(body?.id);
  if (!id) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Lokasyon ID zorunludur." } }, { status: 422 });
  }

  const [row] = await db.select().from(warehouseLocations).where(eq(warehouseLocations.id, id)).limit(1);
  if (!row) return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Lokasyon bulunamadı." } }, { status: 404 });

  const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, row.warehouseId)).limit(1);
  const zone = (body.zone || row.zone || "A").toUpperCase();
  const aisle = (body.aisle || row.aisle || "01").padStart(2, "0");
  const rack = (body.rack || row.rack || "01").padStart(2, "0");
  const shelf = (body.shelf || row.shelf || "01").padStart(2, "0");

  await db.update(warehouseLocations).set({ zone, aisle, rack, shelf, locationCode: `${wh?.code || "DEP"}-${zone}-${aisle}-${rack}-${shelf}` }).where(eq(warehouseLocations.id, id));
  const [updated] = await db.select().from(warehouseLocations).where(eq(warehouseLocations.id, id));

  return NextResponse.json({ success: true, data: updated });
}
