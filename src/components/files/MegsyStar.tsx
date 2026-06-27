import { memo } from "react";
import { motion } from "framer-motion";

/**
 * Megsy brand sparkle — same 8-point star used in the main chat ThinkingLoader.
 * Sized via the `size` prop (px). Pass `static` to render without animation.
 * Optional `className` overrides the default color (e.g. text-[#c9a84c]).
 */
const MegsyStar = ({
  size = 16,
  static: isStatic = false,
  className = "text-primary",
}: {
  size?: number;
  static?: boolean;
  className?: string;
}) => {
  if (isStatic) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        className={`shrink-0 ${className}`}
      >
        <path d="M50 5 L60 40 L95 50 L60 60 L50 95 L40 60 L5 50 L40 40 Z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      animate={{ rotate: [0, 180, 360], scale: [1, 1.1, 1] }}
      transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
    >
      <path d="M50 5 L60 40 L95 50 L60 60 L50 95 L40 60 L5 50 L40 40 Z" fill="currentColor" />
    </motion.svg>
  );
};

export default memo(MegsyStar);
