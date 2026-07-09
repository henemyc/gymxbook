/* ========================================
   GymXBook PWA v2.0 - Main Application JS
   ======================================== */

const API = "api.php";
const CASHFREE_SANDBOX = true;
// Cashfree SDK not needed — Payment Links API gives us a simple URL
let currentPage = ""; // Start empty — first navigate() must always proceed
let memberFilter = "all";
let invoiceFilter = "all";
let expMonth, expYear;
let txnMonth, txnYear;
let membershipsCache = [];
let trainersCache = [];
let expensesCache = [];
let classesCache = [];
let currentUserData = null;
let subscriptionExpired = false;
let subscriptionExpiringSoon = false;
let subscriptionDaysLeft = null;
let isOnline = navigator.onLine;
let isNavigatingBack = false;

// Safe JSON fetch wrapper — handles non-JSON responses gracefully
async function apiFetch(url, options = {}) {
    const res = await fetch(url, options);
    const text = await res.text();
    try {
        const data = JSON.parse(text);
        return { ok: res.ok, status: res.status, data };
    } catch (e) {
        console.error("API returned non-JSON:", text.substring(0, 200));
        return {
            ok: false,
            status: res.status,
            data: { error: "Server returned invalid response" },
        };
    }
}

// Format Date to 23-10-2026
function formatDate(dateStr) {
    if (!dateStr) return "-";
    // If it's already in DD-MM-YYYY format, return it
    if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) return dateStr;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
}

// Format Time to 10:30 AM
function formatTime(timeStr) {
    if (!timeStr) return "-";
    // If it already has AM/PM, return it
    if (/AM$|PM$/i.test(timeStr)) return timeStr;
    const parts = timeStr.split(":");
    if (parts.length < 2) return timeStr;
    let h = parseInt(parts[0]);
    const m = parts[1];
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12;
    h = h ? h : 12;
    return `${h}:${m} ${ampm}`;
}

// Get today's date in local timezone (fixes toISOString UTC bug)
function getLocalDate(date) {
    if (!date) date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

// ==================== SKELETON HELPERS ====================
function skCard() {
    return `<div class="sk-card"><div class="sk sk-avatar"></div><div class="sk-lines"><div class="sk sk-line sk-line-w70"></div><div class="sk sk-line sk-line-w40"></div></div><div class="sk sk-badge"></div></div>`;
}
function skStatCard() {
    return `<div class="sk-stat"><div class="sk sk-stat-icon"></div><div class="sk-stat-lines"><div class="sk sk-stat-val"></div><div class="sk sk-stat-label"></div></div></div>`;
}
function skRevenueCard() {
    return `<div class="sk-rev"><div class="sk sk-rev-icon"></div><div class="sk-rev-lines"><div class="sk sk-rev-val"></div><div class="sk sk-rev-label"></div></div></div>`;
}
function skPlanCard() {
    return `<div class="sk-plan"><div class="sk-plan-head"><div class="sk sk-plan-title"></div><div class="sk sk-plan-price"></div></div><div class="sk-plan-limits"><div class="sk sk-plan-limit"></div><div class="sk sk-plan-limit"></div><div class="sk sk-plan-limit"></div></div></div>`;
}
function skSubCard() {
    return `<div class="sk-sub"></div>`;
}
function skExpenseItem() {
    return `<div class="sk-expense"><div class="sk sk-expense-icon"></div><div class="sk-expense-lines"><div class="sk sk-line sk-line-w70"></div><div class="sk sk-line sk-line-w40"></div></div><div class="sk sk-expense-val"></div></div>`;
}
function skInvoiceCard() {
    return `<div class="sk-invoice"><div class="sk sk-invoice-id"></div><div class="sk-invoice-lines"><div class="sk sk-line sk-line-w60"></div><div class="sk sk-line sk-line-w40"></div></div><div class="sk sk-invoice-status"></div></div>`;
}
function skTxnItem() {
    return `<div class="sk-txn"><div class="sk sk-txn-icon"></div><div class="sk-txn-lines"><div class="sk sk-line sk-line-w70"></div><div class="sk sk-line sk-line-w50"></div></div><div class="sk sk-txn-amount"></div></div>`;
}
function skClassCard() {
    return `<div class="sk-class"><div class="sk sk-class-accent"></div><div class="sk-class-body"><div class="sk sk-class-title"></div><div class="sk sk-class-info"></div></div></div>`;
}
function skEventCard() {
    return `<div class="sk-event"><div class="sk sk-event-accent"></div><div class="sk-event-body"><div class="sk sk-event-title"></div><div class="sk sk-event-date"></div><div class="sk sk-event-desc"></div></div></div>`;
}
function skNoticeCard() {
    return `<div class="sk-notice"><div class="sk sk-notice-title"></div><div class="sk sk-notice-desc"></div><div class="sk sk-notice-date"></div></div>`;
}
function skProductCard() {
    return `<div class="sk-product"><div class="sk sk-product-icon"></div><div class="sk-product-lines"><div class="sk sk-line sk-line-w60"></div><div class="sk sk-line sk-line-w40"></div></div></div>`;
}
function skCheckinItem() {
    return `<div class="sk-checkin"><div class="sk sk-checkin-time"></div><div class="sk sk-checkin-name"></div><div class="sk sk-checkin-badge"></div></div>`;
}
function skReportStat() {
    return `<div class="sk-report-stat"><div class="sk sk-report-val"></div><div class="sk sk-report-label"></div></div>`;
}
function skAttStat() {
    return `<div class="sk-att-stat"><div class="sk sk-att-stat-val"></div><div class="sk sk-att-stat-label"></div></div>`;
}
function skLockerItem() {
    return `<div class="sk sk-locker"></div>`;
}
function skSettingItem() {
    return `<div class="sk-setting"><div class="sk sk-setting-icon"></div><div class="sk-setting-lines"><div class="sk sk-line sk-line-w50"></div><div class="sk sk-line sk-line-w80"></div></div></div>`;
}

// Dashboard skeleton
function skeletonDashboard() {
    return `<div class="stats-grid">${skStatCard()}${skStatCard()}${skStatCard()}${skStatCard()}</div>
        <div class="revenue-row">${skRevenueCard()}${skRevenueCard()}</div>
        <div class="section-header"><h2>Quick Actions</h2></div>
        <div class="quick-actions"><div class="sk sk-quick"></div><div class="sk sk-quick"></div><div class="sk sk-quick"></div><div class="sk sk-quick"></div></div>
        <div class="section-header"><h2>Recent Members</h2></div>
        ${skCard()}${skCard()}${skCard()}
        <div class="section-header"><h2>Today's Check-ins</h2></div>
        ${skCheckinItem()}${skCheckinItem()}`;
}
// Members skeleton
function skeletonMembers(n) {
    return Array(n || 5)
        .fill(0)
        .map(() => skCard())
        .join("");
}
// Trainers skeleton
function skeletonTrainers(n) {
    return Array(n || 3)
        .fill(0)
        .map(() => skCard())
        .join("");
}
// Plans skeleton
function skeletonPlans(n) {
    return Array(n || 3)
        .fill(0)
        .map(() => skPlanCard())
        .join("");
}
// Subscription skeleton
function skeletonSubscription() {
    return `${skSubCard()}<div class="sub-plans-title">Available Plans</div>${skPlanCard()}${skPlanCard()}`;
}
// Reports skeleton
function skeletonReports() {
    return `<div class="report-stats">${skReportStat()}${skReportStat()}${skReportStat()}${skReportStat()}</div>
        <div class="report-stats">${skReportStat()}${skReportStat()}${skReportStat()}${skReportStat()}</div>
        ${skCard()}${skCard()}`;
}
// Expenses skeleton
function skeletonExpenses() {
    return `<div class="sk-rev" style="margin-bottom:16px"><div class="sk sk-expense-icon" style="background:var(--surface2)"></div><div class="sk-expense-lines"><div class="sk sk-line sk-line-w60"></div><div class="sk sk-line sk-line-w40"></div></div></div>${skExpenseItem()}${skExpenseItem()}${skExpenseItem()}`;
}
// Invoices skeleton
function skeletonInvoices(n) {
    return Array(n || 4)
        .fill(0)
        .map(() => skInvoiceCard())
        .join("");
}
// Transactions skeleton
function skeletonTransactions() {
    return `<div class="revenue-row">${skRevenueCard()}${skRevenueCard()}</div>${skTxnItem()}${skTxnItem()}${skTxnItem()}${skTxnItem()}`;
}
// Classes skeleton
function skeletonClasses(n) {
    return Array(n || 3)
        .fill(0)
        .map(() => skClassCard())
        .join("");
}
// Events skeleton
function skeletonEvents(n) {
    return Array(n || 2)
        .fill(0)
        .map(() => skEventCard())
        .join("");
}
// Products skeleton
function skeletonProducts(n) {
    return Array(n || 3)
        .fill(0)
        .map(() => skProductCard())
        .join("");
}
// Notices skeleton
function skeletonNotices(n) {
    return Array(n || 2)
        .fill(0)
        .map(() => skNoticeCard())
        .join("");
}
// Lockers skeleton
function skeletonLockers() {
    return `<div class="lockers-grid">${Array(8)
        .fill(0)
        .map(() => skLockerItem())
        .join("")}</div>`;
}
// Settings skeleton
function skeletonSettings() {
    return `${skSettingItem()}${skSettingItem()}${skSettingItem()}${skSettingItem()}`;
}
// Attendance skeleton
function skeletonAttendance() {
    return `<div class="attendance-header"><div class="att-stats">${skAttStat()}${skAttStat()}${skAttStat()}</div></div><div class="sk" style="height:46px;border-radius:var(--radius-full);margin-bottom:12px"></div>${skCheckinItem()}${skCheckinItem()}${skCheckinItem()}`;
}

// ==================== INIT ====================
document.addEventListener("DOMContentLoaded", () => {
    expMonth = new Date().getMonth() + 1;
    expYear = new Date().getFullYear();
    txnMonth = new Date().getMonth() + 1;
    txnYear = new Date().getFullYear();

    // Initially disable next month button for transactions (starts on current month)
    setTimeout(() => {
        const txnNext = document.getElementById("txn-next-btn");
        if (txnNext) {
            txnNext.style.opacity = "0.3";
            txnNext.style.pointerEvents = "none";
        }
    }, 100);

    // Network status monitoring
    setupNetworkMonitor();

    // Recover pending payment from previous session (app killed during payment)
    recoverPendingPayment();

    apiFetch(`${API}?action=me`)
        .then(({ ok, data }) => {
            if (ok && data.user) {
                // Check subscription status
                if (data.subscription_expired) {
                    subscriptionExpired = true;
                    subscriptionDaysLeft = data.subscription_days_left;
                }
                if (data.subscription_expiring_soon) {
                    subscriptionExpiringSoon = true;
                    subscriptionDaysLeft = data.subscription_days_left;
                }
                showApp(data.user);
                if (data.subscription) updateSubscriptionUI(data.subscription);
                if (data.gym_info) updateGymInfo(data.gym_info);
                // Show subscription expired overlay after app loads (if not on subscription page)
                if (subscriptionExpired) {
                    setTimeout(() => showSubscriptionExpiredOverlay(), 500);
                }
                // Show subscription warning if expiring soon
                if (subscriptionExpiringSoon && !subscriptionExpired) {
                    setTimeout(() => showSubscriptionWarning(), 1000);
                }
            } else showLogin();
        })
        .catch(() => showLogin());

    document.getElementById("login-form").addEventListener("submit", handleLogin);
    document
        .getElementById("register-step1-form")
        .addEventListener("submit", handleRegisterStep1);
    document
        .getElementById("register-step2-form")
        .addEventListener("submit", handleRegister);

    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("sw.js").catch(() => { });
    }

    // Check subscription periodically (every 5 minutes)
    setInterval(checkSubscriptionStatus, 15000);
});

// ==================== NETWORK MONITOR ====================
function setupNetworkMonitor() {
    window.addEventListener("online", () => {
        isOnline = true;
        document.getElementById("network-banner").style.display = "none";
        adjustHeaderOffset();
        showSnackbar("Back online!", 2000);
    });
    window.addEventListener("offline", () => {
        isOnline = false;
        document.getElementById("network-banner").style.display = "flex";
        adjustHeaderOffset();
        showSnackbar("You are offline. Some features may not work.", 4000);
    });
    // Initial check
    if (!navigator.onLine) {
        document.getElementById("network-banner").style.display = "flex";
        adjustHeaderOffset();
    }
}

function adjustHeaderOffset() {
    const header = document.getElementById("app-header");
    const pageContent = document.getElementById("page-content");
    const banner = document.getElementById("network-banner");
    const warning = document.getElementById("subscription-warning");
    let offset = 0;
    if (banner && banner.style.display !== "none") offset += 36;
    if (warning && warning.style.display !== "none") offset += 36;
    if (header) header.style.top = offset + "px";
    if (pageContent)
        pageContent.style.top = `calc(var(--header-height) + ${offset}px)`;
}

// ==================== SUBSCRIPTION STATUS ====================
let subOverlayDismissed = false;

function showSubscriptionExpiredOverlay() {
    if (
        currentPage === "subscription" ||
        currentPage === "subscription-upgrade" ||
        currentPage === "subscription-renew"
    ) {
        return; // Don't show overlay on subscription pages
    }
    if (subOverlayDismissed) return;
    const overlay = document.getElementById("subscription-overlay");
    const detailText = document.getElementById("sub-expired-detail-text");
    if (detailText && subscriptionDaysLeft !== null) {
        detailText.textContent =
            "Expired " + Math.abs(subscriptionDaysLeft) + " day(s) ago";
    }
    overlay.style.display = "flex";
}

function dismissSubscriptionOverlay() {
    document.getElementById("subscription-overlay").style.display = "none";
    subOverlayDismissed = true;
}

function showSubscriptionWarning() {
    const el = document.getElementById("subscription-warning");
    const text = document.getElementById("subscription-warning-text");
    if (subscriptionDaysLeft !== null && subscriptionDaysLeft <= 7) {
        text.textContent = `Subscription expires in ${subscriptionDaysLeft} day(s)! Renew now.`;
        el.style.display = "flex";
        adjustHeaderOffset();
    }
}

function dismissSubscriptionWarning() {
    document.getElementById("subscription-warning").style.display = "none";
    adjustHeaderOffset();
}

async function checkSubscriptionStatus() {
    try {
        const { ok, data } = await apiFetch(`${API}?action=subscription_status`);
        if (ok && data.subscription_expired) {
            subscriptionExpired = true;
            subscriptionDaysLeft = data.subscription_days_left;
            // Show overlay on all pages except subscription payment pages
            if (
                currentPage !== "subscription" &&
                currentPage !== "subscription-upgrade" &&
                currentPage !== "subscription-renew"
            ) {
                subOverlayDismissed = false; // Always reset — forces overlay to show every 15 seconds
                showSubscriptionExpiredOverlay();
            }
        } else if (ok && data.subscription_expiring_soon) {
            subscriptionExpiringSoon = true;
            subscriptionDaysLeft = data.subscription_days_left;
            showSubscriptionWarning();
        } else if (ok) {
            subscriptionExpired = false;
            subscriptionExpiringSoon = false;
            subOverlayDismissed = false;
            document.getElementById("subscription-overlay").style.display = "none";
            document.getElementById("subscription-warning").style.display = "none";
            adjustHeaderOffset();
        }
    } catch (e) { }
}

let gymInfoCache = {};
function updateGymInfo(info) {
    gymInfoCache = info || {};
}

// ==================== AUTH ====================
function showLogin() {
    document
        .querySelectorAll(".screen")
        .forEach((s) => s.classList.remove("active"));
    document.getElementById("login-screen").classList.add("active");
}
function showRegister() {
    document
        .querySelectorAll(".screen")
        .forEach((s) => s.classList.remove("active"));
    document.getElementById("register-screen").classList.add("active");
    document.getElementById("register-step1").style.display = "block";
    document.getElementById("register-step2").style.display = "none";
    document.getElementById("reg-business-name").focus();
    updateRegSteps(1);
}
function showRegisterStep1() {
    document.getElementById("register-step1").style.display = "block";
    document.getElementById("register-step2").style.display = "none";
    updateRegSteps(1);
}
function showRegisterStep2() {
    document.getElementById("register-step1").style.display = "none";
    document.getElementById("register-step2").style.display = "block";
    document.getElementById("reg-personal-name").focus();
    updateRegSteps(2);
}
function updateRegSteps(step) {
    const d1 = document.getElementById("reg-dot-1");
    const d2 = document.getElementById("reg-dot-2");
    const title = document.getElementById("reg-hero-title");
    const sub = document.getElementById("reg-hero-sub");
    if (d1) d1.classList.toggle("active", step === 1);
    if (d2) d2.classList.toggle("active", step === 2);
    if (title)
        title.textContent =
            step === 1 ? "Register Your Business" : "Create Your Account";
    if (sub)
        sub.textContent =
            step === 1
                ? "Step 1 of 2 — Your gym details"
                : "Step 2 of 2 — Your personal details";
}
function showSetup() {
    /* Redirect old setup to new register flow */
    showRegister();
}
function showApp(user) {
    if (!user) {
        console.error("showApp called without user");
        return;
    }
    currentUserData = user;

    const userType = (user.type || "").toLowerCase();
    const isAdmin = userType === "admin" || userType === "owner";

    document
        .querySelectorAll(".screen")
        .forEach((s) => s.classList.remove("active"));
    const shell = document.getElementById("app-shell");
    if (shell) shell.classList.add("active");

    // Set basic user info
    const drawerName = document.getElementById("drawer-name");
    const drawerEmail = document.getElementById("drawer-email");
    if (drawerName) drawerName.textContent = user.name || "User";
    if (drawerEmail) drawerEmail.textContent = user.email || "";

    // Toggle role-specific elements
    const toggleDisplay = (id, show, displayType = "block") => {
        const el = document.getElementById(id);
        if (el) el.style.display = show ? displayType : "none";
    };

    toggleDisplay("admin-menu", isAdmin);
    toggleDisplay("member-menu", !isAdmin);
    toggleDisplay("admin-bottom-nav", isAdmin, "contents");
    toggleDisplay("member-bottom-nav", !isAdmin, "contents");
    toggleDisplay("admin-settings-msg", isAdmin, "flex");
    toggleDisplay("admin-business-settings-menu", isAdmin);
    toggleDisplay("admin-gym-settings", isAdmin);

    closeDrawer();
    const targetPage = isAdmin ? "dashboard" : "member-dashboard";
    navigate(targetPage);
}

function showSettingsSection(section) {
    const list = document.getElementById("settings-menu-list");
    const profile = document.getElementById("settings-section-profile");
    const gym = document.getElementById("settings-section-gym");
    if (list) list.style.display = "none";
    if (profile) profile.style.display = section === "profile" ? "block" : "none";
    if (gym) gym.style.display = section === "gym" ? "block" : "none";
}

function hideSettingsSections() {
    const list = document.getElementById("settings-menu-list");
    const profile = document.getElementById("settings-section-profile");
    const gym = document.getElementById("settings-section-gym");
    if (list) list.style.display = "block";
    if (profile) profile.style.display = "none";
    if (gym) gym.style.display = "none";
}

// Show subscription expiry in drawer
function updateSubscriptionUI(subscription) {
    const el = document.getElementById("drawer-expiry");
    const text = document.getElementById("drawer-expiry-text");
    if (!el || !text) return;

    const isAdmin =
        currentUserData &&
        (currentUserData.type === "admin" || currentUserData.type === "owner");
    if (!isAdmin || !subscription) {
        el.style.display = "none";
        return;
    }

    if (subscription.subscription_expire_date) {
        el.style.display = "inline-flex";
        const expDate = new Date(subscription.subscription_expire_date);
        const now = new Date();
        const daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
        const formatted = formatDate(subscription.subscription_expire_date);
        if (daysLeft < 0) {
            text.textContent = "Expired on " + formatted;
            el.className = "drawer-expiry expired";
        } else if (daysLeft <= 15) {
            text.textContent = "Expiring in " + daysLeft + " days";
            el.className = "drawer-expiry expiring-soon";
        } else {
            text.textContent = "Active until " + formatted;
            el.className = "drawer-expiry";
        }
    } else if (subscription.title) {
        el.style.display = "inline-flex";
        el.className = "drawer-expiry";
        text.textContent = subscription.title + " plan";
    } else {
        el.style.display = "none";
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const loginValue = document.getElementById("login-email").value.trim();
    const passwordValue = document.getElementById("login-password").value;
    if (!loginValue) {
        showSnackbar("Please enter your email or phone number");
        return;
    }
    if (!passwordValue) {
        showSnackbar("Please enter your password");
        return;
    }
    // Validate: if it looks like a phone, check digits; if email, check format
    const isPhone = /^[\d+\-\s()]+$/.test(loginValue);
    if (isPhone && loginValue.replace(/\D/g, "").length < 10) {
        showSnackbar("Phone number must be at least 10 digits");
        return;
    }
    if (!isPhone && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginValue)) {
        showSnackbar("Please enter a valid email address");
        return;
    }
    const btn = document.getElementById("login-btn");
    const loader = btn.querySelector(".btn-loader");
    const text = btn.querySelector("span");
    btn.disabled = true;
    loader.style.display = "block";
    text.style.display = "none";

    try {
        const { ok, data } = await apiFetch(`${API}?action=login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: document.getElementById("login-email").value.trim(),
                password: document.getElementById("login-password").value,
                remember: document.getElementById("login-remember").checked,
            }),
        });
        if (ok && data.success) {
            if (data.subscription_expired) {
                subscriptionExpired = true;
                subscriptionDaysLeft = data.subscription_days_left;
            }
            if (data.subscription_expiring_soon) {
                subscriptionExpiringSoon = true;
                subscriptionDaysLeft = data.subscription_days_left;
            }

            // Move logic out of try/catch to distinguish API errors from JS UI errors
            setTimeout(() => {
                try {
                    showApp(data.user);
                    if (data.subscription) updateSubscriptionUI(data.subscription);
                    // Show subscription expired overlay after app loads
                    if (subscriptionExpired) {
                        setTimeout(() => showSubscriptionExpiredOverlay(), 500);
                    }
                    // Show subscription warning if expiring soon
                    if (data.subscription_expiring_soon && !subscriptionExpired) {
                        setTimeout(() => showSubscriptionWarning(), 1000);
                    }
                } catch (uiErr) {
                    console.error("UI Error after login:", uiErr);
                    showSnackbar("Error loading application interface.");
                }
            }, 10);
        } else {
            showSnackbar(data.error || "Login failed");
        }
    } catch (err) {
        console.error("Login error:", err);
        showSnackbar("Connection error. Please try again.");
    } finally {
        btn.disabled = false;
        loader.style.display = "none";
        text.style.display = "inline";
    }
}

function handleRegisterStep1(e) {
    e.preventDefault();
    const businessName = document
        .getElementById("reg-business-name")
        .value.trim();
    if (!businessName) {
        showSnackbar("Please enter your business name");
        return;
    }
    if (businessName.length < 2) {
        showSnackbar("Business name must be at least 2 characters");
        return;
    }
    showRegisterStep2();
}

async function handleRegister(e) {
    e.preventDefault();
    const btn = document.getElementById("register-btn");
    const loader = btn.querySelector(".btn-loader");
    const text = btn.querySelector("span");
    btn.disabled = true;
    loader.style.display = "block";
    text.style.display = "none";

    const businessName = document
        .getElementById("reg-business-name")
        .value.trim();
    const personalName = document
        .getElementById("reg-personal-name")
        .value.trim();
    const phone = document.getElementById("reg-phone").value.trim();
    const email = document.getElementById("reg-email").value.trim();
    const password = document.getElementById("reg-password").value;

    if (!businessName || !personalName || !email || !password) {
        showSnackbar("Please fill all required fields");
        btn.disabled = false;
        loader.style.display = "none";
        text.style.display = "inline";
        return;
    }
    if (password.length < 6) {
        showSnackbar("Password must be at least 6 characters");
        btn.disabled = false;
        loader.style.display = "none";
        text.style.display = "inline";
        return;
    }
    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showSnackbar("Please enter a valid email address");
        btn.disabled = false;
        loader.style.display = "none";
        text.style.display = "inline";
        return;
    }
    // Validate phone if provided
    if (phone && phone.replace(/\D/g, "").length < 10) {
        showSnackbar("Phone number must be at least 10 digits");
        btn.disabled = false;
        loader.style.display = "none";
        text.style.display = "inline";
        return;
    }

    try {
        const { ok, data } = await apiFetch(`${API}?action=register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                business_name: businessName,
                name: personalName,
                phone_number: phone,
                email,
                password,
            }),
        });
        if (ok && data.success) {
            /* Auto-login: set session and redirect */
            showSnackbar("Account created! Welcome to GymXBook 🎉");
            if (data.user) {
                showApp(data.user);
                if (data.subscription) updateSubscriptionUI(data.subscription);
                // Onboarding removed
            } else {
                /* Fallback: prefill login form */
                showLogin();
                document.getElementById("login-email").value = email;
                document.getElementById("login-password").value = password;
            }
        } else {
            showSnackbar(data.error || "Registration failed");
        }
    } catch (err) {
        showSnackbar("Connection error");
    } finally {
        btn.disabled = false;
        loader.style.display = "none";
        text.style.display = "inline";
    }
}

function logout() {
    showConfirm("Logout", "Are you sure you want to logout?", async () => {
        try {
            await fetch(`${API}?action=logout`);
            showLogin();
            closeDrawer();
        } catch (e) {
            showLogin();
            closeDrawer();
        }
    });
}

function togglePassword(btn) {
    const input = btn.parentElement.querySelector("input");
    const icon = btn.querySelector(".material-icons-round");
    if (input.type === "password") {
        input.type = "text";
        icon.textContent = "visibility";
    } else {
        input.type = "password";
        icon.textContent = "visibility_off";
    }
}

