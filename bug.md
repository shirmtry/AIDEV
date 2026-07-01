# 📋 CHECKLIST TASK – COMPLETE SMART CLASSROOM MONITORING SYSTEM

## 📌 INSTRUCTIONS
- **Priority:** Fix 404 & 429 errors first (Section A).
- Each task specifies the file, exact lines to modify, and a short description.
- After completing each task, test immediately to verify.

---

## 🔴 SECTION A – CRITICAL BUG FIXES (PRIORITY 1)

### Task A1: Add `/api/attendance-notify` endpoint to `server.js`
- **File:** `backend/server.js`
- **Location:** After `/api/behavior` route, before CRUD student routes.
- **What to add:**
  - Route `POST /api/attendance-notify` with `authenticate` and `rateLimit(10, 60000)`.
  - Body expects: `{ studentId, studentName, image }`.
  - Logic: Check today's attendance, if not exists → save with `logAttendance` + `logEvent`, then send photo via `bot.sendPhoto`.
  - Return JSON `{ success: true }`.
- **Reference:** Code provided in previous response.

### Task A2: Increase rate limit for `/api/recognize-multiple`
- **File:** `backend/server.js`
- **Location:** Line `app.post('/api/recognize-multiple', ...)`
- **Change:** `rateLimit(100, 60000)` → `rateLimit(300, 60000)`.
- **Reason:** Prevents 429 errors from frontend sending too many requests.

### Task A3: Fix blink detection spam in `script.js`
- **File:** `frontend/script.js`
- **Location:** Around lines 720-740 (anti‑spoofing section).
- **Changes:**
  - Warning threshold from 5 seconds to 10 seconds.
  - Reset `blinkWarningShown` when a blink occurs.
  - Show warning only once until next blink.
- **Code:** Provided in previous response.

### Task A4: Increase `FRAME_SKIP` to reduce request frequency
- **File:** `frontend/script.js`
- **Location:** Line `const FRAME_SKIP = 5;`
- **Change:** `FRAME_SKIP = 10`.

---

## 🟡 SECTION B – FEATURE COMPLETION (PRIORITY 2)

### Task B1: Integrate Telegram photo sending from frontend
- **File:** `frontend/script.js`
- **Location:** Inside `detectAndRecognize`, after receiving recognition results.
- **What to do:** When a student is recognized for the first time today (check `attendanceSentToday` set), call `fetchWithAuth` to `/api/attendance-notify` with body `{ studentId, studentName, image }` (image is cropped image base64).
- **Note:** Code already exists, just verify endpoint is called correctly.

### Task B2: Complete behavior detection (drowsy, distracted, hand raised)
- **File:** `frontend/script.js`
- **Location:** `detectAttention()` function.
- **Logic to verify:**
  - Drowsy: pitch > 20° AND EAR < 0.25, persists for 1.5s.
  - Distracted: yawRatio < 0.6 OR > 1.4, persists for 2s.
  - Hand raised: uses MediaPipe Hands (if loaded), wrist above forehead + fingers spread, persists for 1s.
- **Check:** `lastHandResults` gets updated from MediaPipe (currently failing). If not, consider disabling hand detection.

### Task B3: Verify IndexedDB caching
- **File:** `frontend/script.js` & `frontend/indexeddb-helper.js`
- **What to do:** Confirm student list is saved to and loaded from IndexedDB correctly. When server is offline, frontend should still display cached student list.

### Task B4: Ensure dashboard functionality
- **File:** `frontend/dashboard.html`, `frontend/dashboard.js`, `backend/server.js`
- **What to do:**
  - Dashboard displays correct stats, emotion chart, attendance tables.
  - "Export CSV" button calls `/api/report/csv`.
  - "Send Telegram Report" button calls `/api/send-report`.

---

## 🟢 SECTION C – TESTING & OPTIMIZATION (PRIORITY 3)

### Task C1: Full system test
- **Description:** Run system with real camera, verify:
  - Students are recognized and names displayed.
  - First attendance of the day → Telegram receives photo + info.
  - Attendance saved in SQLite (check database).
  - No 404 or 429 errors.
  - Blink detection doesn't spam.

### Task C2: Frontend performance optimization
- **Description:** Reduce CPU/GPU load:
  - Reduce processed frame size if needed.
  - Increase `FRAME_SKIP` further if still overloaded.
  - Limit number of faces detected per frame (if many).

### Task C3: Improve logging and debugging
- **File:** `backend/server.js`
- **What to do:** Add more detailed logs for important events (attendance, Telegram send, behavior alerts) for easier tracking.

### Task C4: (Optional) Fix MediaPipe Hands loading
- **Description:** Try different version of MediaPipe Hands or load from alternative source to avoid Tracking Prevention. If still failing, consider commenting out hand‑raised behavior detection.

---

## ✅ IMPORTANT NOTES
- **After each task:** Commit code and test immediately to avoid cascading issues.
- **Priority order:** A1 → A2 → A3 → A4 → B1 → B2 → B3 → B4 → C.
- **If stuck:** Check browser console and server logs to find root cause.

---

*This checklist is designed for Claude Code Web to systematically implement fixes step by step.*