#!/usr/bin/env python3
"""
Generate PPA Speech Therapy Suite PDFs:
  1. ppa-speech-therapy-user-guide.pdf
  2. ppa-speech-therapy-docs.pdf
"""

import shutil
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether
)
from reportlab.platypus.flowables import Flowable
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.pdfgen import canvas
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate

# ── Colours ──────────────────────────────────────────────────────────────────
TEAL        = colors.HexColor("#2D7A6B")
TEAL_LIGHT  = colors.HexColor("#E8F4F2")
AMBER       = colors.HexColor("#D4A843")
DANGER      = colors.HexColor("#C07070")
DARK        = colors.HexColor("#1A2E2A")
MID         = colors.HexColor("#2D3B36")

TIP_BG      = colors.HexColor("#EBF4FF")
TIP_BORDER  = colors.HexColor("#A0C8F0")
NEW_BG      = colors.HexColor("#E8F4F2")
NEW_BORDER  = colors.HexColor("#4E8B80")
WARN_BG     = colors.HexColor("#FFF8E0")
WARN_BORDER = colors.HexColor("#D4A843")
INFO_BG     = colors.HexColor("#F5F5F5")
INFO_BORDER = colors.HexColor("#CCCCCC")
CODE_BG     = colors.HexColor("#F5F5F5")
CODE_BORDER = colors.HexColor("#AAAAAA")
ROW_ALT     = colors.HexColor("#F8F8F8")

PAGE_W, PAGE_H = A4
MARGIN = 2 * cm
CONTENT_W = PAGE_W - 2 * MARGIN

# ── Styles ───────────────────────────────────────────────────────────────────
def make_styles():
    s = {}
    s['normal'] = ParagraphStyle('normal', fontName='Helvetica', fontSize=10,
                                  leading=15, textColor=MID)
    s['small'] = ParagraphStyle('small', fontName='Helvetica', fontSize=8,
                                 leading=12, textColor=colors.HexColor("#666666"))
    s['header'] = ParagraphStyle('header', fontName='Helvetica-Bold', fontSize=10,
                                  leading=14, textColor=colors.HexColor("#666666"))
    s['cover_title'] = ParagraphStyle('cover_title', fontName='Helvetica-Bold',
                                       fontSize=28, leading=36,
                                       textColor=TEAL, alignment=TA_CENTER)
    s['cover_subtitle'] = ParagraphStyle('cover_subtitle', fontName='Helvetica-Bold',
                                          fontSize=16, leading=22,
                                          textColor=MID, alignment=TA_CENTER)
    s['cover_tagline'] = ParagraphStyle('cover_tagline', fontName='Helvetica',
                                         fontSize=12, leading=18,
                                         textColor=MID, alignment=TA_CENTER)
    s['cover_version'] = ParagraphStyle('cover_version', fontName='Helvetica',
                                         fontSize=10, leading=14,
                                         textColor=colors.HexColor("#888888"),
                                         alignment=TA_CENTER)
    s['cover_emoji'] = ParagraphStyle('cover_emoji', fontName='Helvetica-Bold',
                                       fontSize=60, leading=72, alignment=TA_CENTER)
    s['section'] = ParagraphStyle('section', fontName='Helvetica-Bold', fontSize=14,
                                   leading=20, textColor=TEAL, spaceBefore=12,
                                   spaceAfter=4)
    s['subsection'] = ParagraphStyle('subsection', fontName='Helvetica-Bold', fontSize=11,
                                      leading=16, textColor=DARK, spaceBefore=8,
                                      spaceAfter=3)
    s['subsubsection'] = ParagraphStyle('subsubsection', fontName='Helvetica-Bold',
                                         fontSize=10, leading=14, textColor=MID,
                                         spaceBefore=6, spaceAfter=2)
    s['bullet'] = ParagraphStyle('bullet', fontName='Helvetica', fontSize=10,
                                  leading=15, textColor=MID, leftIndent=16,
                                  firstLineIndent=0, spaceAfter=2)
    s['bullet2'] = ParagraphStyle('bullet2', fontName='Helvetica', fontSize=10,
                                   leading=15, textColor=MID, leftIndent=32,
                                   firstLineIndent=0, spaceAfter=2)
    s['callout'] = ParagraphStyle('callout', fontName='Helvetica', fontSize=10,
                                   leading=15, textColor=MID)
    s['callout_bold'] = ParagraphStyle('callout_bold', fontName='Helvetica-Bold',
                                        fontSize=10, leading=15, textColor=MID)
    s['code'] = ParagraphStyle('code', fontName='Courier', fontSize=8,
                                leading=12, textColor=colors.HexColor("#333333"))
    s['table_header'] = ParagraphStyle('table_header', fontName='Helvetica-Bold',
                                        fontSize=9, leading=13,
                                        textColor=colors.white)
    s['table_cell'] = ParagraphStyle('table_cell', fontName='Helvetica', fontSize=9,
                                      leading=13, textColor=MID)
    s['table_cell_bold'] = ParagraphStyle('table_cell_bold', fontName='Helvetica-Bold',
                                           fontSize=9, leading=13, textColor=MID)
    s['footer'] = ParagraphStyle('footer', fontName='Helvetica', fontSize=8,
                                  leading=12, textColor=colors.HexColor("#888888"),
                                  alignment=TA_CENTER)
    return s

ST = make_styles()

# ── Callout Box Flowable ──────────────────────────────────────────────────────
class CalloutBox(Flowable):
    def __init__(self, icon, title, body_lines, bg=TIP_BG, border=TIP_BORDER,
                 width=None):
        Flowable.__init__(self)
        self.icon = icon
        self.title = title
        self.body_lines = body_lines  # list of (text, bold)
        self.bg = bg
        self.border = border
        self.width = width or CONTENT_W
        self._calc_height()

    def _calc_height(self):
        # estimate height
        lines = 1 + len(self.body_lines)
        self.height = 12 + lines * 15 + 12

    def wrap(self, availWidth, availHeight):
        self.width = availWidth
        return self.width, self.height

    def draw(self):
        c = self.canv
        w, h = self.width, self.height
        r = 6
        c.saveState()
        c.setFillColor(self.bg)
        c.setStrokeColor(self.border)
        c.setLineWidth(1.2)
        c.roundRect(0, 0, w, h, r, stroke=1, fill=1)

        # title line
        c.setFont('Helvetica-Bold', 10)
        c.setFillColor(MID)
        y = h - 12 - 10
        c.drawString(10, y, f"{self.icon}  {self.title}")

        # body
        c.setFont('Helvetica', 9.5)
        y -= 16
        for text, bold in self.body_lines:
            if bold:
                c.setFont('Helvetica-Bold', 9.5)
            else:
                c.setFont('Helvetica', 9.5)
            # wrap text manually
            max_w = w - 20
            words = text.split()
            line = ""
            for word in words:
                test = line + (" " if line else "") + word
                if c.stringWidth(test, 'Helvetica-Bold' if bold else 'Helvetica', 9.5) < max_w:
                    line = test
                else:
                    if line:
                        c.drawString(10, y, line)
                        y -= 14
                    line = word
            if line:
                c.drawString(10, y, line)
                y -= 14

        c.restoreState()


# ── Code Block Flowable ───────────────────────────────────────────────────────
class CodeBlock(Flowable):
    def __init__(self, lines, width=None):
        Flowable.__init__(self)
        self.lines = lines
        self.width = width or CONTENT_W
        self.height = 8 + len(lines) * 12 + 8

    def wrap(self, availWidth, availHeight):
        self.width = availWidth
        return self.width, self.height

    def draw(self):
        c = self.canv
        w, h = self.width, self.height
        c.saveState()
        c.setFillColor(CODE_BG)
        c.setStrokeColor(CODE_BORDER)
        c.setLineWidth(1)
        c.rect(0, 0, w, h, stroke=1, fill=1)
        # left accent bar
        c.setFillColor(CODE_BORDER)
        c.rect(0, 0, 3, h, stroke=0, fill=1)

        c.setFont('Courier', 8)
        c.setFillColor(colors.HexColor("#333333"))
        y = h - 8 - 8
        for line in self.lines:
            c.drawString(10, y, line)
            y -= 12
        c.restoreState()


# ── Section Rule Helper ───────────────────────────────────────────────────────
def section_rule():
    return HRFlowable(width="100%", thickness=1, color=TEAL, spaceAfter=4)

def thin_rule(color=colors.HexColor("#DDDDDD")):
    return HRFlowable(width="100%", thickness=0.5, color=color, spaceAfter=2)


