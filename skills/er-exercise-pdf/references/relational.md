# ER -> relational model (only when the statement asks for it)

Write one line per table, no decoration:

    CLIENTE(<u>DNI</u>, nombre, apellidos)

In plain PDF text use: primary key underlined with `<u>…</u>` (reportlab markup), foreign
keys prefixed with `#` or followed by "(FK)". Pick one convention and say which at the top.

## Rules

1. **Strong entity** -> table; key attribute -> primary key; composite attributes ->
   their components as columns; derived attributes -> omit (or note how to compute).
2. **Multivalued attribute** -> its own table `(clave_entidad, valor)`, PK both columns.
3. **1:N relationship** -> put the key of the "1" side as a foreign key in the N side's table.
   Attributes of the relationship go to the N side too.
4. **1:1 relationship** -> foreign key on either side (choose the side with total
   participation) with UNIQUE; or merge the tables if both are total.
5. **M:N relationship** -> new table with both keys as FKs, PK = both keys together
   (add a date or discriminator to the PK if the same pair can repeat), plus the
   relationship's own attributes.
6. **Weak entity** -> table containing the owner's key as FK plus the discriminator and
   its attributes. PK = owner key + discriminator. FK on delete cascade (note it).
7. **Generalisation** -> pick one: table per entity with the parent key as PK/FK in children
   (default), or a single table with a type column when children have few attributes.

## Example (from `examples/oficina_tramites.py`)

    CLIENTE(DNI, nombre, apellidos)
    FUNCIONARIO(código, especialidad)
    DOCUMENTO(código, tipo)
    TRÁMITE(id_trámite, descripción, DNI_cliente -> CLIENTE, código_funcionario -> FUNCIONARIO,
            código_documento -> DOCUMENTO [único])
    COPIA(código_documento -> DOCUMENTO, num_copia, ...)   PK = (código_documento, num_copia)
