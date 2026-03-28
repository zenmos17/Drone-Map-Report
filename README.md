# 🚁 แผนที่รายงานโดรน

แอปพลิเคชันเว็บสำหรับการรายงานการมองเห็นโดรน พร้อมแผนที่โต้ตอบ และแผงควบคุมผู้ดูแลระบบ

## 🌟 ฟีเจอร์

- ✅ **ส่วนหน้า (Public)** - แบบฟอร์มส่งรายงานโดรนพร้อมแผนที่
- ✅ **ระบบ Login** - ผู้ดูแลระบบเข้าสู่ได้ด้วย admin/admin
- ✅ **แผนที่โต้ตอบ** - ใช้ Leaflet.js แสดงตำแหน่งรายงาน
- ✅ **รายงานเสริม** - ชื่อผู้แจ้ง, พิกัด, ความสูง, รูปภาพ
- ✅ **แผงควบคุม Admin** - จัดการรายงาน, ลบข้อมูล, เปลี่ยนรหัสผ่าน
- ✅ **ภาษาไทย** - อินเทอร์เฟซทั้งหมดเป็นภาษาไทย
- ✅ **ฐานข้อมูล SQLite** - WAL mode สำหรับการทำงานที่ดี

## 📁 โครงสร้างโปรเจค

```
Drone-Map/
├── frontend/
│   ├── index.html       # หน้าแรก (public)
│   ├── app.js           # Logic หน้าแรก
│   ├── login.html       # หน้าเข้าสู่ระบบ
│   ├── admin.html       # แผงควบคุม Admin
│   └── admin.js         # Logic Admin Dashboard
├── backend/
│   ├── server.js        # Express server
│   ├── db.js            # SQLite logic
│   └── app.db           # ฐานข้อมูล (สร้างอัตโนมัติ)
├── uploads/             # โฟลเดอร์รูปภาพ
├── package.json         # Dependencies
└── README.md            # ไฟล์นี้
```

## 🚀 ติดตั้งและเรียกใช้

### 1. ติดตั้ง Dependencies

```bash
cd c:\Users\MosZerG\Desktop\Drone-Map
npm install
```

### 2. เรียกใช้เซิร์ฟเวอร์

```bash
npm start
```

เซิร์ฟเวอร์จะเริ่มทำงานที่: `http://localhost:5000`

## 📖 วิธีการใช้

### หน้าแรก (Public)
1. เข้าไป `http://localhost:5000`
2. กรอกชื่อ, ตำแหน่ง, รายละเอียด
3. ป้อนพิกัด (หรือคลิกที่แผนที่ หรือใช้ปุ่ม "📍 ตำแหน่งของฉัน")
4. เพิ่มรูป (ไม่บังคับ)
5. คลิก "ส่งรายงาน"

### แผงควบคุม Admin
1. คลิก "🔐 เข้าสู่ระบบผู้ดูแลระบบ" 
2. ชื่อผู้ใช้: **admin**
3. รหัสผ่าน: **admin**
4. เข้าแผงควบคุม:
   - 📊 **แดชบอร์ด** - แสดงแผนที่ทั้งหมด
   - 📋 **รายงาน** - จัดการรายงาน, ลบข้อมูล
   - 🔑 **เปลี่ยนรหัสผ่าน** - อัปเดตรหัส

## 🔐 API Endpoints

### Public
- `GET /` - หน้าแรก
- `POST /report` - ส่งรายงานใหม่
- `GET /reports` - ดึงรายงานทั้งหมด

### Admin (ต้องมี Session ID)
- `POST /login` - เข้าสู่ระบบ
- `POST /logout` - ออกจากระบบ
- `GET /auth-status` - ตรวจสอบสถานะ
- `DELETE /report/:id` - ลบรายงาน
- `POST /change-password` - เปลี่ยนรหัสผ่าน

## 💾 ฐานข้อมูล

### ตาราง `users`
| Column | Type | อธิบาย |
|--------|------|--------|
| id | INTEGER | Primary key |
| username | TEXT | ชื่อผู้ใช้ (unique) |
| password | TEXT | รหัสผ่าน |
| created_at | DATETIME | เวลาสร้าง |

### ตาราง `reports`
| Column | Type | อธิบาย |
|--------|------|--------|
| id | INTEGER | Primary key |
| reporter_name | TEXT | ชื่อผู้แจ้ง |
| location | TEXT | ตำแหน่ง |
| description | TEXT | รายละเอียด |
| latitude | REAL | ละติจูด |
| longitude | REAL | ลองจิจูด |
| altitude | REAL | ความสูง (ม.) |
| image_filename | TEXT | ชื่อไฟล์รูป |
| created_at | DATETIME | เวลาสร้าง |

## 🔧 ตั้งค่า

เส้นจำหน่วย

```javascript
// backend/server.js
const PORT = 5000; // เปลี่ยน port ในที่นี้
```

ค่ามี WLA mode:
```javascript
// backend/db.js
db.run('PRAGMA journal_mode = WAL'); // เปิด WAL mode
```

