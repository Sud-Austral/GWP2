
// Main App Controller
const App = {
    init: () => {
        if (!Utils.checkAuth()) return;

        App.setupNavigation();
        App.loadUserProfile();

        // Initial View
        App.navigate('dashboard');
    },

    setupNavigation: () => {
        document.querySelectorAll('.nav-item').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const viewName = link.getAttribute('data-view');
                App.navigate(viewName);
            });
        });

        document.getElementById('btnLogout').addEventListener('click', () => {
            localStorage.clear();
            window.location.href = 'index.html';
        });
    },

    navigate: (viewName) => {
        // Update Sidebar
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        document.querySelector(`.nav-item[data-view="${viewName}"]`)?.classList.add('active');

        // Hide all views
        document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');

        // Show target view
        const target = document.getElementById(`view-${viewName}`);
        if (target) {
            target.style.display = 'block';
            console.log(`Navigating to ${viewName}`);

            // Store current view globally for refresh logic
            window.currentView = viewName;

            // Init Module
            switch (viewName) {
                case 'dashboard': StatsModule.init(); break;
                case 'plan': PlanModule.init(); break;
                case 'users': UsersModule.init(); break;
                case 'gantt': GanttModule.init(); break;
                case 'calendar': CalendarModule.init(); break;
                case 'hitos': HitosModule.init(); break;
                case 'observaciones': ObservacionesModule.init(); break;
                case 'documents': DocumentsModule.init(); break;
                case 'repo': RepoModule.init(); break;
            }
        }
    },

    loadUserProfile: () => {
        const u = Utils.getUser();
        if (u) {
            document.getElementById('userNameDisplay').textContent = u.nombre || u.username;
        }
    }
};

// Utils Shared already loaded from utils.js

// API Wrapper
const API = {
    // Should match backend port
    BASE: 'https://186.67.61.251:8002',

    request: async (endpoint, method = 'GET', body = null) => {
        const token = localStorage.getItem('token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        try {
            const res = await fetch(`${API.BASE}${endpoint}`, {
                method, headers, body: body ? JSON.stringify(body) : null
            });

            if (res.status === 401) {
                localStorage.clear();
                window.location.href = 'index.html';
                return;
            }
            return await res.json();
        } catch (e) {
            console.error(e);
            return null;
        }
    },
    get: (url) => API.request(url, 'GET'),
    post: (url, body) => API.request(url, 'POST', body),
    put: (url, body) => API.request(url, 'PUT', body),
    delete: (url) => API.request(url, 'DELETE')
};

// Modal closers
document.querySelectorAll('.close-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        Utils.closeModal(btn.getAttribute('data-modal'));
    });
});

// Init
document.addEventListener('DOMContentLoaded', App.init);
