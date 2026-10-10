"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // The UI shows a safe generic message; diagnostics belong in protected server telemetry.
    console.error("Workspace route rendering failed", error.digest ? { digest: error.digest } : undefined);
  }, [error]);

  return (
    <div className="system-state-page" role="alert">
      <div className="system-state-page__mark system-state-page__mark--error"><Icon name="alert" size={25} /></div>
      <p className="eyebrow">TEMPORARY ISSUE</p>
      <h1>We couldn’t load this view.</h1>
      <p>Your work hasn’t been changed by this display error. Retry the view or return to the overview.</p>
      <div className="system-state-page__actions">
        <Button onClick={reset}>Try again</Button>
        <Link className="button button--secondary" href="/">Back to overview</Link>
      </div>
    </div>
  );
}
