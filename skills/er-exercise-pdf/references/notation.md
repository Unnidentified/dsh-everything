# Chen notation cheat sheet

| Construct | Drawing in `er_draw` | Call |
|---|---|---|
| Strong entity | rectangle | `entity(id,x,y,"CLIENTE")` |
| Weak entity | double rectangle | `entity(..., weak=True)` |
| Relationship | diamond | `relationship(id,x,y,"SOLICITA")` |
| Identifying relationship | double diamond | `relationship(..., identifying=True)` |
| Attribute | ellipse | `attribute(id,x,y,"nombre", of=...)` |
| Key attribute | underlined text | `key=True` |
| Partial key / discriminator (weak entity) | dashed underline | `partial=True` |
| Multivalued attribute | double ellipse | `multi=True` |
| Derived attribute | dashed ellipse | `derived=True` |
| Composite attribute | attribute linked to attribute | `of="<attr id>"` |
| Total participation | double line | `link(a,b,card,total=True)` |
| Generalisation (ISA) | triangle between parent and children | `isa(id,x,y)` |
| Cardinality | label at the entity end of the line | `link(a,b,"1")` |

## Cardinality reading

`CLIENTE 1 --- SOLICITA --- N TRÁMITE` means one client requests many procedures, and each
procedure is requested by exactly one client. The label sits next to the entity it
describes and counts how many of THAT entity take part per instance of the other.

Min-max variant (if the course uses it): `(0,N)`, `(1,1)`. First number = minimum
participation (0 optional, 1 mandatory), second = maximum.

## Wording -> construct

| Statement says | Model as |
|---|---|
| "identificado con un código/DNI" | key attribute |
| "cada X se asigna a un Y" (X to exactly one Y) | Y 1 - N X |
| "cada X tiene asociado un único Y y cada Y solo es válido para un X" | 1:1 |
| "varios / muchos / puede tener varios" | N side |
| "número secuencial que las identifica (copia 1, 2…)" | weak entity, discriminator = that number |
| "X no existe sin Y" / "X depende de Y" | weak entity or total participation |
| a fact about the link (date, role, bando, nota) | relationship attribute |
| "periodos", "histórico", "varias veces" | weak entity with start/end, or relationship attribute with dates |
| "X es un tipo de Y", "los empleados pueden ser técnicos o gerentes" | generalisation (ISA) |
| value with only a few fixed options (tipo, estado) | plain attribute, not an entity |

## Weak entity recipe

1. Owner entity with its own key (`DOCUMENTO.código`).
2. Weak entity with only a discriminator (`COPIA.num_copia`).
3. Identifying relationship, double diamond, 1 at the owner and N at the weak entity.
4. Full identity of a weak instance = owner key + discriminator (`código + num_copia`).
   Write that sentence under the diagram.

A weak entity can itself own another weak entity; chain the identifying relationships.

## Common traps

- Forgetting a key on a strong entity, or underlining the discriminator with a solid line.
- Cardinality labels on only one end of a line.
- Putting `bando`, `año_entrada` etc. on an entity when they describe a pair of entities.
- Inventing entities for plain values.
- Relationship with attributes but drawn 1:N when the statement allows many on both sides.
