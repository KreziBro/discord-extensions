(function() {
    'use strict';
    const SCRIPT_ID = 'discord-ext-volume-booster';
    if (window[SCRIPT_ID]) return;
    window[SCRIPT_ID] = true;

    // Observe range inputs to extend max volume to 400%
    const extendSliders = () => {
        const sliders = document.querySelectorAll('input[type="range"][max="200"]');
        for (const s of sliders) {
            s.setAttribute('max', '400');
        }
    };

    const observer = new MutationObserver(extendSliders);
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    extendSliders();
})();
