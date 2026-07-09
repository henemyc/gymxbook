<?php

/**
 * GymXBook Mail Helper
 * Reads SMTP credentials from the settings table (per-tenant)
 * Sends professional HTML emails via PHPMailer
 */

require_once __DIR__ . '/phpmailer/PHPMailer.php';
require_once __DIR__ . '/phpmailer/SMTP.php';
require_once __DIR__ . '/phpmailer/Exception.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;
use PHPMailer\PHPMailer\Exception as PHPMailerException;

class MailHelper
{
    private $pdo;
    private $parentId;
    private $smtpConfig = null;

    public function __construct($pdo, $parentId)
    {
        $this->pdo = $pdo;
        $this->parentId = $parentId;
        $this->loadSmtpConfig();
    }

    private function loadSmtpConfig()
    {
        // Always read SMTP from superadmin (parent_id = 1) — global config
        // DB column names: SERVER_HOST, SERVER_PORT, SERVER_USERNAME, SERVER_PASSWORD, SERVER_DRIVER, FROM_EMAIL, FROM_NAME
        $stmt = $this->pdo->prepare("SELECT name, value FROM settings WHERE parent_id = 1 AND name IN ('SERVER_HOST','SERVER_PORT','SERVER_USERNAME','SERVER_PASSWORD','SERVER_DRIVER','FROM_EMAIL','FROM_NAME')");
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $config = [];
        foreach ($rows as $row) {
            $config[$row['name']] = $row['value'];
        }

        if (!empty($config['SERVER_HOST']) && !empty($config['SERVER_USERNAME']) && !empty($config['SERVER_PASSWORD'])) {
            $this->smtpConfig = [
                'host'       => $config['SERVER_HOST'],
                'port'       => intval($config['SERVER_PORT'] ?? 587),
                'username'   => $config['SERVER_USERNAME'],
                'password'   => $config['SERVER_PASSWORD'],
                'encryption' => strtolower($config['SERVER_DRIVER'] ?? 'tls'),
                'from_email' => $config['FROM_EMAIL'] ?: $config['SERVER_USERNAME'],
                'from_name'  => $config['FROM_NAME'] ?: 'GymXBook',
            ];
        }
    }

    public function isConfigured()
    {
        return $this->smtpConfig !== null;
    }

    /**
     * Test SMTP connection by actually connecting to the server.
     * Returns ['success' => bool, 'message' => string]
     */
    public function testConnection()
    {
        if (!$this->isConfigured()) {
            return ['success' => false, 'message' => 'SMTP not fully configured. Host, Username, and Password are required.'];
        }
        try {
            $mail = $this->createMailer();
            if (!$mail) {
                return ['success' => false, 'message' => 'Could not create mailer instance.'];
            }
            // Attempt SMTP connect + authenticate
            $mail->smtpConnect();
            $mail->getSMTPInstance()->quit();
            $mail->getSMTPInstance()->close();
            return ['success' => true, 'message' => 'SMTP connection successful! Credentials verified.'];
        } catch (PHPMailerException $e) {
            return ['success' => false, 'message' => 'Connection failed: ' . $e->getMessage()];
        } catch (\Exception $e) {
            return ['success' => false, 'message' => 'Connection failed: ' . $e->getMessage()];
        }
    }

