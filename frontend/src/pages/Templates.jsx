import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  Plus,
  Save,
  Trash2,
  LayoutTemplate,
  Code2,
  Sparkles,
  Copy,
  Info,
  CheckCircle2,
  FileCode,
  Wand2,
  Palette,
  Check,
  GripVertical,
} from "lucide-react";
import templatesApi from "../services/templatesApi";
import { useToast } from "../hooks/useToast";
import FormModal from "../components/common/FormModal";

const blockTypes = ["Heading", "Text", "Image", "Button", "Divider", "Spacer", "HTML"];

const RECIPIENT_VARIABLES = [
  { tag: "{name}", label: "Contact Name", desc: "Replaced with recipient's name" },
  { tag: "{company}", label: "Company Name", desc: "Replaced with recipient's company" },
  { tag: "{email}", label: "Email Address", desc: "Replaced with recipient's email" },
];

const PRESET_COLORS = [
  "#4f46e5", // Indigo
  "#0284c7", // Sky Blue
  "#059669", // Emerald
  "#e11d48", // Rose
  "#d97706", // Amber
  "#7c3aed", // Purple
  "#0f172a", // Dark Slate
  "#475569", // Slate Muted
  "#cbd5e1", // Light Gray
  "#ffffff", // White
];

const COLOR_PALETTES = [
  {
    name: "Indigo Modern",
    description: "Sleek, tech-focused corporate theme",
    colors: [
      { hex: "#4f46e5", name: "Primary Indigo" },
      { hex: "#1e293b", name: "Dark Text" },
      { hex: "#64748b", name: "Muted Text" },
      { hex: "#e0e7ff", name: "Soft Accent" },
    ],
  },
  {
    name: "Emerald Growth",
    description: "Fresh, vibrant green & nature theme",
    colors: [
      { hex: "#10b981", name: "Emerald Accent" },
      { hex: "#064e3b", name: "Deep Green Text" },
      { hex: "#047857", name: "Button Green" },
      { hex: "#d1fae5", name: "Mint Light" },
    ],
  },
  {
    name: "Ocean Breeze",
    description: "Clean, trustworthy blue tones",
    colors: [
      { hex: "#0284c7", name: "Ocean Blue" },
      { hex: "#0f172a", name: "Navy Dark" },
      { hex: "#38bdf8", name: "Sky Accent" },
      { hex: "#e0f2fe", name: "Ice Light" },
    ],
  },
  {
    name: "Sunset Passion",
    description: "High-energy red & pink promotion",
    colors: [
      { hex: "#e11d48", name: "Rose Primary" },
      { hex: "#881337", name: "Crimson Text" },
      { hex: "#f43f5e", name: "Vibrant Button" },
      { hex: "#ffe4e6", name: "Blush Light" },
    ],
  },
  {
    name: "Royal Purple",
    description: "Premium, luxury brand aesthetics",
    colors: [
      { hex: "#8b5cf6", name: "Violet Primary" },
      { hex: "#4c1d95", name: "Deep Purple Text" },
      { hex: "#a78bfa", name: "Soft Purple" },
      { hex: "#f3e8ff", name: "Lavender Light" },
    ],
  },
];

const RAW_HTML_PRESETS = {
  responsive: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Special Announcement</title>
</head>
<body style="margin:0; padding:20px; background-color:#f8fafc; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color:#334155;">
  <div style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg, #4f46e5, #7c3aed); padding:32px 24px; text-align:center; color:#ffffff;">
      <h1 style="margin:0; font-size:24px; font-weight:700;">Hello {name}!</h1>
      <p style="margin:8px 0 0; opacity:0.9; font-size:14px;">Exclusive Update for {company}</p>
    </div>
    <div style="padding:32px 24px; line-height:1.6;">
      <p style="font-size:15px; margin-top:0;">Dear {name},</p>
      <p style="font-size:15px;">We are excited to share a customized solution crafted specifically for <strong>{company}</strong>.</p>
      <div style="text-align:center; margin:32px 0;">
        <a href="https://annomous.com" style="background:#4f46e5; color:#ffffff; padding:12px 28px; border-radius:8px; text-decoration:none; font-weight:600; display:inline-block;">Explore Now</a>
      </div>
              <p style="font-size:14px; color:#64748b; margin-bottom:0;">Best regards,<br>The Mail Flow Team</p>
    </div>
  </div>
</body>
</html>`,

  minimal: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b;">
  <h2 style="color: #4f46e5;">Hi {name},</h2>
  <p>Thank you for connecting with us at <strong>{company}</strong>!</p>
  <p>We are reaching out to help streamline your mail campaigns with automated personalization.</p>
  <p style="margin-top: 24px;">
    <a href="https://annomous.com" style="background-color: #0f172a; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Get Started</a>
  </p>
</div>`,
};

