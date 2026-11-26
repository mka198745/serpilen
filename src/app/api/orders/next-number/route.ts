import { NextResponse } from "next/server";
import { reserveOnlineOrderNumber } from "@/lib/order-number-server";

// A number is reserved, rather than merely previewed, to keep bank-transfer references stable.
export async function POST() {
  try {
    return NextResponse.json({ success: true, ...reserveOnlineOrderNumber() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Sipariş numarası ayrılamadı:", error);
    return NextResponse.json({ success: false, error: "Sipariş numarası alınamadı." }, { status: 500 });
  }
}