## 📝 ตัวอย่างข้อมูลเริ่มต้น

ผู้ดูแลระบบ:
- ชื่อผู้ใช้: `admin`
- รหัสผ่าน: `admin`

หมายเหตุ: เปลี่ยนรหัสผ่านเมื่อใช้งานจริง

## 🛠️ เทคโนโลยี

**Frontend:**
- HTML5 / CSS3
- Vanilla JavaScript
- Leaflet.js (แผนที่)

**Backend:**
- Node.js
- Express.js
- SQLite3
- Multer (อัปโหลดไฟล์)

## 📦 Dependencies

```json
{
  "express": "^4.18.2",
  "sqlite3": "^5.1.6",
  "multer": "^1.4.5-lts.1",
  "nodemon": "^2.0.20" (dev)
}
```

## 🚨 Troubleshooting

**Port ใช้งาน:**
- เปลี่ยน PORT ใน `backend/server.js`

**ไม่มี node.exe:**
- ติดตั้ง Node.js จาก https://nodejs.org/

**ข้อผิดพลาด SQLite:**
- ลบไฟล์ `app.db` และ `app.db-*` แล้วเริ่มใหม่

**ไม่สามารถอัปโหลดรูป:**
- ตรวจสอบสิทธิ์เขียนใน `/uploads`

## 📚 ฟीเจอร์ต่อไป (Optional)

- [ ] ระบบ Search/Filter
- [ ] Export ข้อมูลเป็น CSV/PDF
- [ ] Notification (Email/SMS)
- [ ] Multiple users
- [ ] Reporting categories
- [ ] Mobile app
- [ ] Real-time updates

## 📄 License

MIT

## 👨‍💻 ผู้พัฒนา

สร้างด้วย ❤️ สำหรับการตรวจสอบโดรน

---

**ติดต่อ & Support:** ติดต่อผู้ดูแลระบบ

## Project Structure

```
Drone-Map/
├── frontend/
│   ├── index.html        # Main HTML page
│   └── app.js            # Frontend JavaScript
├── backend/
│   ├── server.js         # Express server
│   ├── db.js             # SQLite database logic
│   └── app.db            # SQLite database file (created on first run)
├── package.json          # Node.js dependencies
└── README.md             # This file
```

## Features

- **Simple form**: Submit drone location and description
- **Real-time updates**: Reports display immediately after submission
- **Sorted by time**: Newest reports appear first
- **Responsive design**: Works on desktop and mobile
- **SQLite WAL mode**: Better concurrency and performance
- **Proper error handling**: User-friendly error messages

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

This installs:
- **express**: Web framework
- **sqlite3**: SQLite database driver
- **nodemon** (dev): Auto-restart on file changes

### 2. Run the Application

```bash
npm start
```

Or with auto-reload during development:

```bash
npm run dev
```

The server will start on `http://localhost:3000`

### 3. Open in Browser

Navigate to:
```
http://localhost:3000
```

## API Endpoints

### POST /report
Submit a new drone report

**Request:**
```json
{
  "location": "Central Park",
  "description": "Drone sighting near the lake"
}
```

**Response (201 Created):**
```json
{
  "id": 1,
  "location": "Central Park",
  "description": "Drone sighting near the lake",
  "created_at": "2024-01-15T10:30:00.000Z"
}
```

### GET /reports
Get all drone reports (ordered by newest first)

**Response (200 OK):**
```json
[
  {
    "id": 2,
    "location": "Golden Gate Bridge",
    "description": "Red drone observed",
    "created_at": "2024-01-15T11:00:00.000Z"
  },
  {
    "id": 1,
    "location": "Central Park",
    "description": "Drone sighting near the lake",
    "created_at": "2024-01-15T10:30:00.000Z"
  }
]
```

## Database Schema

### reports Table

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key (auto-increment) |
| location | TEXT | Drone report location |
| description | TEXT | Detailed description |
| created_at | DATETIME | Timestamp (auto-set) |

## Code Notes

### Backend

- **server.js**: Express app with routes and middleware
- **db.js**: SQLite database connection and queries
  - Uses callbacks for async operations
  - Enables WAL mode for better performance
  - Auto-creates tables on startup

### Frontend

- **index.html**: Modern, responsive UI with gradient design
- **app.js**: Client-side form handling and dynamic content
  - Fetches reports and updates display
  - XSS protection with `escapeHtml()`
  - Auto-hiding success/error messages

## Troubleshooting

**Port 3000 already in use:**
- Change `PORT` in `backend/server.js`
- Or kill existing process on port 3000

**Database locked errors:**
- This is fixed by enabling WAL mode in `db.js`
- Delete `app.db-wal` and `app.db-shm` files if issues persist

**Module not found errors:**
- Run `npm install` again
- Ensure `node_modules` folder exists

## Next Steps (Optional Enhancements)

- Add database delete/edit functionality
- Implement user authentication
- Add map visualization with Leaflet.js
- Add file upload for drone images
- Implement search/filter by location
- Add database backup functionality

## License

MIT
