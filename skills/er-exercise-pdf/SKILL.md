---
name: er-exercise-pdf
description: Solve database-design homework (Entity-Relationship / entidad-relación exercises, weak entities, cardinalities, ER-to-relational translation) and deliver it as a plain PDF with real, hand-checked ER diagrams. Use this whenever the user uploads or pastes a statement about designing a database, drawing an E/R or Chen model, "entidades débiles", "modelo entidad/relación", "diagrama ER", "paso a tablas / modelo relacional", or asks to "resuelve esto y dame el pdf" for a database activity, even if they never say "diagram". Also use it when the user wants a deliberately minimal, serious, black-and-white PDF for coursework (no colours, no footers, no cover page).
---

# ER exercise -> plain PDF

Students in vocational and university database courses (e.g. 1º ASIR, "Bases de datos")
get statements like "se va a diseñar una base de datos para… los trámites tienen…, las
copias se identifican por un número secuencial…" and must hand in an entity-relationship
model. This skill covers the whole job: read the statement, model it correctly, draw it,
and deliver a PDF that looks like the laziest acceptable submission: sober, black and
white, nothing decorative.

The drawing code is in `scripts/er_draw.py`. Two finished examples are in `examples/`
(read one before your first diagram; they show the coordinate conventions that work).

## Workflow

1. **Read the input.** For an uploaded `.docx`, read it with `python-docx`
   (`from docx import Document`; join `paragraph.text` and table cell text). Empty
   tables in the file are just answer boxes, and an image in the header is a school
   logo, not content. Exercise bullets are the exercises; split them.
2. **Model each exercise** (see "Modelling rules" below, and `references/notation.md`
   if you need the notation details or a rarer construct). Decide entities, keys,
   weak entities, relationships, cardinalities, relationship attributes.
3. **Write the diagram** with `Diagram` (below). Place nodes on the grid, link them,
   then run `d.check()` until it prints `layout OK`.
4. **Look at it.** `d.preview("/tmp/x.png")` then read that PNG with the image-reading
   tool. The checker finds
   overlaps and lines crossing shapes, but only your eyes catch a cramped label or a
   confusing layout. Fix and repeat.
5. **Write the short text** under each diagram: entities with attributes, relations with
   cardinalities, assumptions. Nothing else.
6. **Build the PDF** with `plain_pdf(...)`, render pages to PNG once and look at them,
   save it in the workspace (for example `./<Activity>_resuelto.pdf`), then offer it
   with the `present` tool.
7. **Reply briefly** in the user's language: what is in the PDF and the assumptions you
   made (invented identifiers, simplifications). Don't re-explain the whole model.

