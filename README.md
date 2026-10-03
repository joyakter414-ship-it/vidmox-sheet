# 🎬 VidMox Sheet

> **Mobile-Friendly Client Video Project Tracker** built on **Cloudflare Workers**, **Cloudflare D1** (SQL Database), and **Cloudflare R2** (Object Storage).

Live URL: **[https://vidmox-sheet.joyakter414.workers.dev](https://vidmox-sheet.joyakter414.workers.dev)**

---

## 📱 Features

- **Mobile-First App & Desktop View:** Responsive layout with PWA support (can be added to home screen).
- **Exact Google Sheet Layout:** Recreates the clean spreadsheet look with:
  - Top Client Details (Client Name, Email, Phone Number).
  - Status Summary Badges (Real-time live count).
  - Video Table: **Video Number (1–30+) | Video Title | Status (Interactive Dropdown) | Video Link**.
- **4 Status Colors:**
  - 🟢 **Approved** (`#D9EAD3` / `#274E13`)
  - 🔴 **On Correction** (`#F4CCCC` / `#990000`)
  - 🟡 **On Pending** (`#FFF2CC` / `#7F6000`)
  - ⚪ **Not Assigned** (`#EFEFEF` / `#595959`)
- **Instant Auto-Save:** Edits to titles, status dropdowns, and video links save automatically to Cloudflare R2 with debounced sync.
- **Direct Link Launcher:** Click **Open ↗** on any video row to open the video link in a new tab.

---

## 🔐 Multi-Role Access & Permissions

| Role | Login Identifier | Permissions |
|---|---|---|
| **Admin** | `akterhossainjoy977@gmail.com` | Full system control: Add/edit/remove Project Managers, view all clients across all PMs, edit any sheet. |
| **Project Manager** | `01812345678` (Phone) | Manage assigned clients, create new clients (each gets 30 default video slots), edit client video titles, links, and statuses. |
| **Client** | Email OR Phone | **Read-only access to their own sheet only.** Cannot see other clients or edit fields. |

---

## 🏗️ Architecture

```
                ┌────────────────────────────────────────────────────────┐
                │          Browser / Mobile Phone / PWA Shell            │
                └──────────────────────────┬─────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────┐
│              Cloudflare Worker (vidmox-sheet.joyakter414.workers.dev)  │
│  - Static Asset Serving (/public)                                      │
│  - REST API (/api/login, /api/pms, /api/clients, /api/my-sheet)        │
│  - PBKDF2 Password Hashing & Bearer Session Tokens                     │
└──────────────────┬──────────────────────────────────┬──────────────────┘
                   │                                  │
                   ▼                                  ▼
      ┌─────────────────────────┐        ┌─────────────────────────┐
      │   Cloudflare D1 (SQL)   │        │   Cloudflare R2 Bucket  │
      │     vidmox-sheet-db     │        │       vidmox-sheet      │
      │  - users (admin/pm/cl)  │        │  - sheets/client-<id>.  │
      │  - sessions             │        │    json                 │
      └─────────────────────────┘        └─────────────────────────┘
```

---

## 🚀 Quick Start / Local Development

```bash
# Clone the repository
git clone https://github.com/joyakter414-ship-it/vidmox-sheet.git
cd vidmox-sheet

# Install dependencies
npm install

# Run locally with local D1 & R2
npm run dev

# Deploy to Cloudflare Workers
npm run deploy
```

---

## 🔑 Default Credentials

- **Admin Login:**
  - Email: `akterhossainjoy977@gmail.com`
  - Password: `87654321`
- **Default Project Manager Login:**
  - Phone: `01812345678`
  - Password: `123456`
