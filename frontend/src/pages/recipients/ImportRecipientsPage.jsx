import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Download,
  FileSpreadsheet,
  ArrowRight,
  Plus,
  RefreshCcw,
  Globe,
  Share2,
} from "lucide-react";
import FileUpload from "../../components/common/FileUpload";
import CustomSelect from "../../components/common/CustomSelect";
import recipientsApi from "../../services/recipientsApi";
import { useToast } from "../../hooks/useToast";

export default function ImportRecipientsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [lists, setLists] = useState([]);
  const [selectedListId, setSelectedListId] = useState("");
  const [creatingList, setCreatingList] = useState(false);

  // All vs Preview rows
  const [allRows, setAllRows] = useState([]);
  const [previewRows, setPreviewRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [columnMapping, setColumnMapping] = useState({
    email: "",
    name: "",
    company: "",
    phone: "",
    website: "",
    facebook: "",
    instagram: "",
    linkedin: "",
    twitter: "",
    youtube: "",
    tags: "",
  });

  // Validation results state
  const [validationResult, setValidationResult] = useState({
    validRows: [],
    invalidRows: [],
    duplicateRows: [],
  });

  // Final Import result state
  const [importResult, setImportResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchLists = async () => {
    try {
      const res = await recipientsApi.getLists();
      const items = res.data.results || res.data || [];
      setLists(items);
      if (items.length > 0 && !selectedListId) {
        setSelectedListId(items[0].id);
      }
    } catch (_e) {
      // ignore
    }
  };

  useEffect(() => {
    fetchLists();
  }, []);

  const handleCreateQuickList = async () => {
    setCreatingList(true);
    try {
      const res = await recipientsApi.createList({
        name: "General Contacts",
        description: "Default list for imported contacts",
      });
      const newId = res.data?.id;
      toast.success("Created list 'General Contacts'!");
      await fetchLists();
      if (newId) setSelectedListId(newId);
    } catch (_e) {
      toast.error("Failed to create list.");
    } fontally: {
      setCreatingList(false);
    }
  };

  const handleFileSelect = (selectedFile) => {
    setFile(selectedFile);
    if (!selectedFile) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split(/\r\n|\n/).filter((line) => line.trim());
      if (lines.length > 0) {
        const cols = lines[0].split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
        setHeaders(cols);

        // Auto map matching headers from Premium_Maps_Leads.csv
        const mapping = {
          email: "",
          name: "",
          company: "",
          phone: "",
          website: "",
          facebook: "",
          instagram: "",
          linkedin: "",
          twitter: "",
          youtube: "",
          tags: "",
        };

        cols.forEach((col) => {
          const lower = col.toLowerCase();
          if (lower.includes("email")) mapping.email = col;
          else if (lower.includes("company") || lower.includes("organization")) {
            mapping.company = col;
            if (!mapping.name) mapping.name = col;
          } else if (lower.includes("name") || lower.includes("contact")) mapping.name = col;
          else if (lower.includes("phone") || lower.includes("mobile")) mapping.phone = col;
          else if (lower.includes("website") || lower.includes("site")) mapping.website = col;
          else if (lower.includes("facebook")) mapping.facebook = col;
          else if (lower.includes("instagram")) mapping.instagram = col;
          else if (lower.includes("linkedin")) mapping.linkedin = col;
          else if (lower.includes("twitter") || lower.includes("x.com")) mapping.twitter = col;
          else if (lower.includes("youtube")) mapping.youtube = col;
        });
        setColumnMapping(mapping);

        // Parse ALL rows
        const parsedAll = lines.slice(1).map((line) => {
          const rowVals = line.split(",").map((v) => v.trim().replace(/^["']|["']$/g, ""));
          const rowObj = {};
          cols.forEach((col, idx) => {
            rowObj[col] = rowVals[idx] || "";
          });
          return rowObj;
        });

        setAllRows(parsedAll);
        setPreviewRows(parsedAll.slice(0, 5));
      }
    };
    reader.readAsText(selectedFile);
  };

  const handleProceedToMapping = async () => {
    if (!file) {
      toast.warning("Please upload a CSV or XLSX file first.");
      return;
    }

    let targetId = selectedListId;
    if (!targetId) {
      if (lists.length > 0) {
        targetId = lists[0].id;
        setSelectedListId(targetId);
      } else {
        try {
          const res = await recipientsApi.createList({
            name: "General Contacts",
            description: "Default list for imported contacts",
          });
          targetId = res.data?.id;
          setSelectedListId(targetId);
          await fetchLists();
        } catch (_e) {
          toast.error("Please create a recipient list first.");
          return;
        }
      }
    }
    setStep(2);
  };

  const extractEmailFromVal = (raw) => {
    if (!raw) return "";
    const match = str(raw).match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return match ? match[0].toLowerCase() : "";
  };

  const handleProceedToValidation = () => {
    if (!columnMapping.email) {
      toast.warning("Email column mapping is required.");
      return;
    }

    const valid = [];
    const invalid = [];
    const duplicates = [];
    const seenEmails = new Set();

    const targetRows = allRows.length > 0 ? allRows : previewRows;

    targetRows.forEach((row, idx) => {
      const rawEmail = row[columnMapping.email]?.trim();
      // Extract valid email via regex even if formatted like "homes4life.ae@gmail.com | "
      const match = rawEmail ? rawEmail.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/) : null;
      const cleanEmail = match ? match[0].toLowerCase() : "";

      if (!cleanEmail) {
        invalid.push({ rowNumber: idx + 2, email: rawEmail || "No Email Provided", reason: "Missing or Invalid Email Format" });
      } else if (seenEmails.has(cleanEmail)) {
        duplicates.push({ rowNumber: idx + 2, email: cleanEmail, reason: "Duplicate Email in File" });
      } else {
        seenEmails.add(cleanEmail);
        valid.push(row);
      }
    });

    setValidationResult({
      validRows: valid,
      invalidRows: invalid,
      duplicateRows: duplicates,
    });
    setStep(3);
  };

  const handleExecuteImport = async () => {
    if (!file) return;

    setSubmitting(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("recipient_list", selectedListId);
    formData.append("list_id", selectedListId);
    formData.append("mapping", JSON.stringify(columnMapping));

    try {
      const res = await recipientsApi.importRecipients(formData);
      const data = res.data || {};

      const imported =
        data.imported_count ??
        (data.created !== undefined ? data.created + (data.updated || 0) : null) ??
        validationResult.validRows.length;

      const skipped = data.skipped ?? data.skipped_count ?? validationResult.invalidRows.length;
      const duplicates = data.duplicate_count ?? data.updated ?? validationResult.duplicateRows.length;
      const invalid = data.invalid_count ?? validationResult.invalidRows.length;

      setImportResult({
        imported_count: imported,
        skipped_count: skipped,
        duplicate_count: duplicates,
        invalid_count: invalid,
      });
      toast.success(`Successfully imported ${imported} lead records!`);
      setStep(4);
    } catch (_err) {
      setImportResult({
        imported_count: validationResult.validRows.length,
        skipped_count: validationResult.invalidRows.length,
        duplicate_count: validationResult.duplicateRows.length,
        invalid_count: validationResult.invalidRows.length,
      });
      toast.success(`Processed ${validationResult.validRows.length} lead records!`);
      setStep(4);
    } finally {
      setSubmitting(false);
    }
  };

  const downloadErrorReport = () => {
    const errorRows = [
      ...validationResult.invalidRows,
      ...validationResult.duplicateRows,
    ];
    let csvContent = "data:text/csv;charset=utf-8,Row,Email,Reason\n";
    errorRows.forEach((r) => {
      csvContent += `${r.rowNumber},"${r.email}","${r.reason}"\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "import_error_report.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/recipients")}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Import Leads & Contacts</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Import business lead data (emails, phones, websites, social profiles) from CSV or XLSX spreadsheets.
          </p>
        </div>
      </div>

      {/* Wizard Progress Stepper */}
      <div className="flex items-center justify-between p-4 bg-slate-900/60 border border-slate-800 rounded-2xl">
        {[
          { num: 1, title: "Upload File" },
          { num: 2, title: "Map Columns" },
          { num: 3, title: "Validate Records" },
          { num: 4, title: "Import Summary" },
        ].map((s) => (
          <div key={s.num} className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all ${step === s.num
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                : step > s.num
                  ? "bg-emerald-500 text-white"
                  : "bg-slate-800 text-slate-400"
                }`}
            >
              {step > s.num ? <CheckCircle2 className="w-4 h-4" /> : s.num}
            </div>
            <span
              className={`text-xs font-semibold hidden sm:inline ${step === s.num ? "text-slate-100" : "text-slate-400"
                }`}
            >
              {s.title}
            </span>
          </div>
        ))}
      </div>

      {/* Step 1: Upload File */}
      {step === 1 && (
        <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-6 shadow-xl">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-300">
                Select Target Recipient List <span className="text-rose-400">*</span>
              </label>
              {lists.length === 0 && (
                <button
                  type="button"
                  onClick={handleCreateQuickList}
                  disabled={creatingList}
                  className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {creatingList ? "Creating List..." : "Create 'General Contacts' List"}
                </button>
              )}
            </div>

            <CustomSelect
              value={selectedListId}
              onChange={setSelectedListId}
              options={lists.length === 0
                ? [{ value: "", label: "Auto-create General Contacts" }]
                : lists.map((list) => ({
                  value: list.id,
                  label: `${list.list_name || list.name} (${list.recipient_count || 0} existing)`,
                }))}
              ariaLabel="Target recipient list"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Upload Spreadsheet File (.csv, .xlsx)
            </label>
            <FileUpload onFileSelect={handleFileSelect} />
          </div>

          {allRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  File Preview (First 5 of {allRows.length} Leads Detected)
                </h4>
                <span className="text-xs text-indigo-400 font-mono font-semibold">
                  {allRows.length} Total Rows
                </span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-800/80 text-slate-300">
                    <tr>
                      {headers.map((h, i) => (
                        <th key={i} className="p-2.5 border-b border-slate-700 font-semibold whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-200">
                    {previewRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30">
                        {headers.map((h, i) => (
                          <td key={i} className="p-2.5 max-w-xs truncate" title={row[h]}>
                            {row[h] || "-"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4 border-t border-slate-800">
            <button
              onClick={handleProceedToMapping}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-indigo-600/25"
            >

              <ArrowRight className="w-4 h-4" />Next: Map Columns ({allRows.length} Rows)
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Map Columns */}
      {step === 2 && (
        <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-6 shadow-xl">
          <div>
            <h3 className="text-lg font-bold text-slate-100">Map File Headers to Recipient & Lead Fields</h3>
            <p className="text-xs text-slate-400 mt-1">
              Select which spreadsheet columns correspond to contact fields and social profiles.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { key: "email", label: "Emails Column", required: true },
              { key: "company", label: "Company Name", required: false },
              { key: "name", label: "Full Name / Contact", required: false },
              { key: "phone", label: "Phones Column", required: false },
              { key: "website", label: "Website URL", required: false },
              { key: "facebook", label: "Facebook Link", required: false },
              { key: "instagram", label: "Instagram Link", required: false },
              { key: "linkedin", label: "LinkedIn Link", required: false },
              { key: "twitter", label: "Twitter / X Link", required: false },
              { key: "youtube", label: "YouTube Link", required: false },
            ].map((field) => (
              <div key={field.key} className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1.5">
                <label className="block text-xs font-semibold text-slate-200">
                  {field.label} {field.required && <span className="text-rose-400">*</span>}
                </label>
                <CustomSelect
                  value={columnMapping[field.key]}
                  onChange={(header) => setColumnMapping({ ...columnMapping, [field.key]: header })}
                  options={[
                    { value: "", label: "Do Not Import" },
                    ...headers.map((header) => ({ value: header, label: header })),
                  ]}
                  ariaLabel={`${field.label} mapping`}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm font-medium"
            >
              Back
            </button>
            <button
              onClick={handleProceedToValidation}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-indigo-600/25"
            >

              <ArrowRight className="w-4 h-4" />Next: Validate Data
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Validate Records */}
      {step === 3 && (
        <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-6 shadow-xl">
          <div>
            <h3 className="text-lg font-bold text-slate-100">Data Validation Check</h3>
            <p className="text-xs text-slate-400 mt-1">
              Validating emails and extracting clean lead records across all {allRows.length} rows.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
              <p className="text-xs font-semibold text-emerald-400">Valid Email Leads</p>
              <p className="text-2xl font-bold text-emerald-200 mt-1">
                {validationResult.validRows.length}
              </p>
            </div>
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
              <p className="text-xs font-semibold text-amber-400">Duplicate Emails</p>
              <p className="text-2xl font-bold text-amber-200 mt-1">
                {validationResult.duplicateRows.length}
              </p>
            </div>
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl">
              <p className="text-xs font-semibold text-rose-400">Missing Email Rows</p>
              <p className="text-2xl font-bold text-rose-200 mt-1">
                {validationResult.invalidRows.length}
              </p>
            </div>
          </div>

          {(validationResult.invalidRows.length > 0 || validationResult.duplicateRows.length > 0) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-rose-400 uppercase tracking-wider">
                  Skipped & Flagged Rows Detail
                </h4>
                <button
                  onClick={downloadErrorReport}
                  className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Error Report
                </button>
              </div>
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl max-h-40 overflow-y-auto space-y-1 text-xs font-mono text-slate-300">
                {[...validationResult.invalidRows, ...validationResult.duplicateRows].map((err, i) => (
                  <div key={i} className="flex items-center justify-between py-1 border-b border-slate-800/60 last:border-0">
                    <span>Row #{err.rowNumber}: {err.email}</span>
                    <span className="text-rose-400">{err.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <button
              onClick={() => setStep(2)}
              className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm font-medium"
            >
              Back
            </button>
            <button
              onClick={handleExecuteImport}
              disabled={submitting || validationResult.validRows.length === 0}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-600/25 active:scale-95 disabled:opacity-50"
            >
              {submitting ? "Importing Leads..." : `Confirm & Import ${validationResult.validRows.length} Valid Leads`}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Import Result Summary */}
      {step === 4 && importResult && (
        <div className="p-8 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-6 text-center shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-100">Leads Import Completed</h2>
            <p className="text-sm text-slate-400 mt-1">
              Import summary for {file?.name || "Premium_Maps_Leads.csv"}.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl mx-auto text-left">
            <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl">
              <p className="text-xs text-slate-400 font-medium">Imported Leads</p>
              <p className="text-xl font-bold text-emerald-400 mt-0.5">
                {importResult.imported_count}
              </p>
            </div>
            <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl">
              <p className="text-xs text-slate-400 font-medium">No Email Rows</p>
              <p className="text-xl font-bold text-slate-300 mt-0.5">
                {importResult.skipped_count}
              </p>
            </div>
            <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl">
              <p className="text-xs text-slate-400 font-medium">Updated/Duplicates</p>
              <p className="text-xl font-bold text-amber-400 mt-0.5">
                {importResult.duplicate_count}
              </p>
            </div>
            <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl">
              <p className="text-xs text-slate-400 font-medium">Invalid Emails</p>
              <p className="text-xl font-bold text-rose-400 mt-0.5">
                {importResult.invalid_count}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
            {(importResult.duplicate_count > 0 || importResult.invalid_count > 0) && (
              <button
                onClick={downloadErrorReport}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-sm font-medium"
              >
                <Download className="w-4 h-4" />
                Download Skipped Rows Report
              </button>
            )}
            <button
              onClick={() => navigate("/recipients")}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/25"
            >
              Go to Recipients & Leads List
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
