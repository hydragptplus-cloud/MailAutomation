from django.test import TestCase, override_settings
from django.urls import reverse

from common.models import Organization
from recipients.models import Recipient, RecipientList
from reports.services import campaign_report_detail

from .models import Campaign, CampaignClick, CampaignLog, CampaignUnsubscribe
from .tracking import append_unsubscribe_footer, make_click_token, make_unsubscribe_token, rewrite_tracked_links


@override_settings(TRACKING_BASE_URL="https://mail.example.com")
class ClickTrackingTests(TestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name="Tracking Test Organization")
        self.campaign = Campaign.objects.create(
            organization=self.organization,
            name="Tracked campaign",
            subject="Tracked subject",
            status=Campaign.Status.COMPLETED,
            total_count=2,
            sent_count=2,
        )
        self.first_log = CampaignLog.objects.create(
            organization=self.organization,
            campaign=self.campaign,
            recipient_email="first@example.com",
            status=CampaignLog.Status.SENT,
        )
        self.second_log = CampaignLog.objects.create(
            organization=self.organization,
            campaign=self.campaign,
            recipient_email="second@example.com",
            status=CampaignLog.Status.SENT,
        )

    def test_rewrites_web_links_but_not_unsubscribe_or_non_web_links(self):
        html = (
            '<a href="https://example.com/product">Product</a>'
            '<a href="https://example.com/unsubscribe">Unsubscribe</a>'
            '<a href="mailto:help@example.com">Help</a>'
        )

        tracked = rewrite_tracked_links(html, self.first_log.pk)

        self.assertIn("https://mail.example.com/api/track/click/", tracked)
        self.assertIn('href="https://example.com/unsubscribe"', tracked)
        self.assertIn('href="mailto:help@example.com"', tracked)

    def test_tracking_tokens_do_not_expose_internal_payload(self):
        click_token = make_click_token(self.first_log.pk, "https://example.com/private-destination")
        unsubscribe_token = make_unsubscribe_token(self.first_log.pk)
        self.assertNotIn("private-destination", click_token)
        self.assertNotIn("log_id", click_token)
        self.assertNotIn("log_id", unsubscribe_token)

    def test_public_redirect_records_every_click(self):
        destination = "https://example.com/product?offer=summer"
        token = make_click_token(self.first_log.pk, destination)
        url = reverse("campaign-click", kwargs={"token": token})

        first_response = self.client.get(url, HTTP_USER_AGENT="Test browser", REMOTE_ADDR="192.0.2.10")
        second_response = self.client.get(url, HTTP_USER_AGENT="Test browser", REMOTE_ADDR="192.0.2.10")

        self.assertRedirects(first_response, destination, fetch_redirect_response=False)
        self.assertRedirects(second_response, destination, fetch_redirect_response=False)
        self.assertEqual(CampaignClick.objects.filter(campaign_log=self.first_log).count(), 2)
        click = CampaignClick.objects.filter(campaign_log=self.first_log).first()
        self.assertEqual(click.destination_url, destination)
        self.assertEqual(len(click.ip_hash), 64)

    def test_tampered_tracking_token_is_rejected(self):
        token = make_click_token(self.first_log.pk, "https://example.com/product")
        response = self.client.get(reverse("campaign-click", kwargs={"token": f"{token}tampered"}))
        self.assertEqual(response.status_code, 404)
        self.assertEqual(CampaignClick.objects.count(), 0)

    def test_signed_non_web_destination_is_rejected(self):
        token = make_click_token(self.first_log.pk, "javascript:alert(1)")
        response = self.client.get(reverse("campaign-click", kwargs={"token": token}))
        self.assertEqual(response.status_code, 404)
        self.assertEqual(CampaignClick.objects.count(), 0)

    def test_report_uses_unique_recipient_click_rate(self):
        CampaignClick.objects.create(campaign_log=self.first_log, destination_url="https://example.com/one")
        CampaignClick.objects.create(campaign_log=self.first_log, destination_url="https://example.com/two")

        report = campaign_report_detail(self.campaign.pk, self.organization)

        self.assertEqual(report["summary"]["click_count"], 2)
        self.assertEqual(report["summary"]["unique_click_count"], 1)
        self.assertEqual(report["summary"]["click_rate"], 50.0)

    def test_footer_contains_web_unsubscribe_link_not_mailto(self):
        html = append_unsubscribe_footer("<p>Campaign</p>", self.first_log.pk, "You received this campaign.")
        self.assertIn("https://mail.example.com/api/unsubscribe/", html)
        self.assertIn("data-no-track", html)
        self.assertNotIn("mailto:", html)

    def test_get_only_confirms_and_post_unsubscribes_across_organization(self):
        first_list = RecipientList.objects.create(organization=self.organization, list_name="First")
        second_list = RecipientList.objects.create(organization=self.organization, list_name="Second")
        first = Recipient.objects.create(
            organization=self.organization,
            recipient_list=first_list,
            email=self.first_log.recipient_email,
        )
        second = Recipient.objects.create(
            organization=self.organization,
            recipient_list=second_list,
            email=self.first_log.recipient_email,
        )
        other_organization = Organization.objects.create(name="Other Organization")
        other_list = RecipientList.objects.create(organization=other_organization, list_name="Other")
        other = Recipient.objects.create(
            organization=other_organization,
            recipient_list=other_list,
            email=self.first_log.recipient_email,
        )
        pending_campaign = Campaign.objects.create(
            organization=self.organization,
            name="Pending campaign",
            status=Campaign.Status.QUEUED,
        )
        pending_log = CampaignLog.objects.create(
            organization=self.organization,
            campaign=pending_campaign,
            recipient=first,
            recipient_email=self.first_log.recipient_email,
            status=CampaignLog.Status.PENDING,
        )
        token = make_unsubscribe_token(self.first_log.pk)
        url = reverse("campaign-unsubscribe", kwargs={"token": token})

        confirmation = self.client.get(url)
        first.refresh_from_db()
        self.assertEqual(confirmation.status_code, 200)
        self.assertContains(confirmation, "Confirm")
        self.assertNotContains(confirmation, self.first_log.recipient_email)
        self.assertEqual(first.status, Recipient.Status.ACTIVE)

        response = self.client.post(url, {"List-Unsubscribe": "One-Click"})
        first.refresh_from_db()
        second.refresh_from_db()
        other.refresh_from_db()
        pending_log.refresh_from_db()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(first.status, Recipient.Status.UNSUBSCRIBED)
        self.assertEqual(second.status, Recipient.Status.UNSUBSCRIBED)
        self.assertEqual(other.status, Recipient.Status.ACTIVE)
        self.assertEqual(pending_log.status, CampaignLog.Status.SKIPPED)
        self.assertEqual(CampaignUnsubscribe.objects.get(campaign_log=self.first_log).affected_recipients, 2)

        repeat = self.client.post(url, {"List-Unsubscribe": "One-Click"})
        self.assertEqual(repeat.status_code, 200)
        self.assertEqual(CampaignUnsubscribe.objects.filter(campaign_log=self.first_log).count(), 1)
