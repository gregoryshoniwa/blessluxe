import { NextRequest, NextResponse } from "next/server";
import {
  createPost,
  getCurrentCustomer,
  listComments,
  listPosts,
} from "@/lib/customer-account";

export const dynamic = "force-dynamic";

export async function GET() {
  const posts = await listPosts();
  const withComments = await Promise.all(
    posts.map(async (post) => ({
      ...post,
      comments: await listComments(String(post.id)),
    }))
  );
  return NextResponse.json({ posts: withComments });
}

export async function POST(req: NextRequest) {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await req.json();
  const content = String(body.content || "").trim();
  const imageUrl = body.imageUrl ? String(body.imageUrl) : undefined;

  if (!content) {
    return NextResponse.json({ error: "Post content is required." }, { status: 400 });
  }
  await createPost(String(customer.id), content, imageUrl);
  return NextResponse.json({ ok: true });
}
