def safe_spreadsheet_value(value):
    if value is None:
        return ""
    if hasattr(value, "strftime"):
        value = value.strftime("%Y-%m-%d %H:%M:%S")
    text = str(value)
    if text.startswith(("=", "+", "-", "@")):
        return "'" + text
    return text
