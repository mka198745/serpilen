import React from "react";
import { db } from "@/db";
import { products, productVariants, categories, posShifts, customers } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getSessionUser, getStaffUserFromKt } from "@/lib/auth";
import { StripQueryParam } from "@/components/layout/StripQueryParam";
import { AUTH_ENABLED } from "@/lib/auth-flag";
import { PosTerminalClient } from "./PosTerminalClient";

export const dynamic = "force-dynamic";

export default async function PosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (AUTH_ENABLED) {
    const sessionUser = await getSessionUser();
    let staff = !!sessionUser?.isStaff;
    if (!staff) {
      const { kt } = await searchParams;
      staff = !!(await getStaffUserFromKt(kt));
    }
    if (!staff) redirect("/?giris=1&next=/pos");
  }
  const allProds = await db.select().from(products);
  const allVariants = await db.select().from(productVariants);
  const allCats = await db.select().from(categories);
  const allCustomers = await db.select().from(customers);

  const openShift =
    (
      await db
        .select()
        .from(posShifts)
        .where(and(eq(posShifts.warehouseId, 2), eq(posShifts.status, "OPEN")))
        .orderBy(desc(posShifts.id))
        .limit(1)
    )[0] || null;

  const catalog = allProds.map((p) => ({
    ...p,
    variants: allVariants.filter((v) => v.productId === p.id),
  }));

  return (
    <>
      <StripQueryParam name="kt" />
    <PosTerminalClient
      initialProducts={catalog}
      categories={allCats}
      customers={allCustomers}
      initialShift={openShift}
    />
    </>
  );
}
