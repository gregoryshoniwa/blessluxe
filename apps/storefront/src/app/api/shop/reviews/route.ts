import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-account";
import {
  deleteProductReviewByCustomer,
  getProductReviewSummary,
  hasCustomerPurchasedProduct,
  listProductReviews,
  listProductReviewsForViewer,
  upsertProductReviewByCustomer,
} from "@/lib/product-reviews";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const customer = await getCurrentCustomer();
    const productId = String(request.nextUrl.searchParams.get("productId") || "").trim();
    const productHandle = String(request.nextUrl.searchParams.get("productHandle") || "").trim();
    if (!productId && !productHandle) {
      return NextResponse.json({ error: "productId or productHandle is required." }, { status: 400 });
    }

    const summary = await getProductReviewSummary({ productId, productHandle });
    const reviews = productId
      ? await listProductReviewsForViewer(productId, customer ? String(customer.id) : null)
      : [];
    return NextResponse.json({
      averageRating: summary.averageRating,
      totalReviews: summary.totalReviews,
      ratingBreakdown: summary.ratingBreakdown,
      reviews,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load reviews." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const customer = await getCurrentCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Please login to submit a review." }, { status: 401 });
    }

    const body = await request.json();
    const productId = String(body.productId || "").trim();
    const productHandle = String(body.productHandle || "").trim();
    const title = String(body.title || "").trim();
    const content = String(body.content || "").trim();
    const rating = Number(body.rating || 0);

    if (!productId || !productHandle) {
      return NextResponse.json({ error: "Product information is required." }, { status: 400 });
    }
    if (!title || !content) {
      return NextResponse.json({ error: "Title and review content are required." }, { status: 400 });
    }
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Rating must be between 1 and 5." }, { status: 400 });
    }

    const verifiedPurchase = await hasCustomerPurchasedProduct({
      customerId: String(customer.id),
      productId,
      productHandle,
    });
    await upsertProductReviewByCustomer({
      productId,
      productHandle,
      customerId: String(customer.id),
      authorName: String(customer.full_name || customer.first_name || customer.email || "Customer"),
      rating,
      title,
      content,
      verified: verifiedPurchase,
    });

    const summary = await getProductReviewSummary({ productId, productHandle });
    const reviews = await listProductReviews(productId);
    return NextResponse.json({
      ok: true,
      verifiedPurchase,
      averageRating: summary.averageRating,
      totalReviews: summary.totalReviews,
      ratingBreakdown: summary.ratingBreakdown,
      reviews,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit review." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const customer = await getCurrentCustomer();
    if (!customer) {
      return NextResponse.json({ error: "Please login to manage your review." }, { status: 401 });
    }
    const reviewId = String(request.nextUrl.searchParams.get("reviewId") || "").trim();
    const productId = String(request.nextUrl.searchParams.get("productId") || "").trim();
    const productHandle = String(request.nextUrl.searchParams.get("productHandle") || "").trim();
    if (!reviewId || !productId) {
      return NextResponse.json({ error: "reviewId and productId are required." }, { status: 400 });
    }

    await deleteProductReviewByCustomer(reviewId, String(customer.id));
    const summary = await getProductReviewSummary({ productId, productHandle });
    const reviews = await listProductReviewsForViewer(productId, String(customer.id));
    return NextResponse.json({
      ok: true,
      averageRating: summary.averageRating,
      totalReviews: summary.totalReviews,
      ratingBreakdown: summary.ratingBreakdown,
      reviews,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete review." },
      { status: 500 }
    );
  }
}

