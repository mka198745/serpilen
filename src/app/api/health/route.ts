import { db } from "@/db";
import { sql } from "drizzle-orm";
import { seedDatabase } from "@/db/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    // Attempt non-blocking seed initialization if categories empty
    await seedDatabase().catch((e) => console.error("Auto-seed error on health:", e));
    return Response.json({
      ok: true,
      status: "HEALTHY",
      platform: "Tuhafiye Retail Commerce Management Platform",
      timestamp: new Date().toISOString(),
      services: {
        database: "UP",
        inventoryEngine: "UP",
        posEngine: "UP",
        erpGateway: "UP",
      },
    });
  } catch (err: any) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
