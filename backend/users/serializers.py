import uuid
from typing import Any, cast

from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import InvalidToken
from common.models import SystemSetting
from common.models import Organization
from .models import User, UserLoginSession


def _seat_count(organization, role, exclude_user=None):
    users = organization.users.all()
    if exclude_user:
        users = users.exclude(pk=exclude_user.pk)
    if role == User.Role.ADMIN:
        return users.filter(role=User.Role.ADMIN).count(), organization.max_admins, "Administrator"
    return users.exclude(role__in=(User.Role.OWNER, User.Role.ADMIN)).count(), organization.max_users, "User"


def _request_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "") if request else ""
    return forwarded.split(",")[0].strip() if forwarded else (request.META.get("REMOTE_ADDR") if request else None)


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @transaction.atomic
    def validate(self, attrs):
        username_or_email = attrs.get("username", "").strip()
        if "@" in username_or_email:
            user = User.objects.filter(email__iexact=username_or_email).first()
            if user:
                attrs["username"] = user.username
        data: dict[str, Any] = dict(super().validate(attrs))
        request = self.context.get("request")
        self.user = User.objects.select_for_update().get(pk=self.user.pk)
        user = cast(User, self.user)
        if user.role == User.Role.OWNER:
            UserLoginSession.objects.filter(user=user, revoked_at__isnull=True).update(revoked_at=timezone.now())
        session_id = uuid.uuid4()
        refresh = RefreshToken(cast(Any, data["refresh"]))
        refresh["session_id"] = str(session_id)
        refresh["role"] = user.role
        refresh["organization_id"] = user.organization.id if user.organization else None
        refresh["username"] = user.username
        refresh["email"] = user.email
        UserLoginSession.objects.create(
            user=user,
            session_id=session_id,
            refresh_token_jti=str(refresh["jti"]),
            ip_address=_request_ip(request),
            user_agent=(request.META.get("HTTP_USER_AGENT", "")[:1000] if request else ""),
        )
        data["refresh"] = str(refresh)
        data["access"] = str(refresh.access_token)
        data["user"] = UserSerializer(user).data
        return data


class SessionTokenRefreshSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        refresh = RefreshToken(cast(Any, attrs["refresh"]))
        if not refresh.get("session_id") or not UserLoginSession.objects.filter(
            session_id=refresh.get("session_id"), user_id=refresh.get("user_id"), revoked_at__isnull=True
        ).exists():
            raise InvalidToken("Session is no longer valid.")
        return super().validate(attrs)


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=False)
    organization_name = serializers.CharField(source="organization.name", read_only=True)

    class Meta:
        model = User
        fields = ("id", "username", "name", "email", "role", "organization", "organization_name", "is_active", "date_joined", "password")
        read_only_fields = ("id", "date_joined", "organization_name")

    def validate(self, attrs):
        request = self.context.get("request")
        actor = cast(User, request.user) if request and getattr(request.user, "is_authenticated", False) else None
        role = attrs.get("role", getattr(self.instance, "role", User.Role.OPERATOR))
        organization = attrs.get("organization", getattr(self.instance, "organization", None))
        if actor and actor.role != User.Role.OWNER:
            if role == User.Role.OWNER:
                raise serializers.ValidationError({"role": "Only the owner can assign this role."})
            if organization and organization != actor.organization:
                raise serializers.ValidationError({"organization": "Users must belong to your organization."})
            attrs["organization"] = actor.organization
            organization = actor.organization
        if actor and actor.role == User.Role.OWNER and role != User.Role.OWNER and not organization:
            raise serializers.ValidationError({"organization": "Customer users require an organization."})
        if organization and role != User.Role.OWNER and (self.instance is None or role != self.instance.role):
            count, limit, label = _seat_count(organization, role, self.instance)
            if count >= limit:
                raise serializers.ValidationError({"detail": f"{label} limit reached for this account."})
        if attrs.get("password"):
            validate_password(attrs["password"])
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        password = validated_data.pop("password", None)
        email = validated_data.get("email", "").strip()
        username = validated_data.get("username", "").strip() or email.split("@")[0]
        base_username, counter = username, 1
        while User.objects.filter(username=username).exists():
            username = f"{base_username}{counter}"
            counter += 1
        validated_data["username"] = username
        organization = validated_data.get("organization")
        if organization:
            organization = Organization.objects.select_for_update().get(pk=organization.pk)
            count, limit, label = _seat_count(organization, validated_data.get("role", User.Role.OPERATOR))
            if count >= limit:
                raise serializers.ValidationError({"detail": f"{label} limit reached for this account."})
            validated_data["organization"] = organization
        user = User(**validated_data)
        user.is_staff = user.role == User.Role.OWNER
        user.is_superuser = user.role == User.Role.OWNER
        user.set_password(password) if password else user.set_unusable_password()
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.is_staff = instance.role == User.Role.OWNER
        instance.is_superuser = instance.role == User.Role.OWNER
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class ProfileSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True)

    class Meta:
        model = User
        fields = ("id", "username", "name", "email", "role", "organization", "organization_name")
        read_only_fields = ("id", "username", "role", "organization", "organization_name")


class UserLoginSessionSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = UserLoginSession
        fields = ("id", "user", "username", "session_id", "ip_address", "user_agent", "created_at", "last_seen_at", "revoked_at")
        read_only_fields = fields


class SystemSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemSetting
        fields = "__all__"
        read_only_fields = ("organization",)
