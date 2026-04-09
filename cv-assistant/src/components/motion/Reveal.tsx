"use client";

import { motion, useAnimation, useInView, useReducedMotion } from "framer-motion";
import { Children, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const ease = [0.22, 1, 0.36, 1] as const;

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
};

export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.55, ease, delay }}
    >
      {children}
    </motion.div>
  );
}

type StaggerProps = {
  children: ReactNode;
  className?: string;
};

export function StaggerGroup({ children, className }: StaggerProps) {
  const reduceMotion = useReducedMotion();
  const controls = useAnimation();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-8% 0px" });
  const childCount = useMemo(() => Children.count(children), [children]);

  /* Root Cause: the list only animates via a one-shot whileInView, so newly added children stay in the hidden variant.
     Logic: watch visibility and child-count changes and re‑start the "show" animation through controls so cards remain opaque. */
  useEffect(() => {
    if (reduceMotion) return;
    if (inView) {
      controls.start("show");
    }
  }, [childCount, controls, inView, reduceMotion]);

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      initial="hidden"
      animate={controls}
      variants={{
        hidden: {},
        show: {
          transition: {
            staggerChildren: 0.07,
            delayChildren: 0.06,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: StaggerProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={cn(className)}
      variants={{
        hidden: { opacity: 0, y: 20, scale: 0.985 },
        show: {
          opacity: 1,
          y: 0,
          scale: 1,
          transition: { duration: 0.45, ease },
        },
      }}
    >
      {children}
    </motion.div>
  );
}
