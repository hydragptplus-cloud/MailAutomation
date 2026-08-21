<?php
declare(strict_types=1);

require __DIR__ . '/../mailflow-config.php';

header('Content-Type: application/json; charset=utf-8');

function respond(int $status, array $payload): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['detail' => 'Method not allowed.']);
}

$rawBody = file_get_contents('php://input') ?: '';
$payload = json_decode($rawBody, true);
if (!is_array($payload)) {
    respond(400, ['detail' => 'Invalid JSON payload.']);
}

$email = strtolower(trim((string)($payload['email'] ?? '')));
$code = trim((string)($payload['code'] ?? ''));
$subject = trim((string)($payload['subject'] ?? ''));
$message = (string)($payload['body'] ?? '');
$html = (string)($payload['html'] ?? '');
$senderProvided = array_key_exists('sender', $payload);
$sender = strtolower(trim((string)($payload['sender'] ?? 'billing')));
$timestamp = (string)($payload['timestamp'] ?? '');
$signature = (string)($_SERVER['HTTP_X_MAIL_FLOW_SIGNATURE'] ?? '');
$headerTimestamp = (string)($_SERVER['HTTP_X_MAIL_FLOW_TIMESTAMP'] ?? '');

if ($timestamp === '' || $timestamp !== $headerTimestamp || abs(time() - (int)$timestamp) > MAILFLOW_MAX_CLOCK_SKEW_SECONDS) {
    respond(401, ['detail' => 'Expired request.']);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(400, ['detail' => 'Invalid email address.']);
}

if (!in_array($sender, ['billing', 'general'], true)) {
    respond(400, ['detail' => 'Invalid sender route.']);
}

if ($code !== '') {
    if (!preg_match('/^\d{6}$/', $code)) {
        respond(400, ['detail' => 'Invalid OTP code.']);
    }
    $signedData = [
        'code' => $code,
        'email' => $email,
        'timestamp' => $timestamp,
    ];
    $subject = 'Verify your Mail Flow checkout';
    $message = "Your Mail Flow checkout code is {$code}. It expires in 10 minutes.";
    $html = '';
} else {
    if ($subject === '' || $message === '') {
        respond(400, ['detail' => 'Email subject and body are required.']);
    }
    if (strlen($subject) > 180 || strlen($message) > 20000 || strlen($html) > 50000) {
        respond(400, ['detail' => 'Email payload is too large.']);
    }
    $signedData = [
        'body' => $message,
        'email' => $email,
    ];
    if ($html !== '') {
        $signedData['html'] = $html;
    }
    if ($senderProvided) {
        $signedData['sender'] = $sender;
    }
    $signedData['subject'] = $subject;
    $signedData['timestamp'] = $timestamp;
}

ksort($signedData);
$signedPayload = json_encode($signedData, JSON_UNESCAPED_SLASHES);

$expectedSignature = hash_hmac('sha256', $signedPayload, MAILFLOW_RELAY_SECRET);
if ($signature === '' || !hash_equals($expectedSignature, $signature)) {
    respond(401, ['detail' => 'Invalid signature.']);
}

function smtp_read($socket): string
{
    $response = '';
    while (($line = fgets($socket, 515)) !== false) {
        $response .= $line;
        if (strlen($line) >= 4 && $line[3] === ' ') {
            break;
        }
    }
    return $response;
}

function smtp_command($socket, string $command, array $expectedCodes): string
{
    fwrite($socket, $command . "\r\n");
    $response = smtp_read($socket);
    $code = (int)substr($response, 0, 3);
    if (!in_array($code, $expectedCodes, true)) {
        throw new RuntimeException('SMTP command failed: ' . trim($response));
    }
    return $response;
}

