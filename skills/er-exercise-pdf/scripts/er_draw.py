"""er_draw.py - Chen ER diagrams (reportlab, vector, black/white) + plain PDF builder. See SKILL.md."""
import math, re, subprocess
from collections import namedtuple
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import (Flowable, ListFlowable, ListItem, PageBreak, Paragraph,
                                SimpleDocTemplate, Spacer, Table, TableStyle)

BLACK, WHITE = colors.black, colors.white
F, FS, LW = "Helvetica", 7.5, 0.8
L = namedtuple("L", "a b card total off dash")
sw = lambda s, size=FS: stringWidth(s, F, size)


class Node:
    def __init__(s, kind, id, x, y, text, w, h, **o):
        s.kind, s.id, s.x, s.y, s.text, s.w, s.h, s.opt = kind, id, x, y, text, w, h, o

    def bbox(s, pad=0):
        return (s.x - s.w / 2 - pad, s.y - s.h / 2 - pad, s.x + s.w / 2 + pad, s.y + s.h / 2 + pad)


class Diagram:
    def __init__(s, width=480, height=300):
        """Points, origin bottom-left, y up. Usable A4 width is 482; wider is scaled down."""
        s.width, s.height, s.nodes, s.links, s.labels = width, height, {}, [], []

    def _add(s, n):
        if n.id in s.nodes:
            raise ValueError(f"duplicate id {n.id!r}")
        s.nodes[n.id] = n
        return n

    def entity(s, id, x, y, text, weak=False):
        return s._add(Node("entity", id, x, y, text, max(70, sw(text) + (22 if weak else 16)), 30, weak=weak))

    def relationship(s, id, x, y, text, identifying=False, w=None, ratio="above"):
        """ratio (1:N / N:M text, auto-computed from the links' labels): "above"|"below"|"right"|(dx,dy)|None.
        "right" for diamonds with vertical links; (dx,dy) = free offset, e.g. a diamond corner when
        attribute lines leave the top and bottom."""
        return s._add(Node("rel", id, x, y, text, w or max(84, sw(text, 7) + 40), 46,
                           identifying=identifying, ratio=ratio))

    def attribute(s, id, x, y, text, of=None, key=False, partial=False, multi=False,
                  derived=False, optional=False):
        """key: underline; partial: dashed underline (discriminator); multi: double ellipse;
        derived: dashed ellipse; optional: dashed connecting line. `of` = entity, relationship
        or another attribute (composite)."""
        n = s._add(Node("attr", id, x, y, text, max(44, sw(text) + 16), 22,
                        key=key, partial=partial, multi=multi, derived=derived))
        if of:
            s.links.append(L(of, id, None, False, 0, optional))
        return n

    def isa(s, id, x, y, exclusive=False, total=False, point="down"):
        """Specialisation triangle, base towards the supertype. point="down": supertype above,
        subtypes below. exclusive: arc across the subtype lines; total: circle on the supertype line."""
        return s._add(Node("isa", id, x, y, "", 40, 30, exclusive=exclusive, total=total, point=point))

    def link(s, a, b, card=None, total=False, offset=0, dash=False):
        """card is written by the entity end: "(1,n)", "1", "N"... total: double line.
        offset: sideways shift in pt; two links entity->diamond with +-20 draw a reflexive relationship."""
        s.links.append(L(a, b, card, total, offset, dash))

    def label(s, x, y, text):
        s.labels.append((x, y, text))

    def fit(s, margin=6):
        ns = list(s.nodes.values())
        dx, dy = margin - min(n.bbox()[0] for n in ns), margin - min(n.bbox()[1] for n in ns)
        for n in ns:
            n.x += dx; n.y += dy
        s.labels = [(x + dx, y + dy, t) for x, y, t in s.labels]
        s.width, s.height = max(n.bbox()[2] for n in ns) + margin, max(n.bbox()[3] for n in ns) + margin
        return s

    # ---------------------------------------------------------- geometry
    def _boundary(s, n, tx, ty):
        dx, dy = tx - n.x, ty - n.y
        if not dx and not dy:
            return n.x, n.y
        hw, hh = n.w / 2, n.h / 2
        if n.kind in ("rel", "isa"):
            t = 1 / (abs(dx) / hw + abs(dy) / hh)
        elif n.kind == "attr":
            t = 1 / math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2)
        else:
            t = min(hw / abs(dx) if dx else 1e9, hh / abs(dy) if dy else 1e9)
        return n.x + dx * t, n.y + dy * t

    @staticmethod
    def _perp(a, b):
        dx, dy = b.x - a.x, b.y - a.y
        d = math.hypot(dx, dy) or 1
        return -dy / d, dx / d

    def _card_pos(s, end, other, ox, oy, text):
        """Label next to the entity end; centred in short gaps, hugging the entity on long lines."""
        bx, by = s._boundary(end, other.x, other.y)
        qx, qy = s._boundary(other, end.x, end.y)
        d = math.hypot(other.x - end.x, other.y - end.y) or 1
        ux, uy = (other.x - end.x) / d, (other.y - end.y) / d
        tw = sw(text, 7)
        t = min(math.hypot(qx - bx, qy - by) / 2, tw / 2 + 4)
        px, py = -uy, ux
        if (ox or oy) and px * ox + py * oy < 0 or not (ox or oy) and (py < 0 or (py == 0 and px < 0)):
            px, py = -px, -py
        off = abs(px) * (tw / 2 + 2) + abs(py) * 6
        return bx + ox + ux * t + px * off, by + oy + uy * t + py * off

    def _ratio(s, r):
        items = []
        for l in s.links:
            if r.id in (l.a, l.b):
                e = s.nodes[l.b if l.a == r.id else l.a]
                if e.kind == "entity":
                    m = re.match(r"\(\s*\w+\s*,\s*(\w+)\s*\)$", (l.card or "").strip())
                    mx = m.group(1) if m else (l.card or "").strip()
                    if not mx:
                        return None
                    items.append((e.x, -e.y, l.off, mx))
        if len(items) < 2:
            return None
        names = iter("NMP")
        r = ":".join("1" if mx == "1" else next(names) for *_, mx in sorted(items))
        return "1:N" if r == "N:1" else r

    def _ratio_pos(s, r, text):
        p = r.opt["ratio"]
        if isinstance(p, tuple):
            return r.x + p[0], r.y + p[1]
        if p == "right":
            return r.x + r.w / 2 + sw(text, 7) / 2 + 3, r.y
        return r.x, r.y + (r.h / 2 + 6 if p == "above" else -r.h / 2 - 6)

    @staticmethod
    def _inside(n, x, y):
        hw, hh, dx, dy = n.w / 2 - 1, n.h / 2 - 1, abs(x - n.x), abs(y - n.y)
        if n.kind == "attr":
            return (dx / hw) ** 2 + (dy / hh) ** 2 < 1
        if n.kind in ("rel", "isa"):
            return dx / hw + dy / hh < 1
        return dx < hw and dy < hh

    # ------------------------------------------------------------ check
    def _nb(s, n):
        return [s.nodes[l.b if l.a == n.id else l.a] for l in s.links if n.id in (l.a, l.b)]

    def check(s, max_width=482, verbose=True):
        """List of layout/modelling problems (printed). Empty list = clean."""
        P, ns = [], list(s.nodes.values())
        boxes = [(n.id, n.bbox(2)) for n in ns]
        for n in ns:
            if n.kind == "rel" and n.opt["ratio"] and s._ratio(n):
                t = s._ratio(n); x, y = s._ratio_pos(n, t); w = sw(t, 7) / 2
                boxes.append((f"ratio({n.id})", (x - w, y - 4, x + w, y + 4)))
        for i, (a, ba) in enumerate(boxes):
            if ba[0] < 2 or ba[1] < 2 or ba[2] > s.width - 2 or ba[3] > s.height - 2:
                P.append(f"out of canvas: {a}")
            for b, bb in boxes[i + 1:]:
                if ba[0] < bb[2] and bb[0] < ba[2] and ba[1] < bb[3] and bb[1] < ba[3] and not a.startswith("ratio(" + b) and not b.startswith("ratio(" + a):
                    P.append(f"overlap: {a} / {b}")
        for l in s.links:
            a, b = s.nodes[l.a], s.nodes[l.b]
            for k in range(1, 40):
                x, y = a.x + (b.x - a.x) * k / 40, a.y + (b.y - a.y) * k / 40
                hit = next((n for n in ns if n is not a and n is not b and s._inside(n, x, y)), None)
                if hit:
                    P.append(f"line {a.id}-{b.id} passes through {hit.id}"); break
        if s.width > max_width:
            P.append(f"width {s.width} > {max_width}: will be scaled down")
        isa_ids, kids, parents = set(), set(), set()
        for n in ns:
            if n.kind == "isa":
                for e in s._nb(n):
                    isa_ids.add(e.id)
                    (parents if (e.y > n.y) == (n.opt["point"] == "down") else kids).add(e.id)
        for n in ns:
            nb = s._nb(n)
            if not nb:
                P.append(f"{n.id} has no link")
            if n.kind == "rel" and len([e for e in nb if e.kind == "entity"]) < 2:
                P.append(f"relationship {n.id} needs >= 2 entity links")
            if n.kind == "attr" and n.text != n.text.lower():
                P.append(f"attribute {n.text!r} must be lowercase")
            if n.kind == "entity":
                key = any(e.kind == "attr" and e.opt["key"] for e in nb)
                if n.id in kids and key:
                    P.append(f"subtype {n.id} must not have its own key")
                elif (n.id in parents or (n.id not in kids and not n.opt["weak"])) and not key:
                    P.append(f"entity {n.id} has no key attribute")
        if verbose:
            print("\n".join(P) if P else "layout OK")
        return P

    # ----------------------------------------------------------- drawing
    def _t(s, c, x, y, text, size=FS, ul=None):
        c.setFillColor(BLACK); c.setFont(F, size)
        c.drawCentredString(x, y - size * 0.35, text)
        if ul:
            tw, yy = sw(text, size), y - size * 0.35 - 1.5
            c.setLineWidth(0.6)
            if ul == "dash":
                c.setDash(2, 1.5)
            c.line(x - tw / 2, yy, x + tw / 2, yy)
            c.setDash(); c.setLineWidth(LW)

    def _poly(s, c, pts, fill=1):
        p = c.beginPath(); p.moveTo(*pts[0])
        for q in pts[1:]:
            p.lineTo(*q)
        p.close(); c.drawPath(p, fill=fill, stroke=1)

    def _node(s, c, n):
        c.setFillColor(WHITE); x, y, w, h, o = n.x, n.y, n.w, n.h, n.opt
        if n.kind == "entity":
            c.rect(x - w / 2, y - h / 2, w, h, fill=1, stroke=1)
            if o["weak"]:
                c.rect(x - w / 2 + 3, y - h / 2 + 3, w - 6, h - 6, fill=0, stroke=1)
            s._t(c, x, y, n.text)
        elif n.kind == "rel":
            dia = lambda W, H: [(x - W / 2, y), (x, y + H / 2), (x + W / 2, y), (x, y - H / 2)]
            s._poly(c, dia(w, h))
            if o["identifying"]:
                s._poly(c, dia(w - 12, h - 7), fill=0)
            s._t(c, x, y, n.text, size=7)
        elif n.kind == "attr":
            if o["derived"]:
                c.setDash(2, 1.5)
            c.ellipse(x - w / 2, y - h / 2, x + w / 2, y + h / 2, fill=1, stroke=1)
            c.setDash()
            if o["multi"]:
                c.ellipse(x - w / 2 + 3, y - h / 2 + 3, x + w / 2 - 3, y + h / 2 - 3, fill=0, stroke=1)
            s._t(c, x, y, n.text, ul="solid" if o["key"] else ("dash" if o["partial"] else None))
        else:  # isa: base towards the supertype, apex towards the subtypes
            d = -1 if o["point"] == "down" else 1
            base, apex = y - d * h / 2, y + d * h / 2
            s._poly(c, [(x - w / 2, base), (x + w / 2, base), (x, apex)])
            if o["total"]:
                c.circle(x, base - d * 4, 4, fill=1, stroke=1)
            if o["exclusive"]:
                p = c.beginPath(); p.moveTo(x - 34, apex - d * 6)
                p.curveTo(x - 18, apex + d * 16, x + 18, apex + d * 16, x + 34, apex - d * 6)
                c.drawPath(p, fill=0, stroke=1)

    def draw(s, c):
        c.setStrokeColor(BLACK); c.setFillColor(WHITE); c.setLineWidth(LW)
        for l in s.links:
            a, b = s.nodes[l.a], s.nodes[l.b]
            px, py = s._perp(a, b); sx, sy = px * l.off, py * l.off
            if l.dash:
                c.setDash(3, 2)
            for k in ([1.6, -1.6] if l.total else [0]):
                c.line(a.x + sx + px * k, a.y + sy + py * k, b.x + sx + px * k, b.y + sy + py * k)
            c.setDash()
        for n in s.nodes.values():
            s._node(c, n)
            if n.kind == "rel" and n.opt["ratio"] and s._ratio(n):
                t = s._ratio(n); s._t(c, *s._ratio_pos(n, t), t, size=7)
        for l in s.links:
            if l.card:
                a, b = s.nodes[l.a], s.nodes[l.b]
                end, other = (b, a) if b.kind == "entity" and a.kind != "entity" else (a, b)
                px, py = s._perp(a, b)
                s._t(c, *s._card_pos(end, other, px * l.off, py * l.off, l.card), l.card, size=7)
        for x, y, t in s.labels:
            s._t(c, x, y, t, size=8)

    def flowable(s, max_width=482):
        return _Flow(s, max_width)

    def preview(s, png, dpi=110):
        """Render alone to PNG (then `view` it)."""
        base = png.rsplit(".", 1)[0]
        c = rl_canvas.Canvas(base + ".pdf", pagesize=(s.width, s.height)); s.draw(c); c.save()
        subprocess.run(["pdftoppm", "-r", str(dpi), "-png", "-singlefile", base + ".pdf", base], check=True)
        return png