# ── Page Header / Footer callbacks ───────────────────────────────────────────
def make_page_template(doc_title, total_pages_ref, show_footer_on_last=True):
    """Returns on_page and on_page_end callbacks for SimpleDocTemplate."""

    def on_first_page(canvas_obj, doc):
        pass  # cover page – no header/footer

    def on_later_pages(canvas_obj, doc):
        page_num = doc.page
        canvas_obj.saveState()
        # Header
        canvas_obj.setFont('Helvetica', 8)
        canvas_obj.setFillColor(colors.HexColor("#888888"))
        header_text = f"{doc_title}  •  Page {page_num}"
        canvas_obj.drawString(MARGIN, PAGE_H - MARGIN + 6, header_text)
        canvas_obj.setStrokeColor(TEAL)
        canvas_obj.setLineWidth(0.5)
        canvas_obj.line(MARGIN, PAGE_H - MARGIN + 2, PAGE_W - MARGIN, PAGE_H - MARGIN + 2)
        canvas_obj.restoreState()

    return on_first_page, on_later_pages


# ── Table helper ─────────────────────────────────────────────────────────────
def make_table(headers, rows, col_widths=None):
    """Create a styled reportlab Table."""
    header_cells = [Paragraph(h, ST['table_header']) for h in headers]
    data = [header_cells]
    for i, row in enumerate(rows):
        cells = [Paragraph(str(cell), ST['table_cell']) for cell in row]
        data.append(cells)

    if col_widths is None:
        col_widths = [CONTENT_W / len(headers)] * len(headers)

    t = Table(data, colWidths=col_widths, repeatRows=1)
    style = [
        ('BACKGROUND', (0, 0), (-1, 0), TEAL),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, ROW_ALT]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CCCCCC")),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]
    t.setStyle(TableStyle(style))
    return t


# ── Rich table with paragraph cells ──────────────────────────────────────────
def make_rich_table(headers, rows, col_widths=None, bold_first_col=False):
    """Like make_table but rows can contain Paragraphs already."""
    header_cells = [Paragraph(h, ST['table_header']) for h in headers]
    data = [header_cells]
    for row in rows:
        cells = []
        for j, cell in enumerate(row):
            if isinstance(cell, str):
                sty = ST['table_cell_bold'] if (bold_first_col and j == 0) else ST['table_cell']
                cells.append(Paragraph(cell, sty))
            else:
                cells.append(cell)
        data.append(cells)

    if col_widths is None:
        col_widths = [CONTENT_W / len(headers)] * len(headers)

    t = Table(data, colWidths=col_widths, repeatRows=1)
    style = [
        ('BACKGROUND', (0, 0), (-1, 0), TEAL),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, ROW_ALT]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CCCCCC")),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]
    t.setStyle(TableStyle(style))
    return t


# ─────────────────────────────────────────────────────────────────────────────
#  DOCUMENT 1 — USER GUIDE
# ─────────────────────────────────────────────────────────────────────────────

