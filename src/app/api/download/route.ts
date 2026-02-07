import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get("id");

  if (!fileId) {
    return NextResponse.json({ error: "Missing file ID" }, { status: 400 });
  }

  // Sanitize fileId to prevent path traversal
  const safeId = fileId.replace(/[^a-zA-Z0-9]/g, "");
  const zipDir = path.join(os.tmpdir(), "image-downloader-zips");
  const zipPath = path.join(zipDir, `images-${safeId}.zip`);

  if (!fs.existsSync(zipPath)) {
    return NextResponse.json(
      { error: "File not found. It may have expired." },
      { status: 404 }
    );
  }

  const zipBuffer = fs.readFileSync(zipPath);

  // Clean up after reading
  try {
    fs.unlinkSync(zipPath);
  } catch {
    // Ignore cleanup errors
  }

  return new NextResponse(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="images.zip"`,
      "Content-Length": zipBuffer.length.toString(),
    },
  });
}
