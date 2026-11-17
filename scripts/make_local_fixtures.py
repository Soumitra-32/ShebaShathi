"""Generate synthetic test fixtures for local OCR / PDF text extraction.

The fixtures use fictional information only. They are intentionally small and
are written into `.tmp-test/fixtures`, which is git-ignored. Run from the
repository root:

    python scripts/make_local_fixtures.py

Writes PNG images, text-layer PDFs and image-only PDFs. The set covers:
- two same-type documents with equal values;
- cross-document documents with one differing field;
- an ambiguous date pair;
- a missing-field document;
- a scanned PDF (OCR path);
- a 4-page scanned PDF (OCR truncation path);
- corrupt, oversized, empty and renamed files for rejection tests.
"""
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 1000, 620

BASE_LINES_EN = [
    "SYNTHETIC TEST DOCUMENT - NOT A REAL IDENTITY RECORD",
    "Name: Rahim Uddin",
    "Date of Birth: 13/03/1990",
    "Father's Name: Karim Uddin",
    "Mother's Name: Salma Begum",
]

NID_LINES_EN = [
    "SYNTHETIC NID COPY - TEST DATA ONLY",
    "Name: Rahim Uddin",
    "Date of Birth: 13/03/1990",
    "Father's Name: Karim Uddin",
    "Mother's Name: Salma Begum",
    "Document No: TEST-0001",
]

PASSPORT_LINES_EN = [
    "SYNTHETIC PASSPORT COPY - TEST DATA ONLY",
    "Name: Rahim Uddin",
    "Date of Birth: 13/03/1990",
    "Father's Name: Karim Uddin",
    "Mother's Name: Salma Begum",
    "Passport No: TEST-P0001",
]

PASSPORT_DIFFERENT_LINES_EN = [
    "SYNTHETIC PASSPORT COPY - TEST DATA ONLY",
    "Name: Rahim Uddin",
    "Date of Birth: 25/03/1990",
    "Father's Name: Karim Uddin",
    "Mother's Name: Salma Begum",
    "Passport No: TEST-P0002",
]

LINES_BN = [
    "সংশ্লেষিত পরীক্ষামূলক নথি - আসল পরিচয়পত্র নয়",
    "নাম: রহিম উদ্দিন",
    "জন্ম তারিখ: ১৩/০৩/১৯৯০",
    "পিতার নাম: করিম উদ্দিন",
    "মাতার নাম: সালমা বেগম",
]

BENGALI_FONTS = [
    Path("C:/Windows/Fonts/Nirmala.ttf"),
    Path("C:/Windows/Fonts/NirmalaB.ttf"),
    Path("C:/Windows/Fonts/NotoSansBengali-Regular.ttf"),
    Path("C:/Windows/Fonts/calibri.ttf"),
]


def load_font(size: int, bengali: bool = False) -> ImageFont.FreeTypeFont:
    if bengali:
        for path in BENGALI_FONTS:
            if path.exists():
                try:
                    return ImageFont.truetype(str(path), size)
                except OSError:
                    continue
    return ImageFont.load_default(size)


def make_image(lines, bengali: bool = False) -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT), "white")
    draw = ImageDraw.Draw(image)
    font = load_font(34, bengali)
    y = 40
    for line in lines:
        draw.text((40, y), line, fill="black", font=font)
        y += 70
    return image


def render(lines, path: Path, bengali: bool = False) -> None:
    make_image(lines, bengali).save(path)


def build_text_pdf(path: Path, lines: list[str]) -> None:
    """Write a minimal, uncompressed PDF with a real text layer."""
    content = ["BT", "/F1 18 Tf", "72 720 Td", "18 TL"]
    for line in lines:
        escaped = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        content.append(f"({escaped}) Tj")
        content.append("T*")
    content.append("ET")
    stream = "\n".join(content).encode("latin-1", errors="replace")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for index, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{index} 0 obj\n".encode() + body + b"\nendobj\n"

    xref_offset = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n"
    ).encode()
    path.write_bytes(bytes(out))


def build_scanned_pdf(path: Path, lines: list[str], pages: int = 1) -> None:
    """Write an image-only PDF so the browser must use the OCR path."""
    images = [make_image(lines) for _ in range(max(1, pages))]
    images[0].save(
        path,
        "PDF",
        save_all=True,
        append_images=images[1:],
        resolution=150,
    )


def main() -> None:
    target = Path(sys.argv[1] if len(sys.argv) > 1 else ".tmp-test/fixtures")
    target.mkdir(parents=True, exist_ok=True)

    render(BASE_LINES_EN, target / "identity-en.png")
    render(LINES_BN, target / "identity-bn.png", bengali=True)

    build_text_pdf(target / "identity-text.pdf", BASE_LINES_EN)
    build_text_pdf(target / "nid-text.pdf", NID_LINES_EN)
    build_text_pdf(target / "passport-text.pdf", PASSPORT_LINES_EN)
    build_text_pdf(target / "passport-different.pdf", PASSPORT_DIFFERENT_LINES_EN)

    build_text_pdf(
        target / "ambiguous-date-a.pdf",
        [BASE_LINES_EN[0], "Name: Rahim Uddin", "Date of Birth: 05/06/1990"],
    )
    build_text_pdf(
        target / "ambiguous-date-b.pdf",
        [BASE_LINES_EN[0], "Name: Rahim Uddin", "Date of Birth: 06/05/1990"],
    )

    build_text_pdf(
        target / "missing-field.pdf",
        [BASE_LINES_EN[0], "Name: Rahim Uddin", "Father's Name: Karim Uddin"],
    )

    build_scanned_pdf(target / "scanned.pdf", BASE_LINES_EN)
    build_scanned_pdf(target / "multipage-scanned.pdf", BASE_LINES_EN, pages=4)

    (target / "corrupt.pdf").write_bytes(b"%PDF-1.4\nthis is not a valid PDF\n")
    (target / "empty.pdf").write_bytes(b"")
    (target / "oversize.pdf").write_bytes(
        b"%PDF-1.4\n" + b"0" * (12 * 1024 * 1024 + 1024)
    )
    shutil.copyfile(target / "identity-text.pdf", target / "renamed-pdf.png")

    print(f"fixtures written to {target}")


if __name__ == "__main__":
    main()
