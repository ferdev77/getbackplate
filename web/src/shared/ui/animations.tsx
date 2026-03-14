"use client";

import { motion, AnimatePresence, HTMLMotionProps } from "framer-motion";
import { ReactNode } from "react";

interface AnimationProps extends HTMLMotionProps<"div"> {
  children: ReactNode;
  delay?: number;
}

export function FadeIn({ children, delay = 0, className, ...props }: AnimationProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function SlideUp({ children, delay = 0, className, ...props }: AnimationProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5, delay, ease: [0.21, 0.45, 0.32, 0.9] }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function GlassCard({ children, className, ...props }: AnimationProps) {
  return (
    <motion.div
      whileHover={{ y: -4, boxShadow: "0 20px 40px rgba(0,0,0,0.08)" }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`rounded-2xl bg-white/80 backdrop-blur-md border border-white/20 shadow-sm ${className}`}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedList({ children, className, stagger = 0.05 }: { children: ReactNode; className?: string; stagger?: number }) {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={{
        animate: { transition: { staggerChildren: stagger } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      variants={{
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -12 },
      }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedButton({ children, className, ...props }: HTMLMotionProps<"button">) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={className}
      {...props}
    >
      {children}
    </motion.button>
  );
}

export function Interactive({ children, className, ...props }: HTMLMotionProps<"div">) {
  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}
