import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export default function CustomSelect({ value, onChange, options, placeholder = "Select an option", disabled = false, className = "", ariaLabel, size = "md" }) {
  const id = useId();
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState(null);
  const normalized = useMemo(() => options.map((option) => typeof option === "object" ? option : { value: option, label: option }), [options]);
  const selected = normalized.find((option) => String(option.value) === String(value));

  function updatePosition() {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const viewportPadding = 8;
    const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
    const spaceBelow = window.innerHeight - rect.bottom;
    const estimatedHeight = Math.min(normalized.length * 42 + 8, 280);
    const above = spaceBelow < estimatedHeight && rect.top > spaceBelow;
    setPosition({
      left: Math.min(Math.max(viewportPadding, rect.left), window.innerWidth - width - viewportPadding),
      width,
      top: above ? Math.max(viewportPadding, rect.top - estimatedHeight - 6) : Math.min(rect.bottom + 6, window.innerHeight - viewportPadding),
    });
  }

  function openMenu() {
    if (disabled) return;
    const selectedIndex = normalized.findIndex((option) => String(option.value) === String(value));
    setActiveIndex(Math.max(0, selectedIndex)); updatePosition(); setOpen(true);
  }

  function choose(option) {
    if (option.disabled) return;
    onChange(option.value); setOpen(false); buttonRef.current?.focus();
  }

  function move(direction) {
    if (!normalized.length) return;
    let next = activeIndex;
    do { next = (next + direction + normalized.length) % normalized.length; } while (normalized[next]?.disabled && next !== activeIndex);
    setActiveIndex(next);
  }

  function onKeyDown(event) {
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      if (!open) openMenu(); else move(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) openMenu(); else if (normalized[activeIndex]) choose(normalized[activeIndex]);
    } else if (event.key === "Escape" && open) { event.preventDefault(); setOpen(false); }
    else if (event.key === "Home" && open) { event.preventDefault(); setActiveIndex(0); }
    else if (event.key === "End" && open) { event.preventDefault(); setActiveIndex(normalized.length - 1); }
  }

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!buttonRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false); };
    const reposition = () => updatePosition();
    document.addEventListener("pointerdown", close);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => { document.removeEventListener("pointerdown", close); window.removeEventListener("resize", reposition); window.removeEventListener("scroll", reposition, true); };
  }, [open, normalized.length]);

  useEffect(() => { if (open) menuRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" }); }, [activeIndex, open]);

  return <>
    <button ref={buttonRef} type="button" role="combobox" aria-label={ariaLabel} aria-controls={`${id}-listbox`} aria-expanded={open} aria-haspopup="listbox" disabled={disabled} onClick={() => open ? setOpen(false) : openMenu()} onKeyDown={onKeyDown} className={`flex w-full items-center justify-between gap-3 border border-slate-700 bg-slate-900 text-left text-slate-100 outline-none transition-colors hover:border-slate-600 focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 ${size === "sm" ? "min-h-8 rounded-md px-2.5 py-1 text-xs" : "min-h-10 rounded-md px-3.5 py-2 text-sm"} ${className}`}>
      <span className={`min-w-0 truncate ${selected ? "" : "text-slate-500"}`}>{selected?.label ?? placeholder}</span><ChevronDown className={`w-4 h-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    {open && position && createPortal(<div ref={menuRef} id={`${id}-listbox`} role="listbox" aria-label={ariaLabel} style={{ position: "fixed", left: position.left, top: position.top, width: position.width }} className="z-[120] max-h-72 overflow-y-auto rounded-md border border-slate-700 bg-slate-900 p-1 shadow-2xl shadow-black/50">{normalized.map((option, index) => {
      const isSelected = String(option.value) === String(value);
      return <button key={`${option.value}-${index}`} type="button" role="option" aria-selected={isSelected} data-index={index} disabled={option.disabled} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(option)} className={`flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left text-sm ${index === activeIndex ? "bg-slate-800 text-white" : "text-slate-300"} ${option.disabled ? "cursor-not-allowed opacity-40" : "hover:bg-slate-800"}`}><span className="min-w-0 truncate">{option.label}</span>{isSelected && <Check className="w-4 h-4 shrink-0 text-indigo-400" />}</button>;
    })}</div>, document.body)}
  </>;
}
