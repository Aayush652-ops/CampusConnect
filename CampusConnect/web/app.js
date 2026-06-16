/**
 * CampusConnect Frontend Core Logic, AI Guide & Form Redirection Engine
 */

document.addEventListener('DOMContentLoaded', function () {
  const API_BASE = 'http://127.0.0.1:3000';
  
  let currentUser = null;
  let token = localStorage.getItem('cc_token');
  
  let opportunities = [];
  let communities = [];
  let notifications = [
    { id: 'notif-1', title: 'TechSprint Open!', text: 'GDG TechSprint registration is now open.', time: '10 min ago', type: 'info' }
  ];
  let liveTimeline = [
    { text: '<strong>Amit Verma</strong> submitted the application form for <em>GDG TechSprint 2026</em>', time: '5 mins ago', type: 'join' },
    { text: '<strong>Neha Sen</strong> joined <em>Fine Arts Association</em>', time: '12 mins ago', type: 'join' }
  ];
  
  let activeCommunityId = null;
  let activeDiscoverTypeFilter = 'all';
  let activeDiscoverTagFilters = [];

  // Redirect and Verification Modal State
  let pendingRegisterOppId = null;

  // AI Chat History State
  let aiChatHistory = [];

  // ================= UTILITY API FETCH WRAPPER =================

  async function apiFetch(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

    if (res.status === 401) {
      logout();
      throw new Error("Unauthorized");
    }

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Something went wrong");
    }
    return data;
  }

  // ================= AUTHENTICATION FLOW =================

  const authOverlay = document.getElementById('auth-screen-overlay');
  const appMainLayout = document.getElementById('app-main-layout');
  const signinTab = document.getElementById('auth-signin-tab');
  const signupTab = document.getElementById('auth-signup-tab');
  const signinForm = document.getElementById('signin-form');
  const signupForm = document.getElementById('signup-form');
  const logoutBtn = document.getElementById('logout-action-btn');

  if (signinTab && signupTab && signinForm && signupForm) {
    signinTab.addEventListener('click', () => {
      signinTab.classList.add('active');
      signupTab.classList.remove('active');
      signinForm.style.display = 'flex';
      signupForm.style.display = 'none';
    });

    signupTab.addEventListener('click', () => {
      signupTab.classList.add('active');
      signinTab.classList.remove('active');
      signupForm.style.display = 'flex';
      signupForm.style.display = 'none';
    });
  }

  if (signinForm) {
    signinForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const usernameOrEmail = document.getElementById('signin-username').value;
      const password = document.getElementById('signin-password').value;
      const errorDiv = document.getElementById('signin-error');

      if (errorDiv) errorDiv.style.display = 'none';

      try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usernameOrEmail, password })
        });
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || "Login failed");
        }

        token = data.token;
        currentUser = data.user;
        localStorage.setItem('cc_token', token);

        showToast('Welcome Back!', `Logged in successfully as ${currentUser.username}`, 'success');
        signinForm.reset();
        await initializeAppSession();

      } catch (err) {
        if (errorDiv) {
          errorDiv.textContent = err.message;
          errorDiv.style.display = 'block';
        }
      }
    });
  }

  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('signup-username').value;
      const email = document.getElementById('signup-email').value;
      const password = document.getElementById('signup-password').value;
      const errorDiv = document.getElementById('signup-error');

      if (errorDiv) errorDiv.style.display = 'none';

      try {
        const res = await fetch(`${API_BASE}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password })
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Registration failed");
        }

        token = data.token;
        currentUser = data.user;
        localStorage.setItem('cc_token', token);

        showToast('Welcome to CampusConnect!', `Your account ${currentUser.username} has been registered.`, 'success');
        signupForm.reset();
        await initializeAppSession();

      } catch (err) {
        if (errorDiv) {
          errorDiv.textContent = err.message;
          errorDiv.style.display = 'block';
        }
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }

  function logout() {
    currentUser = null;
    token = null;
    localStorage.removeItem('cc_token');
    
    if (appMainLayout) appMainLayout.style.display = 'none';
    if (authOverlay) authOverlay.style.display = 'flex';
    
    showToast('Signed Out', 'You have successfully logged out.', 'info');
  }

  async function initializeAppSession() {
    if (authOverlay) authOverlay.style.display = 'none';
    if (appMainLayout) appMainLayout.style.display = 'flex';

    const initials = currentUser.username.charAt(0).toUpperCase();
    const displayName = currentUser.username.charAt(0).toUpperCase() + currentUser.username.slice(1);
    
    document.getElementById('user-avatar-initials').textContent = initials;
    document.getElementById('profile-display-name').textContent = displayName;
    
    document.getElementById('my-profile-avatar-large').textContent = initials;
    document.getElementById('my-profile-name').textContent = displayName;
    document.getElementById('my-profile-email').textContent = currentUser.email;

    // Reset Chatbot history
    aiChatHistory = [];

    await loadDatabaseState();
    
    document.getElementById('nav-dashboard-btn').click();
    renderDashboard();
    renderNotificationsDropdown();
    updateGreeting();
  }

  async function loadDatabaseState() {
    try {
      opportunities = await apiFetch('/api/opportunities');
      communities = await apiFetch('/api/communities');
      
      const res = await apiFetch('/api/auth/me');
      currentUser = res.user;

      const regCount = opportunities.filter(o => o.registered).length;
      const joinedCount = communities.filter(c => c.joined).length;

      let taskState = JSON.parse(localStorage.getItem(`cc_tasks_${currentUser.id}`)) || {
        'join-community': false,
        'register-event': false,
        'admin-sim': false
      };

      taskState['join-community'] = joinedCount > 0;
      taskState['register-event'] = regCount > 0;
      localStorage.setItem(`cc_tasks_${currentUser.id}`, JSON.stringify(taskState));

      updateMetrics();
      updateAIChatContextPanel(regCount, joinedCount);
    } catch (err) {
      console.error("Failed to sync SQLite models:", err);
    }
  }

  async function verifySessionOnLoad() {
    if (token) {
      try {
        const res = await apiFetch('/api/auth/me');
        currentUser = res.user;
        await initializeAppSession();
      } catch (err) {
        logout();
      }
    } else {
      if (appMainLayout) appMainLayout.style.display = 'none';
      if (authOverlay) authOverlay.style.display = 'flex';
      lucide.createIcons();
    }
  }

  // ================= VIEW ROUTING SYSTEM =================

  const navButtons = document.querySelectorAll('.nav-item');
  const viewPanes = document.querySelectorAll('.view-pane');

  navButtons.forEach(btn => {
    btn.addEventListener('click', async function () {
      const targetTab = this.getAttribute('data-tab');
      
      navButtons.forEach(b => b.classList.remove('active'));
      this.classList.add('active');

      viewPanes.forEach(pane => {
        pane.classList.remove('active');
        if (pane.id === `${targetTab}-view`) {
          pane.classList.add('active');
        }
      });

      if (targetTab === 'dashboard') {
        await loadDatabaseState();
        renderDashboard();
      } else if (targetTab === 'discover') {
        await loadDatabaseState();
        renderDiscover();
      } else if (targetTab === 'communities') {
        await loadDatabaseState();
        renderCommunities();
        if (activeCommunityId) {
          selectCommunity(activeCommunityId);
        }
      } else if (targetTab === 'ai-guide') {
        await loadDatabaseState();
        renderAIGuide();
      } else if (targetTab === 'leaderboard') {
        renderLeaderboard();
      } else if (targetTab === 'saved') {
        await loadDatabaseState();
        renderSaved();
      }
    });
  });

  function updateGreeting() {
    const greetingEl = document.getElementById('dynamic-greeting');
    if (!greetingEl || !currentUser) return;
    const hour = new Date().getHours();
    const displayName = currentUser.username.charAt(0).toUpperCase() + currentUser.username.slice(1);
    let text = `Good Morning, ${displayName}!`;
    if (hour >= 12 && hour < 17) {
      text = `Good Afternoon, ${displayName}!`;
    } else if (hour >= 17 || hour < 4) {
      text = `Good Evening, ${displayName}!`;
    }
    greetingEl.textContent = text;
  }

  // ================= RENDER METHODS =================

  function updateMetrics() {
    if (!currentUser) return;

    const statsReg = document.getElementById('stats-registered-events');
    const statsClubs = document.getElementById('stats-joined-clubs');
    const statsSaved = document.getElementById('stats-saved-items');
    const statsXP = document.getElementById('stats-campus-points');
    
    const myEvents = document.getElementById('my-stats-events');
    const myPoints = document.getElementById('my-stats-points');

    const regCount = opportunities.filter(o => o.registered).length;
    const clubCount = communities.filter(c => c.joined).length;
    const saveCount = opportunities.filter(o => o.bookmarked).length;

    if (statsReg) statsReg.textContent = regCount;
    if (statsClubs) statsClubs.textContent = clubCount;
    if (statsSaved) statsSaved.textContent = saveCount;
    if (statsXP) statsXP.textContent = currentUser.xp;
    
    if (myEvents) myEvents.textContent = regCount;
    if (myPoints) myPoints.textContent = currentUser.xp;

    updateProfileChecklist(regCount, clubCount);
  }

  function updateProfileChecklist(regCount, clubCount) {
    if (!currentUser) return;

    const progBar = document.getElementById('checklist-progress-bar');
    const progPct = document.getElementById('checklist-progress-percent');
    
    const taskJoinCheck = document.getElementById('task-join');
    const taskRegCheck = document.getElementById('task-register');
    const taskSimCheck = document.getElementById('task-sim');

    let taskState = JSON.parse(localStorage.getItem(`cc_tasks_${currentUser.id}`)) || {
      'join-community': false,
      'register-event': false,
      'admin-sim': false
    };

    if (clubCount > 0 && !taskState['join-community']) {
      taskState['join-community'] = true;
      localStorage.setItem(`cc_tasks_${currentUser.id}`, JSON.stringify(taskState));
    }
    if (regCount > 0 && !taskState['register-event']) {
      taskState['register-event'] = true;
      localStorage.setItem(`cc_tasks_${currentUser.id}`, JSON.stringify(taskState));
    }

    if (taskJoinCheck) taskJoinCheck.checked = taskState['join-community'];
    if (taskRegCheck) taskRegCheck.checked = taskState['register-event'];
    if (taskSimCheck) taskSimCheck.checked = taskState['admin-sim'];

    const checklistItems = document.querySelectorAll('.checklist-item');
    checklistItems.forEach(item => {
      const type = item.getAttribute('data-task');
      if (taskState[type]) {
        item.classList.add('checked');
      } else {
        item.classList.remove('checked');
      }
    });

    const totalTasks = Object.keys(taskState).length;
    const completedTasks = Object.values(taskState).filter(Boolean).length;
    const percentage = Math.round((completedTasks / totalTasks) * 100);

    if (progBar) progBar.style.width = `${percentage}%`;
    if (progPct) progPct.textContent = `${percentage}%`;
  }

  function completeLocalChecklistTask(taskName, xpAward) {
    if (!currentUser) return;
    let taskState = JSON.parse(localStorage.getItem(`cc_tasks_${currentUser.id}`)) || {
      'join-community': false,
      'register-event': false,
      'admin-sim': false
    };

    if (!taskState[taskName]) {
      taskState[taskName] = true;
      localStorage.setItem(`cc_tasks_${currentUser.id}`, JSON.stringify(taskState));
      showToast(`Goal Completed!`, `Checklist task completed! (+${xpAward} XP)`, 'success');
    }
  }

  function renderDashboard() {
    updateMetrics();

    const feedContainer = document.getElementById('live-timeline-feed');
    if (feedContainer) {
      feedContainer.innerHTML = '';
      liveTimeline.slice().reverse().forEach(item => {
        const div = document.createElement('div');
        div.className = 'activity-item';
        
        let iconHtml = '<i data-lucide="plus-circle"></i>';
        let iconClass = '';
        if (item.type === 'alert') {
          iconHtml = '<i data-lucide="alert-triangle"></i>';
          iconClass = 'icon-alert';
        } else if (item.type === 'join') {
          iconHtml = '<i data-lucide="user-plus"></i>';
          iconClass = 'icon-join';
        } else if (item.type === 'msg') {
          iconHtml = '<i data-lucide="message-square"></i>';
          iconClass = 'icon-msg';
        }

        div.innerHTML = `
          <div class="activity-icon ${iconClass}">
            ${iconHtml}
          </div>
          <div class="activity-content">
            <span class="activity-text">${item.text}</span>
            <span class="activity-time-stamp">${item.time || 'Just now'}</span>
          </div>
        `;
        feedContainer.appendChild(div);
      });
    }

    const recScroller = document.getElementById('recommended-scroller');
    if (recScroller) {
      recScroller.innerHTML = '';
      const recs = opportunities.filter(o => !o.registered).slice(0, 4);
      if (recs.length === 0) {
        recScroller.innerHTML = `<div class="no-results" style="padding: 20px;"><p>No recommendations available.</p></div>`;
      } else {
        recs.forEach(o => {
          const card = createOpportunityCard(o);
          recScroller.appendChild(card);
        });
      }
    }
    
    lucide.createIcons();
  }

  function createOpportunityCard(o) {
    const card = document.createElement('article');
    card.className = 'card-item';
    card.id = `card-${o.id}`;

    const dateStr = new Date(o.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const isBookmarkedClass = o.bookmarked ? 'bookmarked' : '';
    const registerBtnText = o.registered ? 'Registered' : 'Apply Now';
    const registerBtnClass = o.registered ? 'btn-secondary btn-disabled' : 'btn-primary';

    card.innerHTML = `
      <div class="card-top">
        <div class="card-type-row">
          <span class="card-type-badge badge-${o.type}">${o.type}</span>
          <button class="bookmark-toggle-btn ${isBookmarkedClass}" data-id="${o.id}" aria-label="Bookmark this opportunity">
            <i data-lucide="bookmark"></i>
          </button>
        </div>
        <h3 class="card-title click-trigger" data-id="${o.id}">${o.title}</h3>
        <span class="card-organizer"><i data-lucide="users"></i>${o.organizer}</span>
        <div class="card-meta-row">
          <span class="card-meta-item"><i data-lucide="calendar"></i>${dateStr}</span>
          <span class="card-meta-item"><i data-lucide="map-pin"></i>${o.location}</span>
        </div>
      </div>
      <div class="card-bottom">
        <div class="card-tags">
          ${o.tags.slice(0, 2).map(tag => `<span class="tag-label">#${tag}</span>`).join('')}
        </div>
        <button class="btn btn-sm ${registerBtnClass} register-action-btn" data-id="${o.id}" ${o.registered ? 'disabled' : ''}>
          ${registerBtnText}
        </button>
      </div>
    `;

    card.querySelector('.bookmark-toggle-btn').addEventListener('click', async function(e) {
      e.stopPropagation();
      await toggleBookmark(o.id);
    });

    card.querySelector('.register-action-btn').addEventListener('click', async function(e) {
      e.stopPropagation();
      openRegistrationVerifyModal(o.id);
    });

    card.querySelector('.click-trigger').addEventListener('click', () => {
      openOpportunityModal(o.id);
    });

    return card;
  }

  function renderDiscover() {
    const searchVal = document.getElementById('discover-search-input').value.toLowerCase();
    const sortVal = document.getElementById('discover-sort-select').value;
    const gridContainer = document.getElementById('discover-grid-container');

    if (!gridContainer) return;
    gridContainer.innerHTML = '';

    let filtered = opportunities.filter(opp => {
      const matchesSearch = opp.title.toLowerCase().includes(searchVal) ||
                            opp.organizer.toLowerCase().includes(searchVal) ||
                            opp.desc.toLowerCase().includes(searchVal) ||
                            opp.tags.some(tag => tag.toLowerCase().includes(searchVal));

      const matchesType = activeDiscoverTypeFilter === 'all' || opp.type === activeDiscoverTypeFilter;
      const matchesTags = activeDiscoverTagFilters.length === 0 || 
                          activeDiscoverTagFilters.every(tag => opp.tags.includes(tag));

      return matchesSearch && matchesType && matchesTags;
    });

    if (sortVal === 'upcoming') {
      filtered.sort((a, b) => new Date(a.date) - new Date(b.date));
    } else if (sortVal === 'popular') {
      filtered.sort((a, b) => b.registered_count - a.registered_count);
    } else if (sortVal === 'newest') {
      filtered.reverse();
    }

    if (filtered.length === 0) {
      gridContainer.innerHTML = `
        <div class="no-results">
          <i data-lucide="compass"></i>
          <h3>No opportunities match your search</h3>
          <p>Try refining your search keyword or clearing the filters.</p>
        </div>
      `;
    } else {
      filtered.forEach(o => {
        const card = createOpportunityCard(o);
        gridContainer.appendChild(card);
      });
    }

    lucide.createIcons();
  }

  // Hook filters
  const searchInput = document.getElementById('discover-search-input');
  const clearSearchBtn = document.getElementById('clear-search-btn');
  const sortSelect = document.getElementById('discover-sort-select');
  const discoverTypeBtns = document.querySelectorAll('#discover-type-filters button');
  const discoverTagPills = document.querySelectorAll('#discover-tag-filters button');

  if (searchInput) {
    searchInput.addEventListener('input', function() {
      if (this.value.trim() !== '') {
        if (clearSearchBtn) clearSearchBtn.style.display = 'block';
      } else {
        if (clearSearchBtn) clearSearchBtn.style.display = 'none';
      }
      renderDiscover();
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', function() {
      if (searchInput) {
        searchInput.value = '';
        this.style.display = 'none';
        renderDiscover();
      }
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', renderDiscover);
  }

  discoverTypeBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      discoverTypeBtns.forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      activeDiscoverTypeFilter = this.getAttribute('data-filter');
      renderDiscover();
    });
  });

  discoverTagPills.forEach(pill => {
    pill.addEventListener('click', function() {
      const tag = this.getAttribute('data-tag');
      if (activeDiscoverTagFilters.includes(tag)) {
        activeDiscoverTagFilters = activeDiscoverTagFilters.filter(t => t !== tag);
        this.classList.remove('active');
      } else {
        activeDiscoverTagFilters.push(tag);
        this.classList.add('active');
      }
      renderDiscover();
    });
  });

  const promoActionBtn = document.getElementById('promo-action-btn');
  if (promoActionBtn) {
    promoActionBtn.addEventListener('click', async function() {
      openRegistrationVerifyModal('opp-1');
    });
  }

  const viewAllRecsLink = document.getElementById('view-all-recs');
  if (viewAllRecsLink) {
    viewAllRecsLink.addEventListener('click', () => {
      document.getElementById('nav-discover-btn').click();
    });
  }

  // 4. Communities Chat
  function renderCommunities() {
    const listContainer = document.getElementById('communities-list-container');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    communities.forEach(c => {
      const card = document.createElement('div');
      card.className = `community-row-card ${activeCommunityId === c.id ? 'active' : ''}`;
      
      const joinedBadge = c.joined ? `<span class="club-joined-badge">Joined</span>` : '';
      
      card.innerHTML = `
        <div class="club-avatar ${c.avatar_class || ''}">${c.avatar_text}</div>
        <div class="club-info">
          <div class="club-name">${c.name}</div>
          <div class="club-members">
            <i data-lucide="users" style="width:12px; height:12px;"></i>
            <span>${c.members_count} Members</span>
            ${joinedBadge}
          </div>
        </div>
      `;

      card.addEventListener('click', () => {
        selectCommunity(c.id);
      });

      listContainer.appendChild(card);
    });

    lucide.createIcons();
  }

  async function selectCommunity(id) {
    activeCommunityId = id;
    renderCommunities();

    const emptyState = document.getElementById('chat-empty-state');
    const activeState = document.getElementById('chat-active-state');
    const cName = document.getElementById('chat-group-name');
    const cAvatar = document.getElementById('chat-group-avatar');
    const cMembers = document.getElementById('chat-group-members');
    const cJoinToggle = document.getElementById('chat-join-toggle');
    const chatInput = document.getElementById('chat-message-input');
    const chatBtn = document.getElementById('chat-send-btn');

    if (!activeState || !emptyState) return;

    const club = communities.find(c => c.id === id);
    if (!club) return;

    emptyState.style.display = 'none';
    activeState.style.display = 'flex';

    if (cName) cName.textContent = club.name;
    if (cAvatar) {
      cAvatar.textContent = club.avatar_text;
      cAvatar.className = `chat-group-avatar ${club.avatar_class || ''}`;
    }
    if (cMembers) cMembers.textContent = `${club.members_count} Members`;

    if (cJoinToggle) {
      if (club.joined) {
        cJoinToggle.textContent = 'Joined';
        cJoinToggle.className = 'btn btn-secondary btn-sm btn-disabled';
        cJoinToggle.disabled = true;
        
        if (chatInput) {
          chatInput.disabled = false;
          chatInput.placeholder = 'Type your message...';
        }
        if (chatBtn) chatBtn.disabled = false;
      } else {
        cJoinToggle.textContent = 'Join Group';
        cJoinToggle.className = 'btn btn-primary btn-sm';
        cJoinToggle.disabled = false;

        if (chatInput) {
          chatInput.disabled = true;
          chatInput.placeholder = 'Join this group to participate in discussions';
        }
        if (chatBtn) chatBtn.disabled = true;
      }
    }

    try {
      const chats = await apiFetch(`/api/communities/${id}/chat`);
      renderChatMessages(chats);
    } catch (err) {
      console.error(err);
    }
  }

  const joinGroupBtn = document.getElementById('chat-join-toggle');
  if (joinGroupBtn) {
    joinGroupBtn.addEventListener('click', async function() {
      if (!activeCommunityId) return;
      try {
        const res = await apiFetch(`/api/communities/${activeCommunityId}/join`, {
          method: 'POST'
        });
        showToast('Joined Club!', `You joined successfully!`, 'success');
        completeLocalChecklistTask('join-community', 50);
        await loadDatabaseState();
        selectCommunity(activeCommunityId);
      } catch (err) {
        showToast('Error', err.message, 'alert');
      }
    });
  }

  function renderChatMessages(messages) {
    const chatBox = document.getElementById('chat-messages-box');
    if (!chatBox) return;
    chatBox.innerHTML = '';

    messages.forEach(msg => {
      const bubble = document.createElement('div');
      const incomingClass = msg.isOutgoing ? 'msg-outgoing' : 'msg-incoming';
      bubble.className = `chat-bubble ${incomingClass}`;
      
      const senderText = msg.isOutgoing ? 'Me' : msg.sender;
      bubble.innerHTML = `
        <span class="chat-sender-name">${senderText}</span>
        <div class="chat-bubble-body">
          <p>${msg.text}</p>
          <span class="chat-time">${msg.time}</span>
        </div>
      `;
      chatBox.appendChild(bubble);
    });

    chatBox.scrollTop = chatBox.scrollHeight;
  }

  const chatMsgInput = document.getElementById('chat-message-input');
  const chatSendBtn = document.getElementById('chat-send-btn');

  async function sendChatMessage() {
    if (!activeCommunityId || !chatMsgInput) return;
    const text = chatMsgInput.value.trim();
    if (text === '') return;

    try {
      await apiFetch(`/api/communities/${activeCommunityId}/chat`, {
        method: 'POST',
        body: JSON.stringify({ text })
      });

      chatMsgInput.value = '';
      const chats = await apiFetch(`/api/communities/${activeCommunityId}/chat`);
      renderChatMessages(chats);
      
      // bot reply
      setTimeout(async () => {
        const replies = [
          "Hey! Thanks for messaging.",
          "Glad to see you here. Let me know if you want to collaborate!",
          "Stay tuned for club announcements."
        ];
        const rMsg = replies[Math.floor(Math.random() * replies.length)];
        
        // mock inject simulation
        await fetch(`${API_BASE}/api/admin/simulate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'post' })
        });
        
        if (activeCommunityId === clubId) {
          const updated = await apiFetch(`/api/communities/${activeCommunityId}/chat`);
          renderChatMessages(updated);
        }
      }, 1500);

    } catch (err) {
      showToast('Error', err.message, 'alert');
    }
  }

  if (chatSendBtn) chatSendBtn.addEventListener('click', sendChatMessage);
  if (chatMsgInput) {
    chatMsgInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendChatMessage();
    });
  }

  // ================= AI GUIDE CHATBOT logic =================

  const aiMessagesContainer = document.getElementById('ai-chat-messages-box');
  const aiMessageInput = document.getElementById('ai-chat-message-input');
  const aiSendBtn = document.getElementById('ai-chat-send-btn');
  const aiSuggestionsContainer = document.getElementById('ai-prompt-suggestions');

  function renderAIGuide() {
    updateMetrics();

    if (aiChatHistory.length === 0) {
      const displayName = currentUser.username.charAt(0).toUpperCase() + currentUser.username.slice(1);
      aiChatHistory.push({
        sender: 'bot',
        text: `Hi ${displayName}! I am your AI Campus Guide. I've analyzed your profile context. Ask me to recommend a competition, find design internships, or how you can earn XP!`,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      });
      drawAIGuideMessages();
    }
  }

  function updateAIChatContextPanel(regCount, joinedCount) {
    if (!currentUser) return;
    
    const ctxName = document.getElementById('ai-ctx-name');
    const ctxXp = document.getElementById('ai-ctx-xp');
    const ctxReg = document.getElementById('ai-ctx-reg');
    const ctxInterests = document.getElementById('ai-ctx-interests');

    const displayName = currentUser.username.charAt(0).toUpperCase() + currentUser.username.slice(1);

    if (ctxName) ctxName.textContent = displayName;
    if (ctxXp) ctxXp.textContent = `${currentUser.xp} XP`;
    if (ctxReg) ctxReg.textContent = `${regCount} Active RSVPs`;

    if (ctxInterests) {
      ctxInterests.innerHTML = '';
      
      // Calculate dynamic interests tags based on bookmark tags
      let allTags = ['Coding', 'Design'];
      opportunities.forEach(o => {
        if (o.bookmarked || o.registered) {
          o.tags.forEach(tag => {
            if (!allTags.includes(tag)) allTags.push(tag);
          });
        }
      });

      allTags.slice(0, 3).forEach(tag => {
        const span = document.createElement('span');
        span.className = 'tag-label';
        span.textContent = tag;
        ctxInterests.appendChild(span);
      });
    }
  }

  function drawAIGuideMessages() {
    if (!aiMessagesContainer) return;
    aiMessagesContainer.innerHTML = '';

    aiChatHistory.forEach(msg => {
      const bubble = document.createElement('div');
      const isOutgoing = msg.sender === 'user';
      bubble.className = `chat-bubble ${isOutgoing ? 'msg-outgoing' : 'msg-incoming'}`;

      bubble.innerHTML = `
        <span class="chat-sender-name">${isOutgoing ? 'Me' : 'Campus AI Guide'}</span>
        <div class="chat-bubble-body">
          <p>${msg.text}</p>
          ${msg.recommendation ? renderAIRecommendationCard(msg.recommendation) : ''}
          <span class="chat-time">${msg.time}</span>
        </div>
      `;
      
      // Hook internal rec button link
      if (msg.recommendation) {
        const btn = bubble.querySelector('.rec-details-btn');
        if (btn) {
          btn.addEventListener('click', () => {
            openOpportunityModal(msg.recommendation.id);
          });
        }
      }

      aiMessagesContainer.appendChild(bubble);
    });

    aiMessagesContainer.scrollTop = aiMessagesContainer.scrollHeight;
  }

  function renderAIRecommendationCard(opp) {
    const dateStr = new Date(opp.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `
      <div class="ai-recommendation-card">
        <h4>${opp.title}</h4>
        <p>${opp.desc.slice(0, 80)}...</p>
        <div class="rec-meta">
          <span>Organized by ${opp.organizer}</span>
          <button class="action-link rec-details-btn" data-id="${opp.id}">Open Details</button>
        </div>
      </div>
    `;
  }

  async function handleUserAISend(messageText) {
    const text = messageText || aiMessageInput.value.trim();
    if (text === '') return;

    // Append User message
    aiChatHistory.push({
      sender: 'user',
      text: text,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    });
    
    if (aiMessageInput) aiMessageInput.value = '';
    drawAIGuideMessages();

    // Trigger loader state or delay reply
    setTimeout(() => {
      processBotResponse(text.toLowerCase());
    }, 1000);
  }

  function processBotResponse(query) {
    let responseText = "";
    let recOpp = null;

    if (query.includes('contest') || query.includes('competition') || query.includes('compete') || query.includes('hackathon')) {
      // Find competitions
      const comps = opportunities.filter(o => o.type === 'competition' || o.tags.includes('Hackathon'));
      if (comps.length > 0) {
        recOpp = comps[Math.floor(Math.random() * comps.length)];
        responseText = `Based on your profile, I highly recommend the **${recOpp.title}** hosted by ${recOpp.organizer}. It is a perfect fit to test your skills! Below are the details.`;
      } else {
        responseText = "I couldn't find any upcoming active contests in the database right now. Check back soon!";
      }
    } else if (query.includes('internship') || query.includes('job') || query.includes('paid') || query.includes('work')) {
      // Find internships
      const interns = opportunities.filter(o => o.type === 'internship');
      if (interns.length > 0) {
        recOpp = interns[Math.floor(Math.random() * interns.length)];
        responseText = `Here is a matching role: **${recOpp.title}** by ${recOpp.organizer}. It offers valuable hands-on experience! Check it out below.`;
      } else {
        responseText = "No internships are currently listed. Try asking me about campus events or societies!";
      }
    } else if (query.includes('xp') || query.includes('points') || query.includes('rank') || query.includes('leaderboard')) {
      responseText = `To rank higher on the Leaderboard Podium, you need to earn Campus XP. Here is how:
      1. Register and submit forms for events (+50 XP each)
      2. Join campus community clubs (+50 XP each)
      3. Simulate student trials in Admin Hub (+20 XP each)
      Your current score is **${currentUser.xp} XP**. Check your Checklist in the My Space tab!`;
    } else if (query.includes('gdg') || query.includes('google')) {
      const opp = opportunities.find(o => o.id === 'opp-1');
      if (opp) {
        recOpp = opp;
        responseText = `The **Google Developer Groups TechSprint 2026** is the hottest coding sprint on campus. Check out the Devpost form link to register!`;
      }
    } else if (query.includes('hello') || query.includes('hi') || query.includes('hey')) {
      const displayName = currentUser.username.charAt(0).toUpperCase() + currentUser.username.slice(1);
      responseText = `Hello ${displayName}! How can I help you today? You can ask me: 'recommend a contest' or 'find internships'.`;
    } else {
      responseText = "I'm not fully sure about that query, but I'm learning! You can try asking: \n- *'Recommend a contest to participate in'*\n- *'Find paid design internships'*\n- *'How can I earn more XP?'*";
    }

    aiChatHistory.push({
      sender: 'bot',
      text: responseText,
      recommendation: recOpp,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    });

    drawAIGuideMessages();
  }

  if (aiSendBtn) {
    aiSendBtn.addEventListener('click', () => handleUserAISend());
  }
  if (aiMessageInput) {
    aiMessageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleUserAISend();
    });
  }

  // Hook Prompt quick buttons
  if (aiSuggestionsContainer) {
    aiSuggestionsContainer.addEventListener('click', (e) => {
      const pill = e.target.closest('.prompt-pill');
      if (pill) {
        const query = pill.getAttribute('data-query');
        handleUserAISend(query);
      }
    });
  }

  // ================= LEADERBOARD VIEW =================

  async function renderLeaderboard() {
    const podiumBox = document.getElementById('leaderboard-podium');
    const tableBody = document.getElementById('leaderboard-rows');

    if (!podiumBox || !tableBody) return;

    podiumBox.innerHTML = '';
    tableBody.innerHTML = '';

    try {
      const leaderboardList = await apiFetch('/api/leaderboard');
      
      if (leaderboardList.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">No students registered yet.</td></tr>`;
        return;
      }

      const top3 = leaderboardList.slice(0, 3);
      const podiumOrder = [
        { rank: 2, item: top3[1], className: 'podium-rank-2', badgeClass: 'badge-silver-p' },
        { rank: 1, item: top3[0], className: 'podium-rank-1', badgeClass: 'badge-gold-p' },
        { rank: 3, item: top3[2], className: 'podium-rank-3', badgeClass: 'badge-bronze-p' }
      ];

      podiumOrder.forEach(p => {
        if (!p.item) return;
        
        const card = document.createElement('div');
        card.className = `podium-card ${p.className}`;
        
        const userInitials = p.item.username.charAt(0).toUpperCase();
        const crownHtml = p.rank === 1 ? '<i data-lucide="crown" class="podium-crown"></i>' : '';
        const displayName = p.item.username.charAt(0).toUpperCase() + p.item.username.slice(1);

        card.innerHTML = `
          ${crownHtml}
          <div class="podium-avatar">${userInitials}</div>
          <div class="podium-name">${displayName}</div>
          <div class="podium-xp">${p.item.xp} XP</div>
          <div class="podium-rank-badge ${p.badgeClass}">${p.rank}</div>
        `;
        podiumBox.appendChild(card);
      });

      leaderboardList.forEach((student, index) => {
        const row = document.createElement('tr');
        if (currentUser && student.id === currentUser.id) {
          row.className = 'current-user-row';
        }

        const rank = index + 1;
        const initialsAvatar = student.username.charAt(0).toUpperCase();
        const displayName = student.username.charAt(0).toUpperCase() + student.username.slice(1);

        row.innerHTML = `
          <td>
            <div class="rank-number-badge">${rank}</div>
          </td>
          <td>
            <div class="rank-student-wrap">
              <div class="rank-student-avatar">${initialsAvatar}</div>
              <span>${displayName} ${currentUser && student.id === currentUser.id ? '(You)' : ''}</span>
            </div>
          </td>
          <td>${student.regCount} Registrations</td>
          <td>${student.clubCount} Joined Clubs</td>
          <td class="align-right">
            <span class="rank-xp-value">${student.xp} XP</span>
          </td>
        `;
        tableBody.appendChild(row);
      });

      lucide.createIcons();

    } catch (err) {
      console.error(err);
      tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--accent);">Failed to load leaderboard.</td></tr>`;
    }
  }

  // 6. RENDER MY SPACE (SAVED)
  function renderSaved() {
    updateMetrics();

    const subtabs = document.querySelectorAll('.myspace-tab-btn');
    const subviews = document.querySelectorAll('.myspace-subview');

    subtabs.forEach(tab => {
      tab.addEventListener('click', function() {
        subtabs.forEach(t => t.classList.remove('active'));
        this.classList.add('active');

        const subtabName = this.getAttribute('data-subtab');
        subviews.forEach(v => {
          v.classList.remove('active');
          if (v.id === `myspace-${subtabName}-subview`) {
            v.classList.add('active');
          }
        });
      });
    });

    const registeredContainer = document.getElementById('registered-list-container');
    if (registeredContainer) {
      registeredContainer.innerHTML = '';
      const regList = opportunities.filter(o => o.registered);

      if (regList.length === 0) {
        registeredContainer.innerHTML = `
          <div class="no-results">
            <i data-lucide="calendar"></i>
            <h3>You haven't registered for any opportunities yet</h3>
            <p>Go to the Discover tab to register for campus workshops, hackathons, and challenges!</p>
          </div>
        `;
      } else {
        regList.forEach(o => {
          const row = document.createElement('div');
          row.className = 'registered-row-card';
          const dateStr = new Date(o.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          row.innerHTML = `
            <div class="reg-card-details">
              <span class="card-type-badge badge-${o.type}">${o.type}</span>
              <h3>${o.title}</h3>
              <div class="reg-card-meta">
                <span><i data-lucide="users"></i>${o.organizer}</span>
                <span><i data-lucide="calendar"></i>${dateStr}</span>
                <span><i data-lucide="map-pin"></i>${o.location}</span>
              </div>
            </div>
            <div>
              <span class="reg-ticket-badge">RSVP CONFIRMED</span>
            </div>
          `;
          registeredContainer.appendChild(row);
        });
      }
    }

    const bookmarkedContainer = document.getElementById('bookmarked-list-container');
    if (bookmarkedContainer) {
      bookmarkedContainer.innerHTML = '';
      const bookList = opportunities.filter(o => o.bookmarked);

      if (bookList.length === 0) {
        bookmarkedContainer.innerHTML = `
          <div class="no-results" style="width: 100%;">
            <i data-lucide="bookmark"></i>
            <h3>No bookmarked opportunities</h3>
            <p>Save interesting events or internships by tapping the bookmark icon on cards.</p>
          </div>
        `;
      } else {
        bookList.forEach(o => {
          const card = createOpportunityCard(o);
          bookmarkedContainer.appendChild(card);
        });
      }
    }

    lucide.createIcons();
  }

  // ================= REDIRECT FORM VERIFICATION SYSTEM =================

  const verifyModal = document.getElementById('verification-confirm-modal');
  const verifyCancelBtn = document.getElementById('verify-modal-cancel-btn');
  const verifyConfirmBtn = document.getElementById('verify-modal-confirm-btn');

  function openRegistrationVerifyModal(oppId) {
    const opp = opportunities.find(o => o.id === oppId);
    if (!opp) return;

    if (opp.registered) return;

    pendingRegisterOppId = oppId;
    
    // 1. Open external target form URL in a new browser tab
    window.open(opp.application_url, '_blank');

    // 2. Open confirmation pop-up details modal inside the platform
    if (verifyModal) {
      verifyModal.style.display = 'flex';
    }
  }

  if (verifyCancelBtn) {
    verifyCancelBtn.addEventListener('click', () => {
      if (verifyModal) verifyModal.style.display = 'none';
      pendingRegisterOppId = null;
    });
  }

  if (verifyConfirmBtn) {
    verifyConfirmBtn.addEventListener('click', async () => {
      if (!pendingRegisterOppId) return;

      try {
        const res = await apiFetch(`/api/opportunities/${pendingRegisterOppId}/register`, {
          method: 'POST'
        });

        showToast('Registration Successful!', `Your RSVP has been confirmed in the SQLite DB.`, 'success');
        
        notifications.push({
          id: 'notif-' + Date.now(),
          title: 'Registration Verified',
          text: `XP awarded for event registration.`,
          time: 'Just now',
          type: 'success'
        });

        completeLocalChecklistTask('register-event', 50);

        await loadDatabaseState();

        const opp = opportunities.find(o => o.id === pendingRegisterOppId);
        liveTimeline.push({
          text: `<strong>You (Ayush)</strong> submitted the application form for <em>${opp.title}</em>`,
          time: 'Just now',
          type: 'join'
        });

        if (verifyModal) verifyModal.style.display = 'none';
        pendingRegisterOppId = null;

        // Refresh currently active tab
        const activeTabBtn = document.querySelector('.nav-item.active');
        if (activeTabBtn) {
          const tab = activeTabBtn.getAttribute('data-tab');
          if (tab === 'dashboard') renderDashboard();
          else if (tab === 'discover') renderDiscover();
          else if (tab === 'saved') renderSaved();
        }
        renderNotificationsDropdown();

      } catch (err) {
        showToast('Verification Error', err.message, 'alert');
      }
    });
  }

  // ================= TOAST NOTIFICATION ACTIONS =================

  function showToast(title, msg, type = 'info') {
    const toastBox = document.getElementById('toast-container');
    if (!toastBox) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconHtml = '<i data-lucide="info"></i>';
    if (type === 'success') {
      iconHtml = '<i data-lucide="check-circle"></i>';
    } else if (type === 'alert') {
      iconHtml = '<i data-lucide="alert-circle"></i>';
    }

    toast.innerHTML = `
      <div class="toast-icon">${iconHtml}</div>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-msg">${msg}</div>
      </div>
    `;

    toastBox.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => {
      toast.remove();
    }, 5000);
  }

  const notifBtn = document.getElementById('notification-btn');
  const notifDropdown = document.getElementById('notification-dropdown-menu');
  const clearNotifsBtn = document.getElementById('clear-notifications-btn');
  const notifCountEl = document.getElementById('notification-count');

  if (notifBtn && notifDropdown) {
    notifBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      const isVisible = notifDropdown.style.display === 'flex';
      notifDropdown.style.display = isVisible ? 'none' : 'flex';
    });

    document.addEventListener('click', () => {
      notifDropdown.style.display = 'none';
    });
  }

  function renderNotificationsDropdown() {
    const notifContainer = document.getElementById('notification-list-container');
    if (!notifContainer) return;
    notifContainer.innerHTML = '';

    if (notifications.length === 0) {
      if (notifCountEl) notifCountEl.style.display = 'none';
      notifContainer.innerHTML = `<li class="notification-item" style="justify-content: center; padding: 24px; color: var(--text-muted);">No notifications yet</li>`;
      return;
    }

    if (notifCountEl) {
      notifCountEl.style.display = 'flex';
      notifCountEl.textContent = notifications.length;
    }

    notifications.slice().reverse().forEach(n => {
      const li = document.createElement('li');
      li.className = 'notification-item';
      
      let icon = 'bell';
      if (n.type === 'success') icon = 'check-circle';
      if (n.type === 'alert') icon = 'alert-triangle';

      li.innerHTML = `
        <div class="notification-icon-wrap">
          <i data-lucide="${icon}" style="width: 16px; height: 16px;"></i>
        </div>
        <div class="notification-item-content">
          <span class="notification-title"><strong>${n.title}</strong>: ${n.text}</span>
          <span class="notification-time">${n.time}</span>
        </div>
      `;
      notifContainer.appendChild(li);
    });

    lucide.createIcons();
  }

  if (clearNotifsBtn) {
    clearNotifsBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      notifications = [];
      renderNotificationsDropdown();
      showToast('Notifications Cleared', 'Your notification panel is now empty.', 'info');
    });
  }

  // ================= OPPORTUNITIES ACTIONS =================

  async function toggleBookmark(id) {
    try {
      const res = await apiFetch(`/api/opportunities/${id}/bookmark`, {
        method: 'POST'
      });

      if (res.bookmarked) {
        showToast('Bookmarked Opportunity', `Saved to My Space.`, 'success');
      } else {
        showToast('Bookmark Removed', `Removed from saved list.`, 'info');
      }

      await loadDatabaseState();
      
      const activeTabBtn = document.querySelector('.nav-item.active');
      if (activeTabBtn) {
        const tab = activeTabBtn.getAttribute('data-tab');
        if (tab === 'dashboard') renderDashboard();
        else if (tab === 'discover') renderDiscover();
        else if (tab === 'saved') renderSaved();
      }

    } catch (err) {
      showToast('Error', err.message, 'alert');
    }
  }

  // ================= OVERLAY DETAILS MODAL =================

  const modal = document.getElementById('opportunity-modal');
  const modalClose = document.getElementById('modal-close-btn');
  const modalContent = document.getElementById('modal-content-area');

  if (modalClose && modal) {
    modalClose.addEventListener('click', () => {
      modal.style.display = 'none';
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  }

  function openOpportunityModal(id) {
    if (!modal || !modalContent) return;

    const opp = opportunities.find(o => o.id === id);
    if (!opp) return;

    const dateStr = new Date(opp.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const isBookmarkedClass = opp.bookmarked ? 'bookmarked' : '';
    const registerBtnText = opp.registered ? 'Registered' : 'Apply Now';
    const registerBtnClass = opp.registered ? 'btn-secondary btn-disabled' : 'btn-primary';

    modalContent.innerHTML = `
      <span class="card-type-badge badge-${opp.type}" style="display:inline-block; margin-bottom:12px;">${opp.type}</span>
      <h2 class="modal-title">${opp.title}</h2>
      
      <div class="modal-header-meta">
        <span class="card-organizer" style="font-size:0.9rem;"><i data-lucide="users"></i>Organized by ${opp.organizer}</span>
        <span class="card-organizer" style="font-size:0.9rem; color:var(--success);"><i data-lucide="activity"></i>${opp.registered_count} students registered</span>
      </div>

      <div class="modal-desc-box">
        <h3>Description</h3>
        <p style="margin-top: 8px;">${opp.desc}</p>
      </div>

      <div class="modal-info-row">
        <div class="modal-info-item">
          <div class="modal-info-icon"><i data-lucide="calendar"></i></div>
          <div class="modal-info-text">
            <span class="modal-info-label">Date / Deadline</span>
            <span class="modal-info-val">${dateStr}</span>
          </div>
        </div>
        <div class="modal-info-item">
          <div class="modal-info-icon"><i data-lucide="map-pin"></i></div>
          <div class="modal-info-text">
            <span class="modal-info-label">Location</span>
            <span class="modal-info-val">${opp.location}</span>
          </div>
        </div>
      </div>

      <div class="modal-info-row one-col" style="margin-bottom: 24px;">
        <div class="modal-info-item">
          <div class="modal-info-icon"><i data-lucide="external-link"></i></div>
          <div class="modal-info-text">
            <span class="modal-info-label">Official Registration Link</span>
            <span class="modal-info-val"><a href="${opp.application_url}" target="_blank" style="color:var(--primary); text-decoration:underline;">${opp.application_url.slice(0, 50)}...</a></span>
          </div>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn btn-secondary modal-bookmark-btn ${isBookmarkedClass}">
          <i data-lucide="bookmark"></i>
          <span>${opp.bookmarked ? 'Saved' : 'Save opportunity'}</span>
        </button>
        <button class="btn ${registerBtnClass} modal-register-btn" ${opp.registered ? 'disabled' : ''}>
          <i data-lucide="check-square"></i>
          <span>${registerBtnText}</span>
        </button>
      </div>
    `;

    const modalBookBtn = modalContent.querySelector('.modal-bookmark-btn');
    const modalRegBtn = modalContent.querySelector('.modal-register-btn');

    modalBookBtn.addEventListener('click', async function() {
      await toggleBookmark(opp.id);
      openOpportunityModal(opp.id); 
    });

    modalRegBtn.addEventListener('click', function() {
      modal.style.display = 'none'; // hide detail modal
      openRegistrationVerifyModal(opp.id); // open redirect verification
    });

    modal.style.display = 'flex';
    lucide.createIcons();
  }

  // ================= SIMULATOR ENGINE SYNC =================

  function updateActivityBanner(text) {
    const bannerText = document.getElementById('live-banner-text');
    if (bannerText) {
      bannerText.innerHTML = text;
    }
  }

  async function performTickerAction(actionType = null) {
    const actions = ['register', 'post', 'alert'];
    const selectedAction = actionType || actions[Math.floor(Math.random() * actions.length)];

    try {
      const data = await apiFetch('/api/admin/simulate', {
        method: 'POST',
        body: JSON.stringify({ action: selectedAction })
      });

      liveTimeline.push({
        text: data.text,
        time: 'Just now',
        type: selectedAction === 'alert' ? 'alert' : (selectedAction === 'post' ? 'msg' : 'join')
      });

      if (liveTimeline.length > 15) {
        liveTimeline.shift();
      }

      await loadDatabaseState();

      let type = 'info';
      if (selectedAction === 'alert') {
        type = 'alert';
        notifications.push({
          id: 'notif-' + Date.now(),
          title: 'Campus Alert',
          text: data.rawText || 'Urgent announcement published.',
          time: 'Just now',
          type: 'alert'
        });
        renderNotificationsDropdown();
      }
      if (selectedAction === 'register') type = 'success';

      showToast('Campus Update', data.text.replace(/<\/?[^>]+(>|$)/g, ""), type);
      updateActivityBanner(data.text);

      const activeTabBtn = document.querySelector('.nav-item.active');
      if (activeTabBtn) {
        const tab = activeTabBtn.getAttribute('data-tab');
        if (tab === 'dashboard') renderDashboard();
        else if (tab === 'discover') renderDiscover();
        else if (tab === 'communities') {
          renderCommunities();
          if (activeCommunityId) selectCommunity(activeCommunityId);
        }
      }

    } catch (err) {
      console.log("Sim ticker skipped:", err.message);
    }
  }

  setInterval(() => {
    if (currentUser && Math.random() < 0.45) {
      performTickerAction();
    }
  }, 15000);

  // ================= ADMIN SIMULATOR CONTROLS =================

  const adminSimButtons = document.querySelectorAll('.sim-btn');
  const createEventForm = document.getElementById('create-event-form');

  adminSimButtons.forEach(btn => {
    btn.addEventListener('click', async function() {
      const action = this.getAttribute('data-action');
      let type = 'register';
      if (action === 'sim-post') type = 'post';
      if (action === 'sim-event') type = 'alert';

      await performTickerAction(type);
      completeLocalChecklistTask('admin-sim', 20);
    });
  });

  if (createEventForm) {
    createEventForm.addEventListener('submit', async function(e) {
      e.preventDefault();

      const title = document.getElementById('new-title').value;
      const type = document.getElementById('new-type').value;
      const organizer = document.getElementById('new-organizer').value;
      const date = document.getElementById('new-date').value;
      const tagsRaw = document.getElementById('new-tags').value;
      const location = document.getElementById('new-location').value || 'Main Auditorium';
      const desc = document.getElementById('new-desc').value;
      const application_url = document.getElementById('new-url').value;

      const tags = tagsRaw.split(',').map(t => t.trim()).filter(t => t !== '');
      if (tags.length === 0) tags.push('Campus');

      try {
        await apiFetch('/api/opportunities', {
          method: 'POST',
          body: JSON.stringify({ title, type, organizer, date, location, tags, desc, application_url })
        });

        createEventForm.reset();
        showToast('Opportunity Published', `"${title}" has been successfully added to campus SQLite DB.`, 'success');

        await loadDatabaseState();

        setTimeout(() => {
          document.getElementById('nav-discover-btn').click();
          renderDiscover();
        }, 1000);

      } catch (err) {
        showToast('Publish Error', err.message, 'alert');
      }
    });
  }

  verifySessionOnLoad();
});