// ==================== NAVIGATION ====================
function navigate(page) {
    if (!currentUserData) return;

    const userType = (currentUserData.type || "").toLowerCase();
    const isAdmin = userType === "admin" || userType === "owner";

    // Permission checks
    const adminPages = [
        "dashboard",
        "members",
        "trainers",
        "attendance",
        "memberships",
        "reports",
        "admin-qr",
        "classes",
        "expenses",
        "invoices",
        "transactions",
        "lockers",
        "events",
        "products",
        "notices",
        "subscription",
        "subscription-upgrade",
        "subscription-renew",
    ];
    const memberPages = [
        "member-dashboard",
        "member-attendance",
        "member-invoices",
        "member-classes",
        "member-memberships",
        "member-bmi",
        "member-workout",
        "member-health",
        "member-scan",
        "notices",
    ];

    if (isAdmin && memberPages.includes(page) && !adminPages.includes(page)) {
        console.warn(
            "Admin trying to access member page, redirecting to dashboard",
        );
        page = "dashboard";
    }
    if (!isAdmin && adminPages.includes(page) && !memberPages.includes(page)) {
        console.warn(
            "Member trying to access admin page, redirecting to member-dashboard",
        );
        page = "member-dashboard";
    }

    // Prevent page reload if already on the same page
    if (
        currentPage === page &&
        !["member-detail", "subscription-upgrade", "subscription-renew"].includes(
            page,
        )
    ) {
        // Just scroll to top instead of reloading
        const scrollContainer = document.querySelector(
            `#page-${page} .page-scroll`,
        );
        if (scrollContainer)
            scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
        return;
    }

    // Show expired overlay on non-subscription pages (don't block navigation — user can go anywhere)
    if (
        subscriptionExpired &&
        page !== "subscription" &&
        page !== "subscription-upgrade" &&
        page !== "subscription-renew"
    ) {
        showSubscriptionExpiredOverlay();
    }

    // Hide overlay on subscription pages so user can complete payment
    if (
        subscriptionExpired &&
        (page === "subscription" ||
            page === "subscription-upgrade" ||
            page === "subscription-renew")
    ) {
        document.getElementById("subscription-overlay").style.display = "none";
        subOverlayDismissed = true; // Prevent immediate re-show
    }

    const previousPage = currentPage;
    currentPage = page;
    closeDrawer();
    document
        .querySelectorAll(".page")
        .forEach((p) => p.classList.remove("active"));

    if (page === "more") {
        page = "transactions";
    }

    const target = document.getElementById(`page-${page}`);
    if (target) target.classList.add("active");

    const titles = {
        dashboard: "Dashboard",
        members: "Members",
        "member-detail": "Member Details",
        trainers: "Trainers",
        attendance: "Attendance",
        memberships: "Membership Plans",
        subscription: "Subscription",
        "subscription-upgrade": "Upgrade Plan",
        "subscription-renew": "Renew Plan",
        classes: "Classes",
        expenses: "Expenses",
        invoices: "Invoices",
        transactions: "Transactions",
        lockers: "Lockers",
        events: "Events",
        products: "Products",
        notices: "Notices",
        settings: "Settings",
        reports: "Reports",
        "member-dashboard": "Home",
        "member-attendance": "My Attendance",
        "member-invoices": "My Payments",
        "member-classes": "Class Schedule",
    };
    document.getElementById("header-title").textContent =
        titles[page] || "GymXBook";

    const menuBtn = document.getElementById("menu-btn");
    if (
        ["member-detail", "subscription-upgrade", "subscription-renew"].includes(
            page,
        )
    ) {
        menuBtn.innerHTML = '<span class="material-icons-round">arrow_back</span>';
        menuBtn.onclick = () => goBack();
    } else {
        menuBtn.innerHTML = '<span class="material-icons-round">menu</span>';
        menuBtn.onclick = () => toggleDrawer();
    }

    // Update drawer active state
    document
        .querySelectorAll(".drawer-item")
        .forEach((d) => d.classList.toggle("active", d.dataset.page === page));
    // Update bottom nav
    document
        .querySelectorAll(".nav-item")
        .forEach((n) => n.classList.toggle("active", n.dataset.page === page));

    // History management for phone back button
    if (!isNavigatingBack) {
        if (!history.state || previousPage === page) {
            history.replaceState({ page }, "");
        } else {
            history.pushState({ page }, "");
        }
    }
    isNavigatingBack = false;

    switch (page) {
        case "dashboard":
            loadDashboard();
            break;
        case "members":
            loadMembers();
            break;
        case "trainers":
            loadTrainers();
            break;
        case "attendance":
            document.getElementById("att-date").value = getLocalDate();
            document.getElementById("att-date").max = getLocalDate();
            // Initially on today, so disable next
            const attNext = document.getElementById("att-next-btn");
            if (attNext) {
                attNext.style.opacity = "0.3";
                attNext.style.pointerEvents = "none";
            }
            loadAttendance();
            break;
        case "memberships":
            loadMemberships();
            break;
        case "subscription":
            loadSubscription();
            break;
        case "classes":
            loadClasses();
            break;
        case "expenses":
            loadExpenses();
            break;
        case "invoices":
            loadInvoices();
            break;
        case "transactions":
            loadTransactions();
            break;
        case "lockers":
            loadLockers();
            break;
        case "events":
            loadEvents();
            break;
        case "products":
            loadProducts();
            break;
        case "notices":
            loadNotices();
            break;
        case "settings":
            loadSettings();
            break;
        case "reports":
            loadReports();
            break;
        case "admin-qr":
            loadAdminQR();
            break;
        case "member-dashboard":
            loadMemberDashboard();
            break;
        case "member-attendance":
            loadMemberAttendance();
            break;
        case "member-invoices":
            loadMemberInvoices();
            break;
        case "member-classes":
            loadMemberClasses();
            break;
        case "member-memberships":
            loadMemberMemberships();
            break;
        case "member-bmi":
            document.getElementById("header-title").textContent = "BMI Calculator";
            break;
        case "member-workout":
            loadMemberWorkout();
            document.getElementById("header-title").textContent = "Workout Plan";
            break;
        case "member-health":
            loadMemberHealth();
            document.getElementById("header-title").textContent = "Health Records";
            break;
        case "member-scan":
            startQRScanner();
            document.getElementById("header-title").textContent = "Scan QR";
            break;
    }
}

// ==================== BACK BUTTON NAVIGATION ====================
function goBack() {
    history.back();
}

window.addEventListener("popstate", function (e) {
    const targetPage = e.state && e.state.page ? e.state.page : "dashboard";
    isNavigatingBack = true;
    navigate(targetPage);
});

// ==================== DATA REFRESH HELPERS ====================
/* Refresh data for the current visible page */
function refreshCurrentPage() {
    switch (currentPage) {
        case "dashboard":
            loadDashboard();
            break;
        case "members":
            loadMembers(
                document.getElementById("member-search")?.value || "",
                memberFilter,
            );
            break;
        case "trainers":
            loadTrainers();
            break;
        case "attendance":
            loadAttendance();
            break;
        case "memberships":
            loadMemberships();
            break;
        case "subscription":
            loadSubscription();
            break;
        case "classes":
            loadClasses();
            break;
        case "expenses":
            loadExpenses();
            break;
        case "invoices":
            loadInvoices(invoiceFilter);
            break;
        case "transactions":
            loadTransactions();
            break;
        case "lockers":
            loadLockers();
            break;
        case "events":
            loadEvents();
            break;
        case "products":
            loadProducts();
            break;
    }
}

/* Refresh dashboard if it's the current page (stats may have changed) */
function refreshDashboardIfVisible() {
    if (currentPage === "dashboard") loadDashboard();
}

// ==================== NAV TAP (vibration) ====================
function navTap(page) {
    if (navigator.vibrate) navigator.vibrate(12);
    navigate(page);
}

// ==================== DRAWER ====================
function toggleDrawer() {
    document.getElementById("drawer").classList.toggle("open");
    document.getElementById("drawer-overlay").classList.toggle("open");
}
function closeDrawer() {
    document.getElementById("drawer").classList.remove("open");
    document.getElementById("drawer-overlay").classList.remove("open");
}

// ==================== DASHBOARD ====================
async function loadDashboard() {
    // Show skeleton immediately
    const rmList = document.getElementById("recent-members-list");
    const ciList = document.getElementById("today-checkins-list");
    if (rmList) rmList.innerHTML = skCard() + skCard() + skCard();
    if (ciList) ciList.innerHTML = skCheckinItem() + skCheckinItem();

    try {
        const { ok, data } = await apiFetch(`${API}?action=dashboard`);
        if (!ok || !data.stats) return;
        const s = data.stats;
        document.getElementById("stat-members").textContent = s.members;
        document.getElementById("stat-trainers").textContent = s.trainers;
        document.getElementById("stat-attendance").textContent = s.attendance_today;
        document.getElementById("stat-active").textContent = s.active_memberships;
        document.getElementById("stat-revenue").textContent =
            "₹" + Number(s.revenue).toLocaleString("en-IN");
        document.getElementById("stat-expenses").textContent =
            "₹" + Number(s.expenses).toLocaleString("en-IN");

        if (rmList)
            rmList.innerHTML =
                data.recent_members && data.recent_members.length > 0
                    ? data.recent_members.map((m) => renderMemberCard(m)).join("")
                    : renderEmptyState(
                        "members",
                        "No Members Yet",
                        "Add your first member to get started",
                        "Add Member",
                        "showAddMemberSheet()",
                    );

        if (ciList)
            ciList.innerHTML =
                data.today_checkins && data.today_checkins.length > 0
                    ? data.today_checkins
                        .map(
                            (c) =>
                                `<div class="checkin-item"><span class="checkin-time">${formatTime(c.checked_in_time)}</span><span class="checkin-name">${c.name}</span><span class="member-badge ${c.checked_out_time ? "badge-inactive" : "badge-active"}">${c.checked_out_time ? "Out " + formatTime(c.checked_out_time) : "In"}</span></div>`,
                        )
                        .join("")
                    : '<div class="empty-state mini"><span class="material-icons-round">event_available</span><p>No check-ins today</p></div>';

        // Update notification count
        updateNotifCount();
    } catch (err) {
        console.error(err);
    }
}

async function updateNotifCount() {
    try {
        const { ok, data } = await apiFetch(`${API}?action=notifications`);
        const badge = document.getElementById("notif-badge");
        if (ok && data.unread_count > 0) {
            badge.textContent = data.unread_count;
            badge.style.display = "flex";
        } else {
            badge.style.display = "none";
        }
    } catch (e) { }
}