function mailflow_sender_config(string $sender): array
{
    if ($sender === 'general') {
        return [
            'from_name' => defined('MAILFLOW_GENERAL_FROM_NAME') ? MAILFLOW_GENERAL_FROM_NAME : 'Mail Flow',
            'from_email' => defined('MAILFLOW_GENERAL_FROM_EMAIL') ? MAILFLOW_GENERAL_FROM_EMAIL : 'MailFlow@annomous.com',
            'smtp_user' => defined('MAILFLOW_GENERAL_SMTP_USER') ? MAILFLOW_GENERAL_SMTP_USER : MAILFLOW_SMTP_USER,
            'smtp_password' => defined('MAILFLOW_GENERAL_SMTP_PASSWORD') ? MAILFLOW_GENERAL_SMTP_PASSWORD : MAILFLOW_SMTP_PASSWORD,
        ];
    }
    return [
        'from_name' => defined('MAILFLOW_BILLING_FROM_NAME') ? MAILFLOW_BILLING_FROM_NAME : MAILFLOW_FROM_NAME,
        'from_email' => defined('MAILFLOW_BILLING_FROM_EMAIL') ? MAILFLOW_BILLING_FROM_EMAIL : MAILFLOW_FROM_EMAIL,
        'smtp_user' => defined('MAILFLOW_BILLING_SMTP_USER') ? MAILFLOW_BILLING_SMTP_USER : MAILFLOW_SMTP_USER,
        'smtp_password' => defined('MAILFLOW_BILLING_SMTP_PASSWORD') ? MAILFLOW_BILLING_SMTP_PASSWORD : MAILFLOW_SMTP_PASSWORD,
    ];
}

function smtp_send_mail(string $to, string $subject, string $body, string $html = '', string $sender = 'billing'): void
{
    $senderConfig = mailflow_sender_config($sender);
    $transport = MAILFLOW_SMTP_SSL ? 'ssl://' : '';
    $socket = fsockopen($transport . MAILFLOW_SMTP_HOST, MAILFLOW_SMTP_PORT, $errno, $errstr, MAILFLOW_SMTP_TIMEOUT_SECONDS);
    if (!$socket) {
        throw new RuntimeException("SMTP connection failed: {$errstr}");
    }
    stream_set_timeout($socket, MAILFLOW_SMTP_TIMEOUT_SECONDS);

    try {
        $greeting = smtp_read($socket);
        if ((int)substr($greeting, 0, 3) !== 220) {
            throw new RuntimeException('SMTP greeting failed: ' . trim($greeting));
        }

        smtp_command($socket, 'EHLO ' . MAILFLOW_SMTP_EHLO_DOMAIN, [250]);
        if (MAILFLOW_SMTP_TLS) {
            smtp_command($socket, 'STARTTLS', [220]);
            if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new RuntimeException('SMTP STARTTLS negotiation failed.');
            }
            smtp_command($socket, 'EHLO ' . MAILFLOW_SMTP_EHLO_DOMAIN, [250]);
        }
        smtp_command($socket, 'AUTH LOGIN', [334]);
        smtp_command($socket, base64_encode($senderConfig['smtp_user']), [334]);
        smtp_command($socket, base64_encode($senderConfig['smtp_password']), [235]);
        smtp_command($socket, 'MAIL FROM:<' . $senderConfig['from_email'] . '>', [250]);
        smtp_command($socket, 'RCPT TO:<' . $to . '>', [250, 251]);
        smtp_command($socket, 'DATA', [354]);

        $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
        if ($html !== '') {
            $boundary = 'mailflow_' . bin2hex(random_bytes(12));
            $headers = [
                'From: ' . $senderConfig['from_name'] . ' <' . $senderConfig['from_email'] . '>',
                'To: <' . $to . '>',
                'Subject: ' . $encodedSubject,
                'MIME-Version: 1.0',
                'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
                'Reply-To: ' . MAILFLOW_REPLY_TO,
            ];
            $data = implode("\r\n", $headers)
                . "\r\n\r\n--{$boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n{$body}"
                . "\r\n\r\n--{$boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n{$html}"
                . "\r\n\r\n--{$boundary}--";
        } else {
            $headers = [
                'From: ' . $senderConfig['from_name'] . ' <' . $senderConfig['from_email'] . '>',
                'To: <' . $to . '>',
                'Subject: ' . $encodedSubject,
                'MIME-Version: 1.0',
                'Content-Type: text/plain; charset=UTF-8',
                'Reply-To: ' . MAILFLOW_REPLY_TO,
            ];
            $data = implode("\r\n", $headers) . "\r\n\r\n" . $body;
        }
        $data = preg_replace('/^\./m', '..', $data);
        fwrite($socket, $data . "\r\n.\r\n");
        $response = smtp_read($socket);
        if ((int)substr($response, 0, 3) !== 250) {
            throw new RuntimeException('SMTP DATA failed: ' . trim($response));
        }
        smtp_command($socket, 'QUIT', [221]);
    } finally {
        fclose($socket);
    }
}

try {
    smtp_send_mail($email, $subject, $message, $html, $sender);
} catch (Throwable $exception) {
    error_log('Mail Flow email relay failed: ' . $exception->getMessage());
    respond(502, ['detail' => 'Email delivery failed.']);
}

respond(202, ['detail' => 'Email accepted.']);