class _Flow(Flowable):
    def __init__(s, d, mw):
        super().__init__()
        s.d, s.k = d, min(1.0, mw / d.width)
        s.width, s.height = d.width * s.k, d.height * s.k

    def wrap(s, aw, ah):
        return s.width, s.height

    def draw(s):
        s.canv.saveState(); s.canv.scale(s.k, s.k); s.d.draw(s.canv); s.canv.restoreState()


# ===== plain PDF: Times, black on white, no header/footer/page numbers/colours =====
_b = ParagraphStyle("b", fontName="Times-Roman", fontSize=11, leading=15, textColor=BLACK)
STY = {"title": ParagraphStyle("t", parent=_b, fontName="Times-Bold", fontSize=14, leading=18, spaceAfter=8),
       "h2": ParagraphStyle("h", parent=_b, fontName="Times-Bold", spaceBefore=10, spaceAfter=4),
       "p": ParagraphStyle("p", parent=_b, spaceBefore=6)}
SPEC_HEAD = ["Nombre", "Descripción", "Tipo de dato", "Subtipo", "Restricciones", "Obligatoriedad",
             "Ejemplo", "Observaciones"]
SPEC_W = [50, 74, 48, 40, 70, 60, 56, 84]


def _table(head, rows, widths, fs=7.5):
    st = ParagraphStyle("c", fontName="Times-Roman", fontSize=fs, leading=fs + 1.5)
    hs = ParagraphStyle("ch", parent=st, fontName="Times-Bold")
    t = Table([[Paragraph(h, hs) for h in head]] + [[Paragraph(str(x), st) for x in r] for r in rows],
              colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, BLACK), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3)]))
    return t


