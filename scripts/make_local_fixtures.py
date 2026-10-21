"""Generate synthetic test fixtures for local OCR / PDF text extraction.

The fixtures use fictional information only. Run from the repository root:

    python scripts/make_local_fixtures.py

Writes PNG images and a text-based PDF into the target folder (default
`.tmp-test/fixtures`).
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 1000, 620
LINES_EN = [
    "IDENTITY RECORD - SYNTHETIC TEST DATA",
    "Name: Rahim Uddin",
    "Date of Birth: 12/03/1990",
    "Father's Name: Karim Uddin",
    "Mother's Name: Salma Begum",
    "Document No: TEST-0001",
]
LINES_BN = [
    "জন্ম নিবন্ধন সন্দ - কৃত্রিম পরীক্ষার তথ্য",
    "নাম: রহিম উদ্দিন",
    "জন্ম তারিখ: ১২/০৩/১৯৯০",
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


def render(lines, path: Path, bengali: bool = False) -> None:
    image = Image.new("RGB", (WIDTH, HEIGHT), "white")
    draw = ImageDraw.Draw(image)
    font = load_font(34, bengali)
    y = 40
    for line in lines:
        draw.text((40, y), line, fill="black", font=font)
        y += 70
    image.save(path)


def build_pdf(path: Path) -> None:
    """Write a minimal, uncompressed PDF with a text layer."""
    text_lines = [
        "Name: Rahim Uddin",
        "Date of Birth: 12/03/1990",
        "Father's Name: Karim Uddin",
        "Mother's Name: Salma Begum",
    ]
    content = ["BT", "/F1 18 Tf", "72 720 Td", "18 TL"]
    for line in text_lines:
        content.append(f"({line}) Tj")
        content.append("T*")
    content.append("ET")
    stream = "\n".join(content).encode("latin-1")

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


def main() -> None:
    target = Path(sys.argv[1] if len(sys.argv) > 1 else ".tmp-test/fixtures")
    target.mkdir(parents=True, exist_ok=True)
    render(LINES_EN, target / "identity-en.png")
    render(LINES_BN, target / "identity-bn.png", bengali=True)
    build_pdf(target / "identity-text.pdf")
    print(f"fixtures written to {target}")


if __name__ == "__main__":
    main()
