import React, { useState, useRef } from "react";
import { UploadCloud, File, X, AlertCircle } from "lucide-react";

export default function FileUpload({
  onFileSelect,
  accept = ".csv,.xlsx,.xls",
  maxSizeMb = 10,
  label = "Upload file (CSV or XLSX)",
}) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const handleFile = (file) => {
    setError(null);
    if (!file) return;

    const fileExt = file.name.split(".").pop().toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(fileExt)) {
      setError("Invalid file type. Please upload CSV or XLSX file.");
      return;
    }

    if (file.size > maxSizeMb * 1024 * 1024) {
      setError(`File size exceeds ${maxSizeMb}MB limit.`);
      return;
    }

    setSelectedFile(file);
    if (onFileSelect) onFileSelect(file);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleRemove = () => {
    setSelectedFile(null);
    setError(null);
    if (onFileSelect) onFileSelect(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="w-full space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(e) => handleFile(e.target.files[0])}
        className="hidden"
      />

      {!selectedFile ? (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${
            dragActive
              ? "border-indigo-500 bg-indigo-500/10 scale-[0.99]"
              : "border-slate-700/80 bg-slate-900/40 hover:border-slate-600 hover:bg-slate-900/60"
          }`}
        >
          <div className="p-3.5 rounded-full bg-slate-800 text-indigo-400 mb-3 shadow-sm">
            <UploadCloud className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-slate-200">{label}</p>
          <p className="text-xs text-slate-400 mt-1">Drag and drop file here, or click to browse</p>
          <p className="text-[11px] text-slate-500 mt-2">Supported: .csv, .xlsx (Max {maxSizeMb}MB)</p>
        </div>
      ) : (
        <div className="flex items-center justify-between p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <File className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-100">{selectedFile.name}</p>
              <p className="text-xs text-slate-400">
                {(selectedFile.size / 1024).toFixed(1)} KB
              </p>
            </div>
          </div>
          <button
            onClick={handleRemove}
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs text-rose-400 mt-1.5">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
