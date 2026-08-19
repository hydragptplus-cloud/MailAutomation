from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from campaigns.models import Campaign, CampaignLog
from recipients.models import Recipient
from smtp_manager.models import SMTPAccount

def summary_report(params=None, organization=None):
    params = params or {}
    campaign_qs = Campaign.objects.all()
    log_qs = CampaignLog.objects.all()
    recipient_qs = Recipient.objects.all()
    smtp_qs = SMTPAccount.objects.all()
    if organization is not None:
        campaign_qs = campaign_qs.filter(organization=organization)
        log_qs = log_qs.filter(organization=organization)
        recipient_qs = recipient_qs.filter(organization=organization)
        smtp_qs = smtp_qs.filter(organization=organization)

    if params.get("campaign_id"):
        campaign_qs = campaign_qs.filter(id=params["campaign_id"])
        log_qs = log_qs.filter(campaign_id=params["campaign_id"])
    if params.get("smtp_id"):
        campaign_qs = campaign_qs.filter(smtp_id=params["smtp_id"])
        log_qs = log_qs.filter(campaign__smtp_id=params["smtp_id"])

    total_campaigns = campaign_qs.count()
    sent_logs = log_qs.filter(status=CampaignLog.Status.SENT).count()
    failed_logs = log_qs.filter(status=CampaignLog.Status.FAILED).count()
    total_emails_sent = sent_logs + failed_logs
    success_rate = round((sent_logs / total_emails_sent * 100), 1) if total_emails_sent > 0 else 0.0
    active_recipients = recipient_qs.filter(status="active").count()

    # Dynamic Daily Volume Chart Data
    daily_stats = (
        log_qs.annotate(day=TruncDate("created_at"))
        .values("day", "status")
        .annotate(count=Count("id"))
        .order_by("day")
    )
    daily_map = {}
    for entry in daily_stats:
        day_str = entry["day"].strftime("%b %d") if entry["day"] else "Unknown"
        if day_str not in daily_map:
            daily_map[day_str] = {"day": day_str, "sent": 0, "success": 0, "failed": 0}
        if entry["status"] == CampaignLog.Status.SENT:
            daily_map[day_str]["sent"] += entry["count"]
            daily_map[day_str]["success"] += entry["count"]
        elif entry["status"] == CampaignLog.Status.FAILED:
            daily_map[day_str]["sent"] += entry["count"]
            daily_map[day_str]["failed"] += entry["count"]
    daily_volume = list(daily_map.values())

    # Success Ratio Chart Data
    success_ratio = [
        {"name": "Successful", "value": sent_logs, "color": "#10b981"},
        {"name": "Failed / Bounced", "value": failed_logs, "color": "#ef4444"},
    ]

    # Dynamic Campaign Performance Chart Data
    campaign_performance = []
    for c in campaign_qs[:5]:
        c_sent = log_qs.filter(campaign=c, status=CampaignLog.Status.SENT).count()
        c_failed = log_qs.filter(campaign=c, status=CampaignLog.Status.FAILED).count()
        if c_sent > 0 or c_failed > 0:
            campaign_performance.append({
                "name": c.name,
                "sent": c_sent + c_failed,
                "opens": c_sent,
                "clicks": 0,
            })

    # Dynamic SMTP Usage Chart Data
    smtp_usage = []
    for s in smtp_qs:
        s_count = log_qs.filter(campaign__smtp=s).count()
        if s_count > 0:
            smtp_usage.append({"name": s.name, "value": s_count})

    # Dynamic Failure Reasons Chart Data
    failure_reasons_qs = (
        log_qs.filter(status=CampaignLog.Status.FAILED)
        .values("message")
        .annotate(count=Count("id"))
        .order_by("-count")[:5]
    )
    failure_reasons = [
        {"reason": item["message"] or "Delivery Error", "count": item["count"]}
        for item in failure_reasons_qs
    ]

    return {
        "total_campaigns": total_campaigns,
        "total_emails_sent": total_emails_sent,
        "successful_deliveries": sent_logs,
        "failed_deliveries": failed_logs,
        "success_rate": success_rate,
        "active_recipients": active_recipients,
        "charts": {
            "dailyVolume": daily_volume,
            "successRatio": success_ratio,
            "campaignPerformance": campaign_performance,
            "smtpUsage": smtp_usage,
            "failureReasons": failure_reasons,
        },
    }

