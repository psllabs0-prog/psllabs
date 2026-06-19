# PSL Labs Design System

## Color tokens (use CSS variables)
--ink: #0E0F0E              /* Primary text, surfaces */
--paper: #F4F1EA            /* Page background (warm cream) */
--lab-white: #FBFAF6        /* Card surfaces */
--sage: #3D5A4C             /* CTAs, links */
--brass: #B89968            /* Premium accent, used sparingly */
--stone: #7A7770            /* Secondary text */
--signal: #C44536           /* Alerts/warnings only — never decorative */

## Typography
- Headlines: Fraunces (Google Fonts), weight 400-500, slight optical size
- Body: Inter (Google Fonts), 16-17px desktop, 15-16px mobile
- Mono: JetBrains Mono (Google Fonts), used for doses, batch IDs, labels

## Type scale (rem)
- Display: 4.5 (clamp 3-4.5)
- H1: 3.5 (clamp 2.5-3.5)
- H2: 2.25
- H3: 1.5
- Body large: 1.125
- Body: 1
- Caption: 0.875
- Mono label: 0.75 (uppercase, letter-spacing 0.08em)

## Spacing scale (rem)
4px increments: 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16

## Layout
- Max content width: 1200px (some sections: 1440px for hero, 720px for prose)
- Page padding: 24px mobile, 48px tablet, 96px desktop
- Section vertical padding: 96-160px desktop, 64-96px mobile

## Component rules
- Border radius: 0px (sharp) on most elements; 6px max on buttons and cards
- Shadows: avoid. Use 1px hairlines (border) for separation instead.
- No gradients, ever.
- Buttons: solid sage on cream, or outlined sage on white. No rounded pill buttons.
- Hover states: 100ms ease-out transitions, slight opacity/translate, never bouncy.

## Motion
- All transitions: ease-out, 200-400ms
- Page transitions: 300ms fade + 8px translate-up on entry
- Hero animations: fade + 16px translate, staggered 80ms between elements
- Never: bounce, spring overshoot, parallax (it's overused), particle effects
- Reference motion: Linear's app, Vercel's marketing site, Arc Browser

## Imagery rules
- Product photography: amber bottles, paper labels, warm cream background, soft natural light
- Lifestyle photography: muted, editorial, never gym-bro
- No stock photos of smiling people in lab coats
- No hexagons, DNA helixes, atoms, molecule renders unless they're real chemistry diagrams