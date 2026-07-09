# 🏋️ GymXBook - Gym Management PWA v1.3

A complete **Progressive Web App** for gym management built with **Core PHP** using your existing Laravel database schema.

## 🔧 v1.3 Changes

1. ✅ **SMTP Email Integration** — Send professional HTML emails via PHPMailer
   - SMTP credentials stored in settings table (per-tenant)
   - Email verification on new gym registration
   - New member notification to gym owner
   - Payment received confirmation to member
   - Invoice created notification to member
   - Welcome email on registration
   - SMTP settings management via API + Settings page
2. ✅ **Brand Rename** — GymPro → GymXBook across all files

## 🔧 v1.2 Changes

1. ✅ **Invoice Member Link** — Click member name in invoices to view member details
2. ✅ **Expense Edit & Delete** — Edit and delete expenses directly from the list
3. ✅ **Network Status Monitoring** — Live offline/online banner, snackbar notifications for connectivity changes
4. ✅ **Subscription Expiry Enforcement** — Warns 7 days before expiry, blocks login when expired, shows overlay for logged-in users
5. ✅ **Membership Delete Protection** — Cannot delete plans with active members
6. ✅ **Change Password** — Change password from settings with current password verification
7. ✅ **Settings from DB** — Gym name, contact, email, address fetched from admin user + settings table
8. ✅ **Member Active/Inactive Toggle** — Replaced hard delete with activate/deactivate toggle
9. ✅ **Smart Renewal Dates** — When renewing active membership, new period starts from current expiry date

## 🔧 v1.1 Changes

1. ✅ **Light Theme UI** — Clean, modern light design with orange accents
2. ✅ **Multi-tenant Fix** — Correct `parent_id` resolution prevents data leaking between gyms
3. ✅ **Renew & Freeze Membership** — Full renew and freeze functionality with freeze log history
4. ✅ **Edit Member Fixed** — Proper form loading, email duplicate check, all fields update correctly
5. ✅ **Memberships from Laravel** — Now also loads plans with `parent_id=0` (global) alongside gym-specific plans
6. ✅ **Modern Sidebar** — Redesigned with icon blocks, section labels, gradient header, close button
7. ✅ **Detailed Reports** — New members, expiring in 7 days, expired, income/expense, plan distribution, attendance chart
8. ✅ **Cookie Login** — "Keep me logged in" stores secure token in cookie (30 days), survives browser close

## 🚀 Features

### Dashboard
- Real-time stats: Members, Trainers, Today's Attendance, Active Memberships
- Monthly Revenue & Expenses overview
- Quick Actions: Add Member, Check In, Add Expense, Classes
- Recent Members list
- Today's Check-ins

### Members Management
- Full CRUD (Create, Read, Update)
- **Active/Inactive Toggle** — Deactivate members instead of deleting
- Search & filter (All / Active / Expired / Inactive)
- Detailed member profile with:
  - Contact info
  - Membership status with expiry dates
  - Fitness goals
  - Attendance history
  - Health records
  - Payment history
  - Assigned trainer
  - Freeze/Unfreeze functionality

### Trainers
- Add, Edit, View, Delete trainers
- Qualification tracking
- Status management

### Attendance
- **Check-in / Check-out** system
- Search member to check in
- Date navigation with stats
- Real-time check-in/check-out status

### Membership Plans
- Create plans (Monthly, Quarterly, Half-Yearly, Yearly)
- Track member count per plan
- Edit plans
- **Delete Protection** — Cannot delete if members are assigned

### Classes
- Add fitness classes with fees
- Class schedules (days & time)
- View class details

### Expenses
- Track expenses by month
- Monthly totals
- **Edit & Delete** expenses
- Add with date, amount, notes

### Invoices
- Create invoices for members
- Track payment status (Unpaid / Partial / Paid)
- Record payments (Cash / UPI / Card / Bank Transfer)
- View invoice details
- **Member Link** — Click member name to view profile

### Lockers
- Visual locker grid (Available / Occupied)
- Assign lockers to members
- Release lockers

### Events
- Schedule gym events
- Status tracking (Scheduled / Ongoing / Completed / Cancelled)

### Products
- Product catalog with pricing & discounts

### Notices
- Post notices for members

### Settings
- **Gym name, phone, email** from DB (admin user + settings table)
- **SMTP Configuration** — Configure email sending per gym
- **Change Password** with current password verification

### Email (SMTP)
- **Email Verification** — Verify email on gym registration
- **Welcome Email** — Sent on new gym account creation
- **New Member Notification** — Sent to gym owner when member added
- **Payment Confirmation** — Sent to member when payment received
- **Invoice Notification** — Sent to member when invoice created
- **Professional HTML templates** — Branded with gym name, gradient header, responsive design

### Network & Subscription
- **Offline Banner** — Red banner when no internet, green notification when back online
- **Subscription Warning** — Yellow banner 7 days before expiry
- **Subscription Lockout** — Blocks login and app access when expired

## 📱 PWA Features
- **Installable** - Add to Home Screen on Android/iOS
- **Offline Support** - Service Worker caching
- **Native Feel** - Bottom navigation, FABs, bottom sheets, snackbars
- **Mobile-Only UI** - Light theme, Material Design 3 inspired
- **No Browser Chrome** - Runs standalone like a native app

## 📂 Project Structure

