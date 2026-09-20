import html
import re


_HTML_TAG_PATTERN = re.compile(r"<[^>]*>")
_WHITESPACE_PATTERN = re.compile(r"\s+")


def clean_ingredient_text(value):
    """Safely normalize ingredient text without changing its wording or structure."""
    if value is None:
        return None

    text = str(value)
    text = html.unescape(text)
    text = _HTML_TAG_PATTERN.sub("", text)
    text = html.unescape(text)
    text = _WHITESPACE_PATTERN.sub(" ", text).strip()

    return text or None
