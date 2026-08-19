import React, { useState, useEffect } from "react";
import { Search, X } from "lucide-react";
import { useDebounce } from "../../hooks/useDebounce";

export default function SearchInput({
  value: externalValue,
  onChange,
  placeholder = "Search...",
  debounceMs = 300,
  className = "",
}) {
  const [internalValue, setInternalValue] = useState(externalValue || "");
  const debouncedValue = useDebounce(internalValue, debounceMs);

  useEffect(() => {
    if (onChange && debouncedValue !== externalValue) {
      onChange(debouncedValue);
    }
  }, [debouncedValue]);

  useEffect(() => {
    setInternalValue(externalValue || "");
  }, [externalValue]);

  const handleClear = () => {
    setInternalValue("");
    if (onChange) onChange("");
  };

  return (
    <div className={`relative flex items-center ${className}`}>
      <Search className="w-4 h-4 absolute left-3 text-slate-400 pointer-events-none z-10" />
      <input
        type="text"
        value={internalValue}
        onChange={(e) => setInternalValue(e.target.value)}
        placeholder={placeholder}
        style={{ paddingLeft: "38px" }}
        className="w-full pr-8 py-2 bg-slate-900/80 border border-slate-700/60 rounded-xl text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
      />
      {internalValue && (
        <button
          onClick={handleClear}
          className="absolute right-2.5 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
