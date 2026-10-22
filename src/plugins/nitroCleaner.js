(function() {
    'use strict';
    const STYLE_ID = 'discord-ext-nitro-cleaner';
    if (document.getElementById(STYLE_ID)) return;

    const css = `
        /* Hide Nitro Store and Shop in navigation */
        [data-list-item-id="guildsnav___nitro"],
        [data-list-item-id="guildsnav___shop"],
        a[href="/store"],
        a[href="/shop"],
        /* Hide Gift buttons in chat text areas */
        [aria-label*="gift" i],
        [aria-label*="подарок" i],
        [aria-label*="подарить" i],
        button[aria-label*="Nitro" i],
        /* Hide Nitro badges and promotional banners in settings and popouts */
        [class*="premiumIcon"],
        [class*="upsellBanner"],
        [class*="nitroUpsell"],
        [class*="tryNitroButton"],
        [class*="marketingButton"] {
            display: none !important;
        }
    `;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
})();
