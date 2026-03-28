// ============================================
// USER MANAGEMENT FUNCTIONS (Superadmin only)
// ============================================

let allUsers = [];
let currentUserRole = 'admin';

// Update checkAdminAuth to get user role and show/hide user management tab
async function checkAdminAuth() {
  try {
    const response = await fetch('/auth-status', { credentials: 'include' });
    const data = await response.json();

    if (!response.ok || !data.authenticated) {
      window.location.href = '/login.html';
      return false;
    }

    if (data.username) {
      localStorage.setItem('username', data.username);
      const usernameDisplay = document.getElementById('usernameDisplay');
      if (usernameDisplay) usernameDisplay.textContent = data.username;
    }

    // Store user role
    if (data.role) {
      currentUserRole = data.role;
      localStorage.setItem('userRole', data.role);
      
      // Show user management tab for superadmin
      const usersTabBtn = document.getElementById('usersTabBtn');
      if (usersTabBtn && data.role === 'superadmin') {
        usersTabBtn.style.display = 'inline-block';
      }
    }

    return true;
  } catch (error) {
    console.error('Auth check error:', error);
    window.location.href = '/login.html';
    return false;
  }
}

// Load users for superadmin
async function loadUsers() {
  if (currentUserRole !== 'superadmin') {
    return;
  }

  try {
    const response = await fetch('/admin/users', {
      headers: {
        'X-Session-Id': sessionId
      }
    });

    if (!response.ok) {
      throw new Error('ไม่สามารถโหลดข้อมูลผู้ใช้ได้');
    }

    allUsers = await response.json();
    displayUsersTable();
  } catch (error) {
    console.error('Load users error:', error);
    showMessage('usersMessage', 'ไม่สามารถโหลดข้อมูลผู้ใช้ได้', 'error');
  }
}

// Display users in table
function displayUsersTable() {
  const tbody = document.getElementById('usersTableBody');

  if (!allUsers.length) {
    tbody.innerHTML = '<tr style="text-align: center;"><td colspan="5">ไม่พบข้อมูลผู้ใช้</td></tr>';
    return;
  }

  tbody.innerHTML = allUsers.map((user, index) => {
    const formattedDate = formatThaiDateTime(user.created_at);
    const roleText = user.role === 'superadmin' ? 'ผู้ดูแลระบบระดับสูง' : 'ผู้ดูแลระบบ';
    const roleClass = user.role === 'superadmin' ? 'role-superadmin' : 'role-admin';

    // Don't allow deleting the current superadmin user
    const canDelete = !(user.username === 'superadmin' && user.id === 1);

    return `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(user.username)}</td>
        <td><span class="role-badge ${roleClass}">${escapeHtml(roleText)}</span></td>
        <td>${escapeHtml(formattedDate)}</td>
        <td>
          <div class="user-actions">
            <button class="btn btn-sm btn-edit" onclick="openEditUserModal(${user.id}, '${escapeJs(user.username)}', '${escapeJs(user.role)}')">แก้ไข</button>
            <button class="btn btn-sm btn-change-password" onclick="openChangeUserPasswordModal(${user.id}, '${escapeJs(user.username)}')">เปลี่ยนรหัสผ่าน</button>
            ${canDelete ? `<button class="btn btn-sm btn-delete" onclick="deleteUser(${user.id}, '${escapeJs(user.username)}')">ลบ</button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Open create user modal
function openCreateUserModal() {
  document.getElementById('newUsername').value = '';
  document.getElementById('newPassword').value = '';
  document.getElementById('newRole').value = 'admin';
  document.getElementById('createUserError').textContent = '';
  document.getElementById('createUserModal').classList.add('active');
}

// Close create user modal
function closeCreateUserModal() {
  document.getElementById('createUserModal').classList.remove('active');
}

// Create new user
async function createUser() {
  const username = document.getElementById('newUsername').value.trim();
  const password = document.getElementById('newPassword').value;
  const role = document.getElementById('newRole').value;
  const errorEl = document.getElementById('createUserError');

  if (!username || !password) {
    errorEl.textContent = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน';
    return;
  }

  if (password.length < 4) {
    errorEl.textContent = 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร';
    return;
  }

  try {
    const response = await fetch('/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': sessionId
      },
      body: JSON.stringify({ username, password, role })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'ไม่สามารถสร้างผู้ใช้ได้');
    }

    closeCreateUserModal();
    showMessage('usersMessage', 'สร้างผู้ใช้สำเร็จ', 'success');
    loadUsers();
  } catch (error) {
    console.error('Create user error:', error);
    errorEl.textContent = error.message;
  }
}

// Open edit user modal
function openEditUserModal(userId, username, role) {
  document.getElementById('editUserId').value = userId;
  document.getElementById('editUsername').value = username;
  document.getElementById('editRole').value = role;
  document.getElementById('editUserError').textContent = '';
  document.getElementById('editUserModal').classList.add('active');
}

// Close edit user modal
function closeEditUserModal() {
  document.getElementById('editUserModal').classList.remove('active');
}

// Update user role
async function updateUserRole() {
  const userId = document.getElementById('editUserId').value;
  const role = document.getElementById('editRole').value;
  const errorEl = document.getElementById('editUserError');

  try {
    const response = await fetch(`/admin/users/${userId}/role`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': sessionId
      },
      body: JSON.stringify({ role })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'ไม่สามารถอัปเดตบทบาทผู้ใช้ได้');
    }

    closeEditUserModal();
    showMessage('usersMessage', 'อัปเดตบทบาทผู้ใช้สำเร็จ', 'success');
    loadUsers();
  } catch (error) {
    console.error('Update user role error:', error);
    errorEl.textContent = error.message;
  }
}