def plain_pdf(path, blocks, title="", margin_cm=2):
    """blocks: ("title"|"h2"|"p", text) ("bullets", [..]) ("diagram", Diagram) ("spec", ENTITY, rows8)
    ("table", head, rows, widths) ("spacer", pt) ("pagebreak",). Text takes <b> <i> <u>; escape & as &amp;."""
    S = []
    for b in blocks:
        k = b[0]
        if k in STY:
            S.append(Paragraph(b[1], STY[k]))
        elif k == "bullets":
            S.append(ListFlowable([ListItem(Paragraph(t, STY["p"].clone("li", spaceBefore=0)), leftIndent=14)
                                   for t in b[1]], bulletType="bullet", start="-", leftIndent=14,
                                  bulletFontName="Times-Roman"))
        elif k == "diagram":
            S += [Spacer(1, 6), b[1].flowable()]
        elif k == "spec":
            S += [Paragraph(b[1], STY["h2"]), _table(SPEC_HEAD, b[2], SPEC_W)]
        elif k == "table":
            S.append(_table(*b[1:]))
        elif k == "spacer":
            S.append(Spacer(1, b[1]))
        elif k == "pagebreak":
            S.append(PageBreak())
        else:
            raise ValueError(k)
    m = margin_cm * cm
    SimpleDocTemplate(path, pagesize=A4, leftMargin=m, rightMargin=m, topMargin=m, bottomMargin=m,
                      title=title, author="").build(S)
    return path
