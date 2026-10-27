"""
er_draw.py - draw Chen-notation entity/relationship diagrams with reportlab and
build a deliberately plain black-and-white PDF around them.

Only dependency: reportlab (and `pdftoppm` from poppler for PNG previews).

Quick use
---------
    import sys; sys.path.insert(0, "<skill>/scripts")
    from er_draw import Diagram, plain_pdf

    d = Diagram()
    d.entity("cli", 40, 200, "CLIENTE")
    d.entity("tra", 240, 200, "TRÁMITE")
    d.relationship("sol", 140, 200, "SOLICITA")
    d.attribute("dni", 40, 265, "DNI", of="cli", key=True)
    d.link("cli", "sol", "1")
    d.link("sol", "tra", "N")
    d.check()                       # prints overlap / crossing / bounds problems
    d.preview("/tmp/prev.png")      # render and LOOK at it before delivering
    plain_pdf("out.pdf", [("title", "Ejercicios"), ("diagram", d)])

Coordinates: points, origin bottom-left, y grows upward. Usable width on A4 with
2 cm margins is ~482 pt; wider diagrams are scaled down automatically.
"""
import math
import shutil
import subprocess

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import (Flowable, ListFlowable, ListItem, PageBreak,
                                Paragraph, SimpleDocTemplate, Spacer)

FONT = "Helvetica"
FS = 7.5          # text size inside shapes
LW = 0.8          # line width
ENT_H = 30
REL_W, REL_H = 88, 46
ATT_H = 22


class Node:
    def __init__(self, kind, id, x, y, text, w, h, **opt):
        self.kind, self.id, self.x, self.y = kind, id, x, y
        self.text, self.w, self.h, self.opt = text, w, h, opt

    def bbox(self, pad=0):
        return (self.x - self.w / 2 - pad, self.y - self.h / 2 - pad,
                self.x + self.w / 2 + pad, self.y + self.h / 2 + pad)