    private function getGymName()
    {
        $stmt = $this->pdo->prepare("SELECT value FROM settings WHERE parent_id = ? AND name = 'gym_name'");
        $stmt->execute([$this->parentId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ? $row['value'] : 'GymXBook';
    }

    private function createMailer()
    {
        if (!$this->smtpConfig) {
            return null;
        }

        $mail = new PHPMailer(true);
        $mail->isSMTP();
        $mail->Host       = $this->smtpConfig['host'];
        $mail->Port       = $this->smtpConfig['port'];
        $mail->SMTPAuth   = true;
        $mail->Username   = $this->smtpConfig['username'];
        $mail->Password   = $this->smtpConfig['password'];

        // Short timeouts so failed SMTP doesn't block the app
        $mail->Timeout    = 5;   // Connection timeout (seconds)
        $mail->SMTPAutoTLS = false; // Don't auto-upgrade if not configured

        if ($this->smtpConfig['encryption'] === 'ssl') {
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
        } else {
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        }

        $mail->setFrom($this->smtpConfig['from_email'], $this->smtpConfig['from_name']);
        $mail->isHTML(true);
        $mail->CharSet = 'UTF-8';

        return $mail;
    }

    private function buildHtmlBody($title, $preheader, $bodyContent, $gymName)
    {
        $year = date('Y');
        $html = '<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>' . htmlspecialchars($title) . '</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:\'Segoe UI\',Roboto,\'Helvetica Neue\',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<div style="display:none;font-size:1px;color:#fefefe;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">' . htmlspecialchars($preheader) . '</div>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f4f5f7;padding:24px 0;">
<tr><td align="center" style="padding:0 16px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
<tr><td style="background:linear-gradient(135deg,#FF6B35,#E8551F);padding:28px 32px;text-align:center;">
<div style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">' . htmlspecialchars($gymName) . '</div>
<div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;font-weight:500;">Powered by GymXBook</div>
</td></tr>
<tr><td style="padding:28px 32px 8px;">
<h1 style="margin:0;font-size:22px;font-weight:700;color:#1A1A2E;line-height:1.3;">' . htmlspecialchars($title) . '</h1>
</td></tr>
<tr><td style="padding:0 32px 28px;">
<div style="font-size:15px;line-height:1.7;color:#4B5563;">
' . $bodyContent . '
</div>
</td></tr>
<tr><td style="background-color:#f9fafb;padding:20px 32px;text-align:center;border-top:1px solid #E8E8ED;">
<div style="font-size:12px;color:#9CA3AF;line-height:1.6;">
This email was sent by <strong style="color:#6B7280;">' . htmlspecialchars($gymName) . '</strong> via GymXBook.<br>
&copy; ' . $year . ' GymXBook. All rights reserved.
</div>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>';
        return $html;
    }

    public function sendEmailVerification($toEmail, $toName, $verifyToken)
    {
        if (!$this->isConfigured()) return false;

        try {
            $mail = $this->createMailer();
            $gymName = $this->getGymName();

            $mail->addAddress($toEmail, $toName);
            $mail->Subject = 'Verify Your Email - ' . $gymName;

            $protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http';
            $verifyUrl = $protocol . '://' . $_SERVER['HTTP_HOST'] . dirname($_SERVER['SCRIPT_NAME']) . '/api.php?action=verify_email&token=' . urlencode($verifyToken);

            $bodyContent = '<p style="margin:0 0 16px;">Hi <strong>' . htmlspecialchars($toName) . '</strong>,</p>
<p style="margin:0 0 16px;">Thank you for registering your gym on <strong>GymXBook</strong>! To complete your account setup and activate all features, please verify your email address.</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:24px 0;">
<tr><td align="center">
<a href="' . $verifyUrl . '" style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#E8551F);color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:14px 36px;border-radius:10px;box-shadow:0 4px 12px rgba(255,107,53,0.3);">Verify Email Address</a>
</td></tr>
</table>
<p style="margin:0 0 16px;">Or copy this link to your browser:</p>
<p style="margin:0 0 16px;font-size:13px;color:#6B7280;word-break:break-all;background:#f4f5f7;padding:12px;border-radius:8px;">' . $verifyUrl . '</p>
<p style="margin:0 0 8px;font-size:13px;color:#9CA3AF;">If you did not create this account, you can safely ignore this email.</p>';

            $mail->Body = $this->buildHtmlBody('Verify Your Email', 'Verify your email to activate your GymXBook account', $bodyContent, $gymName);
            $mail->AltBody = "Hi {$toName},\n\nPlease verify your email by visiting: {$verifyUrl}\n\nIf you did not create this account, ignore this email.";

            return $mail->send();
        } catch (PHPMailerException $e) {
            error_log('MailHelper::sendEmailVerification failed: ' . $e->getMessage());
            return false;
        } catch (\Exception $e) {
            error_log('MailHelper::sendEmailVerification failed: ' . $e->getMessage());
            return false;
        }
    }

    public function sendNewMemberNotification($memberName, $memberEmail, $memberPhone, $planName, $expiryDate)
    {
        if (!$this->isConfigured()) return false;

        try {
            $mail = $this->createMailer();
            $gymName = $this->getGymName();
            $ownerEmail = $this->smtpConfig['from_email'];

            $mail->addAddress($ownerEmail, $gymName);
            $mail->Subject = 'New Member Added - ' . $memberName;

            $planRow = $planName ? '<tr><td style="padding:8px 0;font-size:13px;color:#9CA3AF;width:120px;">Plan</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#1A1A2E;">' . htmlspecialchars($planName) . '</td></tr>' : '';
            $expiryRow = $expiryDate ? '<tr><td style="padding:8px 0;font-size:13px;color:#9CA3AF;width:120px;">Expiry</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#1A1A2E;">' . htmlspecialchars($expiryDate) . '</td></tr>' : '';

            $bodyContent = '<p style="margin:0 0 16px;">A new member has been added to <strong>' . htmlspecialchars($gymName) . '</strong>.</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f9fafb;border-radius:12px;padding:16px;margin:16px 0;">
<tr><td style="padding:8px 0;font-size:13px;color:#9CA3AF;width:120px;">Name</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#1A1A2E;">' . htmlspecialchars($memberName) . '</td></tr>
<tr><td style="padding:8px 0;font-size:13px;color:#9CA3AF;width:120px;">Email</td><td style="padding:8px 0;font-size:14px;color:#4B5563;">' . htmlspecialchars($memberEmail) . '</td></tr>
<tr><td style="padding:8px 0;font-size:13px;color:#9CA3AF;width:120px;">Phone</td><td style="padding:8px 0;font-size:14px;color:#4B5563;">' . htmlspecialchars($memberPhone ?: '-') . '</td></tr>
' . $planRow . '
' . $expiryRow . '
</table>
<p style="margin:0;font-size:13px;color:#9CA3AF;">You can view and manage this member from your GymXBook dashboard.</p>';

            $mail->Body = $this->buildHtmlBody('New Member Added', $memberName . ' has been added to your gym', $bodyContent, $gymName);
            $mail->AltBody = "New member added: {$memberName} ({$memberEmail}) - Plan: {$planName}";

            return $mail->send();
        } catch (PHPMailerException $e) {
            error_log('MailHelper::sendNewMemberNotification failed: ' . $e->getMessage());
            return false;
        } catch (\Exception $e) {
            error_log('MailHelper::sendNewMemberNotification failed: ' . $e->getMessage());
            return false;
        }
    }

    public function sendPaymentReceived($memberEmail, $memberName, $invoiceId, $amount, $paymentMethod, $paymentDate, $invoiceTotal, $paidSoFar, $dueAmount)
    {
        if (!$this->isConfigured()) return false;

        try {
            $mail = $this->createMailer();
            $gymName = $this->getGymName();

            $mail->addAddress($memberEmail, $memberName);
            $mail->Subject = 'Payment Received - Invoice #' . $invoiceId;

            $statusLabel = $dueAmount > 0 ? 'Partial Payment' : 'Fully Paid';
            $statusColor = $dueAmount > 0 ? '#F59E0B' : '#22C55E';
            $statusBg = $dueAmount > 0 ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)';

            $dueRow = $dueAmount > 0 ? '<tr><td style="padding:8px 0;font-size:13px;color:#9CA3AF;width:120px;">Due Amount</td><td style="padding:8px 0;font-size:14px;font-weight:700;color:#EF4444;">₹' . number_format($dueAmount, 2) . '</td></tr>' : '';

            $bodyContent = '<p style="margin:0 0 16px;">Hi <strong>' . htmlspecialchars($memberName) . '</strong>,</p>
<p style="margin:0 0 16px;">We have received your payment. Here are the details:</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f9fafb;border-radius:12px;padding:16px;margin:16px 0;">
<tr><td style="padding:8px 0;font-size:13px;color:#9CA3AF;width:120px;">Invoice</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#1A1A2E;">#' . htmlspecialchars($invoiceId) . '</td></tr>
<tr><td style="padding:8px 0;font-size:13px;color:#9CA3AF;width:120px;">Amount Paid</td><td style="padding:8px 0;font-size:14px;font-weight:700;color:#22C55E;">₹' . number_format($amount, 2) . '</td></tr>
<tr><td style="padding:8px 0;font-size:13px;color:#9CA3AF;width:120px;">Method</td><td style="padding:8px 0;font-size:14px;color:#4B5563;">' . strtoupper(htmlspecialchars($paymentMethod)) . '</td></tr>
<tr><td style="padding:8px 0;font-size:13px;color:#9CA3AF;width:120px;">Date</td><td style="padding:8px 0;font-size:14px;color:#4B5563;">' . htmlspecialchars($paymentDate) . '</td></tr>
<tr><td style="padding:8px 0;font-size:13px;color:#9CA3AF;width:120px;">Invoice Total</td><td style="padding:8px 0;font-size:14px;color:#4B5563;">₹' . number_format($invoiceTotal, 2) . '</td></tr>
<tr><td style="padding:8px 0;font-size:13px;color:#9CA3AF;width:120px;">Total Paid</td><td style="padding:8px 0;font-size:14px;color:#4B5563;">₹' . number_format($paidSoFar, 2) . '</td></tr>
' . $dueRow . '
</table>
<div style="display:inline-block;background:' . $statusBg . ';color:' . $statusColor . ';padding:6px 16px;border-radius:20px;font-size:13px;font-weight:700;margin:8px 0;">' . $statusLabel . '</div>
<p style="margin:12px 0 0;font-size:13px;color:#9CA3AF;">Thank you for your payment!</p>';

            $mail->Body = $this->buildHtmlBody('Payment Received', 'Payment of ₹' . number_format($amount, 2) . ' received for Invoice #' . $invoiceId, $bodyContent, $gymName);
            $mail->AltBody = "Hi {$memberName},\nPayment of ₹{$amount} received for Invoice #{$invoiceId} via {$paymentMethod} on {$paymentDate}.\nTotal: ₹{$invoiceTotal}, Paid: ₹{$paidSoFar}, Due: ₹{$dueAmount}";

            return $mail->send();
        } catch (PHPMailerException $e) {
            error_log('MailHelper::sendPaymentReceived failed: ' . $e->getMessage());
            return false;
        } catch (\Exception $e) {
            error_log('MailHelper::sendPaymentReceived failed: ' . $e->getMessage());
            return false;
        }
    }

    public function sendInvoiceCreated($memberEmail, $memberName, $invoiceId, $invoiceDate, $dueDate, $items, $totalAmount)
    {
        if (!$this->isConfigured()) return false;

        try {
            $mail = $this->createMailer();
            $gymName = $this->getGymName();

            $mail->addAddress($memberEmail, $memberName);
            $mail->Subject = 'New Invoice - #' . $invoiceId . ' from ' . $gymName;

            $itemsHtml = '';
            if (!empty($items)) {
                $itemsHtml = '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:16px 0;border-collapse:collapse;">';
                $itemsHtml .= '<tr style="background:#f4f5f7;"><td style="padding:10px 12px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #E8E8ED;">Item</td><td style="padding:10px 12px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;text-align:right;border-bottom:1px solid #E8E8ED;">Amount</td></tr>';
                foreach ($items as $item) {
                    $itemsHtml .= '<tr><td style="padding:10px 12px;font-size:14px;color:#1A1A2E;border-bottom:1px solid #f4f5f7;">' . htmlspecialchars($item['title'] ?? '') . '</td><td style="padding:10px 12px;font-size:14px;font-weight:600;color:#1A1A2E;text-align:right;border-bottom:1px solid #f4f5f7;">₹' . number_format(floatval($item['amount'] ?? 0), 2) . '</td></tr>';
                }
                $itemsHtml .= '<tr style="background:#f9fafb;"><td style="padding:12px;font-size:14px;font-weight:700;color:#1A1A2E;">Total</td><td style="padding:12px;font-size:16px;font-weight:800;color:#FF6B35;text-align:right;">₹' . number_format(floatval($totalAmount), 2) . '</td></tr>';
                $itemsHtml .= '</table>';
            }

            $dueDateRow = $dueDate ? '<tr><td style="padding:8px 0;font-size:13px;color:#9CA3AF;width:120px;">Due Date</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#1A1A2E;">' . htmlspecialchars($dueDate) . '</td></tr>' : '';

            $bodyContent = '<p style="margin:0 0 16px;">Hi <strong>' . htmlspecialchars($memberName) . '</strong>,</p>
<p style="margin:0 0 16px;">A new invoice has been generated for you by <strong>' . htmlspecialchars($gymName) . '</strong>.</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f9fafb;border-radius:12px;padding:16px;margin:16px 0;">
<tr><td style="padding:8px 0;font-size:13px;color:#9CA3AF;width:120px;">Invoice #</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#1A1A2E;">' . htmlspecialchars($invoiceId) . '</td></tr>
<tr><td style="padding:8px 0;font-size:13px;color:#9CA3AF;width:120px;">Date</td><td style="padding:8px 0;font-size:14px;color:#4B5563;">' . htmlspecialchars($invoiceDate) . '</td></tr>
' . $dueDateRow . '
</table>
' . $itemsHtml . '
<p style="margin:16px 0 0;font-size:13px;color:#9CA3AF;">Please make the payment at the earliest to avoid any inconvenience. Visit the gym or contact us for payment options.</p>';

            $mail->Body = $this->buildHtmlBody('New Invoice Generated', 'Invoice #' . $invoiceId . ' for ₹' . number_format(floatval($totalAmount), 2), $bodyContent, $gymName);
            $mail->AltBody = "Hi {$memberName},\nNew Invoice #{$invoiceId} generated on {$invoiceDate}.\nTotal: ₹{$totalAmount}\nPlease make the payment at the earliest.";

            return $mail->send();
        } catch (PHPMailerException $e) {
            error_log('MailHelper::sendInvoiceCreated failed: ' . $e->getMessage());
            return false;
        } catch (\Exception $e) {
            error_log('MailHelper::sendInvoiceCreated failed: ' . $e->getMessage());
            return false;
        }
    }

    public function sendWelcomeEmail($toEmail, $toName, $businessName)
    {
        if (!$this->isConfigured()) return false;

        try {
            $mail = $this->createMailer();
            $gymName = $businessName ?: $this->getGymName();

            $mail->addAddress($toEmail, $toName);
            $mail->Subject = 'Welcome to GymXBook - Your Gym Management Journey Begins!';

            $bodyContent = '<p style="margin:0 0 16px;">Hi <strong>' . htmlspecialchars($toName) . '</strong>,</p>
<p style="margin:0 0 16px;">Welcome to <strong>GymXBook</strong>! 🎉</p>
<p style="margin:0 0 16px;">Your gym <strong>' . htmlspecialchars($gymName) . '</strong> has been successfully set up. You\'re now ready to manage your gym efficiently with our powerful tools.</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:16px 0;">
<tr>
<td style="background:rgba(34,197,94,0.08);border-radius:12px;padding:16px;width:48%;vertical-align:top;">
<div style="font-size:20px;margin-bottom:4px;">👥</div>
<div style="font-size:14px;font-weight:700;color:#1A1A2E;">Member Management</div>
<div style="font-size:12px;color:#6B7280;">Add, track &amp; manage members</div>
</td>
<td style="width:4%;"></td>
<td style="background:rgba(59,130,246,0.08);border-radius:12px;padding:16px;width:48%;vertical-align:top;">
<div style="font-size:20px;margin-bottom:4px;">📊</div>
<div style="font-size:14px;font-weight:700;color:#1A1A2E;">Reports &amp; Analytics</div>
<div style="font-size:12px;color:#6B7280;">Track revenue &amp; attendance</div>
</td>
</tr>
<tr><td colspan="3" style="height:8px;"></td></tr>
<tr>
<td style="background:rgba(139,92,246,0.08);border-radius:12px;padding:16px;width:48%;vertical-align:top;">
<div style="font-size:20px;margin-bottom:4px;">💰</div>
<div style="font-size:14px;font-weight:700;color:#1A1A2E;">Invoicing</div>
<div style="font-size:12px;color:#6B7280;">Create invoices &amp; track payments</div>
</td>
<td style="width:4%;"></td>
<td style="background:rgba(255,107,53,0.08);border-radius:12px;padding:16px;width:48%;vertical-align:top;">
<div style="font-size:20px;margin-bottom:4px;">✅</div>
<div style="font-size:14px;font-weight:700;color:#1A1A2E;">Attendance</div>
<div style="font-size:12px;color:#6B7280;">Check-in / Check-out tracking</div>
</td>
</tr>
</table>
<p style="margin:0 0 8px;font-size:13px;color:#9CA3AF;">Configure your SMTP settings from the desktop version to send automated emails to your members.</p>';

            $mail->Body = $this->buildHtmlBody('Welcome to GymXBook! 🎉', 'Your gym management journey begins', $bodyContent, 'GymXBook');
            $mail->AltBody = "Hi {$toName},\n\nWelcome to GymXBook! Your gym {$gymName} has been set up successfully.\n\nStart managing members, tracking attendance, and creating invoices today!";

            return $mail->send();
        } catch (PHPMailerException $e) {
            error_log('MailHelper::sendWelcomeEmail failed: ' . $e->getMessage());
            return false;
        } catch (\Exception $e) {
            error_log('MailHelper::sendWelcomeEmail failed: ' . $e->getMessage());
            return false;
        }
    }
}
