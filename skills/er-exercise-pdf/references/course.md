# U-tad course conventions (Chen)

Design phases: análisis (ERS) -> conceptual (E/R) -> lógico (relacional) -> físico (SQL). The E/R diagram is the conceptual model: independent of the DBMS.

## Entities and attributes
- Entity = thing with own existence, different from others, instances with similar properties. Rectangle, UPPERCASE name. Strong: exists by itself.
- Attribute names lowercase, unique, meaningful; ellipse linked by a line. Each has a domain (allowed values).
- Key (clave primaria): underlined; may be composite (several underlined attributes). Candidate keys: pick one as primary (dni vs código_empleado).
- Optional attribute: dashed connecting LINE. Composite: ellipse linked to its simple ellipses. Multivalued: double ellipse. Derived (computable, e.g. edad): dashed ellipse. Relationship attributes: stored each time the relation happens (fecha in Persona-compra-Coche); they hang from the diamond.

## Relations
- Diamond with verb. Binary normal. Ternary only if the relation needs all three at once (turning it into binary creates a loop); never more than 3 entities. Reflexive (degree 1) allowed (Persona "hijo de"). Two relations between the same entities are fine if they mean different things; names may repeat (Cliente-compra-Coche vs Cliente-compra-Moto are two relations).
- Participation labels `(min,max)` at each end: (0,1) (1,1) (0,n) (1,n) (n,m). Label beside entity X = how many X per one instance of the other. Min 0 = optional, 1 = mandatory. Ternary: fix two entities, ask the third.
- Cardinality = from the maxima: 1:1, 1:N, N:M (ternary e.g. 1:1:N). Written next to the diamond (automatic in `er_draw`).

## Weak entities
Cannot exist without a strong one; conceptually almost part of it (do not use if the concepts are totally different). Relation also weak: double rectangle + double diamond, 1:1 or 1:N, never N:M, usually 1 strong : N weak.
- Identification dependence: also needs the strong key to build its own unique key (e.g. COPIA: código_documento + num_copia). Easy to spot; discriminator = dashed underline. Prefer this kind.
- Existence dependence: no meaning without the strong one; only when the relation info is not needed. Hard to spot, not required: when in doubt make it a strong entity.

## Extended ER (specialisation)
Use only when subtypes have their own attributes or relations. Triangle with the base toward the supertype (supertype above, apex down), lines to subtypes.
- Exclusive (arc across the lines: an occurrence is only one subtype) vs inclusive (no arc: several).
- Total (circle on the supertype line: must be some subtype; all subtypes listed) vs partial (no circle: may be none).
- Only the general entity has the key. Common attributes go only in the general entity (unless partial and non-represented subtypes lack them); subtypes show only their own. General entity relations apply to all subtypes; a subtype's relations are its own; subtypes relate to other entities/subtypes but not to their own general entity.
- Draw all known subtypes (good practice); unrepresented ones => partial.

## Data specification table (per entity, when asked)
Columns: Nombre del atributo | Descripción | Tipo de dato | Subtipo | Restricciones | Obligatoriedad (Sí/No) | Ejemplo | Observaciones. Fill every cell (the teacher's sample leaves blanks).
- Types: Número (Entero/Decimal), Alfanumérico, Fecha, Lógico. Restricciones: range/format/length ("Positivo, 15 dígitos", "8 números y una letra mayúscula").
- Observaciones: "Clave Primaria"; composite attribute row (Dirección, Apellidos) followed by rows `# TipoVía`, `# Apellido1` with "Simple de Dirección"; derived attribute in quotes `"Edad"` with "Derivado de FechaNac"; formats ("Formato europeo").
- Row sample: `NumExp | Identificador único de cada alumno | Número | Entero | Positivo, 15 dígitos | Sí | 123123123123123 | Clave Primaria`.
