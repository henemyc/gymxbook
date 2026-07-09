<?php
// GymXBook - Payment Checkout Page
// Opens in Chrome via window.open() from the PWA
// Receives order_id, fetches payment_session_id from our API,
// then auto-POSTs a form to Cashfree's hosted checkout endpoint
$orderId = $_GET['order_id'] ?? '';
$mode = ($_GET['mode'] ?? 'sandbox') === 'production' ? 'production' : 'sandbox';
if (!$orderId) {
    http_response_code(400);
    echo 'Missing order ID';
    exit;
}

// Fetch payment_session_id from our own backend API
// This avoids passing the long session_id through the URL (which gets corrupted)
$apiUrl = (isset($_SERVER['HTTPS']) ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST']
    . strtok($_SERVER['REQUEST_URI'], '?') // strip query params to get base path
    . 'api.php?action=get_payment_session&order_id=' . urlencode($orderId);

$ch = curl_init($apiUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
$apiResponse = curl_exec($ch);
curl_close($ch);

$apiData = json_decode($apiResponse, true);
$sessionId = $apiData['payment_session_id'] ?? '';
$cfOrderId = $apiData['cf_order_id'] ?? $orderId;

if (!$sessionId) {
    http_response_code(500);
    echo 'Could not fetch payment session. Please go back to the app and try again.';
    exit;
}

// Cashfree hosted checkout endpoint
$checkoutUrl = $mode === 'production'
    ? 'https://api.cashfree.com/pg/view/sessions/checkout'
    : 'https://sandbox.cashfree.com/pg/view/sessions/checkout';
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Redirecting to Payment...</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }

        .box {
            text-align: center;
            padding: 40px;
        }

        .spinner {
            width: 36px;
            height: 36px;
            border: 3px solid #e0e0e0;
            border-top: 3px solid #1B6B4A;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin: 0 auto 16px;
        }

        @keyframes spin {
            to {
                transform: rotate(360deg);
            }
        }

        p {
            color: #888;
            font-size: 14px;
        }
    </style>
</head>

<body>
    <div class="box">
        <div class="spinner"></div>
        <p>Redirecting to payment page...</p>
    </div>
    <form id="cfForm" method="POST" action="<?php echo $checkoutUrl; ?>">
        <input type="hidden" name="payment_session_id" value="<?php echo htmlspecialchars($sessionId, ENT_QUOTES, 'UTF-8'); ?>">
    </form>
    <script>
        document.getElementById('cfForm').submit();
    </script>
</body>

</html>