import React from "react";
import { redirect } from "next/navigation";
import { getSessionUser, getStaffUserFromKt } from "@/lib/auth";
import { StripQueryParam } from "@/components/layout/StripQueryParam";
import { AUTH_ENABLED } from "@/lib/auth-flag";
import { readRoleMatrix, roleCanAccessModule } from "@/lib/role-matrix-server";
import { PosScreenGate } from "./PosScreenGate";
export const dynamic = "force-dynamic";
export default async function PosPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
 if(!AUTH_ENABLED)return <main role="alert" className="p-8">POS kullanımı için personel oturum sistemi etkin olmalıdır.</main>;
 const session=await getSessionUser();let staff=session?.isStaff?session:null;if(!staff){const {kt}=await searchParams;staff=await getStaffUserFromKt(kt);}if(!staff)redirect("/?giris=1&next=/pos");const role=staff.role;
 if(!roleCanAccessModule(await readRoleMatrix(),role,"pos"))return <><StripQueryParam name="kt"/><main role="alert" className="p-8">POS erişim yetkiniz bulunmuyor.</main></>;
 // No product, shift or customer data is serialized before PIN verification.
 return <><StripQueryParam name="kt"/><PosScreenGate/></>;
}
