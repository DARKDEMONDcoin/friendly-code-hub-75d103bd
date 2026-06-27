/**
 * Apple UIKit/SwiftUI spring physics, ported to Framer Motion.
 * Use these everywhere you'd normally pass a `transition` prop.
 *
 * Reverse-engineered from SwiftUI defaults:
 *   .spring(response, dampingFraction)
 *   stiffness = (2π / response)² × mass
 *   damping   = 2 × dampingFraction × (2π / response) × mass
 */

export const springs = {
  /** SwiftUI default — most common iOS animation (response 0.5, damping 0.825) */
  default: { type: "spring", stiffness: 160, damping: 21, mass: 1 } as const,

  /** UIKit push/pop navigation feel (response 0.35, damping 0.9) */
  navigation: { type: "spring", stiffness: 320, damping: 38, mass: 1 } as const,

  /** Snappy — buttons, toggles, switches (critically damped) */
  snappy: { type: "spring", stiffness: 500, damping: 45, mass: 1 } as const,

  /** Bouncy — icon jiggles, notification badges */
  bouncy: { type: "spring", stiffness: 250, damping: 15, mass: 1 } as const,

  /** Gentle — sheet expansion, large modals */
  gentle: { type: "spring", stiffness: 100, damping: 22, mass: 1 } as const,

  /** Interactive — for gesture release (pass velocity!) */
  interactive: { type: "spring", stiffness: 400, damping: 40, mass: 1 } as const,
} as const;

/** Apple cubic-bezier easings, for non-spring contexts (CSS transitions, etc.) */
export const easings = {
  systemEaseInOut: [0.42, 0, 0.58, 1] as const,
  systemEaseOut: [0.25, 0.46, 0.45, 0.94] as const,
  systemEaseIn: [0.55, 0.055, 0.675, 0.19] as const,
  materialDecelerate: [0.0, 0.0, 0.2, 1.0] as const,
};

/** CSS string versions for use inside CSS-in-JS or inline styles. */
export const cssEasings = {
  systemEaseInOut: "cubic-bezier(0.42, 0, 0.58, 1)",
  systemEaseOut: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
  systemEaseIn: "cubic-bezier(0.55, 0.055, 0.675, 0.19)",
  materialDecelerate: "cubic-bezier(0, 0, 0.2, 1)",
} as const;
