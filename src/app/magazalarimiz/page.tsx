import React from "react";
import { Building2, MapPin, Warehouse } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { warehouses } from "@/db/schema";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  CENTRAL: "Merkez Depo",
  STORE: "Mağaza",
  ONLINE: "E-Ticaret Deposu",
  WHOLESALE: "Toptan Deposu",
};

export default async function StoresPage() {
  const locations = await db
    .select({ id: warehouses.id, name: warehouses.name, type: warehouses.type, address: warehouses.address })
    .from(warehouses)
    .where(eq(warehouses.isActive, true))
    .orderBy(asc(warehouses.id));

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 space-y-10">
      <div>
        <h1 className="text-3xl sm:text-4xl font-black text-stone-900 tracking-tight">
          Mağazalarımız &amp; Depo Noktalarımız
        </h1>
        <p className="text-stone-500 text-sm mt-1">Aktif mağaza ve depo noktalarımızı aşağıda bulabilirsiniz.</p>
      </div>

      {locations.length === 0 ? (
        <div className="rounded-3xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
          Şu anda gösterilecek aktif mağaza veya depo noktası bulunmuyor.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {locations.map((location) => {
            const isStore = location.type === "STORE";
            const Icon = isStore ? Building2 : Warehouse;
            return (
              <article key={location.id} className="bg-white p-6 rounded-3xl border border-stone-200 shadow-xs space-y-4">
                <div className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isStore ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"}`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${isStore ? "bg-amber-50 text-amber-900" : "bg-sky-50 text-sky-900"}`}>
                    {TYPE_LABELS[location.type] || "Depo"}
                  </span>
                </div>
                <h2 className="text-xl font-black text-stone-900">{location.name}</h2>
                {location.address?.trim() && (
                  <p className="flex items-start gap-2 text-sm leading-relaxed text-stone-600">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-800" aria-hidden="true" />
                    <span>{location.address}</span>
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
