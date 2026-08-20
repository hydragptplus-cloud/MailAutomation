import uuid
from typing import Any, cast

from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.db.models import Max, Q
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


from common.utils import get_client_ip


def _request_ip(request):
    ip = get_client_ip(request)
    return ip if ip != "unknown" else None


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
        session_id = refresh.get("session_id")
        user_id = refresh.get("user_id")
        if not session_id or not UserLoginSession.objects.filter(
            session_id=session_id, user_id=user_id, revoked_at__isnull=True
        ).exists():
            raise InvalidToken("Session is no longer valid.")
        data = super().validate(attrs)
        if "refresh" in data:
            new_refresh = RefreshToken(cast(Any, data["refresh"]))
            new_refresh["session_id"] = session_id
            new_refresh["role"] = refresh.get("role")
            new_refresh["organization_id"] = refresh.get("organization_id")
            new_refresh["username"] = refresh.get("username")
            new_refresh["email"] = refresh.get("email")
            UserLoginSession.objects.filter(
                session_id=session_id, user_id=user_id, revoked_at__isnull=True
            ).update(refresh_token_jti=str(new_refresh["jti"]))
            data["refresh"] = str(new_refresh)
            data["access"] = str(new_refresh.access_token)
        return data


class UserSerializer(serializers.ModelSerializer):
    username = serializers.CharField(required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, required=False, allow_blank=False)
    organization_name = serializers.CharField(source="organization.name", read_only=True)

    # Computed UI-helper fields
    active_session_count = serializers.SerializerMethodField()
    last_seen_at = serializers.SerializerMethodField()
    can_delete = serializers.SerializerMethodField()
    can_deactivate = serializers.SerializerMethodField()
    can_reset_password = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id", "username", "name", "email", "role",
            "organization", "organization_name", "is_active",
            "date_joined", "password",
            # computed
            "active_session_count", "last_seen_at",
            "can_delete", "can_deactivate", "can_reset_password",
        )
        read_only_fields = (
            "id", "date_joined", "organization_name",
            "active_session_count", "last_seen_at",
            "can_delete", "can_deactivate", "can_reset_password",
        )

    # ── helpers ───────────────────────────────────────────────────────

    def _actor(self):
        request = self.context.get("request")
        if request and getattr(request.user, "is_authenticated", False):
            return cast(User, request.user)
        return None

    def _is_last_active_admin(self, user):
        if user.role != User.Role.ADMIN or not user.organization:
            return False
        return not (
            User.objects.filter(
                organization=user.organization,
                role=User.Role.ADMIN,
                is_active=True,
            )
            .exclude(pk=user.pk)
            .exists()
        )

    # ── computed fields ───────────────────────────────────────────────

    def get_active_session_count(self, obj):
        return UserLoginSession.objects.filter(user=obj, revoked_at__isnull=True).count()

    def get_last_seen_at(self, obj):
        result = UserLoginSession.objects.filter(user=obj, revoked_at__isnull=True).aggregate(
            last=Max("last_seen_at")
        )
        return result["last"]

    def get_can_delete(self, obj):
        actor = self._actor()
        if not actor:
            return False
        if obj.role == User.Role.OWNER:
            return False
        if obj.pk == actor.pk:
            return False
        if self._is_last_active_admin(obj):
            return False
        return True

    def get_can_deactivate(self, obj):
        actor = self._actor()
        if not actor:
            return False
        if obj.role == User.Role.OWNER:
            return False
        if obj.pk == actor.pk:
            return False
        if not obj.is_active:
            return False
        if self._is_last_active_admin(obj):
            return False
        return True

    def get_can_reset_password(self, obj):
        actor = self._actor()
        if not actor:
            return False
        if obj.role == User.Role.OWNER and actor.pk != obj.pk:
            return False
        return True

    # ── validation ────────────────────────────────────────────────────

    def validate(self, attrs):
        request = self.context.get("request")
        actor = cast(User, request.user) if request and getattr(request.user, "is_authenticated", False) else None
        role = attrs.get("role", getattr(self.instance, "role", User.Role.OPERATOR))
        organization = attrs.get("organization", getattr(self.instance, "organization", None))

        # Nobody can create/assign the owner role through the product API
        if role == User.Role.OWNER:
            raise serializers.ValidationError({"role": "Cannot assign the owner role through the product API."})

        if actor and actor.role != User.Role.OWNER:
            if organization and organization != actor.organization:
                raise serializers.ValidationError({"organization": "Users must belong to your organization."})
            attrs["organization"] = actor.organization
            organization = actor.organization

        if actor and actor.role == User.Role.OWNER and not organization:
            raise serializers.ValidationError({"organization": "Customer users require an organization."})

        # Self-demotion check
        if self.instance and actor and self.instance.pk == actor.pk and role != self.instance.role:
            raise serializers.ValidationError({"role": "You cannot change your own role."})

        # Last active admin demotion check
        if (
            self.instance
            and self.instance.role == User.Role.ADMIN
            and role != User.Role.ADMIN
            and self._is_last_active_admin(self.instance)
        ):
            raise serializers.ValidationError({"role": "Cannot demote the last active administrator."})

        # Seat limit check
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