async function showNotifications() {
    openSheet();
    document.getElementById("sheet-title").textContent = "Notifications";
    document.getElementById("sheet-content").innerHTML = skeletonMembers(3);

    try {
        const { ok, data } = await apiFetch(`${API}?action=notifications`);
        if (!ok || !data) {
            document.getElementById("sheet-content").innerHTML =
                '<div class="empty-state">Error loading notifications</div>';
            return;
        }

        const notifs = data.notifications || [];
        const badge = document.getElementById("notif-badge");

        if (notifs.length > 0) {
            document.getElementById("sheet-content").innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding:0 4px">
                    <span style="font-size:12px;color:var(--text3)">${notifs.length} Alert(s)</span>
                    <button class="text-btn" onclick="clearAllNotifications()" style="color:var(--red)">Clear All</button>
                </div>
                <div id="notif-items-list">
                    ${notifs
                    .map((n) => {
                        const parts = n.created_at
                            ? n.created_at.split(" ")
                            : ["", ""];
                        const d = parts[0] ? formatDate(parts[0]) : "";
                        const t = parts[1] ? formatTime(parts[1]) : "";
                        const color =
                            n.type === "error"
                                ? "var(--red)"
                                : n.type === "warning"
                                    ? "var(--orange)"
                                    : "var(--blue)";
                        return `
                            <div class="card" style="padding:14px;margin-bottom:10px;border-left:4px solid ${color};background:var(--card)">
                                <div style="font-size:14px;font-weight:700;color:var(--text)">${n.title}</div>
                                <div style="font-size:12px;color:var(--text2);margin-top:4px;line-height:1.4">${n.message}</div>
                                <div style="font-size:10px;color:var(--text3);margin-top:8px;display:flex;align-items:center;gap:4px">
                                    <span class="material-icons-round" style="font-size:12px">schedule</span>
                                    ${d} ${t}
                                </div>
                            </div>
                        `;
                    })
                    .join("")}
                </div>
            `;
            // Delete notifications from server after displaying them
            await apiFetch(`${API}?action=notifications`, { method: "POST" });
            if (badge) badge.style.display = "none";
        } else {
            document.getElementById("sheet-content").innerHTML = `
                <div class="empty-state">
                    <span class="material-icons-round">notifications_off</span>
                    <p>No new notifications</p>
                </div>`;
            if (badge) badge.style.display = "none";
        }
    } catch (e) {
        console.error("Notif error:", e);
        document.getElementById("sheet-content").innerHTML =
            '<div class="empty-state">Connection error</div>';
    }
}

async function clearAllNotifications() {
    try {
        const { ok } = await apiFetch(`${API}?action=notifications`, {
            method: "POST",
        });
        if (ok) {
            document.getElementById("notif-badge").style.display = "none";
            document.getElementById("sheet-content").innerHTML = `
                <div class="empty-state">
                    <span class="material-icons-round">notifications_off</span>
                    <p>No new notifications</p>
                </div>`;
            showSnackbar("Notifications cleared");
        }
    } catch (e) {
        showSnackbar("Error clearing notifications");
    }
}

// ==================== MEMBERS ====================
async function loadMembers(search = "", status = "") {
    const list = document.getElementById("members-list");
    list.innerHTML = skeletonMembers(5);
    try {
        const params = new URLSearchParams({ search, status, page: 1 });
        const { ok, data } = await apiFetch(`${API}?action=members&${params}`);
        list.innerHTML =
            data.members && data.members.length > 0
                ? data.members.map((m) => renderMemberCard(m)).join("")
                : renderEmptyState(
                    "members",
                    "No Members Found",
                    search
                        ? "Try a different search term"
                        : "Add your first member to get started",
                    search ? "" : "Add Member",
                    "showAddMemberSheet()",
                );
    } catch (err) {
        console.error(err);
    }
}

function renderMemberCard(m) {
    const initials = (m.name || "?")
        .split(" ")
        .map((w) => w[0])
        .join("")
        .substring(0, 2)
        .toUpperCase();
    const isFrozen = m.trainee_status == 3;
    const isActive =
        m.membership_expiry_date &&
        new Date(m.membership_expiry_date) >= new Date();
    const isUserActive = m.is_active != 0;
    let badge = '<span class="member-badge badge-inactive">No Plan</span>';
    if (!isUserActive)
        badge = '<span class="member-badge badge-inactive">Inactive</span>';
    else if (isFrozen)
        badge = '<span class="member-badge badge-frozen">Frozen</span>';
    else if (m.membership_expiry_date)
        badge = isActive
            ? '<span class="member-badge badge-active">Active</span>'
            : '<span class="member-badge badge-expired">Expired</span>';
    const plan = m.plan_name || "No Plan";
    const phone = m.phone_number || "";
    const avatarStyle = !isUserActive ? "opacity:0.5" : "";
    const expiryDisplay = m.membership_expiry_date
        ? formatDate(m.membership_expiry_date)
        : "";
    return `<div class="member-card" onclick="viewMember(${m.id})" style="${!isUserActive ? "opacity:0.7" : ""}"><div class="member-avatar" style="${avatarStyle}">${initials}</div><div class="member-info"><span class="member-name">${m.name || "Unknown"}</span><span class="member-sub">${plan}${expiryDisplay ? " • Exp: " + expiryDisplay : ""}</span></div>${badge}</div>`;
}

let searchTimer;
function searchMembers(val) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadMembers(val, memberFilter), 300);
}
function showMemberFilter() {
    const el = document.getElementById("member-filters");
    el.style.display = el.style.display === "none" ? "flex" : "none";
}
function filterMembers(status, btn) {
    memberFilter = status;
    document
        .querySelectorAll("#member-filters .chip")
        .forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    loadMembers(document.getElementById("member-search").value, status);
}

async function viewMember(id) {
    try {
        const { ok, data } = await apiFetch(`${API}?action=member&id=${id}`);
        if (!ok || !data.member) {
            showSnackbar(data.error || "Member not found");
            return;
        }
        const m = data.member;
        // Ensure id is always the users.id, not trainee_details.id
        m.id = m.user_id || m.id;
        const initials = (m.name || "?")
            .split(" ")
            .map((w) => w[0])
            .join("")
            .substring(0, 2)
            .toUpperCase();
        const isActive =
            m.membership_expiry_date &&
            new Date(m.membership_expiry_date) >= new Date();
        const isFrozen = m.trainee_status == 3;
        const plan = m.plan_name || "No Plan";

        let statusBadge =
            '<span class="member-badge badge-inactive">No Plan</span>';
        if (isFrozen)
            statusBadge = '<span class="member-badge badge-frozen">Frozen</span>';
        else if (m.membership_expiry_date)
            statusBadge = isActive
                ? '<span class="member-badge badge-active">Active</span>'
                : '<span class="member-badge badge-expired">Expired</span>';

        let html = `
            <div class="detail-header">
                <div class="detail-avatar">${initials}</div>
                <div class="detail-name">${m.name || "Unknown"}</div>
                <div class="detail-subtitle">${m.email || ""}</div>
                <div style="margin-top:8px">${statusBadge}</div>
            </div>

            <div class="detail-section">
                <div class="detail-section-title">Contact Info</div>
                <div class="detail-grid">
                    <div class="detail-field"><span class="detail-field-label">Phone</span><span class="detail-field-value">${m.phone_number || "-"}</span></div>
                    <div class="detail-field"><span class="detail-field-label">Email</span><span class="detail-field-value" style="font-size:12px">${m.email || "-"}</span></div>
                    <div class="detail-field"><span class="detail-field-label">City</span><span class="detail-field-value">${m.city || "-"}</span></div>
                    <div class="detail-field"><span class="detail-field-label">Gender</span><span class="detail-field-value">${m.gender || "-"}</span></div>
                </div>
            </div>

            <div class="detail-section">
                <div class="detail-section-title">Membership</div>
                <div class="detail-grid">
                    <div class="detail-field"><span class="detail-field-label">Plan</span><span class="detail-field-value">${plan}</span></div>
                    <div class="detail-field"><span class="detail-field-label">Goal</span><span class="detail-field-value">${m.fitness_goal || "-"}</span></div>
                    <div class="detail-field"><span class="detail-field-label">Start</span><span class="detail-field-value">${m.membership_start_date || "-"}</span></div>
                    <div class="detail-field"><span class="detail-field-label">Expiry</span><span class="detail-field-value" style="color:${isActive ? "var(--green)" : "var(--red)"}">${m.membership_expiry_date || "-"}</span></div>
                </div>
            </div>

            <div class="detail-section">
                <div class="detail-section-title">Assignments</div>
                <div class="detail-grid">
                    <div class="detail-field"><span class="detail-field-label">Trainer</span><span class="detail-field-value">${m.trainer_name || "Not Assigned"}</span></div>
                    <div class="detail-field"><span class="detail-field-label">Class${m.assigned_classes && m.assigned_classes.length > 1 ? "es" : ""}</span><span class="detail-field-value">${m.assigned_classes && m.assigned_classes.length > 0 ? m.assigned_classes.map((c) => c.title).join(", ") : "Not Assigned"}</span></div>
                </div>
            </div>

            <div class="detail-section">
                <div class="detail-section-title">Personal</div>
                <div class="detail-grid">
                    <div class="detail-field"><span class="detail-field-label">DOB</span><span class="detail-field-value">${m.dob || "-"}</span></div>
                    <div class="detail-field"><span class="detail-field-label">Age</span><span class="detail-field-value">${m.age || "-"}</span></div>
                </div>
            </div>

            <div class="detail-actions">
                <button class="btn-secondary" onclick="editMember(${m.id})"><span class="material-icons-round" style="font-size:16px;vertical-align:middle">edit</span> Edit</button>
                <button class="btn-primary" onclick="showRenewSheet(${m.id})"><span class="material-icons-round" style="font-size:16px;vertical-align:middle">autorenew</span> Renew</button>
            </div>
            <div class="detail-action-row">
                ${m.phone_number ? `<a href="tel:${m.phone_number}" class="btn-secondary" style="text-decoration:none;display:inline-flex;align-items:center;gap:4px;color:var(--green);border-color:var(--green)"><span class="material-icons-round" style="font-size:16px">call</span> Call</a>` : ""}
                ${m.phone_number ? `<a href="https://wa.me/${m.phone_number.replace(/[^0-9]/g, "").replace(/^0+/, "91")}" target="_blank" class="btn-secondary" style="text-decoration:none;display:inline-flex;align-items:center;gap:4px;color:#25D366;border-color:#25D366"><span class="material-icons-round" style="font-size:16px">chat</span> WhatsApp</a>` : ""}
                ${isFrozen
                ? `<button class="btn-secondary" style="color:var(--blue);border-color:var(--blue)" onclick="unfreezeMember(${m.id})"><span class="material-icons-round" style="font-size:16px;vertical-align:middle">play_circle</span> Unfreeze</button>`
                : `<button class="btn-secondary" style="color:var(--blue);border-color:var(--blue)" onclick="showFreezeSheet(${m.id})"><span class="material-icons-round" style="font-size:16px;vertical-align:middle">ac_unit</span> Freeze</button>`
            }
                <button class="btn-secondary" style="color:var(--purple);border-color:var(--purple)" onclick="showAssignWorkoutSheet(${m.id})"><span class="material-icons-round" style="font-size:16px;vertical-align:middle">fitness_center</span> Workout</button>
                ${m.is_active == 1
                ? `<button class="btn-secondary" style="color:var(--red);border-color:var(--red)" onclick="toggleMemberStatus(${m.id}, true)"><span class="material-icons-round" style="font-size:16px;vertical-align:middle">person_off</span> Deactivate</button>`
                : `<button class="btn-secondary" style="color:var(--green);border-color:var(--green)" onclick="toggleMemberStatus(${m.id}, false)"><span class="material-icons-round" style="font-size:16px;vertical-align:middle">person_check</span> Activate</button>`
            }
            </div>
        `;

        // Freeze logs
        if (m.freeze_logs && m.freeze_logs.length > 0) {
            html += `<div class="detail-section"><div class="detail-section-title">Freeze History</div>`;
            html += m.freeze_logs
                .map(
                    (f) =>
                        `<div class="freeze-log-item"><span class="freeze-log-dates">${f.freeze_start_date} → ${f.freeze_end_date}</span><span class="freeze-log-days">${f.freeze_days} days frozen</span>${f.remarks ? `<div class="freeze-log-remarks">${f.remarks}</div>` : ""}</div>`,
                )
                .join("");
            html += `</div>`;
        }

        // Attendance
        if (m.attendance_history && m.attendance_history.length > 0) {
            html += `<div class="detail-section">
                <div class="detail-section-title">Recent Attendance</div>
                <div class="att-history-list">
                    ${m.attendance_history
                    .slice(0, 10)
                    .map(
                        (a) => `
                        <div class="att-history-item" style="background:var(--card);border:1px solid var(--border2);border-radius:12px;padding:12px">
                            <span class="att-history-date" style="font-weight:700">${formatDate(a.date)}</span>
                            <span class="att-history-time" style="color:var(--text3)">${formatTime(a.checked_in_time)} - ${a.checked_out_time ? formatTime(a.checked_out_time) : "In"}</span>
                        </div>
                    `,
                    )
                    .join("")}
                </div>
            </div>`;
        }

        // Health
        if (m.health_records && m.health_records.length > 0) {
            html += `<div class="detail-section">
                <div class="detail-section-title">Health Progress</div>
                <div class="health-records-grid">`;
            m.health_records.slice(0, 5).forEach((r) => {
                let measurements = [];
                try {
                    measurements = JSON.parse(r.result);
                } catch (e) {
                    measurements = [{ type: "Metric", result: r.result }];
                }

                html += `<div class="card" style="padding:12px;margin-bottom:8px;border:1px solid var(--border2);border-radius:12px">
                    <div style="font-size:11px;color:var(--text3);font-weight:700;margin-bottom:8px">${formatDate(r.measurement_date)}</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
                        ${measurements
                        .map(
                            (ms) => `
                            <div style="background:var(--surface2);padding:6px 10px;border-radius:6px">
                                <div style="font-size:9px;color:var(--text3);text-transform:uppercase">${ms.type}</div>
                                <div style="font-size:13px;font-weight:700;color:var(--primary)">${ms.result}</div>
                            </div>
                        `,
                        )
                        .join("")}
                    </div>
                </div>`;
            });
            html += `</div></div>`;
        }

        // Member Transactions
        html += `<div class="detail-section"><div class="detail-section-title">Payment History</div><div id="member-txn-section"><div class="sk-txn"><div class="sk sk-txn-icon"></div><div class="sk-txn-lines"><div class="sk sk-line sk-line-w70"></div><div class="sk sk-line sk-line-w50"></div></div><div class="sk sk-txn-amount"></div></div></div></div>`;

        document.getElementById("member-detail-content").innerHTML = html;
        navigate("member-detail");
        // Load member transactions asynchronously
        loadMemberTransactions(id);
    } catch (err) {
        showSnackbar("Error loading member");
    }
}

async function loadMemberTransactions(userId) {
    const section = document.getElementById("member-txn-section");
    if (!section) return;
    try {
        const { ok, data } = await apiFetch(
            `${API}?action=member_transactions&user_id=${userId}`,
        );
        if (!ok) {
            section.innerHTML =
                '<div style="padding:8px;color:var(--text3);font-size:12px">Could not load transactions</div>';
            return;
        }
        let html = "";
        // Show payments (income)
        if (data.payments && data.payments.length > 0) {
            data.payments.forEach((p) => {
                html += `<div class="member-txn-item">
                    <div class="member-txn-icon income"><span class="material-icons-round">arrow_downward</span></div>
                    <div class="member-txn-info"><span class="member-txn-title">Payment - Invoice #${p.invoice_id}${p.payment_type ? " (" + p.payment_type.toUpperCase() + ")" : ""}</span><span class="member-txn-date">${p.payment_date || ""}</span></div>
                    <span class="member-txn-amount income">+₹${Number(p.amount).toLocaleString("en-IN")}</span>
                </div>`;
            });
        }
        // Show invoices summary
        if (data.invoices && data.invoices.length > 0) {
            data.invoices.forEach((inv) => {
                const total = Number(inv.total_amount || 0);
                const paid = Number(inv.paid_amount || 0);
                const due = total - paid;
                const statusClass =
                    inv.status === "paid"
                        ? "badge-active"
                        : inv.status === "partial"
                            ? "badge-expired"
                            : "badge-inactive";
                html += `<div class="member-txn-item" onclick="viewInvoice(${inv.id})">
                    <div class="member-txn-icon ${inv.status === "paid" ? "income" : "expense"}"><span class="material-icons-round">receipt</span></div>
                    <div class="member-txn-info"><span class="member-txn-title">Invoice #${inv.invoice_id} - ${inv.notes || "Membership"}</span><span class="member-txn-date">${inv.invoice_date || ""} • Total: ₹${total.toLocaleString("en-IN")} • Paid: ₹${paid.toLocaleString("en-IN")}${due > 0 ? " • Due: ₹" + due.toLocaleString("en-IN") : ""}</span></div>
                    <span class="member-badge ${statusClass}">${inv.status || "unpaid"}</span>
                </div>`;
            });
        }
        if (!html)
            html =
                '<div style="padding:8px;color:var(--text3);font-size:12px;text-align:center">No payment records</div>';
        section.innerHTML = html;
    } catch (e) {
        section.innerHTML =
            '<div style="padding:8px;color:var(--text3);font-size:12px">Could not load transactions</div>';
    }
}

// ==================== ADD / EDIT MEMBER ====================
async function showAddMemberSheet(memberData = null) {
    try {
        const [mRes, tRes, cRes] = await Promise.all([
            fetch(`${API}?action=memberships`),
            fetch(`${API}?action=trainers`),
            fetch(`${API}?action=classes`),
        ]);
        membershipsCache = (await mRes.json()).memberships || [];
        trainersCache = (await tRes.json()).trainers || [];
        classesCache = (await cRes.json()).classes || [];
    } catch (e) { }

    const isEdit = !!memberData;
    const planOptions = membershipsCache
        .map(
            (m) =>
                `<option value="${m.id}" data-package="${m.package || ""}" ${memberData && memberData.membership_plan == m.id ? "selected" : ""}>${m.title} - ₹${m.amount} (${m.package || "plan"})</option>`,
        )
        .join("");
    const trainerOptions = trainersCache
        .map(
            (t) =>
                `<option value="${t.id}" ${memberData && memberData.trainer_assign == t.id ? "selected" : ""}>${t.name}</option>`,
        )
        .join("");
    const classOptions = classesCache
        .map(
            (c) =>
                `<option value="${c.id}" data-fees="${c.fees || 0}">${c.title} - ₹${c.fees || 0}</option>`,
        )
        .join("");

    const html = `
        <form onsubmit="submitMember(event, ${memberData ? memberData.id : "null"})">
            <div class="form-group"><label class="form-label">Full Name *</label><input type="text" class="form-input" name="name" value="${memberData ? esc(memberData.name) : ""}" required placeholder="Enter full name"></div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">Email *</label><input type="email" class="form-input" name="email" value="${memberData ? esc(memberData.email) : ""}" required placeholder="email@example.com"></div>
                <div class="form-group"><label class="form-label">Phone</label><input type="tel" class="form-input" name="phone_number" value="${memberData ? esc(memberData.phone_number) : ""}" placeholder="+91 9876543210"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">Gender</label><select class="form-input" name="gender"><option value="">Select</option><option value="male" ${memberData && memberData.gender === "male" ? "selected" : ""}>Male</option><option value="female" ${memberData && memberData.gender === "female" ? "selected" : ""}>Female</option><option value="other" ${memberData && memberData.gender === "other" ? "selected" : ""}>Other</option></select></div>
                <div class="form-group"><label class="form-label">Date of Birth</label><input type="date" class="form-input" name="dob" value="${memberData ? memberData.dob || "" : ""}"></div>
            </div>
            <div class="form-group"><label class="form-label">Address</label><input type="text" class="form-input" name="address" value="${memberData ? esc(memberData.address) : ""}" placeholder="Street address"></div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">City</label><input type="text" class="form-input" name="city" value="${memberData ? esc(memberData.city) : ""}" placeholder="City"></div>
                <div class="form-group"><label class="form-label">State</label><input type="text" class="form-input" name="state" value="${memberData ? esc(memberData.state) : ""}" placeholder="State"></div>
            </div>
            <div class="form-group"><label class="form-label">Fitness Goal</label><input type="text" class="form-input" name="fitness_goal" value="${memberData ? esc(memberData.fitness_goal) : ""}" placeholder="e.g., Weight Loss, Muscle Gain"></div>
            <div class="form-group"><label class="form-label">Membership Plan</label><select class="form-input" name="membership_plan" id="member-plan-select" onchange="autoCalcExpiry()"><option value="0">Select Plan</option>${planOptions}</select></div>
            <div class="form-group"><label class="form-label">Assign Class</label><select class="form-input" name="class_id" id="member-class-select" onchange="autoCalcExpiry()"><option value="0">No Class</option>${classOptions}</select></div>
            ${!isEdit
            ? `
            <div class="form-group"><label class="form-label">Registration Fee (One Time)</label><input type="number" step="1" class="form-input" name="registration_fee" id="member-reg-fee" value="0" min="0" placeholder="0" oninput="autoCalcExpiry()"></div>
            `
            : ""
        }
            <div class="form-group"><label class="form-label">Assign Trainer</label><select class="form-input" name="trainer_assign"><option value="0">No Trainer</option>${trainerOptions}</select></div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">Start Date</label><input type="date" class="form-input" name="membership_start_date" id="member-start-date" value="${memberData ? memberData.membership_start_date || "" : getLocalDate()}" onchange="autoCalcExpiry()"></div>
                <div class="form-group"><label class="form-label">Expiry Date</label><input type="date" class="form-input" name="membership_expiry_date" id="member-expiry-date" value="${memberData ? memberData.membership_expiry_date || "" : ""}"></div>
            </div>
            <div class="paid-section" id="member-paid-section" style="display:none">
                <div class="paid-section-title"><span class="material-icons-round" style="font-size:18px">payments</span> Payment Details</div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">Plan Fee</label><input type="text" class="form-input" id="member-plan-fee" value="₹0" readonly style="background:var(--surface2);color:var(--text3)"></div>
                    <div class="form-group"><label class="form-label">Class Fee</label><input type="text" class="form-input" id="member-class-fee" value="₹0" readonly style="background:var(--surface2);color:var(--text3)"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">Reg. Fee</label><input type="text" class="form-input" id="member-reg-fee-display" value="₹0" readonly style="background:var(--surface2);color:var(--text3)"></div>
                    <div class="form-group"><label class="form-label">Total Fee</label><input type="text" class="form-input" id="member-total-fee" value="₹0" readonly style="background:var(--surface2);color:var(--primary);font-weight:700"></div>
                </div>
                <div class="form-group"><label class="form-label">Paid Amount</label><input type="number" step="0.01" class="form-input" name="paid_amount" id="member-paid-amount" value="0" min="0" placeholder="0" oninput="clampPaidAmount(this)"></div>
                <div class="form-group"><label class="form-label">Payment Method</label>
                    <select class="form-input" name="payment_method" id="member-payment-method">
                        <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank_transfer">Bank Transfer</option>
                    </select>
                </div>
            </div>
            <div class="form-actions">
                <button type="button" class="btn-secondary" onclick="closeSheet()">Cancel</button>
                <button type="submit" class="btn-primary">${isEdit ? "Update" : "Add Member"}</button>
            </div>
        </form>
    `;
    document.getElementById("sheet-title").textContent = isEdit
        ? "Edit Member"
        : "Add Member";
    document.getElementById("sheet-content").innerHTML = html;
    openSheet();
}

// Auto-calculate expiry date based on plan package type and start date
function autoCalcExpiry() {
    const planSelect = document.getElementById("member-plan-select");
    const classSelect = document.getElementById("member-class-select");
    const startDateInput = document.getElementById("member-start-date");
    const expiryDateInput = document.getElementById("member-expiry-date");
    const paidSection = document.getElementById("member-paid-section");
    const planFeeInput = document.getElementById("member-plan-fee");
    const classFeeInput = document.getElementById("member-class-fee");
    const regFeeDisplay = document.getElementById("member-reg-fee-display");
    const totalFeeInput = document.getElementById("member-total-fee");
    const paidAmountInput = document.getElementById("member-paid-amount");
    const regFeeInput = document.getElementById("member-reg-fee");
    if (!planSelect) return;

    const selectedOption = planSelect.options[planSelect.selectedIndex];
    const packageType = selectedOption ? selectedOption.dataset.package : "";
    const planId = planSelect.value;
    const classId = classSelect ? classSelect.value : "0";
    const startDate = startDateInput ? startDateInput.value : "";
    const regFee = regFeeInput ? Number(regFeeInput.value) || 0 : 0;

    // Calculate fees
    let planFee = 0;
    let classFee = 0;

    if (planId && planId !== "0") {
        const plan = membershipsCache.find((m) => m.id == planId);
        if (plan) planFee = Number(plan.amount);
    }

    if (classId && classId !== "0") {
        const cls = classesCache.find((c) => c.id == classId);
        if (cls) classFee = Number(cls.fees || 0);
    }

    const totalFee = planFee + classFee + regFee;

    // Show/hide paid section and update fees
    if (
        (planId && planId !== "0") ||
        (classId && classId !== "0") ||
        regFee > 0
    ) {
        if (paidSection) paidSection.style.display = "block";
        if (planFeeInput)
            planFeeInput.value = "₹" + planFee.toLocaleString("en-IN");
        if (classFeeInput)
            classFeeInput.value = "₹" + classFee.toLocaleString("en-IN");
        if (regFeeDisplay)
            regFeeDisplay.value = "₹" + regFee.toLocaleString("en-IN");
        if (totalFeeInput)
            totalFeeInput.value = "₹" + totalFee.toLocaleString("en-IN");
        if (paidAmountInput) paidAmountInput.max = totalFee;
    } else if (paidSection) {
        paidSection.style.display = "none";
    }

    // Auto-calculate expiry based on plan
    if (!packageType || !startDate || planId === "0") return;

    const start = new Date(startDate);
    let expiry = new Date(start);

    switch (packageType) {
        case "monthly":
            expiry.setMonth(expiry.getMonth() + 1);
            expiry.setDate(expiry.getDate() - 1);
            break;
        case "quarterly":
            expiry.setMonth(expiry.getMonth() + 3);
            expiry.setDate(expiry.getDate() - 1);
            break;
        case "half-yearly":
            expiry.setMonth(expiry.getMonth() + 6);
            expiry.setDate(expiry.getDate() - 1);
            break;
        case "yearly":
            expiry.setFullYear(expiry.getFullYear() + 1);
            expiry.setDate(expiry.getDate() - 1);
            break;
        default:
            return;
    }

    if (expiryDateInput) expiryDateInput.value = getLocalDate(expiry);
}

function clampPaidAmount(input) {
    const totalFeeInput = document.getElementById("member-total-fee");
    if (!totalFeeInput) return;
    const max = Number(totalFeeInput.value.replace(/[₹,]/g, "")) || 0;
    if (Number(input.value) > max) input.value = max;
    if (Number(input.value) < 0) input.value = 0;
}

function esc(s) {
    return (s || "").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// FIX #4: Proper edit member — use user_id from API (not overwritten td.id)
async function editMember(id) {
    try {
        const { ok, data } = await apiFetch(`${API}?action=member&id=${id}`);
        if (ok && data.member) {
            // Ensure we use the correct user_id
            data.member.id = data.member.user_id || data.member.id;
            showAddMemberSheet(data.member);
        } else {
            showSnackbar("Could not load member: " + (data.error || "Unknown error"));
        }
    } catch (e) {
        showSnackbar("Error loading member data");
    }
}

async function submitMember(e, id) {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));
    const btn = form.querySelector('button[type="submit"]');
    if (btn && btn.disabled) return;
    // Validate
    if (!data.name || !data.name.trim()) {
        showSnackbar("Name is required");
        return;
    }
    if (!data.email || !data.email.trim()) {
        showSnackbar("Email is required");
        return;
    }
    if (
        data.phone_number &&
        data.phone_number.replace(/\D/g, "").length > 0 &&
        data.phone_number.replace(/\D/g, "").length < 10
    ) {
        showSnackbar("Phone number must be at least 10 digits");
        return;
    }
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Saving...";
    }

    try {
        let url = `${API}?action=members`;
        let method = "POST";
        if (id) {
            url = `${API}?action=member&id=${id}`;
            method = "PUT";
        }
        const { ok, data: result } = await apiFetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        if (ok && result.success) {
            showSnackbar(id ? "Member updated!" : "Member added!");
            closeSheet();
            if (currentPage === "member-detail") navigate("members");
            else loadMembers();
            refreshDashboardIfVisible();
        } else {
            showSnackbar(result.error || "Error saving member");
            if (btn) {
                btn.disabled = false;
                btn.textContent = id ? "Update" : "Add Member";
            }
        }
    } catch (err) {
        showSnackbar("Connection error");
        if (btn) {
            btn.disabled = false;
            btn.textContent = id ? "Update" : "Add Member";
        }
    }
}

function deleteMember(id) {
    // Deprecated - now uses toggleMemberStatus
    toggleMemberStatus(id, true);
}

async function toggleMemberStatus(id, currentlyActive) {
    const action = currentlyActive ? "Deactivate" : "Activate";
    showConfirm(
        action + " Member",
        `Are you sure you want to ${action.toLowerCase()} this member?`,
        async () => {
            try {
                const { ok, data } = await apiFetch(`${API}?action=member&id=${id}`, {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id }),
                });
                if (ok && data.success) {
                    showSnackbar(data.message || `Member ${action.toLowerCase()}d`);
                    if (currentPage === "member-detail") viewMember(id);
                    else loadMembers();
                    refreshDashboardIfVisible();
                } else {
                    showSnackbar(data.error || "Error updating status");
                }
            } catch (e) {
                showSnackbar("Error updating status");
            }
        },
    );
}

// ==================== RENEW MEMBERSHIP ====================
async function showRenewSheet(userId) {
    try {
        const [mRes, cRes] = await Promise.all([
            fetch(`${API}?action=memberships`),
            fetch(`${API}?action=classes`),
        ]);
        membershipsCache = (await mRes.json()).memberships || [];
        classesCache = (await cRes.json()).classes || [];
    } catch (e) { }

    // Get member's current membership info for renewal start date
    let currentExpiry = null;
    let isCurrentlyActive = false;
    try {
        const memRes = await fetch(`${API}?action=member&id=${userId}`);
        const memData = await memRes.json();
        if (memData.member && memData.member.membership_expiry_date) {
            currentExpiry = memData.member.membership_expiry_date;
            isCurrentlyActive = new Date(currentExpiry) >= new Date();
        }
    } catch (e) { }

    const planOptions = membershipsCache
        .map(
            (m) =>
                `<option value="${m.id}" data-package="${m.package || ""}" data-amount="${m.amount}">${m.title} - ₹${m.amount} (${m.package || "plan"})</option>`,
        )
        .join("");
    const classOptions = classesCache
        .map(
            (c) =>
                `<option value="${c.id}" data-fees="${c.fees || 0}">${c.title} - ₹${c.fees || 0}</option>`,
        )
        .join("");

    // If currently active, start date = last expiry date; otherwise today
    let startDate = getLocalDate();
    let startDateLabel = "Start Date";
    if (isCurrentlyActive && currentExpiry) {
        // Start from the day after current expiry
        const expiryDate = new Date(currentExpiry);
        expiryDate.setDate(expiryDate.getDate() + 1);
        startDate = getLocalDate(expiryDate);
        startDateLabel = "Start Date (after current expiry)";
    }

    const html = `
        <form onsubmit="submitRenew(event, ${userId})">
            ${isCurrentlyActive && currentExpiry ? `<div style="background:var(--blue-bg);color:var(--blue);padding:10px 14px;border-radius:8px;font-size:13px;font-weight:500;margin-bottom:12px;display:flex;align-items:center;gap:6px"><span class="material-icons-round" style="font-size:18px">info</span> Active membership expires on ${currentExpiry}. Renewal starts from next day.</div>` : ""}
            <div class="form-group"><label class="form-label">Select Plan *</label><select class="form-input" name="membership_plan" id="renew-plan-select" onchange="autoCalcRenewExpiry()" required><option value="">Choose plan</option>${planOptions}</select></div>
            <div class="form-group"><label class="form-label">Assign Class</label><select class="form-input" name="class_id" id="renew-class-select" onchange="autoCalcRenewExpiry()"><option value="0">No Class</option>${classOptions}</select></div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">${startDateLabel}</label><input type="date" class="form-input" name="membership_start_date" id="renew-start-date" value="${startDate}" onchange="autoCalcRenewExpiry()"></div>
                <div class="form-group"><label class="form-label">Expiry Date *</label><input type="date" class="form-input" name="membership_expiry_date" id="renew-expiry-date" required></div>
            </div>
            <div class="paid-section" id="renew-paid-section" style="display:none">
                <div class="paid-section-title"><span class="material-icons-round" style="font-size:18px">payments</span> Payment Details</div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">Plan Fee</label><input type="text" class="form-input" id="renew-plan-fee" value="₹0" readonly style="background:var(--surface2);color:var(--text3)"></div>
                    <div class="form-group"><label class="form-label">Class Fee</label><input type="text" class="form-input" id="renew-class-fee" value="₹0" readonly style="background:var(--surface2);color:var(--text3)"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">Total Fee</label><input type="text" class="form-input" id="renew-total-fee" value="₹0" readonly style="background:var(--surface2);color:var(--primary);font-weight:700"></div>
                    <div class="form-group"><label class="form-label">Paid Amount</label><input type="number" step="0.01" class="form-input" name="paid_amount" id="renew-paid-amount" value="0" min="0" placeholder="0" oninput="clampRenewPaid(this)"></div>
                </div>
                <div class="form-group"><label class="form-label">Payment Method</label>
                    <select class="form-input" name="payment_method">
                        <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank_transfer">Bank Transfer</option>
                    </select>
                </div>
            </div>
            <div class="form-actions">
                <button type="button" class="btn-secondary" onclick="closeSheet()">Cancel</button>
                <button type="submit" class="btn-primary">Renew Membership</button>
            </div>
        </form>
    `;
    document.getElementById("sheet-title").textContent = "Renew Membership";
    document.getElementById("sheet-content").innerHTML = html;
    openSheet();
}

function autoCalcRenewExpiry() {
    const planSelect = document.getElementById("renew-plan-select");
    const classSelect = document.getElementById("renew-class-select");
    const startDateInput = document.getElementById("renew-start-date");
    const expiryDateInput = document.getElementById("renew-expiry-date");
    const paidSection = document.getElementById("renew-paid-section");
    const planFeeInput = document.getElementById("renew-plan-fee");
    const classFeeInput = document.getElementById("renew-class-fee");
    const totalFeeInput = document.getElementById("renew-total-fee");
    if (!planSelect) return;

    const selectedOption = planSelect.options[planSelect.selectedIndex];
    const packageType = selectedOption ? selectedOption.dataset.package : "";
    const planAmount = selectedOption
        ? Number(selectedOption.dataset.amount || 0)
        : 0;
    const startDate = startDateInput ? startDateInput.value : "";
    const classId = classSelect ? classSelect.value : "0";

    // Calculate fees
    let classFee = 0;
    if (classId && classId !== "0") {
        const cls = classesCache.find((c) => c.id == classId);
        if (cls) classFee = Number(cls.fees || 0);
    }
    const totalFee = planAmount + classFee;

    // Show paid section and fees
    if (planSelect.value && paidSection) {
        paidSection.style.display = "block";
        if (planFeeInput)
            planFeeInput.value = "₹" + planAmount.toLocaleString("en-IN");
        if (classFeeInput)
            classFeeInput.value = "₹" + classFee.toLocaleString("en-IN");
        if (totalFeeInput)
            totalFeeInput.value = "₹" + totalFee.toLocaleString("en-IN");
        const paidInput = document.getElementById("renew-paid-amount");
        if (paidInput) paidInput.max = totalFee;
    } else if (paidSection) {
        paidSection.style.display = "none";
    }

    if (!packageType || !startDate || planSelect.value === "") return;

    const start = new Date(startDate);
    let expiry = new Date(start);
    switch (packageType) {
        case "monthly":
            expiry.setMonth(expiry.getMonth() + 1);
            expiry.setDate(expiry.getDate() - 1);
            break;
        case "quarterly":
            expiry.setMonth(expiry.getMonth() + 3);
            expiry.setDate(expiry.getDate() - 1);
            break;
        case "half-yearly":
            expiry.setMonth(expiry.getMonth() + 6);
            expiry.setDate(expiry.getDate() - 1);
            break;
        case "yearly":
            expiry.setFullYear(expiry.getFullYear() + 1);
            expiry.setDate(expiry.getDate() - 1);
            break;
        default:
            return;
    }
    if (expiryDateInput) expiryDateInput.value = getLocalDate(expiry);
}

function clampRenewPaid(input) {
    const totalFeeInput = document.getElementById("renew-total-fee");
    if (!totalFeeInput) return;
    const max = Number(totalFeeInput.value.replace(/[₹,]/g, "")) || 0;
    if (Number(input.value) > max) input.value = max;
    if (Number(input.value) < 0) input.value = 0;
}

async function submitRenew(e, userId) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.user_id = userId;
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn && btn.disabled) return;
    if (!data.membership_plan || data.membership_plan === "0") {
        showSnackbar("Please select a membership plan");
        return;
    }
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Processing...";
    }
    try {
        const { ok, data: result } = await apiFetch(
            `${API}?action=renew_membership`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            },
        );
        if (ok && result.success) {
            showSnackbar("Membership renewed!");
            closeSheet();
            viewMember(userId);
            refreshDashboardIfVisible();
        } else {
            showSnackbar((result && result.error) || "Error renewing");
            if (btn) {
                btn.disabled = false;
                btn.textContent = "Renew Membership";
            }
        }
    } catch (e) {
        showSnackbar("Error");
        if (btn) {
            btn.disabled = false;
            btn.textContent = "Renew Membership";
        }
    }
}

// ==================== FREEZE MEMBERSHIP ====================
function showFreezeSheet(userId) {
    const today = getLocalDate();
    const html = `
        <form onsubmit="submitFreeze(event, ${userId})">
            <div class="form-row">
                <div class="form-group"><label class="form-label">Freeze Start *</label><input type="date" class="form-input" name="freeze_start_date" value="${today}" required></div>
                <div class="form-group"><label class="form-label">Freeze End *</label><input type="date" class="form-input" name="freeze_end_date" required></div>
            </div>
            <div class="form-group"><label class="form-label">Remarks</label><textarea class="form-input" name="remarks" rows="2" placeholder="Reason for freeze..."></textarea></div>
            <div class="form-actions">
                <button type="button" class="btn-secondary" onclick="closeSheet()">Cancel</button>
                <button type="submit" class="btn-primary" style="background:linear-gradient(135deg,var(--blue),#2563EB)">Freeze Membership</button>
            </div>
        </form>
    `;
    document.getElementById("sheet-title").textContent = "Freeze Membership";
    document.getElementById("sheet-content").innerHTML = html;
    openSheet();
}

async function submitFreeze(e, userId) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.user_id = userId;
    try {
        const { ok, data: result } = await apiFetch(
            `${API}?action=freeze_membership`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            },
        );
        if (ok && result.success) {
            showSnackbar(`Membership frozen for ${result.freeze_days} days`);
            closeSheet();
            viewMember(userId);
            refreshDashboardIfVisible();
        } else {
            showSnackbar((result && result.error) || "Error freezing");
        }
    } catch (e) {
        showSnackbar("Error");
    }
}

async function unfreezeMember(userId) {
    showConfirm(
        "Unfreeze Membership",
        "Reactivate this membership?",
        async () => {
            try {
                const { ok, data } = await apiFetch(
                    `${API}?action=unfreeze_membership`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ user_id: userId }),
                    },
                );
                if (ok && data.success) {
                    showSnackbar("Membership unfrozen!");
                    viewMember(userId);
                    refreshDashboardIfVisible();
                }
            } catch (e) {
                showSnackbar("Error");
            }
        },
    );
}

// ==================== REPORTS ====================
async function loadReports() {
    document.getElementById("reports-content").innerHTML = skeletonReports();
    try {
        const { ok, data } = await apiFetch(`${API}?action=reports`);
        if (!ok || !data) {
            document.getElementById("reports-content").innerHTML =
                '<div class="empty-state"><span class="material-icons-round">analytics</span><p>Could not load reports</p></div>';
            return;
        }

        let html = `
            <div class="report-stats">
                <div class="report-stat green"><span class="report-stat-val">${data.active_count}</span><span class="report-stat-label">Active</span></div>
                <div class="report-stat red"><span class="report-stat-val">${data.expired_count}</span><span class="report-stat-label">Expired</span></div>
                <div class="report-stat orange"><span class="report-stat-val">${data.expiring_7days.length}</span><span class="report-stat-label">Expiring 7d</span></div>
                <div class="report-stat blue"><span class="report-stat-val">${data.frozen_count}</span><span class="report-stat-label">Frozen</span></div>
            </div>

            <div class="report-stats">
                <div class="report-stat green"><span class="report-stat-val">₹${Number(data.monthly_income).toLocaleString("en-IN")}</span><span class="report-stat-label">Monthly Income</span></div>
                <div class="report-stat red"><span class="report-stat-val">₹${Number(data.monthly_expense).toLocaleString("en-IN")}</span><span class="report-stat-label">Monthly Expense</span></div>
                <div class="report-stat purple"><span class="report-stat-val">${data.new_members_count}</span><span class="report-stat-label">New This Month</span></div>
                <div class="report-stat"><span class="report-stat-val">₹${Number(data.monthly_income - data.monthly_expense).toLocaleString("en-IN")}</span><span class="report-stat-label">Net Profit</span></div>
            </div>
        `;

        // New members this month
        html += `<div class="report-section">
            <div class="report-section-header"><span class="report-section-title"><span class="material-icons-round" style="font-size:18px;color:var(--purple)">person_add</span> New This Month</span><span class="report-count">${data.new_members.length}</span></div>
            <div class="report-list">`;
        if (data.new_members.length > 0) {
            data.new_members.forEach((m) => {
                const ini = (m.name || "?")
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .substring(0, 2)
                    .toUpperCase();
                html += `<div class="report-member-item" onclick="viewMember(${m.id})"><div class="report-member-avatar">${ini}</div><div class="report-member-info"><span class="report-member-name">${m.name}</span><span class="report-member-sub">${m.plan_name || "No Plan"}</span></div><span class="report-member-date" style="color:var(--text3)">${(m.created_at || "").substring(5, 10)}</span></div>`;
            });
        } else {
            html +=
                '<div style="padding:16px;text-align:center;color:var(--text3);font-size:13px">No new members this month</div>';
        }
        html += `</div></div>`;

        // Expiring in 7 days
        html += `<div class="report-section">
            <div class="report-section-header"><span class="report-section-title"><span class="material-icons-round" style="font-size:18px;color:var(--orange)">schedule</span> Expiring in 7 Days</span><span class="report-count">${data.expiring_7days.length}</span></div>
            <div class="report-list">`;
        if (data.expiring_7days.length > 0) {
            data.expiring_7days.forEach((m) => {
                const ini = (m.name || "?")
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .substring(0, 2)
                    .toUpperCase();
                html += `<div class="report-member-item" onclick="viewMember(${m.id})"><div class="report-member-avatar">${ini}</div><div class="report-member-info"><span class="report-member-name">${m.name}</span><span class="report-member-sub">${m.plan_name || "No Plan"}</span></div><span class="report-member-date expiring">${m.membership_expiry_date}</span></div>`;
            });
        } else {
            html +=
                '<div style="padding:16px;text-align:center;color:var(--text3);font-size:13px">No expiring memberships</div>';
        }
        html += `</div></div>`;

        // Expired
        html += `<div class="report-section">
            <div class="report-section-header"><span class="report-section-title"><span class="material-icons-round" style="font-size:18px;color:var(--red)">person_off</span> Expired Members</span><span class="report-count">${data.expired.length}</span></div>
            <div class="report-list">`;
        if (data.expired.length > 0) {
            data.expired.slice(0, 20).forEach((m) => {
                const ini = (m.name || "?")
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .substring(0, 2)
                    .toUpperCase();
                html += `<div class="report-member-item" onclick="viewMember(${m.id})"><div class="report-member-avatar">${ini}</div><div class="report-member-info"><span class="report-member-name">${m.name}</span><span class="report-member-sub">${m.plan_name || "No Plan"}</span></div><span class="report-member-date expired">${m.membership_expiry_date}</span></div>`;
            });
        } else {
            html +=
                '<div style="padding:16px;text-align:center;color:var(--text3);font-size:13px">No expired members</div>';
        }
        html += `</div></div>`;

        // Plan distribution
        if (data.plan_distribution && data.plan_distribution.length > 0) {
            const maxCount = Math.max(
                ...data.plan_distribution.map((p) => p.member_count),
                1,
            );
            html += `<div class="report-section">
                <div class="report-section-header"><span class="report-section-title"><span class="material-icons-round" style="font-size:18px;color:var(--primary)">pie_chart</span> Plan Distribution</span></div>
                <div class="plan-distribution">`;
            data.plan_distribution.forEach((p) => {
                const pct = (p.member_count / maxCount) * 100;
                html += `<div class="plan-dist-item"><div class="plan-dist-info"><span class="plan-dist-name">${p.title}</span><span class="plan-dist-count">${p.member_count} members • ₹${Number(p.amount).toLocaleString("en-IN")}</span></div><div class="plan-dist-bar"><div class="plan-dist-fill" style="width:${pct}%"></div></div></div>`;
            });
            html += `</div></div>`;
        }

        // Attendance chart
        if (data.attendance_chart && data.attendance_chart.length > 0) {
            const maxAtt = Math.max(...data.attendance_chart.map((a) => a.count), 1);
            html += `<div class="report-section">
                <div class="report-section-header"><span class="report-section-title"><span class="material-icons-round" style="font-size:18px;color:var(--teal)">bar_chart</span> Attendance (7 Days)</span></div>
                <div class="att-chart">`;
            data.attendance_chart.forEach((a) => {
                const h = (a.count / maxAtt) * 80;
                const label = a.date.substring(5);
                html += `<div class="att-chart-bar" style="height:${Math.max(h, 4)}px"><span class="att-chart-label">${label}</span></div>`;
            });
            html += `</div></div>`;
        }

        document.getElementById("reports-content").innerHTML = html;
    } catch (err) {
        document.getElementById("reports-content").innerHTML =
            '<div class="empty-state"><span class="material-icons-round">analytics</span><p>Could not load reports</p></div>';
    }
}

// ==================== SUBSCRIPTION ====================
let subscriptionCache = {
    current: null,
    plans: [],
    daysLeft: null,
    isExpired: false,
};

async function loadSubscription() {
    const container = document.getElementById("subscription-content");
    container.innerHTML = skeletonSubscription();

    try {
        const { ok, data } = await apiFetch(`${API}?action=subscription_plans`);
        if (!ok || !data) {
            container.innerHTML =
                '<div class="empty-state"><span class="material-icons-round">error</span><p>Could not load subscription info</p></div>';
            return;
        }

        const current = data.current_subscription;
        const plans = data.plans || [];
        const daysLeft = data.days_left;
        const isExpired = data.is_expired;

        // Cache for upgrade page
        subscriptionCache = { current, plans, daysLeft, isExpired };

        let html = "";

        // Current plan card
        if (current && current.title) {
            const isTrialPlan = current && current.interval === "weekly";
            const statusClass = isExpired
                ? "expired"
                : isTrialPlan
                    ? ""
                    : daysLeft !== null && daysLeft <= 15
                        ? "expiring-soon"
                        : "";
            const statusBadge = isExpired
                ? "Expired"
                : isTrialPlan
                    ? "Free Trial"
                    : daysLeft !== null && daysLeft <= 15
                        ? "Expiring Soon"
                        : "Active";
            const formattedExpiry = current.subscription_expire_date
                ? new Date(current.subscription_expire_date).toLocaleDateString(
                    "en-IN",
                    { day: "numeric", month: "long", year: "numeric" },
                )
                : "N/A";
            const absDaysLeft = daysLeft !== null ? Math.abs(daysLeft) : 0;

            html += `
                <div class="sub-current-card ${statusClass}">
                    <div class="sub-plan-name">${current.title || "No Plan"}</div>
                    <span class="sub-badge">${statusBadge}</span>
                    <div class="sub-expiry-row">
                        <div class="sub-days-left">
                            <div class="sub-days-count">${isExpired ? "-" : ""}${absDaysLeft}</div>
                            <div class="sub-days-label">${isExpired ? "Days Overdue" : "Days Left"}</div>
                        </div>
                        <div>
                            <div class="sub-expiry-date">${isExpired ? "Expired on" : "Valid until"} ${formattedExpiry}</div>
                        </div>
                    </div>
                    <div class="sub-limits">
                        <div class="sub-limit-item"><span class="material-icons-round">people</span> ${current.user_limit || "∞"} Users</div>
                        <div class="sub-limit-item"><span class="material-icons-round">sports_martial_arts</span> ${current.trainer_limit || "∞"} Trainers</div>
                        <div class="sub-limit-item"><span class="material-icons-round">person</span> ${current.trainee_limit || "∞"} Members</div>
                    </div>
                </div>
            `;
        } else {
            html += `
                <div class="sub-current-card expired">
                    <div class="sub-plan-name">No Active Plan</div>
                    <span class="sub-badge">Expired</span>
                    <div class="sub-expiry-row">
                        <div class="sub-days-left">
                            <div class="sub-days-count">0</div>
                            <div class="sub-days-label">Days Left</div>
                        </div>
                        <div>
                            <div class="sub-expiry-date">No active subscription</div>
                        </div>
                    </div>
                </div>
            `;
        }

        // Show current plan + plans with HIGHER price (next-tier upgrades)
        const currentAmount = current ? Number(current.package_amount || 0) : 0;
        const currentPlanId = current ? current.id : null;
        // Filter out Free Trial (weekly) plan from upgrade options
        const paidPlans = plans.filter((p) => p.interval !== "weekly");
        const nextPlans = current
            ? paidPlans.filter((p) => Number(p.package_amount || 0) > currentAmount)
            : paidPlans; // No current plan = show all paid plans as upgrade options

        // Plans list
        html += `<div class="sub-plans-title">${current ? "All Plans" : "Available Plans"}</div>`;

        // Show current plan card (always, even if on trial)
        if (current) {
            const curPrice = Number(current.package_amount || 0).toLocaleString(
                "en-IN",
            );
            const curInterval = current.interval || "monthly";
            const isTrialPlan = current.interval === "weekly";
            const cardClass = isTrialPlan
                ? "sub-plan-card trial-plan"
                : "sub-plan-card current-plan";
            const cardClick = isTrialPlan
                ? ""
                : ` onclick="showRenewPage(${current.id})"`;
            html += `
                <div class="${cardClass}"${cardClick}>
                    <div class="sub-plan-header">
                        <div>
                            <div class="sub-plan-title">${current.title || "Plan"}<span class="sub-current-badge ${isTrialPlan ? "trial-badge" : ""}">${isTrialPlan ? "FREE TRIAL" : "CURRENT"}</span></div>
                        </div>
                        <div class="sub-plan-price">${isTrialPlan ? "Free" : "₹" + curPrice}<span>/${curInterval}</span></div>
                    </div>
                    <div class="sub-plan-limits">
                        <div class="sub-plan-limit"><span class="material-icons-round">people</span> ${current.user_limit || "∞"} Users</div>
                        <div class="sub-plan-limit"><span class="material-icons-round">sports_martial_arts</span> ${current.trainer_limit || "∞"} Trainers</div>
                        <div class="sub-plan-limit"><span class="material-icons-round">person</span> ${current.trainee_limit || "∞"} Members</div>
                    </div>
                    ${isTrialPlan
                    ? `<div class="sub-plan-trial-note">
                        <span class="material-icons-round" style="font-size:14px">info</span> Upgrade to a paid plan to continue after trial ends
                    </div>`
                    : `<div class="sub-plan-renew-hint">
                        <span class="material-icons-round">autorenew</span> Tap to Renew
                    </div>`
                }
                </div>
            `;
        }

        if (paidPlans.length > 0) {
            // Show upgrade plans
            if (nextPlans.length > 0) {
                nextPlans.forEach((plan) => {
                    const price = Number(plan.package_amount || 0).toLocaleString(
                        "en-IN",
                    );
                    const interval = plan.interval || "monthly";

                    html += `
                        <div class="sub-plan-card upgrade" onclick="showUpgradePage(${plan.id})">
                            <div class="sub-plan-header">
                                <div>
                                    <div class="sub-plan-title">${plan.title || "Plan"}</div>
                                </div>
                                <div class="sub-plan-price">₹${price}<span>/${interval}</span></div>
                            </div>
                            <div class="sub-plan-limits">
                                <div class="sub-plan-limit"><span class="material-icons-round">people</span> ${plan.user_limit || "∞"} Users</div>
                                <div class="sub-plan-limit"><span class="material-icons-round">sports_martial_arts</span> ${plan.trainer_limit || "∞"} Trainers</div>
                                <div class="sub-plan-limit"><span class="material-icons-round">person</span> ${plan.trainee_limit || "∞"} Members</div>
                            </div>
                            <div class="sub-plan-upgrade-hint">
                                <span class="material-icons-round">arrow_forward</span> Tap to upgrade
                            </div>
                        </div>
                    `;
                });
            } else if (current) {
                html +=
                    '<div class="sub-max-plan"><span class="material-icons-round">verified</span> You\'re on the highest plan available!</div>';
            }
        } else {
            html +=
                '<div class="empty-state"><span class="material-icons-round">card_membership</span><p>No subscription plans available</p></div>';
        }

        container.innerHTML = html;
    } catch (err) {
        container.innerHTML =
            '<div class="empty-state"><span class="material-icons-round">error</span><p>Could not load subscription info</p></div>';
    }
}

// Calculate expiry date from a start date + interval
function calcSubExpiry(startDate, interval) {
    const start = new Date(startDate);
    // Handle weekly separately (7 days)
    if (interval === "weekly" || interval === "1 week" || interval === "7 days") {
        const expiry = new Date(start);
        expiry.setDate(expiry.getDate() + 7);
        expiry.setDate(expiry.getDate() - 1);
        return getLocalDate(expiry);
    }
    let months = 1;
    if (interval === "monthly" || interval === "1 month") months = 1;
    else if (interval === "quarterly" || interval === "3 months") months = 3;
    else if (interval === "half-yearly" || interval === "6 months") months = 6;
    else if (
        interval === "yearly" ||
        interval === "12 months" ||
        interval === "1 year"
    )
        months = 12;
    else {
        const n = parseInt(interval);
        if (n > 0) months = n;
    }
    const expiry = new Date(start);
    expiry.setMonth(expiry.getMonth() + months);
    expiry.setDate(expiry.getDate() - 1);
    return getLocalDate(expiry);
}

function showUpgradePage(planId) {
    const { current, plans, daysLeft, isExpired } = subscriptionCache;
    const newPlan = plans.find((p) => p.id == planId);
    if (!newPlan) {
        showSnackbar("Plan not found");
        return;
    }

    const container = document.getElementById("subscription-upgrade-content");

    // Determine start date for new plan
    let newStartDate;
    let startDateLabel;
    if (current && current.subscription_expire_date && !isExpired) {
        // New plan starts when current expires
        const expiryDate = new Date(current.subscription_expire_date);
        expiryDate.setDate(expiryDate.getDate() + 1);
        newStartDate = getLocalDate(expiryDate);
        startDateLabel = "Starts after current plan expires";
    } else {
        // No active plan or expired — starts today
        newStartDate = getLocalDate();
        startDateLabel = "Starts immediately";
    }

    const newExpiry = calcSubExpiry(newStartDate, newPlan.interval || "monthly");
    const currentTitle = current && current.title ? current.title : "No Plan";
    const currentExpiry =
        current && current.subscription_expire_date
            ? new Date(current.subscription_expire_date).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric",
            })
            : "N/A";
    const newPrice = Number(newPlan.package_amount || 0).toLocaleString("en-IN");
    const currentPrice = current
        ? Number(current.package_amount || 0).toLocaleString("en-IN")
        : "0";
    const priceDiff =
        Number(newPlan.package_amount || 0) - Number(current?.package_amount || 0);
    const newStartDateFormatted = new Date(newStartDate).toLocaleDateString(
        "en-IN",
        { day: "numeric", month: "long", year: "numeric" },
    );
    const newExpiryFormatted = new Date(newExpiry).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });

    let html = `
        <div class="upgrade-header">
            <span class="material-icons-round" style="font-size:48px;color:var(--primary)">rocket_launch</span>
            <h2>Upgrade Plan</h2>
            <p>Review your plan upgrade details</p>
        </div>

        <!-- Current Plan -->
        <div class="upgrade-section">
            <div class="upgrade-section-title">Current Plan</div>
            <div class="upgrade-plan-card current">
                <div class="upgrade-plan-name">${currentTitle}</div>
                <div class="upgrade-plan-price">₹${currentPrice}</div>
                <div class="upgrade-plan-detail"><span class="material-icons-round">event</span> Expiry: ${currentExpiry}</div>
            </div>
        </div>

        <!-- Arrow -->
        <div class="upgrade-arrow">
            <span class="material-icons-round">arrow_downward</span>
        </div>

        <!-- New Plan -->
        <div class="upgrade-section">
            <div class="upgrade-section-title">New Plan</div>
            <div class="upgrade-plan-card new">
                <div class="upgrade-plan-name">${newPlan.title || "Plan"}</div>
                <div class="upgrade-plan-price">₹${newPrice}<span>/${newPlan.interval || "monthly"}</span></div>
                <div class="upgrade-plan-limits">
                    <div class="upgrade-plan-limit"><span class="material-icons-round">people</span> ${newPlan.user_limit || "∞"} Users</div>
                    <div class="upgrade-plan-limit"><span class="material-icons-round">sports_martial_arts</span> ${newPlan.trainer_limit || "∞"} Trainers</div>
                    <div class="upgrade-plan-limit"><span class="material-icons-round">person</span> ${newPlan.trainee_limit || "∞"} Members</div>
                </div>
            </div>
        </div>

        <!-- Upgrade Summary -->
        <div class="upgrade-summary">
            <div class="upgrade-summary-title">Upgrade Summary</div>
            <div class="upgrade-summary-row">
                <span>New plan starts</span>
                <span class="upgrade-summary-val">${newStartDateFormatted}</span>
            </div>`;

    if (current && !isExpired && current.subscription_expire_date) {
        html += `
            <div class="upgrade-summary-row">
                <span>Current plan active until</span>
                <span class="upgrade-summary-val">${currentExpiry}</span>
            </div>
            <div class="upgrade-notice">
                <span class="material-icons-round">info</span>
                <span>New plan will activate when your current plan expires. No overlap — you get full value from both plans.</span>
            </div>`;
    }

    html += `
            <div class="upgrade-summary-row total">
                <span>Amount to Pay</span>
                <span class="upgrade-summary-val">₹${Number(newPlan.package_amount || 0).toLocaleString("en-IN")}</span>
            </div>
        </div>

        <!-- Pay Now Button -->
        <button class="btn-primary btn-full upgrade-pay-btn" onclick="handleUpgradePay(${planId})">
            <span class="material-icons-round">lock</span>
            Pay ₹${Number(newPlan.package_amount || 0).toLocaleString("en-IN")} Now
        </button>
        <p class="upgrade-pay-note">🔒 Secure payment by Cashfree</p>
    `;

    container.innerHTML = html;
    navigate("subscription-upgrade");
}

// Dummy payment handler — will integrate real gateway later
function handleUpgradePay(planId) {
    initCashfreePayment(planId, "upgrade");
}

// Show renew page for current plan
function showRenewPage(planId) {
    const { current, plans, daysLeft, isExpired } = subscriptionCache;
    if (!current) {
        showSnackbar("No current plan to renew");
        return;
    }

    const container = document.getElementById("subscription-renew-content");

    const curPrice = Number(current.package_amount || 0).toLocaleString("en-IN");
    const curInterval = current.interval || "monthly";

    // Calculate renewal dates
    let renewStartDate;
    let startDateLabel;
    if (current.subscription_expire_date && !isExpired) {
        // Renewal starts when current expires
        const expiryDate = new Date(current.subscription_expire_date);
        expiryDate.setDate(expiryDate.getDate() + 1);
        renewStartDate = getLocalDate(expiryDate);
        startDateLabel = "Starts after current plan expires";
    } else {
        // Expired or no active plan — starts today
        renewStartDate = getLocalDate();
        startDateLabel = isExpired
            ? "Starts immediately (current plan expired)"
            : "Starts immediately";
    }

    const renewExpiry = calcSubExpiry(renewStartDate, curInterval);
    const currentExpiryFormatted = current.subscription_expire_date
        ? new Date(current.subscription_expire_date).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "long",
            year: "numeric",
        })
        : "N/A";
    const renewStartFormatted = new Date(renewStartDate).toLocaleDateString(
        "en-IN",
        { day: "numeric", month: "long", year: "numeric" },
    );
    const renewExpiryFormatted = new Date(renewExpiry).toLocaleDateString(
        "en-IN",
        { day: "numeric", month: "long", year: "numeric" },
    );

    let html = `
        <div class="upgrade-header">
            <span class="material-icons-round" style="font-size:48px;color:var(--green)">autorenew</span>
            <h2>Renew Plan</h2>
            <p>Extend your current subscription</p>
        </div>

        <!-- Current Plan -->
        <div class="upgrade-section">
            <div class="upgrade-section-title">Current Plan</div>
            <div class="upgrade-plan-card current">
                <div class="upgrade-plan-name">${current.title || "Plan"}</div>
                <div class="upgrade-plan-price" style="color:var(--text2)">₹${curPrice}<span>/${curInterval}</span></div>
                <div class="upgrade-plan-detail"><span class="material-icons-round">event</span> ${isExpired ? "Expired on" : "Valid until"}: ${currentExpiryFormatted}</div>
                ${daysLeft !== null && !isExpired ? `<div class="upgrade-plan-detail" style="color:var(--orange)"><span class="material-icons-round">schedule</span> ${Math.abs(daysLeft)} days ${isExpired ? "overdue" : "remaining"}</div>` : ""}
            </div>
        </div>

        <!-- Arrow -->
        <div class="upgrade-arrow" style="color:var(--green)">
            <span class="material-icons-round">arrow_downward</span>
        </div>

        <!-- Renewed Plan -->
        <div class="upgrade-section">
            <div class="upgrade-section-title">Renewal</div>
            <div class="upgrade-plan-card new renew-card">
                <div class="upgrade-plan-name">${current.title || "Plan"} (Renewed)</div>
                <div class="upgrade-plan-price">₹${curPrice}<span>/${curInterval}</span></div>
                <div class="upgrade-plan-limits">
                    <div class="upgrade-plan-limit"><span class="material-icons-round">people</span> ${current.user_limit || "∞"} Users</div>
                    <div class="upgrade-plan-limit"><span class="material-icons-round">sports_martial_arts</span> ${current.trainer_limit || "∞"} Trainers</div>
                    <div class="upgrade-plan-limit"><span class="material-icons-round">person</span> ${current.trainee_limit || "∞"} Members</div>
                </div>
            </div>
        </div>

        <!-- Renewal Summary -->
        <div class="upgrade-summary">
            <div class="upgrade-summary-title">Renewal Summary</div>
            <div class="upgrade-summary-row">
                <span>Renewal starts</span>
                <span class="upgrade-summary-val">${renewStartFormatted}</span>
            </div>`;

    if (current.subscription_expire_date && !isExpired) {
        html += `
            <div class="upgrade-summary-row">
                <span>Current plan active until</span>
                <span class="upgrade-summary-val">${currentExpiryFormatted}</span>
            </div>
            <div class="upgrade-notice renew-notice">
                <span class="material-icons-round">info</span>
                <span>Renewal will activate when your current plan expires. You get full value from both periods — no overlap, no wasted days.</span>
            </div>`;
    } else if (isExpired) {
        html += `
            <div class="upgrade-notice renew-notice" style="background:var(--red-bg);border-color:rgba(239,68,68,0.2);color:var(--red)">
                <span class="material-icons-round">warning</span>
                <span>Your subscription has expired. Renewal will activate immediately to restore full access.</span>
            </div>`;
    }

    html += `
            <div class="upgrade-summary-row total">
                <span>Amount to Pay</span>
                <span class="upgrade-summary-val">₹${curPrice}</span>
            </div>
        </div>

        <!-- Pay Now Button -->
        <button class="btn-primary btn-full upgrade-pay-btn renew-pay-btn" onclick="handleRenewPay(${current.id})">
            <span class="material-icons-round">lock</span>
            Pay ₹${curPrice} Now
        </button>
        <p class="upgrade-pay-note">🔒 Secure payment by Cashfree</p>
    `;

    container.innerHTML = html;
    navigate("subscription-renew");
}

// Dummy renew payment handler — will integrate real gateway later
function handleRenewPay(planId) {
    initCashfreePayment(planId, "renew");
}

// ==================== CASHFREE PAYMENT ====================
let cfPendingOrderId = null;
let cfPaymentActive = false;
let cfPollTimer = null;

function setPayText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function showPayState(state) {
    const states = [
        "preparing",
        "waiting",
        "verifying",
        "success",
        "failed",
        "cancelled",
    ];
    states.forEach((s) => {
        const el = document.getElementById("pay-state-" + s);
        if (el) el.style.display = s === state ? "block" : "none";
    });
    const closeBtn = document.getElementById("payment-modal-close");
    if (closeBtn)
        closeBtn.style.display = ["waiting", "verifying"].includes(state)
            ? "none"
            : "flex";
}

function openPaymentModal() {
    const modal = document.getElementById("payment-modal");
    if (modal) modal.style.display = "flex";
    document.body.style.overflow = "hidden";
}
function closePaymentModal() {
    const modal = document.getElementById("payment-modal");
    if (modal) modal.style.display = "none";
    document.body.style.overflow = "";
    cfPendingOrderId = null;
    cfPaymentActive = false;
    cfReturnCheckDone = false;
    if (cfPollTimer) {
        clearInterval(cfPollTimer);
        cfPollTimer = null;
    }
    if (cfCountdownTimer) {
        clearInterval(cfCountdownTimer);
        cfCountdownTimer = null;
    }
    localStorage.removeItem("cf_pending_order");
}
function closePaymentAndRefresh() {
    closePaymentModal();
    // Reset subscription expired state after successful payment
    subscriptionExpired = false;
    subOverlayDismissed = false;
    document.getElementById("subscription-overlay").style.display = "none";
    navigate("subscription");
    loadSubscription();
    apiFetch(`${API}?action=me`).then(({ ok, data }) => {
        if (ok && data.subscription) updateSubscriptionUI(data.subscription);
        if (ok && !data.subscription_expired) {
            subscriptionExpired = false;
            document.getElementById("subscription-overlay").style.display = "none";
        }
    });
}

async function initCashfreePayment(planId, type) {
    cfPaymentActive = true;
    cfReturnCheckDone = false;
    localStorage.removeItem("cf_pending_order");
    if (cfPollTimer) {
        clearInterval(cfPollTimer);
        cfPollTimer = null;
    }
    if (cfCountdownTimer) {
        clearInterval(cfCountdownTimer);
        cfCountdownTimer = null;
    }
    if (navigator.vibrate) navigator.vibrate(10);
    openPaymentModal();
    showPayState("preparing");

    try {
        const { ok, data } = await apiFetch(
            `${API}?action=create_subscription_order`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plan_id: planId, type: type }),
            },
        );

        if (!ok || !data || !data.link_url) {
            showPayState("failed");
            setPayText(
                "pay-fail-sub",
                (data && data.error) ||
                "Could not create payment link. Please try again.",
            );
            return;
        }

        cfPendingOrderId = data.order_id;

        localStorage.setItem(
            "cf_pending_order",
            JSON.stringify({
                order_id: data.order_id,
                amount: data.amount,
                type: type,
                ts: Date.now(),
            }),
        );

        // Open Cashfree payment link in Chrome
        window.open(data.link_url, "_blank");

        // App stays alive — show waiting screen and start polling
        showPayState("waiting");
        setPayText(
            "pay-wait-amount",
            "₹" + Number(data.amount).toLocaleString("en-IN"),
        );
        startPaymentPoll(data.order_id);
    } catch (err) {
        console.error("Payment init error:", err);
        showPayState("failed");
        setPayText(
            "pay-fail-sub",
            err.message || "Something went wrong. Please try again.",
        );
    }
}

let cfCountdownTimer = null;
let cfRemainingSeconds = 0;

function startPaymentPoll(orderId) {
    if (cfPollTimer) clearInterval(cfPollTimer);
    if (cfCountdownTimer) clearInterval(cfCountdownTimer);
    let attempts = 0;
    cfRemainingSeconds = 300; // 5 minutes countdown

    // Start countdown display
    updateCountdownDisplay();
    cfCountdownTimer = setInterval(() => {
        cfRemainingSeconds--;
        updateCountdownDisplay();
        if (cfRemainingSeconds <= 0) {
            clearInterval(cfCountdownTimer);
            cfCountdownTimer = null;
            if (cfPollTimer) {
                clearInterval(cfPollTimer);
                cfPollTimer = null;
            }
            if (cfPaymentActive) {
                cancelMyPayment();
            }
        }
    }, 1000);

    cfPollTimer = setInterval(async () => {
        if (!cfPaymentActive || !orderId) {
            clearInterval(cfPollTimer);
            cfPollTimer = null;
            if (cfCountdownTimer) {
                clearInterval(cfCountdownTimer);
                cfCountdownTimer = null;
            }
            return;
        }
        attempts++;
        if (attempts > 100) {
            clearInterval(cfPollTimer);
            cfPollTimer = null;
            if (cfPaymentActive) {
                cancelMyPayment();
            }
            return;
        }
        try {
            const { ok, data } = await apiFetch(
                `${API}?action=verify_subscription_payment&order_id=${encodeURIComponent(orderId)}`,
            );
            if (data && data.status === "PAID") {
                clearInterval(cfPollTimer);
                cfPollTimer = null;
                if (cfCountdownTimer) {
                    clearInterval(cfCountdownTimer);
                    cfCountdownTimer = null;
                }
                showPayState("success");
                const planTitle = data.plan_title || "";
                const newExpiry = data.new_expiry || "";
                setPayText(
                    "pay-success-sub",
                    planTitle
                        ? planTitle + " activated! Valid until " + newExpiry
                        : "Your subscription has been updated!",
                );
                if (navigator.vibrate) navigator.vibrate([50, 50, 100]);
                localStorage.removeItem("cf_pending_order");
                return;
            }
            if (
                data &&
                (data.status === "FAILED" ||
                    data.status === "EXPIRED" ||
                    data.status === "CANCELLED" ||
                    data.status === "USER_DROPPED")
            ) {
                clearInterval(cfPollTimer);
                cfPollTimer = null;
                if (cfCountdownTimer) {
                    clearInterval(cfCountdownTimer);
                    cfCountdownTimer = null;
                }
                showPayState("failed");
                setPayText(
                    "pay-fail-sub",
                    data.message || "Payment was not successful.",
                );
                if (navigator.vibrate) navigator.vibrate([100]);
                localStorage.removeItem("cf_pending_order");
                return;
            }
        } catch (e) { }
    }, 3000);
}

function updateCountdownDisplay() {
    const el = document.getElementById("pay-countdown");
    if (!el) return;
    if (cfRemainingSeconds <= 0) {
        el.textContent = "";
        return;
    }
    const m = Math.floor(cfRemainingSeconds / 60);
    const s = cfRemainingSeconds % 60;
    el.textContent = m + ":" + (s < 10 ? "0" : "") + s;
    // Change color when < 60 seconds
    if (cfRemainingSeconds <= 60) {
        el.style.color = "var(--red)";
    } else {
        el.style.color = "var(--orange)";
    }
}

// Called when user clicks "I didn't pay" or countdown expires
async function cancelMyPayment() {
    if (!cfPendingOrderId) return;
    if (cfPollTimer) {
        clearInterval(cfPollTimer);
        cfPollTimer = null;
    }
    if (cfCountdownTimer) {
        clearInterval(cfCountdownTimer);
        cfCountdownTimer = null;
    }
    try {
        await apiFetch(
            `${API}?action=cancel_subscription_order&order_id=${encodeURIComponent(cfPendingOrderId)}`,
        );
    } catch (e) { }
    closePaymentModal();
    navigate("subscription");
    loadSubscription();
}

// Called when user clicks "Check Again" button
function checkPaymentAgain() {
    if (!cfPendingOrderId) return;
    const checkBtn = document.getElementById("pay-check-btn");
    if (checkBtn) checkBtn.style.display = "none";
    // Don't reset countdown — keep it going
    startPaymentPoll(cfPendingOrderId);
}

let cfReturnCheckDone = false;

document.addEventListener("visibilitychange", () => {
    if (
        document.visibilityState === "visible" &&
        cfPaymentActive &&
        cfPendingOrderId &&
        !cfReturnCheckDone
    ) {
        cfReturnCheckDone = true;
        (async () => {
            try {
                const { ok, data } = await apiFetch(
                    `${API}?action=verify_subscription_payment&order_id=${encodeURIComponent(cfPendingOrderId)}`,
                );
                if (data && data.status === "PAID") {
                    if (cfPollTimer) {
                        clearInterval(cfPollTimer);
                        cfPollTimer = null;
                    }
                    if (cfCountdownTimer) {
                        clearInterval(cfCountdownTimer);
                        cfCountdownTimer = null;
                    }
                    showPayState("success");
                    const planTitle = data.plan_title || "";
                    const newExpiry = data.new_expiry || "";
                    setPayText(
                        "pay-success-sub",
                        planTitle
                            ? planTitle + " activated! Valid until " + newExpiry
                            : "Your subscription has been updated!",
                    );
                    if (navigator.vibrate) navigator.vibrate([50, 50, 100]);
                    localStorage.removeItem("cf_pending_order");
                    return;
                }
                if (
                    data &&
                    (data.status === "FAILED" ||
                        data.status === "EXPIRED" ||
                        data.status === "CANCELLED" ||
                        data.status === "USER_DROPPED")
                ) {
                    if (cfPollTimer) {
                        clearInterval(cfPollTimer);
                        cfPollTimer = null;
                    }
                    if (cfCountdownTimer) {
                        clearInterval(cfCountdownTimer);
                        cfCountdownTimer = null;
                    }
                    showPayState("failed");
                    setPayText(
                        "pay-fail-sub",
                        data.message || "Payment was not successful.",
                    );
                    if (navigator.vibrate) navigator.vibrate([100]);
                    localStorage.removeItem("cf_pending_order");
                    return;
                }
                // Still PENDING — wait 5s then check once more
                await new Promise((r) => setTimeout(r, 5000));
                const { ok: ok2, data: data2 } = await apiFetch(
                    `${API}?action=verify_subscription_payment&order_id=${encodeURIComponent(cfPendingOrderId)}`,
                );
                if (data2 && data2.status === "PAID") {
                    if (cfPollTimer) {
                        clearInterval(cfPollTimer);
                        cfPollTimer = null;
                    }
                    if (cfCountdownTimer) {
                        clearInterval(cfCountdownTimer);
                        cfCountdownTimer = null;
                    }
                    showPayState("success");
                    const planTitle = data2.plan_title || "";
                    const newExpiry = data2.new_expiry || "";
                    setPayText(
                        "pay-success-sub",
                        planTitle
                            ? planTitle + " activated! Valid until " + newExpiry
                            : "Your subscription has been updated!",
                    );
                    if (navigator.vibrate) navigator.vibrate([50, 50, 100]);
                    localStorage.removeItem("cf_pending_order");
                    return;
                }
                if (
                    data2 &&
                    (data2.status === "FAILED" ||
                        data2.status === "EXPIRED" ||
                        data2.status === "CANCELLED" ||
                        data2.status === "USER_DROPPED")
                ) {
                    if (cfPollTimer) {
                        clearInterval(cfPollTimer);
                        cfPollTimer = null;
                    }
                    if (cfCountdownTimer) {
                        clearInterval(cfCountdownTimer);
                        cfCountdownTimer = null;
                    }
                    showPayState("failed");
                    setPayText(
                        "pay-fail-sub",
                        data2.message || "Payment was not successful.",
                    );
                    if (navigator.vibrate) navigator.vibrate([100]);
                    localStorage.removeItem("cf_pending_order");
                    return;
                }
                // Still pending — let the polling continue
            } catch (e) { }
        })();
    }
});

function recoverPendingPayment() {
    try {
        const s = localStorage.getItem("cf_pending_order");
        if (!s) return;
        const pending = JSON.parse(s);
        if (!pending || !pending.order_id) return;
        if (Date.now() - pending.ts > 30 * 60 * 1000) {
            localStorage.removeItem("cf_pending_order");
            return;
        }
        apiFetch(
            `${API}?action=verify_subscription_payment&order_id=${encodeURIComponent(pending.order_id)}`,
        )
            .then(({ ok, data }) => {
                if (data && data.status === "PAID") {
                    localStorage.removeItem("cf_pending_order");
                    apiFetch(`${API}?action=me`).then(({ ok: ok2, data: d2 }) => {
                        if (ok2 && d2.subscription) updateSubscriptionUI(d2.subscription);
                    });
                } else if (
                    data &&
                    (data.status === "FAILED" ||
                        data.status === "EXPIRED" ||
                        data.status === "CANCELLED" ||
                        data.status === "USER_DROPPED")
                ) {
                    localStorage.removeItem("cf_pending_order");
                }
            })
            .catch(() => { });
    } catch (e) { }
}

// ==================== TRAINERS ====================
async function loadTrainers() {
    const list = document.getElementById("trainers-list");
    list.innerHTML = skeletonTrainers(3);
    try {
        const { ok, data } = await apiFetch(`${API}?action=trainers`);
        list.innerHTML =
            data.trainers && data.trainers.length > 0
                ? data.trainers
                    .map((t) => {
                        const ini = (t.name || "?")
                            .split(" ")
                            .map((w) => w[0])
                            .join("")
                            .substring(0, 2)
                            .toUpperCase();
                        return `<div class="member-card" onclick="viewTrainer(${t.id})" style="${t.is_active == 0 ? "opacity:0.7" : ""}"><div class="member-avatar" style="background:var(--green-bg);color:var(--green)">${ini}</div><div class="member-info"><span class="member-name">${t.name || "Unknown"}</span><span class="member-sub">${t.qualification || "Trainer"}${t.phone_number ? " • " + t.phone_number : ""}</span></div><span class="member-badge ${t.is_active != 0 ? "badge-active" : "badge-inactive"}">${t.is_active != 0 ? "Active" : "Inactive"}</span></div>`;
                    })
                    .join("")
                : renderEmptyState(
                    "trainers",
                    "No Trainers Yet",
                    "Add your first trainer to get started",
                    "Add Trainer",
                    "showAddTrainerSheet()",
                );
    } catch (e) { }
}

async function viewTrainer(id) {
    try {
        const { ok, data } = await apiFetch(`${API}?action=trainer&id=${id}`);
        if (!ok || !data.trainer) {
            showSnackbar("Trainer not found");
            return;
        }
        const t = data.trainer;
        const ini = (t.name || "?")
            .split(" ")
            .map((w) => w[0])
            .join("")
            .substring(0, 2)
            .toUpperCase();
        document.getElementById("member-detail-content").innerHTML = `
            <div class="detail-header"><div class="detail-avatar" style="background:var(--green-bg);color:var(--green)">${ini}</div><div class="detail-name">${t.name || "Unknown"}</div><div class="detail-subtitle">${t.qualification || "Trainer"}</div></div>
            <div class="detail-section"><div class="detail-section-title">Contact</div><div class="detail-grid"><div class="detail-field"><span class="detail-field-label">Phone</span><span class="detail-field-value">${t.phone_number || "-"}</span></div><div class="detail-field"><span class="detail-field-label">Email</span><span class="detail-field-value" style="font-size:12px">${t.email || "-"}</span></div><div class="detail-field"><span class="detail-field-label">City</span><span class="detail-field-value">${t.city || "-"}</span></div><div class="detail-field"><span class="detail-field-label">Gender</span><span class="detail-field-value">${t.gender || "-"}</span></div></div></div>
            <div class="detail-actions"><button class="btn-secondary" onclick="editTrainer(${t.id})"><span class="material-icons-round" style="font-size:16px;vertical-align:middle">edit</span> Edit</button>
            ${t.is_active == 1
                ? `<button class="btn-secondary" style="color:var(--red);border-color:var(--red)" onclick="deleteTrainer(${t.id})"><span class="material-icons-round" style="font-size:16px;vertical-align:middle">person_off</span> Deactivate</button>`
                : `<button class="btn-secondary" style="color:var(--green);border-color:var(--green)" onclick="deleteTrainer(${t.id})"><span class="material-icons-round" style="font-size:16px;vertical-align:middle">person_check</span> Activate</button>`
            }</div>
        `;
        navigate("member-detail");
        document.getElementById("header-title").textContent = "Trainer Details";
    } catch (e) { }
}

async function showAddTrainerSheet(td = null) {
    const isEdit = !!td;
    const html = `<form onsubmit="submitTrainer(event, ${td ? td.id : "null"})"><div class="form-group"><label class="form-label">Full Name *</label><input type="text" class="form-input" name="name" value="${td ? esc(td.name) : ""}" required></div><div class="form-row"><div class="form-group"><label class="form-label">Email *</label><input type="email" class="form-input" name="email" value="${td ? esc(td.email) : ""}" required></div><div class="form-group"><label class="form-label">Phone</label><input type="tel" class="form-input" name="phone_number" value="${td ? esc(td.phone_number || "") : ""}"></div></div>${!isEdit ? '<div class="form-group"><label class="form-label">Password</label><input type="password" class="form-input" name="password" placeholder="Default: 123456"></div>' : ""}<div class="form-row"><div class="form-group"><label class="form-label">Gender</label><select class="form-input" name="gender"><option value="">Select</option><option value="male" ${td && td.gender === "male" ? "selected" : ""}>Male</option><option value="female" ${td && td.gender === "female" ? "selected" : ""}>Female</option></select></div><div class="form-group"><label class="form-label">DOB</label><input type="date" class="form-input" name="dob" value="${td ? td.dob || "" : ""}"></div></div><div class="form-group"><label class="form-label">Qualification</label><input type="text" class="form-input" name="qualification" value="${td ? esc(td.qualification || "") : ""}" placeholder="e.g., Certified Trainer"></div><div class="form-group"><label class="form-label">Address</label><input type="text" class="form-input" name="address" value="${td ? esc(td.address || "") : ""}"></div><div class="form-row"><div class="form-group"><label class="form-label">City</label><input type="text" class="form-input" name="city" value="${td ? esc(td.city || "") : ""}"></div><div class="form-group"><label class="form-label">State</label><input type="text" class="form-input" name="state" value="${td ? esc(td.state || "") : ""}"></div></div><div class="form-actions"><button type="button" class="btn-secondary" onclick="closeSheet()">Cancel</button><button type="submit" class="btn-primary">${isEdit ? "Update" : "Add Trainer"}</button></div></form>`;
    document.getElementById("sheet-title").textContent = isEdit
        ? "Edit Trainer"
        : "Add Trainer";
    document.getElementById("sheet-content").innerHTML = html;
    openSheet();
}
async function editTrainer(id) {
    try {
        const { ok, data } = await apiFetch(`${API}?action=trainer&id=${id}`);
        if (ok && data.trainer) showAddTrainerSheet(data.trainer);
    } catch (e) { }
}
async function submitTrainer(e, id) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn && btn.disabled) return;
    if (!data.name || !data.name.trim()) {
        showSnackbar("Name is required");
        return;
    }
    if (!data.email || !data.email.trim()) {
        showSnackbar("Email is required");
        return;
    }
    if (
        data.phone_number &&
        data.phone_number.replace(/\D/g, "").length > 0 &&
        data.phone_number.replace(/\D/g, "").length < 10
    ) {
        showSnackbar("Phone number must be at least 10 digits");
        return;
    }
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Saving...";
    }
    try {
        let url = `${API}?action=trainers`;
        let method = "POST";
        if (id) {
            url = `${API}?action=trainer&id=${id}`;
            method = "PUT";
        }
        const { ok, data: result } = await apiFetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        if (ok && result.success) {
            showSnackbar(id ? "Updated!" : "Trainer added!");
            closeSheet();
            loadTrainers();
            refreshDashboardIfVisible();
        } else {
            showSnackbar(result.error || "Error");
            if (btn) {
                btn.disabled = false;
                btn.textContent = id ? "Update" : "Add Trainer";
            }
        }
    } catch (e) {
        showSnackbar("Error");
        if (btn) {
            btn.disabled = false;
            btn.textContent = id ? "Update" : "Add Trainer";
        }
    }
}
function deleteTrainer(id) {
    showConfirm(
        "Deactivate Trainer",
        "Deactivate this trainer? You can reactivate later.",
        async () => {
            try {
                const { ok, data } = await apiFetch(`${API}?action=trainer&id=${id}`, {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id }),
                });
                if (ok && data.success) {
                    showSnackbar(data.message || "Trainer deactivated");
                    loadTrainers();
                    refreshDashboardIfVisible();
                } else {
                    showSnackbar(data.error || "Error updating trainer");
                }
            } catch (e) {
                showSnackbar("Connection error");
            }
        },
    );
}

// ==================== ATTENDANCE ====================
async function loadAttendance() {
    const date = document.getElementById("att-date").value;
    const list = document.getElementById("attendance-list");
    list.innerHTML = skeletonAttendance();
    try {
        const { ok, data } = await apiFetch(
            `${API}?action=attendance&date=${date}`,
        );
        const att = (ok && data.attendance) || [];
        document.getElementById("att-total").textContent = att.length;
        document.getElementById("att-checkedin").textContent = att.filter(
            (a) => !a.checked_out_time,
        ).length;
        document.getElementById("att-checkedout").textContent = att.filter(
            (a) => a.checked_out_time,
        ).length;

        const list = document.getElementById("attendance-list");
        list.innerHTML =
            att.length > 0
                ? att
                    .map(
                        (a) =>
                            `<div class="attendance-item"><div class="att-time"><span class="att-time-val">${a.checked_in_time ? a.checked_in_time.substring(0, 5) : "-"}</span><span class="att-time-label">In</span></div><div class="att-user-info"><span class="att-user-name">${a.name}</span><span class="att-user-sub">${a.phone_number || ""}</span></div>${a.checked_out_time ? `<span class="member-badge badge-inactive">Out ${a.checked_out_time.substring(0, 5)}</span>` : `<button class="checkout-btn" onclick="checkoutMember(${a.user_id})">Check Out</button>`}</div>`,
                    )
                    .join("")
                : '<div class="empty-state"><span class="material-icons-round">event_available</span><p>No records for this date</p></div>';
    } catch (e) { }
}
function changeAttDate(d) {
    const i = document.getElementById("att-date");
    const dt = new Date(i.value);
    dt.setDate(dt.getDate() + d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newDate = new Date(dt);
    newDate.setHours(0, 0, 0, 0);
    if (newDate > today) return; // Don't allow future dates
    i.value = getLocalDate(dt);
    // Hide next button if on today
    const nextBtn = document.getElementById("att-next-btn");
    if (nextBtn) {
        const sel = new Date(i.value);
        sel.setHours(0, 0, 0, 0);
        nextBtn.style.opacity = sel.getTime() >= today.getTime() ? "0.3" : "1";
        nextBtn.style.pointerEvents =
            sel.getTime() >= today.getTime() ? "none" : "auto";
    }
    loadAttendance();
}
async function searchForCheckin(q) {
    const r = document.getElementById("att-search-results");
    if (q.length < 2) {
        r.style.display = "none";
        return;
    }
    try {
        const { ok, data } = await apiFetch(
            `${API}?action=attendance_search&q=${encodeURIComponent(q)}`,
        );
        if (ok && data.users && data.users.length > 0) {
            r.style.display = "block";
            r.innerHTML = data.users
                .map(
                    (u) =>
                        `<div class="search-result-item" onclick="checkinMember(${u.id},'${u.name.replace(/'/g, "\\'")}')"><span class="material-icons-round" style="color:var(--primary)">person</span><div style="flex:1"><div style="font-weight:600">${u.name}</div><div style="font-size:12px;color:var(--text3)">${u.phone_number || ""}</div></div><span class="material-icons-round" style="color:var(--primary)">login</span></div>`,
                )
                .join("");
        } else {
            r.style.display = "block";
            r.innerHTML =
                '<div style="padding:16px;text-align:center;color:var(--text3)">No members found</div>';
        }
    } catch (e) { }
}
async function checkinMember(userId, name) {
    document.getElementById("att-search-results").style.display = "none";
    document.getElementById("att-search").value = "";
    try {
        const { ok, data } = await apiFetch(`${API}?action=attendance`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId, type: "checkin" }),
        });
        if (ok && data.success) {
            showSnackbar(`${name} checked in!`);
            loadAttendance();
            refreshDashboardIfVisible();
        } else {
            showSnackbar(data.error || "Check-in failed");
        }
    } catch (e) { }
}
async function checkoutMember(userId) {
    try {
        const { ok, data } = await apiFetch(`${API}?action=attendance`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId, type: "checkout" }),
        });
        if (ok && data.success) {
            showSnackbar("Checked out!");
            loadAttendance();
            refreshDashboardIfVisible();
        }
    } catch (e) { }
}

