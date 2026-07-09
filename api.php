<?php
/* Prevent ANY PHP errors/warnings from corrupting JSON responses */
error_reporting(0);
ini_set('display_errors', '0');

/* Start output buffering BEFORE config to catch ALL stray output */
ob_start();

require_once 'config.php';

/* Cashfree PG Configuration */
define('CASHFREE_APP_ID', 'TEST11110086697be295b81eb8db7ef068001111');
define('CASHFREE_SECRET_KEY', 'cfsk_ma_test_3185487ef4ace00eb1d1f0d1f43baeba_9c490924');
define('CASHFREE_SANDBOX', true);
define('CASHFREE_API_VERSION', '2023-08-01');

/* Cashfree API Helper */
function callCashfreeAPI($method, $path, $body = null)
{
    $baseUrl = CASHFREE_SANDBOX ? 'https://sandbox.cashfree.com' : 'https://api.cashfree.com';
    $ch = curl_init($baseUrl . $path);
    $headers = [
        'Content-Type: application/json',
        'x-client-id: ' . CASHFREE_APP_ID,
        'x-client-secret: ' . CASHFREE_SECRET_KEY,
        'x-api-version: ' . CASHFREE_API_VERSION
    ];
    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        if ($body) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);
    $decoded = json_decode($response, true);
    // Log all Cashfree API calls for debugging
    $logLine = date('Y-m-d H:i:s') . " | $method $path | HTTP $httpCode | " . json_encode($decoded) . "\n";
    @file_put_contents(__DIR__ . '/cf_debug.log', $logLine, FILE_APPEND);
    return ['status' => $httpCode, 'data' => $decoded, 'curl_error' => $curlErr, 'raw' => $response];
}

/* Ensure subscription_orders table exists */
function ensureSubscriptionOrdersTable()
{
    global $pdo;
    $pdo->exec("CREATE TABLE IF NOT EXISTS subscription_orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id VARCHAR(100) NOT NULL UNIQUE,
        parent_id INT NOT NULL,
        plan_id INT NOT NULL,
        order_type VARCHAR(20) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        status VARCHAR(20) DEFAULT 'CREATED',
        link_id VARCHAR(100),
        link_url VARCHAR(500),
        cf_order_id VARCHAR(255),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_order_id (order_id),
        INDEX idx_parent_id (parent_id)
    )");

    // Migrate: add new columns if table already exists with old schema
    try {
        $pdo->exec("ALTER TABLE subscription_orders ADD COLUMN link_id VARCHAR(100) AFTER status");
    } catch (Exception $e) {
    }
    try {
        $pdo->exec("ALTER TABLE subscription_orders ADD COLUMN link_url VARCHAR(500) AFTER link_id");
    } catch (Exception $e) {
    }
    try {
        $pdo->exec("ALTER TABLE subscription_orders MODIFY COLUMN cf_order_id VARCHAR(255) DEFAULT NULL");
    } catch (Exception $e) {
    }
}

/* Ensure app_notifications table exists */
function ensureNotificationsTable()
{
    global $pdo;
    $pdo->exec("CREATE TABLE IF NOT EXISTS app_notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        parent_id INT NOT NULL,
        user_id INT DEFAULT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50) DEFAULT 'info',
        is_read TINYINT(1) DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_parent_id (parent_id),
        INDEX idx_is_read (is_read)
    )");
}

/* Calculate subscription expiry from interval string */
function calcSubscriptionExpiry($currentExpiry, $interval)
{
    $isExpired = !$currentExpiry || strtotime($currentExpiry) < time();
    if ($isExpired) {
        $start = new DateTime();
    } else {
        $start = new DateTime($currentExpiry);
        $start->modify('+1 day');
    }
    $iv = strtolower(trim($interval));
    // Handle weekly separately (7 days, not months)
    if ($iv === 'weekly' || $iv === '1 week' || $iv === '7 days') {
        $expiry = clone $start;
        $expiry->modify('+7 days');
        $expiry->modify('-1 day');
        return $expiry->format('Y-m-d');
    }
    $months = 1;
    switch ($iv) {
        case 'monthly':
        case '1 month':
            $months = 1;
            break;
        case 'quarterly':
        case '3 months':
            $months = 3;
            break;
        case 'half-yearly':
        case '6 months':
            $months = 6;
            break;
        case 'yearly':
        case '12 months':
        case '1 year':
            $months = 12;
            break;
        default:
            $n = intval($interval);
            if ($n > 0) $months = $n;
    }
    $expiry = clone $start;
    $expiry->modify("+{$months} months");
    $expiry->modify('-1 day');
    return $expiry->format('Y-m-d');
}

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

/* Health check / diagnostic endpoint (no auth required) */
if ($action === 'health') {
    respond(['status' => 'ok', 'php' => phpversion(), 'time' => date('Y-m-d H:i:s')]);
}

