// Curated pose library for fashion e-commerce model shots.
// Each entry pairs a short admin-facing label with the prompt phrase Gemini
// gets as `pose_hint` when auto-filling the rest of the prompt.

export interface PoseChip {
  label: string;
  hint: string;
  category: "Standing" | "Movement" | "Seated" | "Detail" | "Editorial";
}

export const POSE_LIBRARY: PoseChip[] = [
  // Standing — workhorse e-commerce poses
  {
    label: "Front, confident",
    category: "Standing",
    hint: "Front-facing, full body, weight on back leg, confident relaxed posture, arms loose at sides, slight head tilt",
  },
  {
    label: "Three-quarter profile",
    category: "Standing",
    hint: "Soft three-quarter profile, head turned gently toward the camera with a calm confident gaze, weight on the back leg",
  },
  {
    label: "Hand on hip",
    category: "Standing",
    hint: "One hand on hip, opposite leg slightly forward, contrapposto stance, head turned slightly to the side",
  },
  {
    label: "Hands in pockets",
    category: "Standing",
    hint: "Both hands relaxed in pockets, shoulders open, full-body framing, slight head tilt",
  },
  {
    label: "Arms crossed",
    category: "Standing",
    hint: "Arms folded loosely across the chest, weight on one leg, soft inquisitive expression",
  },

  // Movement — adds energy
  {
    label: "Walking toward camera",
    category: "Movement",
    hint: "Mid-stride walking toward the camera in slow motion, slight forward lean, hair caught in motion",
  },
  {
    label: "Looking over shoulder",
    category: "Movement",
    hint: "Back three-quarter turned, face glancing over the shoulder toward the camera, soft smile",
  },
  {
    label: "Twirl",
    category: "Movement",
    hint: "Mid-twirl with the garment flaring outward, dynamic motion captured at the peak of the spin, joyful expression",
  },
  {
    label: "Mid-stride side view",
    category: "Movement",
    hint: "Profile view of the model mid-stride, garment in motion, dynamic step caught at the apex",
  },

  // Seated
  {
    label: "Seated, elegant",
    category: "Seated",
    hint: "Seated on a minimalist bench with legs crossed at the ankles, back straight, hands resting in lap, calm posture",
  },
  {
    label: "Casual sit, floor",
    category: "Seated",
    hint: "Sitting on a soft seamless floor, knees bent to one side, weight on one arm behind, relaxed expression",
  },
  {
    label: "Leaning, wall",
    category: "Seated",
    hint: "Leaning back against a textured wall, one knee bent with foot against the wall, hands relaxed at sides",
  },

  // Detail — close-up framing
  {
    label: "Close-up portrait",
    category: "Detail",
    hint: "Tight portrait crop from shoulders up, soft direct gaze, hyper-real skin texture, jewellery and neckline visible",
  },
  {
    label: "Garment detail",
    category: "Detail",
    hint: "Cropped framing focusing on a key garment detail (stitching, fabric drape, neckline), hands gently interacting with the piece",
  },
  {
    label: "Hand on jewellery",
    category: "Detail",
    hint: "Three-quarter framing with one hand brought softly to a necklace or earring, eyes downcast, contemplative mood",
  },

  // Editorial — high-fashion drama
  {
    label: "Dramatic editorial",
    category: "Editorial",
    hint: "Dramatic editorial pose, body in elongated S-curve, one arm raised behind head, intense direct gaze",
  },
  {
    label: "Back view, head turned",
    category: "Editorial",
    hint: "Full back-view showing the rear of the garment, head turned in profile, hair sweeping to one side",
  },
  {
    label: "Sitting on the floor, urban",
    category: "Editorial",
    hint: "Seated on a concrete step in an urban setting, knees pulled up, arms wrapped around legs, candid mood",
  },
];

export const POSE_CATEGORIES = Array.from(
  new Set(POSE_LIBRARY.map((p) => p.category))
) as PoseChip["category"][];