```
gym-pwa/
├── index.php          # Main HTML shell with all page templates
├── api.php            # All API endpoints (RESTful)
├── config.php         # Database config & helpers
├── database.sql       # Complete database schema
├── manifest.json      # PWA manifest
├── sw.js              # Service Worker
├── .htaccess          # Apache config
├── lib/
│   ├── MailHelper.php # SMTP email helper (PHPMailer)
│   └── phpmailer/     # PHPMailer library
├── assets/
│   ├── css/
│   │   └── style.css  # All styles (mobile-first, light theme)
│   ├── js/
│   │   └── app.js     # Main application JavaScript
│   └── icons/
│       ├── icon-192.png
│       └── icon-512.png
```

## ⚙️ Installation

### 1. Database Setup
```bash
mysql -u root -p < database.sql
```

### 2. Configure Database
Edit `config.php` with your database credentials:
```php
define('DB_HOST', 'localhost');
define('DB_NAME', 'gym_management');
define('DB_USER', 'root');
define('DB_PASS', '');
```

### 3. Configure SMTP (Optional — for email features)
Configure SMTP from the Settings page in the app, or insert directly:
```sql
INSERT INTO settings (name, value, type, parent_id, created_at, updated_at) VALUES
('smtp_host', 'smtp.gmail.com', 'text', YOUR_GYM_ID, NOW(), NOW()),
('smtp_port', '587', 'text', YOUR_GYM_ID, NOW(), NOW()),
('smtp_username', 'your-email@gmail.com', 'text', YOUR_GYM_ID, NOW(), NOW()),
('smtp_password', 'your-app-password', 'text', YOUR_GYM_ID, NOW(), NOW()),
('smtp_encryption', 'tls', 'text', YOUR_GYM_ID, NOW(), NOW()),
('smtp_from_email', 'your-email@gmail.com', 'text', YOUR_GYM_ID, NOW(), NOW()),
('smtp_from_name', 'GymXBook', 'text', YOUR_GYM_ID, NOW(), NOW());
```

### 4. Deploy
Upload all files to your PHP server (Apache/Nginx with PHP 7.4+ and PDO MySQL extension).

### 5. First-Time Setup
1. Open the app in your browser
2. You'll be prompted to create an admin account
3. Fill in your business name, name, email, and password
4. Click "Create Account"
5. You're automatically logged in

### 6. Install as PWA
On Android Chrome, tap "Add to Home Screen" when prompted.

## 🔄 API Endpoints

| Action | Method | Description |
|--------|--------|-------------|
| `login` | POST | Authenticate user (blocks if subscription expired) |
| `logout` | POST | End session |
| `change_password` | POST | Change password |
| `me` | GET | Current user info + subscription status |
| `dashboard` | GET | Dashboard stats |
| `members` | GET/POST | List/Create members |
| `member` | GET/PUT/DELETE | Read/Update/Toggle active |
| `trainers` | GET/POST | List/Create trainers |
| `trainer` | GET/PUT/DELETE | Read/Update/Delete trainer |
| `attendance` | GET/POST | List/Record attendance |
| `attendance_search` | GET | Search members for check-in |
| `memberships` | GET/POST | List/Create plans |
| `membership` | PUT/DELETE | Update/Delete plan (protected) |
| `classes` | GET/POST | List/Create classes |
| `class` | GET/PUT/DELETE | Read/Update/Delete class |
| `expenses` | GET/POST | List/Create expenses |
| `expense` | PUT/DELETE | Update/Delete expense |
| `invoices` | GET/POST | List/Create invoices |
| `invoice` | GET | Invoice details |
| `invoice_payment` | POST | Record payment |
| `lockers` | GET/POST | List/Add lockers |
| `assign_locker` | POST/PUT | Assign/Release locker |
| `events` | GET/POST | List/Create events |
| `event` | DELETE | Delete event |
| `products` | GET/POST | List/Create products |
| `product` | PUT/DELETE | Update/Delete product |
| `notices` | GET/POST | List/Create notices |
| `settings` | GET/POST | Get/Save settings (includes admin info) |
| `smtp_settings` | GET/POST | Get/Save SMTP settings |
| `register` | POST | Initial setup |
| `verify_email` | GET | Verify email via token |
| `renew_membership` | POST | Renew with smart date calculation |
| `freeze_membership` | POST | Freeze with log |
| `unfreeze_membership` | POST | Unfreeze membership |
| `transactions` | GET | Combined income/expense |
| `member_transactions` | GET | Member payment history |
| `reports` | GET | Detailed report data |

## 📧 Email Templates

All emails use professional HTML templates with:
- Branded gradient header with gym name
- Responsive design for all devices
- Clear call-to-action buttons
- Structured information tables
- GymXBook footer branding

### Email Types:
1. **Email Verification** — Sent on registration with verification link
2. **Welcome Email** — Sent on registration with feature overview
3. **New Member Notification** — Sent to gym owner when member added
4. **Payment Received** — Sent to member with payment details & balance
5. **Invoice Created** — Sent to member with itemized breakdown

## 📋 Requirements

- PHP 7.4+ with PDO MySQL extension
- MySQL 5.7+ / MariaDB 10.3+
- Apache/Nginx web server
- Modern mobile browser (Chrome 80+, Safari 14+)
- SMTP server (for email features — optional)
