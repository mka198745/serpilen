import { NextResponse } from "next/server";
import { sqlite } from "@/db";
import { requireStaff } from "@/lib/auth";
import { previewProductDeletion } from "@/lib/delete-product";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const raw = new URL(request.url).searchParams.get("id");
  const id = Number(raw);
  if (!raw || !/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(id)) return NextResponse.json({success:false,error:"Geçerli ürün numarası gereklidir."},{status:422,headers});
  try {
    const result = previewProductDeletion(sqlite,id,gate.user);
    if (result.status !== 200) return NextResponse.json({success:false,error:result.error},{status:result.status,headers});
    return NextResponse.json({success:true,data:result.preview},{headers});
  } catch {
    return NextResponse.json({success:false,error:"Ürün silme bilgileri doğrulanamadı."},{status:500,headers});
  }
}
