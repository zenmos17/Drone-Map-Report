# 🚁 Drone Map Report

ระบบแผนที่รายงานการพบเห็นโดรน

Web-based drone reporting system with an interactive map and admin dashboard.

---

# Update

* Version 1   03/24/2026
* Version 1.1 03/25/2026 
* Version 1.2 03/26/2026 
* Version 1.4 03/28/2026 last

---

# 🇹🇭 ภาษาไทย

## 📌 เกี่ยวกับระบบ

ระบบเว็บสำหรับรายงานการพบเห็นโดรน โดยผู้ใช้สามารถระบุตำแหน่งบนแผนที่และส่งรายงานได้ทันที
ผู้ดูแลระบบสามารถเข้าสู่ระบบเพื่อจัดการข้อมูลรายงานได้ผ่านหน้า Admin

---

## ✨ ฟีเจอร์หลัก

### ผู้ใช้งานทั่วไป

* ฟอร์มรายงานโดรน
* เลือกตำแหน่งจากแผนที่
* ปุ่ม **ตำแหน่งของฉัน**
* ปุ่ม **ล้างพิกัด**
* สลับมุมมอง **แผนที่ / ดาวเทียม**
* โหมดแผนที่เต็มจอ
* กรองรายงานตามช่วงเวลา
* คลิกดูรายละเอียดรายงานได้

### ผู้ดูแลระบบ

* ระบบ Login Admin
* ดูรายการรายงานทั้งหมด
* ลบรายงาน
* เปลี่ยนรหัสผ่านผู้ดูแล

---

## 📁 โครงสร้างโปรเจกต์

```text
Drone-Map/
│
├── frontend/
│   ├── index.html
│   ├── app.js
│   ├── login.html
│   ├── admin.html
│   └── admin.js
│
├── backend/
│   ├── server.js
│   ├── db.js
│   └── app_fresh.db
│
├── uploads/
│
├── package.json
├── run-server.bat
├── run-server.ps1
└── README.md
```

---

## 🧰 ความต้องการระบบ

* Node.js เวอร์ชัน **18 ขึ้นไป**

ดาวน์โหลดได้ที่

https://nodejs.org

---

## 🚀 วิธีติดตั้ง

Clone โปรเจกต์

```bash
git clone https://github.com/zenmos17/Drone-Map.git
```

ติดตั้ง dependencies

```bash
npm install
```

---

## ▶️ วิธีรันเซิร์ฟเวอร์

รันด้วยคำสั่ง

```bash
npm start
```

เซิร์ฟเวอร์จะทำงานที่

```
http://localhost:3333
```

หรือสามารถใช้ไฟล์

Windows

```
run-server.bat
```

PowerShell

```
run-server.ps1
```

---

## 🔐 บัญชี Admin เริ่มต้น

Username

```
admin
```

Password

```
admin
```

⚠️ ควรเปลี่ยนรหัสผ่านหลังจากเข้าสู่ระบบครั้งแรก

---

## 🔐 บัญชี SuperAdmin เริ่มต้น

Username

```
superadmin
```

Password

```
superadmin
```

⚠️ ควรเปลี่ยนรหัสผ่านหลังจากเข้าสู่ระบบครั้งแรก

---

## 🌐 API หลัก

### Public API

เปิดหน้าเว็บไซต์

```
GET /
```

ส่งรายงานโดรน

```
POST /report
```

ดึงรายการรายงาน

```
GET /reports
```

---

### Admin API

เข้าสู่ระบบ

```
POST /login
```

ออกจากระบบ

```
POST /logout
```

ตรวจสอบสถานะ login

```
GET /auth-status
```

ลบรายงาน

```
DELETE /report/:id
```

เปลี่ยนรหัสผ่าน

```
POST /change-password
```

---

## 💾 ฐานข้อมูล

ระบบใช้ฐานข้อมูล

```
SQLite
```

ไฟล์ฐานข้อมูล

```
backend/app_fresh.db
```

ตารางข้อมูล

```
users
reports
```

เปิดใช้งาน **WAL mode** เพื่อรองรับการใช้งานพร้อมกันหลายผู้ใช้

---

## 🛠️ การแก้ปัญหา

### หน้าเว็บไม่อัปเดต

กด

```
Ctrl + F5
```

### Port ถูกใช้งานอยู่

แก้ไขค่า `PORT` ในไฟล์

```
backend/server.js
```

ค่าเริ่มต้นคือ

```
3333
```

### ขาด dependency

รันคำสั่ง

```bash
npm install
```

---

# 🇺🇸 English

## 📌 About

Drone Map Report is a web application for reporting drone sightings.
Users can submit reports with map coordinates while administrators can manage reports through a secure admin dashboard.

---

## ✨ Features

* Public drone report submission
* Interactive map location selection
* GPS "My Location" button
* Map / Satellite view
* Fullscreen map support
* Report filtering by date/time
* Admin dashboard for managing reports
* SQLite database backend

---

## 🚀 Installation

```bash
npm install
```

---

## ▶️ Run Server

```bash
npm start
```

Server URL

```
http://localhost:3333
```

---

## 👨‍💻 Author

Pongsaton Ditkrajan

---

## 📄 License

All Rights Reserved

Copyright (c) 2026  
Pongsaton Ditkrajan (พงศธร ดิษฐกระจันทร์)
