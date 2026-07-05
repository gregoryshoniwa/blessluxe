<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
    @page { margin: 90px 50px 70px 50px; }
    * { box-sizing: border-box; }
    body { font-family: DejaVu Sans, sans-serif; color: #1a1a1a; font-size: 12px; margin: 0; }

    header {
        position: fixed; top: -60px; left: 0; right: 0; height: 40px;
        border-bottom: 2px solid #b49246;
    }
    header .brand { font-size: 16px; letter-spacing: 4px; color: #b49246; text-transform: uppercase; }
    header .tag   { float: right; font-size: 9px; color: #999; letter-spacing: 2px; text-transform: uppercase; margin-top: 6px; }

    footer {
        position: fixed; bottom: -50px; left: 0; right: 0; height: 30px;
        border-top: 1px solid #e5dcc3; font-size: 9px; color: #999; padding-top: 6px;
    }
    footer .page:after { content: counter(page); }

    .cover { text-align: center; padding: 130px 40px 0 40px; page-break-after: always; }
    .cover .script { color: #b49246; font-style: italic; font-size: 20px; }
    .cover h1 { font-size: 30px; letter-spacing: 6px; text-transform: uppercase; margin: 12px 0 26px 0; font-weight: normal; }
    .cover .rule { width: 80px; border-top: 2px solid #b49246; margin: 0 auto 26px auto; }
    .cover .meta { font-size: 12px; color: #555; line-height: 1.9; }
    .cover .meta strong { color: #1a1a1a; }
    .cover .notes { margin-top: 40px; font-size: 11px; color: #666; text-align: left; border: 1px solid #e5dcc3; background: #faf7ef; padding: 14px 18px; }

    .item { page-break-inside: avoid; margin-bottom: 28px; border: 1px solid #e8e2d2; padding: 16px; }
    .item .img-wrap { text-align: center; background: #fbfaf6; padding: 10px; }
    .item img { max-width: 100%; max-height: 460px; }
    .item h2 { font-size: 13px; letter-spacing: 2px; text-transform: uppercase; margin: 14px 0 4px 0; }
    .item .badges { margin-bottom: 6px; }
    .badge {
        display: inline-block; font-size: 8px; letter-spacing: 2px; text-transform: uppercase;
        border: 1px solid #b49246; color: #8d7434; padding: 2px 7px; margin-right: 5px;
    }
    .item .desc { font-size: 11px; color: #555; line-height: 1.6; }
    .item .video-note { font-size: 9px; color: #999; margin-top: 6px; font-style: italic; }
    .script-block { margin-top: 10px; background: #faf7ef; border-left: 3px solid #b49246; padding: 10px 14px; }
    .script-block h3 { font-size: 9px; letter-spacing: 2px; text-transform: uppercase; color: #8d7434; margin: 0 0 6px 0; }
    .script-block pre { font-family: DejaVu Sans, sans-serif; font-size: 10px; color: #444; white-space: pre-wrap; margin: 0; line-height: 1.55; }
</style>
</head>
<body>
    <header>
        <span class="brand">Blessluxe</span>
        <span class="tag">Show Room · Studio</span>
    </header>
    <footer>
        Prepared with the BLESSLUXE Show Room Studio &nbsp;·&nbsp; {{ $date }}
        <span style="float: right;">Page <span class="page"></span></span>
    </footer>

    <div class="cover">
        <div class="script">Corporate wear, beautifully branded</div>
        <h1>{{ $title }}</h1>
        <div class="rule"></div>
        <div class="meta">
            @if ($clientName) Prepared for <strong>{{ $clientName }}</strong><br> @endif
            Prepared by <strong>{{ $preparedBy }}</strong><br>
            {{ $date }} &nbsp;·&nbsp; {{ $items->count() }} {{ Str::plural('concept', $items->count()) }}
        </div>
        @if ($notes)
            <div class="notes">{{ $notes }}</div>
        @endif
    </div>

    @foreach ($items as $i => $item)
        <div class="item">
            @php $img = $item->image_url ? public_path(ltrim($item->image_url, '/')) : null; @endphp
            @if ($img && is_file($img))
                <div class="img-wrap"><img src="{{ $img }}" alt="Concept {{ $i + 1 }}"></div>
            @endif
            <h2>Concept {{ $i + 1 }}@if ($item->garment) — {{ $item->garment }}@elseif ($item->customerProduct?->name) — {{ $item->customerProduct->name }}@endif</h2>
            <div class="badges">
                <span class="badge">{{ $item->kind }}</span>
                @if ($item->audience)    <span class="badge">{{ $item->audience }}</span>    @endif
                @if ($item->placement)   <span class="badge">{{ $item->placement }}</span>   @endif
                @if ($item->application) <span class="badge">{{ $item->application }}</span> @endif
            </div>
            @if ($item->meta['label'] ?? null)
                <p class="desc">{{ ucfirst($item->meta['label']) }}.</p>
            @endif
            @if ($item->video_url)
                <p class="video-note">A motion version of this concept is available on request.</p>
            @endif
            @if ($item->script)
                <div class="script-block">
                    <h3>Suggested advert script</h3>
                    <pre>{{ $item->script }}</pre>
                </div>
            @endif
        </div>
    @endforeach
</body>
</html>
