# Codebase Evaluation & Technical Assessment Report
**Project**: Staff Fit — Step Count Monitoring System  
**Organization**: Faculty Welfare Club of JKK Muniraja College of Technology  
**Date**: August 28, 2026  

---

## 1. Executive Summary

The **Staff Fit Step Count Monitoring System** is a modern React single-page application (SPA) designed to automate step count collection and attendance management for college faculty. By leveraging client-side Optical Character Recognition (Tesseract.js) combined with custom HTML canvas image binarization, the application minimizes manual data entry errors. The backend relies on Supabase (PostgreSQL) for persistence and ExcelJS for generating administrative reports.

Overall, the codebase is functional, well-structured for rapid prototype deployment, and provides a sleek glassmorphic design. However, there are architectural, security, and maintainability areas that can be improved for long-term scalability.

---

## 2. Architecture & Key Features Evaluation

### 🚀 Key Strengths

1. **Client-Side Preprocessing & OCR Pipeline (`App.jsx` & `extractionLogic.js`)**
   - **Adaptive Image Binarization**: Dynamically calculates average pixel brightness to separate dark-mode smartwatch faces from light-mode phone screenshots.
   - **Proximity-Based Unit Isolation**: Prevents false positive step values by strictly filtering out calorie, minute, and distance units within a 2-token window.
   - **Fuzzy Token Matching**: Uses Levenshtein edit-distance ($\le 2$) to recognize OCR typos (e.g., `stcps`, `sreps`, `stps`).

2. **Reporting & Excel Export (`ExcelJS` & `file-saver`)**
   - Professional print-ready A4 formatting with embedded institutional header graphics (`header.png`).
   - Automated summary counts (Total Staff, Present, Absent, Pending) and department grouping with signature placeholders.

3. **Automated Testing Suite (`Vitest`)**
   - Comprehensive unit test coverage (`tests/extraction.test.js`) verifying fuzzy matching, thousand separators, proximity rules, and edge cases.

---

## 3. Areas for Improvement & Technical Debt

### 🔒 1. Security & Authentication Weaknesses
- **Hardcoded Credentials**: Admin and staff credentials/passwords are stored in plain text within `src/data.js` (`password: "jkkmct"` and `admin/admin`).
- **Exposed API Keys**: `supabaseClient.js` contains hardcoded fallback Supabase credentials. While anon keys are public by design, reliance on client-side hardcoded user lists allows authentication bypass.
- **Lack of Row Level Security (RLS) Enforcement**: All authenticated clients interact directly with `step_records` using public select/insert calls without role validation tokens.

### 🏗️ 2. Architectural & Maintainability Bottlenecks
- **Monolithic `App.jsx`**: The entire UI application (`Navbar`, `Login`, `StaffDashboard`, `AdminDashboard`, `preprocessImage`, `exportToExcelFull`) is housed in a single file (~890 lines).
- **State Coupling**: Component state and Supabase queries are directly embedded in dashboard views rather than isolated into custom React hooks or context providers.

### 🌐 3. Data Integrity & Resilience
- **Offline / Cloud Fallback**: When Supabase API requests fail (e.g., network timeout), the app relies solely on alert messages without local caching or optimistic UI updates.
- **Duplicate Screenshot & Step Count Detection**: Previously, there was no check to prevent staff members from sharing or re-uploading identical screenshots/step counts submitted in previous days.

---

## 4. Key Recommendations & Improvement Roadmap

| Priority | Feature / Refactoring | Description |
| :--- | :--- | :--- |
| **High** | **90-Day Duplicate Step Count Detection** | Cross-reference newly uploaded step counts against records from the past 90 days. Alert admins when duplicate step counts appear across staff members or dates. |
| **High** | **Secure Authentication Migration** | Replace plain-text password arrays in `data.js` with Supabase Auth or hashed credentials. |
| **Medium** | **Component Modularization** | Split `App.jsx` into standalone components (`/components/Navbar.jsx`, `/components/AdminDashboard.jsx`, `/components/StaffDashboard.jsx`, `/services/exportService.js`). |
| **Medium** | **Local Cache & Offline Fallback** | Store submitted entries in `localStorage` when offline and auto-sync upon reconnecting. |
| **Low** | **Image Hash Verification** | Compute SHA-256 or perceptual hash (pHash) of uploaded images to catch re-uploaded screenshots regardless of OCR text extraction. |

---

## 5. Newly Implemented Feature: 90-Day Duplicate Alert System

To directly prevent duplicate submissions and screenshot sharing among staff members, a **90-Day Duplicate Detection & Admin Notification System** has been integrated:

### How It Works:
1. **90-Day Querying**: Upon submission, the system checks all step records uploaded within the preceding 90 days.
2. **Duplicate Matching**: If another staff member (or the same staff member on a different date) submitted an identical step count, the system flags the upload.
3. **Admin Dashboard Notifications**:
   - Displays a real-time **Notification Badge** in the Admin Header.
   - Shows a dedicated **Duplicate Step Count Alerts Panel** detailing:
     - The staff member who uploaded the duplicate.
     - The exact step count and submission timestamp.
     - The original staff member who recorded that exact step count, including date and time.
   - Highlights flagged entries directly in the Admin monitoring table with a `⚠️ Duplicate Step Count` status badge.