/* Wrap all API logic in try/catch to ensure JSON is always returned */
try {

    /* Helper: Get ID from query string or DELETE request body */
    function getRequestId($key = 'id')
    {
        if (isset($_GET[$key]) && $_GET[$key]) return intval($_GET[$key]);
        if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
            $input = json_decode(file_get_contents('php://input'), true);
            if ($input && isset($input[$key]) && $input[$key]) return intval($input[$key]);
        }
        return 0;
    }

    /* Helper: Create MailHelper instance for a tenant (lazy-loaded, silent if unavailable) */
    $_mailHelperLoaded = false;
    function getMailHelper($pid)
    {
        global $pdo, $_mailHelperLoaded;
        try {
            if (!$_mailHelperLoaded) {
                $mhFile = __DIR__ . '/lib/MailHelper.php';
                if (!file_exists($mhFile)) return null;
                require_once $mhFile;
                $_mailHelperLoaded = true;
            }
            return new MailHelper($pdo, $pid);
        } catch (Exception $e) {
            error_log('MailHelper load failed: ' . $e->getMessage());
            return null;
        } catch (Error $e) {
            error_log('MailHelper load error: ' . $e->getMessage());
            return null;
        }
    }

    /* Email sending is DISABLED to prevent SMTP connection issues from blocking the app.
   To re-enable: set up working SMTP credentials, then uncomment the sendEmailsAsync calls. */
    function sendEmailsAsync($pid, $callback)
    {
        /* Disabled - emails are not sent to prevent app blocking */
        return;
    }

    switch ($action) {

        // ==================== AUTH ====================
        case 'login':
            if ($method !== 'POST') respond(['error' => 'Method not allowed'], 405);
            $input = json_decode(file_get_contents('php://input'), true);
            $login = trim($input['email'] ?? ''); // Can be email or phone
            $password = $input['password'] ?? '';
            $remember = $input['remember'] ?? false;
            if (!$login || !$password) respond(['error' => 'Email/Phone and password required'], 400);
            // Allow login with email OR phone number
            $stmt = $pdo->prepare("SELECT * FROM users WHERE (email = ? OR phone_number = ?) AND is_active = 1");
            $stmt->execute([$login, $login]);
            $user = $stmt->fetch();
            if (!$user) respond(['error' => 'Invalid credentials'], 401);
            // Support both bcrypt (Laravel) and plain md5 legacy
            $valid = password_verify($password, $user['password']);
            if (!$valid) {
                if (md5($password) === $user['password']) $valid = true;
            }
            if (!$valid) respond(['error' => 'Invalid credentials'], 401);
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['user_type'] = $user['type'];

            // Check gym subscription expiry
            $pid = ($user['type'] === 'admin' || $user['type'] === 'owner') ? $user['id'] : ($user['parent_id'] ?: 0);
            $subCheck = $pdo->prepare("SELECT subscription_expire_date FROM users WHERE id = ?");
            $subCheck->execute([$pid]);
            $adminUser = $subCheck->fetch();
            $subscriptionExpired = false;
            $subscriptionExpiringSoon = false;
            $subscriptionDaysLeft = null;
            if ($adminUser && $adminUser['subscription_expire_date']) {
                $daysLeft = ceil((strtotime($adminUser['subscription_expire_date']) - time()) / 86400);
                $subscriptionDaysLeft = (int)$daysLeft;
                if ($daysLeft < 0) {
                    $subscriptionExpired = true;
                } elseif ($daysLeft <= 7) {
                    $subscriptionExpiringSoon = true;
                }
            }

            // Allow login even with expired subscription — the PWA will show an overlay

            if ($remember) setRememberCookie($user['id']);

            // If trainee, fetch their specific details
            if ($user['type'] === 'trainee') {
                $tdStmt = $pdo->prepare("SELECT td.*, m.title as plan_name FROM trainee_details td LEFT JOIN memberships m ON td.membership_plan = m.id WHERE td.user_id = ?");
                $tdStmt->execute([$user['id']]);
                $user['trainee_details'] = $tdStmt->fetch();
            }

            unset($user['password']);
            unset($user['remember_token']);
            unset($user['twofa_secret']);

            // Include subscription info for drawer UI
            $subStmt = $pdo->prepare("SELECT s.*, u.subscription_expire_date FROM subscriptions s LEFT JOIN users u ON u.subscription = s.id WHERE u.id = ?");
            $subStmt->execute([$pid]);
            $subscription = $subStmt->fetch();

            respond(['success' => true, 'user' => $user, 'subscription' => $subscription, 'subscription_expired' => $subscriptionExpired, 'subscription_expiring_soon' => $subscriptionExpiringSoon, 'subscription_days_left' => $subscriptionDaysLeft]);
            break;

        case 'logout':
            clearRememberCookie();
            session_destroy();
            respond(['success' => true]);
            break;

        case 'change_password':
            requireAuth();
            if ($method !== 'POST') respond(['error' => 'Method not allowed'], 405);
            $input = json_decode(file_get_contents('php://input'), true);
            $currentPassword = $input['current_password'] ?? '';
            $newPassword = $input['new_password'] ?? '';
            if (!$currentPassword || !$newPassword) respond(['error' => 'Both current and new password required'], 400);
            if (strlen($newPassword) < 6) respond(['error' => 'New password must be at least 6 characters'], 400);
            $user = currentUser();
            if (!password_verify($currentPassword, $user['password'])) respond(['error' => 'Current password is incorrect'], 400);
            $pdo->prepare("UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?")->execute([password_hash($newPassword, PASSWORD_BCRYPT), $_SESSION['user_id']]);
            respond(['success' => true, 'message' => 'Password changed successfully']);
            break;

        case 'me':
            requireAuth();
            $user = currentUser();
            if (!$user) respond(['error' => 'User not found'], 401);
            $userId = $user['id'];
            unset($user['password']);
            unset($user['remember_token']);
            unset($user['twofa_secret']);

            $pid = getParentId();

            // If trainee, fetch their specific details
            if ($user['type'] === 'trainee') {
                $tdStmt = $pdo->prepare("SELECT td.*, m.title as plan_name FROM trainee_details td LEFT JOIN memberships m ON td.membership_plan = m.id WHERE td.user_id = ?");
                $tdStmt->execute([$userId]);
                $user['trainee_details'] = $tdStmt->fetch();
            }

            // Include subscription info with expiry flags (for the gym's own subscription)
            $subStmt = $pdo->prepare("SELECT s.*, u.subscription_expire_date FROM subscriptions s LEFT JOIN users u ON u.subscription = s.id WHERE u.id = ?");
            $subStmt->execute([$pid]);
            $subscription = $subStmt->fetch();

            // Check subscription expiry status
            $subCheck = $pdo->prepare("SELECT subscription_expire_date FROM users WHERE id = ?");
            $subCheck->execute([$pid]);
            $adminUser = $subCheck->fetch();
            $subscriptionExpired = false;
            $subscriptionExpiringSoon = false;
            $subscriptionDaysLeft = null;
            if ($adminUser && $adminUser['subscription_expire_date']) {
                $daysLeft = ceil((strtotime($adminUser['subscription_expire_date']) - time()) / 86400);
                $subscriptionDaysLeft = $daysLeft;
                if ($daysLeft < 0) {
                    $subscriptionExpired = true;
                } elseif ($daysLeft <= 7) {
                    $subscriptionExpiringSoon = true;
                }
            }

            // Get gym info from settings table with priority to company_* keys
            $gymInfo = ['name' => 'GymXBook', 'phone' => '', 'address' => '', 'email' => ''];

            $settingsStmt = $pdo->prepare("SELECT name, value FROM settings WHERE parent_id = ?");
            $settingsStmt->execute([$pid]);
            $settingsData = [];
            foreach ($settingsStmt->fetchAll() as $row) {
                $settingsData[$row['name']] = $row['value'];
            }

            // Map company_* keys to gymInfo
            if (!empty($settingsData['company_name'])) $gymInfo['name'] = $settingsData['company_name'];
            else if (!empty($settingsData['gym_name'])) $gymInfo['name'] = $settingsData['gym_name'];

            if (!empty($settingsData['company_phone'])) $gymInfo['phone'] = $settingsData['company_phone'];
            else if (!empty($settingsData['phone'])) $gymInfo['phone'] = $settingsData['phone'];

            if (!empty($settingsData['company_email'])) $gymInfo['email'] = $settingsData['company_email'];
            else if (!empty($settingsData['email'])) $gymInfo['email'] = $settingsData['email'];

            if (!empty($settingsData['company_address'])) $gymInfo['address'] = $settingsData['company_address'];
            else if (!empty($settingsData['address'])) $gymInfo['address'] = $settingsData['address'];

            respond(['user' => $user, 'subscription' => $subscription, 'subscription_expired' => $subscriptionExpired, 'subscription_expiring_soon' => $subscriptionExpiringSoon, 'subscription_days_left' => $subscriptionDaysLeft, 'gym_info' => $gymInfo]);
            break;

        case 'update_profile':
            requireAuth();
            if ($method !== 'POST') respond(['error' => 'Method not allowed'], 405);
            $input = json_decode(file_get_contents('php://input'), true);
            $name = trim($input['name'] ?? '');
            $email = trim($input['email'] ?? '');
            $phone = trim($input['phone_number'] ?? '');

            if (!$name || !$email) respond(['error' => 'Name and email are required'], 400);

            // Check email uniqueness
            $check = $pdo->prepare("SELECT id FROM users WHERE email = ? AND id != ?");
            $check->execute([$email, $_SESSION['user_id']]);
            if ($check->fetch()) respond(['error' => 'Email already in use'], 400);

            $stmt = $pdo->prepare("UPDATE users SET name = ?, email = ?, phone_number = ?, updated_at = NOW() WHERE id = ?");
            $stmt->execute([$name, $email, $phone, $_SESSION['user_id']]);

            respond(['success' => true, 'message' => 'Profile updated successfully']);
            break;

        // ==================== LIGHTWEIGHT SUBSCRIPTION STATUS ====================
        case 'subscription_status':
            requireAuth();
            $pid = getParentId();
            $subCheck = $pdo->prepare("SELECT subscription_expire_date FROM users WHERE id = ?");
            $subCheck->execute([$pid]);
            $adminUser = $subCheck->fetch();
            $subscriptionExpired = false;
            $subscriptionExpiringSoon = false;
            $subscriptionDaysLeft = null;
            if ($adminUser && $adminUser['subscription_expire_date']) {
                $daysLeft = ceil((strtotime($adminUser['subscription_expire_date']) - time()) / 86400);
                $subscriptionDaysLeft = $daysLeft;
                if ($daysLeft < 0) {
                    $subscriptionExpired = true;
                } elseif ($daysLeft <= 7) {
                    $subscriptionExpiringSoon = true;
                }
            }
            respond([
                'subscription_expired' => $subscriptionExpired,
                'subscription_expiring_soon' => $subscriptionExpiringSoon,
                'subscription_days_left' => $subscriptionDaysLeft
            ]);
            break;

        // ==================== DASHBOARD ====================
        case 'dashboard':
            requireAuth();
            $pid = getParentId();

            $totalMembers = $pdo->prepare("SELECT COUNT(*) as c FROM users WHERE type = 'trainee' AND parent_id = ?");
            $totalMembers->execute([$pid]);
            $memberCount = $totalMembers->fetch()['c'];

            $totalTrainers = $pdo->prepare("SELECT COUNT(*) as c FROM users WHERE type = 'trainer' AND parent_id = ?");
            $totalTrainers->execute([$pid]);
            $trainerCount = $totalTrainers->fetch()['c'];

            $todayAttendance = $pdo->prepare("SELECT COUNT(*) as c FROM attendances WHERE date = CURDATE() AND parent_id = ?");
            $todayAttendance->execute([$pid]);
            $attendanceCount = $todayAttendance->fetch()['c'];

            $activeMemberships = $pdo->prepare("SELECT COUNT(*) as c FROM trainee_details WHERE membership_expiry_date >= CURDATE() AND parent_id = ?");
            $activeMemberships->execute([$pid]);
            $activeCount = $activeMemberships->fetch()['c'];

            $monthRevenue = $pdo->prepare("SELECT COALESCE(SUM(amount),0) as total FROM invoice_payments WHERE MONTH(payment_date) = MONTH(CURDATE()) AND YEAR(payment_date) = YEAR(CURDATE()) AND parent_id = ?");
            $monthRevenue->execute([$pid]);
            $revenue = $monthRevenue->fetch()['total'];

            $monthExpenses = $pdo->prepare("SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE MONTH(date) = MONTH(CURDATE()) AND YEAR(date) = YEAR(CURDATE()) AND parent_id = ?");
            $monthExpenses->execute([$pid]);
            $expenses = $monthExpenses->fetch()['total'];

            $recentMembers = $pdo->prepare("SELECT u.*, td.membership_expiry_date, td.fitness_goal, td.membership_plan, m.title as plan_name FROM users u LEFT JOIN trainee_details td ON u.id = td.user_id LEFT JOIN memberships m ON td.membership_plan = m.id WHERE u.type = 'trainee' AND u.parent_id = ? ORDER BY u.created_at DESC LIMIT 5");
            $recentMembers->execute([$pid]);
            $recent = $recentMembers->fetchAll();

            $todayCheckins = $pdo->prepare("SELECT a.*, u.name, u.profile FROM attendances a JOIN users u ON a.user_id = u.id WHERE a.date = CURDATE() AND a.parent_id = ? ORDER BY a.checked_in_time DESC");
            $todayCheckins->execute([$pid]);
            $checkins = $todayCheckins->fetchAll();

            respond([
                'stats' => [
                    'members' => $memberCount,
                    'trainers' => $trainerCount,
                    'attendance_today' => $attendanceCount,
                    'active_memberships' => $activeCount,
                    'revenue' => $revenue,
                    'expenses' => $expenses
                ],
                'recent_members' => $recent,
                'today_checkins' => $checkins
            ]);
            break;

        // ==================== MEMBERS ====================
        case 'members':
            requireAuth();
            $pid = getParentId();
            if ($method === 'GET') {
                $search = $_GET['search'] ?? '';
                $status = $_GET['status'] ?? '';
                $page = max(1, intval($_GET['page'] ?? 1));
                $limit = 20;
                $offset = ($page - 1) * $limit;

                $where = "WHERE u.type = 'trainee' AND u.parent_id = ?";
                $params = [$pid];
                if ($search) {
                    $where .= " AND (u.name LIKE ? OR u.email LIKE ? OR u.phone_number LIKE ?)";
                    $params[] = "%$search%";
                    $params[] = "%$search%";
                    $params[] = "%$search%";
                }
                if ($status === 'active') {
                    $where .= " AND td.membership_expiry_date >= CURDATE()";
                }
                if ($status === 'expired') {
                    $where .= " AND td.membership_expiry_date < CURDATE() AND td.membership_expiry_date IS NOT NULL";
                }

                $countStmt = $pdo->prepare("SELECT COUNT(*) as c FROM users u LEFT JOIN trainee_details td ON u.id = td.user_id $where");
                $countStmt->execute($params);
                $total = $countStmt->fetch()['c'];

                $stmt = $pdo->prepare("SELECT u.*, td.address, td.city, td.state, td.country, td.zip_code, td.dob, td.age, td.gender, td.fitness_goal, td.membership_plan, td.membership_start_date, td.membership_expiry_date, td.trainer_assign, td.category, td.status as trainee_status, m.title as plan_name FROM users u LEFT JOIN trainee_details td ON u.id = td.user_id LEFT JOIN memberships m ON td.membership_plan = m.id $where ORDER BY u.created_at DESC LIMIT $limit OFFSET $offset");
                $stmt->execute($params);
                $members = $stmt->fetchAll();

                respond(['members' => $members, 'total' => $total, 'page' => $page, 'pages' => ceil($total / $limit)]);
            }
            if ($method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $pdo->beginTransaction();
                try {
                    // Check duplicate email
                    $check = $pdo->prepare("SELECT id FROM users WHERE email = ?");
                    $check->execute([$input['email']]);
                    if ($check->fetch()) {
                        $pdo->rollBack();
                        respond(['error' => 'Email already exists'], 400);
                    }

                    $stmt = $pdo->prepare("INSERT INTO users (name, email, type, phone_number, password, parent_id, is_active, created_at, updated_at) VALUES (?, ?, 'trainee', ?, ?, ?, 1, NOW(), NOW())");
                    $hashedPassword = password_hash($input['password'] ?? '123456789', PASSWORD_BCRYPT);
                    $stmt->execute([$input['name'], $input['email'], $input['phone_number'] ?? '', $hashedPassword, $pid]);
                    $userId = $pdo->lastInsertId();

                    $stmt2 = $pdo->prepare("INSERT INTO trainee_details (user_id, trainee_id, address, city, state, country, zip_code, dob, age, gender, fitness_goal, membership_plan, trainer_assign, membership_start_date, membership_expiry_date, category, parent_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())");
                    $stmt2->execute([
                        $userId,
                        $userId,
                        $input['address'] ?? '',
                        $input['city'] ?? '',
                        $input['state'] ?? '',
                        $input['country'] ?? '',
                        $input['zip_code'] ?? '',
                        $input['dob'] ?? null,
                        $input['age'] ?? 0,
                        $input['gender'] ?? '',
                        $input['fitness_goal'] ?? '',
                        $input['membership_plan'] ?? 0,
                        $input['trainer_assign'] ?? 0,
                        $input['membership_start_date'] ?? null,
                        $input['membership_expiry_date'] ?? null,
                        $input['category'] ?? 0,
                        $pid
                    ]);

                    // Auto-create invoice if membership plan and/or class is selected
                    $membershipPlan = intval($input['membership_plan'] ?? 0);
                    $classId = intval($input['class_id'] ?? 0);
                    $registrationFee = floatval($input['registration_fee'] ?? 0);

                    $plan = null;
                    $classInfo = null;
                    $planAmount = 0;
                    $totalAmount = $registrationFee;

                    if ($membershipPlan > 0) {
                        $planStmt = $pdo->prepare("SELECT * FROM memberships WHERE id = ?");
                        $planStmt->execute([$membershipPlan]);
                        $plan = $planStmt->fetch();
                        if ($plan) {
                            $planAmount = floatval($plan['amount']);
                            $totalAmount += $planAmount;
                        }
                    }

                    if ($classId > 0) {
                        $classStmt = $pdo->prepare("SELECT * FROM classes WHERE id = ?");
                        $classStmt->execute([$classId]);
                        $classInfo = $classStmt->fetch();
                        if ($classInfo) $totalAmount += floatval($classInfo['fees']);
                    }

                    if ($membershipPlan > 0 || $classId > 0 || $registrationFee > 0) {
                        $paidAmount = min(floatval($input['paid_amount'] ?? 0), $totalAmount);

                        // Create invoice
                        $maxId = $pdo->prepare("SELECT COALESCE(MAX(invoice_id), 0) + 1 as next_id FROM invoices WHERE parent_id = ?");
                        $maxId->execute([$pid]);
                        $invoiceId = $maxId->fetch()['next_id'];

                        $invoiceNotes = [];
                        if ($plan) $invoiceNotes[] = $plan['title'] . ' Membership';
                        if ($classInfo) $invoiceNotes[] = $classInfo['title'] . ' Class';
                        if ($registrationFee > 0) $invoiceNotes[] = 'Registration Fee';
                        $invoiceStatus = $paidAmount >= $totalAmount ? 'paid' : ($paidAmount > 0 ? 'partial' : 'unpaid');
                        $invStmt = $pdo->prepare("INSERT INTO invoices (invoice_id, user_id, invoice_date, invoice_due_date, status, notes, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())");
                        $invStmt->execute([$invoiceId, $userId, $input['membership_start_date'] ?? date('Y-m-d'), $input['membership_expiry_date'] ?? null, $invoiceStatus, implode(' + ', $invoiceNotes), $pid]);
                        $invDbId = $pdo->lastInsertId();

                        // Add registration fee item
                        if ($registrationFee > 0) {
                            $itemStmt = $pdo->prepare("INSERT INTO invoice_items (invoice_id, type_id, title, amount, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())");
                            $itemStmt->execute([$invDbId, 0, 'Registration Fee', $registrationFee, 'One-time registration fee']);
                        }

                        // Add plan item
                        if ($plan) {
                            $itemStmt = $pdo->prepare("INSERT INTO invoice_items (invoice_id, type_id, title, amount, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())");
                            $itemStmt->execute([$invDbId, $membershipPlan, $plan['title'] . ' Membership', floatval($plan['amount']), $plan['package'] ?? '']);
                        }

                        // Add class item
                        if ($classInfo) {
                            $itemStmt = $pdo->prepare("INSERT INTO invoice_items (invoice_id, type_id, title, amount, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())");
                            $itemStmt->execute([$invDbId, $classId, $classInfo['title'] . ' Class', floatval($classInfo['fees']), 'Class assignment']);

                            // Assign class to member
                            $assignStmt = $pdo->prepare("INSERT INTO class_assigns (classes_id, assign_id, assign_type, created_at, updated_at) VALUES (?, ?, 'member', NOW(), NOW())");
                            $assignStmt->execute([$classId, $userId]);
                        }

                        // Create payment if amount > 0
                        if ($paidAmount > 0) {
                            $payStmt = $pdo->prepare("INSERT INTO invoice_payments (invoice_id, transaction_id, payment_type, amount, payment_date, parent_id, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())");
                            $payStmt->execute([$invDbId, '', $input['payment_method'] ?? 'cash', $paidAmount, date('Y-m-d'), $pid, 'Initial payment']);
                        }
                    }

                    // Send email to gym owner about new member (non-blocking)
                    sendEmailsAsync($pid, function ($mailHelper) use ($pdo, $membershipPlan, $input, $plan, $planAmount, $invoiceId) {
                        $planLookup = $membershipPlan > 0 ? $pdo->prepare("SELECT title FROM memberships WHERE id = ?") : null;
                        $pName = '';
                        if ($planLookup) {
                            $planLookup->execute([$membershipPlan]);
                            $pr = $planLookup->fetch();
                            $pName = $pr ? $pr['title'] : '';
                        }
                        $mailHelper->sendNewMemberNotification(
                            $input['name'],
                            $input['email'],
                            $input['phone_number'] ?? '',
                            $pName,
                            $input['membership_expiry_date'] ?? ''
                        );
                        // Also send invoice email to member if invoice was auto-created
                        if ($membershipPlan > 0 && $plan && $input['email']) {
                            $mailHelper->sendInvoiceCreated(
                                $input['email'],
                                $input['name'],
                                $invoiceId,
                                $input['membership_start_date'] ?? date('Y-m-d'),
                                $input['membership_expiry_date'] ?? null,
                                [['title' => $plan['title'] . ' Membership', 'amount' => $planAmount]],
                                $planAmount
                            );
                        }
                    });

                    $pdo->commit();
                    respond(['success' => true, 'id' => $userId], 201);
                } catch (Exception $e) {
                    $pdo->rollBack();
                    respond(['error' => $e->getMessage()], 400);
                }
            }
            break;

        case 'member':
            requireAuth();
            $pid = getParentId();
            $user = currentUser();
            $id = getRequestId('id');

            // Trainees can only see their own profile
            if ($user['type'] === 'trainee' && $user['id'] != $id) {
                respond(['error' => 'Forbidden'], 403);
            }

            if ($method === 'GET') {
                // FIX: Select specific td columns to prevent u.id being overwritten by td.id
                $stmt = $pdo->prepare("SELECT u.id as user_id, u.name, u.email, u.type, u.profile, u.phone_number, u.lang, u.subscription, u.subscription_expire_date, u.parent_id, u.is_active, u.created_at, u.updated_at, td.id as trainee_detail_id, td.user_id as td_user_id, td.trainee_id, td.address, td.city, td.state, td.country, td.zip_code, td.dob, td.age, td.document, td.gender, td.fitness_goal, td.membership_plan, td.trainer_assign, td.membership_start_date, td.membership_expiry_date, td.category, td.parent_id as td_parent_id, td.status as trainee_status, m.title as plan_name, m.amount as plan_amount, m.package as plan_package FROM users u LEFT JOIN trainee_details td ON u.id = td.user_id LEFT JOIN memberships m ON td.membership_plan = m.id WHERE u.id = ? AND u.parent_id = ?");
                $stmt->execute([$id, $pid]);
                $member = $stmt->fetch();
                if (!$member) respond(['error' => 'Member not found'], 404);
                // Ensure 'id' always refers to users.id
                $member['id'] = $member['user_id'];
                unset($member['password']);

                // Get assigned trainer name
                if (!empty($member['trainer_assign'])) {
                    $trainerStmt = $pdo->prepare("SELECT name FROM users WHERE id = ?");
                    $trainerStmt->execute([$member['trainer_assign']]);
                    $trainerRow = $trainerStmt->fetch();
                    $member['trainer_name'] = $trainerRow ? $trainerRow['name'] : null;
                } else {
                    $member['trainer_name'] = null;
                }

                // Get assigned class names
                $classStmt = $pdo->prepare("SELECT c.id, c.title, c.fees FROM class_assigns ca JOIN classes c ON ca.classes_id = c.id WHERE ca.assign_id = ? AND (ca.assign_type = 'member' OR ca.assign_type IS NULL) ORDER BY ca.created_at DESC");
                $classStmt->execute([$id]);
                $member['assigned_classes'] = $classStmt->fetchAll();

                $attStmt = $pdo->prepare("SELECT * FROM attendances WHERE user_id = ? AND parent_id = ? ORDER BY date DESC LIMIT 30");
                $attStmt->execute([$id, $pid]);
                $member['attendance_history'] = $attStmt->fetchAll();

                $healthStmt = $pdo->prepare("SELECT * FROM healths WHERE user_id = ? AND parent_id = ? ORDER BY measurement_date DESC LIMIT 10");
                $healthStmt->execute([$id, $pid]);
                $member['health_records'] = $healthStmt->fetchAll();

                $freezeStmt = $pdo->prepare("SELECT * FROM freeze_membership_logs WHERE trainee_id = ? ORDER BY created_at DESC LIMIT 5");
                $freezeStmt->execute([$id]);
                $member['freeze_logs'] = $freezeStmt->fetchAll();

                respond(['member' => $member]);
            }
            if ($method === 'PUT') {
                $input = json_decode(file_get_contents('php://input'), true);
                $pdo->beginTransaction();
                try {
                    // Update users table
                    $userFields = "name=?, phone_number=?, is_active=?, updated_at=NOW()";
                    $userParams = [$input['name'], $input['phone_number'] ?? '', $input['is_active'] ?? 1];

                    // Only update email if provided and different
                    if (!empty($input['email'])) {
                        $checkEmail = $pdo->prepare("SELECT id FROM users WHERE email = ? AND id != ?");
                        $checkEmail->execute([$input['email'], $id]);
                        if ($checkEmail->fetch()) {
                            $pdo->rollBack();
                            respond(['error' => 'Email already in use'], 400);
                        }
                        $userFields .= ", email=?";
                        $userParams[] = $input['email'];
                    }

                    $userParams[] = $id;
                    $userParams[] = $pid;
                    $stmt = $pdo->prepare("UPDATE users SET $userFields WHERE id=? AND parent_id=?");
                    $stmt->execute($userParams);

                    // Update or create trainee_details
                    $checkStmt = $pdo->prepare("SELECT id FROM trainee_details WHERE user_id = ?");
                    $checkStmt->execute([$id]);
                    $exists = $checkStmt->fetch();

                    if ($exists) {
                        $stmt2 = $pdo->prepare("UPDATE trainee_details SET address=?, city=?, state=?, country=?, zip_code=?, dob=?, age=?, gender=?, fitness_goal=?, membership_plan=?, trainer_assign=?, membership_start_date=?, membership_expiry_date=?, category=?, status=?, updated_at=NOW() WHERE user_id=?");
                        $stmt2->execute([
                            $input['address'] ?? '',
                            $input['city'] ?? '',
                            $input['state'] ?? '',
                            $input['country'] ?? '',
                            $input['zip_code'] ?? '',
                            $input['dob'] ?? null,
                            $input['age'] ?? 0,
                            $input['gender'] ?? '',
                            $input['fitness_goal'] ?? '',
                            $input['membership_plan'] ?? 0,
                            $input['trainer_assign'] ?? 0,
                            $input['membership_start_date'] ?? null,
                            $input['membership_expiry_date'] ?? null,
                            $input['category'] ?? 0,
                            $input['status'] ?? 1,
                            $id
                        ]);
                    } else {
                        $stmt2 = $pdo->prepare("INSERT INTO trainee_details (user_id, trainee_id, address, city, state, country, zip_code, dob, age, gender, fitness_goal, membership_plan, trainer_assign, membership_start_date, membership_expiry_date, category, parent_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())");
                        $stmt2->execute([
                            $id,
                            $id,
                            $input['address'] ?? '',
                            $input['city'] ?? '',
                            $input['state'] ?? '',
                            $input['country'] ?? '',
                            $input['zip_code'] ?? '',
                            $input['dob'] ?? null,
                            $input['age'] ?? 0,
                            $input['gender'] ?? '',
                            $input['fitness_goal'] ?? '',
                            $input['membership_plan'] ?? 0,
                            $input['trainer_assign'] ?? 0,
                            $input['membership_start_date'] ?? null,
                            $input['membership_expiry_date'] ?? null,
                            $input['category'] ?? 0,
                            $pid
                        ]);
                    }
                    $pdo->commit();
                    respond(['success' => true]);
                } catch (Exception $e) {
                    $pdo->rollBack();
                    respond(['error' => $e->getMessage()], 400);
                }
            }
            if ($method === 'DELETE') {
                // Toggle active/inactive instead of hard delete
                $stmt = $pdo->prepare("SELECT is_active FROM users WHERE id = ? AND parent_id = ?");
                $stmt->execute([$id, $pid]);
                $checkUser = $stmt->fetch();
                if (!$checkUser) respond(['error' => 'Member not found'], 404);
                $newStatus = $checkUser['is_active'] ? 0 : 1;
                $pdo->prepare("UPDATE users SET is_active = ?, updated_at = NOW() WHERE id = ? AND parent_id = ?")->execute([$newStatus, $id, $pid]);
                respond(['success' => true, 'is_active' => $newStatus, 'message' => $newStatus ? 'Member activated' : 'Member deactivated']);
            }
            break;

        // ==================== RENEW MEMBERSHIP ====================
        case 'renew_membership':
            requireAuth();
            if ($method !== 'POST') respond(['error' => 'Method not allowed'], 405);
            $input = json_decode(file_get_contents('php://input'), true);
            $userId = intval($input['user_id'] ?? 0);
            if (!$userId) respond(['error' => 'User ID required'], 400);
            $pid = getParentId();

            $pdo->beginTransaction();
            try {
                $stmt = $pdo->prepare("UPDATE trainee_details SET membership_plan=?, membership_start_date=?, membership_expiry_date=?, status=1, updated_at=NOW() WHERE user_id=?");
                $stmt->execute([
                    $input['membership_plan'] ?? 0,
                    $input['membership_start_date'] ?? date('Y-m-d'),
                    $input['membership_expiry_date'] ?? null,
                    $userId
                ]);

                // Create invoice for renewal
                $membershipPlan = intval($input['membership_plan'] ?? 0);
                $classId = intval($input['class_id'] ?? 0);

                $plan = null;
                $classInfo = null;
                $totalAmount = 0;

                if ($membershipPlan > 0) {
                    $planStmt = $pdo->prepare("SELECT * FROM memberships WHERE id = ?");
                    $planStmt->execute([$membershipPlan]);
                    $plan = $planStmt->fetch();
                    if ($plan) $totalAmount += floatval($plan['amount']);
                }

                if ($classId > 0) {
                    $classStmt = $pdo->prepare("SELECT * FROM classes WHERE id = ?");
                    $classStmt->execute([$classId]);
                    $classInfo = $classStmt->fetch();
                    if ($classInfo) $totalAmount += floatval($classInfo['fees']);
                }

                if ($membershipPlan > 0 || $classId > 0) {
                    $paidAmount = min(floatval($input['paid_amount'] ?? 0), $totalAmount);

                    $maxId = $pdo->prepare("SELECT COALESCE(MAX(invoice_id), 0) + 1 as next_id FROM invoices WHERE parent_id = ?");
                    $maxId->execute([$pid]);
                    $invoiceId = $maxId->fetch()['next_id'];

                    $invoiceNotes = [];
                    if ($plan) $invoiceNotes[] = $plan['title'] . ' Renewal';
                    if ($classInfo) $invoiceNotes[] = $classInfo['title'] . ' Class';
                    $invoiceStatus = $paidAmount >= $totalAmount ? 'paid' : ($paidAmount > 0 ? 'partial' : 'unpaid');
                    $invStmt = $pdo->prepare("INSERT INTO invoices (invoice_id, user_id, invoice_date, invoice_due_date, status, notes, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())");
                    $invStmt->execute([$invoiceId, $userId, $input['membership_start_date'] ?? date('Y-m-d'), $input['membership_expiry_date'] ?? null, $invoiceStatus, implode(' + ', $invoiceNotes), $pid]);
                    $invDbId = $pdo->lastInsertId();

                    // Add plan item
                    if ($plan) {
                        $itemStmt = $pdo->prepare("INSERT INTO invoice_items (invoice_id, type_id, title, amount, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())");
                        $itemStmt->execute([$invDbId, $membershipPlan, $plan['title'] . ' Renewal', floatval($plan['amount']), 'Membership renewal - ' . ($plan['package'] ?? '')]);
                    }

                    // Add class item
                    if ($classInfo) {
                        $itemStmt = $pdo->prepare("INSERT INTO invoice_items (invoice_id, type_id, title, amount, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())");
                        $itemStmt->execute([$invDbId, $classId, $classInfo['title'] . ' Class', floatval($classInfo['fees']), 'Class assignment']);

                        // Assign class to member
                        $assignStmt = $pdo->prepare("INSERT INTO class_assigns (classes_id, assign_id, assign_type, created_at, updated_at) VALUES (?, ?, 'member', NOW(), NOW())");
                        $assignStmt->execute([$classId, $userId]);
                    }

                    if ($paidAmount > 0) {
                        $payStmt = $pdo->prepare("INSERT INTO invoice_payments (invoice_id, transaction_id, payment_type, amount, payment_date, parent_id, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())");
                        $payStmt->execute([$invDbId, '', $input['payment_method'] ?? 'cash', $paidAmount, date('Y-m-d'), $pid, 'Renewal payment']);
                    }
                }

                $pdo->commit();
                respond(['success' => true]);
            } catch (Exception $e) {
                $pdo->rollBack();
                respond(['error' => $e->getMessage()], 400);
            }
            break;

        // ==================== FREEZE MEMBERSHIP ====================
        case 'freeze_membership':
            requireAuth();
            if ($method !== 'POST') respond(['error' => 'Method not allowed'], 405);
            $input = json_decode(file_get_contents('php://input'), true);
            $userId = intval($input['user_id'] ?? 0);
            if (!$userId) respond(['error' => 'User ID required'], 400);

            $pdo->beginTransaction();
            try {
                // Get current membership details
                $tdStmt = $pdo->prepare("SELECT td.*, m.title as plan_name FROM trainee_details td LEFT JOIN memberships m ON td.membership_plan = m.id WHERE td.user_id = ?");
                $tdStmt->execute([$userId]);
                $td = $tdStmt->fetch();
                if (!$td) {
                    $pdo->rollBack();
                    respond(['error' => 'Member not found'], 404);
                }

                $freezeStart = $input['freeze_start_date'];
                $freezeEnd = $input['freeze_end_date'];
                $freezeDays = (strtotime($freezeEnd) - strtotime($freezeStart)) / 86400;

                // Log the freeze
                $logStmt = $pdo->prepare("INSERT INTO freeze_membership_logs (trainee_id, plan, membership_start_date, membership_expiry_date, freeze_start_date, freeze_end_date, freeze_days, remarks, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())");
                $logStmt->execute([
                    $userId,
                    $td['plan_name'] ?? '',
                    $td['membership_start_date'],
                    $td['membership_expiry_date'],
                    $freezeStart,
                    $freezeEnd,
                    $freezeDays,
                    $input['remarks'] ?? '',
                    $_SESSION['user_id']
                ]);

                // Extend membership by freeze days
                if ($td['membership_expiry_date']) {
                    $newExpiry = date('Y-m-d', strtotime($td['membership_expiry_date'] . " +{$freezeDays} days"));
                    $pdo->prepare("UPDATE trainee_details SET membership_expiry_date=?, status=3, updated_at=NOW() WHERE user_id=?")
                        ->execute([$newExpiry, $userId]);
                }

                $pdo->commit();
                respond(['success' => true, 'freeze_days' => $freezeDays, 'new_expiry' => $newExpiry ?? null]);
            } catch (Exception $e) {
                $pdo->rollBack();
                respond(['error' => $e->getMessage()], 400);
            }
            break;

        // ==================== UNFREEZE MEMBERSHIP ====================
        case 'unfreeze_membership':
            requireAuth();
            if ($method !== 'POST') respond(['error' => 'Method not allowed'], 405);
            $input = json_decode(file_get_contents('php://input'), true);
            $userId = intval($input['user_id'] ?? 0);
            if (!$userId) respond(['error' => 'User ID required'], 400);

            $stmt = $pdo->prepare("UPDATE trainee_details SET status=1, updated_at=NOW() WHERE user_id=?");
            $stmt->execute([$userId]);
            respond(['success' => true]);
            break;

        // ==================== REPORTS ====================
        case 'reports':
            requireAuth();
            $pid = getParentId();

            // New members this month
            $newMembers = $pdo->prepare("SELECT COUNT(*) as c FROM users WHERE type='trainee' AND parent_id=? AND MONTH(created_at)=MONTH(CURDATE()) AND YEAR(created_at)=YEAR(CURDATE())");
            $newMembers->execute([$pid]);
            $newCount = $newMembers->fetch()['c'];

            // New members list
            $newMembersList = $pdo->prepare("SELECT u.*, td.membership_expiry_date, td.fitness_goal, m.title as plan_name FROM users u LEFT JOIN trainee_details td ON u.id = td.user_id LEFT JOIN memberships m ON td.membership_plan = m.id WHERE u.type='trainee' AND u.parent_id=? AND MONTH(u.created_at)=MONTH(CURDATE()) AND YEAR(u.created_at)=YEAR(CURDATE()) ORDER BY u.created_at DESC");
            $newMembersList->execute([$pid]);

            // Expiring in next 7 days
            $expiring7 = $pdo->prepare("SELECT u.*, td.membership_expiry_date, td.fitness_goal, m.title as plan_name FROM users u JOIN trainee_details td ON u.id = td.user_id LEFT JOIN memberships m ON td.membership_plan = m.id WHERE u.type='trainee' AND u.parent_id=? AND td.membership_expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY) ORDER BY td.membership_expiry_date ASC");
            $expiring7->execute([$pid]);

            // Expired members
            $expired = $pdo->prepare("SELECT u.*, td.membership_expiry_date, td.fitness_goal, m.title as plan_name FROM users u JOIN trainee_details td ON u.id = td.user_id LEFT JOIN memberships m ON td.membership_plan = m.id WHERE u.type='trainee' AND u.parent_id=? AND td.membership_expiry_date < CURDATE() ORDER BY td.membership_expiry_date DESC");
            $expired->execute([$pid]);

            // Total monthly income (payments received this month)
            $incomeStmt = $pdo->prepare("SELECT COALESCE(SUM(amount),0) as total FROM invoice_payments WHERE parent_id=? AND MONTH(payment_date)=MONTH(CURDATE()) AND YEAR(payment_date)=YEAR(CURDATE())");
            $incomeStmt->execute([$pid]);
            $monthlyIncome = $incomeStmt->fetch()['total'];

            // Monthly expense
            $expStmt = $pdo->prepare("SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE parent_id=? AND MONTH(date)=MONTH(CURDATE()) AND YEAR(date)=YEAR(CURDATE())");
            $expStmt->execute([$pid]);
            $monthlyExpense = $expStmt->fetch()['total'];

            // Total active
            $activeStmt = $pdo->prepare("SELECT COUNT(*) as c FROM trainee_details WHERE parent_id=? AND membership_expiry_date >= CURDATE()");
            $activeStmt->execute([$pid]);
            $activeCount = $activeStmt->fetch()['c'];

            // Total expired count
            $expCountStmt = $pdo->prepare("SELECT COUNT(*) as c FROM trainee_details WHERE parent_id=? AND membership_expiry_date < CURDATE()");
            $expCountStmt->execute([$pid]);
            $expiredCount = $expCountStmt->fetch()['c'];

            // Frozen
            $frozenStmt = $pdo->prepare("SELECT COUNT(*) as c FROM trainee_details WHERE parent_id=? AND status=3");
            $frozenStmt->execute([$pid]);
            $frozenCount = $frozenStmt->fetch()['c'];

            // Daily attendance last 7 days
            $attChart = $pdo->prepare("SELECT date, COUNT(*) as count FROM attendances WHERE parent_id=? AND date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) GROUP BY date ORDER BY date ASC");
            $attChart->execute([$pid]);

            // Membership distribution
            $planDist = $pdo->prepare("SELECT m.title, m.package, m.amount, COUNT(td.user_id) as member_count FROM memberships m LEFT JOIN trainee_details td ON m.id = td.membership_plan AND td.parent_id=? WHERE m.parent_id=? GROUP BY m.id ORDER BY m.amount ASC");
            $planDist->execute([$pid, $pid]);

            respond([
                'new_members_count' => $newCount,
                'new_members' => $newMembersList->fetchAll(),
                'expiring_7days' => $expiring7->fetchAll(),
                'expired' => $expired->fetchAll(),
                'monthly_income' => $monthlyIncome,
                'monthly_expense' => $monthlyExpense,
                'active_count' => $activeCount,
                'expired_count' => $expiredCount,
                'frozen_count' => $frozenCount,
                'attendance_chart' => $attChart->fetchAll(),
                'plan_distribution' => $planDist->fetchAll()
            ]);
            break;

        // ==================== TRANSACTIONS ====================
        case 'transactions':
            requireAuth();
            $pid = getParentId();
            $month = $_GET['month'] ?? date('m');
            $year = $_GET['year'] ?? date('Y');

            // Income from payments
            $income = $pdo->prepare("SELECT 'income' as type, ip.payment_date as date, ip.created_at as sort_time, ip.amount, ip.payment_type as method, u.name as member_name, i.id as invoice_db_id, i.invoice_id, CONCAT('Payment - Invoice #', i.invoice_id) as description FROM invoice_payments ip JOIN invoices i ON ip.invoice_id = i.id JOIN users u ON i.user_id = u.id WHERE ip.parent_id = ? AND MONTH(ip.payment_date) = ? AND YEAR(ip.payment_date) = ?");
            $income->execute([$pid, $month, $year]);
            $incomeList = $income->fetchAll();

            // Expenses
            $expense = $pdo->prepare("SELECT 'expense' as type, e.date, e.created_at as sort_time, e.amount, '' as method, '' as member_name, 0 as invoice_db_id, 0 as invoice_id, COALESCE(e.title, 'Expense') as description FROM expenses e WHERE e.parent_id = ? AND MONTH(e.date) = ? AND YEAR(e.date) = ?");
            $expense->execute([$pid, $month, $year]);
            $expenseList = $expense->fetchAll();

            $all = array_merge($incomeList, $expenseList);
            usort($all, function ($a, $b) {
                $dateCmp = strtotime($b['date']) - strtotime($a['date']);
                if ($dateCmp !== 0) return $dateCmp;
                // Same date: sort by created_at time (newest first)
                $timeA = $a['sort_time'] ?? '';
                $timeB = $b['sort_time'] ?? '';
                return strcmp($timeB, $timeA);
            });

            $totalIncome = array_sum(array_column($incomeList, 'amount'));
            $totalExpense = array_sum(array_column($expenseList, 'amount'));

            respond(['transactions' => $all, 'total_income' => $totalIncome, 'total_expense' => $totalExpense, 'month' => $month, 'year' => $year]);
            break;

        // ==================== MEMBER TRANSACTIONS ====================
        case 'member_transactions':
            requireAuth();
            $pid = getParentId();
            $user = currentUser();
            $userId = intval($_GET['user_id'] ?? 0);
            if (!$userId) respond(['error' => 'User ID required'], 400);

            // Trainees can only see their own transactions
            if ($user['type'] === 'trainee' && $user['id'] != $userId) {
                respond(['error' => 'Forbidden'], 403);
            }

            $invoices = $pdo->prepare("SELECT i.id, i.invoice_id, i.invoice_date, i.invoice_due_date, i.status, i.notes, (SELECT COALESCE(SUM(ii.amount),0) FROM invoice_items ii WHERE ii.invoice_id = i.id) as total_amount, (SELECT COALESCE(SUM(ip.amount),0) FROM invoice_payments ip WHERE ip.invoice_id = i.id AND ip.parent_id = ?) as paid_amount FROM invoices i WHERE i.user_id = ? AND i.parent_id = ? ORDER BY i.invoice_date DESC");
            $invoices->execute([$pid, $userId, $pid]);

            $payments = $pdo->prepare("SELECT ip.*, i.invoice_id FROM invoice_payments ip JOIN invoices i ON ip.invoice_id = i.id WHERE i.user_id = ? AND ip.parent_id = ? ORDER BY ip.payment_date DESC");
            $payments->execute([$userId, $pid]);

            respond(['invoices' => $invoices->fetchAll(), 'payments' => $payments->fetchAll()]);
            break;

        // ==================== TRAINERS ====================
        case 'trainers':
            requireAuth();
            $pid = getParentId();
            if ($method === 'GET') {
                $stmt = $pdo->prepare("SELECT u.*, td.qualification, td.address, td.city, td.gender, td.dob, td.status as trainer_status FROM users u LEFT JOIN trainer_details td ON u.id = td.user_id WHERE u.type = 'trainer' AND u.parent_id = ? ORDER BY u.created_at DESC");
                $stmt->execute([$pid]);
                respond(['trainers' => $stmt->fetchAll()]);
            }
            if ($method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $pdo->beginTransaction();
                try {
                    $check = $pdo->prepare("SELECT id FROM users WHERE email = ?");
                    $check->execute([$input['email']]);
                    if ($check->fetch()) {
                        $pdo->rollBack();
                        respond(['error' => 'Email already exists'], 400);
                    }

                    $stmt = $pdo->prepare("INSERT INTO users (name, email, type, phone_number, password, parent_id, is_active, created_at, updated_at) VALUES (?, ?, 'trainer', ?, ?, ?, 1, NOW(), NOW())");
                    $hashedPassword = password_hash($input['password'] ?? '123456789', PASSWORD_BCRYPT);
                    $stmt->execute([$input['name'], $input['email'], $input['phone_number'] ?? '', $hashedPassword, $pid]);
                    $userId = $pdo->lastInsertId();

                    $stmt2 = $pdo->prepare("INSERT INTO trainer_details (user_id, trainer_id, address, city, state, country, zip_code, dob, gender, qualification, parent_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())");
                    $stmt2->execute([
                        $userId,
                        $userId,
                        $input['address'] ?? '',
                        $input['city'] ?? '',
                        $input['state'] ?? '',
                        $input['country'] ?? '',
                        $input['zip_code'] ?? '',
                        $input['dob'] ?? null,
                        $input['gender'] ?? '',
                        $input['qualification'] ?? '',
                        $pid
                    ]);
                    $pdo->commit();
                    respond(['success' => true, 'id' => $userId], 201);
                } catch (Exception $e) {
                    $pdo->rollBack();
                    respond(['error' => $e->getMessage()], 400);
                }
            }
            break;

        case 'trainer':
            requireAuth();
            $pid = getParentId();
            $id = getRequestId('id');
            if ($method === 'GET') {
                $stmt = $pdo->prepare("SELECT u.id as user_id, u.name, u.email, u.type, u.profile, u.phone_number, u.is_active, u.created_at, td.id as trainer_detail_id, td.trainer_id, td.address, td.city, td.state, td.country, td.zip_code, td.dob, td.document, td.gender, td.qualification, td.parent_id as td_parent_id, td.status as trainer_status FROM users u LEFT JOIN trainer_details td ON u.id = td.user_id WHERE u.id = ? AND u.parent_id = ?");
                $stmt->execute([$id, $pid]);
                $trainer = $stmt->fetch();
                if (!$trainer) respond(['error' => 'Trainer not found'], 404);
                $trainer['id'] = $trainer['user_id'];
                unset($trainer['password']);
                respond(['trainer' => $trainer]);
            }
            if ($method === 'PUT') {
                $input = json_decode(file_get_contents('php://input'), true);
                if (!empty($input['email'])) {
                    $checkEmail = $pdo->prepare("SELECT id FROM users WHERE email = ? AND id != ?");
                    $checkEmail->execute([$input['email'], $id]);
                    if ($checkEmail->fetch()) respond(['error' => 'Email already in use'], 400);
                    $stmt = $pdo->prepare("UPDATE users SET name=?, email=?, phone_number=?, is_active=?, updated_at=NOW() WHERE id=? AND parent_id=?");
                    $stmt->execute([$input['name'], $input['email'], $input['phone_number'] ?? '', $input['is_active'] ?? 1, $id, $pid]);
                } else {
                    $stmt = $pdo->prepare("UPDATE users SET name=?, phone_number=?, is_active=?, updated_at=NOW() WHERE id=? AND parent_id=?");
                    $stmt->execute([$input['name'], $input['phone_number'] ?? '', $input['is_active'] ?? 1, $id, $pid]);
                }

                $checkStmt = $pdo->prepare("SELECT id FROM trainer_details WHERE user_id = ?");
                $checkStmt->execute([$id]);
                $exists = $checkStmt->fetch();
                if ($exists) {
                    $stmt2 = $pdo->prepare("UPDATE trainer_details SET address=?, city=?, state=?, country=?, zip_code=?, dob=?, gender=?, qualification=?, status=?, updated_at=NOW() WHERE user_id=?");
                    $stmt2->execute([$input['address'] ?? '', $input['city'] ?? '', $input['state'] ?? '', $input['country'] ?? '', $input['zip_code'] ?? '', $input['dob'] ?? null, $input['gender'] ?? '', $input['qualification'] ?? '', $input['status'] ?? 1, $id]);
                } else {
                    $stmt2 = $pdo->prepare("INSERT INTO trainer_details (user_id, trainer_id, address, city, state, country, zip_code, dob, gender, qualification, parent_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())");
                    $stmt2->execute([$id, $id, $input['address'] ?? '', $input['city'] ?? '', $input['state'] ?? '', $input['country'] ?? '', $input['zip_code'] ?? '', $input['dob'] ?? null, $input['gender'] ?? '', $input['qualification'] ?? '', $pid]);
                }
                respond(['success' => true]);
            }
            if ($method === 'DELETE') {
                // Toggle active/inactive (consistent with member DELETE — no hard delete)
                if (!$id) respond(['error' => 'Trainer ID required'], 400);
                $stmt = $pdo->prepare("SELECT is_active FROM users WHERE id = ? AND parent_id = ?");
                $stmt->execute([$id, $pid]);
                $checkUser = $stmt->fetch();
                if (!$checkUser) respond(['error' => 'Trainer not found'], 404);
                $newStatus = $checkUser['is_active'] ? 0 : 1;
                $pdo->prepare("UPDATE users SET is_active = ?, updated_at = NOW() WHERE id = ? AND parent_id = ?")->execute([$newStatus, $id, $pid]);
                respond(['success' => true, 'is_active' => $newStatus, 'message' => $newStatus ? 'Trainer activated' : 'Trainer deactivated']);
            }
            break;

        // ==================== ATTENDANCE ====================
        case 'attendance':
            requireAuth();
            $pid = getParentId();
            $user = currentUser();
            if ($method === 'GET') {
                $date = $_GET['date'] ?? date('Y-m-d');
                $query = "SELECT a.*, u.name, u.phone_number, u.profile FROM attendances a JOIN users u ON a.user_id = u.id WHERE a.date = ? AND a.parent_id = ?";
                $params = [$date, $pid];

                // Trainees can only see their own attendance
                if ($user['type'] === 'trainee') {
                    $query .= " AND a.user_id = ?";
                    $params[] = $user['id'];
                }

                $stmt = $pdo->prepare($query . " ORDER BY a.checked_in_time DESC");
                $stmt->execute($params);
                respond(['attendance' => $stmt->fetchAll(), 'date' => $date]);
            }
            if ($method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $userId = $input['user_id'] ?? $user['id']; // Default to self for trainees
                $type = $input['type'] ?? 'checkin';
                $qrToken = $input['qr_token'] ?? null;

                // Security: If qr_token is provided, verify it
                if ($qrToken) {
                    $qrStmt = $pdo->prepare("SELECT value FROM settings WHERE name = 'attendance_qr_secret' AND parent_id = ?");
                    $qrStmt->execute([$pid]);
                    $secret = $qrStmt->fetch();
                    if (!$secret || $secret['value'] !== $qrToken) {
                        respond(['error' => 'Invalid QR Code for this gym'], 400);
                    }
                }

                // Block Trainees if membership expired
                if ($user['type'] === 'trainee') {
                    $checkSub = $pdo->prepare("SELECT u.name, membership_expiry_date, is_active FROM users u JOIN trainee_details td ON u.id = td.user_id WHERE u.id = ?");
                    $checkSub->execute([$user['id']]);
                    $sub = $checkSub->fetch();

                    if (!$sub || $sub['is_active'] == 0) respond(['error' => 'Account is inactive'], 403);
                    if ($sub['membership_expiry_date'] && strtotime($sub['membership_expiry_date']) < strtotime(date('Y-m-d'))) {
                        $days = floor((time() - strtotime($sub['membership_expiry_date'])) / 86400);
                        ensureNotificationsTable();
                        $pdo->prepare("INSERT INTO app_notifications (parent_id, title, message, type) VALUES (?, ?, ?, 'error')")
                            ->execute([$pid, 'Entry Denied: Expired', "{$sub['name']} tried to check-in but membership expired {$days} day(s) ago."]);
                        respond(['error' => 'Membership expired. Please renew to check-in.'], 403);
                    }

                    // Trainees can only check themselves in
                    $userId = $user['id'];
                }

                if ($type === 'checkin') {
                    $check = $pdo->prepare("SELECT a.id, a.checked_out_time, u.name FROM attendances a JOIN users u ON a.user_id = u.id WHERE a.user_id = ? AND a.date = CURDATE() AND a.parent_id = ?");
                    $check->execute([$userId, $pid]);
                    $last = $check->fetch();

                    if ($last) {
                        if (!$last['checked_out_time']) {
                            // Already checked in, so this scan means Check-out
                            $stmt = $pdo->prepare("UPDATE attendances SET checked_out_time = CURTIME(), status = 2, updated_at = NOW() WHERE id = ?");
                            $stmt->execute([$last['id']]);
                            respond(['success' => true, 'type' => 'checkout']);
                        } else {
                            ensureNotificationsTable();
                            $pdo->prepare("INSERT INTO app_notifications (parent_id, title, message, type) VALUES (?, ?, ?, 'warning')")
                                ->execute([$pid, 'Double Entry Attempt', "{$last['name']} tried to check-in twice today."]);
                            respond(['error' => 'Already visited today'], 400);
                        }
                    }

                    $stmt = $pdo->prepare("INSERT INTO attendances (user_id, date, checked_in_time, status, parent_id, notes, created_at, updated_at) VALUES (?, CURDATE(), CURTIME(), 1, ?, ?, NOW(), NOW())");
                    $stmt->execute([$userId, $pid, $input['notes'] ?? 'QR Scan']);
                    respond(['success' => true, 'id' => $pdo->lastInsertId(), 'type' => 'checkin'], 201);
                } else {
                    $stmt = $pdo->prepare("UPDATE attendances SET checked_out_time = CURTIME(), status = 2, updated_at = NOW() WHERE user_id = ? AND date = CURDATE() AND parent_id = ?");
                    $stmt->execute([$userId, $pid]);
                    respond(['success' => true]);
                }
            }
            break;

        case 'attendance_search':
            requireAuth();
            $pid = getParentId();
            $search = $_GET['q'] ?? '';
            $stmt = $pdo->prepare("SELECT id, name, phone_number, profile FROM users WHERE type = 'trainee' AND parent_id = ? AND (name LIKE ? OR phone_number LIKE ?) LIMIT 10");
            $stmt->execute([$pid, "%$search%", "%$search%"]);
            respond(['users' => $stmt->fetchAll()]);
            break;

        // ==================== MEMBERSHIPS ====================
        case 'memberships':
            requireAuth();
            $pid = getParentId();
            if ($method === 'GET') {
                // FIX #5: Don't filter by parent_id if none found — also get plans with parent_id=0 (global)
                $stmt = $pdo->prepare("SELECT m.*, COUNT(td.user_id) as member_count FROM memberships m LEFT JOIN trainee_details td ON m.id = td.membership_plan AND td.parent_id = ? WHERE m.parent_id = ? OR m.parent_id = 0 GROUP BY m.id ORDER BY m.created_at DESC");
                $stmt->execute([$pid, $pid]);
                respond(['memberships' => $stmt->fetchAll()]);
            }
            if ($method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $stmt = $pdo->prepare("INSERT INTO memberships (title, package, amount, classes_id, parent_id, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())");
                $stmt->execute([$input['title'], $input['package'] ?? '', $input['amount'] ?? 0, $input['classes_id'] ?? '', $pid, $input['notes'] ?? '']);
                respond(['success' => true, 'id' => $pdo->lastInsertId()], 201);
            }
            break;

        case 'membership':
            requireAuth();
            $pid = getParentId();
            $id = getRequestId('id');
            if ($method === 'PUT') {
                $input = json_decode(file_get_contents('php://input'), true);
                $stmt = $pdo->prepare("UPDATE memberships SET title=?, package=?, amount=?, classes_id=?, notes=?, updated_at=NOW() WHERE id=? AND parent_id=?");
                $stmt->execute([$input['title'], $input['package'] ?? '', $input['amount'] ?? 0, $input['classes_id'] ?? '', $input['notes'] ?? '', $id, $pid]);
                respond(['success' => true]);
            }
            if ($method === 'DELETE') {
                if (!$id) respond(['error' => 'Membership ID required'], 400);
                // Check if any active members use this plan
                $check = $pdo->prepare("SELECT COUNT(*) as c FROM trainee_details WHERE membership_plan = ? AND parent_id = ?");
                $check->execute([$id, $pid]);
                $activeCount = $check->fetch()['c'];
                if ($activeCount > 0) respond(['error' => "Cannot delete: {$activeCount} member(s) are on this plan. Remove members first."], 400);
                $stmt = $pdo->prepare("DELETE FROM memberships WHERE id = ? AND parent_id = ?");
                $stmt->execute([$id, $pid]);
                if ($stmt->rowCount() > 0) respond(['success' => true]);
                else respond(['error' => 'Plan not found'], 404);
            }
            break;

        // ==================== CLASSES ====================
        case 'classes':
            requireAuth();
            $pid = getParentId();
            if ($method === 'GET') {
                $stmt = $pdo->prepare("SELECT c.*, (SELECT COUNT(*) FROM class_assigns WHERE classes_id = c.id) as assigned_count FROM classes c WHERE c.parent_id = ? ORDER BY c.created_at DESC");
                $stmt->execute([$pid]);
                respond(['classes' => $stmt->fetchAll()]);
            }
            if ($method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $stmt = $pdo->prepare("INSERT INTO classes (title, fees, address, notes, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())");
                $stmt->execute([$input['title'], $input['fees'] ?? 0, $input['address'] ?? '', $input['notes'] ?? '', $pid]);
                $classId = $pdo->lastInsertId();

                if (!empty($input['schedules'])) {
                    foreach ($input['schedules'] as $schedule) {
                        $sStmt = $pdo->prepare("INSERT INTO class_schedules (classes_id, days, start_time, end_time, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())");
                        $sStmt->execute([$classId, $schedule['days'], $schedule['start_time'], $schedule['end_time'], $pid]);
                    }
                }
                respond(['success' => true, 'id' => $classId], 201);
            }
            break;

        case 'class':
            requireAuth();
            $pid = getParentId();
            $id = getRequestId('id');
            if (!$id) respond(['error' => 'Class ID required'], 400);
            if ($method === 'GET') {
                $stmt = $pdo->prepare("SELECT * FROM classes WHERE id = ? AND parent_id = ?");
                $stmt->execute([$id, $pid]);
                $class = $stmt->fetch();
                if (!$class) respond(['error' => 'Not found'], 404);
                $sStmt = $pdo->prepare("SELECT * FROM class_schedules WHERE classes_id = ?");
                $sStmt->execute([$id]);
                $class['schedules'] = $sStmt->fetchAll();
                respond(['class' => $class]);
            }
            if ($method === 'PUT') {
                $input = json_decode(file_get_contents('php://input'), true);
                $stmt = $pdo->prepare("UPDATE classes SET title=?, fees=?, address=?, notes=?, updated_at=NOW() WHERE id=? AND parent_id=?");
                $stmt->execute([$input['title'], $input['fees'] ?? 0, $input['address'] ?? '', $input['notes'] ?? '', $id, $pid]);
                respond(['success' => true]);
            }
            if ($method === 'DELETE') {
                $pdo->prepare("DELETE FROM class_schedules WHERE classes_id = ?")->execute([$id]);
                $stmt = $pdo->prepare("DELETE FROM classes WHERE id = ? AND parent_id = ?");
                $stmt->execute([$id, $pid]);
                if ($stmt->rowCount() > 0) respond(['success' => true]);
                else respond(['error' => 'Class not found'], 404);
            }
            break;

        // ==================== EXPENSES ====================
        case 'expenses':
            requireAuth();
            $pid = getParentId();
            if ($method === 'GET') {
                $month = $_GET['month'] ?? date('m');
                $year = $_GET['year'] ?? date('Y');
                $stmt = $pdo->prepare("SELECT e.*, t.title as type_name FROM expenses e LEFT JOIN types t ON e.expense_type = t.id WHERE e.parent_id = ? AND MONTH(e.date) = ? AND YEAR(e.date) = ? ORDER BY e.date DESC");
                $stmt->execute([$pid, $month, $year]);
                $expenses = $stmt->fetchAll();
                $total = array_sum(array_column($expenses, 'amount'));
                respond(['expenses' => $expenses, 'total' => $total]);
            }
            if ($method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $stmt = $pdo->prepare("INSERT INTO expenses (title, expense_id, expense_type, date, amount, notes, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())");
                $stmt->execute([$input['title'], $input['expense_id'] ?? 0, $input['expense_type'] ?? 0, $input['date'], $input['amount'], $input['notes'] ?? '', $pid]);
                respond(['success' => true, 'id' => $pdo->lastInsertId()], 201);
            }
            break;

        case 'expense':
            requireAuth();
            $pid = getParentId();
            $id = getRequestId('id');
            if (!$id) respond(['error' => 'Expense ID required'], 400);
            if ($method === 'PUT') {
                $input = json_decode(file_get_contents('php://input'), true);
                $stmt = $pdo->prepare("UPDATE expenses SET title=?, expense_type=?, date=?, amount=?, notes=?, updated_at=NOW() WHERE id=? AND parent_id=?");
                $stmt->execute([$input['title'], $input['expense_type'] ?? 0, $input['date'], $input['amount'], $input['notes'] ?? '', $id, $pid]);
                respond(['success' => true]);
            }
            if ($method === 'DELETE') {
                $stmt = $pdo->prepare("DELETE FROM expenses WHERE id = ? AND parent_id = ?");
                $stmt->execute([$id, $pid]);
                if ($stmt->rowCount() > 0) respond(['success' => true]);
                else respond(['error' => 'Expense not found'], 404);
            }
            break;

        // ==================== INVOICES ====================
        case 'invoices':
            requireAuth();
            $pid = getParentId();
            if ($method === 'GET') {
                $status = $_GET['status'] ?? '';
                $where = "WHERE i.parent_id = ?";
                $params = [$pid];
                if ($status === 'unpaid') {
                    $where .= " AND i.status = 'unpaid'";
                }
                if ($status === 'partial') {
                    $where .= " AND i.status = 'partial'";
                }
                if ($status === 'paid') {
                    $where .= " AND i.status = 'paid'";
                }
                $stmt = $pdo->prepare("SELECT i.*, u.name as member_name FROM invoices i JOIN users u ON i.user_id = u.id $where ORDER BY i.created_at DESC");
                $stmt->execute($params);
                respond(['invoices' => $stmt->fetchAll()]);
            }
            if ($method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $pdo->beginTransaction();
                try {
                    $maxId = $pdo->prepare("SELECT COALESCE(MAX(invoice_id), 0) + 1 as next_id FROM invoices WHERE parent_id = ?");
                    $maxId->execute([$pid]);
                    $invoiceId = $maxId->fetch()['next_id'];

                    $stmt = $pdo->prepare("INSERT INTO invoices (invoice_id, user_id, invoice_date, invoice_due_date, status, notes, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())");
                    $stmt->execute([$invoiceId, $input['user_id'], $input['invoice_date'] ?? date('Y-m-d'), $input['invoice_due_date'] ?? null, $input['status'] ?? 'unpaid', $input['notes'] ?? '', $pid]);
                    $id = $pdo->lastInsertId();

                    if (!empty($input['items'])) {
                        foreach ($input['items'] as $item) {
                            $iStmt = $pdo->prepare("INSERT INTO invoice_items (invoice_id, type_id, title, amount, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())");
                            $iStmt->execute([$id, $item['type_id'] ?? 0, $item['title'], $item['amount'], $item['description'] ?? '']);
                        }
                    }
                    $pdo->commit();

                    // Send invoice created email to member (non-blocking)
                    sendEmailsAsync($pid, function ($mailHelper) use ($pdo, $input, $invoiceId) {
                        $memberInfo = $pdo->prepare("SELECT name, email FROM users WHERE id = ?");
                        $memberInfo->execute([$input['user_id']]);
                        $mRow = $memberInfo->fetch();
                        if ($mRow && $mRow['email']) {
                            $itemsData = !empty($input['items']) ? $input['items'] : [];
                            $totalAmt = array_sum(array_map(function ($i) {
                                return floatval($i['amount'] ?? 0);
                            }, $itemsData));
                            $mailHelper->sendInvoiceCreated(
                                $mRow['email'],
                                $mRow['name'],
                                $invoiceId,
                                $input['invoice_date'] ?? date('Y-m-d'),
                                $input['invoice_due_date'] ?? null,
                                $itemsData,
                                $totalAmt
                            );
                        }
                    });

                    respond(['success' => true, 'id' => $id], 201);
                } catch (Exception $e) {
                    $pdo->rollBack();
                    respond(['error' => $e->getMessage()], 400);
                }
            }
            break;

        case 'invoice':
            requireAuth();
            $pid = getParentId();
            $user = currentUser();
            $id = getRequestId('id');
            if ($method === 'GET') {
                $query = "SELECT i.*, u.name as member_name, u.email, u.phone_number, td.city FROM invoices i JOIN users u ON i.user_id = u.id LEFT JOIN trainee_details td ON u.id = td.user_id WHERE i.id = ? AND i.parent_id = ?";
                $params = [$id, $pid];

                // Trainees can only see their own invoices
                if ($user['type'] === 'trainee') {
                    $query .= " AND i.user_id = ?";
                    $params[] = $user['id'];
                }

                $stmt = $pdo->prepare($query);
                $stmt->execute($params);
                $invoice = $stmt->fetch();
                if (!$invoice) respond(['error' => 'Not found'], 404);
                $items = $pdo->prepare("SELECT * FROM invoice_items WHERE invoice_id = ?");
                $items->execute([$id]);
                $invoice['items'] = $items->fetchAll();
                $payments = $pdo->prepare("SELECT * FROM invoice_payments WHERE invoice_id = ? AND parent_id = ?");
                $payments->execute([$id, $pid]);
                $invoice['payments'] = $payments->fetchAll();
                $totalItems = $pdo->prepare("SELECT COALESCE(SUM(amount),0) as total FROM invoice_items WHERE invoice_id = ?");
                $totalItems->execute([$id]);
                $invoice['total_amount'] = floatval($totalItems->fetch()['total']);
                $totalPaid = $pdo->prepare("SELECT COALESCE(SUM(amount),0) as total FROM invoice_payments WHERE invoice_id = ? AND parent_id = ?");
                $totalPaid->execute([$id, $pid]);
                $invoice['paid_amount'] = floatval($totalPaid->fetch()['total']);
                $invoice['due_amount'] = $invoice['total_amount'] - $invoice['paid_amount'];
                respond(['invoice' => $invoice]);
            }
            break;

        case 'invoice_payment':
            requireAuth();
            $pid = getParentId();
            if ($method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $invId = intval($input['invoice_id'] ?? 0);
                $paymentAmount = floatval($input['amount'] ?? 0);

                if ($paymentAmount <= 0) {
                    respond(['error' => 'Payment amount must be greater than zero'], 400);
                }

                // Validate: payment cannot exceed due amount
                if ($invId > 0) {
                    // Duplicate payment prevention: same invoice + amount + type within 60 seconds
                    $dupCheck = $pdo->prepare("SELECT id FROM invoice_payments WHERE invoice_id = ? AND amount = ? AND payment_type = ? AND parent_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 60 SECOND)");
                    $dupCheck->execute([$invId, $paymentAmount, $input['payment_type'] ?? 'cash', $pid]);
                    if ($dupCheck->fetch()) {
                        respond(['error' => 'Duplicate payment detected. Please wait a moment and try again.'], 400);
                    }

                    $totalItems = $pdo->prepare("SELECT COALESCE(SUM(amount),0) as total FROM invoice_items WHERE invoice_id = ?");
                    $totalItems->execute([$invId]);
                    $total = floatval($totalItems->fetch()['total']);
                    $totalPaid = $pdo->prepare("SELECT COALESCE(SUM(amount),0) as total FROM invoice_payments WHERE invoice_id = ? AND parent_id = ?");
                    $totalPaid->execute([$invId, $pid]);
                    $alreadyPaid = floatval($totalPaid->fetch()['total']);
                    $dueAmount = $total - $alreadyPaid;
                    if ($dueAmount <= 0) {
                        respond(['error' => 'Invoice is already fully paid'], 400);
                    }
                    if ($paymentAmount > $dueAmount) {
                        respond(['error' => "Payment amount (₹{$paymentAmount}) exceeds due amount (₹{$dueAmount})"], 400);
                    }
                } else {
                    respond(['error' => 'Invalid invoice ID'], 400);
                }

                $stmt = $pdo->prepare("INSERT INTO invoice_payments (invoice_id, transaction_id, payment_type, amount, payment_date, parent_id, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())");
                $stmt->execute([$invId, $input['transaction_id'] ?? '', $input['payment_type'] ?? 'cash', $paymentAmount, $input['payment_date'] ?? date('Y-m-d'), $pid, $input['notes'] ?? '']);

                // Update invoice status
                $totalPaid = $pdo->prepare("SELECT COALESCE(SUM(amount),0) as total FROM invoice_payments WHERE invoice_id = ? AND parent_id = ?");
                $totalPaid->execute([$invId, $pid]);
                $paid = floatval($totalPaid->fetch()['total']);

                $totalItems = $pdo->prepare("SELECT COALESCE(SUM(amount),0) as total FROM invoice_items WHERE invoice_id = ?");
                $totalItems->execute([$invId]);
                $total = floatval($totalItems->fetch()['total']);

                $newStatus = $paid >= $total ? 'paid' : ($paid > 0 ? 'partial' : 'unpaid');
                $pdo->prepare("UPDATE invoices SET status = ?, updated_at = NOW() WHERE id = ? AND parent_id = ?")->execute([$newStatus, $invId, $pid]);

                // Send payment confirmation email to member (non-blocking)
                sendEmailsAsync($pid, function ($mailHelper) use ($pdo, $invId, $paymentAmount, $input, $total, $paid) {
                    $invInfo = $pdo->prepare("SELECT i.invoice_id, u.name, u.email FROM invoices i JOIN users u ON i.user_id = u.id WHERE i.id = ?");
                    $invInfo->execute([$invId]);
                    $invRow = $invInfo->fetch();
                    if ($invRow && $invRow['email']) {
                        $dueAmt = $total - $paid;
                        $mailHelper->sendPaymentReceived(
                            $invRow['email'],
                            $invRow['name'],
                            $invRow['invoice_id'],
                            $paymentAmount,
                            $input['payment_type'] ?? 'cash',
                            $input['payment_date'] ?? date('Y-m-d'),
                            $total,
                            $paid,
                            $dueAmt
                        );
                    }
                });

                respond(['success' => true], 201);
            }
            break;

        // ==================== LOCKERS ====================
        case 'lockers':
            requireAuth();
            $pid = getParentId();
            if ($method === 'GET') {
                $stmt = $pdo->prepare("SELECT l.*, u.name as assigned_user FROM lockers l LEFT JOIN assign_lockers al ON l.id = al.locker_id AND al.end_date IS NULL LEFT JOIN users u ON al.user_id = u.id WHERE l.parent_id = ? ORDER BY l.id");
                $stmt->execute([$pid]);
                respond(['lockers' => $stmt->fetchAll()]);
            }
            if ($method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $count = intval($input['count'] ?? 1);
                for ($i = 0; $i < $count; $i++) {
                    $pdo->prepare("INSERT INTO lockers (parent_id, status, available, created_at, updated_at) VALUES (?, 1, 1, NOW(), NOW())")->execute([$pid]);
                }
                respond(['success' => true, 'created' => $count], 201);
            }
            break;

        case 'assign_locker':
            requireAuth();
            $pid = getParentId();
            if ($method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $stmt = $pdo->prepare("INSERT INTO assign_lockers (user_id, locker_id, assign_date, end_date, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())");
                $stmt->execute([$input['user_id'], $input['locker_id'], $input['assign_date'] ?? date('Y-m-d'), $input['end_date'] ?? null]);
                $pdo->prepare("UPDATE lockers SET available = 0 WHERE id = ?")->execute([$input['locker_id']]);
                respond(['success' => true], 201);
            }
            if ($method === 'PUT') {
                $input = json_decode(file_get_contents('php://input'), true);
                $lockerId = intval($input['locker_id'] ?? 0);
                if (!$lockerId) respond(['error' => 'Locker ID required'], 400);
                // Close any active assignments for this locker
                $pdo->prepare("UPDATE assign_lockers SET end_date = CURDATE(), updated_at = NOW() WHERE locker_id = ? AND end_date IS NULL")->execute([$lockerId]);
                // Mark locker as available
                $pdo->prepare("UPDATE lockers SET available = 1, status = 1, updated_at = NOW() WHERE id = ?")->execute([$lockerId]);
                respond(['success' => true]);
            }
            break;

        // ==================== EVENTS ====================
        case 'events':
            requireAuth();
            $pid = getParentId();
            if ($method === 'GET') {
                $stmt = $pdo->prepare("SELECT e.*, et.name as type_name FROM events e LEFT JOIN event_types et ON e.event_type_id = et.id WHERE e.parent_id = ? ORDER BY e.start_date DESC");
                $stmt->execute([$pid]);
                respond(['events' => $stmt->fetchAll()]);
            }
            if ($method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $stmt = $pdo->prepare("INSERT INTO events (event_type_id, parent_id, title, start_date, end_date, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())");
                $stmt->execute([$input['event_type_id'] ?? null, $pid, $input['title'], $input['start_date'], $input['end_date'], $input['description'] ?? '', $input['status'] ?? 1]);
                respond(['success' => true, 'id' => $pdo->lastInsertId()], 201);
            }
            break;

        case 'event':
            requireAuth();
            $pid = getParentId();
            $id = getRequestId('id');
            if (!$id) respond(['error' => 'Event ID required'], 400);
            if ($method === 'DELETE') {
                $stmt = $pdo->prepare("DELETE FROM events WHERE id = ? AND parent_id = ?");
                $stmt->execute([$id, $pid]);
                if ($stmt->rowCount() > 0) respond(['success' => true]);
                else respond(['error' => 'Event not found'], 404);
            }
            break;

        // ==================== HEALTH RECORDS ====================
        case 'healths':
            requireAuth();
            $pid = getParentId();
            $user = currentUser();
            if ($method === 'GET') {
                $userId = $_GET['user_id'] ?? $user['id'];

                // Trainees can only see their own health records
                if ($user['type'] === 'trainee' && $userId != $user['id']) {
                    respond(['error' => 'Forbidden'], 403);
                }

                $stmt = $pdo->prepare("SELECT * FROM healths WHERE user_id = ? AND parent_id = ? ORDER BY measurement_date DESC");
                $stmt->execute([$userId, $pid]);
                respond(['records' => $stmt->fetchAll()]);
            }
            if ($method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $stmt = $pdo->prepare("INSERT INTO healths (user_id, measurement_date, result, notes, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())");
                $stmt->execute([$input['user_id'], $input['measurement_date'] ?? date('Y-m-d'), $input['result'] ?? '', $input['notes'] ?? '', $pid]);
                respond(['success' => true], 201);
            }
            if ($method === 'DELETE') {
                $id = getRequestId('id');
                if (!$id) respond(['error' => 'ID required'], 400);

                // Check ownership
                $check = $pdo->prepare("SELECT user_id FROM healths WHERE id = ? AND parent_id = ?");
                $check->execute([$id, $pid]);
                $record = $check->fetch();

                if (!$record) respond(['error' => 'Record not found'], 404);
                if ($user['type'] === 'trainee' && $record['user_id'] != $user['id']) respond(['error' => 'Forbidden'], 403);

                $pdo->prepare("DELETE FROM healths WHERE id = ?")->execute([$id]);
                respond(['success' => true]);
            }
            break;

        // ==================== PRODUCTS ====================
        case 'products':
            requireAuth();
            $pid = getParentId();
            if ($method === 'GET') {
                $stmt = $pdo->prepare("SELECT * FROM products WHERE parent_id = ? ORDER BY created_at DESC");
                $stmt->execute([$pid]);
                respond(['products' => $stmt->fetchAll()]);
            }
            if ($method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $stmt = $pdo->prepare("INSERT INTO products (parent_id, title, description, price, discount, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())");
                $stmt->execute([$pid, $input['title'], $input['description'] ?? '', $input['price'], $input['discount'] ?? null]);
                respond(['success' => true, 'id' => $pdo->lastInsertId()], 201);
            }
            break;

        case 'product':
            requireAuth();
            $pid = getParentId();
            $id = getRequestId('id');
            if (!$id) respond(['error' => 'Product ID required'], 400);
            if ($method === 'PUT') {
                $input = json_decode(file_get_contents('php://input'), true);
                $stmt = $pdo->prepare("UPDATE products SET title=?, description=?, price=?, discount=?, updated_at=NOW() WHERE id=? AND parent_id=?");
                $stmt->execute([$input['title'], $input['description'] ?? '', $input['price'], $input['discount'] ?? null, $id, $pid]);
                respond(['success' => true]);
            }
            if ($method === 'DELETE') {
                $stmt = $pdo->prepare("DELETE FROM products WHERE id = ? AND parent_id = ?");
                $stmt->execute([$id, $pid]);
                if ($stmt->rowCount() > 0) respond(['success' => true]);
                else respond(['error' => 'Product not found'], 404);
            }
            break;

        // ==================== NOTICE BOARD ====================
        case 'notices':
            requireAuth();
            $pid = getParentId();
            if ($method === 'GET') {
                $stmt = $pdo->prepare("SELECT * FROM notice_boards WHERE parent_id = ? ORDER BY created_at DESC");
                $stmt->execute([$pid]);
                respond(['notices' => $stmt->fetchAll()]);
            }
            if ($method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $stmt = $pdo->prepare("INSERT INTO notice_boards (title, description, attachment, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())");
                $stmt->execute([$input['title'], $input['description'] ?? '', $input['attachment'] ?? '', $pid]);
                respond(['success' => true], 201);
            }
            break;

        // ==================== SUBSCRIPTION PLANS ====================
        case 'subscription_plans':
            requireAuth();
            $pid = getParentId();

            // Get all subscription plans (global SaaS plans)
            $stmt = $pdo->prepare("SELECT id, title, package_amount, `interval`, user_limit, trainer_limit, trainee_limit, enabled_logged_history FROM subscriptions ORDER BY package_amount ASC");
            $stmt->execute();
            $plans = $stmt->fetchAll();

            // Get current gym's subscription info
            $subStmt = $pdo->prepare("SELECT s.id, s.title, s.package_amount, s.`interval`, s.user_limit, s.trainer_limit, s.trainee_limit, s.enabled_logged_history, u.subscription_expire_date FROM subscriptions s LEFT JOIN users u ON u.subscription = s.id WHERE u.id = ?");
            $subStmt->execute([$pid]);
            $current = $subStmt->fetch();

            // Calculate days left
            $daysLeft = null;
            $isExpired = false;
            if ($current && $current['subscription_expire_date']) {
                $daysLeft = ceil((strtotime($current['subscription_expire_date']) - time()) / 86400);
                $isExpired = $daysLeft < 0;
            }

            respond([
                'plans' => $plans,
                'current_subscription' => $current ?: null,
                'days_left' => $daysLeft,
                'is_expired' => $isExpired
            ]);
            break;

        // ==================== CATEGORIES ====================
        case 'categories':
            requireAuth();
            $pid = getParentId();
            if ($method === 'GET') {
                $stmt = $pdo->prepare("SELECT * FROM categories WHERE parent_id = ? OR parent_id = 0 ORDER BY title");
                $stmt->execute([$pid]);
                respond(['categories' => $stmt->fetchAll()]);
            }
            if ($method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $stmt = $pdo->prepare("INSERT INTO categories (title, parent_id, created_at, updated_at) VALUES (?, ?, NOW(), NOW())");
                $stmt->execute([$input['title'], $pid]);
                respond(['success' => true, 'id' => $pdo->lastInsertId()], 201);
            }
            break;

        // ==================== SETTINGS ====================
        case 'settings':
            requireAuth();
            $pid = getParentId();
            if ($method === 'GET') {
                // Exclude SMTP fields — they have their own dedicated endpoint
                $smtpFields = ['SERVER_HOST', 'SERVER_PORT', 'SERVER_USERNAME', 'SERVER_PASSWORD', 'SERVER_DRIVER', 'FROM_EMAIL', 'FROM_NAME'];
                $stmt = $pdo->prepare("SELECT * FROM settings WHERE parent_id = ?");
                $stmt->execute([$pid]);
                $settings = [];
                $hasQrSecret = false;
                foreach ($stmt->fetchAll() as $row) {
                    if (!in_array($row['name'], $smtpFields)) {
                        $settings[$row['name']] = $row['value'];
                    }
                    if ($row['name'] === 'attendance_qr_secret') $hasQrSecret = true;
                }

                // Ensure gym has a unique QR secret for attendance
                if (!$hasQrSecret) {
                    $secret = bin2hex(random_bytes(16));
                    $pdo->prepare("INSERT INTO settings (name, value, type, parent_id, created_at, updated_at) VALUES ('attendance_qr_secret', ?, 'text', ?, NOW(), NOW())")->execute([$secret, $pid]);
                    $settings['attendance_qr_secret'] = $secret;
                }

                // Also get admin user info for gym name/contact
                $adminStmt = $pdo->prepare("SELECT name, email, phone_number FROM users WHERE id = ?");
                $adminStmt->execute([$pid]);
                $adminInfo = $adminStmt->fetch();
                // Fill defaults from admin user if settings are empty
                if (empty($settings['gym_name']) && $adminInfo) $settings['gym_name'] = $adminInfo['name'] ?? '';
                if (empty($settings['phone']) && $adminInfo) $settings['phone'] = $adminInfo['phone_number'] ?? '';
                if (empty($settings['email']) && $adminInfo) $settings['email'] = $adminInfo['email'] ?? '';
                respond(['settings' => $settings]);
            }
            if ($method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                foreach ($input as $name => $value) {
                    $stmt = $pdo->prepare("INSERT INTO settings (name, value, type, parent_id, created_at, updated_at) VALUES (?, ?, 'text', ?, NOW(), NOW()) ON DUPLICATE KEY UPDATE value = ?, updated_at = NOW()");
                    $stmt->execute([$name, $value, $pid, $value]);
                }
                respond(['success' => true]);
            }
            break;

        // ==================== SETUP ====================
        case 'register':
            if ($method !== 'POST') respond(['error' => 'Method not allowed'], 405);
            $input = json_decode(file_get_contents('php://input'), true);

            $businessName = trim($input['business_name'] ?? '');
            $personalName = trim($input['name'] ?? '');
            $email = trim($input['email'] ?? '');
            $phone = trim($input['phone_number'] ?? '');
            $password = $input['password'] ?? '';

            if (!$businessName) respond(['error' => 'Business name is required'], 400);
            if (!$personalName) respond(['error' => 'Your name is required'], 400);
            if (!$email) respond(['error' => 'Email is required'], 400);
            if (!$password || strlen($password) < 6) respond(['error' => 'Password must be at least 6 characters'], 400);

            // Check if email already exists
            $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
            $stmt->execute([$email]);
            if ($stmt->fetch()) respond(['error' => 'An account with this email already exists'], 400);

            // Generate email verification token
            $verifyToken = bin2hex(random_bytes(32));

            // Create admin user with business name as user name (for gym branding)
            $stmt = $pdo->prepare("INSERT INTO users (name, email, phone_number, type, password, parent_id, is_active, email_verification_token, created_at, updated_at) VALUES (?, ?, ?, 'admin', ?, 0, 1, ?, NOW(), NOW())");
            $stmt->execute([$personalName, $email, $phone, password_hash($password, PASSWORD_BCRYPT), $verifyToken]);
            $adminId = $pdo->lastInsertId();
            // Set parent_id = 1 (superadmin) for all gyms — SaaS hierarchy under platform owner
            $pdo->prepare("UPDATE users SET parent_id = 1 WHERE id = ?")->execute([$adminId]);

            // Save business name in settings
            $pdo->prepare("INSERT INTO settings (name, value, type, parent_id, created_at, updated_at) VALUES ('company_name', ?, 'text', ?, NOW(), NOW())")->execute([$businessName, $adminId]);
            if ($phone) {
                $pdo->prepare("INSERT INTO settings (name, value, type, parent_id, created_at, updated_at) VALUES ('company_phone', ?, 'text', ?, NOW(), NOW()) ON DUPLICATE KEY UPDATE value = ?, updated_at = NOW()")->execute([$phone, $adminId, $phone]);
            }
            if ($email) {
                $pdo->prepare("INSERT INTO settings (name, value, type, parent_id, created_at, updated_at) VALUES ('company_email', ?, 'text', ?, NOW(), NOW()) ON DUPLICATE KEY UPDATE value = ?, updated_at = NOW()")->execute([$email, $adminId, $email]);
            }

            // Create default membership plans
            $pdo->prepare("INSERT INTO memberships (title, package, amount, parent_id, created_at, updated_at) VALUES ('Monthly Basic', 'monthly', 999, ?, NOW(), NOW())")->execute([$adminId]);
            $pdo->prepare("INSERT INTO memberships (title, package, amount, parent_id, created_at, updated_at) VALUES ('Quarterly', 'quarterly', 2499, ?, NOW(), NOW())")->execute([$adminId]);
            $pdo->prepare("INSERT INTO memberships (title, package, amount, parent_id, created_at, updated_at) VALUES ('Half-Yearly', 'half-yearly', 4499, ?, NOW(), NOW())")->execute([$adminId]);
            $pdo->prepare("INSERT INTO memberships (title, package, amount, parent_id, created_at, updated_at) VALUES ('Yearly Premium', 'yearly', 8999, ?, NOW(), NOW())")->execute([$adminId]);

            // Create default categories
            $pdo->prepare("INSERT INTO categories (title, parent_id, created_at, updated_at) VALUES ('General', ?, NOW(), NOW())")->execute([$adminId]);
            $pdo->prepare("INSERT INTO categories (title, parent_id, created_at, updated_at) VALUES ('VIP', ?, NOW(), NOW())")->execute([$adminId]);

            // Create default lockers
            for ($i = 1; $i <= 20; $i++) {
                $pdo->prepare("INSERT INTO lockers (parent_id, status, available, created_at, updated_at) VALUES (?, 1, 1, NOW(), NOW())")->execute([$adminId]);
            }

            // Assign 7-day free trial (weekly subscription plan)
            $trialPlanStmt = $pdo->prepare("SELECT id FROM subscriptions WHERE `interval` = 'weekly' LIMIT 1");
            $trialPlanStmt->execute();
            $trialPlan = $trialPlanStmt->fetch();
            if ($trialPlan) {
                $trialExpiry = date('Y-m-d', strtotime('+7 days'));
                $pdo->prepare("UPDATE users SET subscription = ?, subscription_expire_date = ? WHERE id = ?")
                    ->execute([$trialPlan['id'], $trialExpiry, $adminId]);
            }

            // Auto-login: set session and remember cookie
            $_SESSION['user_id'] = $adminId;
            $_SESSION['user_type'] = 'admin';
            setRememberCookie($adminId);

            // Return user data + subscription for the app to use
            $user = currentUser();
            unset($user['password']);
            unset($user['remember_token']);
            unset($user['twofa_secret']);
            $subStmt = $pdo->prepare("SELECT s.*, u.subscription_expire_date FROM subscriptions s LEFT JOIN users u ON u.subscription = s.id WHERE u.id = ?");
            $subStmt->execute([$adminId]);
            $subscription = $subStmt->fetch();

            // Send emails asynchronously (don't block the response, release session lock)
            sendEmailsAsync($adminId, function ($mailHelper) use ($email, $personalName, $verifyToken, $businessName) {
                $mailHelper->sendEmailVerification($email, $personalName, $verifyToken);
                $mailHelper->sendWelcomeEmail($email, $personalName, $businessName);
            });

            respond(['success' => true, 'user' => $user, 'subscription' => $subscription, 'message' => 'Registration successful']);
            break;

        // ==================== EMAIL VERIFICATION ====================
        case 'verify_email':
            $token = trim($_GET['token'] ?? '');
            if (!$token) {
                http_response_code(400);
                echo '<h2>Invalid verification link</h2>';
                exit;
            }
            $stmt = $pdo->prepare("SELECT id, name, email FROM users WHERE email_verification_token = ? AND email_verified_at IS NULL");
            $stmt->execute([$token]);
            $user = $stmt->fetch();
            if (!$user) {
                http_response_code(400);
                echo '<h2>Invalid or expired verification link</h2><p>This link may have already been used or is invalid.</p>';
                exit;
            }
            $pdo->prepare("UPDATE users SET email_verified_at = NOW(), email_verification_token = NULL WHERE id = ?")->execute([$user['id']]);
            header('Content-Type: text/html');
            echo '<div style="font-family:system-ui;max-width:460px;margin:80px auto;text-align:center;padding:40px;background:#fff;border-radius:16px;box-shadow:0 2px 12px rgba(0,0,0,0.1);">'
                . '<div style="font-size:48px;margin-bottom:16px;">✅</div>'
                . '<h2 style="color:#1A1A2E;margin:0 0 8px;">Email Verified!</h2>'
                . '<p style="color:#6B7280;font-size:15px;">Your email <strong>' . htmlspecialchars($user['email']) . '</strong> has been verified successfully.</p>'
                . '<p style="color:#9CA3AF;font-size:13px;margin-top:20px;">You can now close this page and log in to your GymXBook account.</p>'
                . '</div>';
            exit;

            // ==================== SMTP SETTINGS ====================
        case 'smtp_settings':
            requireAuth();
            // SMTP is always stored under parent_id = 1 (superadmin/global config)
            // DB column names: SERVER_HOST, SERVER_PORT, SERVER_USERNAME, SERVER_PASSWORD, SERVER_DRIVER, FROM_EMAIL, FROM_NAME
            $smtpPid = 1;
            $smtpFields = ['SERVER_HOST', 'SERVER_PORT', 'SERVER_USERNAME', 'SERVER_PASSWORD', 'SERVER_DRIVER', 'FROM_EMAIL', 'FROM_NAME'];
            if ($method === 'GET') {
                $stmt = $pdo->prepare("SELECT name, value FROM settings WHERE parent_id = ? AND name IN ('SERVER_HOST','SERVER_PORT','SERVER_USERNAME','SERVER_PASSWORD','SERVER_DRIVER','FROM_EMAIL','FROM_NAME')");
                $stmt->execute([$smtpPid]);
                $smtp = [];
                foreach ($stmt->fetchAll() as $row) {
                    // Mask password for security
                    if ($row['name'] === 'SERVER_PASSWORD' && $row['value']) {
                        $smtp[$row['name']] = '••••••••';
                    } else {
                        $smtp[$row['name']] = $row['value'];
                    }
                }
                respond(['smtp_settings' => $smtp]);
            }
            if ($method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                foreach ($smtpFields as $field) {
                    if (!isset($input[$field])) continue;
                    $value = $input[$field];
                    // Don't overwrite password with masked value
                    if ($field === 'SERVER_PASSWORD' && ($value === '••••••••' || $value === '')) continue;
                    $stmt = $pdo->prepare("INSERT INTO settings (name, value, type, parent_id, created_at, updated_at) VALUES (?, ?, 'text', ?, NOW(), NOW()) ON DUPLICATE KEY UPDATE value = ?, updated_at = NOW()");
                    $stmt->execute([$field, $value, $smtpPid, $value]);
                }
                // Test connection if requested
                $testResult = null;
                if (!empty($input['test_connection'])) {
                    /* Release session lock before SMTP test */
                    session_write_close();
                    try {
                        $mh = getMailHelper($smtpPid);
                        if ($mh) {
                            $testResult = $mh->testConnection();
                        } else {
                            $testResult = ['success' => false, 'message' => 'Could not initialize MailHelper.'];
                        }
                    } catch (\Exception $e) {
                        $testResult = ['success' => false, 'message' => 'Connection failed: ' . $e->getMessage()];
                    } catch (\Error $e) {
                        $testResult = ['success' => false, 'message' => 'Connection failed: ' . $e->getMessage()];
                    }
                }
                respond(['success' => true, 'test_result' => $testResult]);
            }
            break;

        // ==================== CASHFREE PAYMENT ====================
        case 'create_subscription_order':
            requireAuth();
            $pid = getParentId();
            if ($method !== 'POST') respond(['error' => 'Method not allowed'], 405);
            $input = json_decode(file_get_contents('php://input'), true);
            $planId = intval($input['plan_id'] ?? 0);
            $orderType = $input['type'] ?? '';
            if (!$planId || !in_array($orderType, ['renew', 'upgrade'])) respond(['error' => 'Invalid plan or type'], 400);

            $planStmt = $pdo->prepare("SELECT * FROM subscriptions WHERE id = ?");
            $planStmt->execute([$planId]);
            $plan = $planStmt->fetch();
            if (!$plan) respond(['error' => 'Plan not found'], 404);
            $amount = floatval($plan['package_amount']);
            if ($amount <= 0) respond(['error' => 'Invalid plan amount'], 400);

            // Get gym admin info for customer details
            $adminStmt = $pdo->prepare("SELECT name, email, phone_number FROM users WHERE id = ?");
            $adminStmt->execute([$pid]);
            $admin = $adminStmt->fetch();
            $customerName = $admin['name'] ?? 'Gym Owner';
            $customerEmail = $admin['email'] ?? 'owner@gymxbook.com';
            $customerPhone = preg_replace('/[^0-9]/', '', $admin['phone_number'] ?? '');
            if (strlen($customerPhone) < 10) $customerPhone = '9999999999';

            $orderId = 'GXB_' . $pid . '_' . $planId . '_' . $orderType . '_' . time();
            $linkId = 'gxb_link_' . $pid . '_' . $planId . '_' . time();

            // Build return_url — Cashfree hosted checkout redirects here after payment
            // This prevents the "No order found by id null" sandbox bug
            $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
            $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
            $basePath = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/');
            $returnUrl = $protocol . '://' . $host . $basePath . '/payment-done.html';
            $linkExpiry = gmdate('Y-m-d\TH:i:s+05:30', time() + 19800 + 1800); // 30 min from now IST

            $linkData = [
                'link_id' => $linkId,
                'link_amount' => $amount,
                'link_currency' => 'INR',
                'link_purpose' => 'GymXBook ' . ucfirst($orderType) . ' - ' . $plan['title'],
                'link_expiry_time' => $linkExpiry,
                'customer_details' => [
                    'customer_name' => $customerName,
                    'customer_email' => $customerEmail,
                    'customer_phone' => $customerPhone
                ],
                'link_notify' => [
                    'send_email' => false,
                    'send_sms' => false
                ],
                'link_meta' => [
                    'return_url' => $returnUrl,
                    'upi_intent' => true
                ],
                'link_notes' => [
                    'order_id' => $orderId,
                    'plan_id' => (string)$planId,
                    'order_type' => $orderType,
                    'parent_id' => (string)$pid
                ]
            ];

            $result = callCashfreeAPI('POST', '/pg/links', $linkData);

            if (($result['status'] === 200 || $result['status'] === 201) && isset($result['data']['link_url'])) {
                ensureSubscriptionOrdersTable();
                $linkUrl = $result['data']['link_url'];
                $cfLinkId = $result['data']['cf_link_id'] ?? null;
                $insertStmt = $pdo->prepare("INSERT INTO subscription_orders (order_id, parent_id, plan_id, order_type, amount, status, link_id, link_url, cf_order_id) VALUES (?, ?, ?, ?, ?, 'CREATED', ?, ?, ?)");
                $insertStmt->execute([$orderId, $pid, $planId, $orderType, $amount, $linkId, $linkUrl, $cfLinkId]);
                respond(['success' => true, 'order_id' => $orderId, 'link_url' => $linkUrl, 'amount' => $amount]);
            } else {
                $errMsg = $result['data']['message'] ?? $result['curl_error'] ?? 'Failed to create payment link';
                respond(['error' => $errMsg, 'details' => $result['data'] ?? null], 400);
            }
            break;

        case 'verify_subscription_payment':
            requireAuth();
            $pid = getParentId();
            $orderId = $_GET['order_id'] ?? '';
            if (!$orderId) respond(['error' => 'Order ID required'], 400);

            ensureSubscriptionOrdersTable();
            $orderStmt = $pdo->prepare("SELECT * FROM subscription_orders WHERE order_id = ? AND parent_id = ?");
            $orderStmt->execute([$orderId, $pid]);
            $order = $orderStmt->fetch();
            if (!$order) respond(['error' => 'Order not found'], 404);

            // Already paid in our DB
            if ($order['status'] === 'PAID') {
                $userStmt = $pdo->prepare("SELECT subscription, subscription_expire_date FROM users WHERE id = ?");
                $userStmt->execute([$pid]);
                $u = $userStmt->fetch();
                $planStmt2 = $pdo->prepare("SELECT title FROM subscriptions WHERE id = ?");
                $planStmt2->execute([$order['plan_id']]);
                $p2 = $planStmt2->fetch();
                respond(['success' => true, 'status' => 'PAID', 'plan_title' => $p2['title'] ?? '', 'new_expiry' => $u['subscription_expire_date'] ?? null]);
            }

            // Already marked failed/cancelled/dropped in our DB
            if (in_array($order['status'], ['FAILED', 'CANCELLED', 'EXPIRED', 'USER_DROPPED'])) {
                respond(['success' => false, 'status' => $order['status'], 'message' => 'Payment ' . strtolower($order['status']) . '. Please try again.']);
            }

            // Helper: activate subscription after successful payment
            $activateSubscription = function () use ($order, $pid, $orderId, $pdo) {
                $planId = $order['plan_id'];
                $planStmt = $pdo->prepare("SELECT * FROM subscriptions WHERE id = ?");
                $planStmt->execute([$planId]);
                $plan = $planStmt->fetch();
                $userStmt = $pdo->prepare("SELECT subscription, subscription_expire_date FROM users WHERE id = ?");
                $userStmt->execute([$pid]);
                $user = $userStmt->fetch();
                $newExpiry = calcSubscriptionExpiry($user['subscription_expire_date'] ?? null, $plan['interval'] ?? 'monthly');
                $updateStmt = $pdo->prepare("UPDATE users SET subscription = ?, subscription_expire_date = ?, updated_at = NOW() WHERE id = ?");
                $updateStmt->execute([$planId, $newExpiry, $pid]);
                $orderUpd = $pdo->prepare("UPDATE subscription_orders SET status = 'PAID', updated_at = NOW() WHERE order_id = ?");
                $orderUpd->execute([$orderId]);
                return ['success' => true, 'status' => 'PAID', 'plan_title' => $plan['title'] ?? '', 'new_expiry' => $newExpiry];
            };

            $linkId = $order['link_id'];
            if (!$linkId) respond(['error' => 'No payment link found'], 400);

            // STEP 1: Check payment link status
            $linkResult = callCashfreeAPI('GET', '/pg/links/' . $linkId);
            $linkData = $linkResult['data'] ?? [];
            $linkStatus = $linkData['link_status'] ?? 'UNKNOWN';

            // Link is PAID — payment succeeded
            if ($linkStatus === 'PAID') {
                respond($activateSubscription());
            }

            // Link is EXPIRED or CANCELLED
            if ($linkStatus === 'EXPIRED' || $linkStatus === 'CANCELLED') {
                $orderUpd = $pdo->prepare("UPDATE subscription_orders SET status = ?, updated_at = NOW() WHERE order_id = ?");
                $orderUpd->execute([$linkStatus, $orderId]);
                respond(['success' => false, 'status' => $linkStatus, 'message' => 'Payment link ' . strtolower($linkStatus) . '. Please try again.']);
            }

            // STEP 2: Link is ACTIVE — get orders created on this link
            $ordersResult = callCashfreeAPI('GET', '/pg/links/' . $linkId . '/orders');
            $ordersRaw = $ordersResult['data'] ?? [];

            // Handle response formats: plain array [...], {orders:[...]}, or {data:[...]}
            $linkOrders = [];
            if (is_array($ordersRaw) && isset($ordersRaw[0]) && is_array($ordersRaw[0])) {
                $linkOrders = $ordersRaw;
            } elseif (is_array($ordersRaw) && isset($ordersRaw['orders']) && is_array($ordersRaw['orders'])) {
                $linkOrders = $ordersRaw['orders'];
            } elseif (is_array($ordersRaw) && isset($ordersRaw['data']) && is_array($ordersRaw['data'])) {
                $linkOrders = $ordersRaw['data'];
            } elseif (is_array($ordersRaw) && isset($ordersRaw['order_id'])) {
                $linkOrders = [$ordersRaw];
            }

            if (!empty($linkOrders)) {
                $latest = end($linkOrders);
                $cfOrderId = $latest['order_id'] ?? '';
                $cfOrderStatus = $latest['order_status'] ?? '';

                // Order level PAID
                if ($cfOrderStatus === 'PAID') {
                    respond($activateSubscription());
                }

                if ($cfOrderId) {
                    // STEP 3: Check payments for this Cashfree order
                    $payResult = callCashfreeAPI('GET', '/pg/orders/' . $cfOrderId . '/payments');
                    $payRaw = $payResult['data'] ?? [];

                    $payments = [];
                    if (is_array($payRaw) && isset($payRaw[0]) && is_array($payRaw[0])) {
                        $payments = $payRaw;
                    } elseif (is_array($payRaw) && isset($payRaw['payment_status'])) {
                        $payments = [$payRaw];
                    }

                    if (!empty($payments)) {
                        // Check all payments for SUCCESS
                        foreach ($payments as $p) {
                            if (($p['payment_status'] ?? '') === 'SUCCESS') {
                                respond($activateSubscription());
                            }
                        }

                        // Latest payment status
                        $latestPay = end($payments);
                        $payStatus = $latestPay['payment_status'] ?? '';

                        if ($payStatus === 'FAILED') {
                            $pdo->prepare("UPDATE subscription_orders SET status = 'FAILED', updated_at = NOW() WHERE order_id = ?")->execute([$orderId]);
                            respond(['success' => false, 'status' => 'FAILED', 'message' => 'Payment failed. Please try again.']);
                        }
                        if ($payStatus === 'USER_DROPPED') {
                            $pdo->prepare("UPDATE subscription_orders SET status = 'USER_DROPPED', updated_at = NOW() WHERE order_id = ?")->execute([$orderId]);
                            respond(['success' => false, 'status' => 'USER_DROPPED', 'message' => 'Payment was cancelled. Please try again.']);
                        }
                        if ($payStatus === 'CANCELLED' || $payStatus === 'VOID') {
                            $pdo->prepare("UPDATE subscription_orders SET status = 'FAILED', updated_at = NOW() WHERE order_id = ?")->execute([$orderId]);
                            respond(['success' => false, 'status' => 'FAILED', 'message' => 'Payment was cancelled. Please try again.']);
                        }
                        if ($payStatus === 'PENDING' || $payStatus === 'NOT_ATTEMPTED' || $payStatus === 'FLAGGED') {
                            respond(['success' => false, 'status' => 'PENDING', 'message' => 'Payment is being processed...']);
                        }
                    }

                    // STEP 4: No payments but order exists — check order directly
                    $orderDetail = callCashfreeAPI('GET', '/pg/orders/' . $cfOrderId);
                    $odStatus = ($orderDetail['data'] ?? [])['order_status'] ?? '';
                    if ($odStatus === 'PAID') respond($activateSubscription());
                    if ($odStatus === 'EXPIRED' || $odStatus === 'TERMINATED') {
                        $pdo->prepare("UPDATE subscription_orders SET status = 'EXPIRED', updated_at = NOW() WHERE order_id = ?")->execute([$orderId]);
                        respond(['success' => false, 'status' => 'EXPIRED', 'message' => 'Payment session expired.']);
                    }
                }
            }

            // Still waiting — no orders yet, or still ACTIVE
            respond(['success' => false, 'status' => 'PENDING', 'message' => 'Awaiting payment...']);

        case 'cancel_subscription_order':
            // User explicitly cancels a pending payment from the PWA
            requireAuth();
            $pid = getParentId();
            $orderId = $_GET['order_id'] ?? '';
            if (!$orderId) respond(['error' => 'Order ID required'], 400);

            ensureSubscriptionOrdersTable();
            $orderStmt = $pdo->prepare("SELECT * FROM subscription_orders WHERE order_id = ? AND parent_id = ?");
            $orderStmt->execute([$orderId, $pid]);
            $order = $orderStmt->fetch();
            if (!$order) respond(['error' => 'Order not found'], 404);
            if ($order['status'] === 'PAID') respond(['error' => 'Cannot cancel a paid order'], 400);

            $orderUpd = $pdo->prepare("UPDATE subscription_orders SET status = 'USER_DROPPED', updated_at = NOW() WHERE order_id = ? AND parent_id = ?");
            $orderUpd->execute([$orderId, $pid]);
            respond(['success' => true, 'status' => 'USER_DROPPED', 'message' => 'Payment cancelled.']);

        case 'debug_verify':
            // Debug endpoint — returns raw Cashfree API responses for troubleshooting
            requireAuth();
            $pid = getParentId();
            $orderId = $_GET['order_id'] ?? '';
            if (!$orderId) respond(['error' => 'Order ID required'], 400);

            ensureSubscriptionOrdersTable();
            $orderStmt = $pdo->prepare("SELECT * FROM subscription_orders WHERE order_id = ? AND parent_id = ?");
            $orderStmt->execute([$orderId, $pid]);
            $order = $orderStmt->fetch();
            if (!$order) respond(['error' => 'Order not found'], 404);

            $debug = ['order_db' => $order];

            // Check order via Orders API
            $orderResult = callCashfreeAPI('GET', '/pg/orders/' . $orderId);
            $debug['order_api_status'] = $orderResult['status'];
            $debug['order_api_data'] = $orderResult['data'];

            // Check payments
            $payResult = callCashfreeAPI('GET', '/pg/orders/' . $orderId . '/payments');
            $debug['payments_api_status'] = $payResult['status'];
            $debug['payments_api_data'] = $payResult['data'];

            respond(['debug' => $debug]);
            break;

        case 'cashfree_webhook':
            $rawBody = file_get_contents('php://input');
            $signature = $_SERVER['HTTP_X_WEBHOOK_SIGNATURE'] ?? '';
            $timestamp = $_SERVER['HTTP_X_WEBHOOK_TIMESTAMP'] ?? '';
            $computedSig = hash_hmac('sha256', $timestamp . $rawBody, CASHFREE_SECRET_KEY);
            if (!hash_equals($computedSig, $signature)) {
                http_response_code(401);
                exit('Invalid signature');
            }
            $data = json_decode($rawBody, true);
            $cfOrderId = $data['data']['order']['order_id'] ?? '';
            $cfStatus = $data['data']['payment']['payment_status'] ?? ($data['data']['order']['order_status'] ?? '');
            if (($cfStatus === 'SUCCESS' || $cfStatus === 'PAID') && $cfOrderId) {
                ensureSubscriptionOrdersTable();
                $orderStmt = $pdo->prepare("SELECT * FROM subscription_orders WHERE order_id = ? AND status != 'PAID'");
                $orderStmt->execute([$cfOrderId]);
                $order = $orderStmt->fetch();
                if ($order) {
                    $planId = $order['plan_id'];
                    $pid = $order['parent_id'];
                    $planStmt = $pdo->prepare("SELECT * FROM subscriptions WHERE id = ?");
                    $planStmt->execute([$planId]);
                    $plan = $planStmt->fetch();
                    $userStmt = $pdo->prepare("SELECT subscription_expire_date FROM users WHERE id = ?");
                    $userStmt->execute([$pid]);
                    $user = $userStmt->fetch();
                    $newExpiry = calcSubscriptionExpiry($user['subscription_expire_date'] ?? null, $plan['interval'] ?? 'monthly');
                    $pdo->prepare("UPDATE users SET subscription = ?, subscription_expire_date = ?, updated_at = NOW() WHERE id = ?")->execute([$planId, $newExpiry, $pid]);
                    $pdo->prepare("UPDATE subscription_orders SET status = 'PAID', updated_at = NOW() WHERE order_id = ?")->execute([$cfOrderId]);
                }
            } elseif ($cfOrderId) {
                ensureSubscriptionOrdersTable();
                $pdo->prepare("UPDATE subscription_orders SET status = ?, updated_at = NOW() WHERE order_id = ?")->execute([in_array($cfStatus, ['FAILED', 'CANCELLED']) ? $cfStatus : 'UNKNOWN', $cfOrderId]);
            }
            respond(['success' => true]);
            break;

        // ==================== WORKOUT ACTIVITIES ====================
        case 'workout_activities':
            requireAuth();
            $pid = getParentId();
            if ($method === 'GET') {
                $stmt = $pdo->prepare("SELECT * FROM workout_activities WHERE parent_id = ? ORDER BY title");
                $stmt->execute([$pid]);
                respond(['activities' => $stmt->fetchAll()]);
            }
            if ($method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $stmt = $pdo->prepare("INSERT INTO workout_activities (title, parent_id, created_at, updated_at) VALUES (?, ?, NOW(), NOW())");
                $stmt->execute([$input['title'], $pid]);
                respond(['success' => true, 'id' => $pdo->lastInsertId()], 201);
            }
            break;

        case 'workout_activity':
            requireAuth();
            $pid = getParentId();
            $id = getRequestId('id');
            if ($method === 'DELETE') {
                $pdo->prepare("DELETE FROM workout_activities WHERE id = ? AND parent_id = ?")->execute([$id, $pid]);
                respond(['success' => true]);
            }
            break;

        // ==================== WORKOUT PLANS ====================
        case 'workouts':
            requireAuth();
            $pid = getParentId();
            $user = currentUser();
            if ($method === 'GET') {
                if ($user['type'] === 'trainee') {
                    $stmt = $pdo->prepare("SELECT * FROM workouts WHERE assign_id = ? AND parent_id = ? ORDER BY created_at DESC LIMIT 1");
                    $stmt->execute([$user['id'], $pid]);
                } else {
                    $assignId = $_GET['user_id'] ?? 0;
                    $stmt = $pdo->prepare("SELECT * FROM workouts WHERE assign_id = ? AND parent_id = ? ORDER BY created_at DESC");
                    $stmt->execute([$assignId, $pid]);
                }
                respond(['workouts' => $stmt->fetchAll()]);
            }
            if ($method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                $stmt = $pdo->prepare("INSERT INTO workouts (assign_to, assign_id, start_date, end_date, workout_history, notes, parent_id, created_at, updated_at) VALUES ('member', ?, ?, ?, ?, ?, ?, NOW(), NOW())");
                $stmt->execute([
                    $input['user_id'],
                    $input['start_date'] ?? date('Y-m-d'),
                    $input['end_date'] ?? null,
                    $input['workout_plan'], // JSON string
                    $input['notes'] ?? '',
                    $pid
                ]);
                respond(['success' => true, 'id' => $pdo->lastInsertId()], 201);
            }
            break;

        // ==================== NOTIFICATIONS ====================
        // ==================== NOTIFICATIONS ====================
        case 'notifications':
            requireAuth();
            $user = currentUser();
            $pid = ($user['type'] === 'admin' || $user['type'] === 'owner') ? $user['id'] : ($user['parent_id'] ?: 0);
            ensureNotificationsTable();

            if ($method === 'GET') {
                if ($pid === 0) respond(['notifications' => [], 'unread_count' => 0]);

                $stmt = $pdo->prepare("SELECT * FROM app_notifications WHERE parent_id = ? ORDER BY created_at DESC LIMIT 50");
                $stmt->execute([$pid]);
                $notifs = $stmt->fetchAll() ?: [];

                // For this app, unread count is simply the total count since we delete on read
                $unread = count($notifs);

                respond(['notifications' => $notifs, 'unread_count' => $unread]);
            }

            if ($method === 'POST') {
                if ($pid > 0) {
                    // Delete all notifications for this gym once they are viewed
                    $pdo->prepare("DELETE FROM app_notifications WHERE parent_id = ?")->execute([$pid]);
                }
                respond(['success' => true]);
            }
            break;

        default:
            respond(['error' => 'Invalid action'], 400);
    }
} catch (PDOException $e) {
    error_log('API PDO Error: ' . $e->getMessage());
    respond(['error' => 'Database error: ' . $e->getMessage()], 500);
} catch (Exception $e) {
    error_log('API Error: ' . $e->getMessage());
    respond(['error' => 'Server error: ' . $e->getMessage()], 500);
} catch (Error $e) {
    error_log('API Fatal: ' . $e->getMessage());
    respond(['error' => 'Server error'], 500);
}
