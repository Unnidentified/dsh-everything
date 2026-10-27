"""Worked example 2: guerras y países (M:N with attributes on the relationship,
weak entity for independence periods)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
from er_draw import Diagram


def build():
    d = Diagram(480, 285)
    y = 185
    d.entity("gue", 45, y, "GUERRA")
    d.entity("pai", 355, y, "PAÍS")
    d.entity("per", 355, 40, "PERIODO_INDEPENDENCIA", weak=True)
    d.relationship("par", 200, y, "PARTICIPA", w=96)
    d.relationship("tie", 355, 110, "TIENE", identifying=True)

    d.attribute("g1", 38, 255, "id_guerra", of="gue", key=True)
    d.attribute("g2", 105, 255, "nombre", of="gue")
    d.attribute("g3", 38, 115, "año_inicio", of="gue")
    d.attribute("g4", 105, 115, "año_fin", of="gue")
    d.attribute("p1", 180, 255, "bando", of="par")
    d.attribute("p2", 245, 255, "ganador", of="par")
    d.attribute("p3", 172, 115, "año_entrada", of="par")
    d.attribute("p4", 248, 115, "año_salida", of="par")
    d.attribute("c1", 440, 225, "id_país", of="pai", key=True)
    d.attribute("c2", 440, 145, "nombre", of="pai")
    d.attribute("i1", 225, 40, "año_inicio", of="per", partial=True)
    d.attribute("i2", 455, 40, "año_fin", of="per")

    d.link("gue", "par", "N"); d.link("par", "pai", "M")
    d.link("pai", "tie", "1"); d.link("tie", "per", "N")
    return d


TEXT = [
    ("h2", "Entidades"),
    ("bullets", [
        "GUERRA: id_guerra (clave), nombre, año_inicio, año_fin.",
        "PAÍS: id_país (clave), nombre. Incluye países que ya no existen.",
        "PERIODO_INDEPENDENCIA (entidad débil): año_inicio (discriminador), año_fin. "
        "Cada registro es un periodo en el que el país fue independiente; un país puede "
        "tener varios. Si año_fin está vacío, el país sigue siendo independiente.",
    ]),
    ("h2", "Relaciones"),
    ("bullets", [
        "PARTICIPA: GUERRA (N) - PAÍS (M). Atributos de la relación: bando (1 o 2), "
        "año_entrada, año_salida y ganador (sí/no).",
        "TIENE (identificadora): PAÍS (1) - PERIODO_INDEPENDENCIA (N).",
    ]),
    ("p", "Se supone que un país entra en una misma guerra una sola vez."),
]

if __name__ == "__main__":
    from er_draw import plain_pdf
    d = build(); d.check()
    plain_pdf("/tmp/guerras.pdf",
              [("title", "Ejercicio 2. Guerras"), ("diagram", d)] + TEXT)
