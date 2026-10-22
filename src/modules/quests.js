const { writeLog } = require('./logger');
const { getConfig, saveConfig } = require('./config');

function injectQuestsModule(win) {
    if (!win || win.isDestroyed()) return;
    const url = win.webContents.getURL() || '';
    if (!url || (!url.includes('discord.com/app') && !url.includes('discord.com/channels'))) {
        return;
    }

    writeLog('Injecting Quests module into window:', win.id);

    const clientConfig = getConfig();
    const questsScript = `
        (function() {
            try {
                window[Symbol.for("DevtoolsPastingAllowed")] = true;
            } catch (_) {}

            if (window.__DISCORD_EXT_QUESTS_LOADED__) {
                if (typeof window.__DISCORD_EXT_SET_QUESTS_CONFIG === 'function') {
                    window.__DISCORD_EXT_SET_QUESTS_CONFIG({
                        autoCollect: ${Boolean(clientConfig.autoCollectQuests !== false)},
                        showWidget: ${Boolean(clientConfig.showQuestsWidget !== false)}
                    });
                }
                return;
            }
            window.__DISCORD_EXT_QUESTS_LOADED__ = true;

            let questsRunning = false;
            let autoCollectEnabled = ${Boolean(clientConfig.autoCollectQuests !== false)};
            let showWidgetEnabled = ${Boolean(clientConfig.showQuestsWidget !== false)};
            let currentQuestName = "";
            let currentStatusMsg = "Нажмите кнопку для старта сбора";
            let activeCleanups = [];
            let activeActionableQuests = [];
            let unclaimedQuestsList = [];
            let allQuestsFinished = false;

            let cachedWpRequire = null;
            function getWebpackRequire() {
                if (cachedWpRequire) return cachedWpRequire;
                try {
                    if (window.webpackChunkdiscord_app) {
                        let wp = null;
                        window.webpackChunkdiscord_app.push([
                            [Symbol('ext_quests')],
                            {},
                            (req) => { wp = req; }
                        ]);
                        if (typeof window.webpackChunkdiscord_app.pop === 'function') {
                            window.webpackChunkdiscord_app.pop();
                        }
                        if (wp) {
                            cachedWpRequire = wp;
                            return wp;
                        }
                    }
                } catch (_) {}
                return null;
            }

            function findModuleExport(filter) {
                try {
                    const wp = getWebpackRequire();
                    if (!wp || !wp.c) return null;
                    for (const id in wp.c) {
                        const m = wp.c[id]?.exports;
                        if (!m) continue;
                        if (filter(m)) return m;
                        if (m.default && filter(m.default)) return m.default;
                        if (typeof m === 'object') {
                            for (const key of Object.keys(m)) {
                                try {
                                    if (m[key] && filter(m[key])) return m[key];
                                } catch (_) {}
                            }
                        }
                    }
                } catch (_) {}
                return null;
            }

            let cachedModules = null;
            function getDiscordModules() {
                if (cachedModules && cachedModules.api && cachedModules.FluxDispatcher) {
                    return cachedModules;
                }

                let api = null;
                let FluxDispatcher = null;
                let RunningGameStore = null;
                let ApplicationStreamingStore = null;
                let ChannelStore = null;
                let GuildChannelStore = null;

                const webpackCommon = window.DiscordExtensions?.Webpack?.Common || window.Vencord?.Webpack?.Common;
                if (webpackCommon) {
                    if (webpackCommon.RestAPI) api = webpackCommon.RestAPI;
                    if (webpackCommon.FluxDispatcher) FluxDispatcher = webpackCommon.FluxDispatcher;
                    if (webpackCommon.RunningGameStore) RunningGameStore = webpackCommon.RunningGameStore;
                    if (webpackCommon.ApplicationStreamingStore) ApplicationStreamingStore = webpackCommon.ApplicationStreamingStore;
                    if (webpackCommon.ChannelStore) ChannelStore = webpackCommon.ChannelStore;
                    if (webpackCommon.GuildChannelStore) GuildChannelStore = webpackCommon.GuildChannelStore;
                }

                if (!api) {
                    api = findModuleExport(x => x && typeof x.get === 'function' && typeof x.post === 'function' && !String(x.get).includes('[native code]'));
                }
                if (!FluxDispatcher) {
                    FluxDispatcher = findModuleExport(x => x && typeof x.dispatch === 'function' && typeof x.subscribe === 'function');
                }
                if (!RunningGameStore) {
                    RunningGameStore = findModuleExport(x => x && typeof x.getRunningGames === 'function');
                }
                if (!ApplicationStreamingStore) {
                    ApplicationStreamingStore = findModuleExport(x => x && typeof x.getStreamerActiveStreamMetadata === 'function');
                }
                if (!ChannelStore) {
                    ChannelStore = findModuleExport(x => x && typeof x.getChannel === 'function');
                }
                if (!GuildChannelStore) {
                    GuildChannelStore = findModuleExport(x => x && typeof x.getChannels === 'function');
                }

                const res = {
                    api,
                    FluxDispatcher,
                    RunningGameStore,
                    ApplicationStreamingStore,
                    ChannelStore,
                    GuildChannelStore
                };
                if (api && FluxDispatcher && RunningGameStore) {
                    cachedModules = res;
                }
                return res;
            }

            window.__DISCORD_EXT_SET_QUESTS_CONFIG = function(cfg) {
                if (typeof cfg.showWidget === 'boolean') {
                    showWidgetEnabled = cfg.showWidget;
                    const w = document.getElementById('discord-ext-quests-widget');
                    if (showWidgetEnabled) {
                        if (w) w.style.display = 'block';
                        updateQuestsWidgetUI();
                    } else {
                        if (w) w.style.display = 'none';
                    }
                }
                if (typeof cfg.autoCollect === 'boolean') {
                    autoCollectEnabled = cfg.autoCollect;
                }
            };

            const supportedTasks = ['WATCH_VIDEO', 'PLAY_ON_DESKTOP', 'STREAM_ON_DESKTOP', 'PLAY_ACTIVITY', 'WATCH_VIDEO_ON_MOBILE'];

            function chooseTaskName(tasks) {
                if (!tasks) return null;
                if (tasks.PLAY_ON_DESKTOP) return 'PLAY_ON_DESKTOP';
                if (tasks.STREAM_ON_DESKTOP) return 'STREAM_ON_DESKTOP';
                if (tasks.WATCH_VIDEO) return 'WATCH_VIDEO';
                if (tasks.WATCH_VIDEO_ON_MOBILE) return 'WATCH_VIDEO_ON_MOBILE';
                if (tasks.PLAY_ACTIVITY) return 'PLAY_ACTIVITY';
                return Object.keys(tasks).find(t => supportedTasks.includes(t)) || null;
            }

            function parseQuest(q) {
                if (!q || !q.id) return null;
                const config = q.config || {};
                const messages = config.messages || {};
                const questName = messages.quest_name || messages.questName || config.quest_name || 'Квест Discord';
                const applicationId = config.application?.id || config.application_id || null;
                const configVersion = config.config_version || config.configVersion || 2;
                const taskConfig = config.task_config_v2 || config.task_config || config.taskConfig || {};
                const tasks = taskConfig.tasks || {};
                const taskName = chooseTaskName(tasks);

                let secondsNeeded = 0;
                if (taskName && tasks[taskName]) {
                    secondsNeeded = tasks[taskName].target || 0;
                }
                if (!secondsNeeded) {
                    secondsNeeded = (taskConfig.target || 0) || (config.target || 0) || 900;
                }

                const userStatus = q.user_status || q.userStatus || {};
                const enrolledAt = userStatus.enrolled_at || userStatus.enrolledAt || null;
                const completedAt = userStatus.completed_at || userStatus.completedAt || null;
                const claimedAt = userStatus.claimed_at || userStatus.claimedAt || (userStatus.orb_quantity_claimed ? new Date().toISOString() : null);

                let secondsDone = 0;
                if (taskName && userStatus.progress && userStatus.progress[taskName]) {
                    secondsDone = userStatus.progress[taskName].value || 0;
                } else if (typeof userStatus.stream_progress_seconds === 'number') {
                    secondsDone = userStatus.stream_progress_seconds;
                } else if (typeof userStatus.streamProgressSeconds === 'number') {
                    secondsDone = userStatus.streamProgressSeconds;
                }

                return {
                    id: q.id,
                    questName,
                    applicationId,
                    configVersion,
                    taskName,
                    secondsNeeded,
                    secondsDone,
                    enrolledAt,
                    completedAt,
                    claimedAt,
                    expiresAt: config.expires_at || config.expiresAt,
                    raw: q
                };
            }

            let lastDomSelectTime = 0;
            function autoSelectDesktopPlatformInDOM() {
                const now = Date.now();
                if (now - lastDomSelectTime < 2000) return;
                lastDomSelectTime = now;

                try {
                    const buttons = Array.from(document.querySelectorAll('button, div[role="button"], [class*="quest"] [role="button"]'));
                    for (const b of buttons) {
                        const txt = (b.textContent || '').trim();
                        if (txt.includes('Задание по компьютеру') || txt.includes('На компьютере') || txt.includes('На ПК') || txt.includes('Play on PC') || txt.includes('Desktop')) {
                            if (!b.disabled && b.getAttribute('aria-checked') !== 'true') {
                                b.click();
                            }
                        }
                    }
                } catch (_) {}
            }

            function findProfileTarget() {
                try {
                    const controlBtn = document.querySelector(
                        'button[aria-label="Настройки пользователя"], ' +
                        'button[aria-label="User Settings"], ' +
                        'button[aria-label*="Заглушить" i], ' +
                        'button[aria-label*="Mute" i], ' +
                        '[class*="avatarWrapper_"]'
                    );
                    if (!controlBtn) return null;

                    let profileBar = controlBtn.closest('[class*="container_"]');
                    if (!profileBar) {
                        let cur = controlBtn;
                        while (cur && cur.parentElement && cur.parentElement.tagName !== 'SECTION' && !String(cur.parentElement.className).includes('panels_')) {
                            cur = cur.parentElement;
                        }
                        profileBar = cur;
                    }

                    const panelsSection = profileBar?.closest('section') || profileBar?.closest('[class*="panels_"]') || profileBar?.parentElement;
                    if (panelsSection && profileBar) {
                        return { panelsSection, profileBar };
                    }
                } catch (_) {}
                return null;
            }

            function concealNativeQuestBar() {
                try {
                    const selectors = [
                        '[class*="questBar_"]',
                        '[class*="questBarHero_"]',
                        '[class*="questsContainer_"]',
                        '[class*="questChannelCallHeader_"]',
                        '[class*="questPanel_"]',
                        '[class*="questProgress_"]',
                        '[class*="questBanner_"]',
                        '[class*="questCard_"]',
                        '[class*="questBarWrapper_"]',
                        '[data-quest-id]',
                        '[class*="gameActivityPanel_"]',
                        '[class*="activityPanel_"]:has([class*="quest"])'
                    ];

                    for (const sel of selectors) {
                        const matches = document.querySelectorAll(sel);
                        for (const el of matches) {
                            if (el.id === 'discord-ext-quests-widget' || el.closest('#discord-ext-quests-widget')) continue;
                            if (el.style.display !== 'none') {
                                el.style.setProperty('display', 'none', 'important');
                            }
                        }
                    }

                    const panels = document.querySelector('[class*="panels_"]');
                    if (panels) {
                        for (const child of Array.from(panels.children)) {
                            if (child.id === 'discord-ext-quests-widget' || child.contains(document.getElementById('discord-ext-quests-widget'))) {
                                continue;
                            }
                            if (child.querySelector('button[aria-label*="Настройки"], button[aria-label*="Settings"], button[aria-label*="Заглушить"], button[aria-label*="Mute"], [class*="avatarWrapper_"]')) {
                                continue;
                            }
                            if (child.className.includes('connection_') || child.className.includes('rtc_')) {
                                continue;
                            }
                            const txt = (child.textContent || '').toLowerCase();
                            const cls = String(child.className || '').toLowerCase();
                            const isRogueQuest = cls.includes('quest') || 
                                                 txt.includes('задание') || 
                                                 txt.includes('квест') || 
                                                 txt.includes('orbs') || 
                                                 child.querySelector('[class*="quest"]');
                            if (isRogueQuest) {
                                if (child.style.display !== 'none') {
                                    child.style.setProperty('display', 'none', 'important');
                                }
                            }
                        }
                    }
                } catch (_) {}
            }

            let nativeObserverInitialized = false;
            function initNativeQuestObserver() {
                if (nativeObserverInitialized) return;
                try {
                    const target = document.querySelector('[class*="sidebar_"]') || document.body;
                    if (!target) return;
                    nativeObserverInitialized = true;
                    const observer = new MutationObserver(() => {
                        concealNativeQuestBar();
                    });
                    observer.observe(target, { childList: true, subtree: true });
                } catch (_) {}
            }

            function ensureQuestsWidgetStyles() {
                if (document.getElementById('discord-ext-quests-styles')) return;
                const style = document.createElement('style');
                style.id = 'discord-ext-quests-styles';
                style.textContent = [
                    '/* Conceal native quest bar and activity banners */',
                    '[class*="questBar_"],',
                    '[class*="questBarHero_"],',
                    '[class*="questChannelCallHeader_"],',
                    '[class*="questsContainer_"],',
                    '[class*="activityPanel_"]:has([class*="quest"]),',
                    '[class*="gameActivityPanel_"]:has([class*="quest"]),',
                    'div[class*="wrapper_"]:has([class*="questBar_"]),',
                    'div:has(> [class*="questBar_"]) {',
                    '    display: none !important;',
                    '}',
                    '#discord-ext-quests-widget {',
                    '    position: relative !important;',
                    '    margin: 4px 8px 6px 8px !important;',
                    '    width: calc(100% - 16px) !important;',
                    '    box-sizing: border-box !important;',
                    '    background: var(--bg-overlay-chat, var(--background-secondary-alt, var(--background-secondary, #1e1f22))) !important;',
                    '    border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08)) !important;',
                    '    border-radius: 8px !important;',
                    '    padding: 10px 12px !important;',
                    '    font-family: var(--font-primary, "gg sans", "Noto Sans", sans-serif) !important;',
                    '    color: var(--text-normal, #dbdee1) !important;',
                    '    box-shadow: var(--elevation-medium, 0 4px 12px rgba(0, 0, 0, 0.25)) !important;',
                    '    flex-shrink: 0 !important;',
                    '    overflow: hidden !important;',
                    '    z-index: 10 !important;',
                    '    transition: all 0.2s ease !important;',
                    '}',
                    'html.custom-theme-background #discord-ext-quests-widget,',
                    '.custom-theme-background #discord-ext-quests-widget {',
                    '    background: rgba(20, 22, 28, 0.45) !important;',
                    '    backdrop-filter: blur(16px) !important;',
                    '    -webkit-backdrop-filter: blur(16px) !important;',
                    '    border: 1px solid rgba(255, 255, 255, 0.14) !important;',
                    '    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35) !important;',
                    '}',
                    '#discord-ext-quests-widget:hover {',
                    '    border-color: var(--border-muted, rgba(255, 255, 255, 0.2)) !important;',
                    '}'
                ].join(' ');
                document.head.appendChild(style);
            }

            async function claimQuestReward(rawQuest, api) {
                if (!rawQuest || !rawQuest.id) return;
                const quest = parseQuest(rawQuest) || { id: rawQuest.id, questName: 'Квест' };
                currentStatusMsg = 'Получение награды: ' + quest.questName;
                updateQuestsWidgetUI();

                try {
                    let success = false;
                    try {
                        let claimFn = null;
                        const webpackFinder = window.DiscordExtensions?.Webpack || window.Vencord?.Webpack;
                        if (webpackFinder?.findByProps) {
                            const mod = webpackFinder.findByProps('claimReward');
                            if (mod && typeof mod.claimReward === 'function') {
                                claimFn = mod.claimReward;
                            }
                        }
                        if (!claimFn) {
                            const mod = findModuleExport(x => x && typeof x.claimReward === 'function');
                            if (mod && typeof mod.claimReward === 'function') {
                                claimFn = mod.claimReward;
                            }
                        }
                        if (claimFn) {
                            console.log('[DiscordExtensions Quests] Вызываем native claimReward для:', quest.id);
                            await claimFn(quest.id, { location: 1, platform: 0 });
                            success = true;
                        }
                    } catch (e) {
                        console.warn('[DiscordExtensions Quests] Ошибка вызова action claimReward:', e.message);
                    }

                    if (!success && api) {
                        try {
                            const res = await api.post({
                                url: '/quests/' + quest.id + '/claim-reward',
                                body: { location: 1, platform: 0 }
                            });
                            if (res && (res.status === 200 || res.ok || res.body)) {
                                success = true;
                            }
                        } catch (err) {
                            console.warn('[DiscordExtensions Quests] API claimReward ответ:', err?.message || err);
                        }
                    }

                    setTimeout(async () => {
                        try {
                            if (!api) return;
                            const meRes = await api.get({ url: '/quests/@me' });
                            const freshQuests = Array.isArray(meRes?.body) ? meRes.body : (meRes?.body?.quests || []);
                            const stillUnclaimed = freshQuests.filter(q => {
                                const p = parseQuest(q);
                                return p && p.completedAt && !p.claimedAt;
                            });
                            unclaimedQuestsList = stillUnclaimed;
                            if (unclaimedQuestsList.length === 0) {
                                currentStatusMsg = 'Все награды получены!';
                            } else {
                                currentStatusMsg = 'Доступна награда: ' + unclaimedQuestsList[0].questName;
                            }
                            updateQuestsWidgetUI();
                        } catch (_) {}
                    }, 2000);

                    if (success) {
                        console.log('[DiscordExtensions Quests] Запрос награды отправлен для:', quest.questName);
                        currentStatusMsg = 'Награда получена!';
                    } else {
                        console.log('[DiscordExtensions Quests] Требуется проверка или капча для:', quest.questName);
                        currentStatusMsg = 'Подтвердите капчу в клиенте';
                    }
                    updateQuestsWidgetUI();
                } catch (e) {
                    console.warn('[DiscordExtensions Quests] Исключение при получении награды:', e.message);
                }
            }

            function updateQuestsWidgetUI() {
                concealNativeQuestBar();
                initNativeQuestObserver();

                if (!showWidgetEnabled) {
                    const w = document.getElementById('discord-ext-quests-widget');
                    if (w && w.style.display !== 'none') w.style.display = 'none';
                    return;
                }

                const target = findProfileTarget();
                if (!target || !target.panelsSection || !target.profileBar) {
                    return;
                }

                const { panelsSection, profileBar } = target;

                ensureQuestsWidgetStyles();

                let widget = document.getElementById('discord-ext-quests-widget');
                if (!widget) {
                    widget = document.createElement('div');
                    widget.id = 'discord-ext-quests-widget';

                    widget.innerHTML = [
                        '<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">',
                        '    <div style="display:flex; align-items:center; gap:6px;">',
                        '        <svg id="de-qw-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="color:var(--custom-theme-primary-color, #5865F2);" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">',
                        '            <circle cx="12" cy="12" r="10"></circle>',
                        '            <polygon points="12 6 12 12 16 14"></polygon>',
                        '        </svg>',
                        '        <span style="font-size:11px; font-weight:700; color:var(--header-primary, #FFFFFF); letter-spacing:0.4px; text-transform:uppercase;">КВЕСТЫ DISCORD</span>',
                        '    </div>',
                        '    <span id="de-qw-badge" style="font-size:10px; font-weight:700; background:var(--custom-theme-primary-color, #5865F2); color:#FFF; padding:2px 6px; border-radius:4px; transition:all 0.2s ease;">ГОТОВ</span>',
                        '</div>',
                        '<div id="de-qw-title" style="font-size:13px; font-weight:600; color:var(--header-primary, #F2F3F5); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:2px;">Автоматические задания</div>',
                        '<div id="de-qw-status" style="font-size:11px; color:var(--text-muted, #949BA4); line-height:1.3; margin-bottom:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Нажмите кнопку для старта сбора</div>',
                        '<div style="width:100%; height:4px; background:var(--background-modifier-accent, rgba(255,255,255,0.08)); border-radius:2px; overflow:hidden; margin-bottom:8px;">',
                        '    <div id="de-qw-bar" style="width:0%; height:100%; background:linear-gradient(90deg, var(--custom-theme-primary-color, #5865F2), var(--custom-theme-secondary-color, var(--custom-theme-primary-color, #5865F2))); transition:width 0.3s ease, background 0.3s ease;"></div>',
                        '</div>',
                        '<div style="display:flex; gap:6px;">',
                        '    <button id="de-qw-action-btn" style="flex:1; background:linear-gradient(135deg, var(--custom-theme-primary-color, #5865F2), var(--custom-theme-secondary-color, var(--custom-theme-primary-color, #5865F2))); color:#FFFFFF; border:none; border-radius:4px; padding:6px 10px; font-size:11px; font-weight:600; cursor:pointer; transition:all 0.15s ease;">Начать сбор</button>',
                        '</div>'
                    ].join('');

                    const actBtn = widget.querySelector('#de-qw-action-btn');
                    if (actBtn) {
                        actBtn.addEventListener('click', async (e) => {
                            e.stopPropagation();
                            if (questsRunning && activeActionableQuests.length > 0) {
                                stopQuests();
                            } else if (unclaimedQuestsList.length > 0) {
                                const targetQuest = unclaimedQuestsList[0];
                                actBtn.disabled = true;
                                actBtn.textContent = 'Получение...';
                                const modules = getDiscordModules();
                                await claimQuestReward(targetQuest.raw || targetQuest, modules.api);
                                unclaimedQuestsList = unclaimedQuestsList.filter(x => x.id !== targetQuest.id);
                                updateQuestsWidgetUI();
                            } else {
                                runQuests();
                            }
                        });
                    }
                }

                if (widget.parentElement !== panelsSection || widget.nextElementSibling !== profileBar) {
                    panelsSection.insertBefore(widget, profileBar);
                }

                if (widget.style.display !== 'block') {
                    widget.style.display = 'block';
                }

                const badge = widget.querySelector('#de-qw-badge');
                const title = widget.querySelector('#de-qw-title');
                const status = widget.querySelector('#de-qw-status');
                const bar = widget.querySelector('#de-qw-bar');
                const actBtn = widget.querySelector('#de-qw-action-btn');

                if (questsRunning && activeActionableQuests.length > 0) {
                    const q = activeActionableQuests[0];
                    if (badge) {
                        badge.textContent = 'АКТИВНО';
                        badge.style.background = '#23A55A';
                    }
                    if (title) title.textContent = q.questName || 'Выполнение задания';

                    let statusText = currentStatusMsg || 'Выполняется задание...';
                    if (unclaimedQuestsList.length > 0) {
                        statusText += ' (Наград: ' + unclaimedQuestsList.length + ')';
                    }
                    if (status) status.textContent = statusText;

                    if (bar) {
                        let pct = 0;
                        if (q.secondsNeeded > 0) {
                            pct = Math.min(100, Math.round((q.secondsDone / q.secondsNeeded) * 100));
                        }
                        bar.style.width = pct + '%';
                        bar.style.background = 'linear-gradient(90deg, var(--custom-theme-primary-color, #5865F2), var(--custom-theme-secondary-color, var(--custom-theme-primary-color, #5865F2)))';
                    }

                    if (actBtn) {
                        actBtn.disabled = false;
                        actBtn.textContent = 'Остановить сбор';
                        actBtn.style.background = '#4E5058';
                    }
                } else if (unclaimedQuestsList.length > 0) {
                    const q = unclaimedQuestsList[0];
                    if (badge) {
                        badge.textContent = 'НАГРАДА!';
                        badge.style.background = '#23A55A';
                    }
                    if (title) title.textContent = q.questName || 'Задание завершено';

                    const statusText = unclaimedQuestsList.length > 1
                        ? ('Доступно наград: ' + unclaimedQuestsList.length + ' шт. Нажмите Забрать')
                        : 'Задание выполнено! Заберите свои Orbs';
                    if (status) status.textContent = statusText;

                    if (bar) {
                        bar.style.width = '100%';
                        bar.style.background = '#23A55A';
                    }

                    if (actBtn) {
                        actBtn.disabled = false;
                        actBtn.textContent = 'Забрать Orbs';
                        actBtn.style.background = '#23A55A';
                    }
                } else if (allQuestsFinished) {
                    if (badge) {
                        badge.textContent = 'ГОТОВ';
                        badge.style.background = 'var(--custom-theme-primary-color, #5865F2)';
                    }
                    if (title) title.textContent = 'Все задания выполнены!';
                    if (status) status.textContent = 'Все доступные награды получены';
                    if (bar) {
                        bar.style.width = '100%';
                        bar.style.background = 'linear-gradient(90deg, var(--custom-theme-primary-color, #5865F2), var(--custom-theme-secondary-color, var(--custom-theme-primary-color, #5865F2)))';
                    }
                    if (actBtn) {
                        actBtn.disabled = false;
                        actBtn.textContent = 'Проверить снова';
                        actBtn.style.background = 'linear-gradient(135deg, var(--custom-theme-primary-color, #5865F2), var(--custom-theme-secondary-color, var(--custom-theme-primary-color, #5865F2)))';
                    }
                } else {
                    if (badge) {
                        badge.textContent = 'ГОТОВ';
                        badge.style.background = 'var(--custom-theme-primary-color, #5865F2)';
                    }
                    if (title) title.textContent = 'Автоматические задания';
                    if (status) status.textContent = currentStatusMsg || 'Нажмите кнопку для старта сбора';
                    if (bar) {
                        bar.style.width = '0%';
                        bar.style.background = 'linear-gradient(90deg, var(--custom-theme-primary-color, #5865F2), var(--custom-theme-secondary-color, var(--custom-theme-primary-color, #5865F2)))';
                    }
                    if (actBtn) {
                        actBtn.disabled = false;
                        actBtn.textContent = 'Начать сбор';
                        actBtn.style.background = 'linear-gradient(135deg, var(--custom-theme-primary-color, #5865F2), var(--custom-theme-secondary-color, var(--custom-theme-primary-color, #5865F2)))';
                    }
                }
            }

            function stopQuests() {
                if (!questsRunning) return;
                questsRunning = false;
                for (const cleanup of activeCleanups) {
                    try { cleanup(); } catch (_) {}
                }
                activeCleanups = [];
                currentStatusMsg = 'Остановлено пользователем';
                updateQuestsWidgetUI();
                console.log('[DiscordExtensions Quests] Сбор квестов остановлен пользователем.');
            }

            async function runQuests() {
                if (questsRunning) return;
                questsRunning = true;
                allQuestsFinished = false;
                currentStatusMsg = 'Подключение к API Discord...';
                updateQuestsWidgetUI();

                console.log('[DiscordExtensions Quests] Запуск сбора квестов...');

                try {
                    let modules = getDiscordModules();
                    let api = modules.api;
                    let FluxDispatcher = modules.FluxDispatcher;
                    let RunningGameStore = modules.RunningGameStore;
                    let ApplicationStreamingStore = modules.ApplicationStreamingStore;

                    if (!api) {
                        for (let attempt = 0; attempt < 10; attempt++) {
                            await new Promise(r => setTimeout(r, 400));
                            modules = getDiscordModules();
                            api = modules.api;
                            FluxDispatcher = modules.FluxDispatcher;
                            RunningGameStore = modules.RunningGameStore;
                            ApplicationStreamingStore = modules.ApplicationStreamingStore;
                            if (api) break;
                        }
                    }

                    if (!api) {
                        currentStatusMsg = 'Не удалось подключиться к API Discord. Попробуйте еще раз';
                        questsRunning = false;
                        updateQuestsWidgetUI();
                        console.error('[DiscordExtensions Quests] RestAPI not found.');
                        return;
                    }

                    currentStatusMsg = 'Синхронизация заданий...';
                    updateQuestsWidgetUI();

                    let apiQuests = [];
                    try {
                        if (FluxDispatcher?.dispatch) {
                            FluxDispatcher.dispatch({ type: 'QUESTS_FETCH_CURRENT_QUESTS_BEGIN' });
                        }
                        const res = await Promise.race([
                            api.get({ url: '/quests/@me' }),
                            new Promise(r => setTimeout(() => r({ timedOut: true }), 3000))
                        ]);
                        if (res?.body) {
                            apiQuests = Array.isArray(res.body) ? res.body : (res.body.quests || []);
                        }
                    } catch (e) {
                        console.warn('[DiscordExtensions Quests] Fetch notice:', e.message);
                    }

                    let rawQuestsList = [];
                    const QuestsStore = modules.QuestsStore || findModuleExport(x => x?.getQuest || x?.__proto__?.getQuest);
                    if (QuestsStore?.quests) {
                        if (typeof QuestsStore.quests.values === 'function') rawQuestsList = [...QuestsStore.quests.values()];
                        else if (Array.isArray(QuestsStore.quests)) rawQuestsList = QuestsStore.quests;
                        else if (typeof QuestsStore.quests === 'object') rawQuestsList = Object.values(QuestsStore.quests);
                    }
                    if (rawQuestsList.length === 0 && apiQuests.length > 0) {
                        rawQuestsList = apiQuests;
                    }

                    const normalizedQuests = rawQuestsList.map(parseQuest).filter(Boolean);

                    const uncompletedList = normalizedQuests.filter(q => {
                        const notDone = !q.completedAt && (q.secondsDone < q.secondsNeeded || !q.secondsNeeded);
                        const hasTask = Boolean(q.taskName);
                        const notExpired = !q.expiresAt || new Date(q.expiresAt).getTime() > Date.now();
                        return notDone && hasTask && notExpired;
                    });

                    unclaimedQuestsList = normalizedQuests.filter(q =>
                        q.completedAt &&
                        !q.claimedAt &&
                        (!q.expiresAt || new Date(q.expiresAt).getTime() > Date.now())
                    );

                    for (const q of uncompletedList) {
                        try {
                            if (FluxDispatcher?.dispatch) {
                                FluxDispatcher.dispatch({ type: 'QUESTS_SELECT_TASK_PLATFORM', questId: q.id, platform: 'DESKTOP' });
                            }
                        } catch (_) {}

                        try {
                            const wp = getWebpackRequire();
                            if (wp && typeof wp === 'function') {
                                const m = wp(396813);
                                if (m && typeof m.lx === 'function') m.lx(q.id, 'DESKTOP');
                            }
                        } catch (_) {}

                        autoSelectDesktopPlatformInDOM();

                        if (!q.enrolledAt) {
                            try {
                                await Promise.race([
                                    api.post({ url: '/quests/' + q.id + '/enroll', body: { location: 1 } }),
                                    new Promise(r => setTimeout(() => r({ timedOut: true }), 2500))
                                ]);
                                console.log('[DiscordExtensions Quests] Принято задание на ПК:', q.questName);
                            } catch (_) {}
                            q.enrolledAt = new Date().toISOString();
                        }
                        autoSelectDesktopPlatformInDOM();
                    }

                    activeActionableQuests = [...uncompletedList];

                    if (activeActionableQuests.length === 0) {
                        questsRunning = false;
                        allQuestsFinished = (unclaimedQuestsList.length === 0);
                        if (unclaimedQuestsList.length > 0) {
                            currentStatusMsg = 'Задания выполнены! Готово к получению наград';
                        } else {
                            currentStatusMsg = 'Все доступные квесты выполнены и получены!';
                        }
                        updateQuestsWidgetUI();
                        console.log('[DiscordExtensions Quests] All quests complete and claimed.');
                        return;
                    }

                    console.log('[DiscordExtensions Quests] Очередь заданий:', activeActionableQuests.map(x => x.questName).join(', '));
                    const isApp = typeof DiscordNative !== 'undefined';

                    // 1. Run all Video tasks first
                    const videoQuests = activeActionableQuests.filter(q => q.taskName === 'WATCH_VIDEO' || q.taskName === 'WATCH_VIDEO_ON_MOBILE');
                    for (const vq of videoQuests) {
                        if (!questsRunning) break;
                        currentQuestName = vq.questName;
                        currentStatusMsg = 'Просмотр видео: ' + vq.questName;
                        updateQuestsWidgetUI();

                        const speed = 7;
                        let sDone = vq.secondsDone;
                        while (questsRunning && sDone < vq.secondsNeeded) {
                            const rem = Math.min(speed, vq.secondsNeeded - sDone);
                            await new Promise(r => setTimeout(r, rem * 1000));
                            if (!questsRunning) break;
                            const timestamp = sDone + speed;
                            try {
                                const res = await api.post({
                                    url: '/quests/' + vq.id + '/video-progress',
                                    body: { timestamp: Math.min(vq.secondsNeeded, timestamp + Math.random()) }
                                });
                                sDone = Math.min(vq.secondsNeeded, timestamp);
                                vq.secondsDone = sDone;
                                currentStatusMsg = 'Видео: ' + vq.secondsDone + ' / ' + vq.secondsNeeded + ' сек';
                                updateQuestsWidgetUI();
                                if (res.body?.completed_at != null || timestamp >= vq.secondsNeeded) break;
                            } catch (_) {
                                break;
                            }
                        }
                        if (questsRunning) {
                            try {
                                await api.post({ url: '/quests/' + vq.id + '/video-progress', body: { timestamp: vq.secondsNeeded } });
                            } catch (_) {}
                            console.log('[DiscordExtensions Quests] Видео завершено:', vq.questName);
                            vq.completedAt = new Date().toISOString();
                            activeActionableQuests = activeActionableQuests.filter(x => x.id !== vq.id);
                            unclaimedQuestsList.push(vq);
                            await claimQuestReward(vq.raw, api);
                            updateQuestsWidgetUI();
                        }
                    }

                    // 2. Run Desktop Game Play tasks sequentially (one by one)
                    const playQuests = activeActionableQuests.filter(q => q.taskName === 'PLAY_ON_DESKTOP');
                    if (playQuests.length > 0 && isApp && RunningGameStore && FluxDispatcher) {
                        for (let pIdx = 0; pIdx < playQuests.length; pIdx++) {
                            if (!questsRunning) break;
                            const pq = playQuests[pIdx];
                            currentQuestName = pq.questName;
                            currentStatusMsg = 'Подготовка игры (' + (pIdx + 1) + '/' + playQuests.length + '): ' + pq.questName;
                            updateQuestsWidgetUI();

                            let appData = {};
                            try {
                                if (pq.applicationId) {
                                    const pubRes = await api.get({ url: '/applications/public?application_ids=' + pq.applicationId });
                                    if (Array.isArray(pubRes?.body) && pubRes.body[0]) appData = pubRes.body[0];
                                }
                            } catch (_) {}

                            const appName = appData.name || pq.questName;
                            const exeName = appData.executables?.find(x => x.os === 'win32')?.name?.replace('>', '') || (appName.replace(/[^a-zA-Z0-9 _]/g, '') + '.exe');
                            const pid = Math.floor(Math.random() * 20000) + 10000;

                            const fakeGame = {
                                cmdLine: 'C:/Program Files/' + appName + '/' + exeName,
                                exeName,
                                exePath: 'c:/program files/' + appName.toLowerCase() + '/' + exeName,
                                hidden: true,
                                overlay: false,
                                overlayWarn: false,
                                isLauncher: false,
                                id: pq.applicationId,
                                name: appName,
                                pid: pid,
                                pidPath: [pid],
                                processName: appName,
                                start: Date.now()
                            };

                            const rawRealGames = RunningGameStore.getRunningGames();
                            const realGames = Array.isArray(rawRealGames) ? rawRealGames : [];
                            const realGetRunningGames = RunningGameStore.getRunningGames;
                            const realGetGameForPID = RunningGameStore.getGameForPID;

                            RunningGameStore.getRunningGames = () => [fakeGame];
                            RunningGameStore.getGameForPID = (p) => (p === pid ? fakeGame : undefined);
                            FluxDispatcher.dispatch({ type: 'RUNNING_GAMES_CHANGE', removed: realGames, added: [fakeGame], games: [fakeGame] });

                            const cleanupCurrentGame = () => {
                                RunningGameStore.getRunningGames = realGetRunningGames;
                                RunningGameStore.getGameForPID = realGetGameForPID;
                                FluxDispatcher.dispatch({ type: 'RUNNING_GAMES_CHANGE', removed: [fakeGame], added: realGames, games: realGames });
                            };
                            activeCleanups.push(cleanupCurrentGame);

                            let gameFinished = false;
                            const onHeartbeatSuccess = async (data) => {
                                if (!questsRunning || gameFinished) return;
                                const statusObj = data.userStatus || data;
                                const questId = data.questId || statusObj.quest_id;
                                if (questId !== pq.id) return;

                                const val = statusObj.progress?.PLAY_ON_DESKTOP?.value ?? statusObj.streamProgressSeconds;
                                if (typeof val === 'number') {
                                    pq.secondsDone = val;
                                    const mins = Math.floor(pq.secondsDone / 60);
                                    const totalMins = Math.ceil(pq.secondsNeeded / 60);
                                    currentStatusMsg = 'В игре: ' + pq.secondsDone + ' / ' + pq.secondsNeeded + ' сек (' + mins + '/' + totalMins + ' мин)';
                                    updateQuestsWidgetUI();
                                }
                                if (statusObj.completed_at || (typeof val === 'number' && val >= pq.secondsNeeded)) {
                                    gameFinished = true;
                                    pq.completedAt = statusObj.completed_at || new Date().toISOString();
                                }
                            };

                            FluxDispatcher.subscribe('QUESTS_SEND_HEARTBEAT_SUCCESS', onHeartbeatSuccess);

                            console.log('[DiscordExtensions Quests] Запущена игра:', pq.questName);
                            currentStatusMsg = 'В игре: ' + pq.secondsDone + ' / ' + pq.secondsNeeded + ' сек';
                            updateQuestsWidgetUI();

                            // Periodic authoritative server check
                            let stalledChecks = 0;
                            let lastDone = pq.secondsDone;
                            while (questsRunning && !gameFinished) {
                                await new Promise(r => setTimeout(r, 15000));
                                if (!questsRunning) break;
                                try {
                                    const meRes = await api.get({ url: '/quests/@me' });
                                    const freshQuests = (Array.isArray(meRes?.body) ? meRes.body : (meRes?.body?.quests || [])).map(parseQuest).filter(Boolean);
                                    const fresh = freshQuests.find(x => x.id === pq.id);
                                    if (fresh) {
                                        pq.secondsDone = fresh.secondsDone;
                                        if (fresh.completedAt || pq.secondsDone >= pq.secondsNeeded) {
                                            gameFinished = true;
                                            pq.completedAt = fresh.completedAt || new Date().toISOString();
                                            pq.raw = fresh.raw;
                                        } else {
                                            const mins = Math.floor(pq.secondsDone / 60);
                                            const totalMins = Math.ceil(pq.secondsNeeded / 60);
                                            currentStatusMsg = 'В игре: ' + pq.secondsDone + ' / ' + pq.secondsNeeded + ' сек (' + mins + '/' + totalMins + ' мин)';
                                            updateQuestsWidgetUI();
                                        }
                                    }
                                } catch (_) {}

                                if (pq.secondsDone === lastDone) {
                                    stalledChecks++;
                                    if (stalledChecks >= 6) {
                                        console.warn('[DiscordExtensions Quests] Игра не отвечает на запросы, пропускаем:', pq.questName);
                                        break;
                                    }
                                } else {
                                    stalledChecks = 0;
                                    lastDone = pq.secondsDone;
                                }
                            }

                            FluxDispatcher.unsubscribe('QUESTS_SEND_HEARTBEAT_SUCCESS', onHeartbeatSuccess);
                            cleanupCurrentGame();
                            activeCleanups = activeCleanups.filter(x => x !== cleanupCurrentGame);

                            if (gameFinished) {
                                console.log('[DiscordExtensions Quests] Игра успешно завершена:', pq.questName);
                                pq.completedAt = pq.completedAt || new Date().toISOString();
                                activeActionableQuests = activeActionableQuests.filter(x => x.id !== pq.id);
                                if (!unclaimedQuestsList.some(x => x.id === pq.id)) {
                                    unclaimedQuestsList.push(pq);
                                }
                                await claimQuestReward(pq.raw || pq, api);
                                updateQuestsWidgetUI();
                            }
                        }
                    }

                    // 3. Run Stream On Desktop tasks
                    const streamQuests = activeActionableQuests.filter(q => q.taskName === 'STREAM_ON_DESKTOP');
                    if (streamQuests.length > 0 && isApp && ApplicationStreamingStore && FluxDispatcher) {
                        for (let sIdx = 0; sIdx < streamQuests.length; sIdx++) {
                            if (!questsRunning) break;
                            const sq = streamQuests[sIdx];
                            currentQuestName = sq.questName;
                            currentStatusMsg = 'Стрим задания: ' + sq.questName;
                            updateQuestsWidgetUI();

                            const realStreamMeta = ApplicationStreamingStore.getStreamerActiveStreamMetadata;
                            ApplicationStreamingStore.getStreamerActiveStreamMetadata = () => ({
                                id: sq.applicationId,
                                pid: Math.floor(Math.random() * 20000) + 10000,
                                sourceName: null
                            });

                            let streamFinished = false;
                            const onStreamHeartbeat = (data) => {
                                if (!questsRunning || streamFinished) return;
                                const statusObj = data.userStatus || data;
                                const questId = data.questId || statusObj.quest_id;
                                if (questId !== sq.id) return;

                                const val = statusObj.progress?.STREAM_ON_DESKTOP?.value ?? statusObj.streamProgressSeconds;
                                if (typeof val === 'number') {
                                    sq.secondsDone = val;
                                    const mins = Math.floor(sq.secondsDone / 60);
                                    const totalMins = Math.ceil(sq.secondsNeeded / 60);
                                    currentStatusMsg = 'Стрим: ' + sq.secondsDone + ' / ' + sq.secondsNeeded + ' сек (' + mins + '/' + totalMins + ' мин)';
                                    updateQuestsWidgetUI();
                                }
                                if (statusObj.completed_at || (typeof val === 'number' && val >= sq.secondsNeeded)) {
                                    streamFinished = true;
                                    sq.completedAt = statusObj.completed_at || new Date().toISOString();
                                }
                            };

                            FluxDispatcher.subscribe('QUESTS_SEND_HEARTBEAT_SUCCESS', onStreamHeartbeat);

                            let streamStalls = 0;
                            let lastStreamDone = sq.secondsDone;
                            while (questsRunning && !streamFinished) {
                                await new Promise(r => setTimeout(r, 15000));
                                if (!questsRunning) break;
                                try {
                                    const meRes = await api.get({ url: '/quests/@me' });
                                    const freshQuests = (Array.isArray(meRes?.body) ? meRes.body : (meRes?.body?.quests || [])).map(parseQuest).filter(Boolean);
                                    const fresh = freshQuests.find(x => x.id === sq.id);
                                    if (fresh) {
                                        sq.secondsDone = fresh.secondsDone;
                                        if (fresh.completedAt || sq.secondsDone >= sq.secondsNeeded) {
                                            streamFinished = true;
                                            sq.completedAt = fresh.completedAt || new Date().toISOString();
                                            sq.raw = fresh.raw;
                                        }
                                    }
                                } catch (_) {}

                                if (sq.secondsDone === lastStreamDone) {
                                    streamStalls++;
                                    if (streamStalls >= 6) {
                                        console.warn('[DiscordExtensions Quests] Стрим не отвечает на запросы, пропускаем:', sq.questName);
                                        break;
                                    }
                                } else {
                                    streamStalls = 0;
                                    lastStreamDone = sq.secondsDone;
                                }
                            }

                            FluxDispatcher.unsubscribe('QUESTS_SEND_HEARTBEAT_SUCCESS', onStreamHeartbeat);
                            ApplicationStreamingStore.getStreamerActiveStreamMetadata = realStreamMeta;

                            if (streamFinished) {
                                activeActionableQuests = activeActionableQuests.filter(x => x.id !== sq.id);
                                if (!unclaimedQuestsList.some(x => x.id === sq.id)) unclaimedQuestsList.push(sq);
                                await claimQuestReward(sq.raw || sq, api);
                                updateQuestsWidgetUI();
                            }
                        }
                    }

                    // 4. Run Play Activity tasks
                    const activityQuests = activeActionableQuests.filter(q => q.taskName === 'PLAY_ACTIVITY');
                    if (activityQuests.length > 0 && ChannelStore && GuildChannelStore) {
                        for (const aq of activityQuests) {
                            if (!questsRunning) break;
                            currentQuestName = aq.questName;
                            currentStatusMsg = 'Активность: ' + aq.questName;
                            updateQuestsWidgetUI();

                            const channelId = ChannelStore.getSortedPrivateChannels?.()[0]?.id || Object.values(GuildChannelStore.getAllGuilds?.() || {}).find(x => x?.VOCAL?.length > 0)?.VOCAL[0]?.channel?.id;
                            if (channelId) {
                                const streamKey = 'call:' + channelId + ':1';
                                let actDone = aq.secondsDone;
                                while (questsRunning && actDone < aq.secondsNeeded) {
                                    await new Promise(r => setTimeout(r, 15000));
                                    if (!questsRunning) break;
                                    try {
                                        const res = await api.post({ url: '/quests/' + aq.id + '/heartbeat', body: { stream_key: streamKey, terminal: false } });
                                        const val = res.body?.progress?.PLAY_ACTIVITY?.value;
                                        if (typeof val === 'number') {
                                            actDone = val;
                                            aq.secondsDone = actDone;
                                            currentStatusMsg = 'Активность: ' + actDone + ' / ' + aq.secondsNeeded + ' сек';
                                            updateQuestsWidgetUI();
                                        }
                                        if (actDone >= aq.secondsNeeded) {
                                            await api.post({ url: '/quests/' + aq.id + '/heartbeat', body: { stream_key: streamKey, terminal: true } });
                                            aq.completedAt = new Date().toISOString();
                                            break;
                                        }
                                    } catch (_) {
                                        break;
                                    }
                                }
                                if (aq.completedAt) {
                                    activeActionableQuests = activeActionableQuests.filter(x => x.id !== aq.id);
                                    if (!unclaimedQuestsList.some(x => x.id === aq.id)) unclaimedQuestsList.push(aq);
                                    await claimQuestReward(aq.raw || aq, api);
                                    updateQuestsWidgetUI();
                                }
                            }
                        }
                    }

                    // 5. Overall completion check
                    const remaining = activeActionableQuests.filter(q => !q.completedAt && q.secondsDone < q.secondsNeeded);
                    if (remaining.length === 0) {
                        questsRunning = false;
                        allQuestsFinished = (unclaimedQuestsList.length === 0);
                        if (unclaimedQuestsList.length > 0) {
                            currentStatusMsg = 'Задания выполнены! Готово к получению наград';
                        } else {
                            currentStatusMsg = 'Все доступные награды получены!';
                        }
                        updateQuestsWidgetUI();
                        console.log('[DiscordExtensions Quests] Все запланированные квесты выполнены.');
                    }

                } catch (err) {
                    console.error('[DiscordExtensions Quests] Ошибка модуля:', err);
                    questsRunning = false;
                    currentStatusMsg = 'Ошибка запуска модуля';
                    updateQuestsWidgetUI();
                }
            }

            window.__DISCORD_EXT_START_QUESTS = runQuests;
            window.__DISCORD_EXT_STOP_QUESTS = stopQuests;
            window.__DISCORD_EXT_CLAIM_QUEST = async function() {
                if (unclaimedQuestsList.length > 0) {
                    const targetQuest = unclaimedQuestsList[0];
                    const modules = getDiscordModules();
                    await claimQuestReward(targetQuest.raw || targetQuest, modules.api);
                    unclaimedQuestsList = unclaimedQuestsList.filter(x => x.id !== targetQuest.id);
                    updateQuestsWidgetUI();
                    return true;
                }
                return false;
            };
            window.__DISCORD_EXT_GET_QUESTS_STATUS = function() {
                let questName = '';
                let secondsDone = 0;
                let secondsNeeded = 0;
                if (activeActionableQuests.length > 0) {
                    const q = activeActionableQuests[0];
                    questName = q.questName || '';
                    secondsDone = q.secondsDone || 0;
                    secondsNeeded = q.secondsNeeded || 0;
                } else if (unclaimedQuestsList.length > 0) {
                    questName = unclaimedQuestsList[0].questName || '';
                }
                return {
                    running: questsRunning,
                    activeCount: activeActionableQuests.length,
                    unclaimedCount: unclaimedQuestsList.length,
                    questName: questName,
                    secondsDone: secondsDone,
                    secondsNeeded: secondsNeeded,
                    statusMsg: currentStatusMsg,
                    allFinished: allQuestsFinished
                };
            };

            setInterval(() => {
                if (showWidgetEnabled) {
                    updateQuestsWidgetUI();
                }
            }, 3000);

            setInterval(async () => {
                try {
                    if (autoCollectEnabled && !questsRunning) {
                        await runQuests();
                    }
                } catch (_) {}
            }, 30 * 60 * 1000);

            if (document.body) {
                updateQuestsWidgetUI();
            } else {
                document.addEventListener('DOMContentLoaded', updateQuestsWidgetUI);
            }

            setTimeout(() => {
                try {
                    if (autoCollectEnabled && !questsRunning) {
                        runQuests();
                    }
                } catch (_) {}
            }, 6000);
        })();
    `;

    win.webContents.executeJavaScript(questsScript).then(() => {
        writeLog('Quests module successfully injected into window:', win.id);
    }).catch(err => {
        writeLog('Quests module injection error in window ' + win.id + ':', err.message);
    });
}

module.exports = {
    injectQuestsModule
};
