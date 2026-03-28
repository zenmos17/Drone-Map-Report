const loginForm = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const messageDiv = document.getElementById('message');
    const loadingDiv = document.getElementById('loading');

    // จัดการการส่งฟอร์ม
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await login();
    });

    async function login() {
      const username = usernameInput.value.trim();
      const password = passwordInput.value.trim();

      if (!username || !password) {
        showMessage('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน', 'error');
        return;
      }

      loadingDiv.style.display = 'block';

      try {
        const response = await fetch('/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'เข้าสู่ระบบล้มเหลว');
        }

        // บันทึก Session ID ใน localStorage
        localStorage.setItem('username', data.username);

        showMessage('✓ เข้าสู่ระบบสำเร็จ', 'success');
        
        // เปลี่ยนหน้าไปที่ admin หลัง 1 วินาที
        setTimeout(() => {
          window.location.href = '/admin';
        }, 1000);

      } catch (error) {
        console.error('Error:', error);
        showMessage('❌ ' + error.message, 'error');
      } finally {
        loadingDiv.style.display = 'none';
      }
    }

    function showMessage(text, type) {
      messageDiv.textContent = text;
      messageDiv.className = `message ${type}`;
      messageDiv.style.display = 'block';

      if (type === 'error') {
        setTimeout(() => {
          messageDiv.style.display = 'none';
        }, 4000);
      }
    }
