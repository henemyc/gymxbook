<?php
session_start();

define('DB_HOST', 'localhost');
define('DB_NAME', 'softovit1_gymxbook');
define('DB_USER', 'softovit1_gymxbook');
define('DB_PASS', 'Gymx@77690');
define('COOKIE_NAME', 'gymxbook_remember');
define('COOKIE_EXPIRY', 30); // days


try {
    $pdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4", DB_USER, DB_PASS);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    die(json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]));
}

function isLoggedIn()
{
    return isset($_SESSION['user_id']);
}

function requireAuth()
{
    if (!isLoggedIn()) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }
}

function currentUser()
{
    global $pdo;
    if (!isLoggedIn()) return null;
    // Removed is_active filter — login already checks is_active, and
    // already-authenticated sessions should survive a deactivation toggle
    // so that admins (or members) can still be re-activated from the UI.
    $stmt = $pdo->prepare("SELECT * FROM users WHERE id = ?");
    $stmt->execute([$_SESSION['user_id']]);
    return $stmt->fetch();
}

// FIX #2: Correct multi-tenant parent_id resolution
// Admin users have parent_id=0 or parent_id=their_own_id
// Trainers/Trainees have parent_id=admin_user_id
// We always need the admin's user ID for filtering
function getParentId()
{
    $user = currentUser();
    if (!$user) return 0;
    // If user is admin, their own ID is the parent_id for all data
    if (in_array($user['type'], ['admin', 'owner'])) {
        return $user['id'];
    }
    // Otherwise, their parent_id points to the admin
    return $user['parent_id'] ?: 0;
}

// FIX #8: Cookie-based "Remember Me" login
function setRememberCookie($userId)
{
    $token = bin2hex(random_bytes(32));
    $hash = hash('sha256', $token);
    global $pdo;
    $stmt = $pdo->prepare("UPDATE users SET remember_token = ? WHERE id = ?");
    $stmt->execute([$hash, $userId]);
    setcookie(COOKIE_NAME, $userId . ':' . $token, [
        'expires' => time() + (COOKIE_EXPIRY * 86400),
        'path' => '/',
        'httponly' => true,
        'samesite' => 'Lax'
    ]);
}

function clearRememberCookie()
{
    if (isset($_COOKIE[COOKIE_NAME])) {
        $parts = explode(':', $_COOKIE[COOKIE_NAME]);
        if (count($parts) === 2) {
            global $pdo;
            $stmt = $pdo->prepare("UPDATE users SET remember_token = NULL WHERE id = ?");
            $stmt->execute([$parts[0]]);
        }
        setcookie(COOKIE_NAME, '', time() - 3600, '/');
    }
}

function checkRememberCookie()
{
    if (isLoggedIn()) return true;
    if (!isset($_COOKIE[COOKIE_NAME])) return false;
    $parts = explode(':', $_COOKIE[COOKIE_NAME]);
    if (count($parts) !== 2) return false;
    list($userId, $token) = $parts;
    $hash = hash('sha256', $token);
    global $pdo;
    $stmt = $pdo->prepare("SELECT * FROM users WHERE id = ? AND remember_token = ? AND is_active = 1");
    $stmt->execute([$userId, $hash]);
    $user = $stmt->fetch();
    if ($user) {
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['user_type'] = $user['type'];
        // Allow login even with expired subscription — the PWA overlay handles the rest
        return true;
    }
    clearRememberCookie();
    return false;
}

// Auto-login from cookie on every request
checkRememberCookie();

function respond($data, $code = 200)
{
    /* Discard any stray output (PHP warnings, notices, etc.) that would corrupt JSON */
    if (ob_get_level()) ob_clean();
    http_response_code($code);
    echo json_encode($data);
    exit;
}
