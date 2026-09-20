<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Where uploaded and generated files live
    |--------------------------------------------------------------------------
    |
    | Every file a person uploads or the AI renders — product photos, banners,
    | chat images, avatars, logos — goes to ONE disk, chosen here.
    |
    |   local development   `public`  (storage/app/public, served at /storage)
    |   production          the name of the object-storage bucket attached in
    |                       Laravel Cloud, e.g. `media`
    |
    | This exists because Laravel Cloud's own disk does not survive a deploy:
    | anything written next to the code is gone the next time the app ships.
    | The bucket (Cloudflare R2) persists, costs nothing to deliver from, and is
    | the foundation for the social platform's photos and video.
    |
    | The bucket MUST be created with PUBLIC visibility. R2 sets visibility per
    | bucket, not per file — never pass a 'public' visibility flag when writing,
    | R2 rejects it with NotImplemented.
    |
    */

    'disk' => env('MEDIA_DISK', 'public'),

    /*
    | Only needed for a bucket that Laravel Cloud did NOT configure for you
    | (Cloud supplies the public URL itself). Example: a plain R2 or S3 bucket.
    */
    'url' => env('MEDIA_URL'),

];
