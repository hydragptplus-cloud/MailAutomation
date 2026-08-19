from bs4 import BeautifulSoup
from common.validators import is_valid_url

def validate_template(subject: str, html: str) -> list[str]:
    errors = []
    if not subject.strip():
        errors.append("Subject is empty.")
    soup = BeautifulSoup(html or "", "html.parser")
    for image in soup.find_all("img"):
        if not image.get("src"):  # type: ignore
            errors.append("An image is missing its source URL.")
    for anchor in soup.find_all("a"):
        href = anchor.get("href", "")  # type: ignore
        if not href or (href != "#" and not href.startswith("mailto:") and not is_valid_url(href)):  # type: ignore
            errors.append(f"Invalid link: {href or '[empty]'}")
    for button in soup.select("a.button, a[role='button']"):
        if not button.get("href"):
            errors.append("A button is missing its target URL.")
    return sorted(set(errors))
