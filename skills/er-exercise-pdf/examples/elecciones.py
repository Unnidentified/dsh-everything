"""Example 3 (extended ER): specialisation (partial), reflexive N:M, optional participation (0,1)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
from er_draw import Diagram, plain_pdf


def build():
    d = Diagram(480, 385); y = 240
    d.entity("vtn", 44, y, "VOTANTE"); d.entity("par", 240, y, "PARTIDO"); d.entity("pro", 440, y, "PROPUESTA")
    d.entity("pol", 44, 90, "POLÍTICO")
    d.relationship("vot", 142, y, "VOTA"); d.relationship("rea", 340, y, "REALIZA")
    d.relationship("ali", 240, 330, "ALÍA"); d.relationship("com", 200, 90, "COMPONE", ratio="below")
    d.isa("isa", 44, 165)                      # partial, inclusive (one subtype): no circle, no arc
    for id, x, yy, t, of, k in [("v1", 28, 325, "código", "vtn", "key"), ("v2", 88, 325, "dni", "vtn", ""),
            ("v3", 148, 325, "nombre", "vtn", ""), ("v4", 112, 198, "apellidos", "vtn", ""),
            ("v5", 128, 152, "fecha_nacimiento", "vtn", ""), ("p1", 285, 170, "nombre", "par", "key"),
            ("p2", 355, 145, "fecha_creación", "par", ""), ("q1", 440, 310, "id_propuesta", "pro", "key"),
            ("q2", 440, 175, "descripción", "pro", ""), ("o1", 44, 30, "activo", "pol", "")]:
        d.attribute(id, x, yy, t, of=of, key=k == "key")
    for a, b, c, o in [("vtn", "vot", "(0,n)", 0), ("vot", "par", "(0,1)", 0), ("par", "ali", "(0,n)", 20),
                       ("par", "ali", "(0,n)", -20), ("par", "com", "(1,1)", 0), ("com", "pol", "(1,n)", 0),
                       ("par", "rea", "(1,n)", 0), ("rea", "pro", "(0,n)", 0), ("vtn", "isa", None, 0), ("isa", "pol", None, 0)]:
        d.link(a, b, c, offset=o)
    return d


TEXT = [("h2", "Entidades"), ("bullets", [
    "VOTANTE: código (clave), dni, nombre, apellidos, fecha_nacimiento.",
    "POLÍTICO: subtipo de VOTANTE, porque los políticos también votan. Hereda todos sus atributos y la clave; añade activo (sí/no).",
    "PARTIDO: nombre (clave), fecha_creación.",
    "PROPUESTA: id_propuesta (clave), descripción. Se añade id_propuesta porque el enunciado no da identificador."]),
    ("h2", "Relaciones"), ("bullets", [
        "VOTA: VOTANTE (0,n) - PARTIDO (0,1). 1:N. Se puede no votar; el voto va a un solo partido, sin pasar por ALÍA.",
        "ALÍA (reflexiva): PARTIDO (0,n) - PARTIDO (0,n). N:M.", "COMPONE: PARTIDO (1,1) - POLÍTICO (1,n). 1:N.",
        "REALIZA: PARTIDO (1,n) - PROPUESTA (0,n). N:M."]),
    ("p", "Especialización parcial (no todo votante es político). Se supone que cada político pertenece a un solo partido.")]

if __name__ == "__main__":
    d = build(); d.check(); d.preview("/tmp/elecciones.png")
    plain_pdf("/tmp/elecciones.pdf", [("title", "Ejercicio 1. Elecciones generales"), ("diagram", d)] + TEXT)
