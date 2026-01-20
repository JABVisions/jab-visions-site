"use client";

import { useEffect } from "react";
import { installBucketDepositBridge } from "@/lib/board/bucketBrain";

export default function BucketBrainBridge() {
  useEffect(() => {
    const cleanup = installBucketDepositBridge();
    return () => cleanup?.();
  }, []);

  return null;
}