// ==================== MEMBERSHIPS ====================
async function loadMemberships() {
    const list = document.getElementById("memberships-list");
    list.innerHTML = skeletonPlans(3);
    try {
        const { ok, data } = await apiFetch(`${API}?action=memberships`);
        list.innerHTML =
            data.memberships && data.memberships.length > 0
                ? data.memberships
                    .map(
                        (m) =>
                            `<div class="plan-card"><div class="plan-card-header"><div><div class="plan-title">${m.title}</div><div class="plan-meta"><span class="plan-meta-item"><span class="material-icons-round">people</span> ${m.member_count || 0} members</span><span class="plan-meta-item"><span class="material-icons-round">category</span> ${m.package || "-"}</span></div></div><div class="plan-amount">₹${Number(m.amount).toLocaleString("en-IN")}<span>/${m.package || "plan"}</span></div></div>${m.notes ? `<div style="font-size:12px;color:var(--text3);margin-top:4px">${m.notes}</div>` : ""}<div class="plan-actions"><button class="btn-text" onclick="editMembership(${m.id})">Edit</button><button class="btn-text" style="color:var(--red)" onclick="deleteMembership(${m.id})">Delete</button></div></div>`,
                    )
                    .join("")
                : renderEmptyState(
                    "plans",
                    "No Plans Yet",
                    "Create your first membership plan",
                    "Add Plan",
                    "showAddMembershipSheet()",
                );
    } catch (e) { }
}

