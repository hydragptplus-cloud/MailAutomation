from django.urls import path

from .views import (
    AccountInvoiceCreateView, BscTransactionInspectView, CheckoutEmailStartView, CheckoutEmailVerifyView, FreeSignupView,
    CsrfBootstrapView, CurrentInvoiceView, InvoiceCancelView, InvoiceCreateView, InvoiceDetailView, InvoiceRecoverView, InvoiceReplaceView,
    InvoiceSessionExchangeView, InvoiceVerifyView,
    PaymentReviewViewSet, PlanAdminViewSet, PlanListView, PublicLandingMonitorView,
)

plan_admin_list = PlanAdminViewSet.as_view({"get": "list", "post": "create"})
plan_admin_detail = PlanAdminViewSet.as_view({"get": "retrieve", "put": "update", "patch": "partial_update"})
review_list = PaymentReviewViewSet.as_view({"get": "list"})
review_detail = PaymentReviewViewSet.as_view({"get": "retrieve"})
review_action = PaymentReviewViewSet.as_view({"post": "action"})

urlpatterns = [
    path("monitor/", PublicLandingMonitorView.as_view(), name="public-landing-monitor"),
    path("plans/", PlanListView.as_view(), name="public-plans"),
    path("platform/plans/", plan_admin_list, name="platform-plan-list"),
    path("platform/plans/<int:pk>/", plan_admin_detail, name="platform-plan-detail"),
    path("platform/payment-reviews/", review_list, name="platform-payment-review-list"),
    path("platform/payment-reviews/<int:pk>/", review_detail, name="platform-payment-review-detail"),
    path("platform/payment-reviews/<int:pk>/action/", review_action, name="platform-payment-review-action"),
    path("platform/bsc-transaction-inspect/", BscTransactionInspectView.as_view(), name="platform-bsc-transaction-inspect"),
    path("signup/free/", FreeSignupView.as_view(), name="free-signup"),
    path("checkout/email/start/", CheckoutEmailStartView.as_view(), name="checkout-email-start"),
    path("checkout/email/verify/", CheckoutEmailVerifyView.as_view(), name="checkout-email-verify"),
    path("csrf/", CsrfBootstrapView.as_view(), name="billing-csrf"),
    path("invoices/", InvoiceCreateView.as_view(), name="invoice-create"),
    path("invoices/current/", CurrentInvoiceView.as_view(), name="invoice-current"),
    path("invoices/recover/", InvoiceRecoverView.as_view(), name="invoice-recover"),
    path("account/invoices/", AccountInvoiceCreateView.as_view(), name="account-invoice-create"),
    path("invoices/<uuid:invoice_id>/session/", InvoiceSessionExchangeView.as_view(), name="invoice-session"),
    path("invoices/<uuid:invoice_id>/", InvoiceDetailView.as_view(), name="invoice-detail"),
    path("invoices/<uuid:invoice_id>/verify/", InvoiceVerifyView.as_view(), name="invoice-verify"),
    path("invoices/<uuid:invoice_id>/replace/", InvoiceReplaceView.as_view(), name="invoice-replace"),
    path("invoices/<uuid:invoice_id>/cancel/", InvoiceCancelView.as_view(), name="invoice-cancel"),
]
