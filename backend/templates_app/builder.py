from html import escape

BLOCK_RENDERERS = {
    "heading": lambda d: f'<h2 style="margin:0 0 16px;color:{escape(str(d.get("color", "#1e293b")))}">{escape(str(d.get("text", "")))}</h2>',
    "text": lambda d: f'<p style="margin:0 0 16px;line-height:1.6;color:{escape(str(d.get("color", "#334155")))}">{escape(str(d.get("text", "")))}</p>',
    "image": lambda d: f'<img src="{escape(str(d.get("src", "")))}" alt="{escape(str(d.get("alt", "")))}" style="max-width:100%;height:auto;display:block">',
    "button": lambda d: f'<a href="{escape(str(d.get("url", "#")))}" style="display:inline-block;padding:12px 20px;background:{escape(str(d.get("background", "#4f46e5")))};color:{escape(str(d.get("color", "#ffffff")))};text-decoration:none;border-radius:6px;font-weight:600">{escape(str(d.get("text", "Button")))}</a>',
    "divider": lambda d: f'<hr style="border:0;border-top:1px solid {escape(str(d.get("color", "#cbd5e1")))};margin:24px 0">',
    "spacer": lambda d: f'<div style="height:{int(d.get("height", 24))}px"></div>',
    "html": lambda d: str(d.get("html", "")),
}

def build_html(layout: dict) -> str:
    if not isinstance(layout, dict):
        layout = {}

    # Raw HTML mode support
    if layout.get("mode") == "raw":
        raw_html = str(layout.get("html", ""))
        return raw_html if raw_html.strip() else '<!doctype html><html><body style="margin:0;padding:20px;font-family:sans-serif;color:#64748b;">(Empty Raw HTML Template)</body></html>'

    blocks = layout.get("blocks", []) if isinstance(layout.get("blocks"), list) else []
    body = []
    for block in blocks:
        if not isinstance(block, dict):
            continue
        kind = str(block.get("type", "")).lower()
        renderer = BLOCK_RENDERERS.get(kind)
        if renderer:
            data = block.get("data", {}) if isinstance(block.get("data"), dict) else {}
            try:
                body.append(renderer(data))
            except Exception:
                pass

    content = "".join(body)
    if not content.strip():
        content = '<div style="text-align:center;padding:40px 20px;color:#94a3b8;font-family:sans-serif;"><p style="margin:0 0 8px;font-size:16px;font-weight:600;">(Empty Email Template)</p><p style="margin:0;font-size:13px;color:#64748b;">No content blocks have been added to this template yet.</p></div>'

    return '<!doctype html><html><body style="margin:0;background:#f5f5f5"><table role="presentation" width="100%"><tr><td align="center"><table role="presentation" width="600" style="max-width:600px;background:#fff;padding:32px"><tr><td>' + content + '</td></tr></table></td></tr></table></body></html>'

