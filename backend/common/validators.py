from django.core.validators import URLValidator
from django.core.exceptions import ValidationError

url_validator = URLValidator()

def is_valid_url(value: str) -> bool:
    try:
        url_validator(value)
        return True
    except ValidationError:
        return False
