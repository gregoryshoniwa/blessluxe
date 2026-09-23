<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\SiteLinks;
use Illuminate\Http\Request;

/** Which fixed links the shop shows. Public read; staff write. */
class SiteLinksController extends Controller
{
    /** GET /api/store/site-links */
    public function index()
    {
        return ['links' => SiteLinks::visible()];
    }

    /** GET /api/admin/site-links */
    public function admin()
    {
        return ['links' => SiteLinks::forAdmin()];
    }

    /** PUT /api/admin/site-links  { links: { key: bool } } */
    public function update(Request $request)
    {
        $data = $request->validate(['links' => ['required', 'array'], 'links.*' => ['boolean']]);
        SiteLinks::setConfig($data['links']);

        return ['links' => SiteLinks::forAdmin()];
    }
}
