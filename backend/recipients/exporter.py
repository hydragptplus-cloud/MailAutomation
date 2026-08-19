import csv
from django.http import HttpResponse
from common.exports import safe_spreadsheet_value

def export_csv(queryset):
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = 'attachment; filename="recipients.csv"'
    writer = csv.writer(response)
    writer.writerow(["name", "email", "company", "phone", "status", "tags"])
    for item in queryset.iterator():
        writer.writerow([safe_spreadsheet_value(v) for v in [item.name, item.email, item.company, item.phone, item.status, ",".join(item.tags or [])]])
    return response
