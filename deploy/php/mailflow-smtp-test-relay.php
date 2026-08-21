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

function result_error(string $stage, string $category, string $message, ?int $smtpCode = null, array $passed = []): never
{
    respond(400, array_merge([
        'ok' => false,
        'dns' => false,
        'connection' => false,
        'tls' => false,
        'auth' => false,
        'stage' => $stage,
        'category' => $category,
        'smtp_code' => $smtpCode,
        'message' => $message,
    ], $passed));
}

function valid_public_ip(string $ip): bool
{
    return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false;
}

function resolve_public_host(string $host): string
{
    if ($host === '' || strlen($host) > 253 || !preg_match('/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i', $host)) {
        result_error('dns', 'dns_failed', 'Invalid SMTP hostname.');
    }
    $records = dns_get_record($host, DNS_A | DNS_AAAA);
    if ($records === false || $records === []) {
        result_error('dns', 'dns_failed', 'SMTP hostname could not be resolved.');
    }
    $addresses = [];
    foreach ($records as $record) {
        $ip = (string)($record['ip'] ?? $record['ipv6'] ?? '');
        if ($ip !== '') {
            if (!valid_public_ip($ip)) {
                result_error('dns', 'dns_failed', 'Private or reserved SMTP targets are not allowed.');
            }
            $addresses[] = $ip;
        }
    }
    if ($addresses === []) {
        result_error('dns', 'dns_failed', 'SMTP hostname has no usable public address.');
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
        result_error($stage, $category, 'SMTP connection closed unexpectedly.', null, $passed);
    }
    [$code, $response] = smtp_read($socket);
    if (!in_array($code, $expected, true)) {
        $messages = [
            'auth' => 'SMTP authentication was rejected. Check the username and password.',
            'mail_from' => 'The SMTP server rejected the configured From address.',
            'recipient' => 'The SMTP server rejected the recipient address.',
            'data' => 'The SMTP server rejected the test message.',
            'tls' => 'The SMTP server rejected STARTTLS negotiation.',
        ];
        result_error($stage, $category, $messages[$stage] ?? 'SMTP command was rejected.', $code ?: null, $passed);
    }
    return [$code, $response];
}

function clean_header(string $value, int $limit): string
{
    return substr(str_replace(["\r", "\n"], '', trim($value)), 0, $limit);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['detail' => 'Method not allowed.']);
}

$rawBody = file_get_contents('php://input') ?: '';
$timestamp = (string)($_SERVER['HTTP_X_MAIL_FLOW_TIMESTAMP'] ?? '');
$signature = (string)($_SERVER['HTTP_X_MAIL_FLOW_SIGNATURE'] ?? '');
$secret = defined('MAILFLOW_SMTP_TEST_RELAY_SECRET') ? MAILFLOW_SMTP_TEST_RELAY_SECRET : MAILFLOW_RELAY_SECRET;
if ($timestamp === '' || abs(time() - (int)$timestamp) > MAILFLOW_MAX_CLOCK_SKEW_SECONDS) {
    respond(401, ['detail' => 'Expired request.']);
}
$expected = hash_hmac('sha256', $rawBody, $secret);
if ($signature === '' || !hash_equals($expected, $signature)) {
    respond(401, ['detail' => 'Invalid signature.']);
}

$payload = json_decode($rawBody, true);
if (!is_array($payload) || (string)($payload['timestamp'] ?? '') !== $timestamp) {
    respond(400, ['detail' => 'Invalid JSON payload.']);
}
$operation = (string)($payload['operation'] ?? '');
if (!in_array($operation, ['connection_test', 'send_test'], true)) {
    respond(400, ['detail' => 'Invalid relay operation.']);
}
$smtp = $payload['smtp'] ?? null;
if (!is_array($smtp)) {
    respond(400, ['detail' => 'SMTP configuration is required.']);
}

$host = strtolower(trim((string)($smtp['host'] ?? '')));
$port = (int)($smtp['port'] ?? 0);
$encryption = strtolower(trim((string)($smtp['encryption'] ?? 'tls')));
$username = clean_header((string)($smtp['username'] ?? ''), 255);
$password = (string)($smtp['password'] ?? '');
$fromEmail = strtolower(clean_header((string)($smtp['from_email'] ?? ''), 254));
$fromName = clean_header((string)($smtp['from_name'] ?? 'Mail Flow'), 120);
$replyTo = strtolower(clean_header((string)($smtp['reply_to'] ?? ''), 254));

