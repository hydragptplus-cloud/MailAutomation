from rest_framework import serializers
from .models import EmailTemplate
from .validators import validate_template


class EmailTemplateSerializer(serializers.ModelSerializer):
    validation_errors = serializers.SerializerMethodField()

    class Meta:
        model = EmailTemplate
        fields = "__all__"
        read_only_fields = ("organization", "created_by", "created_at", "updated_at")

    def get_validation_errors(self, obj):
        return validate_template(obj.subject, obj.html)
