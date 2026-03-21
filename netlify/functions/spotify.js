const https = require('https');

function post(options, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function get(options) {
    return new Promise((resolve, reject) => {
        https.get(options, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

async function getAccessToken() {
    const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN } = process.env;
    const credentials = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
    const body = new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: SPOTIFY_REFRESH_TOKEN,
    }).toString();

    const data = await post({
        hostname: 'accounts.spotify.com',
        path:     '/api/token',
        method:   'POST',
        headers: {
            'Authorization':  `Basic ${credentials}`,
            'Content-Type':   'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body),
        },
    }, body);

    if (!data.access_token) throw new Error('Failed to get access token: ' + JSON.stringify(data));
    return data.access_token;
}

exports.handler = async () => {
    try {
        const token = await getAccessToken();

        const headers = {
            hostname: 'api.spotify.com',
            headers: { 'Authorization': `Bearer ${token}` },
        };

        const [topArtists, recentTracks] = await Promise.all([
            get({ ...headers, path: '/v1/me/top/artists?limit=6&time_range=medium_term' }),
            get({ ...headers, path: '/v1/me/player/recently-played?limit=5' }),
        ]);

        const artists = (topArtists.items || []).map(a => ({
            name:      a.name,
            genres:    (a.genres || []).slice(0, 2),
            image:     a.images?.[1]?.url || a.images?.[0]?.url || null,
            url:       a.external_urls.spotify,
            followers: a.followers.total,
        }));

        const recent = (recentTracks.items || []).map(i => ({
            track:  i.track.name,
            artist: i.track.artists.map(a => a.name).join(', '),
            url:    i.track.external_urls.spotify,
            image:  i.track.album.images?.[2]?.url || null,
        }));

        return {
            statusCode: 200,
            headers: {
                'Content-Type':                'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control':               's-maxage=300, stale-while-revalidate',
            },
            body: JSON.stringify({ artists, recent }),
        };
    } catch (err) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message }),
        };
    }
};
