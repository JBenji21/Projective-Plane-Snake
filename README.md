# 🐍 Projective Plane Snake (RP² Snake)
A version of snake played on a real projective plane.

Instead of wrapping normally like a torus, opposite edges are identified with a reflection.
Cross the top or bottom — left and right are reversed.
Cross the sides — up and down are reversed.

It feels wrong. That’s the point.

The game has two camera modes: World View and Head-Centred View, which players can switch between mid-game.
World View shows you the fundamental square as seen from above, with the snake passing through edges and coming out reflected on the other side.
Head-Centred View shows the world *from the snake's perspective*. The snake's head is always kept at the centre of the screen, and you can see what lies ahead (reflected) through the portals. When the the head itself passes through a portal, the camera passes through and is reflected with it, making the experience continuous and lifelike.

The snake's flanks are coloured, allowing you to track whether any segment you are seeing has been reflected, relative to yourself.

## 🧠 What’s a Projective Plane?

The real projective plane (ℝP²) can be constructed by:
1. Taking a square,
2. Gluing left ↔ right edges with a flip, and
3. Gluing top ↔ bottom edges with a flip.

Unlike a torus:
- It’s non-orientable.
- “Left” and “right” are not globally consistent.
- If you travel far enough, you can come back mirrored.

This game implements that topology exactly — including orientation reversal.