def build_user_guide(path):
    doc = SimpleDocTemplate(
        path,
        pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN + 0.5*cm, bottomMargin=MARGIN,
        title="PPA Speech Therapy Suite — Therapist & Caregiver User Guide",
        author="PPA Speech Therapy Suite",
    )

    story = []
    _, on_later = make_page_template("PPA Speech Therapy Suite", None)

    # ── COVER PAGE ────────────────────────────────────────────────────────────
    story.append(Spacer(1, 3*cm))
    story.append(Paragraph("🌿", ST['cover_emoji']))
    story.append(Spacer(1, 0.4*cm))
    story.append(Paragraph("PPA Speech Therapy Suite", ST['cover_title']))
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("Therapist &amp; Caregiver User Guide", ST['cover_subtitle']))
    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph(
        "Designed for people with Primary Progressive Aphasia (PPA)<br/>"
        "and their speech-language pathologists and caregivers.",
        ST['cover_tagline']))
    story.append(Spacer(1, 0.4*cm))
    story.append(Paragraph("Version 4  •  March 2026", ST['cover_version']))
    story.append(PageBreak())

    # ── PAGE 2 — INTRODUCTION ─────────────────────────────────────────────────
    story.append(section_rule())
    story.append(Paragraph("Introduction", ST['section']))
    story.append(Spacer(1, 0.2*cm))
    story.append(Paragraph(
        "The <b>PPA Speech Therapy Suite</b> is a browser-based tool designed to help people "
        "with <b>Primary Progressive Aphasia (PPA)</b> — a neurological condition that gradually "
        "affects the ability to speak, read, and understand language — maintain and practise "
        "communication skills.",
        ST['normal']))
    story.append(Spacer(1, 0.2*cm))
    story.append(Paragraph(
        "The suite provides nine structured practice modules, plus an AI therapist assistant "
        "(Dr. Aria, powered by Claude), progress tracking, and export/import tools for "
        "therapist-customised content.",
        ST['normal']))
    story.append(Spacer(1, 0.3*cm))

    story.append(Paragraph("Nine Modules at a Glance", ST['subsection']))
    story.append(Spacer(1, 0.1*cm))
    modules_table = make_table(
        ["Module", "Purpose"],
        [
            ["AI Therapist (Dr. Aria)", "Free conversation and encouragement with Claude AI"],
            ["Assessment", "Structured language evaluation tasks"],
            ["Naming Practice", "Picture/word naming with spaced repetition and cue ladder"],
            ["Repetition", "Repeat words and phrases at increasing difficulty"],
            ["Script Training", "Practise functional scripts for daily life"],
            ["Sentence Builder", "Drag-and-drop sentence construction"],
            ["Sentence Work", "Sentence completion and construction prompts"],
            ["Video Questions", "Comprehension questions on short video clips"],
            ["Progress", "Session history, accuracy trends, and SR statistics"],
        ],
        col_widths=[7*cm, CONTENT_W - 7*cm]
    )
    story.append(modules_table)
    story.append(Spacer(1, 0.3*cm))

    story.append(Paragraph("Who is this guide for?", ST['subsection']))
    story.append(Paragraph(
        "This guide is written for <b>speech-language pathologists (SLPs)</b> and "
        "<b>caregivers</b> who set up and supervise sessions. The interface is also "
        "designed to be used directly by the person with PPA, with or without a helper present.",
        ST['normal']))
    story.append(Spacer(1, 0.2*cm))
    story.append(Paragraph(
        "Sessions can be as short as 10–15 minutes. The app saves progress automatically "
        "in the browser — no account or internet connection is required for most features "
        "(an internet connection is only needed for the AI Therapist and for AI feedback "
        "within modules).",
        ST['normal']))
    story.append(PageBreak())

    # ── PAGE 3 — GETTING STARTED ──────────────────────────────────────────────
    story.append(section_rule())
    story.append(Paragraph("Getting Started", ST['section']))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("Opening the App", ST['subsection']))
    story.append(Paragraph(
        "The app runs entirely in your web browser — there is nothing to install for basic use. "
        "Open the app in <b>Chrome</b> or <b>Safari</b> on any device. The recommended screen "
        "size is a tablet or laptop (10\" or larger).",
        ST['normal']))
    story.append(Spacer(1, 0.2*cm))
    story.append(Paragraph(
        "On <b>iPad</b>, tap the Share button in Safari then <b>Add to Home Screen</b> to install "
        "the app as a PWA — it will open full-screen without the browser toolbar.",
        ST['normal']))
    story.append(Spacer(1, 0.3*cm))

    story.append(Paragraph("First-Time Setup (SLP / Admin)", ST['subsection']))
    story.append(Paragraph(
        "The first time you open the app, everything is ready to use with default content. "
        "To customise the word lists and materials:",
        ST['normal']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph("• Tap <b>Admin</b> in the sidebar (PIN: 1234 — change this before clinical use).", ST['bullet']))
    story.append(Paragraph("• In the Naming module admin panel, add, edit, or remove picture cards.", ST['bullet']))
    story.append(Paragraph("• In other modules, tap the admin toolbar to edit word banks and prompts.", ST['bullet']))
    story.append(Paragraph("• Use <b>Export / Import</b> to save customised content as .ppa files that can be shared with other devices.", ST['bullet']))
    story.append(Spacer(1, 0.3*cm))

    story.append(Paragraph("Navigation", ST['subsection']))
    story.append(Paragraph(
        "The <b>sidebar</b> on the left lists all nine modules. Tap any module name to switch. "
        "Your place within a session is preserved when you switch and return.",
        ST['normal']))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("API Key (AI features)", ST['subsection']))
    story.append(Paragraph(
        "Dr. Aria and the AI feedback in each module require an <b>Anthropic API key</b>. "
        "Without a key the modules still work — they simply skip the AI feedback step and "
        "advance automatically. To add a key:",
        ST['normal']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph("• Open Admin → Settings.", ST['bullet']))
    story.append(Paragraph("• Paste your Anthropic API key in the API Key field.", ST['bullet']))
    story.append(Paragraph("• The key is stored only in this browser — it is never sent to any server other than Anthropic.", ST['bullet']))
    story.append(PageBreak())

    # ── PAGES 4–5 — MODULE GUIDES ─────────────────────────────────────────────
    story.append(section_rule())
    story.append(Paragraph("Module Guides", ST['section']))
    story.append(Spacer(1, 0.2*cm))

    # AI Therapist
    story.append(Paragraph("AI Therapist (Dr. Aria)", ST['subsection']))
    story.append(Paragraph(
        "Dr. Aria is a friendly, encouraging AI therapist powered by Claude. Use this module "
        "for open-ended conversation practice, warm-up chat, or emotional check-ins at the "
        "start of a session.",
        ST['normal']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph("• Type a message in the box at the bottom and press <b>Send</b> (or Enter).", ST['bullet']))
    story.append(Paragraph("• Dr. Aria responds in natural, supportive language.", ST['bullet']))
    story.append(Paragraph("• There is no time limit — take as long as you need.", ST['bullet']))
    story.append(Spacer(1, 0.25*cm))

    # Assessment
    story.append(Paragraph("Assessment", ST['subsection']))
    story.append(Paragraph(
        "Use this module for structured language evaluation. Tasks include single-word "
        "repetition, picture description, and sentence-level prompts.",
        ST['normal']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph("• Select a task category from the list.", ST['bullet']))
    story.append(Paragraph("• Read the prompt aloud to the patient.", ST['bullet']))
    story.append(Paragraph("• Record the response using the text box or voice notes.", ST['bullet']))
    story.append(Paragraph("• Tap <b>Next</b> to advance.", ST['bullet']))
    story.append(Spacer(1, 0.25*cm))

    # Naming Practice — with NEW content
    story.append(Paragraph("Naming Practice", ST['subsection']))
    story.append(Paragraph(
        "A picture or word card is shown. Try to name it. If the word is on the tip of your "
        "tongue, press the <b>Space bar</b> while the answer box is empty for a sound-starter hint:",
        ST['normal']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "•  <b>Sound hints on (🔊):</b> each press reveals and speaks the beginning of the word "
        "up to the next natural vowel sound, plus the following consonant — for example the "
        "first press on <i>glasses</i> shows and says <b>GLAS</b>; on <i>chair</i> it shows and "
        "says <b>CHAIR</b>. The pronunciation always matches how the word really sounds in "
        "context, not how the letters would sound in isolation.",
        ST['bullet']))
    story.append(Paragraph(
        "•  <b>Sound hints off:</b> each press reveals one letter group at a time with no audio.",
        ST['bullet']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "The 🔊 button in the bottom-right corner of the hint area toggles sound hints. "
        "Your preference is saved automatically.",
        ST['normal']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "For more support, use the cue buttons:",
        ST['normal']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "•  <b>Semantic Cue</b> — shows a written description or category clue (e.g. \"a fruit\").",
        ST['bullet']))
    story.append(Paragraph(
        "•  <b>Phonemic Cue</b> — shows the first sound of the word in square brackets (e.g. [g]).",
        ST['bullet']))
    story.append(Paragraph(
        "•  <b>Reveal</b> — shows the full word. Use this if no other cue has worked.",
        ST['bullet']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "<b>Answer box note:</b> if there is already text in the box, the Space bar adds a space "
        "character rather than giving a hint — clear the box first if you want a hint.",
        ST['normal']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "When the patient types their answer, tap <b>Got it!</b> to record a correct response "
        "and get Dr. Aria's feedback, or use the cue buttons if more support is needed. "
        "Tap <b>Next word →</b> after Dr. Aria responds (or immediately if AI is not connected).",
        ST['normal']))
    story.append(Spacer(1, 0.2*cm))

    # Spaced Repetition callout (unchanged)
    sr_box = CalloutBox(
        icon="✨",
        title="Spaced Repetition — how words are scheduled",
        body_lines=[
            ("The Naming module uses a PPA-adapted spaced repetition engine. Words you recall "
             "easily are shown less often; words that need more support are shown more often. "
             "The maximum interval is 5 days — every word is reviewed at least weekly.", False),
            ("", False),
            ("Result scoring:", True),
            ("  correct (no cues used)  ×1.2 interval", False),
            ("  space_cued (Space-bar hint used)  ×0.9 interval", False),
            ("  semantic_cued  ×0.8 interval", False),
            ("  phonemic_cued  ×0.5 interval", False),
            ("  failed (full reveal)  reset to 1-day interval", False),
            ("", False),
            ("Words scored phonemic_cued or failed are re-queued 4 positions ahead "
             "for a second attempt within the same session.", False),
        ],
        bg=NEW_BG, border=NEW_BORDER,
    )
    story.append(sr_box)
    story.append(Spacer(1, 0.2*cm))

    # Admin callout (unchanged)
    admin_box = CalloutBox(
        icon="💡",
        title="Admin — customising the word list",
        body_lines=[
            ("In Admin mode you can add picture cards by typing a word and either letting "
             "the app look up an emoji automatically, or uploading a photo from the device "
             "camera roll. You can also edit cue text, adjust categories, and delete cards.", False),
            ("", False),
            ("Export the customised list as a .ppa file to share with other devices or "
             "to use as a backup.", False),
        ],
        bg=TIP_BG, border=TIP_BORDER,
    )
    story.append(admin_box)
    story.append(PageBreak())

    # ── PAGE 6 — REPETITION, SCRIPT TRAINING, SENTENCE BUILDER ───────────────
    story.append(section_rule())
    story.append(Paragraph("Repetition", ST['section']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "Structured repetition drills at increasing levels of difficulty.",
        ST['normal']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph("• Choose a difficulty level (1 = single words, up to 5 = full sentences).", ST['bullet']))
    story.append(Paragraph("• The prompt is shown on screen.", ST['bullet']))
    story.append(Paragraph("• The patient repeats the word or phrase aloud.", ST['bullet']))
    story.append(Paragraph("• Tap <b>Correct</b> or <b>Incorrect</b> to record the result.", ST['bullet']))
    story.append(Paragraph("• Tap <b>Next</b> to advance to the next item.", ST['bullet']))
    story.append(Spacer(1, 0.25*cm))

    story.append(section_rule())
    story.append(Paragraph("Script Training", ST['section']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "Functional scripts are short, high-frequency phrases for daily life — ordering food, "
        "greeting someone, answering the phone. Repeated practice builds automatic retrieval.",
        ST['normal']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph("• Select a script from the list.", ST['bullet']))
    story.append(Paragraph("• The script is shown line by line.", ST['bullet']))
    story.append(Paragraph("• The patient reads or repeats each line.", ST['bullet']))
    story.append(Paragraph("• Tap <b>Next line</b> to advance.", ST['bullet']))
    story.append(Paragraph("• Dr. Aria can provide feedback at the end of a script if AI is connected.", ST['bullet']))
    story.append(Spacer(1, 0.25*cm))

    story.append(section_rule())
    story.append(Paragraph("Sentence Builder", ST['section']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "A visual drag-and-drop tool for constructing sentences. Word tiles are arranged "
        "into categories (nouns, verbs, adjectives, etc.) and dragged into a sentence tray.",
        ST['normal']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph("• Tap or drag a word tile from the word bank into the sentence tray.", ST['bullet']))
    story.append(Paragraph("• Rearrange tiles by dragging them within the tray.", ST['bullet']))
    story.append(Paragraph("• Tap <b>Check sentence</b> to get AI feedback.", ST['bullet']))
    story.append(Paragraph("• Tap <b>Clear</b> to start again.", ST['bullet']))
    story.append(Paragraph("• Filter the word bank by category using the tabs at the top.", ST['bullet']))
    story.append(PageBreak())

    # ── PAGE 7 — SENTENCE WORK, VIDEO QUESTIONS ───────────────────────────────
    story.append(section_rule())
    story.append(Paragraph("Sentence Work", ST['section']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "Two sub-modes for sentence-level language practice:",
        ST['normal']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "<b>Sentence Completion</b> — a sentence with a missing word is shown. "
        "The patient types or says the missing word.",
        ST['bullet']))
    story.append(Paragraph(
        "<b>Sentence Construction</b> — a topic or picture prompt is shown. "
        "The patient constructs a complete sentence.",
        ST['bullet']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "After each response, Dr. Aria gives spoken and written feedback if AI is connected. "
        "Tap <b>Next</b> to advance.",
        ST['normal']))
    story.append(Spacer(1, 0.25*cm))

    story.append(section_rule())
    story.append(Paragraph("Video Questions", ST['section']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "Short video clips (from YouTube) are played, followed by comprehension questions. "
        "This module supports auditory and visual processing alongside language.",
        ST['normal']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph("• Select a video from the list.", ST['bullet']))
    story.append(Paragraph("• Watch the clip (plays embedded in the app).", ST['bullet']))
    story.append(Paragraph("• Answer comprehension questions — multiple choice or open-ended.", ST['bullet']))
    story.append(Paragraph("• Tap <b>Submit</b> to record your answer.", ST['bullet']))
    story.append(Paragraph("• Tap <b>Next question</b> to continue.", ST['bullet']))
    story.append(PageBreak())

    # ── PAGE 8 — PROGRESS ─────────────────────────────────────────────────────
    story.append(section_rule())
    story.append(Paragraph("Progress", ST['section']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "The Progress module shows a summary of all recorded activity.",
        ST['normal']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph("<b>Session log</b> — a chronological list of activities from the current session.", ST['bullet']))
    story.append(Paragraph("<b>Accuracy trends</b> — correct/incorrect rates by module over time.", ST['bullet']))
    story.append(Paragraph("<b>Naming SR statistics</b> — per-word spaced repetition data: interval, streak, last result, next due date.", ST['bullet']))
    story.append(Spacer(1, 0.15*cm))
    story.append(Paragraph(
        "Progress data is stored locally in the browser. Use <b>Export Backup</b> to save "
        "a .ppabak file as an off-device copy.",
        ST['normal']))
    story.append(PageBreak())

    # ── PAGES 9–10 — ADMIN PANEL, BACKUP & RESTORE ───────────────────────────
    story.append(section_rule())
    story.append(Paragraph("Admin Panel", ST['section']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "The Admin Panel is protected by a 4-digit PIN (default: <b>1234</b>). "
        "Change this before clinical use by editing the source code constant <code>ADMIN_PIN</code>.",
        ST['normal']))
    story.append(Spacer(1, 0.15*cm))

    story.append(Paragraph("Naming Module Admin", ST['subsubsection']))
    story.append(Paragraph("• <b>Add item</b> — type a word; the app will look up an emoji automatically (internet required), or you can upload an image.", ST['bullet']))
    story.append(Paragraph("• <b>Edit item</b> — change the word, graphic, semantic cue, or phonemic cue.", ST['bullet']))
    story.append(Paragraph("• <b>Delete item</b> — removes the card from the practice list.", ST['bullet']))
    story.append(Paragraph("• <b>Export list</b> — saves the current list as a .ppa file.", ST['bullet']))
    story.append(Paragraph("• <b>Import list</b> — loads a .ppa file, merging with or replacing the current list.", ST['bullet']))
    story.append(Spacer(1, 0.15*cm))

    story.append(Paragraph("Other Module Admin", ST['subsubsection']))
    story.append(Paragraph(
        "Each module with editable content shows an admin toolbar at the top of the screen "
        "when Admin mode is active. Use it to add, edit, and delete items.",
        ST['normal']))
    story.append(Spacer(1, 0.15*cm))

    warn_box = CalloutBox(
        icon="⚠️",
        title="Admin PIN security",
        body_lines=[
            ("The default PIN is 1234 and is visible in the source code. "
             "Change it before using the app in a clinical setting. "
             "The PIN only prevents accidental edits — it is not a security feature.", False),
        ],
        bg=WARN_BG, border=WARN_BORDER,
    )
    story.append(warn_box)
    story.append(Spacer(1, 0.25*cm))

    story.append(section_rule())
    story.append(Paragraph("Backup &amp; Restore", ST['section']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "All app data is stored in the browser's <b>localStorage</b>. This means:",
        ST['normal']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph("• Data persists between sessions on the same device and browser.", ST['bullet']))
    story.append(Paragraph("• Clearing browser data or switching browsers will lose data.", ST['bullet']))
    story.append(Paragraph("• Data does not sync across devices automatically.", ST['bullet']))
    story.append(Spacer(1, 0.15*cm))
    story.append(Paragraph("<b>To back up:</b>", ST['normal']))
    story.append(Paragraph("• Open Admin → Backup &amp; Restore.", ST['bullet']))
    story.append(Paragraph("• Tap <b>Export Full Backup</b> to download a .ppabak file.", ST['bullet']))
    story.append(Paragraph("• Store the file in a safe location (e.g. a shared folder or email it to yourself).", ST['bullet']))
    story.append(Spacer(1, 0.15*cm))
    story.append(Paragraph("<b>To restore:</b>", ST['normal']))
    story.append(Paragraph("• Open Admin → Backup &amp; Restore.", ST['bullet']))
    story.append(Paragraph("• Tap <b>Import Backup</b> and select the .ppabak file.", ST['bullet']))
    story.append(Paragraph("• The page will reload with all data restored.", ST['bullet']))
    story.append(Spacer(1, 0.15*cm))

    tip_box = CalloutBox(
        icon="💡",
        title="Tip — backup after every customisation session",
        body_lines=[
            ("Whenever you add new picture cards, edit scripts, or adjust word banks, "
             "export a fresh .ppabak backup. This protects your work if the browser data "
             "is ever cleared.", False),
        ],
        bg=TIP_BG, border=TIP_BORDER,
    )
    story.append(tip_box)
    story.append(PageBreak())

    # ── PAGE 11 — spacer ──────────────────────────────────────────────────────
    story.append(PageBreak())

    # ── PAGES 12–13 — TIPS FOR EFFECTIVE SESSIONS ────────────────────────────
    story.append(section_rule())
    story.append(Paragraph("Tips for Effective Sessions", ST['section']))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("Session length and pacing", ST['subsection']))
    story.append(Paragraph(
        "Shorter, more frequent sessions are generally more effective than long infrequent ones. "
        "Aim for 15–30 minutes per day if possible. Watch for signs of fatigue — reduced "
        "engagement, increased errors, or frustration — and end the session early if needed.",
        ST['normal']))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("Choosing the right modules", ST['subsection']))
    story.append(Paragraph(
        "Begin sessions with a warm-up activity (AI Therapist or a well-known Script) before "
        "moving to more demanding tasks (Naming, Sentence Work). End on a positive note with "
        "something the patient finds rewarding.",
        ST['normal']))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("Using cues effectively", ST['subsection']))
    story.append(Paragraph(
        "In Naming Practice, try to allow a generous response time (10–15 seconds) before "
        "offering a cue. Use the least-support cue first — Space-bar phoneme hint, then "
        "Semantic Cue, then Phonemic Cue, then Reveal. This hierarchy is reflected in the "
        "spaced repetition scoring.",
        ST['normal']))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("Involving the patient in goal-setting", ST['subsection']))
    story.append(Paragraph(
        "Where possible, involve the person with PPA in deciding which words to practise and "
        "which scripts matter most to them. Personally meaningful content produces better "
        "motivation and retention.",
        ST['normal']))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("Recording baseline data", ST['subsection']))
    story.append(Paragraph(
        "Before starting intensive practice on a new word set, record a baseline probe in the "
        "Assessment module. Repeat the probe every 2–4 weeks to track maintenance and "
        "generalisation.",
        ST['normal']))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("Caregiver involvement", ST['subsection']))
    story.append(Paragraph(
        "Caregivers can support practice by:",
        ST['normal']))
    story.append(Paragraph("• Sitting alongside and providing gentle encouragement (not corrections).", ST['bullet']))
    story.append(Paragraph("• Reading prompts aloud if the patient finds on-screen text difficult.", ST['bullet']))
    story.append(Paragraph("• Noting which words or scripts the patient found particularly difficult or easy.", ST['bullet']))
    story.append(Paragraph("• Exporting a session log to share with the patient's SLP.", ST['bullet']))
    story.append(Spacer(1, 0.2*cm))

    story.append(section_rule())
    story.append(Paragraph("Troubleshooting", ST['section']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "Below are the most common issues and how to resolve them.",
        ST['normal']))
    story.append(PageBreak())

    # ── PAGE 14 — TROUBLESHOOTING continued + footer ──────────────────────────
    trouble_table = make_table(
        ["Problem", "Solution"],
        [
            ["Dr. Aria does not respond",
             "Check your API key in Admin → Settings. Make sure you have an internet connection. "
             "The module will still advance without a response."],
            ["Picture cards show ❓ instead of an image",
             "The emoji look-up requires an internet connection. Try again online, or upload "
             "a photo from the camera roll in Admin mode."],
            ["Space bar does not give a hint",
             "Make sure the answer box is empty. If there is any text in the box the Space bar "
             "adds a space instead. Clear the box first."],
            ["All my word lists have disappeared",
             "Browser localStorage may have been cleared. Restore from a .ppabak backup file "
             "in Admin → Backup & Restore."],
            ["The app is very slow",
             "Close other browser tabs. On iPad, ensure Low Power Mode is off. "
             "The app runs best in Chrome or Safari on a modern device."],
            ["Export / Import does not work",
             "File downloads may be blocked by a browser setting or pop-up blocker. "
             "Check browser permissions and try again."],
            ["Audio hints do not play (sound icon)",
             "Check that the device is not muted and the browser has permission to play audio. "
             "On iOS, the silent switch must be off. Tap the 🔊 button to toggle audio hints."],
        ],
        col_widths=[6*cm, CONTENT_W - 6*cm]
    )
    story.append(trouble_table)
    story.append(Spacer(1, 0.5*cm))

    story.append(Paragraph(
        "PPA Speech Therapy Suite  •  Version 4  •  March 2026  •  "
        "Designed for use under the supervision of a speech-language pathologist.",
        ST['footer']))

    # Build
    def on_first(c, d): pass
    def on_later(c, d):
        c.saveState()
        c.setFont('Helvetica', 8)
        c.setFillColor(colors.HexColor("#888888"))
        c.drawString(MARGIN, PAGE_H - MARGIN + 6,
                     f"PPA Speech Therapy Suite  •  Page {d.page}")
        c.setStrokeColor(TEAL)
        c.setLineWidth(0.5)
        c.line(MARGIN, PAGE_H - MARGIN + 2, PAGE_W - MARGIN, PAGE_H - MARGIN + 2)
        c.restoreState()

    doc.build(story, onFirstPage=on_first, onLaterPages=on_later)
    print(f"  Written: {path}")


# ─────────────────────────────────────────────────────────────────────────────
#  DOCUMENT 2 — TECHNICAL REFERENCE
# ─────────────────────────────────────────────────────────────────────────────

def build_tech_ref(path):
    doc = SimpleDocTemplate(
        path,
        pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN + 0.5*cm, bottomMargin=MARGIN,
        title="PPA Speech Therapy Suite — Technical Reference Documentation",
        author="PPA Speech Therapy Suite",
    )

    story = []

    def on_first(c, d): pass
    def on_later(c, d):
        c.saveState()
        c.setFont('Helvetica', 8)
        c.setFillColor(colors.HexColor("#888888"))
        c.drawString(MARGIN, PAGE_H - MARGIN + 6,
                     f"PPA Speech Therapy Suite — Technical Reference  •  Page {d.page}")
        c.setStrokeColor(TEAL)
        c.setLineWidth(0.5)
        c.line(MARGIN, PAGE_H - MARGIN + 2, PAGE_W - MARGIN, PAGE_H - MARGIN + 2)
        c.restoreState()

    # ── COVER ─────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 3*cm))
    story.append(Paragraph("🌿", ST['cover_emoji']))
    story.append(Spacer(1, 0.4*cm))
    story.append(Paragraph("PPA Speech Therapy Suite", ST['cover_title']))
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("Technical Reference Documentation", ST['cover_subtitle']))
    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph("Version 4  (March 2026)", ST['cover_version']))
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph(
        "Single-file React application for Primary Progressive Aphasia (PPA) speech therapy.",
        ST['cover_tagline']))
    story.append(Paragraph(
        "Runs as a Claude.ai artifact or locally via Vite.  Powered by Claude Sonnet.",
        ST['cover_tagline']))
    story.append(PageBreak())

    # ── SECTION 1 — ARCHITECTURE OVERVIEW ────────────────────────────────────
    story.append(section_rule())
    story.append(Paragraph("1.  Architecture Overview", ST['section']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "The PPA Speech Therapy Suite is a single-page React application that runs "
        "entirely in the browser. There is no backend server — all persistence is via "
        "<code>localStorage</code> and all AI calls are made directly from the browser "
        "to the Anthropic API.",
        ST['normal']))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("1.1  Technology Stack", ST['subsection']))
    story.append(Spacer(1, 0.1*cm))

    tech_table = make_table(
        ["Layer", "Technology"],
        [
            ["UI framework", "React 18 (hooks only, no class components)"],
            ["Build tool", "Vite 5 with ESM modules"],
            ["AI / LLM", "Anthropic Claude (claude-sonnet-4-5 or latest)"],
            ["Styling", "Inline styles only — no CSS framework"],
            ["Speech synthesis", "meSpeak v2 (eSpeak compiled to JavaScript via Emscripten)"],
            ["Distribution", "Claude.ai artifact (single JSX file) or Vite dev/build"],
            ["Persistence", "localStorage (all keys prefixed ppa_)"],
            ["PWA", "manifest.json + service worker for iPad home-screen install"],
        ],
        col_widths=[5.5*cm, CONTENT_W - 5.5*cm]
    )
    story.append(tech_table)
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("1.2  Source File Layout", ST['subsection']))
    story.append(Spacer(1, 0.1*cm))
    layout_lines = [
        "ppa-source/",
        "  ppa-speech-therapy_main.jsx   # App shell + all modules except Naming and SentenceBuilder",
        "  NamingModule.jsx              # Picture-naming practice with spaced repetition",
        "  SentenceBuilderModule.jsx     # Visual drag-and-drop sentence construction",
        "  ExportImportSystem.jsx        # .ppa / .ppabak export, import, and backup logic",
        "  shared.jsx                    # Shared utilities: fetchAnthropicApi, CallAPI, ThinkingDots",
        "  data/",
        "    config.js                   # CLAUDE_MODEL constant + Dr. Aria SYSTEM_PROMPT",
        "    dictionary.js               # Unified word->{graphic, cues, categories} store",
        "    namingItems.js              # 10 built-in picture-naming items (seed data)",
        "    sbWordBank.js               # Noun/verb/adjective/adverb/pronoun/prep/article banks",
        "    sbConjugation.js            # Verb conjugation rules for all tenses",
        "    repetitionItems.js          # Repetition drill levels",
        "    sentenceTasks.js            # Sentence completion and construction prompts",
        "    scripts.js                  # Functional phrase scripts",
        "    assessmentTasks.js          # Evaluation items",
        "    videoClips.js               # Video comprehension clips and question types",
        "    tools.js                    # Sidebar navigation definitions",
    ]
    story.append(CodeBlock(layout_lines))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("1.3  Module Dependencies", ST['subsection']))
    story.append(Paragraph(
        "All inter-module shared code lives in <code>shared.jsx</code>. "
        "Modules import only what they need. The dependency graph is intentionally flat — "
        "no circular imports.",
        ST['normal']))
    story.append(PageBreak())

    # ── SECTION 2 — SHARED UTILITIES ─────────────────────────────────────────
    story.append(section_rule())
    story.append(Paragraph("2.  Shared Utilities (shared.jsx)", ST['section']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "All Anthropic API access and the loading indicator live in <code>shared.jsx</code>. "
        "Never duplicate these inline in a module.",
        ST['normal']))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("2.1  fetchAnthropicApi(body, signal?)", ST['subsection']))
    story.append(Paragraph(
        "Low-level async helper. Applies all required headers "
        "(<code>x-api-key</code>, <code>anthropic-version</code>, "
        "<code>anthropic-dangerous-direct-browser-access</code>). "
        "Returns parsed JSON. Throws on network error or abort. "
        "Use this for fire-and-forget calls (e.g. emoji lookup in SentenceBuilder).",
        ST['normal']))
    story.append(Spacer(1, 0.1*cm))
    story.append(CodeBlock([
        "const data = await fetchAnthropicApi({",
        "  model: CLAUDE_MODEL,",
        "  max_tokens: 256,",
        "  messages: [{ role: 'user', content: prompt }]",
        "}, abortSignal);",
    ]))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("2.2  <CallAPI messages onResult onError system?>", ST['subsection']))
    story.append(Paragraph(
        "React component that fires one API request on mount and calls "
        "<code>onResult(text)</code> or <code>onError(err)</code> exactly once. "
        "Uses <code>AbortController</code> — the request is cancelled automatically on unmount. "
        "<code>onResult</code> always receives a non-empty string "
        "(falls back to <code>\"Well done — keep going!\"</code>). "
        "Mount it conditionally: <code>{pendingAI && &lt;CallAPI … /&gt;}</code>.",
        ST['normal']))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("2.3  <ThinkingDots />", ST['subsection']))
    story.append(Paragraph(
        "Animated three-dot spinner. Use during any AI loading state.",
        ST['normal']))
    story.append(PageBreak())

    # ── SECTION 3 — DATA LAYER ────────────────────────────────────────────────
    story.append(section_rule())
    story.append(Paragraph("3.  Data Layer", ST['section']))
    story.append(Spacer(1, 0.1*cm))

    story.append(Paragraph("3.1  localStorage Keys", ST['subsection']))
    story.append(Spacer(1, 0.1*cm))
    ls_table = make_table(
        ["Key", "Contents"],
        [
            ["ppa_dictionary", "Canonical word→{graphic, cues, categories} map (JSON)"],
            ["ppa_naming_items", "Current naming practice list (JSON array)"],
            ["ppa_naming_sr", "Spaced repetition state per word (JSON object)"],
            ["ppa_naming_audio_hints", "Boolean — audio hints on/off (string 'true'/'false')"],
            ["ppa_session_log", "Array of session log entries (JSON)"],
            ["ppa_progress", "Accuracy history per module (JSON)"],
            ["ppa_scripts", "Custom scripts (JSON array)"],
            ["ppa_sentences", "Custom sentence tasks (JSON array)"],
            ["ppa_video_clips", "Custom video clips (JSON array)"],
            ["ppa_assessment", "Custom assessment tasks (JSON array)"],
        ],
        col_widths=[5.5*cm, CONTENT_W - 5.5*cm]
    )
    story.append(ls_table)
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("3.2  Dictionary (data/dictionary.js)", ST['subsection']))
    story.append(Paragraph(
        "Single source of truth for all word graphics, stored in localStorage under "
        "<code>ppa_dictionary</code>. Both NamingModule and SentenceBuilder read and "
        "write through the dictionary API:",
        ST['normal']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph("•  <code>dictLoadNamingItems()</code> / <code>dictSaveNamingItems(items)</code> — load/persist the naming practice list.", ST['bullet']))
    story.append(Paragraph("•  <code>dictGetGraphic(word, fallback)</code> — resolve canonical emoji or base64 image.", ST['bullet']))
    story.append(Paragraph("•  <code>dictAddWord(word, graphic)</code> — register a new word (first writer wins; ❓ is always upgradeable).", ST['bullet']))
    story.append(Paragraph("•  <code>useDictionaryLookup()</code> — React hook returning a stable <code>{ word: graphic }</code> map.", ST['bullet']))
    story.append(PageBreak())

    # ── SECTION 4 — EXPORT / IMPORT SYSTEM ───────────────────────────────────
    story.append(section_rule())
    story.append(Paragraph("4.  Export / Import System (ExportImportSystem.jsx)", ST['section']))
    story.append(Spacer(1, 0.1*cm))

    story.append(Paragraph("4.1  File Formats", ST['subsection']))
    story.append(Paragraph(
        "<b>.ppa files</b> — per-module item exports. "
        "Format: <code>{ ppaExport: true, moduleId, items: [...] }</code>.",
        ST['normal']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "<b>.ppabak files</b> — full-app backup of all <code>ppa_*</code> localStorage keys. "
        "Restoring reloads the page.",
        ST['normal']))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("4.2  Public API", ST['subsection']))
    story.append(Paragraph(
        "All public functions and components are named exports. "
        "The main app and each module import only what they need.",
        ST['normal']))
    story.append(Spacer(1, 0.1*cm))
    api_table = make_table(
        ["Export", "Type", "Purpose"],
        [
            ["ppaDownload(filename, data)", "function", "Triggers browser file download"],
            ["ppaDoBackup()", "function", "Exports full .ppabak backup"],
            ["ppaBackupIsStale()", "function", "Returns true if last backup >7 days ago"],
            ["PpaAdminToolbar", "component", "Admin mode toolbar strip"],
            ["PpaExportDialog", "component", "Export dialog for a module"],
            ["PpaReexportDialog", "component", "Re-export changed items dialog"],
            ["BackupRestorePanel", "component", "Full backup/restore UI panel"],
        ],
        col_widths=[6*cm, 2.5*cm, CONTENT_W - 8.5*cm]
    )
    story.append(api_table)
    story.append(PageBreak())

    # ── SECTION 5 — NAMING MODULE ─────────────────────────────────────────────
    story.append(section_rule())
    story.append(Paragraph("5.  Naming Module (NamingModule.jsx)", ST['section']))
    story.append(Spacer(1, 0.1*cm))

    story.append(Paragraph("5.1  Practice Phases", ST['subsection']))
    story.append(Paragraph(
        "The naming flow moves through these phases for each item:",
        ST['normal']))
    story.append(Spacer(1, 0.1*cm))
    phases_table = make_table(
        ["Phase", "Display", "Transitions"],
        [
            ["show", "Graphic + empty input", "Space → phoneme hint; Semantic Cue btn → semantic; type + Got it! → record correct"],
            ["semantic", "Semantic cue text shown", "Phonemic Cue btn → phonemic"],
            ["phonemic", "Phonemic cue shown", "Reveal btn → answer"],
            ["answer", "Full word shown", "Next word → advance"],
        ],
        col_widths=[2.5*cm, 5*cm, CONTENT_W - 7.5*cm]
    )
    story.append(phases_table)
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("5.2  Spaced Repetition Engine", ST['subsection']))
    story.append(Paragraph(
        "PPA-adapted SR — deliberately conservative (max 5-day interval, regression decay "
        "on every load):",
        ST['normal']))
    story.append(Spacer(1, 0.1*cm))
    sr_table = make_table(
        ["Result", "SR_FACTOR", "When used"],
        [
            ["correct", "×1.2", "Answered without any help"],
            ["space_cued", "×0.9", "Used the Space-key phoneme starter"],
            ["semantic_cued", "×0.8", "Used the concept hint"],
            ["phonemic_cued", "×0.5", "Used the sound cue"],
            ["failed", "reset → 1 day", "Needed full reveal"],
        ],
        col_widths=[3.5*cm, 3*cm, CONTENT_W - 6.5*cm]
    )
    story.append(sr_table)
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "SR state is stored in localStorage under <code>ppa_naming_sr</code>: "
        "<code>{ [word]: { interval, dueDate, streak, lastResult, lastSeen } }</code>.",
        ST['normal']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "Words answered with <code>phonemic_cued</code> or <code>failed</code> are "
        "re-inserted 4 positions ahead in the session queue for same-session repetition.",
        ST['normal']))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("5.3  AI Feedback Flow", ST['subsection']))
    story.append(Paragraph(
        "After recording any response, <code>&lt;CallAPI&gt;</code> is mounted to fetch "
        "Dr. Aria's feedback. Once the response arrives the \"Next word →\" button appears. "
        "If the API call fails (no key, CORS, etc.) <code>onError</code> calls "
        "<code>next()</code> directly so the user is never left stuck.",
        ST['normal']))
    story.append(PageBreak())

    # ── SECTION 5.4 — PHONEME STARTER (MAJOR CHANGE) ─────────────────────────
    story.append(Paragraph("5.4  Phoneme Starter (Space Key) with Audio Hints", ST['subsection']))
    story.append(Paragraph(
        "In the <code>show</code> phase, when the response input is empty, pressing "
        "<b>Space</b> reveals a prefix of the target word and (if audio hints are on) "
        "speaks it aloud via <b>meSpeak</b>.",
        ST['normal']))
    story.append(Spacer(1, 0.15*cm))

    story.append(Paragraph("Audio-hints toggle", ST['subsubsection']))
    story.append(Paragraph(
        "A 🔊 button in the bottom-right corner of the input area toggles audio hints on/off. "
        "The choice is persisted in localStorage under <code>ppa_naming_audio_hints</code>. "
        "Default is on.",
        ST['normal']))
    story.append(Spacer(1, 0.15*cm))

    story.append(Paragraph("Audio-on mode (default)", ST['subsubsection']))
    story.append(Paragraph(
        "Each Space press advances the display to the next vowel boundary "
        "(via <code>findNextVowelEnd</code>) plus the immediately following consonant group "
        "(via <code>getNextPhoneme</code> as an <i>anchor</i>), then speaks that exact text:",
        ST['normal']))
    story.append(Spacer(1, 0.1*cm))
    story.append(CodeBlock([
        "const newCharCount = findNextVowelEnd(item.word, phonemesRevealed);",
        "const anchor = newCharCount < item.word.length",
        "  ? getNextPhoneme(item.word, newCharCount)   // next consonant group",
        "  : \"\";",
        "const displayCount = newCharCount + anchor.length;",
        "setPhonemesRevealed(displayCount);",
        "meSpeak.resetQueue();",
        "meSpeak.speak(item.word.slice(0, displayCount).toLowerCase(), { speed: 130 });",
    ]))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "The trailing consonant anchor is essential for correct vowel quality. Without it, "
        "eSpeak's LTS rules assign the wrong allophone to word-final vowels: "
        "<code>meSpeak.speak(\"gla\")</code> produces a schwa-like sound. With the anchor, "
        "<code>meSpeak.speak(\"glas\")</code> forces a CVC (closed syllable) context and "
        "correctly produces the short /æ/ of <i>glasses</i>. Similarly, speaking "
        "<code>\"chair\"</code> gives eSpeak's dictionary pronunciation /tʃɛr/ rather than "
        "the standalone-word pronunciation /tʃaɪ/ of <code>\"chai\"</code>.",
        ST['normal']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "Display and audio always show the same characters — "
        "the patient never hears more than is displayed.",
        ST['normal']))
    story.append(Spacer(1, 0.15*cm))

    audio_ex_table = make_table(
        ["Example", "Display", "speakText", "Result"],
        [
            ["glasses, press 1", "GLAS", "\"glas\"", "short-/æ/ ✓"],
            ["glasses, press 2", "GLASSES", "\"glasses\"", "full word ✓"],
            ["chair, press 1", "CHAIR", "\"chair\"", "/tʃɛr/ not /tʃaɪ/ ✓"],
            ["apple, press 1", "AP", "\"ap\"", "short-/æ/ ✓"],
        ],
        col_widths=[4*cm, 2.5*cm, 3*cm, CONTENT_W - 9.5*cm]
    )
    story.append(audio_ex_table)
    story.append(Spacer(1, 0.15*cm))

    story.append(Paragraph("Audio-off mode", ST['subsubsection']))
    story.append(Paragraph(
        "Each Space press advances by one grapheme group (1–3 characters) using "
        "<code>getNextPhoneme</code>. No audio is played.",
        ST['normal']))
    story.append(Spacer(1, 0.15*cm))

    story.append(Paragraph("Vowel and grapheme helpers", ST['subsubsection']))
    story.append(Spacer(1, 0.1*cm))
    helpers_table = make_table(
        ["Function", "Purpose"],
        [
            ["findNextVowelEnd(word, startPos)",
             "Returns char position after next vowel group (single or digraph)."],
            ["getNextPhoneme(word, pos)",
             "Returns next grapheme cluster (1–3 chars) via TRIGRAPHS / DIGRAPHS arrays; "
             "used for both audio-off advances and the audio-on anchor."],
            ["VOWEL_GROUPS",
             "Multi-letter vowel digraphs (ai, ay, ea, ee, igh, ough, …) checked longest-first."],
            ["LETTER_VOWELS", "Set: {a, e, i, o, u}."],
        ],
        col_widths=[5.5*cm, CONTENT_W - 5.5*cm]
    )
    story.append(helpers_table)
    story.append(Spacer(1, 0.15*cm))

    story.append(Paragraph("meSpeak initialisation", ST['subsubsection']))
    story.append(Spacer(1, 0.1*cm))
    story.append(CodeBlock([
        "import meSpeak from \"mespeak\";",
        "import meSpeakConfig from \"mespeak/src/mespeak_config.json\";",
        "import enVoice from \"mespeak/voices/en/en-us.json\";",
        "",
        "if (!meSpeak.isConfigLoaded()) meSpeak.loadConfig(meSpeakConfig);",
        "if (!meSpeak.isVoiceLoaded())  meSpeak.loadVoice(enVoice);",
    ]))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "Initialisation runs at module level. <code>meSpeak.resetQueue()</code> is called "
        "before each <code>speak()</code> to prevent audio queuing when Space is pressed rapidly.",
        ST['normal']))
    story.append(Spacer(1, 0.15*cm))

    story.append(Paragraph("SR result", ST['subsubsection']))
    story.append(Paragraph(
        "Submitting with <code>phonemesRevealed &gt; 0</code> records <code>space_cued</code> "
        "(SR_FACTOR ×0.9). The mild penalty acknowledges the word was not recalled unaided, "
        "while reflecting that audio support is lighter than semantic or phonemic cueing.",
        ST['normal']))
    story.append(PageBreak())

    # ── SECTION 6 — SENTENCE BUILDER ─────────────────────────────────────────
    story.append(section_rule())
    story.append(Paragraph("6.  Sentence Builder Module (SentenceBuilderModule.jsx)", ST['section']))
    story.append(Spacer(1, 0.1*cm))

    story.append(Paragraph("6.1  Word Bank", ST['subsection']))
    story.append(Paragraph(
        "Words are organised into seven categories: nouns, verbs, adjectives, adverbs, "
        "pronouns, prepositions, and articles. The bank is stored in "
        "<code>data/sbWordBank.js</code>. Conjugation rules for all tenses are in "
        "<code>data/sbConjugation.js</code>.",
        ST['normal']))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("6.2  Drag-and-Drop", ST['subsection']))
    story.append(Paragraph(
        "Built with native HTML5 drag-and-drop events (no third-party library). "
        "Touch events on iOS are handled with a polyfill embedded in the component. "
        "Tiles can be dragged from the bank into the tray, and reordered within the tray.",
        ST['normal']))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("6.3  AI Feedback", ST['subsection']))
    story.append(Paragraph(
        "When the patient taps <b>Check sentence</b>, the constructed sentence is sent to "
        "<code>fetchAnthropicApi</code> with a prompt asking Dr. Aria to give brief, "
        "encouraging grammatical feedback. The emoji for new words is also looked up via "
        "<code>fetchAnthropicApi</code> and stored in the dictionary.",
        ST['normal']))
    story.append(PageBreak())

    # ── SECTION 7 — OTHER MODULES ─────────────────────────────────────────────
    story.append(section_rule())
    story.append(Paragraph("7.  Other Modules", ST['section']))
    story.append(Spacer(1, 0.1*cm))

    story.append(Paragraph("7.1  AI Therapist (TherapistModule)", ST['subsection']))
    story.append(Paragraph(
        "Full multi-turn conversation with Dr. Aria. Messages are accumulated in component "
        "state (not persisted). Uses <code>&lt;CallAPI&gt;</code> mounted on every send. "
        "The system prompt is defined in <code>data/config.js</code>.",
        ST['normal']))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("7.2  Assessment", ST['subsection']))
    story.append(Paragraph(
        "Presents tasks from <code>data/assessmentTasks.js</code>. Responses are recorded "
        "as correct/incorrect/partial and logged to the session log. Admin can add, edit, "
        "and reorder tasks.",
        ST['normal']))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("7.3  Repetition", ST['subsection']))
    story.append(Paragraph(
        "Drills from <code>data/repetitionItems.js</code>, grouped by level. "
        "Accuracy is tracked per level. Dr. Aria gives end-of-level feedback.",
        ST['normal']))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("7.4  Script Training", ST['subsection']))
    story.append(Paragraph(
        "Scripts from <code>data/scripts.js</code>. Each script has a name, context, "
        "and ordered lines. After completing a script, Dr. Aria gives feedback. "
        "Scripts can be exported/imported as .ppa files.",
        ST['normal']))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("7.5  Sentence Work", ST['subsection']))
    story.append(Paragraph(
        "Two sub-modes (completion and construction) drawing from "
        "<code>data/sentenceTasks.js</code>. Both use <code>&lt;CallAPI&gt;</code> for "
        "per-item AI feedback.",
        ST['normal']))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("7.6  Video Questions", ST['subsection']))
    story.append(Paragraph(
        "Clips defined in <code>data/videoClips.js</code>. YouTube embeds via iframe. "
        "Questions can be multiple-choice (EMOJI_OPTIONS) or open-ended. "
        "Responses are logged.",
        ST['normal']))
    story.append(PageBreak())

    # ── SECTION 8 — PROGRESS MODULE ───────────────────────────────────────────
    story.append(section_rule())
    story.append(Paragraph("8.  Progress Module", ST['section']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "Reads from the session log (<code>ppa_session_log</code>) and the SR state "
        "(<code>ppa_naming_sr</code>) to display:",
        ST['normal']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph("•  <b>Session log</b> — timestamped list of all activity this session.", ST['bullet']))
    story.append(Paragraph("•  <b>Accuracy charts</b> — per-module correct/incorrect percentages.", ST['bullet']))
    story.append(Paragraph("•  <b>SR table</b> — per-word interval, streak, last result, next due date.", ST['bullet']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "The session log is not persisted across page reloads — it is held in React state "
        "at the app root and passed down as a prop.",
        ST['normal']))
    story.append(PageBreak())

    # ── SECTION 9 — CONFIGURATION ─────────────────────────────────────────────
    story.append(section_rule())
    story.append(Paragraph("9.  Configuration (data/config.js)", ST['section']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "<code>config.js</code> exports two constants:",
        ST['normal']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "<b>CLAUDE_MODEL</b> — the Anthropic model string used in all API calls "
        "(e.g. <code>\"claude-sonnet-4-5\"</code>). Change this to upgrade to a newer model.",
        ST['bullet']))
    story.append(Paragraph(
        "<b>SYSTEM_PROMPT</b> — Dr. Aria's full system prompt. Defines her persona, "
        "tone, and therapeutic approach. Edit this to customise her behaviour.",
        ST['bullet']))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("9.1  Environment Variable", ST['subsection']))
    story.append(Paragraph(
        "The Anthropic API key is read from <code>import.meta.env.VITE_ANTHROPIC_API_KEY</code>. "
        "Create a <code>.env</code> file in the repo root:",
        ST['normal']))
    story.append(Spacer(1, 0.1*cm))
    story.append(CodeBlock(["VITE_ANTHROPIC_API_KEY=sk-ant-..."]))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "Without it the AI calls fail silently and the app auto-advances rather than "
        "showing Dr. Aria's feedback.",
        ST['normal']))
    story.append(PageBreak())

    # ── SECTION 10 — IMPLEMENTATION NOTES ────────────────────────────────────
    story.append(section_rule())
    story.append(Paragraph("10.  Implementation Notes", ST['section']))
    story.append(Spacer(1, 0.1*cm))

    story.append(Paragraph("10.1  React StrictMode", ST['subsection']))
    story.append(Paragraph(
        "StrictMode is active in development (<code>src/main.jsx</code>). Effects run twice. "
        "All <code>useEffect</code> hooks must return a cleanup function. "
        "<code>&lt;CallAPI&gt;</code>'s <code>AbortController</code> handles this automatically.",
        ST['normal']))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("10.2  No Backend — Security Considerations", ST['subsection']))
    story.append(Paragraph(
        "The API key is stored in browser localStorage (or .env for Vite builds). "
        "This is acceptable for a single-patient, single-device use case but is not suitable "
        "for a multi-user web deployment. In that scenario the key must be moved to a backend "
        "proxy.",
        ST['normal']))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("10.3  CORS — anthropic-dangerous-direct-browser-access", ST['subsection']))
    story.append(Paragraph(
        "Anthropic's API requires the header "
        "<code>anthropic-dangerous-direct-browser-access: true</code> for direct browser "
        "calls. This is set in <code>fetchAnthropicApi</code> and must not be removed.",
        ST['normal']))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("10.4  Admin PIN", ST['subsection']))
    story.append(Paragraph(
        "The PIN is defined as a constant in <code>NamingModule.jsx</code> "
        "(<code>const ADMIN_PIN = \"1234\"</code>). Change this before clinical deployment. "
        "The PIN is checked only in the browser — it provides no server-side security.",
        ST['normal']))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("10.5  PWA / Service Worker", ST['subsection']))
    story.append(Paragraph(
        "The <code>pwa/</code> directory contains a <code>manifest.json</code> and a "
        "<code>service-worker.js</code> that cache the app shell for offline use. "
        "The service worker is registered in <code>index.html</code>. "
        "AI features remain unavailable offline.",
        ST['normal']))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("10.6  localStorage Limits", ST['subsection']))
    story.append(Paragraph(
        "Most browsers allow 5–10 MB of localStorage per origin. "
        "Base64-encoded photos in the dictionary are the largest consumers. "
        "The app does not enforce a limit — if storage fills, writes will silently fail. "
        "Advise users to use emoji graphics rather than photos where possible.",
        ST['normal']))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("10.7  Bundle Size", ST['subsection']))
    story.append(Paragraph(
        "The Vite build produces a single JS bundle. The meSpeak library (eSpeak WASM) "
        "adds ~1.5 MB to the bundle. This is acceptable for a local/LAN deployment but "
        "may be slow on a first load over a slow connection. "
        "Consider using <code>import()</code> lazy loading for meSpeak if load time is a concern.",
        ST['normal']))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("10.8  Audio Hints — Vowel Anchoring Approach", ST['subsection']))
    story.append(Paragraph(
        "The initial approach used <code>phonemizer</code> (Xenova, eSpeak-NG WASM) to convert "
        "each word to IPA, map IPA tokens to eSpeak X-SAMPA notation, and call "
        "<code>meSpeak.speak(\"[[g l {]]\")</code> in phoneme mode. Two problems made this "
        "unworkable: (1) the phonemizer package failed to initialise its search engine in the "
        "Vite development environment; (2) meSpeak v2's <code>[[...]]</code> phoneme notation "
        "produced no audio output (returns <code>null</code> for <code>rawdata: true</code>).",
        ST['normal']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "The replacement approach requires no external phonemizer. Speaking the prefix plus "
        "one anchor consonant in text mode (<code>meSpeak.speak(\"glas\")</code>) achieves "
        "correct vowel quality because eSpeak's LTS rules handle closed-syllable /æ/ correctly. "
        "For dictionary words the full matched string invokes eSpeak's internal dictionary, "
        "giving the correct pronunciation automatically.",
        ST['normal']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "<code>phonemizer</code> and <code>espeak-ng</code> have been removed from "
        "<code>package.json</code>. Both are listed in "
        "<code>vite.config.js → optimizeDeps.exclude</code> to prevent Vite from attempting "
        "to pre-bundle any stale package stubs.",
        ST['normal']))
    story.append(PageBreak())

    # ── SECTION 11 — INSTALLER / DISTRIBUTION ────────────────────────────────
    story.append(section_rule())
    story.append(Paragraph("11.  Installer / Distribution", ST['section']))
    story.append(Spacer(1, 0.1*cm))

    story.append(Paragraph("11.1  macOS Installer (installer/install.sh)", ST['subsection']))
    story.append(Paragraph(
        "A shell script that:",
        ST['normal']))
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph("• Checks for Node.js and npm.", ST['bullet']))
    story.append(Paragraph("• Runs <code>npm install</code>.", ST['bullet']))
    story.append(Paragraph("• Copies PDF documentation to the install directory.", ST['bullet']))
    story.append(Paragraph("• Performs a preflight check for PDF presence.", ST['bullet']))
    story.append(Paragraph("• Launches the Vite dev server.", ST['bullet']))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("11.2  Windows Installer (win-installer/install.ps1)", ST['subsection']))
    story.append(Paragraph(
        "A PowerShell script performing the same steps as the macOS installer, "
        "adapted for Windows paths and conventions.",
        ST['normal']))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("11.3  Claude.ai Artifact", ST['subsection']))
    story.append(Paragraph(
        "The bundle files (<code>ppa-speech-therapy-bundle.jsx</code>) in each installer "
        "directory are single-file versions of the app suitable for pasting into a "
        "Claude.ai artifact. They include all module code inlined.",
        ST['normal']))
    story.append(PageBreak())

    # ── SECTION 12 — CHANGELOG ────────────────────────────────────────────────
    story.append(section_rule())
    story.append(Paragraph("12.  Changelog", ST['section']))
    story.append(Spacer(1, 0.1*cm))

    story.append(Paragraph("Version 4.0.0  (March 2026)", ST['subsection']))
    story.append(Paragraph("• Added meSpeak audio hints with vowel-anchored pronunciation in Naming module.", ST['bullet']))
    story.append(Paragraph("• Replaced phonemizer / espeak-ng IPA pipeline with text-mode meSpeak.", ST['bullet']))
    story.append(Paragraph("• Added <code>ppa_naming_audio_hints</code> localStorage key for toggle persistence.", ST['bullet']))
    story.append(Paragraph("• Added Space-bar phoneme starter (space_cued, SR ×0.9).", ST['bullet']))
    story.append(Paragraph("• Extracted shared utilities to <code>shared.jsx</code> (fetchAnthropicApi, CallAPI, ThinkingDots).", ST['bullet']))
    story.append(Paragraph("• Renamed main source file to <code>ppa-speech-therapy_main.jsx</code>.", ST['bullet']))
    story.append(Paragraph("• Added Vite project scaffold (package.json, vite.config.js, index.html, src/main.jsx).", ST['bullet']))
    story.append(Paragraph("• Added iPad PWA (manifest.json + service worker).", ST['bullet']))
    story.append(Paragraph("• PDF documentation bundled into macOS and Windows installers.", ST['bullet']))
    story.append(Paragraph("• Max SR interval corrected to 5 days.", ST['bullet']))
    story.append(Spacer(1, 0.3*cm))

    story.append(thin_rule())
    story.append(Spacer(1, 0.1*cm))
    story.append(Paragraph(
        "PPA Speech Therapy Suite  •  Version 4  •  March 2026  •  Technical Reference",
        ST['footer']))

    doc.build(story, onFirstPage=on_first, onLaterPages=on_later)
    print(f"  Written: {path}")


