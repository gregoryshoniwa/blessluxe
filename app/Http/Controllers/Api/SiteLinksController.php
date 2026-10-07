<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ShopInfo;
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

    /** GET /api/store/shop-info — what the Contact and policy pages quote. */
    public function shopInfo()
    {
        return ['info' => array_filter(ShopInfo::all(), fn ($v) => $v !== ''), 'policy' => ShopInfo::policy()];
    }

    /** GET /api/admin/shop-info */
    public function adminShopInfo()
    {
        return ['fields' => ShopInfo::forAdmin()];
    }

    /** PUT /api/admin/shop-info  { info: { key: value } } */
    public function updateShopInfo(Request $request)
    {
        $data = $request->validate(['info' => ['required', 'array'], 'info.*' => ['nullable', 'string', 'max:300']]);
        ShopInfo::setConfig($data['info']);

        return ['fields' => ShopInfo::forAdmin()];
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
