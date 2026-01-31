# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BLESSLUXE is a luxury women's fashion e-commerce mockup/prototype. It is a **single-page static website** built with vanilla HTML5, CSS3, and JavaScript ES6 — no frameworks, no build system, no package manager.

## How to Run

Open `mock_website/blessluxe-website.html` directly in a web browser. There is no build step, no server required, and no dependencies to install. The only external resource is Google Fonts loaded via CDN.

## Project Structure

- `mock_website/blessluxe-website.html` — The entire application: markup, styles, and scripts are all in this single 2,125-line file.
- `mock_website/logo.png`, `mock_website/icon.png` — Web-optimized brand assets used by the site.
- `hqImages/` — High-resolution logo/icon variants (6–7MB each) for print or marketing use; not referenced by the website.

## Architecture

### Single-File Structure

All HTML, CSS (~1,400 lines), and JavaScript (~200 lines) live in one file. CSS is in a `<style>` block at the top; JS is in a `<script>` block at the bottom. There is no module system or code splitting.

### CSS Design System

Uses CSS custom properties for theming (defined on `:root`). Key variables: `--gold-primary` (#C9A84C), `--cream` (#FDF8F3), `--black` (#1A1A1A). Fonts: Cormorant Garamond (display), Montserrat (body), Pinyon Script (decorative).

Responsive breakpoints: 1200px, 992px, 768px, 480px.

### JavaScript Patterns

- Direct DOM manipulation with `querySelector`/`querySelectorAll`
- `IntersectionObserver` for scroll-triggered reveal animations and counter animations
- `requestAnimationFrame` for smooth number counting
- State managed via CSS class toggling (`.active`, `.visible`, `.scrolled`)
- No persistent state — cart counter, wishlist, and form data reset on page reload

### Page Sections (in order)

Loading screen → Announcement bar (marquee) → Sticky header with nav → Hero carousel (3 auto-rotating slides, 5s interval) → Collection switcher tabs → Category grid → Product cards grid → Occasion collections → Stats counters → Trust/testimonials → Newsletter signup → Footer

### Current Limitations

This is a visual prototype. All navigation links point to `#`. The cart, wishlist, and account features are UI-only with no backend, persistence, or routing. Product data is hardcoded in the HTML.
