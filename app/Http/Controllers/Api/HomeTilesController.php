<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\HomeTiles;
use App\Services\Media;
use Illuminate\Http\Request;

/** The home page's tile pictures. Public read; staff upload, re-order and remove. */
class HomeTilesController extends Controller
{
    /** GET /api/store/home-tiles */
    public function index()
    {
        return ['tiles' => (object) HomeTiles::all()];
    }

    /** GET /api/admin/home-tiles */
    public function admin()
    {
        return ['tiles' => HomeTiles::forAdmin(), 'max' => HomeTiles::MAX];
    }

    /** POST /api/admin/home-tiles/images  { key, image } */
    public function upload(Request $request)
    {
        $data = $request->validate([
            'key'   => ['required', 'string', 'max:80'],
            'image' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:8192'],
        ]);
        if (! HomeTiles::validKey($data['key'])) return response()->json(['error' => 'No such tile.'], 422);
        if (count(HomeTiles::all()[$data['key']] ?? []) >= HomeTiles::MAX) {
            return response()->json(['error' => 'A tile holds ' . HomeTiles::MAX . ' pictures — remove one first.'], 422);
        }

        HomeTiles::add($data['key'], Media::upload($request->file('image'), 'site/tiles'));

        return $this->admin();
    }

    /** PUT /api/admin/home-tiles  { key, images: [url…] } — the new order; anything left out is removed. */
    public function update(Request $request)
    {
        $data = $request->validate(['key' => ['required', 'string', 'max:80'], 'images' => ['present', 'array'], 'images.*' => ['string']]);
        if (! HomeTiles::validKey($data['key'])) return response()->json(['error' => 'No such tile.'], 422);

        foreach (HomeTiles::set($data['key'], $data['images']) as $gone) Media::delete($gone);

        return $this->admin();
    }
}
