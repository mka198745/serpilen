import React from "react";
import { db } from "@/db";
import { products, productVariants, customers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { B2BPortalClient } from "./B2BPortalClient";

export const dynamic = "force-dynamic";

export default async function B2BPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser?.isStaff) redirect("/?giris=1&next=/toptan-b2b");
  const allProds = await db.select().from(products);
  const allVariants = await db.select().from(productVariants);
  const b2bCustomers = await db.select().from(customers).where(eq(customers.type, "B2B"));

  const catalog = allProds.map((p) => ({
    ...p,
    variants: allVariants.filter((v) => v.productId === p.id),
  }));

  return <B2BPortalClient products={catalog} b2bCustomers={b2bCustomers} />;
}
