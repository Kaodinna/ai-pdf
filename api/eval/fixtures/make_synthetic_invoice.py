"""Writes synthetic_invoice.pdf. Values here are the expected answers in ../testset.json."""
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle

c = canvas.Canvas("synthetic_invoice.pdf", pagesize=A4)
w, h = A4
c.setFont("Helvetica-Bold", 16)
c.drawString(50, h - 50, "COMMERCIAL INVOICE")
c.setFont("Helvetica", 10)
for i, line in enumerate([
    "Invoice No: INV-2026-0451", "Invoice Date: 12-September-2026",
    "Seller: NORTHWIND TRADING PTE LTD", "Buyer: BLUE HARBOR LOGISTICS SARL",
    "Currency: USD", "Payment Terms: NET 30",
]):
    c.drawString(50, h - 90 - i * 16, line)
data = [["Item", "Description", "Qty", "Unit Price", "Amount"],
        ["1", "Steel bolts M8", "500", "0.40", "200.00"],
        ["2", "Hex nuts M8", "500", "0.25", "125.00"],
        ["3", "Washers 8mm", "1000", "0.10", "100.00"],
        ["", "", "", "Total", "425.00"]]
t = Table(data, colWidths=[40, 200, 60, 80, 80])
t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.5, colors.black),
                       ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey)]))
t.wrapOn(c, w, h)
t.drawOn(c, 50, h - 330)
c.save()
