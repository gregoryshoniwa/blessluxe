<?php

namespace App\Http\Controllers;

use App\Services\Media;

/**
 * Old media links, after the files have moved to a bucket.
 *
 * Thousands of URLs were saved while files lived on the server's own disk —
 * "/storage/products/x.jpg", "/ai/logos/y.png", "/uploads/…" — in the database,
 * in emails already sent, in chat messages. Rewriting all of those is risky and
 * can never reach the emails. Instead the old address keeps working: a request
 * for one that is no longer on this machine is pointed at the same file in the
 * bucket.
 *
 * The web server only hands a request here when no real file matched, so local
 * development (where the files ARE on disk) never reaches this at all.
 */
class MediaController extends Controller
{
    public function legacy(string $root, string $path)
    {
        // Nothing to redirect to unless files actually live somewhere else.
        abort_unless(Media::isRemote(), 404);

        // The local `public` disk was served under /storage, so its keys have no
        // prefix; files written straight into public/ keep their folder name.
        $key = Media::key($root === 'storage' ? $path : "$root/$path");
        abort_if($key === null, 404);

        // The target is always OUR bucket plus a sanitised key — never anything
        // taken from the request — so this cannot be used as an open redirect.
        // 302 rather than 301: a permanent redirect is cached by browsers forever,
        // and the bucket's address may change (a custom media domain later).
        return redirect()->away(Media::url($key), 302)
            ->header('Cache-Control', 'public, max-age=86400');
    }
}
