"""Both worked examples in one plain PDF (what the original activity delivered)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
from er_draw import plain_pdf
import oficina_tramites as e1, guerras as e2

out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/ejemplo_er.pdf"
d1, d2 = e1.build(), e2.build()
d1.check(); d2.check()
plain_pdf(out, [("title", "Ejercicios: Entidad relación - Bases de datos"),
                ("h2", "Ejercicio 1. Oficina de trámites"), ("diagram", d1)] + e1.TEXT +
               [("pagebreak",), ("h2", "Ejercicio 2. Guerras"), ("diagram", d2)] + e2.TEXT)
print("wrote", out)
