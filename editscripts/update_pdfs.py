"""
Overlay-based PDF updater for ppa-speech-therapy-user-guide.pdf
and ppa-speech-therapy-docs.pdf.

Uses pypdf for page merging and reportlab for drawing overlays.
Page coordinates: pdfplumber uses top-from-page-top; reportlab uses y-from-page-bottom.
All pages are A4 (595 × 842 pt).
"""

import io
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.colors import white, black, HexColor

PAGE_W = 595
PAGE_H = 842

BODY_FONT  = "Times-Roman"
BODY_BOLD  = "Times-Bold"
MONO_FONT  = "Courier"
BODY_SZ    = 10.5
HEAD_SZ    = 11.5

LEFT    = 63
RIGHT   = 532          # PAGE_W - LEFT
BULLET  = 81
LINE_H  = 15.0         # normal body line height


# ── coordinate helpers ────────────────────────────────────────────────────────

def ry(top, font_sz=BODY_SZ):
    """Convert pdfplumber 'top' to reportlab y (approximate baseline)."""
    return PAGE_H - top - font_sz * 0.05


def white_box(c, top1, top2, x0=None, x1=None, pad=4):
    """Draw a white-filled rectangle covering pdfplumber top range [top1, top2]."""
    x0 = x0 if x0 is not None else LEFT - 2
    x1 = x1 if x1 is not None else RIGHT + 2
    y_bot = PAGE_H - top2 - pad
    y_top = PAGE_H - top1 + pad
    c.setFillColor(white)
    c.setStrokeColor(white)
    c.rect(x0, y_bot, x1 - x0, y_top - y_bot, stroke=0, fill=1)


def text(c, s, x, top, font=BODY_FONT, sz=BODY_SZ, color=black):
    """Draw a string at a pdfplumber top coordinate."""
    c.setFillColor(color)
    c.setFont(font, sz)
    c.drawString(x, ry(top, sz), s)


