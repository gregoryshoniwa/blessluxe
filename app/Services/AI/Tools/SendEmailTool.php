<?php

namespace App\Services\AI\Tools;

use App\Models\Product;
use App\Services\AI\AgentContext;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class SendEmailTool extends AiTool
{
    public function definition(): array
    {
        return [
            'name' => 'send_email',
            'description' => 'Send a transactional email to the signed-in customer (conversation_summary or product_recommendations templates).',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'template'         => ['type' => 'string', 'enum' => ['conversation_summary', 'product_recommendations', 'custom']],
                    'subject'          => ['type' => 'string'],
                    'content'          => ['type' => 'string', 'description' => 'Body text / summary'],
                    'include_products' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Product ids to include as cards'],
                ],
                'required' => ['template'],
            ],
        ];
    }

    public function execute(array $params, AgentContext $context): array
    {
        if (! $context->isAuthenticated()) return $this->fail('Sign in so I can email you.');
        $template = (string) ($params['template'] ?? 'custom');
        $subject  = (string) ($params['subject'] ?? $this->defaultSubject($template));
        $content  = (string) ($params['content'] ?? '');
        $productIds = (array) ($params['include_products'] ?? []);
        $products = [];
        if ($productIds) {
            $products = Product::query()->whereIn('id', $productIds)->limit(8)->get()
                ->map(fn ($p) => [
                    'title'     => $p->title,
                    'handle'    => $p->handle,
                    'thumbnail' => $p->thumbnail,
                ])->all();
        }
        try {
            Mail::to($context->customer->email)->send(new \App\Mail\AgentDigestMail(
                customer: $context->customer,
                subjectLine: $subject,
                bodyText: $content,
                products: $products,
            ));
        } catch (\Throwable $e) {
            Log::warning('[agent send_email] '.$e->getMessage());
            return $this->fail('Email could not be sent right now.');
        }
        return $this->ok(['sent' => true, 'to' => $context->customer->email, 'subject' => $subject]);
    }

    private function defaultSubject(string $template): string
    {
        return match ($template) {
            'conversation_summary'    => 'Your BLESSLUXE chat with LUXE',
            'product_recommendations' => 'Picks from LUXE',
            default                   => 'A note from LUXE',
        };
    }
}