# ─────────────────────────────────────────────────────────────────────────────
#  MAIN
# ─────────────────────────────────────────────────────────────────────────────

BASE = "/Users/stevehickman/Documents/GitHub/speech-therapy/.claude/worktrees/serene-greider"

USER_GUIDE_PATHS = [
    f"{BASE}/ppa-speech-therapy-user-guide.pdf",
    f"{BASE}/installer/ppa-speech-therapy-user-guide.pdf",
    f"{BASE}/win-installer/ppa-speech-therapy-user-guide.pdf",
]

TECH_REF_PATHS = [
    f"{BASE}/ppa-speech-therapy-docs.pdf",
    f"{BASE}/installer/ppa-speech-therapy-docs.pdf",
    f"{BASE}/win-installer/ppa-speech-therapy-docs.pdf",
]

if __name__ == "__main__":
    import tempfile, os

    print("Generating User Guide...")
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp_ug = tmp.name
    build_user_guide(tmp_ug)
    for dest in USER_GUIDE_PATHS:
        shutil.copy2(tmp_ug, dest)
        print(f"  Copied → {dest}")
    os.unlink(tmp_ug)

    print("\nGenerating Technical Reference...")
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp_tr = tmp.name
    build_tech_ref(tmp_tr)
    for dest in TECH_REF_PATHS:
        shutil.copy2(tmp_tr, dest)
        print(f"  Copied → {dest}")
    os.unlink(tmp_tr)

    print("\nDone. All 6 PDF files written successfully.")
