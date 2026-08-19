import csv
from io import BytesIO
from openpyxl import Workbook
from django.http import HttpResponse
from common.exports import safe_spreadsheet_value

def export_csv(filename, headers, rows):
    response = HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    writer = csv.writer(response)
    writer.writerow(headers)
    for row in rows:
        formatted_row = [safe_spreadsheet_value(val) for val in row]
        writer.writerow(formatted_row)
    return response

def export_excel(filename, headers, rows):
    wb = Workbook()
    # wb.active is Optional[Worksheet] per stubs; guard so Pyright is happy.
    ws = wb.active if wb.active is not None else wb.create_sheet()
    ws.title = "Report"

    ws.append(headers)
    for row in rows:
        formatted_row = [safe_spreadsheet_value(val) for val in row]
        ws.append(formatted_row)

    output = BytesIO()
    wb.save(output)
    output.seek(0)

    response = HttpResponse(
        output.getvalue(),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response
