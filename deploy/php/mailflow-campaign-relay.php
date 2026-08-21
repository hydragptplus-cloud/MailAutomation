<?php
declare(strict_types=1);

require __DIR__ . '/../mailflow-config.php';
header('Content-Type: application/json; charset=utf-8');

const MAX_REQUEST_BYTES = 1048576;
const MAX_TEXT_BYTES = 100000;
const MAX_HTML_BYTES = 500000;

function respond(int $status, array $payload): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function relay_error(
    string $stage,
    string $category,
    string $message,
    ?int $smtpCode = null,
    array $passed = []
): never {
    respond(400, array_merge([
        'ok' => false,
        'dns' => false,
        'connection' => false,
        'tls' => false,
        'auth' => false,
        'stage' => $stage,
        'category' => $category,
        'smtp_code' => $smtpCode,
        'provider_message_id' => null,
        'message' => $message,
    ], $passed));
}

function clean_header(string $value, int $limit): string
{
    return substr(str_replace(["\r", "\n"], '', trim($value)), 0, $limit);
}

function encoded_header(string $value): string
{
    return '=?UTF-8?B?' . base64_encode($value) . '?=';
}

function mailbox(string $email, string $name = ''): string
{
    return $name === '' ? '<' . $email . '>' : encoded_header($name) . ' <' . $email . '>';
}

function valid_public_ip(string $ip): bool
{
    return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false;
}

function resolve_public_host(string $host): string
{
    if ($host === '' || strlen($host) > 253 || !preg_match('/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i', $host)) {
        relay_error('dns', 'dns_failed', 'Invalid SMTP hostname.');
    }
    $records = dns_get_record($host, DNS_A | DNS_AAAA);
    if ($records === false || $records === []) {
        relay_error('dns', 'dns_failed', 'SMTP hostname could not be resolved.');
    }
    $addresses = [];
    foreach ($records as $record) {
        $ip = (string)($record['ip'] ?? $record['ipv6'] ?? '');
        if ($ip !== '') {
            if (!valid_public_ip($ip)) {
                relay_error('dns', 'dns_failed', 'Private or reserved SMTP targets are not allowed.');
            }
            $addresses[] = $ip;
        }
    }
    if ($addresses === []) {
        relay_error('dns', 'dns_failed', 'SMTP hostname has no usable public address.');
    }
    foreach ($addresses as $address) {
        if (filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            return $address;
        }
    }
    return $addresses[0];
}

function smtp_read($socket): array
{
    $response = '';
    while (($line = fgets($socket, 515)) !== false) {
        $response .= $line;
        if (strlen($line) >= 4 && $line[3] === ' ') {
            break;
        }
    }
    return [(int)substr($response, 0, 3), trim($response)];
}

function smtp_command($socket, string $command, array $expected, string $stage, string $category, array $passed): array
{
    if (fwrite($socket, $command . "\r\n") === false) {
        relay_error($stage, $category, 'SMTP connection closed unexpectedly.', null, $passed);
    }
    [$code, $response] = smtp_read($socket);
    if (!in_array($code, $expected, true)) {
        $messages = [
            'auth' => 'SMTP authentication was rejected.',
            'mail_from' => 'The SMTP server rejected the configured From address.',
            'recipient' => 'The SMTP server rejected the campaign recipient.',
            'data' => 'The SMTP server rejected the campaign message.',
            'tls' => 'The SMTP server rejected STARTTLS negotiation.',
        ];
        relay_error($stage, $category, $messages[$stage] ?? 'SMTP command was rejected.', $code ?: null, $passed);
    }
    return [$code, $response];
}

function normalize_crlf(string $value): string
{
    return preg_replace("/\r\n|\r|\n/", "\r\n", $value) ?? $value;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['detail' => 'Method not allowed.']);
}

$rawBody = file_get_contents('php://input') ?: '';
if ($rawBody === '' || strlen($rawBody) > MAX_REQUEST_BYTES) {
    respond(413, ['detail' => 'Campaign relay payload is empty or too large.']);
}