function showAddMembershipSheet(planData = null) {
    const isEdit = !!planData;
    const html = `<form onsubmit="submitMembership(event, ${planData ? planData.id : "null"})"><div class="form-group"><label class="form-label">Plan Name *</label><input type="text" class="form-input" name="title" value="${planData ? esc(planData.title) : ""}" required placeholder="e.g., Monthly Gold"></div><div class="form-row"><div class="form-group"><label class="form-label">Amount (₹) *</label><input type="number" class="form-input" name="amount" value="${planData ? planData.amount : ""}" required placeholder="999"></div><div class="form-group"><label class="form-label">Package</label><select class="form-input" name="package"><option value="monthly" ${planData && planData.package === "monthly" ? "selected" : ""}>Monthly</option><option value="quarterly" ${planData && planData.package === "quarterly" ? "selected" : ""}>Quarterly</option><option value="half-yearly" ${planData && planData.package === "half-yearly" ? "selected" : ""}>Half-Yearly</option><option value="yearly" ${planData && planData.package === "yearly" ? "selected" : ""}>Yearly</option></select></div></div><div class="form-group"><label class="form-label">Notes</label><textarea class="form-input" name="notes" rows="2" placeholder="Plan details...">${planData ? planData.notes || "" : ""}</textarea></div><div class="form-actions"><button type="button" class="btn-secondary" onclick="closeSheet()">Cancel</button><button type="submit" class="btn-primary">${isEdit ? "Update" : "Add Plan"}</button></div></form>`;
    document.getElementById("sheet-title").textContent = isEdit
        ? "Edit Plan"
        : "Add Plan";
    document.getElementById("sheet-content").innerHTML = html;
    openSheet();
}
async function editMembership(id) {
    try {
        const { ok, data } = await apiFetch(`${API}?action=memberships`);
        const p = ok ? data.memberships.find((m) => m.id === id) : null;
        if (p) showAddMembershipSheet(p);
    } catch (e) { }
}
async function submitMembership(e, id) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
        let url = `${API}?action=memberships`;
        let method = "POST";
        if (id) {
            url = `${API}?action=membership&id=${id}`;
            method = "PUT";
        }
        const { ok, data: result } = await apiFetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        if (ok && result.success) {
            showSnackbar(id ? "Updated!" : "Plan added!");
            closeSheet();
            loadMemberships();
        }
    } catch (e) {
        showSnackbar("Error");
    }
}
function deleteMembership(id) {
    showConfirm(
        "Delete Plan",
        "Delete this plan? Members on this plan cannot be removed if active.",
        async () => {
            try {
                const { ok, data } = await apiFetch(
                    `${API}?action=membership&id=${id}`,
                    {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id }),
                    },
                );
                if (ok && data.success) {
                    showSnackbar("Deleted");
                    loadMemberships();
                } else {
                    showSnackbar(data.error || "Cannot delete plan");
                }
            } catch (e) {
                showSnackbar("Connection error");
            }
        },
    );
}

// ==================== CLASSES ====================
async function loadClasses() {
    const l = document.getElementById("classes-list");
    l.innerHTML = skeletonClasses(3);
    try {
        const r = await fetch(`${API}?action=classes`);
        const d = await r.json();
        l.innerHTML =
            d.classes && d.classes.length > 0
                ? d.classes
                    .map(
                        (c) =>
                            `<div class="class-card"><div class="class-card-accent"></div><div class="class-card-body"><div class="class-card-title">${c.title}</div><div class="class-card-info"><span class="class-info-item"><span class="material-icons-round">currency_rupee</span> ₹${c.fees}</span><span class="class-info-item"><span class="material-icons-round">people</span> ${c.assigned_count || 0} enrolled</span>${c.address ? `<span class="class-info-item"><span class="material-icons-round">location_on</span> ${c.address}</span>` : ""}</div><div style="margin-top:8px;display:flex;gap:8px"><button class="btn-text" onclick="viewClass(${c.id})">Details</button><button class="btn-text" style="color:var(--red)" onclick="deleteClass(${c.id})">Delete</button></div></div></div>`,
                    )
                    .join("")
                : renderEmptyState(
                    "classes",
                    "No Classes Yet",
                    "Create your first class to schedule sessions",
                    "Add Class",
                    "showAddClassSheet()",
                );
    } catch (e) { }
}
function showAddClassSheet() {
    const h = `<form onsubmit="submitClass(event)"><div class="form-group"><label class="form-label">Class Name *</label><input type="text" class="form-input" name="title" required placeholder="e.g., Yoga, HIIT"></div><div class="form-row"><div class="form-group"><label class="form-label">Fees (₹)</label><input type="number" class="form-input" name="fees" value="0"></div><div class="form-group"><label class="form-label">Address</label><input type="text" class="form-input" name="address" placeholder="Location"></div></div><div class="form-group"><label class="form-label">Notes</label><textarea class="form-input" name="notes" rows="2" placeholder="Class description..."></textarea></div><div class="form-actions"><button type="button" class="btn-secondary" onclick="closeSheet()">Cancel</button><button type="submit" class="btn-primary">Add Class</button></div></form>`;
    document.getElementById("sheet-title").textContent = "Add Class";
    document.getElementById("sheet-content").innerHTML = h;
    openSheet();
}
async function submitClass(e) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try {
        if (
            (
                await (
                    await fetch(`${API}?action=classes`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(d),
                    })
                ).json()
            ).success
        ) {
            showSnackbar("Class added!");
            closeSheet();
            loadClasses();
            refreshDashboardIfVisible();
        }
    } catch (e) {
        showSnackbar("Error");
    }
}
async function viewClass(id) {
    try {
        const r = await fetch(`${API}?action=class&id=${id}`);
        const d = await r.json();
        if (d.class) {
            const c = d.class;
            let s = "";
            if (c.schedules && c.schedules.length > 0)
                s = `<div class="detail-section"><div class="detail-section-title">Schedule</div>${c.schedules.map((sc) => `<div class="att-history-item"><span class="att-history-date">${sc.days}</span><span class="att-history-time">${sc.start_time || ""} - ${sc.end_time || ""}</span></div>`).join("")}</div>`;
            document.getElementById("member-detail-content").innerHTML =
                `<div class="detail-header"><div class="detail-avatar" style="background:var(--purple-bg);color:var(--purple)"><span class="material-icons-round" style="font-size:28px">self_improvement</span></div><div class="detail-name">${c.title}</div><div class="detail-subtitle">₹${c.fees} • ${c.address || "No location"}</div></div>${c.notes ? `<div class="detail-section"><div class="detail-section-title">Description</div><p style="font-size:13px;color:var(--text2)">${c.notes}</p></div>` : ""}${s}`;
            navigate("member-detail");
            document.getElementById("header-title").textContent = "Class Details";
        }
    } catch (e) { }
}
function deleteClass(id) {
    showConfirm("Delete Class", "Delete this class?", async () => {
        try {
            const res = await fetch(`${API}?action=class&id=${id}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showSnackbar("Deleted");
                loadClasses();
            } else {
                showSnackbar(data.error || "Error deleting");
            }
        } catch (e) {
            showSnackbar("Connection error");
        }
    });
}

// ==================== EXPENSES ====================
async function loadExpenses() {
    const months = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];
    document.getElementById("expense-month-label").textContent =
        `${months[expMonth - 1]} ${expYear}`;
    const l = document.getElementById("expenses-list");
    l.innerHTML = skeletonExpenses();
    try {
        const r = await fetch(
            `${API}?action=expenses&month=${expMonth}&year=${expYear}`,
        );
        const d = await r.json();
        expensesCache = d.expenses || [];
        document.getElementById("exp-total").textContent =
            "₹" + Number(d.total || 0).toLocaleString("en-IN");
        l.innerHTML =
            d.expenses && d.expenses.length > 0
                ? d.expenses
                    .map(
                        (e) =>
                            `<div class="expense-item"><div class="expense-icon"><span class="material-icons-round" style="font-size:20px">payments</span></div><div class="expense-info"><span class="expense-title">${e.title || "Expense"}</span><span class="expense-date">${e.date || ""}${e.notes ? " • " + e.notes : ""}</span></div><div class="expense-actions"><span class="expense-amount">₹${Number(e.amount).toLocaleString("en-IN")}</span><div class="expense-btn-row"><button class="icon-btn sm" onclick="editExpense(${e.id})"><span class="material-icons-round" style="font-size:18px;color:var(--primary)">edit</span></button><button class="icon-btn sm" onclick="deleteExpense(${e.id})"><span class="material-icons-round" style="font-size:18px;color:var(--red)">delete</span></button></div></div></div>`,
                    )
                    .join("")
                : renderEmptyState(
                    "revenue",
                    "No Expenses",
                    "No expenses recorded this month",
                    "Add Expense",
                    "showAddExpenseSheet()",
                );
    } catch (e) { }
}
function changeExpMonth(d) {
    expMonth += d;
    if (expMonth > 12) {
        expMonth = 1;
        expYear++;
    }
    if (expMonth < 1) {
        expMonth = 12;
        expYear--;
    }
    loadExpenses();
}
function showAddExpenseSheet() {
    const h = `<form onsubmit="submitExpense(event)"><div class="form-group"><label class="form-label">Title *</label><input type="text" class="form-input" name="title" required placeholder="e.g., Equipment Repair"></div><div class="form-row"><div class="form-group"><label class="form-label">Amount (₹) *</label><input type="number" step="0.01" class="form-input" name="amount" required placeholder="0.00"></div><div class="form-group"><label class="form-label">Date *</label><input type="date" class="form-input" name="date" value="${getLocalDate()}" required></div></div><div class="form-group"><label class="form-label">Notes</label><textarea class="form-input" name="notes" rows="2" placeholder="Optional notes"></textarea></div><div class="form-actions"><button type="button" class="btn-secondary" onclick="closeSheet()">Cancel</button><button type="submit" class="btn-primary">Add Expense</button></div></form>`;
    document.getElementById("sheet-title").textContent = "Add Expense";
    document.getElementById("sheet-content").innerHTML = h;
    openSheet();
}
async function submitExpense(e) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn && btn.disabled) return;
    if (!d.title || !d.title.trim()) {
        showSnackbar("Title is required");
        return;
    }
    if (!d.amount || Number(d.amount) <= 0) {
        showSnackbar("Amount must be greater than 0");
        return;
    }
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Saving...";
    }
    try {
        if (
            (
                await (
                    await fetch(`${API}?action=expenses`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(d),
                    })
                ).json()
            ).success
        ) {
            showSnackbar("Expense added!");
            closeSheet();
            loadExpenses();
            refreshDashboardIfVisible();
        } else {
            if (btn) {
                btn.disabled = false;
                btn.textContent = "Add Expense";
            }
        }
    } catch (e) {
        showSnackbar("Error");
        if (btn) {
            btn.disabled = false;
            btn.textContent = "Add Expense";
        }
    }
}

function editExpense(id) {
    const exp = expensesCache.find((e) => e.id === id);
    if (!exp) {
        showSnackbar("Expense not found");
        return;
    }
    const h = `<form onsubmit="submitEditExpense(event, ${id})"><div class="form-group"><label class="form-label">Title *</label><input type="text" class="form-input" name="title" value="${esc(exp.title || "")}" required></div><div class="form-row"><div class="form-group"><label class="form-label">Amount (₹) *</label><input type="number" step="0.01" class="form-input" name="amount" value="${exp.amount}" required></div><div class="form-group"><label class="form-label">Date *</label><input type="date" class="form-input" name="date" value="${exp.date || ""}" required></div></div><div class="form-group"><label class="form-label">Notes</label><textarea class="form-input" name="notes" rows="2">${exp.notes || ""}</textarea></div><div class="form-actions"><button type="button" class="btn-secondary" onclick="closeSheet()">Cancel</button><button type="submit" class="btn-primary">Update Expense</button></div></form>`;
    document.getElementById("sheet-title").textContent = "Edit Expense";
    document.getElementById("sheet-content").innerHTML = h;
    openSheet();
}

async function submitEditExpense(e, id) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn && btn.disabled) return;
    if (!d.title || !d.title.trim()) {
        showSnackbar("Title is required");
        return;
    }
    if (!d.amount || Number(d.amount) <= 0) {
        showSnackbar("Amount must be greater than 0");
        return;
    }
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Saving...";
    }
    try {
        const res = await fetch(`${API}?action=expense&id=${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(d),
        });
        const data = await res.json();
        if (data.success) {
            showSnackbar("Expense updated!");
            closeSheet();
            loadExpenses();
            refreshDashboardIfVisible();
        } else {
            showSnackbar(data.error || "Error updating");
            if (btn) {
                btn.disabled = false;
                btn.textContent = "Update Expense";
            }
        }
    } catch (err) {
        showSnackbar("Connection error");
        if (btn) {
            btn.disabled = false;
            btn.textContent = "Update Expense";
        }
    }
}

function deleteExpense(id) {
    const expenseId = parseInt(id);
    if (!expenseId || isNaN(expenseId)) {
        showSnackbar("Invalid expense");
        return;
    }
    showConfirm(
        "Delete Expense",
        "Are you sure you want to delete this expense?",
        async () => {
            try {
                const res = await fetch(`${API}?action=expense&id=${expenseId}`, {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: expenseId }),
                });
                if (!res.ok) {
                    showSnackbar("Error deleting expense");
                    return;
                }
                const data = await res.json();
                if (data.success) {
                    showSnackbar("Expense deleted");
                    loadExpenses();
                    refreshDashboardIfVisible();
                } else {
                    showSnackbar(data.error || "Error deleting");
                }
            } catch (err) {
                showSnackbar("Connection error");
            }
        },
    );
}

