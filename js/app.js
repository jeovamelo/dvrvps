/**
 * Aplicação Principal Monitor CFTV - Web & Mobile Touch
 * Otimizado para iPhone (Safari / PWA), Android e Navegadores Desktop
 * Suporte a Grade Dinâmica (1x1, 2x2, 3x3, 4x4), Filtro de Câmeras Ativas e Medidor de Banda em Tempo Real
 */
class DvrTvApp {
    constructor() {
        this.dvr = new DvrApiClient({
            ip: localStorage.getItem('dvr_ip') || '192.168.100.2',
            httpPort: parseInt(localStorage.getItem('dvr_http_port') || '80', 10),
            rtspPort: parseInt(localStorage.getItem('dvr_rtsp_port') || '554', 10),
            username: localStorage.getItem('dvr_user') || 'admin',
            password: localStorage.getItem('dvr_pwd') || 'jr130182'
        });

        this.channels = [];
        this.activeChannelsOnly = (localStorage.getItem('dvr_filter_active') === 'true');
        this.currentLayout = localStorage.getItem('dvr_layout') || '4x4';
        this.refreshInterval = parseInt(localStorage.getItem('dvr_refresh_interval') || '2000', 10);

        var savedQuality = localStorage.getItem('dvr_default_quality') || 'fluido';
        this.streamQuality = (savedQuality === 'hd') ? 1 : 2;

        var savedOrder = localStorage.getItem('dvr_camera_order');
        try {
            this.customOrder = savedOrder ? JSON.parse(savedOrder) : null;
        } catch (e) {
            this.customOrder = null;
        }
        this.isDraggingCard = false;
        this.draggedChannelId = null;
        this.touchDragActiveCard = null; // 1 = HD, 2 = Fluido

        this.focusedIndex = 0;
        this.isFullScreen = false;
        this.fullScreenChannel = null;
        this.isModalOpen = false;

        this.gridRefreshTimer = null;
        this.player = null;

        this.init();
    }

    async init() {
        console.log('[App] Inicializando Monitor CFTV Web/Mobile...');
        this.startClock();
        this.setupDOM();
        this.setupKeyboard();

        var playerContainer = document.getElementById('fullscreen-player-container');
        this.player = new TvStreamPlayer(playerContainer, this.dvr);

        this.setupAuth();
        await this.checkAuthStatus();
    }

    async checkAuthStatus() {
        try {
            var res = await fetch('/api/auth-status');
            var data = await res.json();
            if (data.authenticated) {
                this.hideLoginScreen();
                await this.connectDvr();
                return;
            }
        } catch (e) {}
        this.showLoginScreen();
    }