$timestamp = (string)($_SERVER['HTTP_X_MAIL_FLOW_TIMESTAMP'] ?? '');
$signature = (string)($_SERVER['HTTP_X_MAIL_FLOW_SIGNATURE'] ?? '');
if (!defined('MAILFLOW_CAMPAIGN_RELAY_SECRET') || MAILFLOW_CAMPAIGN_RELAY_SECRET === '') {
    respond(503, ['detail' => 'Campaign relay is not configured.']);
}
if ($timestamp === '' || !ctype_digit($timestamp) || abs(time() - (int)$timestamp) > MAILFLOW_MAX_CLOCK_SKEW_SECONDS) {
    respond(401, ['detail' => 'Expired request.']);
}
$expectedSignature = hash_hmac('sha256', $rawBody, MAILFLOW_CAMPAIGN_RELAY_SECRET);
if ($signature === '' || !hash_equals($expectedSignature, $signature)) {
    respond(401, ['detail' => 'Invalid signature.']);
}

$payload = json_decode($rawBody, true);
if (!is_array($payload) || (string)($payload['timestamp'] ?? '') !== $timestamp) {
    respond(400, ['detail' => 'Invalid JSON payload.']);
}
if ((string)($payload['operation'] ?? '') !== 'campaign_send') {
    respond(400, ['detail' => 'Invalid relay operation.']);
}
$requestId = clean_header((string)($payload['request_id'] ?? ''), 128);
if ($requestId === '' || !preg_match('/^[a-zA-Z0-9._:-]+$/', $requestId)) {
    respond(400, ['detail' => 'A valid request identifier is required.']);
}

$smtp = $payload['smtp'] ?? null;
$message = $payload['message'] ?? null;
if (!is_array($smtp) || !is_array($message)) {
    respond(400, ['detail' => 'SMTP configuration and campaign message are required.']);
}

$host = strtolower(trim((string)($smtp['host'] ?? '')));
$port = (int)($smtp['port'] ?? 0);
$encryption = strtolower(trim((string)($smtp['encryption'] ?? 'tls')));
$username = clean_header((string)($smtp['username'] ?? ''), 255);
$password = (string)($smtp['password'] ?? '');
$fromEmail = strtolower(clean_header((string)($smtp['from_email'] ?? ''), 254));
$fromName = clean_header((string)($smtp['from_name'] ?? 'Mail Flow'), 120);
$replyTo = strtolower(clean_header((string)($smtp['reply_to'] ?? ''), 254));

$recipient = strtolower(clean_header((string)($message['recipient'] ?? ''), 254));
$recipientName = clean_header((string)($message['recipient_name'] ?? ''), 120);
$subject = clean_header((string)($message['subject'] ?? ''), 255);
$text = (string)($message['text'] ?? '');
$html = (string)($message['html'] ?? '');
$messageId = trim(clean_header((string)($message['message_id'] ?? ''), 255), '<>');

if (!in_array($port, [25, 465, 587, 2525], true) || !in_array($encryption, ['none', 'tls', 'ssl'], true)) {
    respond(400, ['detail' => 'Unsupported SMTP port or encryption mode.']);
}
if ($username === '' || $password === '' || !filter_var($fromEmail, FILTER_VALIDATE_EMAIL)) {
    respond(400, ['detail' => 'SMTP username, password and valid From address are required.']);
}
if ($replyTo !== '' && !filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
    respond(400, ['detail' => 'Reply-To address is invalid.']);
}
if (!filter_var($recipient, FILTER_VALIDATE_EMAIL) || $subject === '' || $text === '' || $html === '') {
    respond(400, ['detail' => 'Recipient, subject, plain text and HTML content are required.']);
}
if (strlen($text) > MAX_TEXT_BYTES || strlen($html) > MAX_HTML_BYTES) {
    respond(413, ['detail' => 'Campaign message content is too large.']);
}
if ($messageId === '' || !preg_match('/^[a-zA-Z0-9.!#$%&\'*+\/=?^_`{|}~-]+@[a-zA-Z0-9.-]+$/', $messageId)) {
    respond(400, ['detail' => 'A valid stable Message-ID is required.']);
}

