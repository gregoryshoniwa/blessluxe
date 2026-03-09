"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

type AccountPayload = {
  customer: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
    avatar_url?: string;
    bio?: string;
    address?: CustomerAddress;
    email_verified?: boolean;
  } | null;
  transactions?: Array<Record<string, unknown>>;
  tickets?: Array<Record<string, unknown>>;
  inbox?: Array<Record<string, unknown>>;
};

type CustomerAddress = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
};

type WallPost = Record<string, unknown> & { comments?: Array<Record<string, unknown>> };

const tabs = [
  "Profile",
  "Transactions",
  "Tickets",
  "Affiliate",
  "Wall",
  "Inbox",
] as const;

export default function AccountPage() {
  const { data: oauthSession } = useSession();
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Profile");
  const [payload, setPayload] = useState<AccountPayload | null>(null);
  const [posts, setPosts] = useState<WallPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [googleOauthReady, setGoogleOauthReady] = useState(false);
  const oauthSyncInFlight = useRef(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupFirstName, setSignupFirstName] = useState("");
  const [signupLastName, setSignupLastName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [googleEmail, setGoogleEmail] = useState("");
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});

  const customer = payload?.customer || null;

  const name = useMemo(() => {
    if (!customer) return "";
    return customer.full_name || `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || customer.email;
  }, [customer]);

  const loadAccount = async () => {
    setLoading(true);
    setError("");
    try {
      const meRes = await fetch("/api/account/me", { cache: "no-store" });
      const meJson = (await meRes.json()) as AccountPayload;
      setPayload(meJson);
      const postsRes = await fetch("/api/account/posts", { cache: "no-store" });
      const postsJson = (await postsRes.json()) as { posts: WallPost[] };
      setPosts(postsJson.posts || []);
    } catch {
      setError("Unable to load account data right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccount();
  }, []);

  useEffect(() => {
    const loadOauthStatus = async () => {
      try {
        const res = await fetch("/api/account/oauth-status", { cache: "no-store" });
        const data = (await res.json()) as { google?: boolean };
        setGoogleOauthReady(Boolean(data.google));
      } catch {
        setGoogleOauthReady(false);
      }
    };
    loadOauthStatus();
  }, []);

  useEffect(() => {
    const syncOauthSession = async () => {
      if (!oauthSession?.user?.email || customer || oauthSyncInFlight.current) return;
      oauthSyncInFlight.current = true;
      try {
        const syncRes = await fetch("/api/account/session-sync", { method: "POST" });
        if (syncRes.ok) {
          await loadAccount();
        }
      } finally {
        oauthSyncInFlight.current = false;
      }
    };
    syncOauthSession();
  }, [customer, oauthSession?.user?.email]);

  const onLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNote("");
    setError("");
    const res = await fetch("/api/account/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: loginEmail, password: loginPassword }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Login failed.");
      return;
    }
    setNote("Welcome back.");
    await loadAccount();
  };

  const onSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNote("");
    setError("");
    const res = await fetch("/api/account/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        firstName: signupFirstName,
        lastName: signupLastName,
        email: signupEmail,
        password: signupPassword,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Signup failed.");
      return;
    }

    if (json.verifyEmailToken) {
      setNote("Account created. Click verify to confirm your email.");
      await fetch("/api/account/verify-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: json.verifyEmailToken }),
      });
    }
    await loadAccount();
  };

  const onGoogleQuickLogin = async () => {
    setNote("");
    setError("");
    const email = googleEmail.trim();
    if (!email) {
      setError("Enter your Google email to continue.");
      return;
    }
    const res = await fetch("/api/account/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, mode: "google" }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Google sign-in failed.");
      return;
    }
    setNote("Signed in with Google.");
    await loadAccount();
  };

  const onLogout = async () => {
    await signOut({ redirect: false });
    await fetch("/api/account/logout", { method: "POST" });
    await loadAccount();
  };

  const onSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await fetch("/api/account/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: form.get("fullName"),
        avatarUrl: form.get("avatarUrl"),
        bio: form.get("bio"),
        address: {
          firstName: form.get("firstName"),
          lastName: form.get("lastName"),
          phone: form.get("phone"),
          address1: form.get("address1"),
          address2: form.get("address2"),
          city: form.get("city"),
          province: form.get("province"),
          postalCode: form.get("postalCode"),
          country: form.get("country"),
        },
      }),
    });
    setNote("Profile updated.");
    await loadAccount();
  };

  const onCreateTicket = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const subject = String(form.get("subject") || "");
    const message = String(form.get("message") || "");
    const res = await fetch("/api/account/tickets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject, message }),
    });
    if (res.ok) {
      setNote("Ticket created. Our team will reply soon.");
      event.currentTarget.reset();
      await loadAccount();
    } else {
      setError("Unable to create ticket.");
    }
  };

  const onCreatePost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const content = String(form.get("content") || "");
    const imageUrl = String(form.get("imageUrl") || "");
    const res = await fetch("/api/account/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, imageUrl }),
    });
    if (res.ok) {
      setNote("Posted on your page.");
      event.currentTarget.reset();
      await loadAccount();
    } else {
      setError("Unable to publish post.");
    }
  };

  const onComment = async (postId: string) => {
    const content = commentDraft[postId] || "";
    if (!content.trim()) return;
    const res = await fetch(`/api/account/posts/${postId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (res.ok) {
      setCommentDraft((prev) => ({ ...prev, [postId]: "" }));
      await loadAccount();
    }
  };

  const onMarkRead = async (id: string) => {
    await fetch("/api/account/inbox", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await loadAccount();
  };

  if (loading) {
    return <div className="px-[5%] py-20 text-center text-black/60">Loading account...</div>;
  }

  return (
    <div className="px-[5%] py-14 md:py-20 space-y-8">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <p className="font-script text-3xl text-gold mb-2">Your Space</p>
          <h1 className="font-display text-3xl tracking-widest uppercase">Customer Account</h1>
          <p className="text-black/60 mt-2">
            Orders, invoices, support, affiliate tools, profile, social page, and inbox in one place.
          </p>
        </div>
        {customer ? (
          <button
            onClick={onLogout}
            className="border border-black/20 px-6 py-3 text-xs tracking-[0.25em] uppercase hover:bg-black/5 transition-colors"
          >
            Logout
          </button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {note ? <p className="text-sm text-emerald-700">{note}</p> : null}

      {!customer ? (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="border border-black/10 p-6 space-y-3">
            <h2 className="font-display tracking-widest uppercase">Quick Google Sign-in</h2>
            <p className="text-sm text-black/60">
              If you are already logged into Chrome, use the Google sign-in button for one-click account access.
            </p>
            <button
              onClick={() => signIn("google", { callbackUrl: "/account" })}
              disabled={!googleOauthReady}
              className="w-full bg-black text-white py-3 text-xs tracking-[0.2em] uppercase hover:bg-black/85 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {googleOauthReady ? "Continue With Google OAuth" : "Google OAuth Not Configured"}
            </button>
            <input
              type="email"
              placeholder="your-google-email@gmail.com"
              value={googleEmail}
              onChange={(event) => setGoogleEmail(event.target.value)}
              className="w-full border border-black/20 px-4 py-3 text-sm"
            />
            <button
              onClick={onGoogleQuickLogin}
              className="w-full border border-black/20 py-3 text-xs tracking-[0.2em] uppercase hover:bg-black/5 transition-colors"
            >
              Quick Google Email Sign-in (Fallback)
            </button>
          </div>

          <form onSubmit={onLogin} className="border border-black/10 p-6 space-y-3">
            <h2 className="font-display tracking-widest uppercase">Login</h2>
            <input
              required
              type="email"
              placeholder="Email"
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
              className="w-full border border-black/20 px-4 py-3 text-sm"
            />
            <input
              required
              type="password"
              placeholder="Password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              className="w-full border border-black/20 px-4 py-3 text-sm"
            />
            <button
              type="submit"
              className="w-full bg-gold text-white py-3 text-xs tracking-[0.2em] uppercase hover:bg-gold-dark transition-colors"
            >
              Login
            </button>
          </form>

          <form onSubmit={onSignup} className="border border-black/10 p-6 space-y-3">
            <h2 className="font-display tracking-widest uppercase">Create Account</h2>
            <input
              type="text"
              placeholder="First name"
              value={signupFirstName}
              onChange={(event) => setSignupFirstName(event.target.value)}
              className="w-full border border-black/20 px-4 py-3 text-sm"
            />
            <input
              type="text"
              placeholder="Last name"
              value={signupLastName}
              onChange={(event) => setSignupLastName(event.target.value)}
              className="w-full border border-black/20 px-4 py-3 text-sm"
            />
            <input
              required
              type="email"
              placeholder="Email"
              value={signupEmail}
              onChange={(event) => setSignupEmail(event.target.value)}
              className="w-full border border-black/20 px-4 py-3 text-sm"
            />
            <input
              required
              type="password"
              minLength={6}
              placeholder="Password (min 6)"
              value={signupPassword}
              onChange={(event) => setSignupPassword(event.target.value)}
              className="w-full border border-black/20 px-4 py-3 text-sm"
            />
            <button
              type="submit"
              className="w-full bg-gold text-white py-3 text-xs tracking-[0.2em] uppercase hover:bg-gold-dark transition-colors"
            >
              Create Account
            </button>
          </form>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="border border-black/10 p-5 flex items-center gap-4">
            <img
              src={customer.avatar_url || "https://placehold.co/120x120?text=Avatar"}
              alt="Profile avatar"
              className="w-16 h-16 rounded-full object-cover border border-black/10"
            />
            <div>
              <p className="font-semibold">{name}</p>
              <p className="text-sm text-black/60">{customer.email}</p>
              <p className="text-xs text-black/50 mt-1">
                {customer.email_verified ? "Email verified" : "Email not verified"}
              </p>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-xs tracking-[0.2em] uppercase border ${
                  activeTab === tab ? "border-gold bg-gold/10" : "border-black/20"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === "Profile" ? (
            <form onSubmit={onSaveProfile} className="grid md:grid-cols-2 gap-4 border border-black/10 p-6">
              <input name="fullName" defaultValue={customer.full_name || ""} placeholder="Full name" className="border border-black/20 px-4 py-3 text-sm" />
              <input name="avatarUrl" defaultValue={customer.avatar_url || ""} placeholder="Avatar image URL" className="border border-black/20 px-4 py-3 text-sm" />
              <input name="firstName" defaultValue={String(customer.address?.firstName || customer.first_name || "")} placeholder="First name" className="border border-black/20 px-4 py-3 text-sm" />
              <input name="lastName" defaultValue={String(customer.address?.lastName || customer.last_name || "")} placeholder="Last name" className="border border-black/20 px-4 py-3 text-sm" />
              <input name="phone" defaultValue={String(customer.address?.phone || "")} placeholder="Phone" className="border border-black/20 px-4 py-3 text-sm" />
              <input name="address1" defaultValue={String(customer.address?.address1 || "")} placeholder="Address line 1" className="border border-black/20 px-4 py-3 text-sm" />
              <input name="address2" defaultValue={String(customer.address?.address2 || "")} placeholder="Address line 2" className="border border-black/20 px-4 py-3 text-sm" />
              <input name="city" defaultValue={String(customer.address?.city || "")} placeholder="City" className="border border-black/20 px-4 py-3 text-sm" />
              <input name="province" defaultValue={String(customer.address?.province || "")} placeholder="Province/State" className="border border-black/20 px-4 py-3 text-sm" />
              <input name="postalCode" defaultValue={String(customer.address?.postalCode || "")} placeholder="Postal code" className="border border-black/20 px-4 py-3 text-sm" />
              <input name="country" defaultValue={String(customer.address?.country || "Zimbabwe")} placeholder="Country" className="border border-black/20 px-4 py-3 text-sm" />
              <textarea name="bio" defaultValue={customer.bio || ""} placeholder="Short bio (your personal page intro)" className="border border-black/20 px-4 py-3 text-sm md:col-span-2 min-h-24" />
              <button type="submit" className="md:col-span-2 bg-gold text-white py-3 text-xs tracking-[0.2em] uppercase hover:bg-gold-dark transition-colors">
                Save Profile & Address
              </button>
            </form>
          ) : null}

          {activeTab === "Transactions" ? (
            <div className="border border-black/10 p-6 space-y-3">
              {(payload?.transactions || []).map((tx) => (
                <div key={String(tx.id)} className="border border-black/10 p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-semibold">{String(tx.order_number)}</p>
                    <p className="text-xs text-black/60">{new Date(String(tx.created_at)).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">
                      {String(tx.currency_code || "usd").toUpperCase()} {Number(tx.amount || 0).toFixed(2)}
                    </p>
                    <p className="text-xs uppercase tracking-[0.2em]">{String(tx.status || "paid")}</p>
                    <a href={String(tx.invoice_url || "#")} className="text-xs text-gold underline">Invoice</a>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {activeTab === "Tickets" ? (
            <div className="grid md:grid-cols-2 gap-5">
              <form onSubmit={onCreateTicket} className="border border-black/10 p-5 space-y-3">
                <h3 className="font-display tracking-widest uppercase">Open Query Ticket</h3>
                <input name="subject" required placeholder="Subject" className="w-full border border-black/20 px-4 py-3 text-sm" />
                <textarea name="message" required placeholder="How can we help?" className="w-full border border-black/20 px-4 py-3 text-sm min-h-28" />
                <button type="submit" className="w-full bg-gold text-white py-3 text-xs tracking-[0.2em] uppercase">Submit Ticket</button>
              </form>
              <div className="border border-black/10 p-5 space-y-3">
                <h3 className="font-display tracking-widest uppercase">Ticket History</h3>
                {(payload?.tickets || []).map((ticket) => (
                  <div key={String(ticket.id)} className="border border-black/10 p-3">
                    <p className="font-medium">{String(ticket.subject)}</p>
                    <p className="text-xs text-black/70 mt-1">{String(ticket.message)}</p>
                    <p className="text-xs text-black/50 mt-2 uppercase tracking-[0.2em]">{String(ticket.status)}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {activeTab === "Affiliate" ? (
            <div className="border border-black/10 p-6 space-y-3">
              <h3 className="font-display tracking-widest uppercase">Affiliate Options</h3>
              <p className="text-sm text-black/70">Use your profile email in the affiliate dashboard to track referrals and payouts.</p>
              <div className="flex gap-3 flex-wrap">
                <Link href={`/affiliate/dashboard?email=${encodeURIComponent(customer.email)}`} className="bg-gold text-white px-5 py-3 text-xs tracking-[0.2em] uppercase">
                  Open Affiliate Dashboard
                </Link>
                <Link href="/affiliate/apply" className="border border-black/20 px-5 py-3 text-xs tracking-[0.2em] uppercase">
                  Apply / Update Affiliate
                </Link>
              </div>
            </div>
          ) : null}

          {activeTab === "Wall" ? (
            <div className="space-y-4">
              <form onSubmit={onCreatePost} className="border border-black/10 p-5 grid gap-3">
                <h3 className="font-display tracking-widest uppercase">Personal Page (Wall)</h3>
                <textarea name="content" required placeholder="Share an update..." className="border border-black/20 px-4 py-3 text-sm min-h-24" />
                <input name="imageUrl" placeholder="Photo URL (optional)" className="border border-black/20 px-4 py-3 text-sm" />
                <button type="submit" className="bg-gold text-white py-3 text-xs tracking-[0.2em] uppercase">Post</button>
              </form>
              {posts.map((post) => (
                <div key={String(post.id)} className="border border-black/10 p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={String(post.avatar_url || "https://placehold.co/80x80?text=U")}
                      alt="Post author avatar"
                      className="w-10 h-10 rounded-full object-cover border border-black/10"
                    />
                    <div>
                      <p className="font-semibold">{String(post.full_name || "Customer")}</p>
                      <p className="text-xs text-black/60">{new Date(String(post.created_at)).toLocaleString()}</p>
                    </div>
                  </div>
                  <p className="text-sm">{String(post.content || "")}</p>
                  {post.image_url ? (
                    <img src={String(post.image_url)} alt="Post attachment" className="w-full max-h-80 object-cover border border-black/10" />
                  ) : null}
                  <div className="space-y-2">
                    {(post.comments || []).map((comment) => (
                      <p key={String(comment.id)} className="text-sm text-black/80 border-l-2 border-black/10 pl-3">
                        <span className="font-medium">{String(comment.full_name || "User")}:</span> {String(comment.content || "")}
                      </p>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={commentDraft[String(post.id)] || ""}
                      onChange={(event) =>
                        setCommentDraft((prev) => ({
                          ...prev,
                          [String(post.id)]: event.target.value,
                        }))
                      }
                      placeholder="Write a comment..."
                      className="flex-1 border border-black/20 px-4 py-2 text-sm"
                    />
                    <button
                      onClick={() => onComment(String(post.id))}
                      className="border border-black/20 px-4 py-2 text-xs tracking-[0.2em] uppercase"
                    >
                      Comment
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {activeTab === "Inbox" ? (
            <div className="border border-black/10 p-5 space-y-3">
              <h3 className="font-display tracking-widest uppercase">Messages & Notifications</h3>
              {(payload?.inbox || []).map((item) => (
                <div key={String(item.id)} className="border border-black/10 p-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{String(item.title)}</p>
                    <p className="text-sm text-black/70">{String(item.body)}</p>
                    <p className="text-xs uppercase tracking-[0.2em] text-black/50 mt-1">{String(item.category)}</p>
                  </div>
                  {!Boolean(item.is_read) ? (
                    <button onClick={() => onMarkRead(String(item.id))} className="text-xs underline">
                      Mark read
                    </button>
                  ) : (
                    <span className="text-xs text-black/50">Read</span>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