def make_overlay(draw_fn):
    """Render draw_fn onto a blank canvas and return a PdfReader for the overlay."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(PAGE_W, PAGE_H))
    draw_fn(c)
    c.save()
    buf.seek(0)
    return PdfReader(buf)


def apply_overlay(page, draw_fn):
    """Merge an overlay drawn by draw_fn onto page and return the modified page."""
    overlay = make_overlay(draw_fn)
    page.merge_page(overlay.pages[0])
    return page


# ── User Guide ────────────────────────────────────────────────────────────────

def ug_page3(page):
    """Page 3: update 'First-Time Setup' and 'API Key' sections."""

    def draw(c):
        # ── First-Time Setup (SLP / Admin) → Caregiver ────────────────────
        white_box(c, 231, 340)

        text(c, "First-Time Setup (Caregiver)", LEFT, 231, BODY_BOLD, HEAD_SZ)
        text(c, "The first time you open the app, everything is ready to use with default content. To", LEFT, 250)
        text(c, "customise word lists and materials:", LEFT, 265)
        text(c, "•  Open the Naming module admin panel (tap the gear button, caregiver PIN: 0000)", BULLET, 283)
        text(c, "   to add, edit, or remove picture cards.", BULLET, 298)
        text(c, "•  Add personal photos via the My photos tab in Naming Practice.", BULLET, 315)
        text(c, "•  Add personal video clips via the My clips tab in Video Questions.", BULLET, 330)

        # ── API Key section ────────────────────────────────────────────────
        # Original body: top=449 to top=516 (3 bullets + 2 intro lines)
        white_box(c, 449, 528)

        text(c, "Dr. Aria and all AI feedback require an Anthropic API key. Without a key the modules", LEFT, 449)
        text(c, "still work — they skip the AI feedback step and advance automatically.", LEFT, 464)
        text(c, "If no key is configured, the app prompts the caregiver on first launch:", LEFT, 483)
        text(c, "•  Enter the caregiver PIN (default: 0000).", BULLET, 498)
        text(c, "•  Paste your Anthropic API key. It is stored only in this browser and is never sent", BULLET, 513)
        text(c, "   anywhere other than Anthropic.", BULLET, 526)

    return apply_overlay(page, draw)


def ug_page9(page):
    """Page 9: fix 'Admin Panel' intro (PIN 1234) and 'Admin PIN security' callout."""

    def draw(c):
        # ── Admin Panel intro paragraph ────────────────────────────────────
        # Original: "The Admin Panel is protected by a 4-digit PIN (default: 1234)..."
        # top=119 to top=134
        white_box(c, 119, 142)

        text(c, "Content management — naming word lists, personal photos, and video clips — is", LEFT, 119)
        text(c, "protected by the caregiver PIN (default: 0000). Tap Change PIN in any panel to update.", LEFT, 134)

        # ── "Admin PIN security" callout box (top=469 to top=507) ──────────
        white_box(c, 483, 508, x0=70)

        text(c, "The default caregiver PIN is 0000. Change it before clinical use by tapping", 92, 488)
        text(c, "Change PIN in any caregiver panel. The PIN prevents accidental changes.", 92, 502)

    return apply_overlay(page, draw)


def ug_page13(page):
    """Page 13: update 'Dr. Aria does not respond' troubleshooting row."""

    def draw(c):
        # Solution column starts at x=233; white out only the right half of the row
        white_box(c, 104, 125, x0=230)

        text(c, "If no API key is set, the app prompts the caregiver (PIN: 0000) on first launch.", 233, 107)
        text(c, "If a key is set, check your internet connection. The module advances either way.", 233, 120)

    return apply_overlay(page, draw)


def update_user_guide(src, dst):
    reader = PdfReader(src)
    writer = PdfWriter()

    handlers = {2: ug_page3, 8: ug_page9, 12: ug_page13}

    for i, page in enumerate(reader.pages):
        if i in handlers:
            page = handlers[i](page)
        writer.add_page(page)

    with open(dst, "wb") as f:
        writer.write(f)
    print(f"User guide written to {dst}")


# ── Technical Docs ────────────────────────────────────────────────────────────

def td_page14(page):
    """Page 14: rewrite section 9.1 (Environment Variable → API Key)."""

    def draw(c):
        # Original 9.1 block: heading at top=214, body top=233 to top=297
        white_box(c, 214, 322)

        text(c, "9.1  API Key", LEFT, 214, BODY_BOLD, HEAD_SZ)

        text(c, "The API key is resolved at runtime by getApiKey() in shared.jsx, checking in order:", LEFT, 233)
        text(c, "1.  localStorage key ppa_api_key — set by the caregiver via the in-app setup prompt.", BULLET, 249)
        text(c, "2.  Vite env var VITE_ANTHROPIC_API_KEY — baked in at build time from a .env file:", BULLET, 264)

        text(c, "VITE_ANTHROPIC_API_KEY=sk-ant-...", 73, 282, MONO_FONT, 9.5)

        text(c, "If neither source has a key, a setup modal appears on first launch. The caregiver", LEFT, 300)
        text(c, "enters their PIN (default: 0000), pastes the key, and it is saved to localStorage", LEFT, 315)
        text(c, "immediately — no restart needed. Without a key AI calls fail silently.", LEFT, 320)

    return apply_overlay(page, draw)


def td_page15(page):
    """Page 15: update sections 10.2 (API key storage) and 10.4 (Admin PIN)."""

    def draw(c):
        # ── Section 10.2 body (top=208 to top=238) ────────────────────────
        white_box(c, 208, 243)

        text(c, "The API key is stored in localStorage (ppa_api_key, set via the in-app caregiver", LEFT, 208)
        text(c, "setup prompt) or read from VITE_ANTHROPIC_API_KEY at build time; localStorage takes", LEFT, 223)
        text(c, "precedence. Suitable for single-patient, single-device use only.", LEFT, 238)

        # ── Section 10.4 heading + body (top=330 to top=364) ──────────────
        white_box(c, 330, 380)

        text(c, "10.4  Caregiver PIN", LEFT, 330, BODY_BOLD, HEAD_SZ)

        text(c, "The caregiver PIN (localStorage ppa_caregiver_pin, default '0000') gates all content", LEFT, 349)
        text(c, "management in the client app. ADMIN_PIN = '1234' in AdminPinEntry.jsx is for the", LEFT, 364)
        text(c, "clinician app only and is never imported by any client-app module.", LEFT, 379)

    return apply_overlay(page, draw)


def td_page18(page):
    """Page 18: prepend Version 4.1.0 to the changelog."""

    def draw(c):
        # White out all existing version entries below the section heading
        # Section heading "12. Changelog" is at top=93; entries start at top=127
        white_box(c, 127, 388)

        # ── Version 4.1.0 (new) ───────────────────────────────────────────
        top = 127
        text(c, "Version 4.1.0 (May 2026)", LEFT, top, BODY_BOLD)
        top += 16
        for bullet in [
            "API key setup on first launch: if no key is configured, a setup modal appears",
            " on startup requiring caregiver authentication (PIN: 0000) before key entry.",
            "Key stored in localStorage (ppa_api_key); takes precedence over the Vite env var.",
            "Added getApiKey() / setApiKey() / hasApiKey() helpers to shared.jsx.",
        ]:
            x = BULLET if not bullet.startswith(" ") else BULLET + 8
            s = ("•  " + bullet.strip()) if not bullet.startswith(" ") else bullet
            text(c, s, x, top)
            top += LINE_H

        # ── Version 4.0.1 ─────────────────────────────────────────────────
        top += 8
        text(c, "Version 4.0.1 (March 2026)", LEFT, top, BODY_BOLD)
        top += 16
        for bullet in [
            "Added click-to-zoom for graphics: tapping any picture card in Naming Practice",
            " or Assessment opens a 2x popup. Press Escape or click outside to close.",
            "Added ZoomableGraphic shared component to shared.jsx.",
        ]:
            x = BULLET if not bullet.startswith(" ") else BULLET + 8
            s = ("•  " + bullet.strip()) if not bullet.startswith(" ") else bullet
            text(c, s, x, top)
            top += LINE_H

        # ── Version 4.0.0 ─────────────────────────────────────────────────
        top += 8
        text(c, "Version 4.0.0 (March 2026)", LEFT, top, BODY_BOLD)
        top += 16
        for bullet in [
            "Added meSpeak audio hints with vowel-anchored pronunciation in Naming module.",
            "Replaced phonemizer / espeak-ng IPA pipeline with text-mode meSpeak.",
            "Added ppa_naming_audio_hints localStorage key for toggle persistence.",
            "Added Space-bar phoneme starter (space_cued, SR x0.9).",
            "Extracted shared utilities to shared.jsx (fetchAnthropicApi, CallAPI, ThinkingDots).",
            "Renamed main source file to ppa-speech-therapy_main.jsx.",
            "Added Vite project scaffold (package.json, vite.config.js, index.html, src/main.jsx).",
            "Added iPad PWA (manifest.json + service worker).",
            "PDF documentation bundled into macOS and Windows installers.",
            "Max SR interval corrected to 5 days.",
        ]:
            text(c, "•  " + bullet, BULLET, top)
            top += LINE_H

    return apply_overlay(page, draw)


def update_tech_docs(src, dst):
    reader = PdfReader(src)
    writer = PdfWriter()

    handlers = {13: td_page14, 14: td_page15, 17: td_page18}

    for i, page in enumerate(reader.pages):
        if i in handlers:
            page = handlers[i](page)
        writer.add_page(page)

    with open(dst, "wb") as f:
        writer.write(f)
    print(f"Technical docs written to {dst}")


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import pathlib
    ROOT = pathlib.Path(__file__).resolve().parent.parent

    ug  = ROOT / "ppa-speech-therapy-user-guide.pdf"
    doc = ROOT / "ppa-speech-therapy-docs.pdf"

    update_user_guide(str(ug),  str(ug))
    update_tech_docs( str(doc), str(doc))

    # Sync copies in installer directories
    for subdir in ("mac-installer", "win-installer"):
        import shutil
        shutil.copy2(ug,  ROOT / subdir / ug.name)
        shutil.copy2(doc, ROOT / subdir / doc.name)
        print(f"Synced to {subdir}/")
