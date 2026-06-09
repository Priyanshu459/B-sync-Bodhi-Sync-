const authView = document.getElementById('sync-auth-view');
const dashView = document.getElementById('sync-dashboard-view');
const btnSyncLogin = document.getElementById('btn-sync-login');
const btnSyncRegister = document.getElementById('btn-sync-register');
const inputUsername = document.getElementById('sync-username');
const inputPassword = document.getElementById('sync-password');
const authError = document.getElementById('sync-auth-error');
const userDisplay = document.getElementById('sync-user-display');
const btnSyncPush = document.getElementById('btn-sync-push');
const btnSyncPull = document.getElementById('btn-sync-pull');
const btnSyncLogout = document.getElementById('btn-sync-logout');
const syncStatus = document.getElementById('sync-status');
const btnClose = document.getElementById('btn-close');

let syncToken = localStorage.getItem('syncToken');
let syncUsername = localStorage.getItem('syncUsername');

function updateSyncUI() {
  if (syncToken) {
    authView.classList.add('hidden');
    dashView.classList.remove('hidden');
    userDisplay.textContent = syncUsername;
    syncStatus.textContent = '';
  } else {
    authView.classList.remove('hidden');
    dashView.classList.add('hidden');
    inputUsername.value = '';
    inputPassword.value = '';
    authError.textContent = '';
  }
}

updateSyncUI();

btnClose.addEventListener('click', () => {
  window.api.close();
});

btnSyncRegister.addEventListener('click', async () => {
  const u = inputUsername.value;
  const p = inputPassword.value;
  authError.textContent = 'Registering...';
  const res = await window.api.authRegister(u, p);
  if (res.success) {
    authError.style.color = '#00ff66';
    authError.textContent = 'Registered! You can now log in.';
  } else {
    authError.style.color = '#ff4444';
    authError.textContent = res.error;
  }
});

btnSyncLogin.addEventListener('click', async () => {
  const u = inputUsername.value;
  const p = inputPassword.value;
  authError.textContent = 'Logging in...';
  authError.style.color = '#ffb703';
  const res = await window.api.authLogin(u, p);
  if (res.success) {
    syncToken = res.token;
    syncUsername = res.username;
    localStorage.setItem('syncToken', syncToken);
    localStorage.setItem('syncUsername', syncUsername);
    updateSyncUI();
  } else {
    authError.style.color = '#ff4444';
    authError.textContent = res.error;
  }
});

btnSyncLogout.addEventListener('click', () => {
  syncToken = null;
  syncUsername = null;
  localStorage.removeItem('syncToken');
  localStorage.removeItem('syncUsername');
  updateSyncUI();
});

btnSyncPush.addEventListener('click', async () => {
  syncStatus.style.color = '#ffb703';
  syncStatus.textContent = 'Pushing to cloud...';
  const res = await window.api.syncPush(syncToken);
  if (res.success) {
    syncStatus.style.color = '#00ff66';
    syncStatus.textContent = 'Successfully pushed to cloud!';
  } else {
    syncStatus.style.color = '#ff4444';
    syncStatus.textContent = 'Push failed: ' + res.error;
  }
});

btnSyncPull.addEventListener('click', async () => {
  syncStatus.style.color = '#ffb703';
  syncStatus.textContent = 'Pulling from cloud...';
  const res = await window.api.syncPull(syncToken);
  if (res.success) {
    syncStatus.style.color = '#00ff66';
    syncStatus.textContent = 'Successfully pulled data!';
  } else {
    syncStatus.style.color = '#ff4444';
    syncStatus.textContent = 'Pull failed: ' + res.error;
  }
});
