from django.contrib import admin
from .models import Recipient, RecipientList
admin.site.register(RecipientList)
admin.site.register(Recipient)
