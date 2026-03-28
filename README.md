# 🚁 Drone Map Report

ระบบเว็บรายงานการพบเห็นโดรน พร้อมแผนที่แบบโต้ตอบ และหน้าแอดมินแบบเรียลไทม์

---

## อัปเดตเวอร์ชัน

- Version 1.0 (2026-03-24)
- Version 1.1 (2026-03-25)
- Version 1.2 (2026-03-26)
- Version 1.4 (2026-03-28)

---

## เกี่ยวกับระบบ

ผู้ใช้งานสามารถส่งรายงานการพบโดรนผ่านหน้า `index` โดยกรอกตำแหน่ง/รายละเอียด แนบรูป และเลือกพิกัดจากแผนที่หรือปุ่มตำแหน่งปัจจุบันได้

ผู้ดูแลระบบสามารถใช้งานหน้า `admin` เพื่อตรวจสอบรายงานแบบเรียลไทม์ ดูรายละเอียดรายงานบนแผนที่ และจัดการข้อมูลได้

---

## ฟีเจอร์หลัก

### ฝั่งผู้แจ้ง (Index)

- ล็อกอินผู้แจ้งก่อนเข้าใช้งาน
- ส่งรายงานพร้อมพิกัดและรูปภาพหลายรูป
- ปุ่ม `ตำแหน่งของฉัน` พร้อม popup loading
- ปุ่มล้างพิกัด / ล้างรูป
- สลับเลเยอร์แผนที่ `แผนที่` / `ดาวเทียม`
- โหมดแผนที่เต็มจอ

### ฝั่งผู้ดูแล (Admin)

- ระบบล็อกอินผู้ดูแล
- รายงานเรียลไทม์ผ่าน WebSocket
- ตารางรายงาน + ตัวกรองช่วงวันเวลา
- ดูรายละเอียดรายงานใน modal
- จัดการผู้ใช้ (ผ่าน `admin_user_management.js`)
- เสียงแจ้งเตือนรายงานใหม่ (`frontend/sound/alarm/alarm.mp3`)

---

## โครงสร้างโปรเจกต์ (ปัจจุบัน)

```text
Drone-MapV1.4/
|-- backend/
|   |-- db.js
|   `-- server.js
|-- frontend/
|   |-- admin.html
|   |-- index.html
|   |-- login.html
|   |-- reporter-login.html
|   |-- css/
|   |   |-- admin.css
|   |   |-- index.css
|   |   |-- login.css
|   |   `-- reporter-login.css
|   |-- js/
|   |   |-- admin.js
|   |   |-- admin_user_management.js
|   |   |-- index.js
|   |   |-- login.js
|   |   `-- reporter-login.js
|   |-- img/logo/logo.png
|   `-- sound/alarm/alarm.mp3
|-- uploads/
|-- .gitignore
|-- LICENSE
|-- package-lock.json
|-- package.json
|-- README.md
|-- run-server.bat
`-- run-server.ps1
```

---

## ความต้องการระบบ

- Node.js 18+
- npm 9+

---

## การติดตั้งและรัน

```bash
npm install
npm start
```

เซิร์ฟเวอร์เริ่มต้นที่:

```text
http://localhost:3333
```

หรือใช้งานผ่านไฟล์:

- `run-server.bat`
- `run-server.ps1`

---

## บัญชีเริ่มต้น

### Admin

- Username: `admin`
- Password: `admin`

### SuperAdmin

- Username: `superadmin`
- Password: `superadmin`

แนะนำให้เปลี่ยนรหัสผ่านทันทีหลังเข้าใช้งานครั้งแรก

---

## API หลัก

### Public

- `GET /`
- `POST /report`
- `GET /reports`

### Admin/Auth

- `POST /login`
- `POST /logout`
- `GET /auth-status`
- `DELETE /report/:id`
- `POST /change-password`

---

## หมายเหตุ

- โปรเจกต์นี้ใช้ SQLite
- เมื่อย้ายไปเครื่องใหม่ ให้ติดตั้ง dependency ด้วย `npm install` ครั้งเดียว
