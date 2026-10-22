(function() {
    'use strict';
    const SCRIPT_ID = 'discord-ext-platform-indicators';
    if (window[SCRIPT_ID]) return;
    window[SCRIPT_ID] = true;

    function scanMembers() {
        // Find avatar containers that have mobile indicator or status badges
        const members = document.querySelectorAll('[class*="member-"], [class*="channel-"]');
        for (const m of members) {
            if (m.dataset.hasPlatformIndicator) continue;
            const mobileIcon = m.querySelector('rect[mask*="mobile"]');
            if (mobileIcon) {
                m.dataset.hasPlatformIndicator = 'true';
                const nameEl = m.querySelector('[class*="name-"]') || m.querySelector('[class*="username-"]');
                if (nameEl && !nameEl.querySelector('.discord-ext-platform-badge')) {
                    const badge = document.createElement('span');
                    badge.className = 'discord-ext-platform-badge';
                    badge.title = 'Пользователь на мобильном устройстве';
                    badge.style.cssText = 'font-size:11px;margin-left:4px;opacity:0.8;';
                    badge.textContent = '📱';
                    nameEl.appendChild(badge);
                }
            }
        }
    }

    const observer = new MutationObserver(scanMembers);
    observer.observe(document.body, { childList: true, subtree: true });
    scanMembers();
})();
