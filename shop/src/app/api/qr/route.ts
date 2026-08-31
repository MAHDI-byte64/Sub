import { NextResponse } from "next/server";
import QRCode from "qrcode";

/** تولید QR برای لینک اشتراک یا کانفیگ */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const data = searchParams.get("d");
  if (!data) return new NextResponse("missing data", { status: 400 });
  if (data.length > 2500) return new NextResponse("too long", { status: 413 });

  const png = await QRCode.toBuffer(data, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 420,
    color: { dark: "#0b1220", light: "#ffffff" },
  });

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=600",
    },
  });
}
