import { Router } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { query, queryOne, execute } from "../db/pool.ts";
import { signToken, requireAdmin } from "../middleware/admin-auth.ts";

export const authRouter = Router();

const id = () => `user_${uuid().replace(/-/g, "")}`;

// ─── Login ──────────────────────────────────────────────
authRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    if (!email || !password) {
      res.status(400).json({ error: "Email and password required" });
      return;
    }

    const user = await queryOne(
      `SELECT * FROM shop_user WHERE email = $1 AND is_active = true`,
      [email.toLowerCase().trim()]
    );

    if (!user || !(await bcrypt.compare(password, String(user.password)))) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const token = signToken({
      userId: String(user.id),
      email: String(user.email),
      role: String(user.role),
    });

    res.cookie("shop_admin_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
      path: "/",
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("[auth login]", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// ─── Logout ─────────────────────────────────────────────
authRouter.post("/logout", (_req, res) => {
  res.clearCookie("shop_admin_token", { path: "/" });
  res.json({ ok: true });
});

// ─── Me ─────────────────────────────────────────────────
authRouter.get("/me", requireAdmin, async (req, res) => {
  try {
    const user = await queryOne(
      `SELECT id, email, first_name, last_name, role, is_active, created_at FROM shop_user WHERE id = $1`,
      [req.admin!.userId]
    );
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ user });
  } catch (err) {
    console.error("[auth me]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── List users (admin only) ────────────────────────────
authRouter.get("/users", requireAdmin, async (_req, res) => {
  try {
    const rows = await query(
      `SELECT id, email, first_name, last_name, role, is_active, created_at, updated_at
       FROM shop_user ORDER BY created_at DESC`
    );
    res.json({ users: rows });
  } catch (err) {
    console.error("[auth list users]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── Create user ────────────────────────────────────────
authRouter.post("/users", requireAdmin, async (req, res) => {
  try {
    const { email, password, first_name, last_name, role } = req.body as {
      email: string;
      password: string;
      first_name?: string;
      last_name?: string;
      role?: string;
    };

    if (!email || !password) {
      res.status(400).json({ error: "Email and password required" });
      return;
    }

    const existing = await queryOne(`SELECT id FROM shop_user WHERE email = $1`, [
      email.toLowerCase().trim(),
    ]);
    if (existing) {
      res.status(409).json({ error: "Email already exists" });
      return;
    }

    const hashed = await bcrypt.hash(password, 12);
    const userId = id();

    await execute(
      `INSERT INTO shop_user (id, email, password, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, email.toLowerCase().trim(), hashed, first_name || null, last_name || null, role || "admin"]
    );

    res.status(201).json({
      user: { id: userId, email: email.toLowerCase().trim(), first_name, last_name, role: role || "admin" },
    });
  } catch (err) {
    console.error("[auth create user]", err);
    res.status(500).json({ error: "Failed to create user" });
  }
});

// ─── Update user ────────────────────────────────────────
authRouter.patch("/users/:id", requireAdmin, async (req, res) => {
  try {
    const { id: userId } = req.params;
    const body = req.body as Partial<{
      email: string;
      password: string;
      first_name: string;
      last_name: string;
      role: string;
      is_active: boolean;
    }>;

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (body.email !== undefined) {
      sets.push(`email = $${idx++}`);
      params.push(body.email.toLowerCase().trim());
    }
    if (body.password !== undefined) {
      sets.push(`password = $${idx++}`);
      params.push(await bcrypt.hash(body.password, 12));
    }
    if (body.first_name !== undefined) { sets.push(`first_name = $${idx++}`); params.push(body.first_name); }
    if (body.last_name !== undefined) { sets.push(`last_name = $${idx++}`); params.push(body.last_name); }
    if (body.role !== undefined) { sets.push(`role = $${idx++}`); params.push(body.role); }
    if (body.is_active !== undefined) { sets.push(`is_active = $${idx++}`); params.push(body.is_active); }

    if (sets.length > 0) {
      sets.push(`updated_at = NOW()`);
      params.push(userId);
      await execute(`UPDATE shop_user SET ${sets.join(", ")} WHERE id = $${idx}`, params);
    }

    const user = await queryOne(
      `SELECT id, email, first_name, last_name, role, is_active, created_at, updated_at FROM shop_user WHERE id = $1`,
      [userId]
    );
    res.json({ user });
  } catch (err) {
    console.error("[auth update user]", err);
    res.status(500).json({ error: "Failed to update user" });
  }
});

// ─── Delete user ────────────────────────────────────────
authRouter.delete("/users/:id", requireAdmin, async (req, res) => {
  try {
    if (req.admin!.userId === req.params.id) {
      res.status(400).json({ error: "Cannot delete your own account" });
      return;
    }
    await execute(`DELETE FROM shop_user WHERE id = $1`, [req.params.id]);
    res.json({ id: req.params.id, deleted: true });
  } catch (err) {
    console.error("[auth delete user]", err);
    res.status(500).json({ error: "Failed to delete user" });
  }
});
