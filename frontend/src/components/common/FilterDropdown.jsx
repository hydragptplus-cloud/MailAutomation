import React, { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

export default function FilterDropdown({
  label,
  value,
  onChange,
  options = [],
  allLabel = "All",
  className = "",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getLabelForValue = (val) => {
    if (!val) return label ? `${label}: ${allLabel}` : allLabel;
    const opt = options.find((o) => (typeof o === "object" ? o.value === val : o === val));
    const lbl = opt ? (typeof opt === "object" ? opt.label : opt) : val;
    return label ? `${label}: ${lbl}` : lbl;
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-3 bg-slate-900/80 border border-slate-700/60 hover:border-slate-500/80 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer shadow-sm min-w-[140px]"
      >
        <span className="truncate font-medium">{getLabelForValue(value)}</span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 flex-shrink-0 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 top-full mt-1.5 w-full min-w-[160px] right-0 bg-slate-800/95 backdrop-blur-xl border border-slate-700 shadow-xl shadow-black/50 rounded-xl overflow-hidden origin-top transition-all">
          <div className="max-h-60 overflow-y-auto custom-scrollbar p-1.5 space-y-0.5">
            <div
              onClick={() => {
                onChange("");
                setIsOpen(false);
              }}
              className={`px-3 py-2 text-sm rounded-lg cursor-pointer transition-all flex items-center ${
                !value ? "bg-indigo-600/20 text-indigo-300 font-medium" : "text-slate-300 hover:bg-slate-700/80 hover:text-slate-100"
              }`}
            >
              {allLabel}
            </div>
            
            {options.map((opt) => {
              const val = typeof opt === "object" ? opt.value : opt;
              const lbl = typeof opt === "object" ? opt.label : opt;
              const isSelected = value === val;

              return (
                <div
                  key={val}
                  onClick={() => {
                    onChange(val);
                    setIsOpen(false);
                  }}
                  className={`px-3 py-2 text-sm rounded-lg cursor-pointer transition-all flex items-center ${
                    isSelected
                      ? "bg-indigo-600/20 text-indigo-300 font-medium"
                      : "text-slate-300 hover:bg-slate-700/80 hover:text-slate-100"
                  }`}
                >
                  {lbl}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
