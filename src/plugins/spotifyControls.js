(function() {
    'use strict';
    const SCRIPT_ID = 'discord-ext-spotify-controls';
    if (window[SCRIPT_ID]) return;
    window[SCRIPT_ID] = true;

    function injectSpotifyBar() {
        const panels = document.querySelector('[class*="panels-"]');
        if (!panels || document.getElementById('discord-ext-spotify-widget')) return;

        // Check if user has Spotify activity
        const activityCard = document.querySelector('[class*="activityPanel-"]') || document.querySelector('[class*="activity-"]');
        const isSpotify = activityCard && activityCard.textContent.toLowerCase().includes('spotify');

        const widget = document.createElement('div');
        widget.id = 'discord-ext-spotify-widget';
        widget.style.cssText = 'padding:8px 12px;background:#18191c;border-top:1px solid #232428;display:flex;align-items:center;justify-content:space-between;font-size:12px;color:#DBDEE1;';
        widget.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;overflow:hidden;max-width:160px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#1DB954" style="flex-shrink:0;">
                    <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.35-1.434-5.308-1.758-8.793-.963-.335.077-.67-.133-.746-.468-.077-.334.132-.67.467-.746 3.808-.87 7.076-.51 9.721 1.113.295.18.388.563.208.857zm1.226-2.724c-.226.367-.706.482-1.072.257-2.687-1.652-6.785-2.131-9.965-1.166-.413.127-.85-.106-.976-.52-.126-.413.107-.85.52-.976 3.632-1.102 8.147-.568 11.236 1.332.366.226.482.706.257 1.073zm.106-2.835C14.692 8.95 9.375 8.775 6.297 9.71c-.493.15-.995-.145-1.144-.637-.15-.493.144-.995.637-1.144 3.555-1.078 9.427-.872 13.14 1.334.444.263.59.84.327 1.284-.264.443-.84.59-1.284.326z"/>
                </svg>
                <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    <div id="sp-track-name" style="font-weight:600;color:#FFF;overflow:hidden;text-overflow:ellipsis;">Spotify</div>
                    <div id="sp-artist-name" style="font-size:10px;color:#949BA4;overflow:hidden;text-overflow:ellipsis;">Активно</div>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
                <button id="sp-btn-prev" style="background:none;border:none;color:#949BA4;cursor:pointer;font-size:14px;">⏮</button>
                <button id="sp-btn-play" style="background:none;border:none;color:#FFF;cursor:pointer;font-size:16px;">⏯</button>
                <button id="sp-btn-next" style="background:none;border:none;color:#949BA4;cursor:pointer;font-size:14px;">⏭</button>
            </div>
        `;

        panels.prepend(widget);

        // Control handlers via media keys or local intents
        document.getElementById('sp-btn-play').onclick = () => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'MediaPlayPause', code: 'MediaPlayPause' }));
        };
        document.getElementById('sp-btn-prev').onclick = () => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'MediaTrackPrevious', code: 'MediaTrackPrevious' }));
        };
        document.getElementById('sp-btn-next').onclick = () => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'MediaTrackNext', code: 'MediaTrackNext' }));
        };
    }

    const observer = new MutationObserver(injectSpotifyBar);
    observer.observe(document.body, { childList: true, subtree: true });
    injectSpotifyBar();
})();
