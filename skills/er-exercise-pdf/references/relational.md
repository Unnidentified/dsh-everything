# ER -> relational (only if requested)
One line per table: `CLIENTE(<u>dni</u>, nombre)`; FK as `#col -> TABLA`.
1. Strong entity -> table; key -> PK; composite -> its components; derived -> omit; multivalued -> table (key, valor).
2. 1:N -> PK of the 1 side as FK in the N side (+ relation attributes). 1:1 -> FK (UNIQUE) on either side. N:M -> table with both keys (PK together, add date/discriminator if pairs repeat) + relation attributes.
3. Weak entity -> table with owner key (FK, cascade) + discriminator; PK = both.
4. Specialisation -> table per entity, subtype PK = FK to the supertype (or one table with a type column if subtypes are tiny).