// Open change user password modal
function openChangeUserPasswordModal(userId, username) {
  document.getElementById('changePasswordUserId').value = userId;
  document.getElementById('changePasswordUsername').value = username;
  document.getElementById('newUserPassword').value = '';
  document.getElementById('confirmNewUserPassword').value = '';
  document.getElementById('changePasswordError').textContent = '';
  document.getElementById('changeUserPasswordModal').classList.add('active');
}

// Close change user password modal
function closeChangeUserPasswordModal() {
  document.getElementById('changeUserPasswordModal').classList.remove('active');
}

// Change user password
async function changeUserPassword() {
  const userId = document.getElementById('changePasswordUserId').value;
  const newPassword = document.getElementById('newUserPassword').value;
  const confirmPassword = document.getElementById('confirmNewUserPassword').value;
  const errorEl = document.getElementById('changePasswordError');

  if (!newPassword || !confirmPassword) {
    errorEl.textContent = 'กรุณากรอกรหัสผ่านใหม่ทั้งสองช่อง';
    return;
  }

  if (newPassword.length < 4) {
    errorEl.textContent = 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร';
    return;
  }

  if (newPassword !== confirmPassword) {
    errorEl.textContent = 'รหัสผ่านไม่ตรงกัน';
    return;
  }

  try {
    const response = await fetch(`/admin/users/${userId}/password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': sessionId
      },
      body: JSON.stringify({ newPassword })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'ไม่สามารถเปลี่ยนรหัสผ่านได้');
    }

    closeChangeUserPasswordModal();
    showMessage('usersMessage', 'เปลี่ยนรหัสผ่านสำเร็จ', 'success');
  } catch (error) {
    console.error('Change user password error:', error);
    errorEl.textContent = error.message;
  }
}

// Delete user
async function deleteUser(userId, username) {
  if (!confirm(`ยืนยันการลบผู้ใช้ "${username}" ?`)) {
    return;
  }

  try {
    const response = await fetch(`/admin/users/${userId}`, {
      method: 'DELETE',
      headers: {
        'X-Session-Id': sessionId
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'ไม่สามารถลบผู้ใช้ได้');
    }

    showMessage('usersMessage', 'ลบผู้ใช้สำเร็จ', 'success');
    loadUsers();
  } catch (error) {
    console.error('Delete user error:', error);
    showMessage('usersMessage', error.message, 'error');
  }
}

// Update deleteReport function to check user role
async function deleteReport(reportId, locationName) {
  if (!confirm(`ยืนยันการลบรายงาน "${locationName}" ?`)) {
    return;
  }

  try {
    const response = await fetch(`/report/${reportId}`, {
      method: 'DELETE',
      headers: {
        'X-Session-Id': sessionId
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'ไม่สามารถลบรายงานได้');
    }

    reportedReportIds.delete(reportId);
    reportedDetailById.delete(reportId);
    highlightedReportIds.delete(reportId);
    showMessage('reportsMessage', 'ลบรายงานสำเร็จ', 'success');
    loadReports();
  } catch (error) {
    console.error('Delete report error:', error);
    showMessage('reportsMessage', error.message, 'error');
  }
}

// Update switchTab to load users when switching to users tab
function switchTab(tabName, evt) {
  document.querySelectorAll('.tab-content').forEach((tab) => {
    tab.classList.remove('active');
  });

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.remove('active');
  });

  document.getElementById(tabName).classList.add('active');

  const clickedButton = evt?.currentTarget || window.event?.target;
  if (clickedButton) {
    clickedButton.classList.add('active');
  }

  // Load users if switching to users tab and user is superadmin
  if (tabName === 'users' && currentUserRole === 'superadmin') {
    loadUsers();
  }
}

// Add event listeners for user management modals
window.addEventListener('click', (e) => {
  const createUserModal = document.getElementById('createUserModal');
  const editUserModal = document.getElementById('editUserModal');
  const changeUserPasswordModal = document.getElementById('changeUserPasswordModal');
  
  if (e.target === createUserModal) {
    closeCreateUserModal();
  }
  if (e.target === editUserModal) {
    closeEditUserModal();
  }
  if (e.target === changeUserPasswordModal) {
    closeChangeUserPasswordModal();
  }
});