const technicalPattern = /(traceback|exception|stack trace|\bfile "|\bline \d+|sqlstate|django\.|psycopg|attributeerror|typeerror|valueerror|operationalerror|\[errno|connection refused|getaddrinfo|\/usr\/local\/lib|\/app\/|select illegal)/i;

function safeText(value) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text || text.length > 300 || technicalPattern.test(text)) return "";
  return text;
}

export function apiError(error, fallback = "Something went wrong. Please try again.") {
  const data = error?.response?.data;
  const direct = safeText(data?.detail) || safeText(data?.message);
  if (direct) return direct;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    for (const value of Object.values(data)) {
      const candidate = Array.isArray(value) ? value[0] : value;
      const message = safeText(candidate);
      if (message) return message;
    }
  }
  return fallback;
}

export function safeErrorMessage(message, fallback = "Something went wrong. Please try again.") {
  if (typeof message === "object") return apiError({ response: { data: message } }, fallback);
  return safeText(message) || fallback;
}