def campaign_reports_list(params=None, organization=None):
    params = params or {}
    qs = Campaign.objects.all()
    if organization is not None:
        qs = qs.filter(organization=organization)

    if params.get("campaign_id"):
        qs = qs.filter(id=params["campaign_id"])
    if params.get("smtp_id"):
        qs = qs.filter(smtp_id=params["smtp_id"])
    if params.get("status"):
        qs = qs.filter(status=params["status"])

    results = []
    for c in qs:
        sent_c = CampaignLog.objects.filter(campaign=c, status=CampaignLog.Status.SENT).count()
        failed_c = CampaignLog.objects.filter(campaign=c, status=CampaignLog.Status.FAILED).count()
        total_c = c.total_count or (sent_c + failed_c)
        total_attempts = sent_c + failed_c
        rate = round((sent_c / total_attempts * 100), 1) if total_attempts > 0 else 0.0

        results.append({
            "id": c.id,
            "name": c.name,
            "campaign_name": c.name,
            "subject": c.subject,
            "status": c.status,
            "total_recipients": total_c,
            "recipients": total_c,
            "sent": sent_c,
            "sent_count": sent_c,
            "failed": failed_c,
            "failed_count": failed_c,
            "rate": rate,
            "success_rate": rate,
            "created_at": c.created_at,
            "started_at": c.started_at,
            "finished_at": c.finished_at,
        })
    return results

def campaign_report_detail(campaign_id, organization=None):
    try:
        lookup = {"pk": campaign_id}
        if organization is not None:
            lookup["organization"] = organization
        campaign = Campaign.objects.get(**lookup)
    except Campaign.DoesNotExist:
        return None

    sent_c = CampaignLog.objects.filter(campaign=campaign, status=CampaignLog.Status.SENT).count()
    failed_c = CampaignLog.objects.filter(campaign=campaign, status=CampaignLog.Status.FAILED).count()
    pending_c = CampaignLog.objects.filter(campaign=campaign, status=CampaignLog.Status.PENDING).count()
    total_c = campaign.total_count or (sent_c + failed_c + pending_c)
    total_attempts = sent_c + failed_c
    rate = round((sent_c / total_attempts * 100), 1) if total_attempts > 0 else 0.0

    timeline = [
        {"stage": "Campaign Created", "timestamp": campaign.created_at.isoformat() if campaign.created_at else None},
    ]
    if campaign.started_at:
        timeline.append({"stage": "Queue Dispatched", "timestamp": campaign.started_at.isoformat()})
    if campaign.finished_at:
        timeline.append({"stage": "Delivery Completed", "timestamp": campaign.finished_at.isoformat()})

    return {
        "campaign": {
            "id": campaign.id,
            "name": campaign.name,
            "subject": campaign.subject,
            "status": campaign.status,
            "created_at": campaign.created_at,
            "started_at": campaign.started_at,
            "finished_at": campaign.finished_at,
        },
        "summary": {
            "total": total_c,
            "sent": sent_c,
            "failed": failed_c,
            "pending": pending_c,
            "success_rate": rate,
            "open_rate": 0.0,
            "click_rate": 0.0,
        },
        "timeline": timeline,
    }

def delivery_logs_list(params=None, organization=None):
    params = params or {}
    qs = CampaignLog.objects.select_related("campaign").all().order_by("-created_at")
    if organization is not None:
        qs = qs.filter(organization=organization)

    if params.get("search"):
        qs = qs.filter(Q(recipient_email__icontains=params["search"]) | Q(message__icontains=params["search"]))
    if params.get("status"):
        qs = qs.filter(status=params["status"])
    if params.get("campaign_id"):
        qs = qs.filter(campaign_id=params["campaign_id"])

    results = []
    for log in qs[:200]:
        results.append({
            "id": log.id,
            "campaign_id": log.campaign_id,
            "campaign_name": log.campaign.name if log.campaign else "System",
            "recipient_email": log.recipient_email,
            "email": log.recipient_email,
            "status": log.status,
            "message": log.message or ("250 2.0.0 OK" if log.status == CampaignLog.Status.SENT else "Delivery Error"),
            "sent_at": log.sent_time or log.created_at,
            "created_at": log.created_at,
        })
    return results
