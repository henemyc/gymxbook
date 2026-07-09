<?php
// GymXBook - Payment Return Page
// Shown in Chrome after Cashfree payment is completed
// Cashfree redirects here with cf_oid parameter
$cfOid = $_GET['cf_oid'] ?? '';
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GymXBook - Payment Done</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1B6B4A 0%, #2E8B57 100%);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 24px;
        }

        .card {
            background: #fff;
            border-radius: 24px;
            padding: 40px 28px;
            text-align: center;
            max-width: 340px;
            width: 100%;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
        }

        .icon-wrap {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            background: #E8F5E9;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 20px;
            font-size: 40px;
        }

        h2 {
            font-size: 20px;
            font-weight: 700;
            color: #1a1a1a;
            margin-bottom: 8px;
        }

        p {
            font-size: 14px;
            color: #666;
            line-height: 1.6;
            margin-bottom: 12px;
        }

        .hint-box {
            background: #E8F5E9;
            border-radius: 12px;
            padding: 16px;
            margin-top: 16px;
        }

        .hint-box p {
            color: #1B6B4A;
            font-weight: 500;
            font-size: 14px;
            margin: 0;
        }

        .hint-box span {
            font-size: 20px;
            vertical-align: middle;
        }
    </style>
</head>

<body>
    <div class="card">
        <div class="icon-wrap">✅</div>
        <h2>Payment Complete!</h2>
        <p>Your payment has been processed. The result will reflect in your GymXBook app automatically.</p>
        <div class="hint-box">
            <p><span>📱</span> Close this tab and open your <strong>GymXBook</strong> app</p>
        </div>
    </div>
</body>

</html>