---
name: er-exercise-pdf
description: Solve database-design homework (Entity-Relationship / entidad-relación, entidades débiles, ER extendido with specialisation, cardinalities, "tabla de especificación de datos") and deliver a plain black-and-white PDF with real vector Chen diagrams that follow the U-tad course notation. Use whenever the user uploads or pastes a statement about designing a database, drawing a DER/E-R/Chen model, weak entities, generalisation/especialización, or says "resuelve esto y dame el pdf" for a database activity, even without the word "diagram". Also for deliberately minimal PDFs (no colours, footers or cover).
---

# ER exercise -> plain PDF

Course context: U-tad (ASIR/DAM/DAW) "Bases de datos", Chen notation. Read `references/course.md` before modelling: it holds the course's exact conventions (labels, weak entities, specialisation, attribute styles, spec tables). Examples in `examples/` show finished diagrams; read the closest one before drawing.

## Workflow
1. Read the input (`extract-text file.docx`; empty tables = answer boxes, header image = logo). Follow the statement's "Se pide" literally: it may ask for entities+attributes+keys only, a diagram, and/or a data-spec table per entity. Without a "Se pide", deliver diagram + entities + relations.
2. Model in three passes (entities, relations, cardinalities), repeat until stable. Rules in `references/course.md`.
3. Draw with `Diagram`; run `d.check()` until `layout OK`; `d.preview("/tmp/x.png")` and `view` it (the checker misses cramped labels).
4. Build with `plain_pdf`, render the pages once to PNG, look, save in `/mnt/user-data/outputs/`, `present_files`.
5. Reply in the user's language: file name + assumptions only.

## API (`scripts/er_draw.py`)
```python
import sys; sys.path.insert(0, "<skill>/scripts")
from er_draw import Diagram, plain_pdf
d = Diagram(480, 315)                                  # pt, y up, max 482 wide
d.entity("cli", 40, 235, "CLIENTE", weak=False)        # id, x, y, text
d.relationship("sol", 140, 235, "SOLICITA", identifying=False, ratio="above")
d.attribute("a1", 40, 300, "dni", of="cli", key=True)  # partial= multi= derived= optional=
d.isa("isa", 44, 165, exclusive=False, total=False)    # triangle, supertype above
d.link("cli", "sol", "(1,1)"); d.link("sol", "tra", "(0,n)")
d.check(); d.preview("/tmp/x.png")
plain_pdf(out, [("title", t), ("h2", h), ("diagram", d), ("bullets", [..]), ("p", t),
                ("spec", "ALUMNOS", rows8), ("pagebreak",)], title=t)
```
- Label next to entity X = (min,max) of X per ONE instance of the other entity. The ratio (1:N, N:M, 1:1) is computed automatically from the labels; `ratio="right"` for vertical diamonds, `(dx,dy)` for a free spot, `None` to hide.
- Reflexive relation: diamond above/below the entity + two links `offset=20` and `offset=-20`, one label each.
- Attributes of a relationship/composite attribute: `of=` that node. Optional attribute = dashed line (`optional=True`); derived = dashed ellipse.
- `check()` also enforces course rules: lowercase attribute names, key on every strong entity and on specialisation supertypes, no key on subtypes.
- Diagram-only helpers: `d.label(x,y,text)`, `d.fit()`. Rows for "spec": 8 strings (see course.md).

## Layout (A4, 2 cm margins)
- Row of up to 3 entities + 2 diamonds at x = 40,140,240,340,440 (gaps ~22 pt fit "(0,n)"); more: branch vertically under the middle entity. Never widen the canvas past 480.
- Attributes ~65 pt from their entity, 2-3 above, rest below; edge entities push attributes inward. Choose positions by hand and iterate with `check()` (no brute-force searches).
- Give relationships with vertical links `ratio="right"`; with attribute lines top and bottom use `(36,22)`.
- Subtype hierarchy: supertype above, triangle ~60 pt below it, subtypes below.

## PDF style (default)
`plain_pdf`: A4, Times, black on white, no header/footer/page numbers/colours/cover/intro/conclusion. Per exercise: heading, diagram, "Entidades" bullets (attributes, key bold-free), "Relaciones" bullets (name: ENT (min,max) - ENT (min,max). ratio.), one line of assumptions (invented identifiers, assumed minimums). The user's explicit request overrides these defaults. Same language as the statement; file named after the activity.

Files: `references/course.md` (conventions), `references/relational.md` (only if tables/modelo relacional are asked), `examples/*.py` (oficina_tramites: weak entity; guerras: M:N with attributes; elecciones: specialisation, reflexive, optional participation).
