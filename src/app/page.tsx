"use client";

import { useState, useCallback } from "react";
import * as XLSX from "xlsx";
import AdBanner from "./components/AdBanner";

interface ProgressItem {
  id: string;
  image_name: string;
  status: "pending" | "downloading" | "success" | "failed";
  error?: string;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (
      droppedFile &&
      (droppedFile.name.endsWith(".xlsx") || droppedFile.name.endsWith(".xls"))
    ) {
      setFile(droppedFile);
      setError(null);
      setDownloadUrl(null);
      setProgress([]);
    } else {
      setError("Please upload an Excel file (.xlsx or .xls)");
    }
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) {
        setFile(selectedFile);
        setError(null);
        setDownloadUrl(null);
        setProgress([]);
      }
    },
    []
  );

  const handleDownloadTemplate = () => {
    const sampleData = [
        { id: "001", image_name: "Laptop" },
        { id: "002", image_name: "Wireless Mouse" },
        { id: "003", image_name: "Mechanical Keyboard" },
      ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, "sample_template.xlsx");
  };

  const handleSubmit = async () => {
    if (!file) {
      setError("Please select a file first");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setDownloadUrl(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/process", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to process file");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response stream");
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n").filter((line) => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.type === "progress") {
              setProgress(data.items);
            } else if (data.type === "complete") {
              setDownloadUrl(data.downloadUrl);
            } else if (data.type === "error") {
              setError(data.message);
            }
          } catch {
            // Ignore parsing errors for incomplete chunks
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsProcessing(false);
    }
  };

  const completedCount = progress.filter((p) => p.status === "success").length;
  const failedCount = progress.filter((p) => p.status === "failed").length;
  const totalCount = progress.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Bulk Image Downloader
          </h1>
            <p className="text-lg text-purple-200">
              Upload an Excel file with IDs and image names to download images
              automatically
            </p>
          </div>

          {/* Top Ad Banner */}
          <AdBanner adSlot="6776295634" adFormat="horizontal" className="mb-8" />

        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20">
          {/* File Upload Area */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-300 ${
              isDragging
                ? "border-purple-400 bg-purple-500/20"
                : "border-white/30 hover:border-purple-400 hover:bg-white/5"
            }`}
          >
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isProcessing}
            />
            <div className="space-y-4">
              <div className="w-16 h-16 mx-auto bg-purple-500/30 rounded-full flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-purple-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              </div>
              <div>
                <p className="text-xl font-semibold text-white">
                  {file ? file.name : "Drop your Excel file here"}
                </p>
                <p className="text-purple-200 mt-2">
                  or click to browse (supports .xlsx, .xls)
                </p>
              </div>
            </div>
          </div>

          {/* Excel Format Info + Template Download */}
          <div className="mt-6 p-4 bg-white/5 rounded-lg border border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-purple-200">
              <span className="font-semibold text-white">
                Required columns:
              </span>{" "}
                <code className="bg-purple-500/30 px-2 py-0.5 rounded">
                  id
                </code>{" "}
                and{" "}
                <code className="bg-purple-500/30 px-2 py-0.5 rounded">
                  image_name
                </code>
            </p>
            <button
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600/50 hover:bg-purple-600/80 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap border border-purple-500/30"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Download Sample Template
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mt-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
              <p className="text-red-300">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={!file || isProcessing}
            className={`mt-6 w-full py-4 px-6 rounded-xl font-semibold text-lg transition-all duration-300 ${
              !file || isProcessing
                ? "bg-gray-600 cursor-not-allowed text-gray-400"
                : "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-lg hover:shadow-purple-500/50"
            }`}
          >
            {isProcessing ? (
              <span className="flex items-center justify-center gap-3">
                <svg
                  className="animate-spin h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Processing... ({completedCount + failedCount}/{totalCount})
              </span>
            ) : (
              "Download Images"
            )}
          </button>

          {/* Progress List */}
          {progress.length > 0 && (
            <div className="mt-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-white">Progress</h3>
                <div className="flex gap-4 text-sm">
                  <span className="text-green-400">
                    Success: {completedCount}
                  </span>
                  <span className="text-red-400">Failed: {failedCount}</span>
                  <span className="text-purple-200">Total: {totalCount}</span>
                </div>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-white/10 rounded-full h-2 mb-4">
                <div
                  className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all duration-500"
                  style={{
                    width: `${
                      totalCount > 0
                        ? ((completedCount + failedCount) / totalCount) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
              <div className="max-h-80 overflow-y-auto space-y-2 pr-2">
                {progress.map((item, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border transition-all duration-300 ${
                      item.status === "success"
                        ? "bg-green-500/10 border-green-500/30"
                        : item.status === "failed"
                        ? "bg-red-500/10 border-red-500/30"
                        : item.status === "downloading"
                        ? "bg-yellow-500/10 border-yellow-500/30"
                        : "bg-white/5 border-white/10"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white truncate">
                            {item.id} - {item.image_name}
                          </p>
                        {item.error && (
                          <p className="text-xs text-red-400 mt-1">
                            {item.error}
                          </p>
                        )}
                      </div>
                      <div className="ml-4">
                        {item.status === "pending" && (
                          <span className="text-gray-400 text-sm">Pending</span>
                        )}
                        {item.status === "downloading" && (
                          <svg
                            className="animate-spin h-5 w-5 text-yellow-400"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                          </svg>
                        )}
                        {item.status === "success" && (
                          <svg
                            className="h-5 w-5 text-green-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                        {item.status === "failed" && (
                          <svg
                            className="h-5 w-5 text-red-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Download Button */}
          {downloadUrl && (
            <div className="mt-8 p-6 bg-green-500/10 border border-green-500/30 rounded-xl text-center">
              <svg
                className="w-12 h-12 mx-auto text-green-400 mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-green-300 text-lg mb-4">
                Images downloaded successfully!
              </p>
              <a
                href={downloadUrl}
                download="images.zip"
                className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-lg transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Download ZIP File
              </a>
            </div>
          )}
          </div>

          {/* Middle Ad Banner */}
          <AdBanner adSlot="5463213962" adFormat="rectangle" className="mt-8" />

          {/* Footer */}
          <p className="text-center text-purple-300/60 mt-8 text-sm">
            Powered by Bing Image Search
          </p>

          {/* Bottom Ad Banner */}
          <AdBanner adSlot="4150132290" adFormat="horizontal" className="mt-4" />
        </div>
      </div>
  );
}
