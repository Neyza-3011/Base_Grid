import io
import base64
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from app.models.report import Report
from app.models.client import Client
from app.models.user import User


def generate_report_pdf(report: Report, client: Client, technician: User) -> io.BytesIO:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "TitleStyle",
        parent=styles["Heading1"],
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#0F172A"),
        spaceAfter=12,
    )
    subtitle_style = ParagraphStyle(
        "SubTitleStyle",
        parent=styles["Normal"],
        fontSize=10,
        textColor=colors.HexColor("#64748B"),
        spaceAfter=20,
    )
    section_style = ParagraphStyle(
        "SectionStyle",
        parent=styles["Heading2"],
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#1E293B"),
        spaceBefore=12,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "BodyStyle",
        parent=styles["Normal"],
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#334155"),
    )

    story = []

    # Document Header
    story.append(Paragraph("RAPPORTINO DI INTERVENTO TECNICO", title_style))
    story.append(Paragraph(f"ID Rapportino: {report.id} | Data: {report.date.strftime('%d/%m/%Y')} | Stato: {report.status.value.upper()}", subtitle_style))

    # Client & Technician Meta Table
    meta_data = [
        [
            Paragraph("<b>CLIENTE / COMMITTENTE</b>", section_style),
            Paragraph("<b>TECNICO INCARICATO</b>", section_style),
        ],
        [
            Paragraph(f"<b>Ragione Sociale:</b> {client.name}<br/><b>Indirizzo:</b> {client.address or 'N/A'}<br/><b>P.IVA:</b> {client.vat_number or 'N/A'}<br/><b>Email:</b> {client.contact_email or 'N/A'}", body_style),
            Paragraph(f"<b>Nome:</b> {technician.full_name}<br/><b>Email:</b> {technician.email}", body_style),
        ],
    ]
    meta_table = Table(meta_data, colWidths=[270, 270])
    meta_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F8FAFC")),
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ])
    )
    story.append(meta_table)
    story.append(Spacer(1, 15))

    # Work & Travel Hours
    hours_data = [
        ["Ore Lavoro Eseguite", "Ore Viaggio / Trasferta", "Totale Ore"],
        [f"{report.work_hours} h", f"{report.travel_hours} h", f"{float(report.work_hours) + float(report.travel_hours)} h"],
    ]
    hours_table = Table(hours_data, colWidths=[180, 180, 180])
    hours_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2563EB")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ])
    )
    story.append(hours_table)
    story.append(Spacer(1, 15))

    # Work Notes / Description
    if report.notes:
        story.append(Paragraph("<b>Descrizione Intervento & Note Tecniche:</b>", section_style))
        story.append(Paragraph(report.notes, body_style))
        story.append(Spacer(1, 15))

    # Materials Used Table
    materials = report.materials_used or []
    if materials:
        story.append(Paragraph("<b>Materiali e Ricambi Utilizzati:</b>", section_style))
        mat_rows = [["Descrizione Materiale", "Quantità", "Unità", "Prezzo Unit.", "Totale"]]
        grand_total = 0.0
        for item in materials:
            q = float(item.get("quantity", 0))
            p = float(item.get("unit_price", 0))
            tot = q * p
            grand_total += tot
            mat_rows.append([
                item.get("name", ""),
                str(q),
                item.get("unit", "pza"),
                f"€ {p:.2f}",
                f"€ {tot:.2f}",
            ])
        mat_rows.append(["TOTALE MATERIALI", "", "", "", f"€ {grand_total:.2f}"])

        mat_table = Table(mat_rows, colWidths=[220, 70, 70, 90, 90])
        mat_table.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F1F5F9")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("ALIGN", (1, 0), (-1, -1), "CENTER"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#F8FAFC")),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ])
        )
        story.append(mat_table)
        story.append(Spacer(1, 15))

    # Digital Signature Section
    if report.signature_base64:
        story.append(Paragraph("<b>Firma Digitale Cliente:</b>", section_style))
        try:
            sig_raw = report.signature_base64
            if "," in sig_raw:
                sig_raw = sig_raw.split(",")[1]
            sig_bytes = base64.b64decode(sig_raw)
            sig_image_stream = io.BytesIO(sig_bytes)
            img = Image(sig_image_stream, width=180, height=70)
            story.append(img)
        except Exception:
            story.append(Paragraph("<i>Firma digitale registrata su display.</i>", body_style))

    doc.build(story)
    buffer.seek(0)
    return buffer
