# Staff Fit — Step Count Monitoring System

A high-performance, glassmorphic React web application developed for the **Faculty Welfare Club of JKK Muniraja College of Technology** to track, monitor, and report daily staff fitness activity. The platform uses client-side OCR (Optical Character Recognition) to automatically extract step counts from fitness screenshots and smartwatch photos, and synchronizes with a cloud database and Excel reporting system.

Deployed on **Vercel** with a centralized **Supabase (PostgreSQL)** backend.

---

## 🚀 Key Features

*   **Role-Based Authentication**:
    *   **Staff Portal**: Secure login for **141 registered staff members** across all academic and administrative departments. Staff can submit fitness screenshots, view extracted counts, enter reasons for counts $< 5000$, and track personal historical attendance.
    *   **Admin Dashboard**: Master administrative monitoring console (`admin` / `admin`) providing date-wise namelists, department filtering, sorting (Recents, High-to-Low, Low-to-High), top/bottom performers, and automated duplicate alerts.
*   **High-Accuracy OCR Pipeline**:
    *   **Multi-Pass Adaptive Preprocessing**:
        *   *Pass 1 (Light Theme)*: Auto-detects light backgrounds and applies black-on-white binarization ($< 190$ brightness threshold).
        *   *Pass 2 (Smartwatch & Dark Theme)*: Automatically inverts dark AMOLED/smartwatch displays ($> 65$ brightness) into clean black text on white background, addressing Tesseract's character segmentation limitations on dark screens.
        *   *Pass 3 (Wrist Photo Contrast Boost)*: Real camera photos of smartwatch displays on staff wrists are enhanced using a 1.6x contrast-stretched grayscale filter.
    *   **OCR Character & Digit Repair**: Resolves common optical letter-digit confusions in numeric tokens adjacent to step markers (e.g. `so36` $\rightarrow$ `5036`, `5o31` $\rightarrow$ `5031`, `8i3i` $\rightarrow$ `8131`).
    *   **Glued Unit & Symbol Parser**: Separates tokens joined without spaces (e.g., `5036steps` $\rightarrow$ `5036 steps`, `steps:5036` $\rightarrow$ `steps 5036`).
    *   **Goal Ratio Filtering**: Parses smartwatch goal ratios (e.g., `3500 / 10000`) and prioritizes the current completed count over the daily target.
    *   **Fuzzy Levenshtein Keyword Matching**: Employs edit-distance matching with expanded vocabulary (`steps`, `step`, `staps`, `stes`, `stps`, `slps`, `sleps`, `siers`, `sreps`, `stecs`, `steos`, `stept`, `stepcount`).
    *   **Column Layout Proximity Filtering**: Bounds unit detection (`Cal`, `mi`, `km`, `min`, `bpm`) to $\le 2$ tokens to prevent multi-column crosstalk.
*   **90-Day Duplicate Step Count Detection**:
    *   Flags duplicate step counts submitted by the **same staff member** across different calendar dates within a previous 90-day window.
    *   Employs calendar-date midnight boundaries (`dayDiff > 0 && dayDiff <= 90`), excluding same-day and future-dated records.
    *   Displays admin audit notifications with first and last upload timestamps and day differences.
*   **Unified Institutional Excel Reporting**:
    *   **Single Unified Export**: Single `📊 Export Attendance Report` button in the Admin Dashboard generating a standardized, print-ready A4 workbook.
    *   **Official Layout**: Grouped by academic and administrative departments with college header, Times New Roman typography, and precise column alignments.
    *   **Absent Handling**: Step count and timing cells for non-submitters are **left completely empty/blank**, with remarks marked as **`PENDING`**.
    *   **Bottom Summary & Numbered Pending List**: Automatically calculates `PRESENT <count>`, `ABSENT NIL`, `PENDING <count>`, followed by the numbered defaulter list (`1. <Staff Name> - <Dept>`) and the Principal signature line.
    *   **Secondary Sheet**: Contains a dedicated tabular `'Pending Staff'` worksheet for administrative records.
*   **Performance, Timezone & Offline Resilience**:
    *   **Explicit IST Timezone**: All timestamps and submission dates are generated in `Asia/Kolkata` (`YYYY-MM-DD`, `HH:mm`, `hh:mm:ss AM/PM`).
    *   **Bundle Code-Splitting**: Historical records (`pastRecords.js`, 344 KB) are lazy-loaded on demand, significantly speeding up initial page load on mobile.
    *   **Persistent Tesseract Worker**: Single reusable OCR worker singleton accelerates image recognition by 3x–5x and prevents web worker memory leaks.
    *   **Offline Submission Queue**: Offline submissions are safely stored in `localStorage` (`pending_sync_records`) and automatically synchronized when network connectivity returns.

---

## 🛠️ Tech Stack

*   **Frontend**: React 19, Vite
*   **Styling & Motion**: Vanilla CSS, Glassmorphic UI Tokens, Framer Motion
*   **Icons**: Lucide React
*   **OCR Engine**: Tesseract.js (v7.0.0)
*   **Excel Engine**: ExcelJS, FileSaver
*   **Cloud Database**: Supabase (PostgreSQL)
*   **Deployment**: Vercel
*   **Test Suite**: Vitest (100% pass rate across 29 unit tests)