class Diagram:
    def __init__(self, width=480, height=300):
        self.width, self.height = width, height
        self.nodes = {}
        self.links = []      # (a, b, card, total)
        self.free_labels = []

    # ------------------------------------------------------------ nodes
    def _add(self, n):
        if n.id in self.nodes:
            raise ValueError(f"duplicate id {n.id!r}")
        self.nodes[n.id] = n
        return n

    def entity(self, id, x, y, text, weak=False):
        w = max(76, stringWidth(text, FONT, FS) + (30 if weak else 24))
        return self._add(Node("entity", id, x, y, text, w, ENT_H, weak=weak))

    def relationship(self, id, x, y, text, identifying=False, w=None):
        w = w or max(REL_W, stringWidth(text, FONT, 7) + 44)
        return self._add(Node("rel", id, x, y, text, w, REL_H, identifying=identifying))

    def attribute(self, id, x, y, text, of=None, key=False, partial=False,
                  multi=False, derived=False):
        """`of` may be an entity, a relationship or another attribute (composite)."""
        w = max(44, stringWidth(text, FONT, FS) + 16)
        n = self._add(Node("attr", id, x, y, text, w, ATT_H, key=key,
                           partial=partial, multi=multi, derived=derived))
        if of:
            self.links.append((of, id, None, False))
        return n

    def isa(self, id, x, y, text="ISA"):
        return self._add(Node("isa", id, x, y, text, 40, 34))

    def link(self, a, b, card=None, total=False):
        """Line between two nodes. `card` ("1", "N", "M", "(0,N)"...) is written next to
        the END that touches the entity (or the first node if neither is an entity).
        total=True draws a double line (total participation)."""
        self.links.append((a, b, card, total))

    def label(self, x, y, text):
        self.free_labels.append((x, y, text))

    # -------------------------------------------------------- geometry
    def _boundary(self, n, tx, ty):
        """Point where the segment from n's centre towards (tx,ty) leaves n's shape."""
        dx, dy = tx - n.x, ty - n.y
        if dx == 0 and dy == 0:
            return n.x, n.y
        hw, hh = n.w / 2, n.h / 2
        if n.kind in ("rel", "isa"):       # diamond / triangle approximated by diamond
            t = 1 / (abs(dx) / hw + abs(dy) / hh)
        elif n.kind == "attr":             # ellipse
            t = 1 / math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2)
        else:                              # rectangle
            t = min(hw / abs(dx) if dx else 1e9, hh / abs(dy) if dy else 1e9)
        return n.x + dx * t, n.y + dy * t

    def _card_pos(self, a, b):
        """Where to put a cardinality label for the end at node `a` of link a-b."""
        bx, by = self._boundary(a, b.x, b.y)
        dx, dy = b.x - a.x, b.y - a.y
        d = math.hypot(dx, dy) or 1
        ux, uy = dx / d, dy / d
        px, py = -uy, ux                     # perpendicular
        if py < 0 or (py == 0 and px < 0):   # prefer above / right of the line
            px, py = -px, -py
        return bx + ux * 9 + px * 7, by + uy * 9 + py * 7

    # ------------------------------------------------------------ checks
    def _link_nodes(self):
        for a, b, card, total in self.links:
            yield self.nodes[a], self.nodes[b], card, total

    def check(self, max_width=482, verbose=True):
        """Return a list of problems (also printed). Empty list = layout is clean."""
        probs = []
        ns = list(self.nodes.values())
        for i, p in enumerate(ns):
            x0, y0, x1, y1 = p.bbox()
            if x0 < 0 or y0 < 0 or x1 > self.width or y1 > self.height:
                probs.append(f"out of canvas ({self.width}x{self.height}): {p.id} bbox="
                             f"({x0:.0f},{y0:.0f},{x1:.0f},{y1:.0f})")
            for q in ns[i + 1:]:
                a, b = p.bbox(2), q.bbox(2)
                if a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]:
                    probs.append(f"overlap: {p.id} / {q.id}")
        for a, b, card, total in self._link_nodes():
            for k in range(1, 40):           # sample the line, skip the ends
                t = k / 40
                x, y = a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t
                for n in ns:
                    if n is a or n is b:
                        continue
                    x0, y0, x1, y1 = n.bbox(-1)
                    if x0 < x < x1 and y0 < y < y1:
                        probs.append(f"line {a.id}-{b.id} passes through {n.id}")
                        break
                else:
                    continue
                break
        if self.width > max_width:
            probs.append(f"width {self.width} > {max_width}: it will be scaled down "
                         f"({max_width / self.width:.0%}); prefer a more compact layout")
        # unattached things
        linked = {x for a, b, _, _ in self.links for x in (a, b)}
        for n in ns:
            if n.id not in linked:
                probs.append(f"{n.id} has no link")
        for n in ns:
            if n.kind == "rel":
                deg = sum(1 for a, b, _, _ in self.links
                          if n.id in (a, b) and self.nodes[a if b == n.id else b].kind != "attr")
                if deg < 2:
                    probs.append(f"relationship {n.id} connects {deg} entities (needs >= 2)")
        if verbose:
            print("\n".join(probs) if probs else "layout OK")
        return probs

    def fit(self, margin=6):
        """Shift everything so the content touches `margin` and set width/height to match."""
        ns = list(self.nodes.values())
        x0 = min(n.bbox()[0] for n in ns)
        y0 = min(n.bbox()[1] for n in ns)
        dx, dy = margin - x0, margin - y0
        for n in ns:
            n.x += dx
            n.y += dy
        self.free_labels = [(x + dx, y + dy, t) for x, y, t in self.free_labels]
        self.width = max(n.bbox()[2] for n in ns) + margin
        self.height = max(n.bbox()[3] for n in ns) + margin
        return self

    # ----------------------------------------------------------- drawing
    def _text(self, c, x, y, s, size=FS, underline=None):
        c.setFillColor(colors.black)
        c.setFont(FONT, size)
        c.drawCentredString(x, y - size * 0.35, s)
        if underline:
            tw = stringWidth(s, FONT, size)
            yy = y - size * 0.35 - 1.5
            c.setLineWidth(0.6)
            if underline == "dash":
                c.setDash(2, 1.5)
            c.line(x - tw / 2, yy, x + tw / 2, yy)
            c.setDash()
            c.setLineWidth(LW)

    def _diamond(self, c, x, y, w, h, fill):
        p = c.beginPath()
        p.moveTo(x - w / 2, y); p.lineTo(x, y + h / 2)
        p.lineTo(x + w / 2, y); p.lineTo(x, y - h / 2); p.close()
        c.drawPath(p, fill=fill, stroke=1)

    def _draw_node(self, c, n):
        c.setFillColor(colors.white)
        if n.kind == "entity":
            c.rect(n.x - n.w / 2, n.y - n.h / 2, n.w, n.h, fill=1, stroke=1)
            if n.opt["weak"]:
                c.rect(n.x - n.w / 2 + 3, n.y - n.h / 2 + 3, n.w - 6, n.h - 6, fill=0, stroke=1)
            self._text(c, n.x, n.y, n.text)
        elif n.kind == "rel":
            self._diamond(c, n.x, n.y, n.w, n.h, 1)
            if n.opt["identifying"]:
                self._diamond(c, n.x, n.y, n.w - 12, n.h - 7, 0)
            self._text(c, n.x, n.y, n.text, size=7)
        elif n.kind == "attr":
            o = n.opt
            if o["derived"]:
                c.setDash(2, 1.5)
            c.ellipse(n.x - n.w / 2, n.y - n.h / 2, n.x + n.w / 2, n.y + n.h / 2, fill=1, stroke=1)
            c.setDash()
            if o["multi"]:
                c.ellipse(n.x - n.w / 2 + 3, n.y - n.h / 2 + 3, n.x + n.w / 2 - 3,
                          n.y + n.h / 2 - 3, fill=0, stroke=1)
            self._text(c, n.x, n.y, n.text,
                       underline="solid" if o["key"] else ("dash" if o["partial"] else None))
        elif n.kind == "isa":
            p = c.beginPath()
            p.moveTo(n.x - n.w / 2, n.y + n.h / 2); p.lineTo(n.x + n.w / 2, n.y + n.h / 2)
            p.lineTo(n.x, n.y - n.h / 2); p.close()
            c.drawPath(p, fill=1, stroke=1)
            self._text(c, n.x, n.y + 5, n.text, size=6.5)

    def draw(self, c):
        c.setStrokeColor(colors.black)
        c.setFillColor(colors.white)
        c.setLineWidth(LW)
        for a, b, card, total in self._link_nodes():     # lines first, shapes cover the ends
            if total:
                dx, dy = b.x - a.x, b.y - a.y
                d = math.hypot(dx, dy) or 1
                ox, oy = -dy / d * 1.6, dx / d * 1.6
                c.line(a.x + ox, a.y + oy, b.x + ox, b.y + oy)
                c.line(a.x - ox, a.y - oy, b.x - ox, b.y - oy)
            else:
                c.line(a.x, a.y, b.x, b.y)
        for n in self.nodes.values():
            self._draw_node(c, n)
        for a, b, card, total in self._link_nodes():
            if card is None:
                continue
            end, other = (b, a) if (b.kind == "entity" and a.kind != "entity") else (a, b)
            x, y = self._card_pos(end, other)
            self._text(c, x, y, card, size=8)
        for x, y, t in self.free_labels:
            self._text(c, x, y, t, size=8)

    def flowable(self, max_width=482):
        return _DiagramFlowable(self, max_width)

    def preview(self, png_path, dpi=110):
        """Render this diagram alone to a PNG so it can be inspected with `view`."""
        pdf = png_path.rsplit(".", 1)[0] + ".pdf"
        c = rl_canvas.Canvas(pdf, pagesize=(self.width, self.height))
        self.draw(c)
        c.save()
        base = png_path.rsplit(".", 1)[0]
        # pdftoppm (poppler) is the reference rasterizer, but it is not
        # installed everywhere. Fall back to whatever the host provides so the
        # mandatory "look at it" step never fails for a missing binary.
        if shutil.which("pdftoppm") is not None:
            subprocess.run(["pdftoppm", "-r", str(dpi), "-png", "-singlefile", pdf, base], check=True)
        elif shutil.which("sips") is not None:            # macOS
            subprocess.run(["sips", "-s", "format", "png", pdf, "--out", png_path],
                           check=True, stdout=subprocess.DEVNULL)
        elif shutil.which("magick") is not None:          # ImageMagick 7
            subprocess.run(["magick", "-density", str(dpi), pdf, png_path], check=True)
        else:
            raise RuntimeError(
                "no PDF rasterizer found: install poppler (pdftoppm), or ImageMagick, "
                "and re-run preview()"
            )
        return png_path


