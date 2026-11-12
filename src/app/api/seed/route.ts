import { NextResponse } from "next/server";
import { seedDatabase } from "@/db/seed";

import { requireStaff } from "@/lib/auth";
export async function GET(request: Request) {
  const __gate = await requireStaff(request);
  if (!__gate.ok) return __gate.response;

  try {
    const res = await seedDatabase();
    return NextResponse.json(res);
  } catch (error: any) {
    console.error("Seed error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const __gate = await requireStaff(request);
  if (!__gate.ok) return __gate.response;

  try {
    const res = await seedDatabase();
    return NextResponse.json(res);
  } catch (error: any) {
    console.error("Seed error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