// ==================== TRANSACTIONS ====================
async function loadTransactions() {
    const months = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];
    document.getElementById("txn-month-label").textContent =
        `${months[txnMonth - 1]} ${txnYear}`;
    const list = document.getElementById("transactions-list");
    list.innerHTML = skeletonTransactions();
    try {
        const res = await fetch(
            `${API}?action=transactions&month=${txnMonth}&year=${txnYear}`,
        );
        const data = await res.json();
        document.getElementById("txn-income").textContent =
            "₹" + Number(data.total_income || 0).toLocaleString("en-IN");
        document.getElementById("txn-expense").textContent =
            "₹" + Number(data.total_expense || 0).toLocaleString("en-IN");

        const list = document.getElementById("transactions-list");
        if (data.transactions && data.transactions.length > 0) {
            let html = "";
            let lastDate = "";
            data.transactions.forEach((t) => {
                const dateStr = t.date;
                if (dateStr !== lastDate) {
                    const d = new Date(dateStr);
                    html += `<div class="txn-date-separator">${d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>`;
                    lastDate = dateStr;
                }
                const isIncome = t.type === "income";
                const hasInvoice =
                    isIncome && t.invoice_db_id && Number(t.invoice_db_id) > 0;
                html += `<div class="txn-item${hasInvoice ? " txn-clickable" : ""}" ${hasInvoice ? `onclick="viewInvoice(${Number(t.invoice_db_id)})"` : ""}>
                    <div class="txn-icon ${t.type}"><span class="material-icons-round">${isIncome ? "arrow_downward" : "arrow_upward"}</span></div>
                    <div class="txn-info"><span class="txn-desc">${esc(t.description || (isIncome ? "Income" : "Expense"))}</span><span class="txn-meta">${isIncome ? (t.member_name || "") + (t.method ? " • " + t.method.toUpperCase() : "") : ""}</span></div>
                    <span class="txn-amount ${t.type}">${isIncome ? "+" : "-"}₹${Number(t.amount).toLocaleString("en-IN")}</span>
                </div>`;
            });
            list.innerHTML = html;
        } else {
            list.innerHTML = renderEmptyState(
                "revenue",
                "No Transactions",
                "No income or expenses recorded this month",
            );
        }
    } catch (e) {
        document.getElementById("transactions-list").innerHTML =
            '<div class="empty-state"><span class="material-icons-round">swap_horiz</span><p>Could not load transactions</p></div>';
    }
}
function changeTxnMonth(d) {
    txnMonth += d;
    if (txnMonth > 12) {
        txnMonth = 1;
        txnYear++;
    }
    if (txnMonth < 1) {
        txnMonth = 12;
        txnYear--;
    }
    // Don't allow future months
    const now = new Date();
    const curMonth = now.getMonth() + 1;
    const curYear = now.getFullYear();
    if (txnYear > curYear || (txnYear === curYear && txnMonth > curMonth)) {
        txnMonth = curMonth;
        txnYear = curYear;
    }
    // Update next button state
    const nextBtn = document.getElementById("txn-next-btn");
    if (nextBtn) {
        const isCurrent = txnYear === curYear && txnMonth === curMonth;
        nextBtn.style.opacity = isCurrent ? "0.3" : "1";
        nextBtn.style.pointerEvents = isCurrent ? "none" : "auto";
    }
    loadTransactions();
}

// ==================== INVOICES ====================
async function loadInvoices(status = "") {
    const l = document.getElementById("invoices-list");
    l.innerHTML = skeletonInvoices(4);
    try {
        let url = `${API}?action=invoices`;
        if (status && status !== "all") url += `&status=${status}`;
        const r = await fetch(url);
        const d = await r.json();
        l.innerHTML =
            d.invoices && d.invoices.length > 0
                ? d.invoices
                    .map((i) => {
                        const sc =
                            i.status === "paid"
                                ? "status-paid"
                                : i.status === "partial"
                                    ? "status-partial"
                                    : "status-unpaid";
                        return `<div class="invoice-card" onclick="viewInvoice(${i.id})"><div class="invoice-id">#${i.invoice_id}</div><div class="invoice-info"><span class="invoice-name" style="color:var(--text2)">${i.member_name}</span><span class="invoice-date">${i.invoice_date || ""}</span></div><span class="invoice-status ${sc}">${i.status || "unpaid"}</span></div>`;
                    })
                    .join("")
                : renderEmptyState(
                    "invoice",
                    "No Invoices",
                    "Create invoices for membership payments",
                    "Add Invoice",
                    "showAddInvoiceSheet()",
                );
    } catch (e) { }
}
function filterInvoices(status, btn) {
    invoiceFilter = status;
    document
        .querySelectorAll("#invoice-filters .chip")
        .forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    loadInvoices(status);
}
async function showAddInvoiceSheet() {
    let mo = "";
    try {
        const r = await fetch(`${API}?action=members`);
        const d = await r.json();
        mo = (d.members || [])
            .map((m) => `<option value="${m.id}">${m.name}</option>`)
            .join("");
    } catch (e) { }
    const h = `<form onsubmit="submitInvoice(event)"><div class="form-group"><label class="form-label">Member *</label><select class="form-input" name="user_id" required><option value="">Select Member</option>${mo}</select></div><div class="form-row"><div class="form-group"><label class="form-label">Invoice Date</label><input type="date" class="form-input" name="invoice_date" value="${getLocalDate()}"></div><div class="form-group"><label class="form-label">Due Date</label><input type="date" class="form-input" name="invoice_due_date"></div></div><div class="form-group"><label class="form-label">Notes</label><textarea class="form-input" name="notes" rows="2"></textarea></div><div class="form-actions"><button type="button" class="btn-secondary" onclick="closeSheet()">Cancel</button><button type="submit" class="btn-primary">Create Invoice</button></div></form>`;
    document.getElementById("sheet-title").textContent = "New Invoice";
    document.getElementById("sheet-content").innerHTML = h;
    openSheet();
}
async function submitInvoice(e) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    d.status = "unpaid";
    d.items = [];
    try {
        if (
            (
                await (
                    await fetch(`${API}?action=invoices`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(d),
                    })
                ).json()
            ).success
        ) {
            showSnackbar("Invoice created!");
            closeSheet();
            loadInvoices();
            refreshDashboardIfVisible();
        }
    } catch (e) {
        showSnackbar("Error");
    }
}
async function viewInvoice(id) {
    try {
        const { ok, data } = await apiFetch(`${API}?action=invoice&id=${id}`);
        if (!ok || !data.invoice) {
            showSnackbar("Error loading invoice");
            return;
        }
        const inv = data.invoice;
        const total =
            inv.total_amount != null
                ? Number(inv.total_amount)
                : (inv.items || []).reduce((s, i) => s + Number(i.amount), 0);
        const paid =
            inv.paid_amount != null
                ? Number(inv.paid_amount)
                : (inv.payments || []).reduce((s, p) => s + Number(p.amount), 0);
        const due = Math.max(0, total - paid);
        const isPaid = inv.status === "paid" || due <= 0;
        const gymName = gymInfoCache.name || "GymXBook";
        const gymPhone = gymInfoCache.phone || "";
        const gymEmail = gymInfoCache.email || "";
        const gymAddress = gymInfoCache.address || "";

        // Items table
        let itemsHtml = "";
        if (inv.items && inv.items.length > 0) {
            itemsHtml = inv.items
                .map(
                    (i, idx) => `
                <div class="inv-row${idx % 2 === 0 ? " inv-row-alt" : ""}">
                    <span class="inv-item-sr">${idx + 1}</span>
                    <span class="inv-item-title">${i.title}</span>
                    <span class="inv-item-amt">₹${Number(i.amount).toLocaleString("en-IN")}</span>
                </div>`,
                )
                .join("");
        }

        // Transaction history
        let txnHtml = "";
        if (inv.payments && inv.payments.length > 0) {
            txnHtml = inv.payments
                .map((p) => {
                    const ptype = (p.payment_type || "cash").toUpperCase();
                    const picon =
                        ptype === "UPI"
                            ? "phone_iphone"
                            : ptype === "CARD"
                                ? "credit_card"
                                : ptype === "BANK_TRANSFER"
                                    ? "account_balance"
                                    : "payments";
                    return `<div class="inv-txn-row">
                    <div class="inv-txn-icon"><span class="material-icons-round">${picon}</span></div>
                    <div class="inv-txn-info"><span class="inv-txn-type">${ptype}</span><span class="inv-txn-date">${p.payment_date || ""}${p.notes ? " • " + p.notes : ""}</span></div>
                    <span class="inv-txn-amount">₹${Number(p.amount).toLocaleString("en-IN")}</span>
                </div>`;
                })
                .join("");
        }

        // Actions
        const isAdmin =
            currentUserData.type === "admin" || currentUserData.type === "owner";

        document.getElementById("member-detail-content").innerHTML = `
            <div class="inv-paper">
                <!-- Header -->
                <div class="inv-header">
                    <div class="inv-brand">
                        <div class="inv-brand-icon"><span class="material-icons-round">fitness_center</span></div>
                        <div>
                            <div class="inv-brand-name">${gymName}</div>
                            <div class="inv-brand-contacts">
                                ${gymPhone ? `<span>📞 ${gymPhone}</span>` : ""}
                                ${gymEmail ? `<span>✉ ${gymEmail}</span>` : ""}
                            </div>
                            ${gymAddress ? `<div class="inv-brand-addr">${gymAddress}</div>` : ""}
                        </div>
                    </div>
                    <div class="inv-id-block">
                        <span class="member-badge ${isPaid ? "badge-active" : "badge-expired"}">${inv.status || "unpaid"}</span>
                        <div class="inv-id-label">INVOICE</div>
                        <div class="inv-id-num">#${inv.invoice_id}</div>
                    </div>
                </div>

                <!-- Bill To -->
                <div class="inv-bill-to">
                    <div class="inv-bill-label">Bill To</div>
                    <div class="inv-bill-name">${inv.member_name || "Member"}</div>
                    <div class="inv-bill-details">
                        ${inv.phone_number ? `<span class="material-icons-round" style="font-size:14px;vertical-align:middle">call</span> ${inv.phone_number}` : ""}
                        ${inv.email ? `<br><span class="material-icons-round" style="font-size:14px;vertical-align:middle">mail</span> ${inv.email}` : ""}
                        ${inv.city ? `<br><span class="material-icons-round" style="font-size:14px;vertical-align:middle">location_on</span> ${inv.city}` : ""}
                    </div>
                </div>

                <!-- Dates -->
                <div class="inv-dates">
                    <div class="inv-date-item"><span class="inv-date-label">Invoice Date</span><span class="inv-date-val">${inv.invoice_date || "-"}</span></div>
                    <div class="inv-date-item"><span class="inv-date-label">Due Date</span><span class="inv-date-val">${inv.invoice_due_date || "-"}</span></div>
                </div>

                <!-- Items Table -->
                <div class="inv-table">
                    <div class="inv-table-head">
                        <span class="inv-item-sr">#</span>
                        <span class="inv-item-title">Description</span>
                        <span class="inv-item-amt">Amount</span>
                    </div>
                    ${itemsHtml}
                    <div class="inv-divider"></div>
                    <div class="inv-total-row">
                        <span class="inv-item-sr"></span>
                        <span class="inv-total-label">Total</span>
                        <span class="inv-total-val">₹${total.toLocaleString("en-IN")}</span>
                    </div>
                    <div class="inv-paid-row">
                        <span class="inv-item-sr"></span>
                        <span class="inv-total-label">Paid</span>
                        <span class="inv-total-val" style="color:var(--green)">₹${paid.toLocaleString("en-IN")}</span>
                    </div>
                    ${due > 0
                ? `<div class="inv-due-row">
                        <span class="inv-item-sr"></span>
                        <span class="inv-total-label">Balance Due</span>
                        <span class="inv-total-val" style="color:var(--red)">₹${due.toLocaleString("en-IN")}</span>
                    </div>`
                : ""
            }
                </div>

                <!-- Transactions -->
                ${inv.payments && inv.payments.length > 0
                ? `
                <div class="inv-txn-section">
                    <div class="inv-txn-title">Payment History</div>
                    ${txnHtml}
                </div>`
                : ""
            }

                <!-- Actions -->
                <div class="inv-actions">
                    <button class="btn-secondary inv-action-btn" onclick="shareInvoiceWhatsApp(${inv.id})">
                        <span class="material-icons-round" style="font-size:18px;vertical-align:middle">share</span> Share
                    </button>
                    <button class="btn-secondary inv-action-btn" onclick="window.print()">
                        <span class="material-icons-round" style="font-size:18px;vertical-align:middle">picture_as_pdf</span> PDF
                    </button>
                    ${isAdmin
                ? `
                        <button class="btn-secondary inv-action-btn" onclick="viewMember(${inv.user_id})">
                            <span class="material-icons-round" style="font-size:18px;vertical-align:middle">person</span> Member
                        </button>
                        ${!isPaid
                    ? `<button class="btn-primary inv-action-btn" onclick="addPayment(${inv.id},${total},${paid})"><span class="material-icons-round" style="font-size:18px;vertical-align:middle">payments</span> Pay</button>`
                    : `<button class="btn-primary inv-action-btn" style="background:var(--green);opacity:0.8" disabled><span class="material-icons-round" style="font-size:18px;vertical-align:middle">check_circle</span> Paid</button>`
                }
                    `
                : ""
            }
                </div>
            </div>
        `;
        navigate("member-detail");
        document.getElementById("header-title").textContent = "Invoice";
    } catch (e) {
        showSnackbar("Error loading invoice");
    }
}

// Share invoice via WhatsApp
function shareInvoiceWhatsApp(invoiceId) {
    // Build text invoice from cached invoice data
    const content = document.getElementById("member-detail-content");
    if (!content) return;

    const gymName = gymInfoCache.name || "GymXBook";
    const gymPhone = gymInfoCache.phone || "";
    const gymEmail = gymInfoCache.email || "";
    const gymAddress = gymInfoCache.address || "";

    // Extract from the DOM
    const invIdEl = content.querySelector(".inv-id-num");
    const invStatusEl = content.querySelector(".member-badge");
    const billNameEl = content.querySelector(".inv-bill-name");
    const billDetailsEl = content.querySelector(".inv-bill-details");
    const dateVals = content.querySelectorAll(".inv-date-val");
    const invRows = content.querySelectorAll(".inv-row");
    const totalVal = content.querySelector(".inv-total-row .inv-total-val");
    const paidVal = content.querySelector(".inv-paid-row .inv-total-val");
    const dueVal = content.querySelector(".inv-due-row .inv-total-val");

    let text = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `🏋️ *${gymName.toUpperCase()}*\n`;
    if (gymPhone) text += `📞 ${gymPhone}\n`;
    if (gymEmail) text += `✉️ ${gymEmail}\n`;
    if (gymAddress) text += `📍 ${gymAddress}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    const invNum = invIdEl ? invIdEl.textContent.trim() : "";
    const status = invStatusEl ? invStatusEl.textContent.trim() : "";
    text += `📄 *INVOICE ${invNum}*\n`;
    text += `Status: *${status.toUpperCase()}*\n\n`;

    const memberName = billNameEl ? billNameEl.textContent.trim() : "";
    const memberDetails = billDetailsEl ? billDetailsEl.innerText.trim() : "";
    text += `👤 *${memberName}*\n`;
    if (memberDetails) text += `${memberDetails}\n`;
    text += `\n`;

    if (dateVals.length >= 2) {
        text += `📅 Date: ${dateVals[0].textContent.trim()}\n`;
        text += `📅 Due: ${dateVals[1].textContent.trim()}\n\n`;
    }

    text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📋 *ITEMS*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (invRows.length > 0) {
        invRows.forEach((row) => {
            const title = row.querySelector(".inv-item-title");
            const amt = row.querySelector(".inv-item-amt");
            if (title && amt) {
                const titleText = title.textContent.trim();
                const amtText = amt.textContent.trim();
                text += `• ${titleText}: ${amtText}\n`;
            }
        });
    }
    text += `━━━━━━━━━━━━━━━━━━━━━━\n`;

    const total = totalVal ? totalVal.textContent.trim() : "";
    const paidAmt = paidVal ? paidVal.textContent.trim() : "";
    text += `💰 *Total: ${total}*\n`;
    text += `✅ *Paid: ${paidAmt}*\n`;
    if (dueVal) {
        text += `🔴 *Balance Due: ${dueVal.textContent.trim()}*\n`;
    } else {
        text += `🟢 *Fully Paid*\n`;
    }

    text += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `Generated by GymXBook\n`;

    const phone = billDetailsEl ? billDetailsEl.querySelector("[onclick]") : null;
    // Get member phone from invoice data — we need the raw phone
    const memberPhoneEl = content.querySelector(".inv-bill-details");
    let memberPhone = "";
    if (memberPhoneEl) {
        const phoneMatch = memberPhoneEl.innerText.match(/[\d+\s-]{10,}/);
        if (phoneMatch)
            memberPhone = phoneMatch[0].replace(/[^0-9]/g, "").replace(/^0+/, "91");
    }

    const waUrl = memberPhone
        ? `https://wa.me/${memberPhone}?text=${encodeURIComponent(text)}`
        : `https://wa.me/?text=${encodeURIComponent(text)}`;

    window.open(waUrl, "_blank");
}

async function addPayment(invoiceId, invoiceTotal, invoicePaid) {
    const due = Math.max(0, (invoiceTotal || 0) - (invoicePaid || 0));
    if (due <= 0) {
        showSnackbar("Invoice is already fully paid");
        return;
    }
    const h = `<form onsubmit="submitPayment(event,${invoiceId},${due})">
        <div style="background:var(--primary-light);padding:10px 14px;border-radius:8px;margin-bottom:12px;font-size:13px;color:var(--primary);font-weight:600">Due Amount: ₹${due.toLocaleString("en-IN")}</div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">Amount (₹) *</label><input type="number" step="0.01" class="form-input" name="amount" max="${due}" min="0.01" required oninput="if(Number(this.value)>${due})this.value=${due};if(Number(this.value)<0)this.value=0;"></div>
            <div class="form-group"><label class="form-label">Payment Type</label><select class="form-input" name="payment_type"><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank_transfer">Bank Transfer</option></select></div>
        </div>
        <div class="form-group"><label class="form-label">Payment Date</label><input type="date" class="form-input" name="payment_date" value="${getLocalDate()}"></div>
        <div class="form-group"><label class="form-label">Notes</label><input type="text" class="form-input" name="notes" placeholder="Transaction ID etc."></div>
        <div class="form-actions"><button type="button" class="btn-secondary" onclick="closeSheet()">Cancel</button><button type="submit" class="btn-primary" id="pay-submit-btn">Record Payment</button></div>
    </form>`;
    document.getElementById("sheet-title").textContent = "Record Payment";
    document.getElementById("sheet-content").innerHTML = h;
    openSheet();
}
async function submitPayment(e, invoiceId, maxDue) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn && btn.disabled) return; // Prevent double-click
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Processing...";
    }
    const d = Object.fromEntries(new FormData(e.target));
    d.invoice_id = invoiceId;
    /* Clamp amount client-side */
    if (maxDue && Number(d.amount) > maxDue) d.amount = maxDue;
    try {
        const res = await fetch(`${API}?action=invoice_payment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(d),
        });
        const result = await res.json();
        if (result.success) {
            showSnackbar("Payment recorded!");
            closeSheet();
            loadInvoices();
            refreshDashboardIfVisible();
            viewInvoice(invoiceId);
        } else {
            showSnackbar(result.error || "Error");
            if (btn) {
                btn.disabled = false;
                btn.textContent = "Record Payment";
            }
        }
    } catch (e) {
        showSnackbar("Error");
        if (btn) {
            btn.disabled = false;
            btn.textContent = "Record Payment";
        }
    }
}

// ==================== LOCKERS ====================
async function loadLockers() {
    const g = document.getElementById("lockers-grid");
    g.innerHTML = skeletonLockers();
    try {
        const r = await fetch(`${API}?action=lockers`);
        const d = await r.json();
        g.innerHTML =
            d.lockers && d.lockers.length > 0
                ? d.lockers
                    .map(
                        (l) =>
                            `<div class="locker-item ${l.available ? "locker-available" : "locker-occupied"}" onclick="${l.available ? `assignLocker(${l.id})` : `releaseLocker(${l.id})`}"><span class="material-icons-round">${l.available ? "lock_open" : "lock"}</span><span class="locker-number">#${l.id}</span><span style="font-size:9px;color:${l.available ? "var(--green)" : "var(--red)"}">${l.available ? "Free" : l.assigned_user || "Taken"}</span></div>`,
                    )
                    .join("")
                : renderEmptyState(
                    "lockers",
                    "No Lockers",
                    "Add lockers to assign to members",
                    "Add Lockers",
                    "showAddLockersSheet()",
                );
    } catch (e) { }
}
function showAddLockersSheet() {
    const h = `<form onsubmit="submitLockers(event)"><div class="form-group"><label class="form-label">Number of Lockers</label><input type="number" class="form-input" name="count" value="10" min="1" max="100" required></div><div class="form-actions"><button type="button" class="btn-secondary" onclick="closeSheet()">Cancel</button><button type="submit" class="btn-primary">Add Lockers</button></div></form>`;
    document.getElementById("sheet-title").textContent = "Add Lockers";
    document.getElementById("sheet-content").innerHTML = h;
    openSheet();
}
async function submitLockers(e) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try {
        if (
            (
                await (
                    await fetch(`${API}?action=lockers`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(d),
                    })
                ).json()
            ).success
        ) {
            showSnackbar("Lockers added!");
            closeSheet();
            loadLockers();
        }
    } catch (e) { }
}
async function assignLocker(lid) {
    let mo = "";
    try {
        const r = await fetch(`${API}?action=members`);
        const d = await r.json();
        mo = (d.members || [])
            .map((m) => `<option value="${m.id}">${m.name}</option>`)
            .join("");
    } catch (e) { }
    const h = `<form onsubmit="submitAssignLocker(event,${lid})"><div class="form-group"><label class="form-label">Assign to Member *</label><select class="form-input" name="user_id" required><option value="">Select Member</option>${mo}</select></div><div class="form-group"><label class="form-label">End Date (Optional)</label><input type="date" class="form-input" name="end_date"></div><div class="form-actions"><button type="button" class="btn-secondary" onclick="closeSheet()">Cancel</button><button type="submit" class="btn-primary">Assign Locker</button></div></form>`;
    document.getElementById("sheet-title").textContent = `Assign Locker #${lid}`;
    document.getElementById("sheet-content").innerHTML = h;
    openSheet();
}
async function submitAssignLocker(e, lid) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    d.locker_id = lid;
    d.assign_date = getLocalDate();
    try {
        if (
            (
                await (
                    await fetch(`${API}?action=assign_locker`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(d),
                    })
                ).json()
            ).success
        ) {
            showSnackbar("Locker assigned!");
            closeSheet();
            loadLockers();
        }
    } catch (e) { }
}
function releaseLocker(lid) {
    showConfirm("Release Locker", "Release this locker?", async () => {
        try {
            const res = await fetch(`${API}?action=assign_locker`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ locker_id: lid }),
            });
            const data = await res.json();
            if (data.success) {
                showSnackbar("Locker released!");
                loadLockers();
            } else {
                showSnackbar(data.error || "Failed to release locker");
            }
        } catch (e) {
            showSnackbar("Connection error");
        }
    });
}

