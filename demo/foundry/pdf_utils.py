"""PDF text extraction using PyMuPDF."""

import fitz  # PyMuPDF


def extract_pdf(path: str) -> str:
    """Extract all text from a PDF file."""
    doc = fitz.open(path)
    pages = []
    for page in doc:
        pages.append(page.get_text())
    doc.close()
    return "\n\n".join(pages)
