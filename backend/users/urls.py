from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import (
    ChangePasswordView,
    LogoutView,
    ProfileView,
    SessionViewSet,
    SettingsView,
    TwoFactorBackupCodesView,
    TwoFactorConfirmView,
    TwoFactorDisableView,
    TwoFactorSetupView,
    TwoFactorVerifyLoginView,
    UserViewSet,
)

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")
router.register("sessions", SessionViewSet, basename="session")

urlpatterns = [
    path("", include(router.urls)),
    path("settings/", SettingsView.as_view(), name="settings"),
    path("profile/", ProfileView.as_view(), name="profile"),
    path("profile/change-password/", ChangePasswordView.as_view(), name="change-password"),
    path("auth/logout/", LogoutView.as_view(), name="logout"),
    # Two-Factor Authentication
    path("auth/2fa/setup/", TwoFactorSetupView.as_view(), name="2fa-setup"),
    path("auth/2fa/confirm/", TwoFactorConfirmView.as_view(), name="2fa-confirm"),
    path("auth/2fa/disable/", TwoFactorDisableView.as_view(), name="2fa-disable"),
    path("auth/2fa/regenerate-backup-codes/", TwoFactorBackupCodesView.as_view(), name="2fa-backup-codes"),
    path("auth/2fa/verify-login/", TwoFactorVerifyLoginView.as_view(), name="2fa-verify-login"),
]
