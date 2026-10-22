(function() {
    'use strict';
    const SCRIPT_ID = 'discord-ext-auto-translator';
    if (window[SCRIPT_ID]) return;
    window[SCRIPT_ID] = true;

    async function translateText(text, targetLang = 'ru') {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        const data = await res.json();
        return data[0].map(item => item[0]).join('');
    }

    function addTranslateButtons() {
        const messages = document.querySelectorAll('[class*="messageContent-"]');
        for (const msg of messages) {
            if (msg.dataset.hasTranslateBtn) continue;
            msg.dataset.hasTranslateBtn = 'true';

            const btn = document.createElement('span');
            btn.title = 'Перевести сообщение';
            btn.style.cssText = 'display:inline-block;margin-left:8px;cursor:pointer;font-size:12px;opacity:0.6;transition:opacity 0.2s;user-select:none;';
            btn.textContent = '🌐';
            btn.onmouseenter = () => { btn.style.opacity = '1'; };
            btn.onmouseleave = () => { btn.style.opacity = '0.6'; };

            btn.onclick = async (e) => {
                e.stopPropagation();
                if (msg.dataset.translated) {
                    const existing = msg.parentElement.querySelector('.discord-ext-translation');
                    if (existing) existing.remove();
                    delete msg.dataset.translated;
                    return;
                }
                const originalText = msg.textContent.replace('🌐', '').trim();
                if (!originalText) return;
                try {
                    btn.textContent = '⏳';
                    const translated = await translateText(originalText, 'ru');
                    btn.textContent = '🌐';
                    msg.dataset.translated = 'true';

                    const transBox = document.createElement('div');
                    transBox.className = 'discord-ext-translation';
                    transBox.style.cssText = 'margin-top:4px;padding:6px 10px;background:#2b2d31;border-left:3px solid #5865F2;border-radius:4px;font-size:13px;color:#DBDEE1;line-height:1.4;';
                    transBox.textContent = translated;
                    msg.parentElement.appendChild(transBox);
                } catch (err) {
                    btn.textContent = '❌';
                }
            };

            msg.appendChild(btn);
        }
    }

    const observer = new MutationObserver(addTranslateButtons);
    observer.observe(document.body, { childList: true, subtree: true });
    addTranslateButtons();
})();
