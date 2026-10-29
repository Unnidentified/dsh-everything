"""Example 1: strong entities, 1:1, identification-dependent weak entity (COPIA)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
from er_draw import Diagram, plain_pdf


def build():
    d = Diagram(480, 315); y = 235
    for id, x, yy, t, w in [("cli", 40, y, "CLIENTE", 0), ("tra", 240, y, "TRÁMITE", 0), ("fun", 440, y, "FUNCIONARIO", 0),
                            ("doc", 240, 85, "DOCUMENTO", 0), ("cop", 440, 85, "COPIA", 1)]:
        d.entity(id, x, yy, t, weak=bool(w))
    d.relationship("sol", 140, y, "SOLICITA"); d.relationship("asi", 340, y, "ASIGNA")
    d.relationship("req", 240, 165, "REQUIERE", ratio="right")
    d.relationship("tie", 340, 85, "TIENE", identifying=True)
    for id, x, yy, t, of, k in [("a1", 40, 300, "dni", "cli", "key"), ("a2", 30, 170, "nombre", "cli", ""),
            ("a3", 100, 170, "apellidos", "cli", ""), ("a4", 205, 300, "id_trámite", "tra", "key"),
            ("a5", 275, 300, "descripción", "tra", ""), ("a6", 440, 300, "código", "fun", "key"),
            ("a7", 440, 170, "especialidad", "fun", ""), ("a8", 205, 25, "código", "doc", "key"),
            ("a9", 275, 25, "tipo", "doc", ""), ("a10", 440, 25, "num_copia", "cop", "partial")]:
        d.attribute(id, x, yy, t, of=of, key=k == "key", partial=k == "partial")
    # label next to entity X = (min,max) number of X per ONE instance of the other entity
    for a, b, c in [("cli", "sol", "(1,1)"), ("sol", "tra", "(0,n)"), ("fun", "asi", "(1,1)"), ("asi", "tra", "(0,n)"),
                    ("tra", "req", "(1,1)"), ("req", "doc", "(1,1)"), ("doc", "tie", "(1,1)"), ("tie", "cop", "(1,n)")]:
        d.link(a, b, c)
    return d


TEXT = [("h2", "Entidades"), ("bullets", [
    "CLIENTE: dni (clave), nombre, apellidos.", "FUNCIONARIO: código (clave), especialidad.",
    "TRÁMITE: id_trámite (clave), descripción. Se añade id_trámite porque el enunciado no da identificador.",
    "DOCUMENTO: código (clave), tipo.",
    "COPIA (entidad débil por identificación): num_copia (discriminador); se identifica por el código del documento más num_copia."]),
    ("h2", "Relaciones"), ("bullets", [
        "SOLICITA: CLIENTE (1,1) - TRÁMITE (0,n). 1:N.", "ASIGNA: FUNCIONARIO (1,1) - TRÁMITE (0,n). 1:N.",
        "REQUIERE: TRÁMITE (1,1) - DOCUMENTO (1,1). 1:1.", "TIENE (identificadora): DOCUMENTO (1,1) - COPIA (1,n). 1:N."]),
    ("p", "Participaciones mínimas supuestas: todo trámite tiene cliente, funcionario y documento; un cliente o funcionario puede no tener trámites.")]

if __name__ == "__main__":
    d = build(); d.check()
    plain_pdf("/tmp/oficina_tramites.pdf", [("title", "Ejercicio 1. Oficina de trámites"), ("diagram", d)] + TEXT)