// ==================== EVENTS ====================
async function loadEvents() {
    const l = document.getElementById("events-list");
    l.innerHTML = skeletonEvents(2);
    try {
        const r = await fetch(`${API}?action=events`);
        const d = await r.json();
        l.innerHTML =
            d.events && d.events.length > 0
                ? d.events
                    .map((e) => {
                        const sm = {
                            1: ["Scheduled", "event-scheduled"],
                            2: ["Ongoing", "event-ongoing"],
                            3: ["Completed", "event-completed"],
                            4: ["Cancelled", "event-cancelled"],
                        };
                        const [st, sc] = sm[e.status] || ["Unknown", "event-scheduled"];
                        return `<div class="event-card"><div class="event-card-accent"></div><div class="event-card-body"><div class="event-title">${e.title}</div><div class="event-date-row"><span class="material-icons-round">calendar_today</span> ${e.start_date} → ${e.end_date}</div>${e.type_name ? `<div class="event-date-row"><span class="material-icons-round">category</span> ${e.type_name}</div>` : ""}${e.description ? `<div class="event-desc">${e.description}</div>` : ""}<span class="event-status ${sc}">${st}</span><button class="btn-text" style="color:var(--red);margin-left:8px" onclick="deleteEvent(${e.id})">Delete</button></div></div>`;
                    })
                    .join("")
                : renderEmptyState(
                    "events",
                    "No Events",
                    "Create events to keep your members engaged",
                    "Add Event",
                    "showAddEventSheet()",
                );
    } catch (e) { }
}
function showAddEventSheet() {
    const h = `<form onsubmit="submitEvent(event)"><div class="form-group"><label class="form-label">Event Title *</label><input type="text" class="form-input" name="title" required placeholder="Event name"></div><div class="form-row"><div class="form-group"><label class="form-label">Start Date *</label><input type="date" class="form-input" name="start_date" required></div><div class="form-group"><label class="form-label">End Date *</label><input type="date" class="form-input" name="end_date" required></div></div><div class="form-group"><label class="form-label">Description</label><textarea class="form-input" name="description" rows="2" placeholder="Event details"></textarea></div><div class="form-actions"><button type="button" class="btn-secondary" onclick="closeSheet()">Cancel</button><button type="submit" class="btn-primary">Create Event</button></div></form>`;
    document.getElementById("sheet-title").textContent = "New Event";
    document.getElementById("sheet-content").innerHTML = h;
    openSheet();
}
async function submitEvent(e) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try {
        if (
            (
                await (
                    await fetch(`${API}?action=events`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(d),
                    })
                ).json()
            ).success
        ) {
            showSnackbar("Event created!");
            closeSheet();
            loadEvents();
        }
    } catch (e) {
        showSnackbar("Error");
    }
}
function deleteEvent(id) {
    showConfirm("Delete Event", "Delete this event?", async () => {
        try {
            const res = await fetch(`${API}?action=event&id=${id}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showSnackbar("Deleted");
                loadEvents();
            } else {
                showSnackbar(data.error || "Error deleting");
            }
        } catch (e) {
            showSnackbar("Connection error");
        }
    });
}

// ==================== PRODUCTS ====================
async function loadProducts() {
    const l = document.getElementById("products-list");
    l.innerHTML = skeletonProducts(3);
    try {
        const r = await fetch(`${API}?action=products`);
        const d = await r.json();
        l.innerHTML =
            d.products && d.products.length > 0
                ? d.products
                    .map(
                        (p) =>
                            `<div class="product-card"><div class="product-icon"><span class="material-icons-round" style="font-size:20px">storefront</span></div><div class="product-info"><span class="product-name">${p.title}</span><span class="product-price">₹${Number(p.price).toLocaleString("en-IN")}${p.discount ? ` <s style="color:var(--text3);font-size:12px">₹${Math.round((p.price * 100) / (100 - p.discount))}</s>` : ""}</span></div><button class="icon-btn" onclick="deleteProduct(${p.id})"><span class="material-icons-round" style="color:var(--red);font-size:20px">delete</span></button></div>`,
                    )
                    .join("")
                : renderEmptyState(
                    "products",
                    "No Products",
                    "Add products to sell to your members",
                    "Add Product",
                    "showAddProductSheet()",
                );
    } catch (e) { }
}
function showAddProductSheet() {
    const h = `<form onsubmit="submitProduct(event)"><div class="form-group"><label class="form-label">Product Name *</label><input type="text" class="form-input" name="title" required placeholder="e.g., Whey Protein"></div><div class="form-row"><div class="form-group"><label class="form-label">Price (₹) *</label><input type="number" step="0.01" class="form-input" name="price" required></div><div class="form-group"><label class="form-label">Discount %</label><input type="number" step="0.01" class="form-input" name="discount" placeholder="0"></div></div><div class="form-group"><label class="form-label">Description</label><textarea class="form-input" name="description" rows="2"></textarea></div><div class="form-actions"><button type="button" class="btn-secondary" onclick="closeSheet()">Cancel</button><button type="submit" class="btn-primary">Add Product</button></div></form>`;
    document.getElementById("sheet-title").textContent = "Add Product";
    document.getElementById("sheet-content").innerHTML = h;
    openSheet();
}
async function submitProduct(e) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try {
        if (
            (
                await (
                    await fetch(`${API}?action=products`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(d),
                    })
                ).json()
            ).success
        ) {
            showSnackbar("Product added!");
            closeSheet();
            loadProducts();
        }
    } catch (e) {
        showSnackbar("Error");
    }
}
function deleteProduct(id) {
    showConfirm("Delete Product", "Delete this product?", async () => {
        try {
            const res = await fetch(`${API}?action=product&id=${id}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showSnackbar("Deleted");
                loadProducts();
            } else {
                showSnackbar(data.error || "Error deleting");
            }
        } catch (e) {
            showSnackbar("Connection error");
        }
    });
}

// ==================== NOTICES ====================
async function loadNotices() {
    const l = document.getElementById("notices-list");
    l.innerHTML = skeletonNotices(2);
    try {
        const r = await fetch(`${API}?action=notices`);
        const d = await r.json();
        l.innerHTML =
            d.notices && d.notices.length > 0
                ? d.notices
                    .map(
                        (n) =>
                            `<div class="notice-card"><div class="notice-title">${n.title}</div><div class="notice-desc">${n.description || ""}</div><div class="notice-date">${n.created_at || ""}</div></div>`,
                    )
                    .join("")
                : renderEmptyState(
                    "notices",
                    "No Notices",
                    "Post notices to keep members informed",
                    "Add Notice",
                    "showAddNoticeSheet()",
                );
    } catch (e) { }
}
function showAddNoticeSheet() {
    const h = `<form onsubmit="submitNotice(event)"><div class="form-group"><label class="form-label">Title *</label><input type="text" class="form-input" name="title" required placeholder="Notice title"></div><div class="form-group"><label class="form-label">Description</label><textarea class="form-input" name="description" rows="3" placeholder="Notice content"></textarea></div><div class="form-actions"><button type="button" class="btn-secondary" onclick="closeSheet()">Cancel</button><button type="submit" class="btn-primary">Post Notice</button></div></form>`;
    document.getElementById("sheet-title").textContent = "New Notice";
    document.getElementById("sheet-content").innerHTML = h;
    openSheet();
}
async function submitNotice(e) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try {
        if (
            (
                await (
                    await fetch(`${API}?action=notices`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(d),
                    })
                ).json()
            ).success
        ) {
            showSnackbar("Notice posted!");
            closeSheet();
            loadNotices();
        }
    } catch (e) {
        showSnackbar("Error");
    }
}

// ==================== SETTINGS ====================
async function loadSettings() {
    try {
        const { ok, data } = await apiFetch(`${API}?action=me`);
        if (ok && data.user) {
            const isAdmin = data.user.type === "admin" || data.user.type === "owner";

            const nameInput = document.getElementById("setting-user-name");
            const emailInput = document.getElementById("setting-user-email");

            nameInput.value = data.user.name || "";
            emailInput.value = data.user.email || "";
            document.getElementById("setting-user-phone").value =
                data.user.phone_number || "";

            // Members can't edit name and email
            if (!isAdmin) {
                nameInput.readOnly = true;
                nameInput.style.opacity = "0.7";
                emailInput.readOnly = true;
                emailInput.style.opacity = "0.7";
            } else {
                nameInput.readOnly = false;
                nameInput.style.opacity = "1";
                emailInput.readOnly = false;
                emailInput.style.opacity = "1";
            }

            if (data.gym_info) {
                if (isAdmin) {
                    document.getElementById("setting-gym-name").value =
                        data.gym_info.name || "";
                    document.getElementById("setting-gym-phone").value =
                        data.gym_info.phone || "";
                    document.getElementById("setting-gym-email").value =
                        data.gym_info.email || "";
                    document.getElementById("setting-gym-address").value =
                        data.gym_info.address || "";
                }
                updateGymInfo(data.gym_info);
            }
        }
    } catch (e) { }
}

async function saveProfile() {
    const data = {
        name: document.getElementById("setting-user-name").value.trim(),
        phone_number: document.getElementById("setting-user-phone").value.trim(),
        email: document.getElementById("setting-user-email").value.trim(),
    };
    if (!data.name || !data.email) {
        showSnackbar("Name and Email are required");
        return;
    }
    try {
        const { ok, data: result } = await apiFetch(
            `${API}?action=update_profile`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            },
        );
        if (ok && result.success) {
            showSnackbar("Profile updated!");
            document.getElementById("drawer-name").textContent = data.name;
            document.getElementById("drawer-email").textContent = data.email;
        } else {
            showSnackbar(result.error || "Error updating profile");
        }
    } catch (e) {
        showSnackbar("Connection error");
    }
}

