const elements = {
  toggle: document.getElementById('toggle-blocking'),
  statusText: document.getElementById('status-text'),
  count: document.getElementById('stats-count'),
  time: document.getElementById('stats-time'),
  data: document.getElementById('stats-data'),
  progress: document.getElementById('data-progress'),
  logs: document.getElementById('log-container'),
  clearBtn: document.getElementById('btn-clear')
};

const KB_PER_REQUEST = 250; 
const MB_PER_AD = 15;

browser.storage.local.get(['isEnabled', 'blockedCount', 'logs', 'avgBlockTime'], (data) => {
  const isEnabled = data.isEnabled !== false;
  const count = data.blockedCount || 0;
  const avgTime = data.avgBlockTime || 0;
  
  console.log('[Popup] Loaded stats:', { count, avgTime, isEnabled, logsCount: (data.logs || []).length });
  
  elements.toggle.checked = isEnabled;
  updateUIStatus(isEnabled);
  updateStatsUI(count, avgTime);
  renderLogs(data.logs || []);
});

elements.toggle.addEventListener('change', (e) => {
  const isEnabled = e.target.checked;
  updateUIStatus(isEnabled);
  browser.storage.local.set({ isEnabled });
  browser.runtime.sendMessage({ type: 'SET_STATE', isEnabled });
});

elements.clearBtn.addEventListener('click', () => {
  browser.runtime.sendMessage({ type: 'CLEAR_LOGS' });
  elements.logs.innerHTML = '<div class="log-line system">Logs cleared.</div>';
});

function updateUIStatus(active) {
  elements.statusText.textContent = active ? 'ACTIVE' : 'PAUSED';
  elements.statusText.style.color = active ? '#fff' : '#666';
}

function updateStatsUI(count, avgTime = 0) {
  elements.count.textContent = count;
  
  const blockedRequests = count * 3;
  elements.time.textContent = blockedRequests;
  
  elements.data.textContent = avgTime > 0 ? `${avgTime.toFixed(1)} ms` : '0 ms';

  const percentage = Math.min((count / 100) * 100, 100);
  elements.progress.style.width = `${percentage}%`;
}

function renderLogs(logs) {
  elements.logs.innerHTML = '';
  if (!logs || logs.length === 0) {
    elements.logs.innerHTML = '<div class="log-line system">Ready. Waiting for stream...</div>';
    return;
  }
  
  logs.slice().reverse().forEach(msg => {
    addLogLine(msg);
  });
}

function addLogLine(text) {
  const div = document.createElement('div');
  div.className = 'log-line';
  const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: "numeric", minute: "numeric" });
  div.innerHTML = `<span class="log-time">${time}</span> ${text}`;
  elements.logs.prepend(div);
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'UPDATE_STATS') {
    updateStatsUI(msg.count, msg.avgTime || 0);
  }
  if (msg.type === 'NEW_LOG') {
    addLogLine(msg.text);
  }
});