function makeBlock(type) {
  const id = crypto.randomUUID();
  const defaults = {
    Heading: { text: "Hello {name} - Special Announcement for {company}", color: "#1e293b" },
    Text: { text: "Discover our latest features and upgrade your campaigns today.", color: "#475569" },
    Image: { src: "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=600&auto=format&fit=crop&q=80", alt: "Campaign banner" },
    Button: { text: "Get Started Now", url: "https://annomous.com", background: "#4f46e5", color: "#ffffff" },
    Divider: { color: "#cbd5e1" },
    Spacer: { height: 24 },
    HTML: { html: "<p style='color:#6366f1;font-weight:bold;'>Exclusive offer for {company}</p>" },
  };
  return { id, type: type.toLowerCase(), data: defaults[type] || {} };
}

function renderBlock(block) {
  if (!block || !block.data) return null;
  switch (block.type) {
    case "heading":
      return <h2 style={{ color: block.data.color || "#1e293b" }}>{block.data.text || ""}</h2>;
    case "text":
      return <p style={{ color: block.data.color || "#475569" }}>{block.data.text || ""}</p>;
    case "image":
      return <img src={block.data.src || ""} alt={block.data.alt || ""} style={{ maxWidth: "100%", borderRadius: "8px" }} />;
    case "button":
      return (
        <a
          className="email-button"
          href={block.data.url || "#"}
          style={{ backgroundColor: block.data.background || "#4f46e5", color: block.data.color || "#ffffff" }}
        >
          {block.data.text || "Button"}
        </a>
      );
    case "divider":
      return <hr style={{ borderColor: block.data.color || "#cbd5e1" }} />;
    case "spacer":
      return <div style={{ height: Number(block.data.height || 24) }} />;
    case "html":
      return (
        <iframe
          sandbox=""
          srcDoc={block.data.html || ""}
          title="HTML block preview"
          className="w-full min-h-20 border-0 bg-white pointer-events-none"
        />
      );
    default:
      return null;
  }
}

