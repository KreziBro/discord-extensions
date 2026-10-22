(function() {
    'use strict';
    const STYLE_ID = 'discord-ext-server-grid';
    if (document.getElementById(STYLE_ID)) return;

    const css = `
        /* Discord Extensions 2-column server grid */
        [class*="guilds-"] [class*="tree-"] [data-list-id="guildsnav"] {
            width: 110px !important;
            display: flex !important;
            flex-wrap: wrap !important;
            justify-content: center !important;
            gap: 4px !important;
        }

        [class*="guilds-"] {
            width: 120px !important;
        }

        [class*="guilds-"] [class*="listItem-"] {
            width: 48px !important;
            height: 48px !important;
            margin-bottom: 4px !important;
        }

        [class*="guilds-"] [class*="listItem-"] [class*="wrapper-"] {
            width: 48px !important;
            height: 48px !important;
        }
    `;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
})();
