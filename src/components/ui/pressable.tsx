import * as React from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { springs } from "@/lib/springs";
import { cn } from "@/lib/utils";

type PressableProps = HTMLMotionProps<"button"> & {
  /** Scale on press. iOS uses ~0.97 for buttons, 0.98 for list items. */
  pressScale?: number;
  /** Subtle hover lift (desktop only). Set to 1 to disable. */
  hoverScale?: number;
  /** Disable all motion (e.g. when control is busy). */
  disableMotion?: boolean;
};

/**
 * iOS-style pressable button. Spring physics, respects reduced-motion,
 * works for any tap target. Drop-in replacement for <button>.
 *
 *   <Pressable onClick={...}>Save</Pressable>
 */
export const Pressable = React.forwardRef<HTMLButtonElement, PressableProps>(
  ({ pressScale = 0.97, hoverScale = 1.01, disableMotion, className, children, ...props }, ref) => {
    const reduce = useReducedMotion();
    const motionDisabled = disableMotion || reduce;

    return (
      <motion.button
        ref={ref}
        whileTap={motionDisabled ? undefined : { scale: pressScale }}
        whileHover={motionDisabled ? undefined : { scale: hoverScale }}
        transition={springs.snappy}
        className={cn("select-none touch-manipulation", className)}
        {...props}
      >
        {children}
      </motion.button>
    );
  },
);
Pressable.displayName = "Pressable";