export default function Templates() {
  const { toast } = useToast();
  const [templateId, setTemplateId] = useState(null);
  const [title, setTitle] = useState("Welcome Lead Template");
  const [subject, setSubject] = useState("Exclusive Offer for {company}");
  const [description, setDescription] = useState("Default welcome template for new leads.");
  
  // Editor mode: "visual" | "raw"
  const [editorMode, setEditorMode] = useState("visual");
  const [rawHtml, setRawHtml] = useState(RAW_HTML_PRESETS.responsive);

  // Visual Blocks state
  const [blocks, setBlocks] = useState([makeBlock("Heading"), makeBlock("Text"), makeBlock("Button")]);
  const [selectedId, setSelectedId] = useState(blocks[0]?.id || null);

  // Drag and Drop state
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const [savedTemplates, setSavedTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewHtml, setPreviewHtml] = useState(null);

  // Color Palette Modal State
  const [isPaletteModalOpen, setIsPaletteModalOpen] = useState(false);
  const [activeColorKey, setActiveColorKey] = useState("color");

  const rawHtmlTextareaRef = useRef(null);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await templatesApi.getTemplates();
      const items = res.data.results || res.data || [];
      setSavedTemplates(items);
    } catch (_e) {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const selected = useMemo(() => blocks.find((b) => b.id === selectedId), [blocks, selectedId]);
  const layout = useMemo(() => ({ mode: editorMode, blocks, html: rawHtml }), [editorMode, blocks, rawHtml]);

  const updateData = (key, value) => {
    setBlocks((current) =>
      current.map((block) =>
        block.id === selectedId ? { ...block, data: { ...(block.data || {}), [key]: value } } : block
      )
    );
  };

  const move = (direction) => {
    setBlocks((current) => {
      const index = current.findIndex((block) => block.id === selectedId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const copy = [...current];
      [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
      return copy;
    });
  };

  const remove = () => {
    setBlocks((current) => {
      const index = current.findIndex((block) => block.id === selectedId);
      const remaining = current.filter((block) => block.id !== selectedId);
      if (remaining.length > 0) {
        const nextIndex = Math.max(0, index - 1);
        setSelectedId(remaining[nextIndex].id);
      } else {
        setSelectedId(null);
      }
      return remaining;
    });
  };

  const add = (type) => {
    const block = makeBlock(type);
    setBlocks((current) => [...current, block]);
    setSelectedId(block.id);
  };

  // Drag and drop handlers
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    setBlocks((prev) => {
      const updated = [...prev];
      const [movedItem] = updated.splice(draggedIndex, 1);
      updated.splice(targetIndex, 0, movedItem);
      return updated;
    });

    setDraggedIndex(null);
    setDragOverIndex(null);
    toast.info("Reordered email block section.");
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const insertVariable = (tag) => {
    if (editorMode === "raw") {
      setRawHtml((prev) => prev + " " + tag);
      toast.info(`Inserted variable ${tag} into Raw HTML Editor.`);
    } else if (selected && (selected.type === "heading" || selected.type === "text" || selected.type === "button" || selected.type === "html")) {
      const fieldKey = selected.type === "html" ? "html" : selected.type === "heading" ? "text" : selected.type === "text" ? "text" : "text";
      const currentVal = selected.data?.[fieldKey] || "";
      updateData(fieldKey, currentVal + " " + tag);
      toast.info(`Inserted variable ${tag} into block.`);
    } else {
      setSubject((prev) => prev + " " + tag);
      toast.info(`Inserted variable ${tag} into Email Subject.`);
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !subject.trim()) {
      toast.warning("Please enter a template title and subject line.");
      return;
    }

    if (editorMode === "visual" && blocks.length === 0) {
      toast.warning("Cannot save an empty visual template. Please add at least one block from the Blocks Library.");
      return;
    }

    if (editorMode === "raw" && !rawHtml.trim()) {
      toast.warning("Cannot save an empty raw HTML template.");
      return;
    }

    setSaving(true);
    try {
      let finalHtml = rawHtml;
      if (editorMode === "visual") {
        const renderRes = await templatesApi.renderLayout({ mode: "visual", blocks });
        finalHtml = renderRes.data?.html || "";
      }

      const payload = {
        title: title.trim(),
        subject: subject.trim(),
        description: description.trim(),
        json_layout: editorMode === "raw" ? { mode: "raw", html: rawHtml } : { mode: "visual", blocks },
        html: finalHtml,
      };

      if (templateId) {
        await templatesApi.updateTemplate(templateId, payload);
        toast.success("Template updated successfully.");
      } else {
        const createRes = await templatesApi.createTemplate(payload);
        setTemplateId(createRes.data?.id);
        toast.success("Template saved successfully.");
      }
      fetchTemplates();
    } catch (_e) {
      toast.error("Failed to save template.");
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    if (editorMode === "raw") {
      setPreviewHtml(rawHtml || "<div>No HTML content</div>");
      return;
    }

    if (blocks.length === 0) {
      toast.warning("Canvas is empty. Add blocks from the library to preview.");
      return;
    }

    try {
      const renderRes = await templatesApi.renderLayout({ mode: "visual", blocks });
      setPreviewHtml(renderRes.data?.html || "<div>No HTML content</div>");
    } catch (_e) {
      toast.error("Failed to render preview.");
    }
  };

  const loadTemplate = (tmpl) => {
    setTemplateId(tmpl.id);
    setTitle(tmpl.title || "");
    setSubject(tmpl.subject || "");
    setDescription(tmpl.description || "");

    const isRaw = tmpl.json_layout?.mode === "raw" || (!tmpl.json_layout?.blocks && Boolean(tmpl.html));
    if (isRaw) {
      setEditorMode("raw");
      setRawHtml(tmpl.html || tmpl.json_layout?.html || "");
    } else {
      setEditorMode("visual");
      const loadedBlocks = tmpl.json_layout?.blocks && Array.isArray(tmpl.json_layout.blocks)
        ? tmpl.json_layout.blocks
        : [];
      setBlocks(loadedBlocks);
      setSelectedId(loadedBlocks[0]?.id || null);
    }
    toast.info(`Loaded template '${tmpl.title}'`);
  };

  const handleDeleteSavedTemplate = async (e, id, tTitle) => {
    e.stopPropagation();
    try {
      await templatesApi.deleteTemplate(id);
      toast.success(`Template '${tTitle}' deleted.`);
      if (templateId === id) {
        handleNewTemplate();
      }
      fetchTemplates();
    } catch (_e) {
      toast.error("Failed to delete template.");
    }
  };

  const handleNewTemplate = () => {
    setTemplateId(null);
    setTitle("New Campaign Template");
    setSubject("Special Announcement for {company}");
    setDescription("Custom email template");
    setEditorMode("visual");
    const defaultBlocks = [makeBlock("Heading"), makeBlock("Text"), makeBlock("Button")];
    setBlocks(defaultBlocks);
    setSelectedId(defaultBlocks[0].id);
    setRawHtml(RAW_HTML_PRESETS.responsive);
  };

  const openPaletteForField = (fieldKey) => {
    setActiveColorKey(fieldKey);
    setIsPaletteModalOpen(true);
  };

  const applyPaletteColor = (hex) => {
    if (selected && activeColorKey) {
      updateData(activeColorKey, hex);
      toast.success(`Applied color ${hex} to block.`);
    }
    setIsPaletteModalOpen(false);
  };

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="page-heading">
        <div>
          <h1 className="flex items-center gap-2">
            <span>Email Template Builder</span>
          </h1>
          <p>Create visual block layouts or full Raw HTML code templates with dynamic variables.</p>
        </div>
        <div className="button-row">
          <button className="secondary" onClick={handleNewTemplate}>
            <Plus size={16} /> New Template
          </button>
          <button className="secondary" onClick={handlePreview}>
            <Eye size={16} /> Preview
          </button>
          <button className="primary" onClick={handleSave} disabled={saving}>
            <Save size={16} /> {saving ? "Saving..." : templateId ? "Update Template" : "Save Template"}
          </button>
        </div>
      </div>

      {/* Saved Templates Gallery */}
      {savedTemplates.length > 0 && (
        <div className="p-5 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
              <LayoutTemplate size={16} className="text-indigo-400" />
              Saved Templates Gallery
            </h3>
            <span className="text-xs font-medium px-2 py-1 bg-slate-800 text-slate-400 rounded-md">
              {savedTemplates.length} templates
            </span>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 max-h-[280px] overflow-y-auto pr-2 custom-scrollbar">
            {savedTemplates.map((t) => {
              const isSelected = templateId === t.id;
              return (
                <div
                  key={t.id}
                  onClick={() => loadTemplate(t)}
                  className={`group relative p-4 rounded-xl border transition-all duration-200 cursor-pointer flex flex-col h-24 justify-between ${
                    isSelected
                      ? "bg-indigo-900/20 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.15)] ring-1 ring-indigo-500/50"
                      : "bg-slate-800/40 border-slate-700/60 hover:bg-slate-800 hover:border-slate-600 hover:shadow-lg"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className={`font-semibold text-sm truncate ${isSelected ? "text-indigo-300" : "text-slate-200 group-hover:text-indigo-200"}`} title={t.title}>
                      {t.title}
                    </h4>
                    <button
                      onClick={(e) => handleDeleteSavedTemplate(e, t.id, t.title)}
                      className={`opacity-0 group-hover:opacity-100 p-1.5 -m-1.5 rounded-md transition-all ${
                        isSelected ? "text-indigo-400 hover:text-rose-400 hover:bg-rose-500/10" : "text-slate-500 hover:text-rose-400 hover:bg-rose-500/10"
                      }`}
                      title="Delete Template"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate" title={t.subject}>
                    {t.subject || "No subject"}
                  </p>
                  
                  {/* Selected Indicator */}
                  {isSelected && (
                    <div className="absolute -top-2 -right-2 bg-indigo-500 text-white p-1 rounded-full shadow-md border-2 border-slate-900">
                      <CheckCircle2 size={12} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recipient Personalization Variables Bar */}
      <div className="p-4 bg-indigo-950/40 border border-indigo-800/50 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-indigo-200 text-xs">
          <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>
            <strong>Recipient Variables:</strong> Click to insert variables into your Subject line or Template content. They are automatically replaced when emails are dispatched.
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {RECIPIENT_VARIABLES.map((v) => (
            <button
              key={v.tag}
              type="button"
              onClick={() => insertVariable(v.tag)}
              title={v.desc}
              className="px-3 py-1 bg-indigo-600/30 hover:bg-indigo-600/60 text-indigo-200 border border-indigo-500/40 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>{v.tag}</span>
              <span className="text-[10px] text-indigo-300 font-sans">({v.label})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Template Title & Subject Meta */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-slate-900/40 border border-slate-800 rounded-2xl shadow-sm">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            Template Title <span className="text-rose-500 text-base leading-none">*</span>
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Lead Welcome Series"
            className="w-full bg-slate-950/50 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            Email Subject <span className="text-rose-500 text-base leading-none">*</span>
          </label>
          <div className="relative flex items-center group">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Exclusive Offer for {company}"
              className="w-full bg-slate-950/50 border border-slate-700/80 rounded-xl pl-4 pr-[130px] py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner"
            />
            <div className="absolute right-2 flex items-center gap-1.5 opacity-60 group-focus-within:opacity-100 hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => setSubject((s) => s + (s && !s.endsWith(" ") ? " " : "") + "{name}")}
                className="text-[10px] bg-slate-800 hover:bg-indigo-600 text-indigo-300 hover:text-white px-2 py-1.5 rounded-lg border border-slate-700 hover:border-indigo-500 font-mono font-medium transition-all shadow-sm"
                title="Append {name} to subject"
              >
                +{`{name}`}
              </button>
              <button
                type="button"
                onClick={() => setSubject((s) => s + (s && !s.endsWith(" ") ? " " : "") + "{company}")}
                className="text-[10px] bg-slate-800 hover:bg-indigo-600 text-indigo-300 hover:text-white px-2 py-1.5 rounded-lg border border-slate-700 hover:border-indigo-500 font-mono font-medium transition-all shadow-sm"
                title="Append {company} to subject"
              >
                +{`{company}`}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mode Selector Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setEditorMode("visual")}
          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
            editorMode === "visual"
              ? "bg-indigo-600 text-white shadow-md"
              : "bg-slate-800/80 text-slate-300 hover:bg-slate-700"
          }`}
        >
          <LayoutTemplate size={15} /> Visual Block Builder
        </button>
        <button
          onClick={() => setEditorMode("raw")}
          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
            editorMode === "raw"
              ? "bg-indigo-600 text-white shadow-md"
              : "bg-slate-800/80 text-slate-300 hover:bg-slate-700"
          }`}
        >
          <Code2 size={15} /> Raw HTML Code Editor
        </button>
      </div>

      {/* Editor Content Area */}
      {editorMode === "visual" ? (
        /* VISUAL BLOCK BUILDER MODE */
        <div className="builder-grid">
          <aside className="builder-panel">
            <h3>Blocks Library</h3>
            <div className="block-library">
              {blockTypes.map((type) => (
                <button key={type} onClick={() => add(type)}>
                  <Plus size={15} /> {type}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
              💡 <strong>Tip:</strong> Drag sections on the canvas using the grip handles <GripVertical className="inline w-3 h-3" /> to easily reorder blocks before or after other sections.
            </p>
          </aside>

          <div className="email-stage">
            <div className="email-canvas">
              {blocks.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-slate-300 rounded-xl my-auto text-slate-400">
                  <LayoutTemplate className="w-12 h-12 mb-3 text-indigo-500 opacity-80" />
                  <h4 className="font-bold text-slate-700 text-base">Template Canvas is Empty</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed">
                    All blocks have been removed. Click any block type from the <strong>Blocks Library</strong> on the left to add items to your email layout.
                  </p>
                  <button
                    onClick={() => add("Heading")}
                    className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                  >
                    <Plus size={14} /> Add Heading Block
                  </button>
                </div>
              ) : (
                blocks.map((block, index) => {
                  const isSelected = selectedId === block.id;
                  const isDragging = draggedIndex === index;
                  const isDragOver = dragOverIndex === index && draggedIndex !== index;

                  return (
                    <div
                      key={block.id}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={(e) => handleDrop(e, index)}
                      onDragEnd={handleDragEnd}
                      onClick={() => setSelectedId(block.id)}
                      className={`canvas-block group relative transition-all duration-150 ${
                        isSelected ? "selected" : ""
                      } ${isDragging ? "opacity-40 border-2 border-dashed border-indigo-400 scale-[0.98]" : ""} ${
                        isDragOver ? "border-2 border-indigo-500 bg-indigo-50/60 shadow-lg shadow-indigo-500/10 scale-[1.01]" : ""
                      }`}
                    >
                      {/* Drag Grip Handle Badge */}
                      <div
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/80 text-slate-200 px-1.5 py-1 rounded-md text-[10px] flex items-center gap-1 cursor-grab active:cursor-grabbing shadow-md z-10"
                        title="Click and drag to reorder this section"
                      >
                        <GripVertical size={13} className="text-indigo-400" />
                        <span className="font-mono text-[9px]">Drag</span>
                      </div>

                      {renderBlock(block)}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <aside className="builder-panel">
            <h3>Block Settings</h3>
            {selected ? (
              <>
                <div className="settings-actions">
                  <button onClick={() => move(-1)} title="Move Up">
                    <ArrowUp size={15} />
                  </button>
                  <button onClick={() => move(1)} title="Move Down">
                    <ArrowDown size={15} />
                  </button>
                  <button onClick={remove} title="Delete Block" className="text-rose-400">
                    <Trash2 size={15} />
                  </button>
                </div>
                <span className="text-[11px] font-bold tracking-wider text-indigo-400 uppercase">
                  {selected.type} Block Settings
                </span>
                <div className="block-fields space-y-4 mt-3">
                  {selected.data &&
                    Object.entries(selected.data).map(([key, value]) => {
                      const isColorField = key === "color" || key === "background" || key.includes("color");

                      if (isColorField) {
                        return (
                          <div key={key} className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-slate-300 capitalize">
                                {key.replace("_", " ")} Color
                              </span>
                              <button
                                type="button"
                                onClick={() => openPaletteForField(key)}
                                className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 bg-slate-800 px-2 py-0.5 rounded border border-slate-700"
                              >
                                <Palette size={11} /> Choose Palette
                              </button>
                            </div>
                            
                            {/* Color Picker Control Bar */}
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={value || "#000000"}
                                onChange={(e) => updateData(key, e.target.value)}
                                className="w-8 h-8 rounded border border-slate-700 bg-transparent cursor-pointer"
                              />
                              <input
                                type="text"
                                value={value || ""}
                                onChange={(e) => updateData(key, e.target.value)}
                                placeholder="#000000"
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-indigo-500"
                              />
                            </div>

                            {/* Preset Swatches */}
                            <div className="flex items-center gap-1.5 flex-wrap pt-1">
                              {PRESET_COLORS.map((c) => (
                                <div
                                  key={c}
                                  onClick={() => updateData(key, c)}
                                  style={{ backgroundColor: c }}
                                  title={c}
                                  className={`w-5 h-5 rounded-md cursor-pointer border transition-transform hover:scale-110 ${
                                    value === c ? "border-white ring-2 ring-indigo-500" : "border-slate-700"
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      }

                      return (
                        <label key={key} className="flex flex-col gap-1.5 text-xs font-medium text-slate-300">
                          <span className="capitalize">{key.replace("_", " ")}</span>
                          {key === "html" || key === "text" ? (
                            <textarea
                              rows={3}
                              value={value || ""}
                              onChange={(e) => updateData(key, e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                            />
                          ) : (
                            <input
                              type={key === "height" ? "number" : "text"}
                              value={value || ""}
                              onChange={(e) => updateData(key, e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                            />
                          )}
                        </label>
                      );
                    })}
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400 mt-2">
                {blocks.length === 0
                  ? "The canvas is currently empty. Add a block from the library on the left to edit its properties."
                  : "Select a block on the canvas to edit its properties."}
              </p>
            )}
          </aside>
        </div>
      ) : (
        /* RAW HTML CODE EDITOR MODE */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* HTML Code Editor Input */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Raw HTML Code Input</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRawHtml(RAW_HTML_PRESETS.responsive)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-all"
                  title="Load Responsive Newsletter Template"
                >
                  Load Responsive Preset
                </button>
                <button
                  type="button"
                  onClick={() => setRawHtml(RAW_HTML_PRESETS.minimal)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-all"
                  title="Load Minimal Template"
                >
                  Load Minimal Preset
                </button>
              </div>
            </div>

            <textarea
              ref={rawHtmlTextareaRef}
              rows={20}
              value={rawHtml}
              onChange={(e) => setRawHtml(e.target.value)}
              placeholder="Paste or type your raw email HTML markup here... Use {name}, {company}, {email} for dynamic recipient variables."
              className="w-full font-mono text-xs p-3 bg-slate-950 border border-slate-800 text-slate-100 rounded-xl focus:outline-none focus:border-indigo-500 leading-relaxed resize-y"
            />
          </div>

          {/* Live Preview Frame */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Live HTML Preview</h3>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Updates in real-time</span>
            </div>

            <div className="bg-white rounded-xl border border-slate-300 h-[480px] overflow-hidden">
              <iframe
                sandbox=""
                srcDoc={rawHtml || "<html><body style='font-family:sans-serif;padding:20px;color:#94a3b8;'>(Empty HTML Content)</body></html>"}
                title="Live HTML Preview"
                className="w-full h-full border-0"
              />
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewHtml !== null && (
        <FormModal
          isOpen={true}
          onClose={() => setPreviewHtml(null)}
          title="Email Template Live Preview"
          subtitle="How your email renders in recipient inboxes."
          maxWidth="max-w-3xl"
        >
          <div className="p-4 bg-white rounded-xl border border-slate-300 min-h-[350px] overflow-y-auto">
            <iframe
              sandbox=""
              srcDoc={previewHtml}
              title="Template Preview"
              className="w-full min-h-[400px] border-0"
            />
          </div>
        </FormModal>
      )}

      {/* Color Palette Choice Modal */}
      {isPaletteModalOpen && (
        <FormModal
          isOpen={true}
          onClose={() => setIsPaletteModalOpen(false)}
          title="Choose Color Theme Palette"
          subtitle="Select from curated, harmonious color palettes for your email layout."
          maxWidth="max-w-xl"
        >
          <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1">
            {COLOR_PALETTES.map((palette) => (
              <div
                key={palette.name}
                className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl space-y-2 hover:border-indigo-500/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-200">{palette.name}</h4>
                    <p className="text-[11px] text-slate-400">{palette.description}</p>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 pt-1">
                  {palette.colors.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => applyPaletteColor(c.hex)}
                      className="p-2 bg-slate-950 border border-slate-800 hover:border-indigo-500 rounded-lg flex flex-col items-center gap-1.5 transition-all group cursor-pointer"
                    >
                      <div
                        style={{ backgroundColor: c.hex }}
                        className="w-6 h-6 rounded-full border border-slate-700 shadow-sm group-hover:scale-110 transition-transform"
                      />
                      <span className="text-[10px] font-mono text-slate-300">{c.hex}</span>
                      <span className="text-[9px] text-slate-400 truncate w-full text-center">{c.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </FormModal>
      )}
    </section>
  );
}
