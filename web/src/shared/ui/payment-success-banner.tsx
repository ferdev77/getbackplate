"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

type PaymentSuccessBannerProps = {
  showOnLoad: boolean;
};

export function PaymentSuccessBanner({ showOnLoad }: PaymentSuccessBannerProps) {
  const [visible, setVisible] = useState(showOnLoad);

  useEffect(() => {
    if (!showOnLoad) return;
    const timer = setTimeout(() => setVisible(false), 7000);
    return () => clearTimeout(timer);
  }, [showOnLoad]);

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.99 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="mx-auto max-w-4xl px-4 pt-8 sm:px-6"
        >
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-5 py-4 shadow-[0_12px_32px_rgba(16,185,129,0.14)] backdrop-blur-sm">
            <p className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-[0.08em] text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Suscripcion activada
            </p>
            <p className="mt-1 text-sm font-medium text-emerald-900">
              Tu pago se confirmo correctamente. Ya tienes acceso completo al panel de empresa.
            </p>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
