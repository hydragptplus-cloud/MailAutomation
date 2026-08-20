DANGEROUS_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r", "\n", "|", "%")


def safe_spreadsheet_value(value):
    if value is None:
        return ""
    if hasattr(value, "strftime"):
        value = value.strftime("%Y-%m-%d %H:%M:%S")
    text = str(value)
    if text.strip().startswith(("=", "+", "-", "@", "|", "%")) or text.startswith(DANGEROUS_FORMULA_PREFIXES):
        return "'" + text
    return text
