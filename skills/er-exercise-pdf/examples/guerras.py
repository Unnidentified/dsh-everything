"""Example 2: M:N with relationship attributes + weak entity for time periods."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
from er_draw import Diagram, plain_pdf


def build():
    d = Diagram(480, 285); y = 185
    d.entity("gue", 45, y, "GUERRA"); d.entity("pai", 355, y, "PAÍS")
    d.entity("per", 355, 40, "PERIODO_INDEPENDENCIA", weak=True)
    d.relationship("par", 200, y, "PARTICIPA", w=96, ratio=(36, 22)); d.relationship("tie", 355, 110, "TIENE", identifying=True, ratio="right")
    for id, x, yy, t, of, k in [("g1", 38, 255, "id_guerra", "gue", "key"), ("g2", 105, 255, "nombre", "gue", ""),
            ("g3", 38, 115, "año_inicio", "gue", ""), ("g4", 105, 115, "año_fin", "gue", ""),
            ("p1", 180, 255, "bando", "par", ""), ("p2", 245, 255, "ganador", "par", ""),
            ("p3", 172, 115, "año_entrada", "par", ""), ("p4", 248, 115, "año_salida", "par", ""),
            ("c1", 440, 225, "id_país", "pai", "key"), ("c2", 440, 145, "nombre", "pai", ""),
            ("i1", 225, 40, "año_inicio", "per", "partial"), ("i2", 450, 40, "año_fin", "per", "")]:
        d.attribute(id, x, yy, t, of=of, key=k == "key", partial=k == "partial")
    for a, b, c in [("gue", "par", "(0,n)"), ("par", "pai", "(2,n)"), ("pai", "tie", "(1,1)"), ("tie", "per", "(1,n)")]:
        d.link(a, b, c)
    return d


TEXT = [("h2", "Entidades"), ("bullets", [
    "GUERRA: id_guerra (clave), nombre, año_inicio, año_fin.", "PAÍS: id_país (clave), nombre. Incluye países que ya no existen.",
    "PERIODO_INDEPENDENCIA (entidad débil por identificación): año_inicio (discriminador), año_fin. Un país puede tener varios periodos; año_fin vacío = sigue independiente."]),
    ("h2", "Relaciones"), ("bullets", [
        "PARTICIPA: GUERRA (0,n) - PAÍS (2,n). N:M. Atributos de la relación: bando (1 o 2), año_entrada, año_salida, ganador (sí/no).",
        "TIENE (identificadora): PAÍS (1,1) - PERIODO_INDEPENDENCIA (1,n). 1:N."]),
    ("p", "Se supone que un país entra en una misma guerra una sola vez y que toda guerra tiene al menos dos países.")]

if __name__ == "__main__":
    d = build(); d.check()
    plain_pdf("/tmp/guerras.pdf", [("title", "Ejercicio 2. Guerras"), ("diagram", d)] + TEXT)
