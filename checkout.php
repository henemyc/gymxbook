<?php

/**
 * Cashfree Hosted Checkout Redirect
 * 
 * Receives order_id → looks up DB → creates Cashfree order (if needed) → 
 * renders auto-submitting form with payment_session_id → redirects to Cashfree checkout.
 * 
 * This avoids payment_session_id corruption in WebView URLs because
 * the session ID is embedded in a POST form, never passed via URL.
 */
require_once 'config.php';
error_reporting(0);
ini_set('display_errors', '0');
session_write_close(); // Release session lock so PWA API calls aren't blocked

$orderId = $_GET['order_id'] ?? '';
if (!$orderId) {
    echo '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Error</title></head><body style="font-family:sans-serif;text-align:center;padding:40px"><h1 style="color:#c62828">Invalid payment request</h1></body></html>';
    exit;
}

$pdo = getPDO();
$stmt = $pdo->prepare("SELECT * FROM subscription_orders WHERE order_id = ?");
$stmt->execute([$orderId]);
$order = $stmt->fetch();

if (!$order) {
    echo '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Error</title></head><body style="font-family:sans-serif;text-align:center;padding:40px"><h1 style="color:#c62828">Order not found</h1></body></html>';
    exit;
}

if ($order['status'] === 'PAID') {
    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'];
    $basePath = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/');
    header('Location: ' . $protocol . '://' . $host . $basePath . '/payment-done.html');
    exit;
}

// Cashfree config — KEEP IN SYNC with api.php line 12-15
// When switching to production: change CASHFREE_SANDBOX to false and update APP_ID + SECRET_KEY
define('CASHFREE_APP_ID', 'TEST11110086697be295b81eb8db7ef068001111');
define('CASHFREE_SECRET_KEY', 'cfsk_ma_test_3185487ef4ace00eb1d1f0d1f43baeba_9c490924');
define('CASHFREE_SANDBOX', true);
define('CASHFREE_API_VERSION', '2023-08-01');

$baseUrl = CASHFREE_SANDBOX ? 'https://sandbox.cashfree.com' : 'https://api.cashfree.com';

// Check if we already have a payment_session_id stored
// We store it in the `cf_order_id` column
$paymentSessionId = $order['cf_order_id'] ?? '';

// If it's a payment_session_id (starts with "session_"), use it directly
// Otherwise, it's from the old Payment Links flow — we need to create a new Cashfree order
if (!$paymentSessionId || strpos($paymentSessionId, 'session_') !== 0) {
    // Create order using Cashfree Orders API
    $planId = $order['plan_id'];
    $planStmt = $pdo->prepare("SELECT * FROM subscriptions WHERE id = ?");
    $planStmt->execute([$planId]);
    $plan = $planStmt->fetch();
    $amount = $order['amount'];
    $orderType = $order['order_type'];
    $pid = $order['parent_id'];

    $adminStmt = $pdo->prepare("SELECT name, email, phone_number FROM users WHERE id = ?");
    $adminStmt->execute([$pid]);
    $admin = $adminStmt->fetch();
    $customerPhone = preg_replace('/[^0-9]/', '', $admin['phone_number'] ?? '');
    if (strlen($customerPhone) < 10) $customerPhone = '9999999999';

    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'];
    $basePath = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/');
    $returnUrl = $protocol . '://' . $host . $basePath . '/payment-done.html?order_id=' . urlencode($orderId);

    $cfOrderData = [
        'order_id' => $orderId,
        'order_amount' => (float)$amount,
        'order_currency' => 'INR',
        'customer_details' => [
            'customer_id' => 'gym_' . $pid,
            'customer_name' => $admin['name'] ?? 'Gym Owner',
            'customer_email' => $admin['email'] ?? 'owner@gymxbook.com',
            'customer_phone' => $customerPhone
        ],
        'order_meta' => [
            'return_url' => $returnUrl
        ],
        'order_note' => 'GymXBook ' . ucfirst($orderType) . ' - ' . ($plan['title'] ?? '')
    ];

    $ch = curl_init($baseUrl . '/pg/orders');
    $headers = [
        'Content-Type: application/json',
        'x-client-id: ' . CASHFREE_APP_ID,
        'x-client-secret: ' . CASHFREE_SECRET_KEY,
        'x-api-version: ' . CASHFREE_API_VERSION
    ];
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($cfOrderData));
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $result = json_decode($response, true);

    if (($httpCode === 200 || $httpCode === 201) && isset($result['payment_session_id'])) {
        $paymentSessionId = $result['payment_session_id'];
        // Store session ID in DB
        $pdo->prepare("UPDATE subscription_orders SET cf_order_id = ? WHERE order_id = ?")->execute([$paymentSessionId, $orderId]);
    } else {
        $errMsg = $result['message'] ?? 'Failed to create payment order';
        echo '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Error</title></head><body style="font-family:sans-serif;text-align:center;padding:40px"><h1 style="color:#c62828">Payment Error</h1><p style="color:#666">' . htmlspecialchars($errMsg) . '</p><p style="color:#999;margin-top:12px">Please go back to GymXBook app and try again.</p></body></html>';
        exit;
    }
}

// Render auto-submitting form to Cashfree hosted checkout
$checkoutUrl = CASHFREE_SANDBOX
    ? 'https://sandbox.cashfree.com/pg/view/sessions/checkout'
    : 'https://api.cashfree.com/pg/view/sessions/checkout';
?>
<!DOCTYPE html>
<html>

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GymXBook - Payment</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 24px
        }

        .card {
            background: white;
            border-radius: 20px;
            padding: 40px 32px;
            text-align: center;
            max-width: 360px;
            width: 100%;
            box-shadow: 0 2px 12px rgba(0, 0, 0, .08)
        }

        .spinner {
            width: 36px;
            height: 36px;
            border: 3px solid #e0e0e0;
            border-top: 3px solid #1976D2;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px
        }

        @keyframes spin {
            0% {
                transform: rotate(0)
            }

            100% {
                transform: rotate(360deg)
            }
        }

        h1 {
            font-size: 18px;
            font-weight: 600;
            color: #333;
            margin-bottom: 8px
        }

        p {
            font-size: 13px;
            color: #999
        }
    </style>
</head>

<body>
    <div class="card">
        <div class="spinner"></div>
        <h1>Redirecting to payment...</h1>
        <p>Please wait, do not close this page</p>
    </div>
    <form id="redirectForm" method="POST" action="<?= htmlspecialchars($checkoutUrl) ?>">
        <input type="hidden" name="payment_session_id" value="<?= htmlspecialchars($paymentSessionId) ?>" />
    </form>
    <script>
        window.onload = function() {
            document.getElementById('redirectForm').submit();
        };
    </script>
</body>

</html>