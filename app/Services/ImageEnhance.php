<?php

namespace App\Services;

use App\Models\Product;
use App\Models\ProductImage;
use App\Models\Scopes\ExclusivityScope;
use App\Services\AI\GeminiService;

/**
 * Supplier photos arrive through WhatsApp and Telegram, squeezed and blurred.
 * Staff can ask Nano Banana to restore one — only on a button press, never
 * automatically, because every render is paid and an AI can drift from the
 * real garment. The result is a PREVIEW in the product's own folder; it only
 * replaces the original when staff compare the two and keep it.
 */
class ImageEnhance
{
    /** Shapes the model can draw; the photo keeps the nearest one to its own. */
    private const RATIOS = ['1:1' => 1.0, '3:4' => 0.75, '4:3' => 1.3333, '2:3' => 0.6667, '3:2' => 1.5, '4:5' => 0.8, '5:4' => 1.25, '9:16' => 0.5625, '16:9' => 1.7778];

    /** What staff are told a render will cost before pressing the button. */
    public static function estimate(): float
    {
        return (float) env('AI_COST_IMAGE', 0.067);
    }

    public static function folder(string $productId): string
    {
        return 'ai/enhanced/' . $productId;
    }

    /** @return array{url: string, cost: float, ai_cost: float} */
    public static function preview(string $productId, string $imageId, bool $clean): array
    {
        $image = ProductImage::where('product_id', $productId)->findOrFail($imageId);
        $ref = Media::asReference($image->url);
        if (! $ref) throw new \RuntimeException('That photo could not be read.');

        $size = @getimagesizefromstring(base64_decode($ref['base64']));
        $ratio = $size ? self::nearestRatio($size[0] / max(1, $size[1])) : '3:4';

        $prompt = <<<TXT
Restore this product photograph to clean, professional online-shop quality.

Keep the garment EXACTLY as it is: the same cut, colour, fabric and pattern, every button, seam, pocket, lapel and accessory, the same model or mannequin, the same pose, the same framing and the same background. Do not redesign, restyle, recolour or add anything.

Only improve the photograph itself: remove blur and messaging-app compression blocks, sharpen fine fabric detail, clean up noise, and correct the exposure and white balance so the colours look true and natural.
TXT;
        if ($clean) {
            $prompt .= "\n\nAlso remove anything printed ON TOP of the photo that is not part of the scene: watermarks, prices, size labels, phone numbers, product codes, supplier logos and stickers. Fill those areas so they match what is around them.";
        }

        GeminiService::$usageContext = ['surface' => 'image_enhance'];
        GeminiService::$lastUsage = null;
        $out = (new GeminiService())->generateImage($prompt, [$ref], $ratio);
        if (! $out) throw new \RuntimeException('The AI didn\'t return a picture — try again.');

        $cost = round(GeminiService::$lastUsage['cost'] ?? self::estimate(), 5);
        $url = Media::putRender(self::folder($productId), $out);

        // Spent whether or not the preview is kept — so it is counted now.
        $product = Product::withoutGlobalScope(ExclusivityScope::class)->findOrFail($productId);
        $meta = $product->metadata ?? [];
        $meta['ai_cost'] = round((float) ($meta['ai_cost'] ?? 0) + $cost, 5);
        $product->update(['metadata' => $meta]);

        return ['url' => $url, 'cost' => $cost, 'ai_cost' => $meta['ai_cost']];
    }

    /** Swap the original for the kept preview; the old file and any thumbnail pointing at it follow. */
    public static function keep(string $productId, string $imageId, string $url): array
    {
        if (! Media::isUnder($url, self::folder($productId))) throw new \InvalidArgumentException('That preview isn\'t this product\'s.');
        $image = ProductImage::where('product_id', $productId)->findOrFail($imageId);
        $product = Product::withoutGlobalScope(ExclusivityScope::class)->findOrFail($productId);

        $old = $image->url;
        $image->update(['url' => $url]);
        if ($product->thumbnail === $old) $product->update(['thumbnail' => $url]);
        Media::delete($old);

        return ['url' => $url];
    }

    /** Throw a preview away — only ever one of this product's own. */
    public static function discard(string $productId, string $url): void
    {
        if (Media::isUnder($url, self::folder($productId))) Media::delete($url);
    }

    private static function nearestRatio(float $r): string
    {
        $best = '3:4';
        foreach (self::RATIOS as $name => $v) if (abs($v - $r) < abs(self::RATIOS[$best] - $r)) $best = $name;

        return $best;
    }
}