async function saveGymSettings() {
    const data = {
        company_name: document.getElementById("setting-gym-name").value.trim(),
        company_phone: document.getElementById("setting-gym-phone").value.trim(),
        company_email: document.getElementById("setting-gym-email").value.trim(),
        company_address: document
            .getElementById("setting-gym-address")
            .value.trim(),
    };
    try {
        const { ok, data: result } = await apiFetch(`${API}?action=settings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        if (ok && result.success) {
            showSnackbar("Gym settings saved!");
            // Refresh gym info in cache
            apiFetch(`${API}?action=me`).then(({ ok: ok2, data: d2 }) => {
                if (ok2 && d2.gym_info) updateGymInfo(d2.gym_info);
            });
        } else {
            showSnackbar(result.error || "Error saving settings");
        }
    } catch (e) {
        showSnackbar("Connection error");
    }
}

// ==================== CHANGE PASSWORD ====================
function showChangePasswordSheet() {
    const html = `<form onsubmit="submitChangePassword(event)">
        <div class="form-group"><label class="form-label">Current Password *</label><input type="password" class="form-input" name="current_password" required placeholder="Enter current password"></div>
        <div class="form-group"><label class="form-label">New Password *</label><input type="password" class="form-input" name="new_password" required placeholder="At least 6 characters" minlength="6"></div>
        <div class="form-group"><label class="form-label">Confirm New Password *</label><input type="password" class="form-input" name="confirm_password" required placeholder="Re-enter new password" minlength="6"></div>
        <div class="form-actions"><button type="button" class="btn-secondary" onclick="closeSheet()">Cancel</button><button type="submit" class="btn-primary">Change Password</button></div>
    </form>`;
    document.getElementById("sheet-title").textContent = "Change Password";
    document.getElementById("sheet-content").innerHTML = html;
    openSheet();
}

async function submitChangePassword(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    if (data.new_password !== data.confirm_password) {
        showSnackbar("Passwords do not match");
        return;
    }
    if (data.new_password.length < 6) {
        showSnackbar("Password must be at least 6 characters");
        return;
    }
    try {
        const { ok, data: result } = await apiFetch(
            `${API}?action=change_password`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    current_password: data.current_password,
                    new_password: data.new_password,
                }),
            },
        );
        if (ok && result.success) {
            showSnackbar("Password changed successfully!");
            closeSheet();
        } else {
            showSnackbar(result.error || "Error changing password");
        }
    } catch (err) {
        showSnackbar("Connection error");
    }
}

// ==================== BOTTOM SHEET ====================
function openSheet() {
    document.getElementById("bottom-sheet").classList.add("open");
    document.getElementById("bottom-sheet-overlay").classList.add("open");
}
function closeSheet() {
    document.getElementById("bottom-sheet").classList.remove("open");
    document.getElementById("bottom-sheet-overlay").classList.remove("open");
}

// ==================== SNACKBAR ====================
function showSnackbar(msg, duration = 3000) {
    const el = document.getElementById("snackbar");
    document.getElementById("snackbar-text").textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), duration);
}
function hideSnackbar() {
    document.getElementById("snackbar").classList.remove("show");
}

// ==================== CONFIRM DIALOG ====================
let confirmCallback = null;
function showConfirm(title, message, callback) {
    document.getElementById("confirm-title").textContent = title;
    document.getElementById("confirm-message").textContent = message;
    confirmCallback = callback;
    document.getElementById("confirm-btn").onclick = () => {
        const cb = confirmCallback;
        closeConfirm();
        if (cb) cb();
    };
    document.getElementById("confirm-overlay").style.display = "flex";
}
function closeConfirm() {
    document.getElementById("confirm-overlay").style.display = "none";
    confirmCallback = null;
}

// ==================== NOTIFICATIONS ====================
function showNotifications() {
    showSnackbar("No new notifications");
}

// ==================== FORM VALIDATION ====================
function validatePhone(phone) {
    if (!phone) return true; // Phone is optional unless required
    const digits = phone.replace(/\D/g, "");
    return digits.length >= 10;
}

function validateEmail(email) {
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateRequired(value, fieldName) {
    if (!value || !value.toString().trim()) {
        showSnackbar(`${fieldName} is required`);
        return false;
    }
    return true;
}

function validateAmount(amount, fieldName) {
    if (!amount || isNaN(amount) || Number(amount) <= 0) {
        showSnackbar(`${fieldName} must be greater than 0`);
        return false;
    }
    return true;
}

// ==================== EMPTY STATE ILLUSTRATIONS ====================
function emptyStateSVG(type) {
    const svgs = {
        members: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:120px;margin:0 auto 8px;display:block">
            <circle cx="60" cy="42" r="18" stroke="var(--primary)" stroke-width="2.5" fill="var(--primary-bg)"/>
            <path d="M30 95c0-16.57 13.43-30 30-30s30 13.43 30 30" stroke="var(--primary)" stroke-width="2.5" fill="var(--primary-bg)" stroke-linecap="round"/>
            <circle cx="90" cy="38" r="12" stroke="var(--primary)" stroke-width="2" fill="var(--primary-bg)" opacity="0.5"/>
            <path d="M70 85c0-11.05 8.95-20 20-20s20 8.95 20 20" stroke="var(--primary)" stroke-width="2" fill="var(--primary-bg)" opacity="0.5" stroke-linecap="round"/>
            <circle cx="85" cy="30" r="3" fill="var(--primary)" opacity="0.3"/>
            <circle cx="105" cy="25" r="2" fill="var(--primary)" opacity="0.2"/>
        </svg>`,
        trainers: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:120px;margin:0 auto 8px;display:block">
            <circle cx="60" cy="40" r="18" stroke="var(--green)" stroke-width="2.5" fill="var(--green-bg)"/>
            <path d="M30 95c0-16.57 13.43-30 30-30s30 13.43 30 30" stroke="var(--green)" stroke-width="2.5" fill="var(--green-bg)" stroke-linecap="round"/>
            <rect x="48" y="56" width="24" height="6" rx="3" fill="var(--green)" opacity="0.3"/>
            <path d="M55 62l5 8 5-8" stroke="var(--green)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        attendance: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:120px;margin:0 auto 8px;display:block">
            <rect x="25" y="15" width="70" height="90" rx="8" stroke="var(--blue)" stroke-width="2.5" fill="var(--blue-bg)"/>
            <rect x="25" y="15" width="70" height="22" rx="8" fill="var(--blue)" opacity="0.15"/>
            <line x1="40" y1="50" x2="80" y2="50" stroke="var(--blue)" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
            <line x1="40" y1="62" x2="70" y2="62" stroke="var(--blue)" stroke-width="2" stroke-linecap="round" opacity="0.2"/>
            <circle cx="45" cy="80" r="6" fill="var(--green)" opacity="0.4"/>
            <path d="M42 80l2 2 4-4" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="45" cy="93" r="6" stroke="var(--blue)" stroke-width="1.5" opacity="0.3"/>
        </svg>`,
        plans: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:120px;margin:0 auto 8px;display:block">
            <rect x="20" y="25" width="80" height="70" rx="8" stroke="var(--purple)" stroke-width="2.5" fill="var(--purple-bg)"/>
            <rect x="20" y="25" width="80" height="22" rx="8" fill="var(--purple)" opacity="0.15"/>
            <circle cx="60" cy="36" r="4" fill="var(--purple)" opacity="0.4"/>
            <line x1="35" y1="60" x2="85" y2="60" stroke="var(--purple)" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
            <line x1="35" y1="72" x2="75" y2="72" stroke="var(--purple)" stroke-width="2" stroke-linecap="round" opacity="0.2"/>
            <line x1="35" y1="84" x2="65" y2="84" stroke="var(--purple)" stroke-width="2" stroke-linecap="round" opacity="0.15"/>
        </svg>`,
        revenue: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:120px;margin:0 auto 8px;display:block">
            <circle cx="60" cy="60" r="40" stroke="var(--green)" stroke-width="2.5" fill="var(--green-bg)"/>
            <text x="60" y="68" text-anchor="middle" fill="var(--green)" font-size="28" font-weight="700" font-family="Inter">₹</text>
            <path d="M60 20v8M60 92v8M20 60h8M92 60h8" stroke="var(--green)" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
        </svg>`,
        invoice: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:120px;margin:0 auto 8px;display:block">
            <rect x="25" y="12" width="70" height="96" rx="8" stroke="var(--orange)" stroke-width="2.5" fill="var(--orange-bg)"/>
            <line x1="40" y1="40" x2="80" y2="40" stroke="var(--orange)" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
            <line x1="40" y1="52" x2="70" y2="52" stroke="var(--orange)" stroke-width="2" stroke-linecap="round" opacity="0.2"/>
            <line x1="40" y1="64" x2="75" y2="64" stroke="var(--orange)" stroke-width="2" stroke-linecap="round" opacity="0.2"/>
            <rect x="40" y="76" width="40" height="14" rx="4" fill="var(--orange)" opacity="0.2"/>
            <text x="60" y="87" text-anchor="middle" fill="var(--orange)" font-size="9" font-weight="600" font-family="Inter">PAID</text>
        </svg>`,
        classes: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:120px;margin:0 auto 8px;display:block">
            <circle cx="60" cy="45" r="20" stroke="var(--teal)" stroke-width="2.5" fill="var(--teal-bg)"/>
            <path d="M60 30v15l10 8" stroke="var(--teal)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            <rect x="25" y="80" width="70" height="25" rx="6" stroke="var(--teal)" stroke-width="2" fill="var(--teal-bg)" opacity="0.5"/>
            <line x1="35" y1="90" x2="85" y2="90" stroke="var(--teal)" stroke-width="1.5" stroke-linecap="round" opacity="0.3"/>
            <line x1="35" y1="98" x2="70" y2="98" stroke="var(--teal)" stroke-width="1.5" stroke-linecap="round" opacity="0.2"/>
        </svg>`,
        events: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:120px;margin:0 auto 8px;display:block">
            <rect x="20" y="20" width="80" height="80" rx="8" stroke="var(--primary)" stroke-width="2.5" fill="var(--primary-bg)"/>
            <rect x="20" y="20" width="80" height="22" rx="8" fill="var(--primary)" opacity="0.15"/>
            <line x1="40" y1="12" x2="40" y2="28" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round"/>
            <line x1="80" y1="12" x2="80" y2="28" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round"/>
            <circle cx="45" cy="60" r="3" fill="var(--primary)" opacity="0.4"/>
            <circle cx="60" cy="60" r="3" fill="var(--primary)" opacity="0.4"/>
            <circle cx="75" cy="60" r="3" fill="var(--primary)" opacity="0.4"/>
            <circle cx="45" cy="78" r="3" fill="var(--primary)" opacity="0.3"/>
            <circle cx="60" cy="78" r="3" fill="var(--primary)" opacity="0.3"/>
        </svg>`,
        lockers: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:120px;margin:0 auto 8px;display:block">
            <rect x="30" y="20" width="25" height="40" rx="4" stroke="var(--orange)" stroke-width="2" fill="var(--orange-bg)"/>
            <rect x="65" y="20" width="25" height="40" rx="4" stroke="var(--green)" stroke-width="2" fill="var(--green-bg)"/>
            <rect x="30" y="70" width="25" height="40" rx="4" stroke="var(--green)" stroke-width="2" fill="var(--green-bg)"/>
            <rect x="65" y="70" width="25" height="40" rx="4" stroke="var(--orange)" stroke-width="2" fill="var(--orange-bg)"/>
            <circle cx="48" cy="40" r="2.5" fill="var(--orange)" opacity="0.5"/>
            <circle cx="83" cy="40" r="2.5" fill="var(--green)" opacity="0.5"/>
            <circle cx="48" cy="90" r="2.5" fill="var(--green)" opacity="0.5"/>
            <circle cx="83" cy="90" r="2.5" fill="var(--orange)" opacity="0.5"/>
        </svg>`,
        products: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:120px;margin:0 auto 8px;display:block">
            <rect x="25" y="30" width="70" height="70" rx="8" stroke="var(--purple)" stroke-width="2.5" fill="var(--purple-bg)"/>
            <path d="M25 50h70" stroke="var(--purple)" stroke-width="2" opacity="0.3"/>
            <rect x="35" y="18" width="50" height="20" rx="4" stroke="var(--purple)" stroke-width="2" fill="var(--purple-bg)"/>
            <line x1="50" y1="65" x2="70" y2="65" stroke="var(--purple)" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
            <line x1="55" y1="75" x2="65" y2="75" stroke="var(--purple)" stroke-width="2" stroke-linecap="round" opacity="0.2"/>
        </svg>`,
        notices: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:120px;margin:0 auto 8px;display:block">
            <rect x="25" y="20" width="70" height="80" rx="8" stroke="var(--blue)" stroke-width="2.5" fill="var(--blue-bg)"/>
            <path d="M25 20h70v15H25z" fill="var(--blue)" opacity="0.15" rx="8"/>
            <line x1="40" y1="50" x2="80" y2="50" stroke="var(--blue)" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
            <line x1="40" y1="62" x2="75" y2="62" stroke="var(--blue)" stroke-width="2" stroke-linecap="round" opacity="0.2"/>
            <line x1="40" y1="74" x2="70" y2="74" stroke="var(--blue)" stroke-width="2" stroke-linecap="round" opacity="0.15"/>
            <path d="M90 25l-8 15h16z" fill="var(--orange)" opacity="0.4"/>
        </svg>`,
        search: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:120px;margin:0 auto 8px;display:block">
            <circle cx="52" cy="52" r="25" stroke="var(--text3)" stroke-width="2.5" fill="var(--surface2)"/>
            <line x1="70" y1="70" x2="95" y2="95" stroke="var(--text3)" stroke-width="3" stroke-linecap="round"/>
            <line x1="42" y1="48" x2="62" y2="48" stroke="var(--text3)" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
            <line x1="42" y1="56" x2="55" y2="56" stroke="var(--text3)" stroke-width="2" stroke-linecap="round" opacity="0.2"/>
        </svg>`,
        generic: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:120px;margin:0 auto 8px;display:block">
            <rect x="25" y="25" width="70" height="70" rx="12" stroke="var(--text3)" stroke-width="2.5" fill="var(--surface2)"/>
            <line x1="40" y1="50" x2="80" y2="50" stroke="var(--text3)" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
            <line x1="40" y1="62" x2="70" y2="62" stroke="var(--text3)" stroke-width="2" stroke-linecap="round" opacity="0.2"/>
            <line x1="40" y1="74" x2="60" y2="74" stroke="var(--text3)" stroke-width="2" stroke-linecap="round" opacity="0.15"/>
        </svg>`,
    };
    return svgs[type] || svgs.generic;
}

function renderEmptyState(type, title, subtitle, actionText, actionFn) {
    const action = actionText
        ? `<button class="empty-action-btn" onclick="${actionFn}">${actionText}</button>`
        : "";
    return `<div class="empty-state-illust">
        ${emptyStateSVG(type)}
        <h3 class="empty-state-title">${title}</h3>
        <p class="empty-state-subtitle">${subtitle}</p>
        ${action}
    </div>`;
}

// Onboarding tour removed — users prefer direct access

// ==================== MEMBER FACING FUNCTIONS ====================

async function loadMemberDashboard() {
    const container = document.getElementById("member-dashboard-content");
    container.innerHTML = skeletonDashboard();

    try {
        const { ok, data } = await apiFetch("api.php?action=me");
        if (!ok || !data.user || data.user.type !== "trainee") return;

        const m = data.user.trainee_details;
        const expiry = m.membership_expiry_date;
        const isExp = expiry && new Date(expiry) < new Date();
        const daysLeft = expiry
            ? Math.ceil((new Date(expiry) - new Date()) / 86400000)
            : 0;
        const isFrozen = m.status == 3;

        let statusText = isExp ? "Expired" : "Active";
        if (isFrozen) statusText = "Frozen";
        if (data.user.is_active == 0) statusText = "Inactive";

        let html = `
            <div class="member-hero">
                <div class="member-hero-greeting">Hi, ${data.user.name.split(" ")[0]}! 👋</div>
                <div class="member-hero-sub">Welcome back to ${data.gym_info.name || "your gym"}</div>
            </div>

            <div class="member-status-card ${isExp ? "expired" : daysLeft <= 7 ? "warning" : ""} ${isFrozen ? "frozen" : ""}" style="border-left:none">
                <div class="status-top">
                    <div class="status-plan">${m.plan_name || "No Active Plan"}</div>
                    <div class="status-badge">${statusText}</div>
                </div>
                <div class="status-expiry">
                    <span class="material-icons-round">calendar_today</span>
                    <span>${isExp ? "Expired on" : "Expires on"} ${expiry || "N/A"}</span>
                    ${!isExp && daysLeft > 0 ? `<span style="margin-left:auto;font-weight:700;color:var(--primary)">${daysLeft} Days Left</span>` : ""}
                </div>
                ${!isExp && daysLeft <= 7 && daysLeft > 0 ? `<div class="status-reminder">⏰ Your plan expires soon. Don't forget to renew!</div>` : ""}
                ${isExp ? `<div class="status-reminder">❌ Your membership has expired. Please contact the gym to renew.</div>` : ""}
            </div>

            <div class="section-header"><h2>Quick Actions</h2></div>
            <div class="quick-actions">
                <button class="quick-action-btn" onclick="navigate('member-attendance')"><span class="material-icons-round">fact_check</span><span>Attendance</span></button>
                <button class="quick-action-btn" onclick="navigate('member-invoices')"><span class="material-icons-round">receipt_long</span><span>Payments</span></button>
                <button class="quick-action-btn" onclick="navigate('member-classes')"><span class="material-icons-round">self_improvement</span><span>Classes</span></button>
                <button class="quick-action-btn" onclick="navigate('notices')"><span class="material-icons-round">campaign</span><span>Notices</span></button>
            </div>

            <div class="section-header"><h2>Gym Information</h2></div>
            <div class="gym-info-card">
                <div class="gym-info-item"><span class="material-icons-round">fitness_center</span><span>${data.gym_info.name}</span></div>
                ${data.gym_info.phone ? `<div class="gym-info-item"><span class="material-icons-round">call</span><span>${data.gym_info.phone}</span></div>` : ""}
                ${data.gym_info.address ? `<div class="gym-info-item"><span class="material-icons-round">location_on</span><span>${data.gym_info.address}</span></div>` : ""}
            </div>
        `;

        container.innerHTML = html;
    } catch (e) {
        console.error(e);
    }
}

async function loadMemberAttendance() {
    const container = document.getElementById("member-attendance-content");
    container.innerHTML = skeletonAttendance();

    try {
        const { ok, data } = await apiFetch(
            "api.php?action=member&id=" + currentUserData.id,
        );
        if (!ok || !data.member) return;

        const att = data.member.attendance_history || [];

        let html = `
            <div class="att-summary-row">
                <div class="att-summary-card">
                    <div class="att-summary-val">${att.length}</div>
                    <div class="att-summary-label">Total Visits</div>
                </div>
                <div class="att-summary-card">
                    <div class="att-summary-val">${att.filter((a) => new Date(a.date).getMonth() === new Date().getMonth()).length}</div>
                    <div class="att-summary-label">This Month</div>
                </div>
            </div>
            <div class="section-header"><h2>Recent Attendance</h2></div>
            <div class="att-history-list">
                ${att.length > 0
                ? att
                    .map(
                        (a) => `
                    <div class="att-history-item">
                        <div class="att-history-date">${new Date(a.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
                        <div class="att-history-time">${a.checked_in_time ? a.checked_in_time.substring(0, 5) : "-"} ${a.checked_out_time ? " - " + a.checked_out_time.substring(0, 5) : ""}</div>
                    </div>
                `,
                    )
                    .join("")
                : '<div class="empty-state">No attendance records found</div>'
            }
            </div>
        `;
        container.innerHTML = html;
    } catch (e) {
        console.error(e);
    }
}

async function loadMemberInvoices() {
    const container = document.getElementById("member-invoices-content");
    container.innerHTML = skeletonInvoices(3);

    try {
        const { ok, data } = await apiFetch(
            "api.php?action=member_transactions&user_id=" + currentUserData.id,
        );
        if (!ok) return;

        const invs = data.invoices || [];

        let html = `
            <div class="section-header"><h2>Payment History</h2></div>
            <div class="invoice-list">
                ${invs.length > 0
                ? invs
                    .map((i) => {
                        const statusClass =
                            i.status === "paid"
                                ? "badge-active"
                                : i.status === "partial"
                                    ? "badge-expired"
                                    : "badge-inactive";
                        return `
                        <div class="invoice-card" onclick="viewInvoice(${i.id})">
                            <div class="invoice-id">#${i.invoice_id}</div>
                            <div class="invoice-info">
                                <span class="invoice-name">${i.notes || "Membership"}</span>
                                <span class="invoice-date">${i.invoice_date} • ₹${Number(i.total_amount).toLocaleString("en-IN")}</span>
                            </div>
                            <span class="member-badge ${statusClass}">${i.status}</span>
                        </div>
                    `;
                    })
                    .join("")
                : '<div class="empty-state">No payment records found</div>'
            }
            </div>
        `;
        container.innerHTML = html;
    } catch (e) {
        console.error(e);
    }
}

async function loadMemberClasses() {
    const container = document.getElementById("member-classes-content");
    container.innerHTML = skeletonClasses(2);

    try {
        const { ok, data } = await apiFetch("api.php?action=classes");
        if (!ok) return;

        const classes = data.classes || [];

        let html = `
            <div class="section-header"><h2>Available Classes</h2></div>
            <div class="class-list">
                ${classes.length > 0
                ? classes
                    .map(
                        (c) => `
                    <div class="class-card" onclick="viewClass(${c.id})">
                        <div class="class-card-accent"></div>
                        <div class="class-card-body">
                            <div class="class-card-title">${c.title}</div>
                            <div class="class-card-info">
                                <span class="class-info-item"><span class="material-icons-round">currency_rupee</span> ₹${c.fees}</span>
                                ${c.address ? `<span class="class-info-item"><span class="material-icons-round">location_on</span> ${c.address}</span>` : ""}
                            </div>
                        </div>
                    </div>
                `,
                    )
                    .join("")
                : '<div class="empty-state">No classes scheduled</div>'
            }
            </div>
        `;
        container.innerHTML = html;
    } catch (e) {
        console.error(e);
    }
}

async function loadMemberMemberships() {
    const container = document.getElementById("member-memberships-content");
    container.innerHTML = skeletonPlans(3);
    try {
        const { ok, data } = await apiFetch("api.php?action=memberships");
        if (!ok) return;
        const plans = data.memberships || [];
        container.innerHTML = `
            <div class="section-header"><h2>Our Membership Plans</h2></div>
            <div class="plan-list">
                ${plans.length > 0
                ? plans
                    .map(
                        (p) => `
                    <div class="plan-card">
                        <div class="plan-card-header">
                            <div class="plan-title">${p.title}</div>
                            <div class="plan-amount">₹${Number(p.amount).toLocaleString("en-IN")}<span>/${p.package}</span></div>
                        </div>
                        ${p.notes ? `<div style="font-size:12px;color:var(--text2);margin-top:8px">${p.notes}</div>` : ""}
                        <div class="plan-meta" style="margin-top:12px">
                            <span class="plan-meta-item"><span class="material-icons-round">check_circle</span> Instant Activation</span>
                            <span class="plan-meta-item"><span class="material-icons-round">history</span> Renewal Period: ${p.package}</span>
                        </div>
                    </div>
                `,
                    )
                    .join("")
                : '<div class="empty-state">No plans found</div>'
            }
            </div>
        `;
    } catch (e) { }
}

function calculateBMI() {
    const w = parseFloat(document.getElementById("bmi-weight").value);
    const h = parseFloat(document.getElementById("bmi-height").value) / 100;
    if (!w || !h) {
        showSnackbar("Please enter valid weight and height");
        return;
    }

    const bmi = (w / (h * h)).toFixed(1);
    const resArea = document.getElementById("bmi-result-area");
    const valEl = document.getElementById("bmi-value");
    const catEl = document.getElementById("bmi-category");
    const msgEl = document.getElementById("bmi-msg");

    resArea.style.display = "block";
    valEl.textContent = bmi;

    let cat = "Normal";
    let cls = "badge-active";
    let msg = "You have a healthy body weight. Keep it up!";

    if (bmi < 18.5) {
        cat = "Underweight";
        cls = "badge-frozen";
        msg =
            "You are underweight. Consider a nutrition plan to gain healthy mass.";
    } else if (bmi >= 25 && bmi < 30) {
        cat = "Overweight";
        cls = "badge-expired";
        msg =
            "You are slightly overweight. Regular exercise can help you reach a healthy range.";
    } else if (bmi >= 30) {
        cat = "Obesity";
        cls = "status-unpaid";
        msg =
            "You are in the obesity range. We recommend consulting our trainers for a custom fat loss plan.";
    }

    catEl.textContent = cat;
    catEl.className = "member-badge " + cls;
    msgEl.textContent = msg;

    if (navigator.vibrate) navigator.vibrate(20);
}

async function loadMemberWorkout() {
    const container = document.getElementById("member-workout-content");
    container.innerHTML = '<div class="sk-card" style="height:200px"></div>';

    try {
        // We'll need to fetch assigned workout for current member
        // For now, looking at existing table 'workouts'
        const { ok, data } = await apiFetch(
            "api.php?action=healths&user_id=" + currentUserData.id,
        ); // Placeholder for workout fetch
        // Assuming we add a 'workout' action to api.php later. For now, empty state.
        container.innerHTML = `
            <div class="member-hero">
                <div class="member-hero-greeting">Workout Plan</div>
                <div class="member-hero-sub">Your customized training routine</div>
            </div>
            <div class="empty-state">
                <span class="material-icons-round">fitness_center</span>
                <p>No workout plan assigned yet.</p>
                <p style="font-size:12px;margin-top:4px">Your trainer will update your plan soon.</p>
            </div>
        `;
    } catch (e) { }
}

async function loadMemberHealth() {
    const container = document.getElementById("member-health-content");
    container.innerHTML = skeletonMembers(2);

    try {
        const { ok, data } = await apiFetch(
            "api.php?action=healths&user_id=" + currentUserData.id,
        );
        if (!ok) return;
        const records = data.records || [];

        container.innerHTML =
            records.length > 0
                ? records
                    .map((r) => {
                        let measurements = [];
                        try {
                            measurements = JSON.parse(r.result);
                        } catch (e) {
                            measurements = [{ type: "Metric", result: r.result }];
                        }

                        return `
                <div class="card" style="padding:16px;margin-bottom:10px;background:var(--card);border:1px solid var(--border2);border-radius:var(--radius)">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
                        <div>
                            <div style="font-size:12px;color:var(--text3);font-weight:600">${new Date(r.measurement_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
                            <div style="font-size:15px;font-weight:700;margin-top:2px">Daily Progress</div>
                        </div>
                        <div style="display:flex;gap:4px">
                            <button class="icon-btn sm" onclick="deleteHealthRecord(${r.id})" style="color:var(--red)"><span class="material-icons-round" style="font-size:18px">delete</span></button>
                        </div>
                    </div>
                    
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                        ${measurements
                                .map(
                                    (m) => `
                            <div style="background:var(--surface2);padding:8px 12px;border-radius:8px">
                                <div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700">${m.type}</div>
                                <div style="font-size:14px;font-weight:700;color:var(--primary)">${m.result}</div>
                            </div>
                        `,
                                )
                                .join("")}
                    </div>

                    ${r.notes ? `<div style="font-size:13px;color:var(--text2);margin-top:12px;padding-top:10px;border-top:1px dashed var(--border2)">${r.notes}</div>` : ""}
                </div>
            `;
                    })
                    .join("")
                : '<div class="empty-state">No health records found</div>';
    } catch (e) { }
}

function showAddHealthSheet() {
    const types = [
        "Weight (kg)",
        "Height (cm)",
        "Fat (%)",
        "BMI",
        "Chest",
        "Waist",
        "Hips",
        "Arms",
        "Thighs",
    ];
    const html = `
        <form onsubmit="submitHealth(event)">
            <div class="form-group"><label class="form-label">Measurement Date</label><input type="date" class="form-input" name="measurement_date" value="${getLocalDate()}" required></div>
            
            <div id="health-metric-rows">
                <div class="health-row" style="display:flex;gap:8px;margin-bottom:8px">
                    <select class="form-input metric-type" style="flex:1;margin-bottom:0">
                        ${types.map((t) => `<option value="${t}">${t}</option>`).join("")}
                    </select>
                    <input type="text" class="form-input metric-val" placeholder="Result" style="flex:1;margin-bottom:0" required>
                    <button type="button" class="icon-btn" onclick="this.parentElement.remove()" style="color:var(--red)"><span class="material-icons-round">close</span></button>
                </div>
            </div>
            
            <button type="button" class="btn-secondary btn-full" onclick="addHealthMetricRow()" style="margin-top:4px"><span class="material-icons-round" style="font-size:18px">add</span> Add Metric</button>

            <div class="form-group" style="margin-top:16px"><label class="form-label">Notes</label><textarea class="form-input" name="notes" rows="2" placeholder="How are you feeling?"></textarea></div>
            
            <div class="form-actions">
                <button type="button" class="btn-secondary" onclick="closeSheet()">Cancel</button>
                <button type="submit" class="btn-primary">Save Record</button>
            </div>
        </form>
    `;
    document.getElementById("sheet-title").textContent = "Update Health Record";
    document.getElementById("sheet-content").innerHTML = html;
    openSheet();
}

function addHealthMetricRow() {
    const types = [
        "Weight (kg)",
        "Height (cm)",
        "Fat (%)",
        "BMI",
        "Chest",
        "Waist",
        "Hips",
        "Arms",
        "Thighs",
    ];
    const div = document.createElement("div");
    div.className = "health-row";
    div.style = "display:flex;gap:8px;margin-bottom:8px";
    div.innerHTML = `
        <select class="form-input metric-type" style="flex:1;margin-bottom:0">
            ${types.map((t) => `<option value="${t}">${t}</option>`).join("")}
        </select>
        <input type="text" class="form-input metric-val" placeholder="Result" style="flex:1;margin-bottom:0" required>
        <button type="button" class="icon-btn" onclick="this.parentElement.remove()" style="color:var(--red)"><span class="material-icons-round">close</span></button>
    `;
    document.getElementById("health-metric-rows").appendChild(div);
}

async function submitHealth(e) {
    e.preventDefault();
    const rows = document.querySelectorAll(".health-row");
    const results = [];
    rows.forEach((r) => {
        const type = r.querySelector(".metric-type").value;
        const result = r.querySelector(".metric-val").value;
        if (type && result) results.push({ type, result });
    });

    if (results.length === 0) {
        showSnackbar("Please add at least one measurement");
        return;
    }

    const formData = new FormData(e.target);
    const data = {
        user_id: currentUserData.id,
        measurement_date: formData.get("measurement_date"),
        notes: formData.get("notes"),
        result: JSON.stringify(results),
    };

    try {
        const { ok } = await apiFetch("api.php?action=healths", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        if (ok) {
            showSnackbar("Health record updated!");
            closeSheet();
            loadMemberHealth();
        }
    } catch (e) {
        showSnackbar("Error saving record");
    }
}

async function deleteHealthRecord(id) {
    showConfirm(
        "Delete Record",
        "Are you sure you want to delete this health record?",
        async () => {
            try {
                const { ok } = await apiFetch("api.php?action=healths&id=" + id, {
                    method: "DELETE",
                });
                if (ok) {
                    showSnackbar("Record deleted");
                    loadMemberHealth();
                }
            } catch (e) {
                showSnackbar("Error deleting record");
            }
        },
    );
}

// ==================== WORKOUT ACTIVITIES (ADMIN) ====================
async function showWorkoutActivitiesSheet() {
    openSheet();
    document.getElementById("sheet-title").textContent =
        "Manage Workout Activities";
    document.getElementById("sheet-content").innerHTML =
        '<div class="sk-card" style="height:100px"></div>';

    try {
        const { ok, data } = await apiFetch("api.php?action=workout_activities");
        if (!ok) return;
        const acts = data.activities || [];

        let html = `
            <div class="form-group">
                <label class="form-label">Add New Activity</label>
                <div style="display:flex;gap:8px">
                    <input type="text" id="new-act-title" class="form-input" placeholder="e.g. Bench Press" style="margin-bottom:0">
                    <button class="btn-primary" onclick="addWorkoutActivity()" style="padding:0 16px"><span class="material-icons-round">add</span></button>
                </div>
            </div>
            <div class="workout-acts-list" style="margin-top:16px;display:flex;flex-direction:column;gap:8px">
                ${acts
                .map(
                    (a) => `
                    <div class="setting-item" style="padding:8px 12px;margin-bottom:0">
                        <span style="flex:1;font-weight:500">${a.title}</span>
                        <button class="icon-btn sm" onclick="deleteWorkoutActivity(${a.id})"><span class="material-icons-round" style="color:var(--red);font-size:18px">delete</span></button>
                    </div>
                `,
                )
                .join("")}
            </div>
        `;
        document.getElementById("sheet-content").innerHTML = html;
    } catch (e) { }
}

async function addWorkoutActivity() {
    const title = document.getElementById("new-act-title").value.trim();
    if (!title) return;
    try {
        const { ok } = await apiFetch("api.php?action=workout_activities", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title }),
        });
        if (ok) showWorkoutActivitiesSheet();
    } catch (e) { }
}

async function deleteWorkoutActivity(id) {
    if (!confirm("Delete this activity?")) return;
    try {
        const { ok } = await apiFetch("api.php?action=workout_activity&id=" + id, {
            method: "DELETE",
        });
        if (ok) showWorkoutActivitiesSheet();
    } catch (e) { }
}

// ==================== WORKOUT PLAN (MEMBER) ====================
async function loadMemberWorkout() {
    const container = document.getElementById("member-workout-content");
    container.innerHTML = skeletonMembers(3);

    try {
        const { ok, data } = await apiFetch("api.php?action=workouts");
        if (!ok || !data.workouts || data.workouts.length === 0) {
            container.innerHTML = `
                <div class="empty-state"><span class="material-icons-round">fitness_center</span><p>No workout plan assigned yet.</p></div>
            `;
            return;
        }

        const w = data.workouts[0];
        let plan = [];
        try {
            plan = JSON.parse(w.workout_history);
        } catch (e) {
            plan = [];
        }

        // Group plan by Day
        const days = [
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
            "Sunday",
        ];
        const grouped = {};
        plan.forEach((ex) => {
            const day = ex.day || "General";
            if (!grouped[day]) grouped[day] = [];
            grouped[day].push(ex);
        });

        // Sorted days based on actual week order
        const sortedDays = Object.keys(grouped).sort(
            (a, b) => days.indexOf(a) - days.indexOf(b),
        );

        let html = `
            <div style="margin-bottom:16px">
                <div style="font-size:14px;color:var(--text3);font-weight:600">Active Plan</div>
                <div style="font-size:12px;color:var(--text3)">Started on ${w.start_date}</div>
            </div>
            ${w.notes ? `<div class="card" style="padding:14px;background:var(--primary-light);color:var(--primary);font-size:13px;font-weight:500;margin-bottom:16px;border:1px solid rgba(255,107,53,0.1)">${w.notes}</div>` : ""}
            
            <div class="workout-plan-container">
                ${sortedDays
                .map(
                    (day) => `
                    <div class="workout-day-section" style="margin-bottom:20px">
                        <div style="font-size:13px;font-weight:800;color:var(--text);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;display:flex;align-items:center;gap:6px">
                            <span class="material-icons-round" style="font-size:18px;color:var(--primary)">calendar_today</span>
                            ${day}
                        </div>
                        <div class="workout-day-cards" style="display:flex;flex-direction:column;gap:8px">
                            ${grouped[day]
                            .map(
                                (p) => `
                                <div class="card" style="padding:14px;border:1px solid var(--border2);border-radius:var(--radius-sm)">
                                    <div style="display:flex;align-items:center;gap:12px">
                                        <div class="member-avatar" style="width:36px;height:36px;background:var(--primary-bg);color:var(--primary);border-radius:10px"><span class="material-icons-round" style="font-size:18px">fitness_center</span></div>
                                        <div style="flex:1">
                                            <div style="font-weight:700;font-size:14px">${p.activity}</div>
                                            <div style="font-size:12px;color:var(--text3)">${p.sets} Sets • ${p.reps} Reps ${p.weight ? " • " + p.weight + "kg" : ""}</div>
                                        </div>
                                    </div>
                                </div>
                            `,
                            )
                            .join("")}
                        </div>
                    </div>
                `,
                )
                .join("")}
            </div>
        `;
        container.innerHTML = html;
    } catch (e) {
        console.error(e);
    }
}

// ==================== ASSIGN WORKOUT (ADMIN) ====================
async function showAssignWorkoutSheet(userId) {
    openSheet();
    document.getElementById("sheet-title").textContent = "Assign Workout Plan";
    document.getElementById("sheet-content").innerHTML = skeletonMembers(2);

    try {
        const { ok, data } = await apiFetch("api.php?action=workout_activities");
        const acts = (ok && data.activities) || [];

        const days = [
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
            "Sunday",
        ];

        let html = `
            <div id="workout-builder-rows">
                <div class="workout-row" style="display:grid;grid-template-columns:100px 1fr 60px 40px;gap:8px;margin-bottom:8px">
                    <select class="form-input day-sel" style="padding:8px 4px;font-size:12px"><option value="">Day</option>${days.map((d) => `<option value="${d}">${d}</option>`).join("")}</select>
                    <select class="form-input act-sel"><option value="">Activity</option>${acts.map((a) => `<option value="${a.title}">${a.title}</option>`).join("")}</select>
                    <input type="number" class="form-input set-inp" placeholder="Sets">
                    <button class="icon-btn" onclick="this.parentElement.remove()"><span class="material-icons-round" style="color:var(--red)">close</span></button>
                </div>
            </div>
            <button class="btn-secondary btn-full" onclick="addWorkoutRow()" style="margin-top:8px"><span class="material-icons-round">add</span> Add Exercise</button>
            
            <div class="form-group" style="margin-top:16px"><label class="form-label">Plan Notes</label><textarea id="workout-notes" class="form-input" rows="2" placeholder="e.g. Focus on form"></textarea></div>
            
            <div class="form-actions">
                <button type="button" class="btn-secondary" onclick="closeSheet()">Cancel</button>
                <button type="button" class="btn-primary" onclick="submitWorkoutPlan(${userId})">Assign Plan</button>
            </div>
        `;
        document.getElementById("sheet-content").innerHTML = html;
        window._workoutActivities = acts;
    } catch (e) { }
}

function addWorkoutRow() {
    const acts = window._workoutActivities || [];
    const days = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
    ];
    const div = document.createElement("div");
    div.className = "workout-row";
    div.style =
        "display:grid;grid-template-columns:100px 1fr 60px 40px;gap:8px;margin-bottom:8px";
    div.innerHTML = `
        <select class="form-input day-sel" style="padding:8px 4px;font-size:12px"><option value="">Day</option>${days.map((d) => `<option value="${d}">${d}</option>`).join("")}</select>
        <select class="form-input act-sel"><option value="">Activity</option>${acts.map((a) => `<option value="${a.title}">${a.title}</option>`).join("")}</select>
        <input type="number" class="form-input set-inp" placeholder="Sets">
        <button class="icon-btn" onclick="this.parentElement.remove()"><span class="material-icons-round" style="color:var(--red)">close</span></button>
    `;
    document.getElementById("workout-builder-rows").appendChild(div);
}

async function submitWorkoutPlan(userId) {
    const rows = document.querySelectorAll(".workout-row");
    const plan = [];
    rows.forEach((r) => {
        const day = r.querySelector(".day-sel").value;
        const activity = r.querySelector(".act-sel").value;
        const sets = r.querySelector(".set-inp").value;
        if (day && activity) plan.push({ day, activity, sets, reps: "" }); // reps simplified
    });

    if (plan.length === 0) {
        showSnackbar("Please add at least one exercise");
        return;
    }

    try {
        const { ok } = await apiFetch("api.php?action=workouts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                user_id: userId,
                workout_plan: JSON.stringify(plan),
                notes: document.getElementById("workout-notes").value.trim(),
            }),
        });
        if (ok) {
            showSnackbar("Workout plan assigned!");
            closeSheet();
        }
    } catch (e) {
        showSnackbar("Error assigning plan");
    }
}

// ==================== QR ATTENDANCE ====================

let qrScanner = null;
let isProcessingScan = false;

// Audio context and feedback sounds
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playFeedbackSound(type) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === "success") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(
            1200,
            audioCtx.currentTime + 0.1,
        );
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
    } else {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(220, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(110, audioCtx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
    }
}

async function startQRScanner() {
    if (qrScanner) {
        try {
            await qrScanner.stop();
        } catch (e) { }
    }

    document.getElementById("scan-feedback").style.display = "none";
    isProcessingScan = false;

    qrScanner = new Html5Qrcode("reader");
    const config = { fps: 15, qrbox: { width: 220, height: 220 } };

    qrScanner
        .start({ facingMode: "environment" }, config, onScanSuccess)
        .catch((err) => {
            showSnackbar("Camera permission required to scan QR");
        });
}

async function onScanSuccess(decodedText) {
    if (isProcessingScan) return;
    isProcessingScan = true;

    // Stop scanner immediately on success
    try {
        await qrScanner.stop();
    } catch (e) { }

    document.getElementById("scan-feedback").style.display = "block";
    if (navigator.vibrate) navigator.vibrate([50, 30, 50]);

    try {
        const { ok, data } = await apiFetch("api.php?action=attendance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                qr_token: decodedText,
                type: "checkin",
            }),
        });

        if (ok) {
            playFeedbackSound("success");
            showScanSuccessAnimation(
                data.type === "checkout"
                    ? "Check-out successful!"
                    : "Check-in successful!",
            );
        } else {
            playFeedbackSound("error");
            showSnackbar(data.error || "Invalid QR Code");
            setTimeout(() => startQRScanner(), 3000);
        }
    } catch (e) {
        playFeedbackSound("error");
        showSnackbar("Connection error");
        setTimeout(() => startQRScanner(), 3000);
    }
}

function showScanSuccessAnimation(msg) {
    const overlay = document.createElement("div");
    overlay.className = "scan-success-overlay";
    overlay.innerHTML = `
        <div class="success-checkmark">
            <span class="material-icons-round">done</span>
        </div>
        <h2 style="color:var(--green);margin-top:24px;font-weight:800">${msg}</h2>
        <p style="color:var(--text2);margin-top:8px">Have a great session!</p>
    `;
    document.body.appendChild(overlay);

    setTimeout(() => {
        overlay.style.opacity = "0";
        setTimeout(() => {
            overlay.remove();
            navigate("member-attendance");
        }, 300);
    }, 2000);
}

async function loadAdminQR() {
    const wrap = document.getElementById("gym-qr-wrap");
    wrap.innerHTML = "";

    try {
        const { ok, data } = await apiFetch("api.php?action=settings");
        if (ok && data.settings && data.settings.attendance_qr_secret) {
            const secret = data.settings.attendance_qr_secret;
            const gymName = data.settings.company_name || "Your Gym";
            document.getElementById("admin-qr-gym-name-display").textContent =
                gymName;

            new QRCode(wrap, {
                text: secret,
                width: 180,
                height: 180,
                colorDark: "#1A1A2E",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H,
            });
        }
    } catch (e) { }
}

function downloadGymQR() {
    const canvas = document.querySelector("#gym-qr-wrap canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "gym-attendance-qr.png";
    link.href = canvas.toDataURL();
    link.click();
}