    setupAuth() {
        var self = this;
        var form = document.getElementById('site-login-form');
        var errEl = document.getElementById('login-error-msg');
        var btnToggle = document.getElementById('btn-toggle-site-pwd');
        var pwdInput = document.getElementById('site-password');
        var btnLogout = document.getElementById('btn-logout');

        if (btnToggle && pwdInput) {
            btnToggle.addEventListener('click', function(e) {
                e.preventDefault();
                if (pwdInput.type === 'password') {
                    pwdInput.type = 'text';
                    btnToggle.textContent = '🔒';
                } else {
                    pwdInput.type = 'password';
                    btnToggle.textContent = '👁️';
                }
            });
        }

        if (btnLogout) {
            btnLogout.addEventListener('click', async function() {
                try {
                    await fetch('/api/logout', { method: 'POST' });
                } catch(e) {}
                sessionStorage.removeItem('dvr_token');
                window.location.reload();
            });
        }

        if (form) {
            form.addEventListener('submit', async function(e) {
                e.preventDefault();
                var user = (document.getElementById('site-username').value || '').trim();
                var pass = document.getElementById('site-password').value || '';
                var btnSubmit = document.getElementById('btn-site-login');

                if (errEl) errEl.style.display = 'none';
                if (btnSubmit) btnSubmit.disabled = true;

                try {
                    var res = await fetch('/api/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: user, password: pass })
                    });
                    var data = await res.json();
                    if (res.ok && data.success) {
                        sessionStorage.setItem('dvr_token', data.token);

                        if (window.PasswordCredential && navigator.credentials && navigator.credentials.store) {
                            try {
                                var cred = new PasswordCredential(form);
                                navigator.credentials.store(cred);
                            } catch (cErr) {}
                        }

                        self.hideLoginScreen();
                        self.showToast('Bem-vindo, ' + user + '!');
                        await self.connectDvr();
                    } else {
                        if (errEl) {
                            errEl.textContent = data.message || 'Usuário ou senha incorretos';
                            errEl.style.display = 'block';
                        }
                    }
                } catch (netErr) {
                    if (errEl) {
                        errEl.textContent = 'Erro de conexão ao autenticar';
                        errEl.style.display = 'block';
                    }
                } finally {
                    if (btnSubmit) btnSubmit.disabled = false;
                }
            });
        }
    }

    showLoginScreen() {
        var screen = document.getElementById('login-screen');
        if (screen) {
            screen.classList.remove('hidden');
            var uInput = document.getElementById('site-username');
            var pInput = document.getElementById('site-password');
            setTimeout(function() {
                if (uInput && !uInput.value) {
                    uInput.focus();
                } else if (pInput) {
                    pInput.focus();
                }
            }, 100);
        }
    }

    hideLoginScreen() {
        var screen = document.getElementById('login-screen');
        if (screen) {
            screen.classList.add('hidden');
        }
    }

    startClock() {
        var clockEl = document.getElementById('clock-time');
        var dateEl = document.getElementById('clock-date');
        var updateClock = function() {
            var now = new Date();
            if (clockEl) {
                clockEl.textContent = now.toLocaleTimeString('pt-BR');
            }
            if (dateEl) {
                dateEl.textContent = now.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
            }
        };
        updateClock();
        setInterval(updateClock, 1000);
    }

    setupDOM() {
        var self = this;

        window.addEventListener('resize', function() {
            if (self.isFullScreen) {
                self.adjustFullScreenDimensions();
            }
            if (self.player) self.player.resize();
        });

        // Botão de alternância rápida de layout na barra superior
        var btnQuickLayout = document.getElementById('btn-quick-layout');
        if (btnQuickLayout) {
            btnQuickLayout.addEventListener('click', function() {
                self.cycleLayout();
            });
            self.updateQuickLayoutLabel();
        }

        // Botão de abrir modal de preferências
        var btnSettings = document.getElementById('btn-settings');
        if (btnSettings) {
            btnSettings.addEventListener('click', function() {
                self.openSettingsModal();
            });
        }

        // Botões para fechar modal de preferências
        var btnClose = document.getElementById('btn-close-modal');
        if (btnClose) {
            btnClose.addEventListener('click', function() {
                self.closeSettingsModal();
            });
        }

        var btnCancel = document.getElementById('btn-cancel-settings');
        if (btnCancel) {
            btnCancel.addEventListener('click', function() {
                self.closeSettingsModal();
            });
        }

        var backdrop = document.getElementById('settings-backdrop');
        if (backdrop) {
            backdrop.addEventListener('click', function() {
                self.closeSettingsModal();
            });
        }

        // Botão de Salvar Preferências
        var btnResetOrder = document.getElementById('btn-reset-order');
        if (btnResetOrder) {
            btnResetOrder.addEventListener('click', function() {
                self.customOrder = null;
                localStorage.removeItem('dvr_camera_order');
                self.renderGrid();
                self.showToast('Ordem padrão restaurada (CH 1 a 16)!', 2500);
            });
        }

        var btnSavePref = document.getElementById('btn-save-preferences');
        if (btnSavePref) {
            btnSavePref.addEventListener('click', function() {
                self.savePreferences();
            });
        }

        // Seletor de botões de opções dentro do modal
        this.setupPreferenceButtonGroup('pref-grid-layouts');
        this.setupPreferenceButtonGroup('pref-quality-choices');
        this.setupPreferenceButtonGroup('pref-interval-choices');

        // Ações Touch de Tela Cheia
        var btnFsBack = document.getElementById('btn-fs-back');
        if (btnFsBack) {
            btnFsBack.addEventListener('click', function() {
                self.closeFullScreen();
            });
        }

        var btnFsPrev = document.getElementById('btn-fs-prev');
        if (btnFsPrev) {
            btnFsPrev.addEventListener('click', function() {
                self.prevCamera();
            });
        }

        var btnFsNext = document.getElementById('btn-fs-next');
        if (btnFsNext) {
            btnFsNext.addEventListener('click', function() {
                self.nextCamera();
            });
        }

        var btnFsQuality = document.getElementById('btn-fs-toggle-quality');
        var fsBadge = document.getElementById('fs-cam-badge');
        var toggleFn = function() {
            self.handleYellow();
        };
        if (btnFsQuality) btnFsQuality.addEventListener('click', toggleFn);
        if (fsBadge) fsBadge.addEventListener('click', toggleFn);
    }

    setupPreferenceButtonGroup(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;
        var buttons = container.querySelectorAll('.pref-choice-btn');
        buttons.forEach(function(btn) {
            btn.addEventListener('click', function() {
                buttons.forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
            });
        });
    }

    setupKeyboard() {
        var self = this;
        window.addEventListener('keydown', function(e) {
            // NUNCA intercepta digitação em campos de texto (iPhone, iPad, Mac ou PC)
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
                return;
            }

            if (e.key === 'Escape' || e.keyCode === 27) {
                if (self.isModalOpen) {
                    self.closeSettingsModal();
                } else if (self.isFullScreen) {
                    self.closeFullScreen();
                }
            } else if (e.key === 'ArrowLeft' && self.isFullScreen) {
                self.prevCamera();
            } else if (e.key === 'ArrowRight' && self.isFullScreen) {
                self.nextCamera();
            }
        });
    }

    cycleLayout() {
        var layouts = ['4x4', '3x3', '2x2', '1x1'];
        var nextIdx = (layouts.indexOf(this.currentLayout) + 1) % layouts.length;
        this.currentLayout = layouts[nextIdx];
        localStorage.setItem('dvr_layout', this.currentLayout);

        this.updateQuickLayoutLabel();
        this.showToast('Grade alterada para ' + this.currentLayout, 2000);
        this.renderGrid();
    }

    updateQuickLayoutLabel() {
        var label = document.getElementById('layout-label-text');
        if (label) {
            label.textContent = 'Grade ' + this.currentLayout;
        }
    }

    async connectDvr() {
        this.showToast('Conectando ao sistema...', 2000);
        this.setConnectionStatus('connecting', 'Conectando...');

        try {
            await this.dvr.login();
            this.setConnectionStatus('connected', 'Conectado');

            var deviceInfo = await this.dvr.getDeviceInfo();
            if (deviceInfo) {
                document.getElementById('dvr-title').textContent = deviceInfo.deviceName + ' • ' + deviceInfo.model;
            }

            this.channels = await this.dvr.getChannels();
            console.log('[App] ' + this.channels.length + ' canais carregados.');

            this.renderGrid();
            this.startGridRefresh();
            this.showToast('Sistema Online • 16 Câmeras prontas', 2500);

        } catch (err) {
            console.error('[App] Erro ao conectar ao DVR:', err);
            this.setConnectionStatus('error', 'Erro de Conexão');
            this.showToast('Falha na conexão: ' + err.message, 8000);

            var grid = document.getElementById('camera-grid');
            if (grid) {
                grid.innerHTML = '<div style=display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#ef4444;font-size:20px;gap:14px;text-align:center;padding:40px;>' +
                    '<div>⚠️ Não foi possível carregar as imagens do DVR</div>' +
                    '<div style=color:#94a3b8;font-size:15px;>Detalhes: ' + err.message + '</div>' +
                    '</div>';
            }
        }
    }

    setConnectionStatus(status, text) {
        var dot = document.getElementById('status-dot');
        var label = document.getElementById('status-label');
        if (dot) dot.className = 'status-dot ' + status;
        if (label) label.textContent = text;
    }

    getVisibleChannels() {
        if (!this.channels || this.channels.length === 0) return [];
        var list = this.activeChannelsOnly ? 
            this.channels.filter(function(ch) { return ch.isOnline; }) : 
            this.channels.slice();

        if (this.customOrder && Array.isArray(this.customOrder)) {
            var self = this;
            list.sort(function(a, b) {
                var idxA = self.customOrder.indexOf(a.id);
                var idxB = self.customOrder.indexOf(b.id);
                if (idxA === -1) idxA = 999;
                if (idxB === -1) idxB = 999;
                return idxA - idxB;
            });
        }
        return list;
    }

    renderGrid() {
        var self = this;
        var grid = document.getElementById('camera-grid');
        if (!grid) return;

        grid.className = 'camera-grid layout-' + this.currentLayout;
        grid.innerHTML = '';

        var visibleChannels = this.getVisibleChannels();

        if (visibleChannels.length === 0) {
        grid.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a388;font-size:18px;">Nenhuma câmera encontrada com os filtros atuais.</div>';
            return;
        }

        if (this.focusedIndex >= visibleChannels.length) {
        this.focusedIndex = 0;
        }

        visibleChannels.forEach(function(channel, index) {
        var card = document.createElement('div');
            card.className = 'camera-card';
            card.dataset.channelId = channel.id;
            card.dataset.index = index;
            card.setAttribute('draggable', 'true');

            var statusClass = channel.isOnline ? 'online' : 'offline';
            var statusText = channel.isOnline ? 'AO VIVO' : 'SEM SINAL';
            var resBadge = channel.resDesc || (channel.isOnline ? '1080P' : 'OFF');

            var initialSrc = self.dvr.getSnapshotUrl(channel.id, 2);

            card.innerHTML = 
                '<div class="card-video-wrap">' +
                    '<img class="camera-img" src="' + initialSrc + '" alt="' + channel.name + '" loading="lazy" />' +
                    '<div class="camera-overlay-top">' +
                        '<span class="cam-drag-handle" title="Arraste para reordenar">⋮⋮</span>' +
                        '<span class="cam-badge-id">CH ' + channel.id + '</span>' +
                        '<span class="cam-name">' + channel.name + '</span>' +
                        (channel.isOnline ? '<span class="cam-badge-stream quality-fluido">Fluido</span>' : '') +
                    '</div>' +
                    '<div class="camera-overlay-bottom">' +
                        '<span class="cam-status ' + statusClass + '">' + statusText + '</span>' +
                        '<span class="cam-res">' + resBadge + '</span>' +
                    '</div>' +
                '</div>';

            // --- Drag & Drop com Mouse (Desktop) ---
            card.addEventListener('dragstart', function(e) {
        self.isDraggingCard = true;
                self.draggedChannelId = channel.id;
                card.classList.add('dragging');
                if (e.dataTransfer) {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(channel.id));
                }
            });

            card.addEventListener('dragend', function() {
                card.classList.remove('dragging');
                document.querySelectorAll('.camera-card').forEach(function(c) { c.classList.remove('drag-over'); });
                setTimeout(function() { self.isDraggingCard = false; }, 80);
            });

            card.addEventListener('dragover', function(e) {
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
            });

            card.addEventListener('dragenter', function(e) {
                e.preventDefault();
                if (self.draggedChannelId && self.draggedChannelId !== channel.id) {
        card.classList.add('drag-over');
                }
            });

            card.addEventListener('dragleave', function() {
                card.classList.remove('drag-over');
            });

            card.addEventListener('drop', function(e) {
        e.preventDefault();
                card.classList.remove('drag-over');
                var fromId = self.draggedChannelId;
                var toId = channel.id;
                if (fromId && toId && fromId !== toId) {
                    self.reorderChannels(fromId, toId);
                }
            });

            // --- Suporte a Drag no Celular / Touch ---
            var touchStartX = 0, touchStartY = 0, touchDist = 0;
            card.addEventListener('touchstart', function(e) {
                if (e.touches.length === 1) {
                    touchStartX = e.touches[0].clientX;
                    touchStartY = e.touches[0].clientY;
                    touchDist = 0;
                }
            }, { passive: true });

            card.addEventListener('touchmove', function(e) {
        if (e.touches.length === 1) {
                    var dx = e.touches[0].clientX - touchStartX;
                    var dy = e.touches[0].clientY - touchStartY;
                    touchDist = Math.sqrt(dx * dx + dy * dy);
                    if (touchDist > 28 && !self.touchDragActiveCard) {
        self.isDraggingCard = true;
                        self.touchDragActiveCard = card;
                        self.draggedChannelId = channel.id;
                        card.classList.add('dragging');
                    }
                }
            }, { passive: true });

            card.addEventListener('touchend', function(e) {
                if (self.touchDragActiveCard) {
                    self.touchDragActiveCard.classList.remove('dragging');
                    self.touchDragActiveCard = null;
                    var touch = e.changedTouches[0];
                    var elem = document.elementFromPoint(touch.clientX, touch.clientY);
                    if (elem) {
                        var targetCard = elem.closest('.camera-card');
                        if (targetCard && targetCard !== card) {
        var toId = parseInt(targetCard.dataset.channelId, 10);
                            if (toId && self.draggedChannelId && toId !== self.draggedChannelId) {
                                self.reorderChannels(self.draggedChannelId, toId);
                            }
                        }
                    }
                    setTimeout(function() { self.isDraggingCard = false; }, 80);
                }
            }, { passive: true });

            // Clique para abrir tela cheia (ignora se estava arrastando)
            card.addEventListener('click', function() {
                if (self.isDraggingCard) return;
                self.focusedIndex = index;
                self.openFullScreen(channel);
            });

            grid.appendChild(card);
        });
    }

    reorderChannels(fromId, toId) {
        console.log('[App] Reordenando canal', fromId, 'para a posição de', toId);
        var visible = this.getVisibleChannels();
        var currentIds = visible.map(function(ch) { return ch.id; });
        var fromIdx = currentIds.indexOf(fromId);
        var toIdx = currentIds.indexOf(toId);

        if (fromIdx === -1 || toIdx === -1) return;

        var moved = currentIds.splice(fromIdx, 1)[0];
        currentIds.splice(toIdx, 0, moved);

        var allIds = (this.customOrder && this.customOrder.length) ? 
            this.customOrder.slice() : 
            this.channels.map(function(ch) { return ch.id; });

        var oldAllIdx = allIds.indexOf(fromId);
        if (oldAllIdx !== -1) allIds.splice(oldAllIdx, 1);
        var targetAllIdx = allIds.indexOf(toId);
        if (targetAllIdx !== -1) {
            allIds.splice(fromIdx < toIdx ? targetAllIdx + 1 : targetAllIdx, 0, fromId);
        } else {
            allIds.push(fromId);
        }

        this.customOrder = allIds;
        localStorage.setItem('dvr_camera_order', JSON.stringify(this.customOrder));

        this.showToast('Nova ordem das câmeras salva!', 1500);
        this.renderGrid();
    }

    startGridRefresh() {
        var self = this;
        if (this.gridRefreshTimer) clearInterval(this.gridRefreshTimer);

        var interval = this.refreshInterval || 2000;

        this.gridRefreshTimer = setInterval(function() {
            if (self.isFullScreen || self.isModalOpen) return;

            var cards = document.querySelectorAll('.camera-card');
            cards.forEach(function(card, idx) {
                var chId = card.dataset.channelId;
                var img = card.querySelector('.camera-img');
                if (img && chId) {
                    setTimeout(async function() {
                        if (self.isFullScreen || self.isModalOpen) return;
                        try {
                            var blobUrl = await self.dvr.fetchSnapshotBlob(chId, 2);
                            var oldUrl = img.dataset.blobUrl;
                            img.src = blobUrl;
                            img.dataset.blobUrl = blobUrl;
                            if (oldUrl) {
                                URL.revokeObjectURL(oldUrl);
                            }
                        } catch (e) {}
                    }, idx * 25);
                }
            });
        }, interval);
    }

    /* ==========================================================================
       GESTÃO DO MODAL DE PREFERÊNCIAS DE EXIBIÇÃO
       ========================================================================== */
    openSettingsModal() {
        console.log('[App] Abrindo modal de preferências...');
        this.isModalOpen = true;

        var modal = document.getElementById('settings-modal');
        if (!modal) return;

        // 1. Marcar botão ativo da grade
        var gridButtons = document.querySelectorAll('#pref-grid-layouts .pref-choice-btn');
        gridButtons.forEach(btn => {
            if (btn.dataset.val === this.currentLayout) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        // 2. Marcar checkbox de filtro de câmeras ativas
        var filterCb = document.getElementById('pref-hide-inactive');
        if (filterCb) {
            filterCb.checked = this.activeChannelsOnly;
        }

        // 3. Marcar qualidade padrão
        var qualButtons = document.querySelectorAll('#pref-quality-choices .pref-choice-btn');
        var curQuality = (this.streamQuality === 1) ? 'hd' : 'fluido';
        qualButtons.forEach(btn => {
            if (btn.dataset.val === curQuality) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        // 4. Marcar intervalo
        var intButtons = document.querySelectorAll('#pref-interval-choices .pref-choice-btn');
        var curIntervalStr = String(this.refreshInterval || 2000);
        intButtons.forEach(btn => {
            if (btn.dataset.val === curIntervalStr) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        modal.style.display = 'flex';
    }

    closeSettingsModal() {
        this.isModalOpen = false;
        var modal = document.getElementById('settings-modal');
        if (modal) modal.style.display = 'none';
    }

    savePreferences() {
        // 1. Layout selecionado
        var activeLayoutBtn = document.querySelector('#pref-grid-layouts .pref-choice-btn.active');
        var selectedLayout = activeLayoutBtn ? activeLayoutBtn.dataset.val : '4x4';

        // 2. Filtro ativo
        var filterCb = document.getElementById('pref-hide-inactive');
        var hideInactive = filterCb ? filterCb.checked : false;

        // 3. Qualidade padrão
        var activeQualBtn = document.querySelector('#pref-quality-choices .pref-choice-btn.active');
        var selectedQuality = activeQualBtn ? activeQualBtn.dataset.val : 'fluido';

        // 4. Intervalo de atualização
        var activeIntBtn = document.querySelector('#pref-interval-choices .pref-choice-btn.active');
        var selectedInterval = activeIntBtn ? parseInt(activeIntBtn.dataset.val, 10) : 2000;

        // Salvar no localStorage
        localStorage.setItem('dvr_layout', selectedLayout);
        localStorage.setItem('dvr_filter_active', String(hideInactive));
        localStorage.setItem('dvr_default_quality', selectedQuality);
        localStorage.setItem('dvr_refresh_interval', String(selectedInterval));

        this.currentLayout = selectedLayout;
        this.activeChannelsOnly = hideInactive;
        this.streamQuality = (selectedQuality === 'hd') ? 1 : 2;
        this.refreshInterval = selectedInterval;

        this.updateQuickLayoutLabel();
        this.startGridRefresh();
        this.renderGrid();
        this.closeSettingsModal();

        this.showToast('Preferências salvas com sucesso!', 2500);
    }

    /* ==========================================================================
       VISUALIZAÇÃO EM TELA CHEIA (TOUCH / WEB)
       ========================================================================== */
    adjustFullScreenDimensions() {
        var container = document.getElementById('fullscreen-player-container');
        if (!container) return;
        var w = window.innerWidth;
        var h = window.innerHeight;
        var targetW = w;
        var targetH = Math.round(w * 9 / 16);
        if (targetH > h) {
            targetH = h;
            targetW = Math.round(h * 16 / 9);
        }
        container.style.width = targetW + 'px';
        container.style.height = targetH + 'px';
    }

    updateQualityBadge() {
        var isHd = (this.streamQuality === 1);
        var badge = document.getElementById('fs-cam-badge');
        var text = document.getElementById('fs-quality-text');
        if (badge && text) {
            badge.className = 'fs-quality-tag ' + (isHd ? 'quality-hd' : 'quality-fluido');
            text.textContent = isHd ? 'HD' : 'Fluido';
        }
    }

    openFullScreen(channel) {
        console.log('[App] Abrindo câmera individual:', channel.name);
        this.isFullScreen = true;
        this.fullScreenChannel = channel;

        var fsView = document.getElementById('fullscreen-view');
        if (fsView) {
            fsView.style.display = 'flex';
            this.adjustFullScreenDimensions();
        }

        var titleEl = document.getElementById('fs-cam-title');
        if (titleEl) {
            titleEl.textContent = channel.name + ' (CH ' + channel.id + ')';
        }

        this.updateQualityBadge();
        this.player.play(channel.id, this.streamQuality);
        this.showToast(channel.name + ' (CH ' + channel.id + ')', 2000);
    }

    closeFullScreen() {
        if (!this.isFullScreen) return;
        this.isFullScreen = false;
        this.fullScreenChannel = null;

        var fsView = document.getElementById('fullscreen-view');
        if (fsView) fsView.style.display = 'none';

        this.player.stop();
        this.renderGrid();
    }

    nextCamera() {
        var visibleChannels = this.getVisibleChannels();
        if (visibleChannels.length === 0) return;

        this.focusedIndex = (this.focusedIndex + 1) % visibleChannels.length;
        if (this.isFullScreen) {
            this.openFullScreen(visibleChannels[this.focusedIndex]);
        }
    }

    prevCamera() {
        var visibleChannels = this.getVisibleChannels();
        if (visibleChannels.length === 0) return;

        this.focusedIndex = (this.focusedIndex - 1 + visibleChannels.length) % visibleChannels.length;
        if (this.isFullScreen) {
            this.openFullScreen(visibleChannels[this.focusedIndex]);
        }
    }

    handleYellow() {
        this.streamQuality = (this.streamQuality === 1) ? 2 : 1;
        var isHd = (this.streamQuality === 1);
        var qualityName = isHd ? 'Stream Principal (HD)' : 'Sub-stream Fluido';
        this.showToast('Qualidade: ' + qualityName, 2000);

        if (this.isFullScreen && this.fullScreenChannel) {
            this.updateQualityBadge();
            this.player.play(this.fullScreenChannel.id, this.streamQuality);
        }
    }

    showToast(msg, duration) {
        duration = duration || 3000;
        var toast = document.getElementById('toast-notification');
        if (!toast) return;
        toast.textContent = msg;
        toast.classList.add('show');
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(function() {
            toast.classList.remove('show');
        }, duration);
    }
}

window.addEventListener('DOMContentLoaded', function() {
    window.app = new DvrTvApp();
});