---

## 📐 System Architecture

```mermaid
graph TD
    A[Staff Uploads Screenshot / Watch Photo] --> B[preprocessImage Canvas Pass]
    B --> B1[Calculate Average Luminance]
    B1 --> B2{Luminance > 127?}
    B2 -- Yes --> B3[Light Mode: Dark Text to Black, Background to White]
    B2 -- No --> B4[Dark Mode: Invert AMOLED Text to Black on White]
    B3 --> C[Tesseract.js OCR Recognition]
    B4 --> C
    C --> D[Text Cleaning & Normalization]
    D --> D1[Glued Unit Separation & Slashes]
    D1 --> D2[Digit-Letter Confusion Repair so36 -> 5036]
    D2 --> E[Tokenization & Proximity Analysis]
    E --> F[extractSteps Algorithm]
    F --> G{Steps Found?}
    G -- No --> H[Fallback: Smartwatch Contrast & Wrist Pass]
    H --> C
    G -- Yes --> I[Display Extracted Count & Target Reason Check]
    I --> J[Submit to Supabase step_records]
```

---

## 👥 Staff Credentials

All **141 staff members** are configured in [`src/data.js`](src/data.js). Reference credentials list is available in [`STAFF_CREDENTIALS.md`](STAFF_CREDENTIALS.md).

| Role | Identifier | Password | Access Level |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `admin` | Full Monitoring Dashboard, Date Selector, Excel Exports |
| **Principal** | `principal` | `jkkmct` | Staff Portal Submission & History |
| **CSE Department** | `cse001` – `cse010` | `jkkmct` | Staff Portal Submission & History |
| **IT Department** | `it001` – `it005` | `jkkmct` | Staff Portal Submission & History |
| **MCA Department** | `mca001` – `mca004` | `jkkmct` | Staff Portal Submission & History |
| **AI & DS Department** | `ad001` – `ad007` | `jkkmct` | Staff Portal Submission & History |
| **Cyber Security** | `cs001` – `cs005` | `jkkmct` | Staff Portal Submission & History |
| **Automobile Department** | `auto001` – `auto005` | `jkkmct` | Staff Portal Submission & History |
| **Civil Department** | `civil001` – `civil005` | `jkkmct` | Staff Portal Submission & History |
| **ECE Department** | `ece001` – `ece010`, `lab001` | `jkkmct` | Staff Portal Submission & History |
| **EEE Department** | `eee001` – `eee007`, `lab002` | `jkkmct` | Staff Portal Submission & History |
| **Mechanical Department** | `mech001` – `mech007` | `jkkmct` | Staff Portal Submission & History |
| **S&H Department** | `s&h001` – `s&h025` | `jkkmct` | Staff Portal Submission & History |
| **COE & Exam Cell** | `coe001` – `coe006`, `ec001` – `ec005` | `jkkmct` | Staff Portal Submission & History |
| **Library, Placement & Admission** | `lib001` – `lib002`, `pc001` – `pc004`, `ac001` – `ac002` | `jkkmct` | Staff Portal Submission & History |
| **Administrative Office & Mess** | `office001` – `office012`, `staff001` | `jkkmct` | Staff Portal Submission & History |
| **MBA, Yoga, PD, NCC, Idea Lab** | `mba001` – `mba003`, `yoga001`, `pd001` – `pd004`, `ncc001`, `idealab001`, `fm001` | `jkkmct` | Staff Portal Submission & History |

---

## 📊 Database Schema & Constraints (`step_records`)

```sql
CREATE TABLE step_records (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  staff_id TEXT NOT NULL,
  name TEXT,
  dept TEXT,
  steps INTEGER NOT NULL,
  date TEXT NOT NULL,
  time TEXT,
  uploaded_time TEXT,
  reason TEXT
);
```

### Applying Database Migration in Supabase SQL Editor
To enforce database-level uniqueness against double submissions and optimize query performance, run the script [`SUPABASE_CONSTRAINT_MIGRATION.sql`](SUPABASE_CONSTRAINT_MIGRATION.sql):
1. **Diagnostic Query**: Checks for any existing duplicate submissions on `(staff_id, date)`.
2. **Remediation**: Retains the highest step count row and deletes accidental duplicates.
3. **Unique Constraint**: Adds `CONSTRAINT unique_staff_date UNIQUE (staff_id, date)`.
4. **Composite Indexes**: Adds indexes for `(staff_id, steps, date)` and `(date DESC)`.

---

## 💻 Local Development & Deployment

### Prerequisites
*   Node.js (v18+)
*   NPM

### Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/Manju1303/Stepcount.git
   cd Stepcount
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure environment variables in `.env` (optional, defaults provided):
   ```env
   VITE_SUPABASE_URL=https://ngtbuuuqbnfumonkitqh.supabase.co
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
4. Run locally:
   ```bash
   npm run dev
   ```

### Running Automated Tests
```bash
npm test
```

### Production Build
```bash
npm run build
```

*Continuous Deployment: Pushing commits to the `main` branch on GitHub triggers an automatic deployment build on **Vercel**.*
