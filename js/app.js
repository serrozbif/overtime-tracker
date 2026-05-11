/* =============================================
   Main Application Controller
   ============================================= */

const App = {
    deferredInstall: null,
    editingDate: null, // currently editing record's date

    init() {
        this.registerSW();
        this.bindEvents();
        this.loadSettings();
        this.refreshDashboard();
        this.setupInstallPrompt();
        this.checkSyncStatus();
        this.updateReportBtnState();
    },

    /* ── Service Worker ── */
    registerSW() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(() => {});
        }
    },

    /* ── Weekend check for РАПОРТ button ── */
    isTodayWeekend() {
        const d = new Date().getDay();
        return d === 0 || d === 6;
    },

    updateReportBtnState() {
        const btn = document.getElementById('btn-report');
        if (this.isTodayWeekend()) {
            btn.disabled = true;
            btn.classList.add('disabled-weekend');
            document.getElementById('btn-report-sub-text').textContent = 'Вихідний день — недоступно';
        } else {
            btn.disabled = false;
            btn.classList.remove('disabled-weekend');
            document.getElementById('btn-report-sub-text').textContent = 'Внести час за сьогодні';
        }
    },

    /* ── Event Bindings ── */
    bindEvents() {
        // РАПОРТ → show choice
        document.getElementById('btn-report').addEventListener('click', () => this.openChoice());

        // Choice overlay
        document.getElementById('btn-choice-current').addEventListener('click', () => this.handleCurrentTime());
        document.getElementById('btn-choice-manual').addEventListener('click', () => this.handleManual());
        document.getElementById('btn-choice-cancel').addEventListener('click', () => this.closeChoice());
        document.getElementById('report-choice-overlay').addEventListener('click', (e) => {
            if (e.target === document.getElementById('report-choice-overlay')) this.closeChoice();
        });

        // Header buttons
        document.getElementById('btn-settings').addEventListener('click', () => this.openSettings());

        // Modal
        document.getElementById('btn-modal-close').addEventListener('click', () => this.closeReport());
        document.getElementById('btn-cancel').addEventListener('click', () => this.closeReport());
        document.getElementById('btn-save').addEventListener('click', () => this.saveReport());

        // Live preview
        document.getElementById('input-arrival').addEventListener('input', () => this.updatePreview());
        document.getElementById('input-departure').addEventListener('input', () => this.updatePreview());
        document.getElementById('input-date').addEventListener('change', () => this.updatePreview());

        // Settings
        document.getElementById('btn-settings-close').addEventListener('click', () => this.closeSettings());
        document.getElementById('btn-save-settings').addEventListener('click', () => this.saveSettings());
        document.getElementById('btn-export-json').addEventListener('click', () => FileSync.exportJSON());
        document.getElementById('btn-export-csv').addEventListener('click', () => FileSync.exportCSV());
        document.getElementById('btn-import-json').addEventListener('click', () => FileSync.importJSON());
        document.getElementById('input-initial-balance').addEventListener('input', (e) => {
            const val = parseInt(e.target.value) || 0;
            document.getElementById('initial-balance-hint').textContent = '= ' + OvertimeCalc.formatBalance(val);
        });

        // Close overlays on backdrop click
        document.getElementById('modal-report').addEventListener('click', (e) => {
            if (e.target === document.getElementById('modal-report')) this.closeReport();
        });
        document.getElementById('settings-overlay').addEventListener('click', (e) => {
            if (e.target === document.getElementById('settings-overlay')) this.closeSettings();
        });

        // Keyboard Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { this.closeReport(); this.closeSettings(); this.closeChoice(); }
        });
    },

    /* ── Choice Overlay ── */
    openChoice() {
        if (this.isTodayWeekend()) return;

        // Update current time display
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        document.getElementById('choice-current-time').textContent = `${hh}:${mm}`;

        document.getElementById('report-choice-overlay').removeAttribute('hidden');
    },

    closeChoice() {
        document.getElementById('report-choice-overlay').setAttribute('hidden', '');
    },

    /* ── Quick save with current time ── */
    handleCurrentTime() {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const currentTime = `${hh}:${mm}`;
        const today = OvertimeCalc.todayStr();

        // Check if record exists for today
        const existing = Storage.getRecords().find(r => r.date === today);

        // Build record: if exists, keep existing arrival, update departure
        // If not exists, use current time for both arrival and departure
        let arrival = currentTime;
        let departure = currentTime;

        if (existing) {
            // Smart fill: if current time > existing arrival → update departure only
            arrival = existing.arrival || currentTime;
            departure = currentTime;
        }

        this.closeChoice();

        // Open modal pre-filled and read-only for quick confirmation
        this.editingDate = null;
        this.openReport(today, arrival, departure);
    },

    /* ── Manual entry ── */
    handleManual() {
        this.closeChoice();
        this.editingDate = null;
        this.openReport(OvertimeCalc.todayStr());
    },

    /* ── Dashboard ── */
    refreshDashboard() {
        const stats = Storage.getStats();
        const settings = Storage.getSettings();

        // Balance card
        const totalEl = document.getElementById('total-balance');
        totalEl.textContent = OvertimeCalc.formatBalance(stats.total);
        totalEl.className = 'balance-value' + (stats.total < 0 ? ' negative' : '');

        const initHHMM = OvertimeCalc.minutesToHHMM(settings.initialBalance);
        document.getElementById('balance-sub').textContent =
            `початковий баланс ${settings.initialBalance < 0 ? '−' : ''}${initHHMM}`;

        // Stats
        document.getElementById('week-balance').textContent = OvertimeCalc.formatBalance(stats.week);
        document.getElementById('month-balance').textContent = OvertimeCalc.formatBalance(stats.month);
        document.getElementById('records-count').textContent = stats.count;
        document.getElementById('records-badge').textContent = stats.count;

        this.renderRecords();
    },

    renderRecords() {
        const records = Storage.getRecords();
        const settings = Storage.getSettings();
        const tbody = document.getElementById('records-tbody');

        if (records.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6">
                <div class="empty-state">
                    <div class="empty-icon">📝</div>
                    <div>Немає записів. Натисніть РАПОРТ для початку.</div>
                </div></td></tr>`;
            return;
        }

        const balMap = Storage.runningBalance(records, settings.initialBalance);

        tbody.innerHTML = records.map(r => {
            const delta = r.overtimeMinutes || 0;
            const bal = balMap[r.date] || 0;
            const deltaClass = delta > 0 ? 'delta-positive' : delta < 0 ? 'delta-negative' : 'delta-zero';
            const balClass = bal >= 0 ? 'balance-positive' : 'balance-negative';
            const syncClass = r.synced ? 'synced' : '';

            return `<tr>
                <td>${OvertimeCalc.formatDate(r.date)}</td>
                <td>${r.arrival || '—'}</td>
                <td>${r.departure || '—'}</td>
                <td class="${deltaClass}">${OvertimeCalc.formatDelta(delta)}</td>
                <td class="${balClass}">${OvertimeCalc.formatBalance(bal)}</td>
                <td class="row-actions">
                    <span class="sync-dot ${syncClass}" title="${r.synced ? 'Синхронізовано' : 'Не синхронізовано'}"></span>
                    <button class="btn-edit" onclick="App.editRecord('${r.date}')" title="Редагувати">✏️</button>
                    <button class="btn-delete" onclick="App.deleteRecord('${r.date}')" title="Видалити">🗑</button>
                </td>
            </tr>`;
        }).join('');
    },

    /* ── Edit record ── */
    editRecord(date) {
        const record = Storage.getRecords().find(r => r.date === date);
        if (!record) return;
        this.editingDate = date;
        this.openReport(date, record.arrival || '', record.departure || '');
    },

    deleteRecord(date) {
        if (!confirm(`Видалити запис за ${date}?`)) return;
        Storage.deleteRecord(date);
        this.refreshDashboard();
        this.showToast('Запис видалено', 'info');
    },

    /* ── Report Modal ── */
    openReport(dateStr, arrivalVal, departureVal) {
        const dateInput = document.getElementById('input-date');
        dateInput.value = dateStr || OvertimeCalc.todayStr();

        // Determine values
        if (arrivalVal !== undefined) {
            document.getElementById('input-arrival').value = arrivalVal;
            document.getElementById('input-departure').value = departureVal || '';
        } else {
            // Check if record exists for this date
            const existing = Storage.getRecords().find(r => r.date === dateInput.value);
            document.getElementById('input-arrival').value = existing ? (existing.arrival || '') : '';
            document.getElementById('input-departure').value = existing ? (existing.departure || '') : '';
        }

        // Update modal title and save button
        const isEdit = !!this.editingDate;
        document.getElementById('modal-title').textContent = isEdit ? '✏️ Редагувати запис' : '📋 Рапорт';
        document.getElementById('btn-save').textContent = isEdit ? 'Оновити' : 'Зберегти';

        this.updatePreview();
        document.getElementById('modal-report').removeAttribute('hidden');
        document.getElementById('input-arrival').focus();
    },

    closeReport() {
        document.getElementById('modal-report').setAttribute('hidden', '');
        this.editingDate = null;
        document.getElementById('modal-title').textContent = '📋 Рапорт';
        document.getElementById('btn-save').textContent = 'Зберегти';
    },

    updatePreview() {
        const date = document.getElementById('input-date').value;
        const arrival = document.getElementById('input-arrival').value;
        const departure = document.getElementById('input-departure').value;

        // Weekend warning
        const warnEl = document.getElementById('weekend-warning');
        if (date && OvertimeCalc.isWeekend(date)) {
            warnEl.removeAttribute('hidden');
        } else {
            warnEl.setAttribute('hidden', '');
        }

        // Live calculation
        if (!arrival || !departure) {
            document.getElementById('preview-morning').textContent = '—';
            document.getElementById('preview-morning').style.color = '';
            document.getElementById('preview-evening').textContent = '—';
            document.getElementById('preview-evening').style.color = '';
            document.getElementById('preview-total').textContent = '—';
            document.getElementById('preview-total').style.color = '';
            return;
        }

        const { morning, evening, total } = OvertimeCalc.calculate(arrival, departure);
        const fmtSigned = (m) => m === 0 ? '0:00' : OvertimeCalc.formatDelta(m);

        const morningEl = document.getElementById('preview-morning');
        morningEl.textContent = fmtSigned(morning);
        morningEl.style.color = morning > 0 ? 'var(--success)' : morning < 0 ? 'var(--danger)' : 'var(--text2)';

        const eveningEl = document.getElementById('preview-evening');
        eveningEl.textContent = fmtSigned(evening);
        eveningEl.style.color = evening > 0 ? 'var(--success)' : evening < 0 ? 'var(--danger)' : 'var(--text2)';

        const totalEl = document.getElementById('preview-total');
        totalEl.textContent = fmtSigned(total);
        totalEl.style.color = total > 0 ? 'var(--success)' : total < 0 ? 'var(--danger)' : 'var(--text2)';
    },

    saveReport() {
        const date = document.getElementById('input-date').value;
        const arrival = document.getElementById('input-arrival').value;
        const departure = document.getElementById('input-departure').value;

        if (!date || !arrival || !departure) {
            this.showToast('Заповніть всі поля', 'warning'); return;
        }

        const { total } = OvertimeCalc.calculate(arrival, departure);
        Storage.saveRecord({ date, arrival, departure, overtimeMinutes: total });

        const msg = this.editingDate ? 'Запис оновлено ✓' : 'Рапорт збережено ✓';
        this.closeReport();
        this.refreshDashboard();
        this.showToast(msg, 'success');
    },

    /* ── Settings ── */
    openSettings() {
        this.loadSettings();
        document.getElementById('settings-overlay').removeAttribute('hidden');
    },

    closeSettings() {
        document.getElementById('settings-overlay').setAttribute('hidden', '');
    },

    loadSettings() {
        const s = Storage.getSettings();
        document.getElementById('input-initial-balance').value = s.initialBalance;
        document.getElementById('initial-balance-hint').textContent = '= ' + OvertimeCalc.formatBalance(s.initialBalance);
    },

    saveSettings() {
        const s = Storage.getSettings();
        const newBalance = parseInt(document.getElementById('input-initial-balance').value);

        if (isNaN(newBalance)) { this.showToast('Введіть числове значення балансу', 'warning'); return; }

        Storage.saveSettings({ ...s, initialBalance: newBalance });
        this.closeSettings();
        this.refreshDashboard();
        this.showToast('Налаштування збережено ✓', 'success');
    },

    /* ── Toast ── */
    showToast(msg, type = 'info') {
        const container = document.getElementById('toast-container');
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.textContent = msg;
        container.appendChild(el);
        setTimeout(() => el.remove(), 3200);
    },

    /* ── PWA Install ── */
    setupInstallPrompt() {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredInstall = e;
            document.getElementById('install-banner').removeAttribute('hidden');
        });

        document.getElementById('btn-install').addEventListener('click', async () => {
            if (!this.deferredInstall) return;
            this.deferredInstall.prompt();
            const { outcome } = await this.deferredInstall.userChoice;
            if (outcome === 'accepted') {
                document.getElementById('install-banner').setAttribute('hidden', '');
                this.showToast('Додаток встановлено! ✓', 'success');
            }
            this.deferredInstall = null;
        });
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
