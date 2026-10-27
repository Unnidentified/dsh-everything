"""Worked example 1: oficina de trámites (strong entities, 1:1, weak entity COPIA)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
from er_draw import Diagram


def build():
    d = Diagram(480, 315)
    y = 235
    d.entity("cli", 40, y, "CLIENTE")
    d.entity("tra", 240, y, "TRÁMITE")
    d.entity("fun", 440, y, "FUNCIONARIO")
    d.entity("doc", 240, 85, "DOCUMENTO")
    d.entity("cop", 440, 85, "COPIA", weak=True)
    d.relationship("sol", 140, y, "SOLICITA")
    d.relationship("asi", 340, y, "ASIGNA")
    d.relationship("req", 240, 165, "REQUIERE")
    d.relationship("tie", 340, 85, "TIENE", identifying=True)

    d.attribute("a1", 40, 300, "DNI", of="cli", key=True)
    d.attribute("a2", 30, 170, "nombre", of="cli")
    d.attribute("a3", 100, 170, "apellidos", of="cli")
    d.attribute("a4", 205, 300, "id_trámite", of="tra", key=True)
    d.attribute("a5", 275, 300, "descripción", of="tra")
    d.attribute("a6", 440, 300, "código", of="fun", key=True)
    d.attribute("a7", 440, 170, "especialidad", of="fun")
    d.attribute("a8", 205, 25, "código", of="doc", key=True)
    d.attribute("a9", 275, 25, "tipo", of="doc")
    d.attribute("a10", 440, 25, "num_copia", of="cop", partial=True)

    d.link("cli", "sol", "1"); d.link("sol", "tra", "N")
    d.link("fun", "asi", "1"); d.link("asi", "tra", "N")
    d.link("tra", "req", "1"); d.link("req", "doc", "1")
    d.link("doc", "tie", "1"); d.link("tie", "cop", "N")
    return d


TEXT = [
    ("h2", "Entidades"),
    ("bullets", [
        "CLIENTE: DNI (clave), nombre, apellidos.",
        "FUNCIONARIO: código (clave), especialidad.",
        "TRÁMITE: id_trámite (clave), descripción. El enunciado no da identificador "
        "para el trámite, por lo que se añade id_trámite.",
        "DOCUMENTO: código (clave), tipo.",
        "COPIA (entidad débil): num_copia (discriminador). Depende de DOCUMENTO y se "
        "identifica por el código del documento más num_copia.",
    ]),
    ("h2", "Relaciones"),
    ("bullets", [
        "SOLICITA: CLIENTE (1) - TRÁMITE (N).",
        "ASIGNA: FUNCIONARIO (1) - TRÁMITE (N).",
        "REQUIERE: TRÁMITE (1) - DOCUMENTO (1).",
        "TIENE (identificadora): DOCUMENTO (1) - COPIA (N).",
    ]),
]

if __name__ == "__main__":
    from er_draw import plain_pdf
    d = build(); d.check()
    plain_pdf("/tmp/oficina_tramites.pdf",
              [("title", "Ejercicio 1. Oficina de trámites"), ("diagram", d)] + TEXT)
