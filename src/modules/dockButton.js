const { writeLog } = require('./logger');
const { getConfig } = require('./config');

function injectDockButton(win, managerWindow) {
    if (!win || win.isDestroyed() || win === managerWindow) return;
    const url = win.webContents.getURL() || '';
    if (!url || (!url.includes('discord.com/app') && !url.includes('discord.com/channels'))) {
        return;
    }
    writeLog('Injecting Dock button into window:', win.id);

    const clientConfig = getConfig();
    const dockScript = `
        (function() {
            if (window.__DISCORD_EXT_DOCK_LOADED__) {
                if (typeof window.__DISCORD_EXT_SET_DOCK_VISIBLE === 'function') {
                    window.__DISCORD_EXT_SET_DOCK_VISIBLE(${Boolean(clientConfig.showDockButton)});
                }
                return;
            }
            window.__DISCORD_EXT_DOCK_LOADED__ = true;

            let isDockConfiguredVisible = ${Boolean(clientConfig.showDockButton)};
            let currentDockPosition = ${JSON.stringify(clientConfig.dockPosition || 'bottom-right')};
            let customPos = ${JSON.stringify(clientConfig.dockCustomPosition || { x: 24, y: 24 })};

            function getDockPositionCss(pos) {
                switch (pos) {
                    case 'bottom-left':
                        return 'bottom:16px;left:16px;top:auto;right:auto;';
                    case 'top-right':
                        return 'top:16px;right:16px;bottom:auto;left:auto;';
                    case 'top-left':
                        return 'top:16px;left:16px;bottom:auto;right:auto;';
                    case 'custom':
                        return 'left:' + (customPos.x || 24) + 'px;top:' + (customPos.y || 24) + 'px;bottom:auto;right:auto;';
                    case 'header-titlebar':
                    case 'toolbar-only':
                        return 'display:none !important;';
                    case 'bottom-right':
                    default:
                        return 'bottom:16px;right:16px;top:auto;left:auto;';
                }
            }

            function isStrictlyMainWindow() {
                try {
                    if (window.__OVERLAY__ || window !== window.top) return false;
                    const href = (window.location.href || '').toLowerCase();
                    if (href.includes('/overlay') || href.includes('popout')) return false;
                    return true;
                } catch (e) {
                    return false;
                }
            }

            window.__DISCORD_EXT_SET_DOCK_POSITION = function(pos) {
                currentDockPosition = pos || 'bottom-right';
                const btn = document.getElementById('discord-ext-dock-btn');
                const isFloating = currentDockPosition !== 'header-titlebar' && currentDockPosition !== 'toolbar-only';
                if (btn) {
                    btn.style.cssText = 'position:fixed;' + getDockPositionCss(currentDockPosition) + 'z-index:9999999;width:44px;height:44px;border-radius:50%;background:#5865F2;display:' + (isDockConfiguredVisible && isFloating ? 'flex' : 'none') + ';align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,0.45);transition:background 0.2s ease;user-select:none;';
                }
                updateHeaderPill();
            };

            window.__DISCORD_EXT_SET_DOCK_VISIBLE = function(visible, pos) {
                isDockConfiguredVisible = Boolean(visible);
                if (pos) currentDockPosition = pos;
                let btn = document.getElementById('discord-ext-dock-btn');
                let tbBtn = document.getElementById('discord-ext-toolbar-btn');
                if (!isStrictlyMainWindow()) {
                    if (btn) btn.remove();
                    if (tbBtn) tbBtn.remove();
                    const hp = document.getElementById('discord-ext-header-pill');
                    if (hp) hp.remove();
                    return;
                }

                const isFloating = currentDockPosition !== 'header-titlebar' && currentDockPosition !== 'toolbar-only';

                if (!btn && isDockConfiguredVisible) {
                    btn = document.createElement('div');
                    btn.id = 'discord-ext-dock-btn';
                    btn.title = 'Discord Extensions (Ctrl + Shift + E)';
                    btn.style.cssText = 'position:fixed;' + getDockPositionCss(currentDockPosition) + 'z-index:9999999;width:44px;height:44px;border-radius:50%;background:#5865F2;display:' + (isFloating ? 'flex' : 'none') + ';align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,0.45);transition:background 0.2s ease;user-select:none;';
                    btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09-.01-.02-.04-.03-.07-.03-1.5.26-2.93.71-4.27 1.33-.01 0-.02.01-.03.02-2.72 4.07-3.47 8.03-3.1 11.95 0 .02.01.04.03.05 1.8 1.32 3.53 2.12 5.24 2.65.03.01.06 0 .07-.02.4-.55.76-1.13 1.07-1.74.02-.04 0-.08-.04-.09-.57-.22-1.11-.48-1.64-.78-.04-.02-.04-.08-.01-.11.11-.08.22-.17.33-.25.02-.02.05-.02.07-.01 3.44 1.57 7.15 1.57 10.55 0 .02-.01.05-.01.07.01.11.09.22.17.33.26.04.03.04.09-.01.11-.52.31-1.07.56-1.64.78-.04.01-.05.06-.04.09.32.61.68 1.19 1.07 1.74.03.01.06.02.09.01 1.72-.53 3.45-1.33 5.25-2.65.02-.01.03-.03.03-.05.44-4.53-.73-8.46-3.1-11.95-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.83 2.12-1.89 2.12z"/></svg>';

                    // Dragging logic for custom / any position
                    let isDragging = false;
                    let startMouseX = 0;
                    let startMouseY = 0;
                    let startBtnX = 0;
                    let startBtnY = 0;
                    let hasMoved = false;

                    btn.onmousedown = (e) => {
                        if (e.button !== 0) return;
                        isDragging = true;
                        hasMoved = false;
                        startMouseX = e.clientX;
                        startMouseY = e.clientY;
                        const rect = btn.getBoundingClientRect();
                        startBtnX = rect.left;
                        startBtnY = rect.top;

                        const onMouseMove = (ev) => {
                            if (!isDragging) return;
                            const dx = ev.clientX - startMouseX;
                            const dy = ev.clientY - startMouseY;
                            if (Math.hypot(dx, dy) > 4) {
                                hasMoved = true;
                                currentDockPosition = 'custom';
                                const newX = Math.max(0, Math.min(window.innerWidth - 44, startBtnX + dx));
                                const newY = Math.max(0, Math.min(window.innerHeight - 44, startBtnY + dy));
                                customPos = { x: newX, y: newY };
                                btn.style.left = newX + 'px';
                                btn.style.top = newY + 'px';
                                btn.style.bottom = 'auto';
                                btn.style.right = 'auto';
                            }
                        };

                        const onMouseUp = () => {
                            isDragging = false;
                            document.removeEventListener('mousemove', onMouseMove);
                            document.removeEventListener('mouseup', onMouseUp);
                            if (hasMoved) {
                                console.log('__DISCORD_EXT_SAVE_DOCK_CUSTOM_POS__:' + customPos.x + ':' + customPos.y);
                            }
                        };

                        document.addEventListener('mousemove', onMouseMove);
                        document.addEventListener('mouseup', onMouseUp);
                    };

                    btn.onclick = (e) => {
                        if (hasMoved) {
                            e.stopPropagation();
                            return;
                        }
                        e.stopPropagation();
                        console.log('__DISCORD_EXT_OPEN_MANAGER__');
                    };

                    btn.onmouseenter = () => { btn.style.background = '#4752C4'; };
                    btn.onmouseleave = () => { btn.style.background = '#5865F2'; };

                    (document.body || document.documentElement).appendChild(btn);
                }
                if (btn) {
                    btn.style.display = (isDockConfiguredVisible && isFloating) ? 'flex' : 'none';
                    btn.style.cssText = 'position:fixed;' + getDockPositionCss(currentDockPosition) + 'z-index:9999999;width:44px;height:44px;border-radius:50%;background:#5865F2;display:' + (isDockConfiguredVisible && isFloating ? 'flex' : 'none') + ';align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,0.45);transition:background 0.2s ease;user-select:none;';
                }
                if (tbBtn) {
                    tbBtn.style.display = isDockConfiguredVisible ? 'flex' : 'none';
                }
                updateHeaderPill();
            };

            function findHeaderContainer() {
                const topBar = document.querySelector('section[class*="title_"] [class*="children_"]') ||
                               document.querySelector('[class*="titleWrapper_"] [class*="children_"]') ||
                               document.querySelector('div[class*="subtitleContainer_"]') ||
                               document.querySelector('section[class*="title_"]');
                if (topBar) return topBar;

                const sideHeader = document.querySelector('header[class*="header_"]') ||
                                   document.querySelector('[class*="sidebar_"] header') ||
                                   document.querySelector('[class*="searchBar_"]');
                if (sideHeader) return sideHeader;

                return document.querySelector('[class*="titleBar_"]') || document.querySelector('nav[class*="container_"]');
            }

            function updateHeaderPill() {
                const isHeaderMode = currentDockPosition === 'header-titlebar';
                let pill = document.getElementById('discord-ext-header-pill');
                if (!isHeaderMode || !isDockConfiguredVisible) {
                    if (pill) pill.remove();
                    return;
                }

                const container = findHeaderContainer();
                if (!container) return;

                if (!pill) {
                    pill = document.createElement('div');
                    pill.id = 'discord-ext-header-pill';
                    pill.title = 'Discord Extensions (Ctrl + Shift + E)';
                    pill.style.cssText = 'display:inline-flex; align-items:center; gap:6px; padding:3px 10px; background:rgba(88,101,242,0.18); border:1px solid #5865F2; border-radius:6px; color:#FFFFFF; font-size:12px; font-weight:700; cursor:pointer; margin-left:8px; margin-right:8px; z-index:9999; transition:all 0.15s ease; user-select:none; flex-shrink:0;';
                    pill.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09-.01-.02-.04-.03-.07-.03-1.5.26-2.93.71-4.27 1.33-.01 0-.02.01-.03.02-2.72 4.07-3.47 8.03-3.1 11.95 0 .02.01.04.03.05 1.8 1.32 3.53 2.12 5.24 2.65.03.01.06 0 .07-.02.4-.55.76-1.13 1.07-1.74.02-.04 0-.08-.04-.09-.57-.22-1.11-.48-1.64-.78-.04-.02-.04-.08-.01-.11.11-.08.22-.17.33-.25.02-.02.05-.02.07-.01 3.44 1.57 7.15 1.57 10.55 0 .02-.01.05-.01.07.01.11.09.22.17.33.26.04.03.04.09-.01.11-.52.31-1.07.56-1.64.78-.04.01-.05.06-.04.09.32.61.68 1.19 1.07 1.74.03.01.06.02.09.01 1.72-.53 3.45-1.33 5.25-2.65.02-.01.03-.03.03-.05.44-4.53-.73-8.46-3.1-11.95-.01-.01-.02-.02-.04-.02z"/></svg><span>Discord Extensions</span>';
                    pill.onmouseenter = () => { pill.style.background = '#5865F2'; };
                    pill.onmouseleave = () => { pill.style.background = 'rgba(88,101,242,0.18)'; };
                    pill.onclick = (e) => {
                        e.stopPropagation();
                        console.log('__DISCORD_EXT_OPEN_MANAGER__');
                    };
                }

                if (!container.contains(pill)) {
                    if (container.firstChild) {
                        container.insertBefore(pill, container.firstChild.nextSibling || container.firstChild);
                    } else {
                        container.appendChild(pill);
                    }
                }
            }

            function injectToolbarIcon() {
                try {
                    const toolbar = document.querySelector('div[class*="toolbar_"], section[class*="title_"] [class*="toolbar_"]');
                    if (!toolbar) return;
                    if (document.getElementById('discord-ext-toolbar-btn')) return;

                    const tbBtn = document.createElement('div');
                    tbBtn.id = 'discord-ext-toolbar-btn';
                    tbBtn.setAttribute('role', 'button');
                    tbBtn.setAttribute('tabindex', '0');
                    tbBtn.setAttribute('aria-label', 'Discord Extensions');
                    tbBtn.title = 'Discord Extensions (Ctrl + Shift + E)';
                    tbBtn.style.cssText = 'display:flex; align-items:center; justify-content:center; width:24px; height:24px; margin:0 4px; cursor:pointer; color:#b5bac1; border-radius:4px; transition:color 0.15s ease, background 0.15s ease;';
                    tbBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09-.01-.02-.04-.03-.07-.03-1.5.26-2.93.71-4.27 1.33-.01 0-.02.01-.03.02-2.72 4.07-3.47 8.03-3.1 11.95 0 .02.01.04.03.05 1.8 1.32 3.53 2.12 5.24 2.65.03.01.06 0 .07-.02.4-.55.76-1.13 1.07-1.74.02-.04 0-.08-.04-.09-.57-.22-1.11-.48-1.64-.78-.04-.02-.04-.08-.01-.11.11-.08.22-.17.33-.25.02-.02.05-.02.07-.01 3.44 1.57 7.15 1.57 10.55 0 .02-.01.05-.01.07.01.11.09.22.17.33.26.04.03.04.09-.01.11-.52.31-1.07.56-1.64.78-.04.01-.05.06-.04.09.32.61.68 1.19 1.07 1.74.03.01.06.02.09.01 1.72-.53 3.45-1.33 5.25-2.65.02-.01.03-.03.03-.05.44-4.53-.73-8.46-3.1-11.95-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.83 2.12-1.89 2.12z"/></svg>';
                    tbBtn.onmouseenter = () => { tbBtn.style.color = '#f2f3f5'; tbBtn.style.background = 'rgba(255,255,255,0.08)'; };
                    tbBtn.onmouseleave = () => { tbBtn.style.color = '#b5bac1'; tbBtn.style.background = 'transparent'; };
                    tbBtn.onclick = (e) => {
                        e.stopPropagation();
                        console.log('__DISCORD_EXT_OPEN_MANAGER__');
                    };
                    toolbar.insertBefore(tbBtn, toolbar.firstChild);
                } catch (_) {}
            }

            function updateDock() {
                if (!isStrictlyMainWindow()) {
                    const btn = document.getElementById('discord-ext-dock-btn');
                    if (btn) btn.remove();
                    const tbBtn = document.getElementById('discord-ext-toolbar-btn');
                    if (tbBtn) tbBtn.remove();
                    const hp = document.getElementById('discord-ext-header-pill');
                    if (hp) hp.remove();
                    return;
                }
                window.__DISCORD_EXT_SET_DOCK_VISIBLE(isDockConfiguredVisible);
                if (isDockConfiguredVisible) {
                    injectToolbarIcon();
                    updateHeaderPill();
                }
            }

            if (document.body) {
                updateDock();
            } else {
                document.addEventListener('DOMContentLoaded', updateDock);
            }

            try {
                const headerObserver = new MutationObserver(() => {
                    if (currentDockPosition === 'header-titlebar') {
                        updateHeaderPill();
                    }
                });
                headerObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
            } catch (_) {}

            setInterval(updateDock, 1500);

            window.addEventListener('keydown', (e) => {
                const isKeyE = e.code === 'KeyE' || (e.key && (e.key.toLowerCase() === 'e' || e.key.toLowerCase() === 'у'));
                if (e.ctrlKey && e.shiftKey && isKeyE) {
                    e.preventDefault();
                    console.log('__DISCORD_EXT_OPEN_MANAGER__');
                }
            }, true);
        })();
    `;
    win.webContents.executeJavaScript(dockScript).then(() => {
        writeLog('Dock button script executed successfully in window:', win.id);
    }).catch(err => {
        writeLog('Dock button script error in window ' + win.id + ':', err.message);
    });
}

module.exports = {
    injectDockButton
};
