import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import axios from "axios";
import * as cheerio from "cheerio";
import archiver from "archiver";
import fs from "fs";
import path from "path";
import os from "os";

interface ExcelRow {
  id: string | number;
  image_name: string;
}

interface ProgressItem {
  id: string;
  image_name: string;
  status: "pending" | "downloading" | "success" | "failed";
  error?: string;
}

async function searchBingImages(query: string): Promise<string[]> {
  const searchQuery = encodeURIComponent(query);
  const url = `https://www.bing.com/images/search?q=${searchQuery}&first=1`;

  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);
    const imageUrls: string[] = [];

    $("a.iusc").each((_, element) => {
      try {
        const m = $(element).attr("m");
        if (m) {
          const data = JSON.parse(m);
          if (data.murl) {
            imageUrls.push(data.murl);
          }
        }
      } catch {
        // Skip invalid JSON
      }
    });

    if (imageUrls.length === 0) {
      $("img.mimg").each((_, element) => {
        const src = $(element).attr("src") || $(element).attr("data-src");
        if (src && src.startsWith("http")) {
          imageUrls.push(src);
        }
      });
    }

    if (imageUrls.length === 0) {
      const scriptContent = response.data;
      const regex = /"murl":"(https?:\/\/[^"]+)"/g;
      let match;
      while ((match = regex.exec(scriptContent)) !== null) {
        imageUrls.push(match[1].replace(/\\u002f/g, "/"));
      }
    }

    return imageUrls.slice(0, 5);
  } catch (error) {
    console.error("Bing search error:", error);
    return [];
  }
}

async function downloadImage(
  url: string
): Promise<{ buffer: Buffer; extension: string } | null> {
  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/*",
      },
      maxRedirects: 5,
    });

    const contentType = response.headers["content-type"] || "";
    let extension = ".jpg";

    if (contentType.includes("png")) {
      extension = ".png";
    } else if (contentType.includes("gif")) {
      extension = ".gif";
    } else if (contentType.includes("webp")) {
      extension = ".webp";
    } else if (contentType.includes("jpeg") || contentType.includes("jpg")) {
      extension = ".jpg";
    }

    const buffer = Buffer.from(response.data);
    if (buffer.length < 1000) {
      return null;
    }

    return { buffer, extension };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const sendProgress = async (items: ProgressItem[]) => {
    await writer.write(
      encoder.encode(JSON.stringify({ type: "progress", items }) + "\n")
    );
  };

  const sendComplete = async (downloadUrl: string) => {
    await writer.write(
      encoder.encode(JSON.stringify({ type: "complete", downloadUrl }) + "\n")
    );
  };

  const sendError = async (message: string) => {
    await writer.write(
      encoder.encode(JSON.stringify({ type: "error", message }) + "\n")
    );
  };

  (async () => {
    try {
      const formData = await request.formData();
      const file = formData.get("file") as File;

      if (!file) {
        await sendError("No file uploaded");
        await writer.close();
        return;
      }

      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data: ExcelRow[] = XLSX.utils.sheet_to_json(worksheet);

      if (data.length === 0) {
        await sendError("Excel file is empty");
        await writer.close();
        return;
      }

        const firstRow = data[0];
        if (!("id" in firstRow) || !("image_name" in firstRow)) {
          await sendError(
            'Excel file must have "id" and "image_name" columns'
          );
          await writer.close();
          return;
        }

        const progressItems: ProgressItem[] = data.map((row) => ({
          id: String(row.id),
          image_name: String(row.image_name),
          status: "pending" as const,
        }));

      await sendProgress(progressItems);

      // Create temp directory for images
      const tempDir = path.join(os.tmpdir(), `image-download-${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });

        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          const rowId = String(row.id);
          const imageName = String(row.image_name).replace(/[/\\]/g, " ");

        progressItems[i].status = "downloading";
        await sendProgress(progressItems);

        try {
            // Search using exact image_name text only (no suffix)
            const imageUrls = await searchBingImages(imageName);

          if (imageUrls.length === 0) {
            progressItems[i].status = "failed";
            progressItems[i].error = "No images found";
            await sendProgress(progressItems);
            continue;
          }

          let downloaded = false;
          for (const url of imageUrls) {
            const result = await downloadImage(url);
            if (result) {
                const filePath = path.join(
                  tempDir,
                  `${rowId}${result.extension}`
                );
              fs.writeFileSync(filePath, result.buffer);
              downloaded = true;
              break;
            }
          }

          if (downloaded) {
            progressItems[i].status = "success";
          } else {
            progressItems[i].status = "failed";
            progressItems[i].error = "Failed to download image";
          }
        } catch (err) {
          progressItems[i].status = "failed";
          progressItems[i].error =
            err instanceof Error ? err.message : "Unknown error";
        }

        await sendProgress(progressItems);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Create ZIP file
      const fileId = Date.now().toString();
      const zipDir = path.join(os.tmpdir(), "image-downloader-zips");
      fs.mkdirSync(zipDir, { recursive: true });
      const finalZipPath = path.join(zipDir, `images-${fileId}.zip`);

      const output = fs.createWriteStream(finalZipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      await new Promise<void>((resolve, reject) => {
        output.on("close", resolve);
        archive.on("error", reject);
        archive.pipe(output);

        const files = fs.readdirSync(tempDir);
        for (const f of files) {
          const filePath = path.join(tempDir, f);
          archive.file(filePath, { name: f });
        }

        archive.finalize();
      });

      // Verify ZIP was created
      if (fs.existsSync(finalZipPath)) {
        const stats = fs.statSync(finalZipPath);
        console.log(`ZIP created: ${finalZipPath} (${stats.size} bytes)`);
        await sendComplete(`/api/download?id=${fileId}`);
      } else {
        await sendError("Failed to create ZIP file");
      }

      // Cleanup temp image directory
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    } catch (err) {
      await sendError(
        err instanceof Error ? err.message : "An error occurred"
      );
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