if (!in_array($port, [25, 465, 587, 2525], true) || !in_array($encryption, ['none', 'tls', 'ssl'], true)) {
    respond(400, ['detail' => 'Unsupported SMTP port or encryption mode.']);
}
if ($username === '' || $password === '' || !filter_var($fromEmail, FILTER_VALIDATE_EMAIL)) {
    respond(400, ['detail' => 'SMTP username, password and valid From address are required.']);
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
$target = $transport . '[' . $resolvedIp . ']';
if (filter_var($resolvedIp, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
    $target = $transport . $resolvedIp;
}
$socket = @stream_socket_client($target . ':' . $port, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $context);
if (!$socket) {
    result_error('connect', 'connection_failed', 'Could not connect to the SMTP server.', null, $passed);
}
$passed['connection'] = true;
stream_set_timeout($socket, 15);

try {
    [$greetingCode] = smtp_read($socket);
    if ($greetingCode !== 220) {
        result_error('connect', 'connection_failed', 'SMTP server did not provide a valid greeting.', $greetingCode ?: null, $passed);
    }
    smtp_command($socket, 'EHLO mailflow-relay', [250], 'connect', 'connection_failed', $passed);
    if ($encryption === 'tls') {
        smtp_command($socket, 'STARTTLS', [220], 'tls', 'tls_failed', $passed);
        if (!@stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            result_error('tls', 'tls_failed', 'SMTP TLS negotiation failed.', null, $passed);
        }
        smtp_command($socket, 'EHLO mailflow-relay', [250], 'tls', 'tls_failed', $passed);
    }
    $passed['tls'] = true;
    smtp_command($socket, 'AUTH LOGIN', [334], 'auth', 'authentication_failed', $passed);
    smtp_command($socket, base64_encode($username), [334], 'auth', 'authentication_failed', $passed);
    smtp_command($socket, base64_encode($password), [235], 'auth', 'authentication_failed', $passed);
    $passed['auth'] = true;

    if ($operation === 'connection_test') {
        @fwrite($socket, "QUIT\r\n");
        respond(200, array_merge($passed, [
            'ok' => true,
            'stage' => 'complete',
            'category' => 'accepted',
            'smtp_code' => 235,
            'message' => 'SMTP connection and authentication succeeded through the relay.',
        ]));
    }

    $message = $payload['message'] ?? null;
    $recipient = is_array($message) ? strtolower(clean_header((string)($message['recipient'] ?? ''), 254)) : '';
    $subject = is_array($message) ? clean_header((string)($message['subject'] ?? ''), 180) : '';
    $body = is_array($message) ? substr((string)($message['body'] ?? ''), 0, 20000) : '';
    if (!filter_var($recipient, FILTER_VALIDATE_EMAIL) || $subject === '' || $body === '') {
        respond(400, ['detail' => 'A valid recipient, subject and body are required.']);
    }

    smtp_command($socket, 'MAIL FROM:<' . $fromEmail . '>', [250], 'mail_from', 'sender_rejected', $passed);
    smtp_command($socket, 'RCPT TO:<' . $recipient . '>', [250, 251], 'recipient', 'recipient_rejected', $passed);
    smtp_command($socket, 'DATA', [354], 'data', 'message_rejected', $passed);
    $headers = [
        'From: ' . $fromName . ' <' . $fromEmail . '>',
        'To: <' . $recipient . '>',
        'Subject: =?UTF-8?B?' . base64_encode($subject) . '?=',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
    ];
    if ($replyTo !== '' && filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
        $headers[] = 'Reply-To: ' . $replyTo;
    }
    $data = implode("\r\n", $headers) . "\r\n\r\n" . $body;
    $data = preg_replace('/^\./m', '..', $data) ?? $data;
    fwrite($socket, $data . "\r\n.\r\n");
    [$dataCode] = smtp_read($socket);
    if ($dataCode !== 250) {
        result_error('data', 'message_rejected', 'The SMTP server rejected the test message.', $dataCode ?: null, $passed);
    }
    @fwrite($socket, "QUIT\r\n");
    respond(200, array_merge($passed, [
        'ok' => true,
        'stage' => 'complete',
        'category' => 'accepted',
        'smtp_code' => 250,
        'message' => 'SMTP server accepted the test email for delivery.',
    ]));
} finally {
    if (is_resource($socket)) {
        fclose($socket);
    }
}
