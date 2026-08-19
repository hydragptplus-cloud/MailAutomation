from .builder import build_html

def apply_layout(template, json_layout: dict):
    template.json_layout = json_layout
    template.html = build_html(json_layout)
    return template