class _DiagramFlowable(Flowable):
    def __init__(self, d, max_width):
        super().__init__()
        self.d = d
        self.scale = min(1.0, max_width / d.width)
        self.width, self.height = d.width * self.scale, d.height * self.scale

    def wrap(self, aw, ah):
        return self.width, self.height

    def draw(self):
        self.canv.saveState()
        self.canv.scale(self.scale, self.scale)
        self.d.draw(self.canv)
        self.canv.restoreState()


# ======================================================================
#  Plain PDF: Times, black, no colour, no header, no footer, no page numbers
# ======================================================================
_base = ParagraphStyle("base", fontName="Times-Roman", fontSize=11, leading=15,
                       textColor=colors.black)
STYLES = {
    "title": ParagraphStyle("title", parent=_base, fontName="Times-Bold", fontSize=14,
                            leading=18, spaceAfter=8),
    "h2": ParagraphStyle("h2", parent=_base, fontName="Times-Bold", spaceBefore=10, spaceAfter=4),
    "p": ParagraphStyle("p", parent=_base, spaceBefore=6),
}


def bullets(items):
    return ListFlowable([ListItem(Paragraph(t, STYLES["p"].clone("li", spaceBefore=0)),
                                  leftIndent=14) for t in items],
                        bulletType="bullet", start="-", leftIndent=14,
                        bulletFontName="Times-Roman")


def plain_pdf(path, blocks, title="", margins_cm=2):
    """blocks: list of tuples
         ("title", str) ("h2", str) ("p", str) ("bullets", [str, ...])
         ("diagram", Diagram) ("spacer", pts) ("pagebreak",)
       Text accepts reportlab mini-markup (<b>, <i>, <sub>, <super>); escape & as &amp;.
       No onPage callbacks are registered, so there is no header/footer/page number."""
    S = []
    for b in blocks:
        k = b[0]
        if k in ("title", "h2", "p"):
            S.append(Paragraph(b[1], STYLES[k]))
        elif k == "bullets":
            S.append(bullets(b[1]))
        elif k == "diagram":
            S.append(Spacer(1, 6))
            S.append(b[1].flowable())
        elif k == "spacer":
            S.append(Spacer(1, b[1]))
        elif k == "pagebreak":
            S.append(PageBreak())
        else:
            raise ValueError(f"unknown block {k!r}")
    m = margins_cm * cm
    SimpleDocTemplate(path, pagesize=A4, leftMargin=m, rightMargin=m, topMargin=m,
                      bottomMargin=m, title=title, author="").build(S)
    return path