If the statement also asks for the relational model ("pasar a tablas", "modelo
relacional"), read `references/relational.md` and add a section per exercise, written
as plain `TABLA(clave, atributo, #clave_ajena)` lines. Only do this if asked.

## The `Diagram` API

```python
import sys; sys.path.insert(0, "/path/to/er-exercise-pdf/scripts")
from er_draw import Diagram, plain_pdf

d = Diagram(480, 315)                       # width, height in points; y grows upward
d.entity("cli", 40, 235, "CLIENTE")         # id, x, y, text   (weak=True -> double box)
d.relationship("sol", 140, 235, "SOLICITA") # identifying=True -> double diamond
d.attribute("a1", 40, 300, "DNI", of="cli", key=True)   # partial=True: dashed underline
d.link("cli", "sol", "1")                   # cardinality label auto-placed at the entity end
d.link("sol", "tra", "N")
d.check(); d.preview("/tmp/x.png")
plain_pdf("Entidades_debiles_resuelto.pdf",
          [("title", "Ejercicios: Entidad relación"), ("h2", "Ejercicio 1"),
           ("diagram", d), ("h2", "Entidades"), ("bullets", ["…"]),
           ("pagebreak",)])
```

Other options: `multi=True` (multivalued, double ellipse), `derived=True` (dashed ellipse),
`link(..., total=True)` (double line = total participation), `isa(...)` for
generalisation (triangle, link parent and children through it), `d.label(x,y,text)` for
free text, `d.fit()` to crop the canvas to its content. `of=` also accepts another
attribute (composite attributes) or a relationship (attributes on the relationship).
Cardinality text is free: `"1"`, `"N"`, `"M"`, or `"(0,N)"`, `"(1,1)"` if the course uses
min-max notation. Use whichever notation the statement or the course material uses; if
nothing indicates a preference use `1`/`N`/`M`.

Text accepts accents and ñ (Helvetica/Times built-ins cover Latin-1). Never use Unicode
sub/superscript characters in reportlab text; they render as black boxes.

## Layout that works (A4, 2 cm margins -> 482 pt usable width)

A diagram wider than 482 pt is scaled down and gets small. Stay within 480 wide.

- Entity box >= 76x30, diamond 88x46, attribute ellipse 22 high.
- A row can hold **3 entities and 2 relationships** (centres at x = 40, 140, 240, 340, 440).
  That leaves a ~20 pt gap, enough for a cardinality label. More than that: branch
  vertically (a second row under the middle entity, as in the examples).
- Attributes: up to 2 above and 2 below each entity, ~65 pt away vertically, spread
  +-35 pt horizontally. Entities at the left or right edge: push their attributes inward
  so ellipses stay inside the canvas.
- Put a relationship's own attributes above/below its diamond, away from the neighbours'
  attributes. Give crowded spots more room instead of squeezing: raise the canvas height.
- Identifying relationship + weak entity go at the end of a chain, away from clutter,
  usually down or to the right of their owner.
- Lines are drawn centre to centre and the shapes cover their ends, so just give
  centres; never route a line through a third shape (the checker flags it).
- Left-to-right, top-to-bottom reading order: the "main" entity of the statement in the
  middle or top-left.

## Modelling rules (the part graders actually mark)

- Nouns the system must remember -> entities. Properties -> attributes. Verbs linking two
  entities -> relationships. Do not make an entity out of something that is just a
  value (a "tipo" is an attribute unless the statement gives it its own data).
- "identificado por / con un código / DNI" -> that attribute is the underlined key.
- **Weak entity**: it has no key of its own and is identified through an owner plus a
  partial key. Triggers in the statement: "se identifican por un número secuencial
  (copia 1, 2…)", "líneas de un pedido", "hijos de un empleado", "periodos de…",
  "habitaciones de un hotel". Draw it with a double box, a dashed-underlined
  discriminator and an identifying (double) relationship, 1 on the owner side and N
  on the weak side. Mention in one line which attributes together identify it.
- Cardinalities from the wording: "un único / solo es válido para uno" -> 1 on that
  side; "varias / siempre se solicitan varias" -> N. Read both directions of every
  relationship and put a label at both ends.
- Details that belong to the *association* rather than to either entity (date a
  country joined a war, side, grade of a student in a course) -> attributes of the
  relationship, which is normally M:N.
- Time-bounded facts that can repeat (several independence periods, several jobs) ->
  weak entity or a relationship attribute with start/end, not a single attribute pair.
- If the statement gives no identifier for an entity, invent a sensible one
  (`id_trámite`) and say so in the text. If something is ambiguous, pick the
  simplest reading and state the assumption in one sentence.
- Keep the model minimal: what the statement asks for, nothing speculative. No extra
  entities "for completeness".

Final check before building the PDF: every strong entity has an underlined key; every
weak entity has an identifying relationship and a dashed discriminator; every
relationship has labels at all ends and >= 2 entities; every sentence of the statement
is represented or consciously ignored; assumptions are written down.

## PDF style (default for this skill)

The user's brief was: "the most serious, boring and simple way possible, the laziest".
`plain_pdf` already does it: A4, Times, black on white, no header, no footer, no page
numbers, no colours, no bold-coloured words, no cover page, no intro, no conclusion, no
table of contents. One exercise per page when the diagrams need the room. Title line,
exercise heading, diagram, "Entidades" bullets, "Relaciones" bullets, one line of
assumptions. If the user asks for something else (a cover page, colours, a header with
name and group) do that instead, since their request wins over these defaults.

Short sentences, the course's own vocabulary (entidad débil, discriminador,
relación identificadora, cardinalidad), same language as the statement.

Name the file after the activity, e.g. `Entidades_debiles_resuelto.pdf`, unless the
user names it.

## Files

- `scripts/er_draw.py` - Diagram class, `check()`, `preview()`, `plain_pdf()`.
- `examples/oficina_tramites.py`, `examples/guerras.py` - the two original exercises as
  complete specs plus text; `examples/build_both.py` builds the full PDF.
- `references/notation.md` - Chen notation legend, weak entities, participation,
  generalisation, common wording -> construct table.
- `references/relational.md` - ER -> relational rules, including weak entities and M:N.
