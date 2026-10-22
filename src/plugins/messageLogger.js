(function() {
    'use strict';
    const SCRIPT_ID = 'discord-ext-message-logger';
    if (window[SCRIPT_ID]) return;
    window[SCRIPT_ID] = true;

    const deletedMessages = new WeakSet();

    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            for (const node of m.removedNodes) {
                if (node.nodeType === 1 && (node.matches && (node.matches('[id^="chat-messages-"]') || node.querySelector('[id^="chat-messages-"]')))) {
                    const msgEl = node.matches('[id^="chat-messages-"]') ? node : node.querySelector('[id^="chat-messages-"]');
                    if (msgEl && !deletedMessages.has(msgEl)) {
                        deletedMessages.add(msgEl);
                        const clone = msgEl.cloneNode(true);
                        clone.style.borderLeft = '3px solid #F23F43';
                        clone.style.backgroundColor = 'rgba(242, 63, 67, 0.08)';
                        clone.style.paddingLeft = '6px';
                        
                        const badge = document.createElement('span');
                        badge.style.cssText = 'color:#F23F43;font-size:10px;font-weight:700;margin-left:6px;background:rgba(242,63,67,0.15);padding:1px 4px;border-radius:3px;';
                        badge.textContent = 'УДАЛЕНО';
                        
                        const header = clone.querySelector('[class*="header-"]') || clone;
                        header.appendChild(badge);

                        if (m.target && m.target.isConnected) {
                            m.target.insertBefore(clone, m.nextSibling || null);
                        }
                    }
                }
            }
        }
    });

    const initObserver = () => {
        const scroller = document.querySelector('[class*="messagesWrapper-"]') || document.body;
        if (scroller) {
            observer.observe(scroller, { childList: true, subtree: true });
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initObserver);
    } else {
        initObserver();
    }
})();
