(function() {
    'use strict';
    const SCRIPT_ID = 'discord-ext-open-in-app';
    if (window[SCRIPT_ID]) return;
    window[SCRIPT_ID] = true;

    document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (!link || !link.href) return;

        const href = link.href;

        // Spotify link -> spotify:track/... or spotify:album/...
        const spotifyMatch = href.match(/^https?:\/\/open\.spotify\.com\/(track|album|artist|playlist)\/([a-zA-Z0-9]+)/);
        if (spotifyMatch) {
            e.preventDefault();
            e.stopPropagation();
            window.open(`spotify:${spotifyMatch[1]}:${spotifyMatch[2]}`);
            return;
        }

        // Steam store or profile
        const steamMatch = href.match(/^https?:\/\/store\.steampowered\.com\/app\/([0-9]+)/);
        if (steamMatch) {
            e.preventDefault();
            e.stopPropagation();
            window.open(`steam://store/${steamMatch[1]}`);
            return;
        }

        // Steam community profile
        const steamProfile = href.match(/^https?:\/\/steamcommunity\.com\/(id|profiles)\/([^/]+)/);
        if (steamProfile) {
            e.preventDefault();
            e.stopPropagation();
            window.open(`steam://url/SteamIDPage/${steamProfile[2]}`);
            return;
        }
    }, true);
})();
