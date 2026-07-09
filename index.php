<?php // session_start() is handled by config.php (included via api.php) — no need here 
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <meta name="theme-color" content="#FFFFFF">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <meta name="apple-mobile-web-app-title" content="GymXBook">
    <link rel="manifest" href="manifest.json">
    <link rel="apple-touch-icon" href="https://i.ibb.co/J9Kpd0V/gymxbook-icon-1.png">
    <title>GymXBook - Gym Management</title>
    <link rel="stylesheet" href="assets/css/style.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet">
    <script src="https://unpkg.com/html5-qrcode"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
</head>

<body>

    <!-- ==================== NETWORK BANNER ==================== -->
    <div id="network-banner" class="network-banner" style="display:none">
        <span class="material-icons-round" style="font-size:18px">wifi_off</span>
        <span>You're offline. Check your connection.</span>
    </div>

    <!-- ==================== SUBSCRIPTION EXPIRED OVERLAY ==================== -->
    <div id="subscription-overlay" class="subscription-overlay" style="display:none">
        <div class="subscription-blocked">
            <div class="sub-expired-icon"><span class="material-icons-round">event_busy</span></div>
            <h2>Plan Expired</h2>
            <p id="subscription-expiry-message">Your subscription has expired. Renew now to restore full access.</p>
            <div class="sub-expired-detail">
                <span class="material-icons-round" style="font-size:16px">info</span>
                <span id="sub-expired-detail-text">Some features may be limited</span>
            </div>
            <div class="sub-overlay-actions">
                <button class="btn-primary btn-full" onclick="closeDrawer();navigate('subscription');dismissSubscriptionOverlay()">
                    <span class="material-icons-round" style="font-size:18px">autorenew</span>
                    Renew Now
                </button>
                <button class="sub-dismiss-btn" onclick="dismissSubscriptionOverlay()">Continue anyway</button>
            </div>
        </div>
    </div>

    <!-- ==================== SUBSCRIPTION WARNING BANNER ==================== -->
    <div id="subscription-warning" class="subscription-warning" style="display:none">
        <span class="material-icons-round" style="font-size:18px">warning</span>
        <span id="subscription-warning-text">Subscription expiring soon!</span>
        <button class="warn-dismiss" onclick="dismissSubscriptionWarning()"><span class="material-icons-round" style="font-size:16px">close</span></button>
    </div>

    <!-- ==================== SPLASH SCREEN ==================== -->
    <div id="splash-screen" class="screen active" style="background:var(--primary);justify-content:center;align-items:center">
        <div style="text-align:center;color:white">
            <div style="width:72px;height:72px;background:rgba(255,255,255,0.2);border-radius:20px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;padding:8px">
                <img src="https://i.ibb.co/J9Kpd0V/gymxbook-icon-1.png" alt="GymXBook" style="width:100%;height:100%;object-fit:contain">
            </div>
            <h1 style="font-size:28px;font-weight:800;margin:0">GymXBook</h1>
            <div style="margin-top:24px;width:32px;height:32px;border:3px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite;margin-left:auto;margin-right:auto"></div>
        </div>
    </div>

    <!-- ==================== LOGIN SCREEN ==================== -->
    <div id="login-screen" class="screen">
        <div class="login-container">
            <div class="login-hero">
                <div class="login-hero-bg"></div>
                <div class="login-hero-content">
                    <img src="https://i.ibb.co/J9Kpd0V/gymxbook-icon-1.png" alt="GymXBook" class="login-hero-logo">
                    <h1>Welcome Back</h1>
                    <p>Sign in to manage your gym</p>
                </div>
            </div>
            <div class="login-form-area">
                <form id="login-form" class="login-form">
                    <div class="input-group">
                        <span class="material-icons-round input-icon">person</span>
                        <input type="text" id="login-email" placeholder="Email or Phone" required autocomplete="username">
                    </div>
                    <div class="input-group">
                        <span class="material-icons-round input-icon">lock</span>
                        <input type="password" id="login-password" placeholder="Password" required autocomplete="current-password">
                        <button type="button" class="toggle-pass" onclick="togglePassword(this)">
                            <span class="material-icons-round">visibility_off</span>
                        </button>
                    </div>
                    <label class="remember-row">
                        <input type="checkbox" id="login-remember" checked>
                        <span>Keep me logged in</span>
                    </label>
                    <button type="submit" class="btn-primary btn-full" id="login-btn">
                        <span>Sign In</span>
                        <div class="btn-loader" style="display:none"></div>
                    </button>
                </form>
                <div class="login-switch">
                    <span>Don't have an account?</span>
                    <button onclick="showRegister()">Register</button>
                </div>
            </div>
        </div>
    </div>

    <!-- ==================== REGISTER SCREEN ==================== -->
    <div id="register-screen" class="screen">
        <div class="login-container">
            <div class="login-hero">
                <div class="login-hero-bg"></div>
                <div class="login-hero-content">
                    <img src="https://i.ibb.co/J9Kpd0V/gymxbook-icon-1.png" alt="GymXBook" class="login-hero-logo">
                    <h1 id="reg-hero-title">Register Your Business</h1>
                    <p id="reg-hero-sub">Step 1 of 2 — Your gym details</p>
                </div>
            </div>
            <div class="login-form-area">
                <!-- Step 1: Business Name -->
                <div id="register-step1">
                    <form id="register-step1-form" class="login-form">
                        <div class="input-group">
                            <span class="material-icons-round input-icon">fitness_center</span>
                            <input type="text" id="reg-business-name" placeholder="Business / Gym Name" required autocomplete="organization">
                        </div>
                        <button type="submit" class="btn-primary btn-full" style="margin-top:8px">
                            <span>Next</span>
                            <span class="material-icons-round" style="font-size:18px">arrow_forward</span>
                            <div class="btn-loader" style="display:none"></div>
                        </button>
                    </form>
                </div>

                <!-- Step 2: Personal Details -->
                <div id="register-step2" style="display:none">
                    <form id="register-step2-form" class="login-form">
                        <div class="input-group">
                            <span class="material-icons-round input-icon">person</span>
                            <input type="text" id="reg-personal-name" placeholder="Your Full Name" required autocomplete="name">
                        </div>
                        <div class="input-group">
                            <span class="material-icons-round input-icon">phone</span>
                            <input type="tel" id="reg-phone" placeholder="Phone Number" required autocomplete="tel">
                        </div>
                        <div class="input-group">
                            <span class="material-icons-round input-icon">email</span>
                            <input type="email" id="reg-email" placeholder="Email Address" required autocomplete="email">
                        </div>
                        <div class="input-group">
                            <span class="material-icons-round input-icon">lock</span>
                            <input type="password" id="reg-password" placeholder="Create Password (min 6 chars)" required minlength="6" autocomplete="new-password">
                        </div>
                        <button type="submit" class="btn-primary btn-full" id="register-btn" style="margin-top:4px">
                            <span>Create Account</span>
                            <div class="btn-loader" style="display:none"></div>
                        </button>
                    </form>
                    <p style="text-align:center;font-size:11px;color:var(--text3);margin-top:12px;line-height:1.4">By creating an account, you agree to our Terms of Service.</p>
                </div>

                <div class="login-switch">
                    <span>Already have an account?</span>
                    <button onclick="showLogin()">Sign In</button>
                </div>
                <!-- Step indicators -->
                <div class="reg-steps">
                    <div id="reg-dot-1" class="reg-dot active"></div>
                    <div id="reg-dot-2" class="reg-dot"></div>
                </div>
            </div>
        </div>
    </div>

    <!-- ==================== MAIN APP ==================== -->
    <div id="app-shell" class="screen">

        <header id="app-header" class="app-header">
            <button class="header-btn" onclick="toggleDrawer()" id="menu-btn"><span class="material-icons-round">menu</span></button>
            <h1 id="header-title">Dashboard</h1>
            <div class="header-actions">
                <button class="icon-btn" onclick="showNotifications()" style="position:relative">
                    <span class="material-icons-round">notifications_none</span>
                    <span id="notif-badge" class="notif-badge" style="display:none">0</span>
                </button>
            </div>
        </header>

        <!-- Modern Side Drawer -->
        <div id="drawer-overlay" class="drawer-overlay" onclick="closeDrawer()"></div>
        <nav id="drawer" class="drawer">
            <div class="drawer-profile">
                <div class="drawer-avatar" id="drawer-avatar"><span class="material-icons-round">account_circle</span></div>
                <div class="drawer-user-info">
                    <h3 id="drawer-name">Admin</h3>
                    <p id="drawer-email">admin@gym.com</p>
                    <div id="drawer-expiry" class="drawer-expiry" style="display:none" onclick="closeDrawer();navigate('subscription')">
                        <span class="material-icons-round">verified</span>
                        <span id="drawer-expiry-text">Active until -</span>
                    </div>
                </div>
                <button class="drawer-close" onclick="closeDrawer()"><span class="material-icons-round">close</span></button>
            </div>
            <div class="drawer-body">
                <!-- Admin Menu -->
                <div id="admin-menu">
                    <div class="drawer-section-label">MAIN</div>
                    <button class="drawer-item active" data-page="dashboard" onclick="navigate('dashboard')">
                        <div class="drawer-item-icon"><span class="material-icons-round">space_dashboard</span></div>
                        <span>Dashboard</span>
                    </button>
                    <button class="drawer-item" data-page="members" onclick="navigate('members')">
                        <div class="drawer-item-icon"><span class="material-icons-round">people</span></div>
                        <span>Members</span>
                    </button>
                    <button class="drawer-item" data-page="trainers" onclick="navigate('trainers')">
                        <div class="drawer-item-icon"><span class="material-icons-round">sports_martial_arts</span></div>
                        <span>Trainers</span>
                    </button>
                    <button class="drawer-item" data-page="attendance" onclick="navigate('attendance')">
                        <div class="drawer-item-icon"><span class="material-icons-round">fact_check</span></div>
                        <span>Attendance</span>
                    </button>
                    <button class="drawer-item" data-page="memberships" onclick="navigate('memberships')">
                        <div class="drawer-item-icon"><span class="material-icons-round">card_membership</span></div>
                        <span>Plans</span>
                    </button>
                    <button class="drawer-item" data-page="reports" onclick="navigate('reports')">
                        <div class="drawer-item-icon"><span class="material-icons-round">analytics</span></div>
                        <span>Reports</span>
                    </button>
                    <button class="drawer-item" data-page="admin-qr" onclick="navigate('admin-qr')">
                        <div class="drawer-item-icon"><span class="material-icons-round">qr_code_2</span></div>
                        <span>Gym QR Code</span>
                    </button>

                    <div class="drawer-section-label">MANAGE</div>
                    <button class="drawer-item" data-page="classes" onclick="navigate('classes')">
                        <div class="drawer-item-icon"><span class="material-icons-round">self_improvement</span></div>
                        <span>Classes</span>
                    </button>
                    <button class="drawer-item" data-page="expenses" onclick="navigate('expenses')">
                        <div class="drawer-item-icon"><span class="material-icons-round">account_balance_wallet</span></div>
                        <span>Expenses</span>
                    </button>
                    <button class="drawer-item" data-page="invoices" onclick="navigate('invoices')">
                        <div class="drawer-item-icon"><span class="material-icons-round">receipt_long</span></div>
                        <span>Invoices</span>
                    </button>
                    <button class="drawer-item" data-page="transactions" onclick="navigate('transactions')">
                        <div class="drawer-item-icon"><span class="material-icons-round">swap_horiz</span></div>
                        <span>Transactions</span>
                    </button>
                    <button class="drawer-item" data-page="lockers" onclick="navigate('lockers')">
                        <div class="drawer-item-icon"><span class="material-icons-round">lock</span></div>
                        <span>Lockers</span>
                    </button>
                    <button class="drawer-item" data-page="events" onclick="navigate('events')">
                        <div class="drawer-item-icon"><span class="material-icons-round">event</span></div>
                        <span>Events</span>
                    </button>
                    <button class="drawer-item" data-page="products" onclick="navigate('products')">
                        <div class="drawer-item-icon"><span class="material-icons-round">storefront</span></div>
                        <span>Products</span>
                    </button>
                    <button class="drawer-item" data-page="notices" onclick="navigate('notices')">
                        <div class="drawer-item-icon"><span class="material-icons-round">campaign</span></div>
                        <span>Notices</span>
                    </button>

                    <div class="drawer-section-label">OTHER</div>
                    <button class="drawer-item" data-page="subscription" onclick="navigate('subscription')">
                        <div class="drawer-item-icon"><span class="material-icons-round">verified</span></div>
                        <span>Subscription</span>
                    </button>
                </div>

                <!-- Member Menu -->
                <div id="member-menu" style="display:none">
                    <div class="drawer-section-label">MEMBER AREA</div>
                    <button class="drawer-item active" data-page="member-dashboard" onclick="navigate('member-dashboard')">
                        <div class="drawer-item-icon"><span class="material-icons-round">space_dashboard</span></div>
                        <span>Home</span>
                    </button>
                    <button class="drawer-item" data-page="member-attendance" onclick="navigate('member-attendance')">
                        <div class="drawer-item-icon"><span class="material-icons-round">fact_check</span></div>
                        <span>Attendance</span>
                    </button>
                    <button class="drawer-item" data-page="member-workout" onclick="navigate('member-workout')">
                        <div class="drawer-item-icon"><span class="material-icons-round">fitness_center</span></div>
                        <span>Workout Plan</span>
                    </button>
                    <button class="drawer-item" data-page="member-health" onclick="navigate('member-health')">
                        <div class="drawer-item-icon"><span class="material-icons-round">monitor_weight</span></div>
                        <span>Health Records</span>
                    </button>
                    <button class="drawer-item" data-page="member-bmi" onclick="navigate('member-bmi')">
                        <div class="drawer-item-icon"><span class="material-icons-round">calculate</span></div>
                        <span>BMI Calculator</span>
                    </button>
                    <button class="drawer-item" data-page="member-memberships" onclick="navigate('member-memberships')">
                        <div class="drawer-item-icon"><span class="material-icons-round">card_membership</span></div>
                        <span>Our Plans</span>
                    </button>
                    <button class="drawer-item" data-page="member-scan" onclick="navigate('member-scan')">
                        <div class="drawer-item-icon"><span class="material-icons-round">qr_code_scanner</span></div>
                        <span>Scan QR Attendance</span>
                    </button>
                    <button class="drawer-item" data-page="member-invoices" onclick="navigate('member-invoices')">
                        <div class="drawer-item-icon"><span class="material-icons-round">receipt_long</span></div>
                        <span>Payments</span>
                    </button>
                    <button class="drawer-item" data-page="member-classes" onclick="navigate('member-classes')">
                        <div class="drawer-item-icon"><span class="material-icons-round">self_improvement</span></div>
                        <span>Classes</span>
                    </button>
                    <button class="drawer-item" data-page="notices" onclick="navigate('notices')">
                        <div class="drawer-item-icon"><span class="material-icons-round">campaign</span></div>
                        <span>Notices</span>
                    </button>
                </div>

                <button class="drawer-item" data-page="settings" onclick="navigate('settings')">
                    <div class="drawer-item-icon"><span class="material-icons-round">settings</span></div>
                    <span>Settings</span>
                </button>
            </div>
        </nav>

        <!-- Page Content -->
        <main id="page-content" class="page-content">

            <!-- Dashboard Page -->
            <div id="page-dashboard" class="page active">
                <div class="page-scroll">
                    <div class="stats-grid">
                        <div class="stat-card" onclick="navigate('members')">
                            <div class="stat-icon orange"><span class="material-icons-round">people</span></div>
                            <div class="stat-info"><span class="stat-value" id="stat-members">0</span><span class="stat-label">Members</span></div>
                        </div>
                        <div class="stat-card" onclick="navigate('trainers')">
                            <div class="stat-icon green"><span class="material-icons-round">sports_martial_arts</span></div>
                            <div class="stat-info"><span class="stat-value" id="stat-trainers">0</span><span class="stat-label">Trainers</span></div>
                        </div>
                        <div class="stat-card" onclick="navigate('attendance')">
                            <div class="stat-icon blue"><span class="material-icons-round">fact_check</span></div>
                            <div class="stat-info"><span class="stat-value" id="stat-attendance">0</span><span class="stat-label">Today</span></div>
                        </div>
                        <div class="stat-card" onclick="navigate('members');document.getElementById('member-filters').style.display='flex';setTimeout(()=>filterMembers('active',document.querySelector('#member-filters .chip:nth-child(2)')),100)">
                            <div class="stat-icon purple"><span class="material-icons-round">card_membership</span></div>
                            <div class="stat-info"><span class="stat-value" id="stat-active">0</span><span class="stat-label">Active</span></div>
                        </div>
                    </div>
                    <div class="revenue-row">
                        <div class="revenue-card income" onclick="navigate('transactions')" style="cursor:pointer"><span class="material-icons-round">trending_up</span>
                            <div><span class="rev-amount" id="stat-revenue">₹0</span><span class="rev-label">Revenue (Month)</span></div>
                        </div>
                        <div class="revenue-card expense" onclick="navigate('expenses')" style="cursor:pointer"><span class="material-icons-round">trending_down</span>
                            <div><span class="rev-amount" id="stat-expenses">₹0</span><span class="rev-label">Expenses (Month)</span></div>
                        </div>
                    </div>
                    <div class="section-header">
                        <h2>Quick Actions</h2>
                    </div>
                    <div class="quick-actions">
                        <button class="quick-action-btn" onclick="showAddMemberSheet()"><span class="material-icons-round">person_add</span><span>Add Member</span></button>
                        <button class="quick-action-btn" onclick="navigate('admin-qr')"><span class="material-icons-round">qr_code_2</span><span>QR Code</span></button>
                        <button class="quick-action-btn" onclick="showAddExpenseSheet()"><span class="material-icons-round">payments</span><span>Add Expense</span></button>
                        <button class="quick-action-btn" onclick="navigate('invoices')"><span class="material-icons-round">receipt_long</span><span>Invoices</span></button>
                    </div>
                    <div class="section-header">
                        <h2>Recent Members</h2><button class="text-btn" onclick="navigate('members')">See All</button>
                    </div>
                    <div id="recent-members-list" class="member-list"></div>
                    <div class="section-header">
                        <h2>Today's Check-ins</h2>
                    </div>
                    <div id="today-checkins-list" class="checkin-list"></div>
                </div>
            </div>

            <!-- Members Page -->
            <div id="page-members" class="page page-flex">
                <div class="members-search-fixed">
                    <div class="search-bar"><span class="material-icons-round">search</span><input type="text" id="member-search" placeholder="Search members..." oninput="searchMembers(this.value)"><button class="icon-btn sm" onclick="showMemberFilter()"><span class="material-icons-round">filter_list</span></button></div>
                    <div class="filter-chips" id="member-filters" style="display:none">
                        <button class="chip active" onclick="filterMembers('all', this)">All</button>
                        <button class="chip" onclick="filterMembers('active', this)">Active</button>
                        <button class="chip" onclick="filterMembers('expired', this)">Expired</button>
                    </div>
                </div>
                <div class="page-scroll" style="flex:1;min-height:0;padding-top:0">
                    <div id="members-list" class="member-list"></div>
                </div>
                <button class="fab" onclick="showAddMemberSheet()"><span class="material-icons-round">person_add</span></button>
            </div>

            <!-- Member Detail Page -->
            <div id="page-member-detail" class="page">
                <div class="page-scroll" id="member-detail-content"></div>
            </div>

            <!-- Trainers Page -->
            <div id="page-trainers" class="page">
                <div class="page-scroll">
                    <div id="trainers-list" class="member-list"></div>
                </div>
                <button class="fab" onclick="showAddTrainerSheet()"><span class="material-icons-round">person_add</span></button>
            </div>

            <!-- Attendance Page -->
            <div id="page-attendance" class="page">
                <div class="page-scroll">
                    <div class="attendance-header">
                        <div class="date-picker-row">
                            <button class="icon-btn" onclick="changeAttDate(-1)"><span class="material-icons-round">chevron_left</span></button>
                            <input type="date" id="att-date" onchange="loadAttendance()" max="">
                            <button class="icon-btn" id="att-next-btn" onclick="changeAttDate(1)"><span class="material-icons-round">chevron_right</span></button>
                        </div>
                        <div class="att-stats">
                            <div class="att-stat"><span class="att-stat-val" id="att-total">0</span><span class="att-stat-label">Total</span></div>
                            <div class="att-stat"><span class="att-stat-val" id="att-checkedin">0</span><span class="att-stat-label">In</span></div>
                            <div class="att-stat"><span class="att-stat-val" id="att-checkedout">0</span><span class="att-stat-label">Out</span></div>
                        </div>
                    </div>
                    <div class="search-bar"><span class="material-icons-round">search</span><input type="text" id="att-search" placeholder="Search member to check in..." oninput="searchForCheckin(this.value)"></div>
                    <div id="att-search-results" class="search-results" style="display:none"></div>
                    <div id="attendance-list" class="attendance-list">
                        <div class="empty-state"><span class="material-icons-round">event_available</span>
                            <p>No records for this date</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Memberships Page -->
            <div id="page-memberships" class="page">
                <div class="page-scroll">
                    <div id="memberships-list" class="plan-list"></div>
                </div>
                <button class="fab" onclick="showAddMembershipSheet()"><span class="material-icons-round">add</span></button>
            </div>

            <!-- Reports Page -->
            <div id="page-reports" class="page">
                <div class="page-scroll" id="reports-content">
                </div>
            </div>

            <!-- Subscription Page -->
            <div id="page-subscription" class="page">
                <div class="page-scroll" id="subscription-content">
                </div>
            </div>

            <!-- Subscription Upgrade Page -->
            <div id="page-subscription-upgrade" class="page">
                <div class="page-scroll" id="subscription-upgrade-content"></div>
            </div>

            <!-- Subscription Renew Page -->
            <div id="page-subscription-renew" class="page">
                <div class="page-scroll" id="subscription-renew-content"></div>
            </div>

            <!-- Classes Page -->
            <div id="page-classes" class="page">
                <div class="page-scroll">
                    <div id="classes-list" class="class-list"></div>
                </div>
                <button class="fab" onclick="showAddClassSheet()"><span class="material-icons-round">add</span></button>
            </div>

            <!-- Expenses Page -->
            <div id="page-expenses" class="page">
                <div class="page-scroll">
                    <div class="expense-month-nav"><button class="icon-btn" onclick="changeExpMonth(-1)"><span class="material-icons-round">chevron_left</span></button><span id="expense-month-label">July 2026</span><button class="icon-btn" onclick="changeExpMonth(1)"><span class="material-icons-round">chevron_right</span></button></div>
                    <div class="expense-total-card"><span class="material-icons-round">account_balance_wallet</span>
                        <div><span class="exp-total-amount" id="exp-total">₹0</span><span class="exp-total-label">Total Expenses</span></div>
                    </div>
                    <div id="expenses-list" class="expense-list"></div>
                </div>
                <button class="fab" onclick="showAddExpenseSheet()"><span class="material-icons-round">payments</span></button>
            </div>

            <!-- Invoices Page -->
            <div id="page-invoices" class="page">
                <div class="page-scroll">
                    <div class="filter-chips" id="invoice-filters">
                        <button class="chip active" onclick="filterInvoices('all', this)">All</button>
                        <button class="chip" onclick="filterInvoices('unpaid', this)">Unpaid</button>
                        <button class="chip" onclick="filterInvoices('partial', this)">Partial</button>
                        <button class="chip" onclick="filterInvoices('paid', this)">Paid</button>
                    </div>
                    <div id="invoices-list" class="invoice-list"></div>
                </div>
                <button class="fab" onclick="showAddInvoiceSheet()"><span class="material-icons-round">receipt_long</span></button>
            </div>

            <!-- Transactions Page -->
            <div id="page-transactions" class="page">
                <div class="page-scroll">
                    <div class="expense-month-nav">
                        <button class="icon-btn" onclick="changeTxnMonth(-1)"><span class="material-icons-round">chevron_left</span></button>
                        <span id="txn-month-label">July 2026</span>
                        <button class="icon-btn" id="txn-next-btn" onclick="changeTxnMonth(1)"><span class="material-icons-round">chevron_right</span></button>
                    </div>
                    <div class="revenue-row">
                        <div class="revenue-card income"><span class="material-icons-round">trending_up</span>
                            <div><span class="rev-amount" id="txn-income">₹0</span><span class="rev-label">Income</span></div>
                        </div>
                        <div class="revenue-card expense"><span class="material-icons-round">trending_down</span>
                            <div><span class="rev-amount" id="txn-expense">₹0</span><span class="rev-label">Expenses</span></div>
                        </div>
                    </div>
                    <div id="transactions-list" class="txn-list"></div>
                </div>
            </div>

            <!-- Lockers Page -->
            <div id="page-lockers" class="page">
                <div class="page-scroll">
                    <div id="lockers-grid" class="lockers-grid"></div>
                </div>
                <button class="fab" onclick="showAddLockersSheet()"><span class="material-icons-round">add</span></button>
            </div>

            <!-- Events Page -->
            <div id="page-events" class="page">
                <div class="page-scroll">
                    <div id="events-list" class="event-list">
                        <div class="empty-state"><span class="material-icons-round">event</span>
                            <p>No events</p>
                        </div>
                    </div>
                </div>
                <button class="fab" onclick="showAddEventSheet()"><span class="material-icons-round">add</span></button>
            </div>

            <!-- Products Page -->
            <div id="page-products" class="page">
                <div class="page-scroll">
                    <div id="products-list" class="product-list">
                        <div class="empty-state"><span class="material-icons-round">storefront</span>
                            <p>No products</p>
                        </div>
                    </div>
                </div>
                <button class="fab" onclick="showAddProductSheet()"><span class="material-icons-round">add</span></button>
            </div>

            <!-- Notices Page -->
            <div id="page-notices" class="page">
                <div class="page-scroll">
                    <div id="notices-list" class="notice-list">
                        <div class="empty-state"><span class="material-icons-round">campaign</span>
                            <p>No notices</p>
                        </div>
                    </div>
                </div>
                <button class="fab" onclick="showAddNoticeSheet()"><span class="material-icons-round">add</span></button>
            </div>

            <!-- Settings Page -->
            <div id="page-settings" class="page">
                <div class="page-scroll">
                    <div id="settings-menu-list">
                        <div class="settings-group">
                            <h3>Account & Security</h3>
                            <div class="setting-item clickable" onclick="showSettingsSection('profile')">
                                <span class="material-icons-round">person</span>
                                <div class="setting-info">
                                    <span class="setting-label" style="font-size:14px;font-weight:600;color:var(--text)">Personal Profile</span>
                                    <span class="setting-value" style="font-size:11px">Name, Email and Phone</span>
                                </div>
                                <span class="material-icons-round" style="font-size:18px;color:var(--text3)">chevron_right</span>
                            </div>
                            <div class="setting-item clickable" onclick="showChangePasswordSheet()">
                                <span class="material-icons-round">lock_reset</span>
                                <div class="setting-info">
                                    <span class="setting-label" style="font-size:14px;font-weight:600;color:var(--text)">Change Password</span>
                                    <span class="setting-value" style="font-size:11px">Update login password</span>
                                </div>
                                <span class="material-icons-round" style="font-size:18px;color:var(--text3)">chevron_right</span>
                            </div>
                        </div>

                        <div class="settings-group" id="admin-business-settings-menu" style="display:none">
                            <h3>Business Settings</h3>
                            <div class="setting-item clickable" onclick="showSettingsSection('gym')">
                                <span class="material-icons-round">fitness_center</span>
                                <div class="setting-info">
                                    <span class="setting-label" style="font-size:14px;font-weight:600;color:var(--text)">Gym Profile</span>
                                    <span class="setting-value" style="font-size:11px">Business Name and Contact</span>
                                </div>
                                <span class="material-icons-round" style="font-size:18px;color:var(--text3)">chevron_right</span>
                            </div>
                            <div class="setting-item clickable" onclick="showWorkoutActivitiesSheet()">
                                <span class="material-icons-round">category</span>
                                <div class="setting-info">
                                    <span class="setting-label" style="font-size:14px;font-weight:600;color:var(--text)">Workout Activities</span>
                                    <span class="setting-value" style="font-size:11px">Manage exercise library</span>
                                </div>
                                <span class="material-icons-round" style="font-size:18px;color:var(--text3)">chevron_right</span>
                            </div>
                            <div class="setting-item clickable" onclick="navigate('admin-qr')">
                                <span class="material-icons-round">qr_code_2</span>
                                <div class="setting-info">
                                    <span class="setting-label" style="font-size:14px;font-weight:600;color:var(--text)">Attendance QR</span>
                                    <span class="setting-value" style="font-size:11px">View and print gym QR</span>
                                </div>
                                <span class="material-icons-round" style="font-size:18px;color:var(--text3)">chevron_right</span>
                            </div>
                        </div>

                        <div class="settings-group">
                            <h3>App</h3>
                            <div class="setting-item"><span class="material-icons-round">info</span>
                                <div class="setting-info"><span class="setting-label">Version</span><span class="setting-value">2.2.0</span></div>
                            </div>
                        </div>

                        <div class="settings-desktop-msg" id="admin-settings-msg" style="display:none;margin-bottom:16px">
                            <span class="material-icons-round">computer</span>
                            <span>Use the desktop version for more business options.</span>
                        </div>

                        <button class="btn-danger btn-full" style="margin-top:12px;background:var(--red-bg);color:var(--red);border:1px solid rgba(239,68,68,0.2)" onclick="logout()">Logout</button>
                    </div>

                    <!-- Profile Section -->
                    <div id="settings-section-profile" style="display:none">
                        <button class="text-btn" onclick="hideSettingsSections()" style="padding:0;margin-bottom:16px;display:flex;align-items:center;gap:4px">
                            <span class="material-icons-round">arrow_back</span> Back to Settings
                        </button>
                        <div class="settings-group">
                            <h3>Personal Profile</h3>
                            <div class="setting-item"><span class="material-icons-round">person</span>
                                <div class="setting-info"><span class="setting-label">Full Name</span><input type="text" id="setting-user-name" placeholder="Your Name" class="setting-input"></div>
                            </div>
                            <div class="setting-item"><span class="material-icons-round">phone</span>
                                <div class="setting-info"><span class="setting-label">Personal Phone</span><input type="tel" id="setting-user-phone" placeholder="+91 9876543210" class="setting-input"></div>
                            </div>
                            <div class="setting-item"><span class="material-icons-round">email</span>
                                <div class="setting-info"><span class="setting-label">Personal Email</span><input type="email" id="setting-user-email" placeholder="you@email.com" class="setting-input"></div>
                            </div>
                            <button class="btn-primary btn-full" onclick="saveProfile()" style="margin-top:8px">Update Profile</button>
                        </div>
                    </div>

                    <!-- Gym Section -->
                    <div id="settings-section-gym" style="display:none">
                        <button class="text-btn" onclick="hideSettingsSections()" style="padding:0;margin-bottom:16px;display:flex;align-items:center;gap:4px">
                            <span class="material-icons-round">arrow_back</span> Back to Settings
                        </button>
                        <div class="settings-group">
                            <h3>Gym Profile</h3>
                            <div class="setting-item"><span class="material-icons-round">fitness_center</span>
                                <div class="setting-info"><span class="setting-label">Gym Name</span><input type="text" id="setting-gym-name" placeholder="Gym Name" class="setting-input"></div>
                            </div>
                            <div class="setting-item"><span class="material-icons-round">call</span>
                                <div class="setting-info"><span class="setting-label">Gym Contact</span><input type="tel" id="setting-gym-phone" placeholder="Gym Contact" class="setting-input"></div>
                            </div>
                            <div class="setting-item"><span class="material-icons-round">mail</span>
                                <div class="setting-info"><span class="setting-label">Gym Email</span><input type="email" id="setting-gym-email" placeholder="Gym Email" class="setting-input"></div>
                            </div>
                            <div class="setting-item"><span class="material-icons-round">location_on</span>
                                <div class="setting-info"><span class="setting-label">Gym Address</span><input type="text" id="setting-gym-address" placeholder="Gym Address" class="setting-input"></div>
                            </div>
                            <button class="btn-primary btn-full" onclick="saveGymSettings()" style="margin-top:8px">Save Gym Settings</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Member Dashboard Page -->
            <div id="page-member-dashboard" class="page">
                <div class="page-scroll" id="member-dashboard-content"></div>
            </div>

            <!-- Member Attendance Page -->
            <div id="page-member-attendance" class="page">
                <div class="page-scroll" id="member-attendance-content"></div>
            </div>

            <!-- Member Invoices Page -->
            <div id="page-member-invoices" class="page">
                <div class="page-scroll" id="member-invoices-content"></div>
            </div>

            <!-- Member Classes Page -->
            <div id="page-member-classes" class="page">
                <div class="page-scroll" id="member-classes-content"></div>
            </div>

            <!-- Member Memberships Page -->
            <div id="page-member-memberships" class="page">
                <div class="page-scroll" id="member-memberships-content"></div>
            </div>

            <!-- Member BMI Page -->
            <div id="page-member-bmi" class="page">
                <div class="page-scroll">
                    <div class="member-hero">
                        <div class="member-hero-greeting">BMI Calculator</div>
                        <div class="member-hero-sub">Check your Body Mass Index</div>
                    </div>
                    <div class="card" style="padding:20px;margin-bottom:20px">
                        <div class="form-group">
                            <label class="form-label">Weight (kg)</label>
                            <input type="number" id="bmi-weight" class="form-input" placeholder="e.g. 70">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Height (cm)</label>
                            <input type="number" id="bmi-height" class="form-input" placeholder="e.g. 175">
                        </div>
                        <button class="btn-primary btn-full" onclick="calculateBMI()">Calculate BMI</button>

                        <div id="bmi-result-area" style="display:none;margin-top:24px;text-align:center;padding-top:20px;border-top:1px solid var(--border2)">
                            <div style="font-size:14px;color:var(--text3);text-transform:uppercase;letter-spacing:1px">Your BMI</div>
                            <div id="bmi-value" style="font-size:48px;font-weight:900;color:var(--primary);line-height:1.2">0.0</div>
                            <div id="bmi-category" class="member-badge" style="font-size:14px;padding:6px 16px;margin-top:8px">Normal</div>
                            <p id="bmi-msg" style="margin-top:12px;font-size:13px;color:var(--text2);line-height:1.5"></p>
                        </div>
                    </div>
                    <div class="card" style="padding:16px;background:var(--surface2)">
                        <h3 style="font-size:14px;margin-bottom:10px">BMI Categories</h3>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px">
                            <div style="color:var(--blue)">Underweight: < 18.5</div>
                                    <div style="color:var(--green)">Normal: 18.5 – 24.9</div>
                                    <div style="color:var(--orange)">Overweight: 25 – 29.9</div>
                                    <div style="color:var(--red)">Obesity: ≥ 30</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Member Workout Page -->
                <div id="page-member-workout" class="page">
                    <div class="page-scroll" id="member-workout-content"></div>
                </div>

                <!-- Member Health Page -->
                <div id="page-member-health" class="page">
                    <div class="page-scroll">
                        <div class="section-header">
                            <h2>Health Progress</h2><button class="text-btn" onclick="showAddHealthSheet()"><span class="material-icons-round" style="font-size:16px;vertical-align:middle">add</span> Update</button>
                        </div>
                        <div id="member-health-content"></div>
                    </div>
                </div>

                <!-- Member Scan QR Page -->
                <div id="page-member-scan" class="page">
                    <div class="page-scroll">
                        <div class="member-hero">
                            <div class="member-hero-greeting">QR Attendance</div>
                            <div class="member-hero-sub">Scan your gym's QR to check in/out</div>
                        </div>
                        <div class="card" style="padding:16px;overflow:hidden">
                            <div id="reader" style="width:100%;border-radius:12px;overflow:hidden"></div>
                            <div id="scan-feedback" style="margin-top:16px;text-align:center;display:none">
                                <div class="pay-spinner" style="margin:0 auto"></div>
                                <p style="margin-top:10px;font-weight:600">Processing attendance...</p>
                            </div>
                        </div>
                        <div style="margin-top:20px;padding:16px;background:var(--blue-bg);border-radius:12px;color:var(--blue);font-size:13px;display:flex;gap:10px">
                            <span class="material-icons-round">info</span>
                            <span>Make sure you are at the gym gate and the QR code is clearly visible.</span>
                        </div>
                    </div>
                </div>

                <!-- Admin QR Page -->
                <div id="page-admin-qr" class="page">
                    <div class="page-scroll" style="text-align:center">
                        <div class="qr-print-container">
                            <div class="qr-card-design">
                                <div class="qr-header">
                                    <span class="material-icons-round">fitness_center</span>
                                    <div class="qr-header-text">
                                        <h2 id="admin-qr-gym-name-display">GYM NAME</h2>
                                        <p>SCAN TO MARK ATTENDANCE</p>
                                    </div>
                                </div>
                                <div class="qr-code-box">
                                    <div id="gym-qr-wrap"></div>
                                </div>
                                <div class="qr-footer">
                                    <p>Powered by <b>GymXBook</b></p>
                                </div>
                            </div>
                        </div>

                        <div style="display:flex;flex-direction:column;gap:12px;max-width:300px;margin:24px auto 0">
                            <button class="btn-primary btn-full" onclick="downloadGymQR()">
                                <span class="material-icons-round">download</span> Download QR (PNG)
                            </button>
                            <button class="btn-secondary btn-full" onclick="window.print()">
                                <span class="material-icons-round">print</span> Print QR Poster
                            </button>
                        </div>
                    </div>
                </div>

        </main>

        <nav id="bottom-nav" class="bottom-nav">
            <!-- Admin Bottom Nav -->
            <div id="admin-bottom-nav" style="display:contents">
                <button class="nav-item active" onclick="navTap('dashboard')" data-page="dashboard">
                    <span class="nav-icon-wrap"><span class="material-icons-round">space_dashboard</span></span>
                    <span class="nav-label">Home</span>
                </button>
                <button class="nav-item" onclick="navTap('members')" data-page="members">
                    <span class="nav-icon-wrap"><span class="material-icons-round">people</span></span>
                    <span class="nav-label">Members</span>
                </button>
                <button class="nav-item nav-center" onclick="navTap('attendance')" data-page="attendance">
                    <span class="nav-icon-wrap"><span class="material-icons-round">qr_code_scanner</span></span>
                    <span class="nav-label">Check In</span>
                </button>
                <button class="nav-item" onclick="navTap('reports')" data-page="reports">
                    <span class="nav-icon-wrap"><span class="material-icons-round">analytics</span></span>
                    <span class="nav-label">Reports</span>
                </button>
                <button class="nav-item" onclick="navTap('transactions')" data-page="transactions">
                    <span class="nav-icon-wrap"><span class="material-icons-round">swap_horiz</span></span>
                    <span class="nav-label">Txns</span>
                </button>
            </div>

            <!-- Member Bottom Nav -->
            <div id="member-bottom-nav" style="display:none">
                <button class="nav-item active" onclick="navTap('member-dashboard')" data-page="member-dashboard">
                    <span class="nav-icon-wrap"><span class="material-icons-round">space_dashboard</span></span>
                    <span class="nav-label">Home</span>
                </button>
                <button class="nav-item" onclick="navTap('member-attendance')" data-page="member-attendance">
                    <span class="nav-icon-wrap"><span class="material-icons-round">fact_check</span></span>
                    <span class="nav-label">Visits</span>
                </button>
                <button class="nav-item nav-center" onclick="navTap('member-scan')" data-page="member-scan">
                    <span class="nav-icon-wrap"><span class="material-icons-round">qr_code_scanner</span></span>
                    <span class="nav-label">Scan QR</span>
                </button>
                <button class="nav-item" onclick="navTap('member-workout')" data-page="member-workout">
                    <span class="nav-icon-wrap"><span class="material-icons-round">fitness_center</span></span>
                    <span class="nav-label">Workout</span>
                </button>
                <button class="nav-item" onclick="navTap('settings')" data-page="settings">
                    <span class="nav-icon-wrap"><span class="material-icons-round">settings</span></span>
                    <span class="nav-label">Settings</span>
                </button>
            </div>
        </nav>
    </div>

    <!-- Bottom Sheet -->
    <div id="bottom-sheet-overlay" class="sheet-overlay" onclick="closeSheet()"></div>
    <div id="bottom-sheet" class="bottom-sheet">
        <div class="sheet-handle">
            <div class="handle-bar"></div>
        </div>
        <div class="sheet-header">
            <h2 id="sheet-title">Add Member</h2><button class="icon-btn" onclick="closeSheet()"><span class="material-icons-round">close</span></button>
        </div>
        <div class="sheet-content" id="sheet-content"></div>
    </div>

    <!-- Snackbar -->
    <div id="snackbar" class="snackbar"><span id="snackbar-text"></span><button id="snackbar-action" onclick="hideSnackbar()">OK</button></div>

    <!-- Confirm Dialog -->
    <div id="confirm-overlay" class="confirm-overlay" style="display:none">
        <div class="confirm-dialog">
            <span class="material-icons-round confirm-icon" id="confirm-icon">warning</span>
            <h3 id="confirm-title">Are you sure?</h3>
            <p id="confirm-message">This action cannot be undone.</p>
            <div class="confirm-actions"><button class="btn-text" onclick="closeConfirm()">Cancel</button><button class="btn-danger-sm" id="confirm-btn">Delete</button></div>
        </div>
    </div>

    <!-- Payment Modal -->
    <div id="payment-modal" class="payment-modal" style="display:none">
        <div class="payment-modal-bar">
            <span class="payment-modal-title">Secure Payment</span>
            <button class="icon-btn" id="payment-modal-close" onclick="closePaymentModal()" style="display:none"><span class="material-icons-round">close</span></button>
        </div>
        <div class="payment-modal-body">
            <!-- Preparing: Creating order -->
            <div id="pay-state-preparing" class="pay-state">
                <div class="pay-spinner"></div>
                <p class="pay-state-text">Creating payment order...</p>
            </div>
            <!-- Waiting: Payment page opened in Chrome, polling for result -->
            <div id="pay-state-waiting" class="pay-state" style="display:none">
                <div class="pay-wait-icon"><span class="material-icons-round">payment</span></div>
                <h3 class="pay-result-title">Complete Payment</h3>
                <p class="pay-result-sub">Payment page opened in Chrome. Complete your payment there.</p>
                <div class="pay-wait-amount" id="pay-wait-amount">₹0</div>
                <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:12px">
                    <span style="font-size:13px;color:var(--text3)">Time remaining</span>
                    <span id="pay-countdown" style="font-size:18px;font-weight:700;color:var(--orange);font-variant-numeric:tabular-nums">5:00</span>
                </div>
                <div class="pay-wait-dots" style="margin-top:8px">
                    <span>Waiting for payment</span>
                    <span class="pay-dot"></span>
                    <span class="pay-dot"></span>
                    <span class="pay-dot"></span>
                </div>
                <p class="pay-state-text" style="font-size:12px;color:var(--text3);margin-top:12px">Return to this app after paying — we'll detect it automatically</p>
                <button id="pay-cancel-btn" class="btn-text" onclick="cancelMyPayment()" style="margin-top:12px;color:var(--red);font-size:13px">I didn't complete the payment</button>
            </div>
            <!-- Verifying -->
            <div id="pay-state-verifying" class="pay-state" style="display:none">
                <div class="pay-spinner"></div>
                <p class="pay-state-text" style="margin-top:20px">Verifying payment...</p>
                <p class="pay-state-text" style="font-size:12px;color:var(--text3)">Please wait, do not close this page</p>
            </div>
            <!-- Success -->
            <div id="pay-state-success" class="pay-state" style="display:none">
                <div class="pay-success-icon"><span class="material-icons-round">check_circle</span></div>
                <h3 class="pay-result-title">Payment Successful!</h3>
                <p class="pay-result-sub" id="pay-success-sub">Your subscription has been updated</p>
                <button class="btn-primary btn-full" onclick="closePaymentAndRefresh()" style="margin-top:20px">Done</button>
            </div>
            <!-- Failed -->
            <div id="pay-state-failed" class="pay-state" style="display:none">
                <div class="pay-fail-icon"><span class="material-icons-round">cancel</span></div>
                <h3 class="pay-result-title">Payment Failed</h3>
                <p class="pay-result-sub" id="pay-fail-sub">Your payment could not be processed. Please try again.</p>
                <button class="btn-secondary btn-full" onclick="closePaymentModal()" style="margin-top:20px">Close</button>
            </div>
            <!-- Cancelled -->
            <div id="pay-state-cancelled" class="pay-state" style="display:none">
                <div class="pay-cancel-icon"><span class="material-icons-round">warning</span></div>
                <h3 class="pay-result-title">Payment Cancelled</h3>
                <p class="pay-result-sub" id="pay-cancel-sub">You cancelled the payment. No amount was charged.</p>
                <button class="btn-secondary btn-full" onclick="closePaymentModal()" style="margin-top:20px">Close</button>
            </div>
        </div>
    </div>

    <script src="assets/js/app.js"></script>
</body>

</html>