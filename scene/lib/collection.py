"""The works on the gallery walls and where each one hangs.

Large works only, in heavy frames, one or two to a wall so each has room to
breathe:

  pier             a colour field at the turn into the corridor
  corr_s           a large ink circle, seen head-on as you walk toward the room
  curtain          a wide canvas hung on cables in front of the velvet curtain
  room_n (back)    the monumental canvas you see through the doorway
  room_w, room_e   a pair of tall works on the left, one wide work on the right
  room_fl, room_fr one work either side of the doorway, seen on the way out
  vol_w            the black wall on your left as you leave the side room
  vol              a landscape and a collage either side of the vault door
  vault_back       inside the vault: three gilded, gold-leaf works, the most
                   valuable pieces of the collection
  beige_x          the beige end of the black volume, entering the last room
  beige            a blue colour field after the sideboard
  hall_*, part_*   the rooftop hall (floor 3.95 m up, so centres are ~5.9 m):
                   three tall works on the long wall, a wide canvas on each
                   freestanding wall, a monumental gilded canvas on the end wall

Fields: id, wall, s (metres along the wall, from its left end as you face it),
z (centre height), w, h (outer size, frame included), style, palette, seed,
mount. Mounts: canvas (gallery-wrapped, no frame), float_black / float_oak
(canvas in a float frame), paper_black / paper_oak (work on paper behind a
mat), gold (a deep gilded moulding with a linen slip, for the vault).
"""

WORKS = [
    ("pier", "pier", 0.90, 1.65, 1.20, 1.60, "color_field", "terra", 11, "float_black"),
    ("corridor", "corr_s", 0.93, 1.65, 1.20, 1.60, "ink_enso", "ink", 13, "paper_black"),
    ("curtain", "curtain", 3.35, 1.90, 3.00, 1.90, "horizon", "dusk", 12, "float_black"),
    ("centre", "room_n", 3.50, 1.75, 3.20, 2.00, "gestural", "terra", 14, "float_oak"),
    ("west_0", "room_w", 2.00, 1.70, 1.60, 2.05, "bauhaus", "terra", 105, "float_black"),
    ("west_1", "room_w", 5.00, 1.70, 1.60, 2.05, "cutouts", "ochre", 34, "float_black"),
    ("east", "room_e", 3.30, 1.70, 2.90, 1.80, "split", "ochre", 32, "float_black"),
    ("door_l", "room_fl", 1.05, 1.70, 1.30, 1.70, "waves", "ink", 41, "float_oak"),
    ("door_r", "room_fr", 1.40, 1.70, 1.30, 1.70, "bokeh", "noir", 42, "float_oak"),
    ("vol_w", "vol_w", 2.00, 1.65, 2.00, 1.40, "squares", "ochre", 35, "float_oak"),
    # (kept left of the panel: the open door stands in front of its right half)
    ("vol_l", "vol", 1.25, 1.60, 1.90, 1.30, "moonscape", "dusk", 51, "float_oak"),
    ("vol_r", "vol", 7.90, 1.60, 1.20, 1.60, "collage", "ochre", 52, "float_oak"),
    ("vault_c", "vault_back", 4.75, 1.65, 1.25, 1.55, "gold_disc", "dusk", 71, "gold"),
    ("vault_l", "vault_back", 3.20, 1.65, 1.00, 1.30, "kintsugi", "noir", 72, "gold"),
    ("vault_r", "vault_back", 6.30, 1.65, 1.00, 1.30, "gilded_field", "rose", 73, "gold"),
    ("beige_x", "beige_x", 1.90, 1.70, 1.60, 2.05, "arches", "sea", 81, "float_black"),
    # (right of centre: the closing info card sits on the bare wall to its left)
    ("beige_field", "beige", 14.40, 1.60, 1.30, 1.75, "color_field", "dusk", 61, "float_black"),
    ("hall_n3", "hall_n", 17.25, 5.90, 2.20, 2.90, "cutouts", "rose", 95, "float_oak"),
    ("part_2", "part_2", 2.00, 5.60, 3.20, 2.00, "split", "dusk", 97, "float_black"),
    ("hall_n2", "hall_n", 10.75, 5.90, 2.20, 2.90, "color_field", "noir", 93, "float_black"),
    ("part_1", "part_1", 2.00, 5.60, 3.20, 2.00, "horizon", "sea", 96, "float_black"),
    ("hall_n1", "hall_n", 2.75, 5.90, 2.40, 3.00, "gestural", "dusk", 92, "float_oak"),
    ("hall_w", "hall_w", 5.30, 6.10, 4.40, 3.00, "gilded_field", "noir", 98, "gold"),
]

# Wall-label details shown on the website when the camera stops at a work.
# PLACEHOLDERS: invented artists and titles, to be replaced with the real
# collection. Sizes are written from each work's frame size.
CREDITS = {
    "pier": ("Mira Castell", "Ember Fields", 2023, "Oil on canvas"),
    "corridor": ("Kenji Arai", "Ensō No. 4", 2022, "Sumi ink on paper"),
    "curtain": ("Lena Okafor", "Evening Over the Ridge", 2024, "Acrylic on canvas"),
    "centre": ("Aarav Mehta", "Monsoon Gesture", 2021, "Oil on linen"),
    "west_0": ("Sofia Brandt", "Construct VII", 2023, "Acrylic on canvas"),
    "west_1": ("Noor Haddad", "Garden Shapes", 2024, "Acrylic on canvas"),
    "east": ("Daniel Reyes", "Horizon Split", 2022, "Acrylic on canvas"),
    "door_l": ("Inès Laurent", "Undertow", 2020, "Acrylic on canvas"),
    "door_r": ("Ravi Sethi", "City After Rain", 2023, "Archival pigment print"),
    "vol_w": ("Hana Kim", "Homage in Ochre", 2022, "Oil on panel"),
    "vol_l": ("Tomás Vidal", "Night Tide", 2024, "Acrylic on canvas"),
    "vol_r": ("Priya Nair", "Torn Letters", 2023, "Mixed-media collage"),
    "vault_c": ("Elena Moreau", "Golden Sun", 2019, "Gold leaf and pigment on panel"),
    "vault_l": ("Haruto Sato", "Mended Night", 2020, "Lacquer and gold on panel"),
    "vault_r": ("Isabel Duarte", "Gilded Field", 2018, "Oil and gold leaf on canvas"),
    "beige_x": ("Oscar Lind", "Arc of Days", 2023, "Acrylic on canvas"),
    "beige_field": ("Maya Rao", "Blue Hour", 2024, "Oil on canvas"),
    "hall_n3": ("Léa Fournier", "Rose Garden at Noon", 2023, "Acrylic on canvas"),
    "part_2": ("Selin Arslan", "Dusk Divide", 2023, "Acrylic on canvas"),
    "hall_n2": ("Viktor Hale", "Bronze Hour", 2022, "Oil and wax on canvas"),
    "part_1": ("Kai Nakamura", "Harbour, First Light", 2024, "Acrylic on canvas"),
    "hall_n1": ("Amara Okoye", "Tidal Memory", 2024, "Oil on linen"),
    "hall_w": ("Alessandro Conti", "Gilded Night", 2020, "Oil and gold leaf on canvas"),
}

assert len({w[0] for w in WORKS}) == len(WORKS) and set(CREDITS) == {w[0] for w in WORKS}