$resolvedIp = resolve_public_host($host);
$passed = ['dns' => true];
$transport = ($encryption === 'ssl' || $port === 465) ? 'ssl://' : '';
$context = stream_context_create([
    'ssl' => [
        'verify_peer' => true,
        'verify_peer_name' => true,
        'peer_name' => $host,
        'SNI_enabled' => true,
    ],
]);
$target = $transport . (filter_var($resolvedIp, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) ? $resolvedIp : '[' . $resolvedIp . ']');
$socket = @stream_socket_client($target . ':' . $port, $errno, $errstr, 20, STREAM_CLIENT_CONNECT, $context);
if (!$socket) {
    relay_error('connect', 'connection_failed', 'Could not connect to the SMTP server.', null, $passed);
}
$passed['connection'] = true;
stream_set_timeout($socket, 20);

try {
    [$greetingCode] = smtp_read($socket);
    if ($greetingCode !== 220) {
        relay_error('connect', 'connection_failed', 'SMTP server did not provide a valid greeting.', $greetingCode ?: null, $passed);
    }
    smtp_command($socket, 'EHLO mailflow-campaign-relay', [250], 'connect', 'connection_failed', $passed);
    if ($encryption === 'tls') {
        smtp_command($socket, 'STARTTLS', [220], 'tls', 'tls_failed', $passed);
        if (!@stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            relay_error('tls', 'tls_failed', 'SMTP TLS negotiation failed.', null, $passed);
        }
        smtp_command($socket, 'EHLO mailflow-campaign-relay', [250], 'tls', 'tls_failed', $passed);
    }
    $passed['tls'] = true;
    smtp_command($socket, 'AUTH LOGIN', [334], 'auth', 'authentication_failed', $passed);
    smtp_command($socket, base64_encode($username), [334], 'auth', 'authentication_failed', $passed);
    smtp_command($socket, base64_encode($password), [235], 'auth', 'authentication_failed', $passed);
    $passed['auth'] = true;

    smtp_command($socket, 'MAIL FROM:<' . $fromEmail . '>', [250], 'mail_from', 'sender_rejected', $passed);
    smtp_command($socket, 'RCPT TO:<' . $recipient . '>', [250, 251], 'recipient', 'recipient_rejected', $passed);
    smtp_command($socket, 'DATA', [354], 'data', 'message_rejected', $passed);

    $boundary = 'mailflow-' . substr(hash('sha256', $requestId), 0, 40);
    $headers = [
        'Date: ' . gmdate('D, d M Y H:i:s O'),
        'From: ' . mailbox($fromEmail, $fromName),
        'To: ' . mailbox($recipient, $recipientName),
        'Subject: ' . encoded_header($subject),
        'Message-ID: <' . $messageId . '>',
        'MIME-Version: 1.0',
        'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
    ];
    if ($replyTo !== '') {
        $headers[] = 'Reply-To: <' . $replyTo . '>';
    }
    $parts = [
        '--' . $boundary,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: quoted-printable',
        '',
        quoted_printable_encode(normalize_crlf($text)),
        '--' . $boundary,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: quoted-printable',
        '',
        quoted_printable_encode(normalize_crlf($html)),
        '--' . $boundary . '--',
    ];
    $data = implode("\r\n", $headers) . "\r\n\r\n" . implode("\r\n", $parts);
    $data = preg_replace('/^\./m', '..', $data) ?? $data;
    if (fwrite($socket, $data . "\r\n.\r\n") === false) {
        relay_error('data', 'message_rejected', 'SMTP connection closed while sending the campaign message.', null, $passed);
    }
    [$dataCode] = smtp_read($socket);
    if ($dataCode !== 250) {
        relay_error('data', 'message_rejected', 'The SMTP server rejected the campaign message.', $dataCode ?: null, $passed);
    }
    @fwrite($socket, "QUIT\r\n");
    respond(200, array_merge($passed, [
        'ok' => true,
        'stage' => 'complete',
        'category' => 'accepted',
        'smtp_code' => 250,
        'provider_message_id' => '<' . $messageId . '>',
        'message' => 'SMTP server accepted the campaign email for delivery.',
    ]));
} finally {
    if (is_resource($socket)) {
        fclose($socket);
    }
}
